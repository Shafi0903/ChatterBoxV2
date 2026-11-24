import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
  OnModuleDestroy,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  CallItem,
  CallHistoryItem,
  PaginatedCallsResponse,
  IceServerConfig,
  IceServersResponse,
  SocketEvents,
  CallType,
  CallStatus,
} from '@chatterbox/shared';

@Injectable()
export class CallsService implements OnModuleDestroy {
  private readonly logger = new Logger(CallsService.name);
  private ringTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => RealtimeService))
    private readonly realtimeService: RealtimeService,
    private readonly notificationsService: NotificationsService,
  ) {}

  onModuleDestroy() {
    this.logger.log(`Clearing ${this.ringTimers.size} pending ring timers on module destroy`);
    for (const [callId, timer] of this.ringTimers.entries()) {
      clearTimeout(timer);
    }
    this.ringTimers.clear();
  }

  private clearRingTimer(callId: string) {
    const timer = this.ringTimers.get(callId);
    if (timer) {
      clearTimeout(timer);
      this.ringTimers.delete(callId);
    }
  }

  /**
   * Helper to format Call record to CallItem
   */
  private formatCallItem(call: any): CallItem {
    return {
      id: call.id,
      conversationId: call.conversationId,
      callerId: call.callerId,
      calleeId: call.calleeId,
      type: call.type,
      status: call.status,
      startedAt: call.startedAt,
      endedAt: call.endedAt,
      durationSec: call.durationSec,
      createdAt: call.createdAt,
      caller: {
        id: call.caller.id,
        username: call.caller.username,
        displayName: call.caller.profile?.displayName || call.caller.username,
        avatarUrl: call.caller.profile?.avatarUrl || null,
      },
      callee: {
        id: call.callee.id,
        username: call.callee.username,
        displayName: call.callee.profile?.displayName || call.callee.username,
        avatarUrl: call.callee.profile?.avatarUrl || null,
      },
    };
  }

  /**
   * Initiates a 1:1 call in a DM conversation.
   */
  async initiateCall(
    callerId: string,
    conversationId: string,
    type: CallType,
  ): Promise<{ ok: boolean; call?: CallItem; error?: string; busy?: boolean }> {
    // 1. Validate conversation exists, is DM, and caller is member
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        members: {
          include: {
            user: {
              include: { profile: true },
            },
          },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    if (conversation.type !== 'DM') {
      throw new BadRequestException('Calls are only permitted in 1:1 DM conversations');
    }

    const callerMember = conversation.members.find((m) => m.userId === callerId);
    if (!callerMember) {
      throw new ForbiddenException('You are not a participant in this conversation');
    }

    const calleeMember = conversation.members.find((m) => m.userId !== callerId);
    if (!calleeMember) {
      throw new BadRequestException('DM conversation missing peer member');
    }
    const calleeId = calleeMember.userId;

    // 2. Check if either caller or callee is currently in a RINGING or ACTIVE call
    const activeCall = await this.prisma.call.findFirst({
      where: {
        status: { in: [CallStatus.RINGING, CallStatus.ACTIVE] },
        OR: [
          { callerId },
          { calleeId: callerId },
          { callerId: calleeId },
          { calleeId },
        ],
      },
    });

    if (activeCall) {
      this.realtimeService.emitToUser(callerId, SocketEvents.CALL_BUSY, {
        conversationId,
        callId: activeCall.id,
        reason: 'User is busy with another call',
      });
      return { ok: false, busy: true, error: 'BUSY' };
    }

    // 3. Create Call record in DB
    const callRecord = await this.prisma.call.create({
      data: {
        conversationId,
        callerId,
        calleeId,
        type,
        status: CallStatus.RINGING,
      },
      include: {
        caller: { include: { profile: true } },
        callee: { include: { profile: true } },
      },
    });

    const callItem = this.formatCallItem(callRecord);

    // 4. Set 45-second ring timeout
    const timer = setTimeout(async () => {
      await this.handleRingTimeout(callRecord.id);
    }, 45000);
    timer.unref();
    this.ringTimers.set(callRecord.id, timer);

    // 5. Emit call:incoming to callee's room
    this.realtimeService.emitToUser(calleeId, SocketEvents.CALL_INCOMING, {
      call: callItem,
    });

    return { ok: true, call: callItem };
  }

  /**
   * Accepts a ringing call. Only callee can accept.
   */
  async acceptCall(userId: string, callId: string): Promise<CallItem> {
    const call = await this.prisma.call.findUnique({
      where: { id: callId },
      include: {
        caller: { include: { profile: true } },
        callee: { include: { profile: true } },
      },
    });

    if (!call) {
      throw new NotFoundException('Call not found');
    }

    if (call.calleeId !== userId) {
      throw new ForbiddenException('Only the callee can accept this call');
    }

    if (call.status !== CallStatus.RINGING) {
      throw new BadRequestException(`Cannot accept call with status: ${call.status}`);
    }

    this.clearRingTimer(call.id);

    const startedAt = new Date();
    const updated = await this.prisma.call.update({
      where: { id: callId },
      data: {
        status: CallStatus.ACTIVE,
        startedAt,
      },
      include: {
        caller: { include: { profile: true } },
        callee: { include: { profile: true } },
      },
    });

    const payload = {
      callId: updated.id,
      acceptedBy: userId,
      startedAt: updated.startedAt,
    };

    // Multi-tab sync: emit to both caller and callee rooms
    this.realtimeService.emitToUser(updated.callerId, SocketEvents.CALL_ACCEPTED, payload);
    this.realtimeService.emitToUser(updated.calleeId, SocketEvents.CALL_ACCEPTED, payload);

    return this.formatCallItem(updated);
  }

  /**
   * Rejects a ringing call. Only callee can reject.
   */
  async rejectCall(userId: string, callId: string): Promise<CallItem> {
    const call = await this.prisma.call.findUnique({
      where: { id: callId },
      include: {
        caller: { include: { profile: true } },
        callee: { include: { profile: true } },
      },
    });

    if (!call) {
      throw new NotFoundException('Call not found');
    }

    if (call.calleeId !== userId) {
      throw new ForbiddenException('Only the callee can reject this call');
    }

    if (call.status !== CallStatus.RINGING) {
      throw new BadRequestException(`Cannot reject call with status: ${call.status}`);
    }

    this.clearRingTimer(call.id);

    const endedAt = new Date();
    const updated = await this.prisma.call.update({
      where: { id: callId },
      data: {
        status: CallStatus.REJECTED,
        endedAt,
      },
      include: {
        caller: { include: { profile: true } },
        callee: { include: { profile: true } },
      },
    });

    const payload = {
      callId: updated.id,
      rejectedBy: userId,
      reason: 'rejected',
    };

    // Multi-tab sync: emit to both caller and callee rooms
    this.realtimeService.emitToUser(updated.callerId, SocketEvents.CALL_REJECTED, payload);
    this.realtimeService.emitToUser(updated.calleeId, SocketEvents.CALL_REJECTED, payload);

    return this.formatCallItem(updated);
  }

  /**
   * Ends a ringing or active call. Can be ended by caller or callee.
   */
  async endCall(userId: string, callId: string): Promise<CallItem> {
    const call = await this.prisma.call.findUnique({
      where: { id: callId },
      include: {
        caller: { include: { profile: true } },
        callee: { include: { profile: true } },
      },
    });

    if (!call) {
      throw new NotFoundException('Call not found');
    }

    if (call.callerId !== userId && call.calleeId !== userId) {
      throw new ForbiddenException('You are not a participant in this call');
    }

    // Idempotent if already terminated
    if (
      call.status === CallStatus.ENDED ||
      call.status === CallStatus.REJECTED ||
      call.status === CallStatus.MISSED ||
      call.status === CallStatus.FAILED
    ) {
      return this.formatCallItem(call);
    }

    this.clearRingTimer(call.id);

    const endedAt = new Date();
    let newStatus: CallStatus = CallStatus.ENDED;
    let durationSec: number | null = null;
    let reason: 'ended' | 'canceled' = 'ended';

    if (call.status === CallStatus.RINGING) {
      if (userId === call.callerId) {
        newStatus = CallStatus.MISSED;
        reason = 'canceled';

        // Notify callee of missed call
        await this.notificationsService.createNotification({
          userId: call.calleeId,
          actorId: call.callerId,
          type: 'MISSED_CALL',
          conversationId: call.conversationId,
          title: 'Missed Call',
          body: `You missed a ${call.type.toLowerCase()} call from ${call.caller.profile?.displayName || call.caller.username}`,
        });
      } else {
        newStatus = CallStatus.REJECTED;
        reason = 'canceled';
      }
    } else if (call.status === CallStatus.ACTIVE) {
      newStatus = CallStatus.ENDED;
      if (call.startedAt) {
        durationSec = Math.max(0, Math.round((endedAt.getTime() - call.startedAt.getTime()) / 1000));
      }
    }

    const updated = await this.prisma.call.update({
      where: { id: callId },
      data: {
        status: newStatus,
        endedAt,
        durationSec,
      },
      include: {
        caller: { include: { profile: true } },
        callee: { include: { profile: true } },
      },
    });

    const payload = {
      callId: updated.id,
      endedBy: userId,
      reason,
      durationSec,
    };

    // Multi-tab sync: emit to both caller and callee rooms
    this.realtimeService.emitToUser(updated.callerId, SocketEvents.CALL_ENDED, payload);
    this.realtimeService.emitToUser(updated.calleeId, SocketEvents.CALL_ENDED, payload);

    return this.formatCallItem(updated);
  }

  /**
   * Internal ring timeout handler (unanswered after 45s).
   */
  async handleRingTimeout(callId: string) {
    this.clearRingTimer(callId);

    const call = await this.prisma.call.findUnique({
      where: { id: callId },
      include: {
        caller: { include: { profile: true } },
        callee: { include: { profile: true } },
      },
    });

    if (!call || call.status !== CallStatus.RINGING) {
      return;
    }

    const endedAt = new Date();
    const updated = await this.prisma.call.update({
      where: { id: callId },
      data: {
        status: CallStatus.MISSED,
        endedAt,
      },
      include: {
        caller: { include: { profile: true } },
        callee: { include: { profile: true } },
      },
    });

    const payload = {
      callId: updated.id,
      reason: 'missed' as const,
      durationSec: null,
    };

    // Multi-tab sync: emit to both caller and callee rooms
    this.realtimeService.emitToUser(updated.callerId, SocketEvents.CALL_ENDED, payload);
    this.realtimeService.emitToUser(updated.calleeId, SocketEvents.CALL_ENDED, payload);

    // Create MISSED_CALL notification for callee
    await this.notificationsService.createNotification({
      userId: updated.calleeId,
      actorId: updated.callerId,
      type: 'MISSED_CALL',
      conversationId: updated.conversationId,
      title: 'Missed Call',
      body: `You missed a ${updated.type.toLowerCase()} call from ${updated.caller.profile?.displayName || updated.caller.username}`,
    });
  }

  /**
   * Disconnect handler when user has 0 active sockets.
   */
  async handleUserDisconnect(userId: string) {
    const activeCalls = await this.prisma.call.findMany({
      where: {
        status: { in: [CallStatus.RINGING, CallStatus.ACTIVE] },
        OR: [{ callerId: userId }, { calleeId: userId }],
      },
      include: {
        caller: { include: { profile: true } },
        callee: { include: { profile: true } },
      },
    });

    for (const call of activeCalls) {
      this.clearRingTimer(call.id);
      const endedAt = new Date();
      let durationSec: number | null = null;
      let newStatus: CallStatus = CallStatus.ENDED;

      if (call.status === CallStatus.RINGING) {
        newStatus = CallStatus.FAILED;
      } else if (call.status === CallStatus.ACTIVE && call.startedAt) {
        durationSec = Math.max(0, Math.round((endedAt.getTime() - call.startedAt.getTime()) / 1000));
      }

      const updated = await this.prisma.call.update({
        where: { id: call.id },
        data: {
          status: newStatus,
          endedAt,
          durationSec,
        },
        include: {
          caller: { include: { profile: true } },
          callee: { include: { profile: true } },
        },
      });

      const peerId = call.callerId === userId ? call.calleeId : call.callerId;
      const payload = {
        callId: updated.id,
        endedBy: userId,
        reason: 'disconnected' as const,
        durationSec,
      };

      this.realtimeService.emitToUser(peerId, SocketEvents.CALL_ENDED, payload);
      this.realtimeService.emitToUser(userId, SocketEvents.CALL_ENDED, payload);
    }
  }

  /**
   * Helper to verify participant and call state for signaling relays
   */
  async verifySignalingParticipant(
    userId: string,
    callId: string,
  ): Promise<{ call: any; peerId: string }> {
    const call = await this.prisma.call.findUnique({
      where: { id: callId },
    });

    if (!call) {
      throw new NotFoundException('Call not found');
    }

    if (call.callerId !== userId && call.calleeId !== userId) {
      throw new ForbiddenException('You are not a participant in this call');
    }

    if (call.status !== CallStatus.RINGING && call.status !== CallStatus.ACTIVE) {
      throw new BadRequestException(`Cannot signal on call in ${call.status} state`);
    }

    const peerId = call.callerId === userId ? call.calleeId : call.callerId;
    return { call, peerId };
  }

  /**
   * Returns ICE server configuration.
   */
  getIceServers(): IceServersResponse {
    const stunEnv = process.env.STUN_URLS;
    const iceServers: IceServerConfig[] = [];

    if (stunEnv) {
      const urls = stunEnv.split(',').map((u) => u.trim()).filter(Boolean);
      if (urls.length > 0) {
        iceServers.push({ urls });
      }
    } else {
      iceServers.push({ urls: 'stun:stun.l.google.com:19302' });
    }

    const turnUrl = process.env.TURN_URL;
    if (turnUrl) {
      iceServers.push({
        urls: turnUrl,
        username: process.env.TURN_USERNAME,
        credential: process.env.TURN_CREDENTIAL,
      });
    }

    return { iceServers };
  }

  /**
   * User call history (both incoming and outgoing).
   */
  async getUserCallHistory(
    userId: string,
    cursor?: string,
    limit: number = 20,
  ): Promise<PaginatedCallsResponse> {
    const safeLimit = Math.min(Math.max(limit, 1), 100);

    const calls = await this.prisma.call.findMany({
      where: {
        OR: [{ callerId: userId }, { calleeId: userId }],
      },
      take: safeLimit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { createdAt: 'desc' },
      include: {
        caller: { include: { profile: true } },
        callee: { include: { profile: true } },
      },
    });

    const hasMore = calls.length > safeLimit;
    const items = hasMore ? calls.slice(0, safeLimit) : calls;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    const formatted: CallHistoryItem[] = items.map((c) => {
      const base = this.formatCallItem(c);
      const isCaller = c.callerId === userId;
      return {
        ...base,
        peer: isCaller ? base.callee : base.caller,
        direction: isCaller ? 'outgoing' : 'incoming',
      };
    });

    return {
      data: formatted,
      meta: {
        nextCursor,
        hasMore,
      },
    };
  }

  /**
   * Conversation-specific call history.
   */
  async getConversationCallHistory(
    userId: string,
    conversationId: string,
    cursor?: string,
    limit: number = 20,
  ): Promise<PaginatedCallsResponse> {
    // Check membership
    const member = await this.prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId,
        },
      },
    });

    if (!member) {
      throw new ForbiddenException('You are not a member of this conversation');
    }

    const safeLimit = Math.min(Math.max(limit, 1), 100);

    const calls = await this.prisma.call.findMany({
      where: { conversationId },
      take: safeLimit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { createdAt: 'desc' },
      include: {
        caller: { include: { profile: true } },
        callee: { include: { profile: true } },
      },
    });

    const hasMore = calls.length > safeLimit;
    const items = hasMore ? calls.slice(0, safeLimit) : calls;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    const formatted: CallHistoryItem[] = items.map((c) => {
      const base = this.formatCallItem(c);
      const isCaller = c.callerId === userId;
      return {
        ...base,
        peer: isCaller ? base.callee : base.caller,
        direction: isCaller ? 'outgoing' : 'incoming',
      };
    });

    return {
      data: formatted,
      meta: {
        nextCursor,
        hasMore,
      },
    };
  }
}
