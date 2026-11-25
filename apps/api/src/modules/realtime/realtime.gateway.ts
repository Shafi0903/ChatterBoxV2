import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, Inject, forwardRef, HttpException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { getJwtAccessSecret } from '../../config/jwt-secret.util';
import { corsOriginCallback } from '../../config/cors.util';
import {
  SocketEvents,
  ConversationJoinPayload,
  MessageSendPayload,
  MessageDeliveredPayload,
  MessageReadPayload,
  TypingPayload,
  ChannelJoinPayload,
  ChannelLeavePayload,
  ChannelMessageSendPayload,
  ChannelTypingPayload,
  CallInitiatePayload,
  CallActionPayload,
  CallOfferPayload,
  CallAnswerPayload,
  CallIceCandidatePayload,
  conversationJoinSchema,
  messageSendSchema,
  messageDeliveredSchema,
  messageReadSchema,
  typingSchema,
  channelJoinSchema,
  channelLeaveSchema,
  channelMessageSendSchema,
  channelTypingSchema,
  callInitiateSchema,
  callActionSchema,
  callOfferSchema,
  callAnswerSchema,
  callIceCandidateSchema,
} from '@chatterbox/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RealtimeService } from './realtime.service';
import { PresenceService } from './presence.service';
import { MessagesService } from '../messages/messages.service';
import { ChannelsService } from '../channels/channels.service';
import { CallsService } from '../calls/calls.service';

@WebSocketGateway({
  cors: {
    origin: corsOriginCallback,
    credentials: true,
  },
})
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(RealtimeGateway.name);
  private eventLimits = new Map<string, { count: number; resetAt: number }>();

  @WebSocketServer()
  server: Server;

  /**
   * Per-socket rate limiter: max events per window (default 60 events / 10s)
   */
  private checkSocketRateLimit(clientId: string, maxEvents = 60, windowMs = 10000): boolean {
    const now = Date.now();
    const entry = this.eventLimits.get(clientId);
    if (!entry || now > entry.resetAt) {
      this.eventLimits.set(clientId, { count: 1, resetAt: now + windowMs });
      return true;
    }
    if (entry.count >= maxEvents) {
      return false;
    }
    entry.count++;
    return true;
  }

  private sanitizeWsError(err: unknown, fallback: string): string {
    if (err instanceof HttpException) {
      return err.message;
    }
    return fallback;
  }

  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
    private realtimeService: RealtimeService,
    private presenceService: PresenceService,
    @Inject(forwardRef(() => MessagesService))
    private messagesService: MessagesService,
    @Inject(forwardRef(() => ChannelsService))
    private channelsService: ChannelsService,
    @Inject(forwardRef(() => CallsService))
    private callsService: CallsService,
  ) {}

  afterInit(server: Server) {
    this.realtimeService.setServer(server);

    // Socket.IO middleware for handshake authentication
    server.use(async (socket: Socket, next) => {
      try {
        const token =
          socket.handshake.auth?.token ||
          socket.handshake.headers?.authorization?.replace('Bearer ', '');

        if (!token) {
          const err: any = new Error('Authentication token required');
          err.data = { code: 'AUTH_ERROR' };
          return next(err);
        }

        const payload = this.jwtService.verify(token, {
          secret: getJwtAccessSecret(),
        });

        const user = await this.prisma.user.findUnique({
          where: { id: payload.sub },
          include: {
            profile: { select: { displayName: true } },
            memberships: { select: { conversationId: true } },
            communityMemberships: { select: { communityId: true } },
          },
        });

        if (!user || !user.isActive || user.deletedAt !== null) {
          const err: any = new Error('User account inactive or not found');
          err.data = { code: 'AUTH_ERROR' };
          return next(err);
        }

        socket.data.user = {
          userId: user.id,
          email: user.email,
          username: user.username,
          displayName: user.profile?.displayName || user.username,
        };
        socket.data.memberships = user.memberships;
        socket.data.communityMemberships = user.communityMemberships;

        next();
      } catch (err: any) {
        const authErr: any = new Error('Invalid or expired token');
        authErr.data = { code: 'AUTH_ERROR' };
        return next(authErr);
      }
    });

    this.logger.log('Socket.IO Gateway initialized with auth middleware');
  }

  async handleConnection(client: Socket) {
    try {
      const user = client.data?.user;
      if (!user) {
        client.disconnect(true);
        return;
      }

      // Auto-join personal room
      client.join(`user:${user.userId}`);

      // Auto-join all conversation & community rooms caller belongs to in DB
      client.data.memberships?.forEach((m: any) => {
        client.join(`conversation:${m.conversationId}`);
      });
      client.data.communityMemberships?.forEach((m: any) => {
        client.join(`community:${m.communityId}`);
      });

      // Presence management
      const becameOnline = await this.presenceService.addSocket(user.userId, client.id);
      if (becameOnline) {
        const canBroadcast = await this.presenceService.canBroadcastOnline(user.userId);
        if (canBroadcast) {
          await this.broadcastPresenceToContacts(user.userId, 'ONLINE');
        }
      }
    } catch (err: any) {
      this.logger.error(`handleConnection failed for socket ${client.id}: ${err?.message || err}`);
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: Socket) {
    try {
      this.eventLimits.delete(client.id);
      const user = client.data?.user;
      if (!user) return;

      await this.presenceService.removeSocket(
        user.userId,
        client.id,
        async (userId) => {
          await this.broadcastPresenceToContacts(userId, 'OFFLINE');
          await this.callsService.handleUserDisconnect(userId);
        },
      );
    } catch (err: any) {
      this.logger.error(`handleDisconnect failed for socket ${client.id}: ${err?.message || err}`);
    }
  }

  /**
   * Broadcasts presence change ONLY to users who share a conversation with this user
   */
  private async broadcastPresenceToContacts(userId: string, status: 'ONLINE' | 'OFFLINE') {
    const sharedMemberships = await this.prisma.conversationMember.findMany({
      where: {
        conversation: {
          members: {
            some: { userId },
          },
        },
        userId: { not: userId },
      },
      select: { userId: true },
      distinct: ['userId'],
    });

    sharedMemberships.forEach((m) => {
      this.realtimeService.emitToUser(m.userId, SocketEvents.PRESENCE_CHANGED, {
        userId,
        status,
      });
    });
  }

  @SubscribeMessage(SocketEvents.CONVERSATION_JOIN)
  async handleConversationJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: ConversationJoinPayload,
  ) {
    if (!this.checkSocketRateLimit(client.id)) {
      return { ok: false, error: 'RATE_LIMIT_EXCEEDED' };
    }

    const userId = client.data?.user?.userId;
    if (!userId) {
      return { ok: false, code: 'FORBIDDEN', error: 'Authentication required' };
    }

    const parsed = conversationJoinSchema.safeParse(payload);
    if (!parsed.success) {
      return { ok: false, error: 'Validation failed', code: 'INVALID_PAYLOAD' };
    }

    const member = await this.prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: {
          conversationId: parsed.data.conversationId,
          userId,
        },
      },
    });

    if (!member) {
      return { ok: false, code: 'FORBIDDEN', message: 'Not a member of this conversation.' };
    }

    client.join(`conversation:${parsed.data.conversationId}`);
    return { ok: true };
  }

  @SubscribeMessage(SocketEvents.MESSAGE_SEND)
  async handleMessageSend(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: MessageSendPayload,
  ) {
    if (!this.checkSocketRateLimit(client.id)) {
      return { ok: false, message: 'Rate limit exceeded' };
    }

    const userId = client.data?.user?.userId;
    if (!userId) {
      return { ok: false, message: 'Authentication required' };
    }

    const parsed = messageSendSchema.safeParse(payload);
    if (!parsed.success) {
      return { ok: false, message: 'Invalid payload', details: parsed.error.issues };
    }

    const data = parsed.data;
    if (!data.content && (!data.attachmentIds || data.attachmentIds.length === 0)) {
      return { ok: false, message: 'Message content cannot be empty unless attachments are provided' };
    }

    try {
      // Single send path with idempotency
      const message = await this.messagesService.sendMessage(
        userId,
        data.conversationId,
        {
          clientMessageId: data.clientMessageId,
          content: data.content,
          replyToId: data.replyToId,
          attachmentIds: data.attachmentIds,
          type: (data.type as any) || undefined,
          isEncrypted: data.isEncrypted,
          senderDeviceId: data.senderDeviceId,
          e2eeHeader: data.e2eeHeader,
        },
      );

      return { ok: true, message };
    } catch (err: any) {
      this.logger.error(`Message send failed: ${err.message}`);
      return { ok: false, message: this.sanitizeWsError(err, 'Failed to send message') };
    }
  }

  @SubscribeMessage(SocketEvents.MESSAGE_DELIVERED)
  async handleMessageDelivered(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: MessageDeliveredPayload,
  ) {
    if (!this.checkSocketRateLimit(client.id)) return;

    const userId = client.data?.user?.userId;
    if (!userId) return;

    const parsed = messageDeliveredSchema.safeParse(payload);
    if (!parsed.success) return;

    try {
      const member = await this.prisma.conversationMember.findUnique({
        where: {
          conversationId_userId: {
            conversationId: parsed.data.conversationId,
            userId,
          },
        },
      });

      if (!member) return;

      const message = await this.prisma.message.findFirst({
        where: {
          id: parsed.data.messageId,
          conversationId: parsed.data.conversationId,
        },
        select: { id: true },
      });

      if (!message) return;

      const now = new Date();
      await this.prisma.messageReceipt.upsert({
        where: {
          messageId_memberId: {
            messageId: parsed.data.messageId,
            memberId: member.id,
          },
        },
        update: { deliveredAt: now },
        create: {
          messageId: parsed.data.messageId,
          memberId: member.id,
          deliveredAt: now,
        },
      });

      this.realtimeService.emitToConversation(
        parsed.data.conversationId,
        SocketEvents.MESSAGE_STATUS,
        {
          conversationId: parsed.data.conversationId,
          messageId: parsed.data.messageId,
          userId,
          status: 'DELIVERED',
          timestamp: now.toISOString(),
        },
      );
    } catch (err: any) {
      this.logger.error(`handleMessageDelivered failed: ${err?.message || err}`);
    }
  }

  @SubscribeMessage(SocketEvents.MESSAGE_READ)
  async handleMessageRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: MessageReadPayload,
  ) {
    if (!this.checkSocketRateLimit(client.id)) return;

    const userId = client.data?.user?.userId;
    if (!userId) return;

    const parsed = messageReadSchema.safeParse(payload);
    if (!parsed.success) return;

    try {
      const member = await this.prisma.conversationMember.findUnique({
        where: {
          conversationId_userId: {
            conversationId: parsed.data.conversationId,
            userId,
          },
        },
      });

      if (!member) return;

      const message = await this.prisma.message.findFirst({
        where: {
          id: parsed.data.lastReadMessageId,
          conversationId: parsed.data.conversationId,
        },
        select: { id: true },
      });

      if (!message) {
        return { ok: false, error: 'Message not found in conversation' };
      }

      const now = new Date();
      await this.prisma.conversationMember.update({
        where: { id: member.id },
        data: {
          lastReadMessageId: parsed.data.lastReadMessageId,
          lastReadAt: now,
        },
      });

      const settings = await this.prisma.userSettings.findUnique({
        where: { userId },
        select: { showReadReceipts: true },
      });
      const showReceipts = settings?.showReadReceipts ?? true;

      if (showReceipts) {
        await this.prisma.messageReceipt.upsert({
          where: {
            messageId_memberId: {
              messageId: parsed.data.lastReadMessageId,
              memberId: member.id,
            },
          },
          update: { readAt: now },
          create: {
            messageId: parsed.data.lastReadMessageId,
            memberId: member.id,
            readAt: now,
          },
        });

        this.realtimeService.emitToConversation(
          parsed.data.conversationId,
          SocketEvents.MESSAGE_STATUS,
          {
            conversationId: parsed.data.conversationId,
            messageId: parsed.data.lastReadMessageId,
            userId,
            status: 'READ',
            timestamp: now.toISOString(),
          },
        );
      }

      return { ok: true };
    } catch (err: any) {
      this.logger.error(`handleMessageRead failed: ${err?.message || err}`);
      return { ok: false, error: 'Failed to mark message as read' };
    }
  }

  @SubscribeMessage(SocketEvents.TYPING_START)
  async handleTypingStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: TypingPayload,
  ) {
    if (!this.checkSocketRateLimit(client.id, 30, 10000)) return;

    const user = client.data?.user;
    if (!user) return;

    const parsed = typingSchema.safeParse(payload);
    if (!parsed.success) return;

    // Verify LIVE conversation membership in DB (never trust stale handshake cache)
    const dbMember = await this.prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: {
          conversationId: parsed.data.conversationId,
          userId: user.userId,
        },
      },
    });
    if (!dbMember) return;

    client.to(`conversation:${parsed.data.conversationId}`).emit(SocketEvents.TYPING_UPDATE, {
      conversationId: parsed.data.conversationId,
      userId: user.userId,
      displayName: user.displayName,
      isTyping: true,
    });
  }

  @SubscribeMessage(SocketEvents.TYPING_STOP)
  async handleTypingStop(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: TypingPayload,
  ) {
    if (!this.checkSocketRateLimit(client.id, 30, 10000)) return;

    const user = client.data?.user;
    if (!user) return;

    const parsed = typingSchema.safeParse(payload);
    if (!parsed.success) return;

    // Verify LIVE conversation membership in DB (never trust stale handshake cache)
    const dbMember = await this.prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: {
          conversationId: parsed.data.conversationId,
          userId: user.userId,
        },
      },
    });
    if (!dbMember) return;

    client.to(`conversation:${parsed.data.conversationId}`).emit(SocketEvents.TYPING_UPDATE, {
      conversationId: parsed.data.conversationId,
      userId: user.userId,
      displayName: user.displayName,
      isTyping: false,
    });
  }

  // ==========================================
  // Phase 5 Channel Socket Handlers
  // ==========================================

  @SubscribeMessage(SocketEvents.CHANNEL_JOIN)
  async handleChannelJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: ChannelJoinPayload,
  ) {
    if (!this.checkSocketRateLimit(client.id)) {
      return { ok: false, error: 'RATE_LIMIT_EXCEEDED' };
    }

    const userId = client.data?.user?.userId;
    if (!userId) {
      return { ok: false, error: 'Authentication required' };
    }

    const parsed = channelJoinSchema.safeParse(payload);
    if (!parsed.success) {
      return { ok: false, error: 'Invalid payload' };
    }

    const channel = await this.prisma.channel.findUnique({
      where: { id: parsed.data.channelId },
      select: { communityId: true },
    });

    if (!channel) {
      return { ok: false, error: 'Channel not found' };
    }

    // Verify user is a member of the community before joining socket room
    const member = await this.prisma.communityMember.findUnique({
      where: {
        communityId_userId: {
          communityId: channel.communityId,
          userId,
        },
      },
    });

    if (!member) {
      return { ok: false, error: 'FORBIDDEN: Must be a community member to join channel room' };
    }

    client.join(`channel:${parsed.data.channelId}`);
    return { ok: true, channelId: parsed.data.channelId };
  }

  @SubscribeMessage(SocketEvents.CHANNEL_LEAVE)
  handleChannelLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: ChannelLeavePayload,
  ) {
    const parsed = channelLeaveSchema.safeParse(payload);
    if (parsed.success && parsed.data.channelId) {
      client.leave(`channel:${parsed.data.channelId}`);
    }
    return { ok: true };
  }

  @SubscribeMessage(SocketEvents.CHANNEL_MESSAGE_SEND)
  async handleChannelMessageSend(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: ChannelMessageSendPayload,
  ) {
    if (!this.checkSocketRateLimit(client.id)) {
      return { ok: false, error: 'RATE_LIMIT_EXCEEDED' };
    }

    const userId = client.data?.user?.userId;
    if (!userId) {
      return { ok: false, error: 'Authentication required' };
    }

    const parsed = channelMessageSendSchema.safeParse(payload);
    if (!parsed.success) {
      return { ok: false, error: 'Invalid payload' };
    }

    try {
      const message = await this.channelsService.sendMessage(userId, parsed.data.channelId, {
        clientMessageId: parsed.data.clientMessageId,
        content: parsed.data.content,
        replyToId: parsed.data.replyToId,
        attachmentIds: parsed.data.attachmentIds || [],
      });

      return { ok: true, message };
    } catch (err: any) {
      this.logger.error(`Channel message send failed: ${err.message}`);
      return { ok: false, error: this.sanitizeWsError(err, 'Failed to send channel message') };
    }
  }

  @SubscribeMessage(SocketEvents.CHANNEL_TYPING_START)
  async handleChannelTypingStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: ChannelTypingPayload,
  ) {
    if (!this.checkSocketRateLimit(client.id, 30, 10000)) return;

    const user = client.data?.user;
    if (!user) return;

    const parsed = channelTypingSchema.safeParse(payload);
    if (!parsed.success) return;

    // Verify channel community membership
    const channel = await this.prisma.channel.findUnique({
      where: { id: parsed.data.channelId },
      select: { communityId: true },
    });
    if (!channel) return;

    const member = await this.prisma.communityMember.findUnique({
      where: {
        communityId_userId: {
          communityId: channel.communityId,
          userId: user.userId,
        },
      },
    });
    if (!member) return;

    client.to(`channel:${parsed.data.channelId}`).emit(SocketEvents.CHANNEL_TYPING_UPDATE, {
      channelId: parsed.data.channelId,
      userId: user.userId,
      displayName: user.displayName,
      isTyping: true,
    });
  }

  @SubscribeMessage(SocketEvents.CHANNEL_TYPING_STOP)
  async handleChannelTypingStop(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: ChannelTypingPayload,
  ) {
    if (!this.checkSocketRateLimit(client.id, 30, 10000)) return;

    const user = client.data?.user;
    if (!user) return;

    const parsed = channelTypingSchema.safeParse(payload);
    if (!parsed.success) return;

    // Verify channel community membership
    const channel = await this.prisma.channel.findUnique({
      where: { id: parsed.data.channelId },
      select: { communityId: true },
    });
    if (!channel) return;

    const member = await this.prisma.communityMember.findUnique({
      where: {
        communityId_userId: {
          communityId: channel.communityId,
          userId: user.userId,
        },
      },
    });
    if (!member) return;

    client.to(`channel:${parsed.data.channelId}`).emit(SocketEvents.CHANNEL_TYPING_UPDATE, {
      channelId: parsed.data.channelId,
      userId: user.userId,
      displayName: user.displayName,
      isTyping: false,
    });
  }

  // ==========================================
  // Phase 7 WebRTC Signaling Events
  // ==========================================

  @SubscribeMessage(SocketEvents.CALL_INITIATE)
  async handleCallInitiate(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: CallInitiatePayload,
  ) {
    if (!this.checkSocketRateLimit(client.id, 20, 10000)) {
      return { ok: false, error: 'RATE_LIMIT_EXCEEDED' };
    }

    const userId = client.data?.user?.userId;
    if (!userId) {
      return { ok: false, error: 'Authentication required' };
    }

    const parsed = callInitiateSchema.safeParse(payload);
    if (!parsed.success) {
      return { ok: false, error: 'Validation failed', details: parsed.error.issues };
    }

    try {
      const res = await this.callsService.initiateCall(
        userId,
        parsed.data.conversationId,
        parsed.data.type,
      );

      if (!res.ok) {
        return { ok: false, error: res.error || 'Failed to initiate call', busy: res.busy };
      }

      return { ok: true, call: res.call };
    } catch (err: any) {
      this.logger.error(`Call initiate failed: ${err.message}`);
      return { ok: false, error: this.sanitizeWsError(err, 'Call initiation failed') };
    }
  }

  @SubscribeMessage(SocketEvents.CALL_ACCEPT)
  async handleCallAccept(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: CallActionPayload,
  ) {
    if (!this.checkSocketRateLimit(client.id, 20, 10000)) {
      return { ok: false, error: 'RATE_LIMIT_EXCEEDED' };
    }

    const userId = client.data?.user?.userId;
    if (!userId) {
      return { ok: false, error: 'Authentication required' };
    }

    const parsed = callActionSchema.safeParse(payload);
    if (!parsed.success) {
      return { ok: false, error: 'Validation failed', details: parsed.error.issues };
    }

    try {
      const call = await this.callsService.acceptCall(userId, parsed.data.callId);
      return { ok: true, call };
    } catch (err: any) {
      this.logger.error(`Call accept failed: ${err.message}`);
      return { ok: false, error: this.sanitizeWsError(err, 'Call accept failed') };
    }
  }

  @SubscribeMessage(SocketEvents.CALL_REJECT)
  async handleCallReject(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: CallActionPayload,
  ) {
    if (!this.checkSocketRateLimit(client.id, 20, 10000)) {
      return { ok: false, error: 'RATE_LIMIT_EXCEEDED' };
    }

    const userId = client.data?.user?.userId;
    if (!userId) {
      return { ok: false, error: 'Authentication required' };
    }

    const parsed = callActionSchema.safeParse(payload);
    if (!parsed.success) {
      return { ok: false, error: 'Validation failed', details: parsed.error.issues };
    }

    try {
      const call = await this.callsService.rejectCall(userId, parsed.data.callId);
      return { ok: true, call };
    } catch (err: any) {
      this.logger.error(`Call reject failed: ${err.message}`);
      return { ok: false, error: this.sanitizeWsError(err, 'Call reject failed') };
    }
  }

  @SubscribeMessage(SocketEvents.CALL_END)
  async handleCallEnd(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: CallActionPayload,
  ) {
    if (!this.checkSocketRateLimit(client.id, 20, 10000)) {
      return { ok: false, error: 'RATE_LIMIT_EXCEEDED' };
    }

    const userId = client.data?.user?.userId;
    if (!userId) {
      return { ok: false, error: 'Authentication required' };
    }

    const parsed = callActionSchema.safeParse(payload);
    if (!parsed.success) {
      return { ok: false, error: 'Validation failed', details: parsed.error.issues };
    }

    try {
      const call = await this.callsService.endCall(userId, parsed.data.callId);
      return { ok: true, call };
    } catch (err: any) {
      this.logger.error(`Call end failed: ${err.message}`);
      return { ok: false, error: this.sanitizeWsError(err, 'Call end failed') };
    }
  }

  @SubscribeMessage(SocketEvents.CALL_OFFER)
  async handleCallOffer(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: CallOfferPayload,
  ) {
    if (!this.checkSocketRateLimit(client.id, 50, 10000)) {
      return { ok: false, error: 'RATE_LIMIT_EXCEEDED' };
    }

    const userId = client.data?.user?.userId;
    if (!userId) {
      return { ok: false, error: 'Authentication required' };
    }

    const parsed = callOfferSchema.safeParse(payload);
    if (!parsed.success) {
      return { ok: false, error: 'Validation failed', details: parsed.error.issues };
    }

    try {
      const { peerId } = await this.callsService.verifySignalingParticipant(
        userId,
        parsed.data.callId,
      );

      this.realtimeService.emitToUser(peerId, SocketEvents.CALL_OFFER, {
        callId: parsed.data.callId,
        sdp: parsed.data.sdp,
      });

      return { ok: true };
    } catch (err: any) {
      this.logger.error(`Call offer relay failed: ${err.message}`);
      return { ok: false, error: this.sanitizeWsError(err, 'Call offer failed') };
    }
  }

  @SubscribeMessage(SocketEvents.CALL_ANSWER)
  async handleCallAnswer(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: CallAnswerPayload,
  ) {
    if (!this.checkSocketRateLimit(client.id, 50, 10000)) {
      return { ok: false, error: 'RATE_LIMIT_EXCEEDED' };
    }

    const userId = client.data?.user?.userId;
    if (!userId) {
      return { ok: false, error: 'Authentication required' };
    }

    const parsed = callAnswerSchema.safeParse(payload);
    if (!parsed.success) {
      return { ok: false, error: 'Validation failed', details: parsed.error.issues };
    }

    try {
      const { peerId } = await this.callsService.verifySignalingParticipant(
        userId,
        parsed.data.callId,
      );

      this.realtimeService.emitToUser(peerId, SocketEvents.CALL_ANSWER, {
        callId: parsed.data.callId,
        sdp: parsed.data.sdp,
      });

      return { ok: true };
    } catch (err: any) {
      this.logger.error(`Call answer relay failed: ${err.message}`);
      return { ok: false, error: this.sanitizeWsError(err, 'Call answer failed') };
    }
  }

  @SubscribeMessage(SocketEvents.CALL_ICE_CANDIDATE)
  async handleCallIceCandidate(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: CallIceCandidatePayload,
  ) {
    if (!this.checkSocketRateLimit(client.id, 100, 10000)) {
      return { ok: false, error: 'RATE_LIMIT_EXCEEDED' };
    }

    const userId = client.data?.user?.userId;
    if (!userId) {
      return { ok: false, error: 'Authentication required' };
    }

    const parsed = callIceCandidateSchema.safeParse(payload);
    if (!parsed.success) {
      return { ok: false, error: 'Validation failed', details: parsed.error.issues };
    }

    try {
      const { peerId } = await this.callsService.verifySignalingParticipant(
        userId,
        parsed.data.callId,
      );

      this.realtimeService.emitToUser(peerId, SocketEvents.CALL_ICE_CANDIDATE, {
        callId: parsed.data.callId,
        candidate: parsed.data.candidate,
      });

      return { ok: true };
    } catch (err: any) {
      this.logger.error(`Call ICE candidate relay failed: ${err.message}`);
      return { ok: false, error: this.sanitizeWsError(err, 'Call ICE candidate failed') };
    }
  }
}
