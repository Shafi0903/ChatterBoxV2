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
import { Logger, Inject, forwardRef } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
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
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  },
})
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server: Server;

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
          secret:
            process.env.JWT_ACCESS_SECRET ||
            'dev-access-secret-min-32-chars-long',
        });

        const user = await this.prisma.user.findUnique({
          where: { id: payload.sub },
          include: {
            profile: { select: { displayName: true } },
            memberships: { select: { conversationId: true } },
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
    const user = client.data?.user;
    if (!user) {
      client.disconnect(true);
      return;
    }

    // Auto-join personal room
    client.join(`user:${user.userId}`);

    // Auto-join all conversation rooms caller belongs to in DB
    client.data.memberships?.forEach((m: any) => {
      client.join(`conversation:${m.conversationId}`);
    });

    // Presence management
    const becameOnline = await this.presenceService.addSocket(user.userId, client.id);
    if (becameOnline) {
      const canBroadcast = await this.presenceService.canBroadcastOnline(user.userId);
      if (canBroadcast) {
        await this.broadcastPresenceToContacts(user.userId, 'ONLINE');
      }
    }
  }

  async handleDisconnect(client: Socket) {
    const user = client.data?.user;
    if (!user) return;

    await this.presenceService.removeSocket(
      user.userId,
      client.id,
      async (userId) => {
        await this.broadcastPresenceToContacts(userId, 'OFFLINE');
        // Handle call termination if user disconnects all active sockets
        await this.callsService.handleUserDisconnect(userId);
      },
    );
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
    const userId = client.data?.user?.userId;
    if (!userId || !payload?.conversationId) {
      return { ok: false, code: 'FORBIDDEN' };
    }

    const member = await this.prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: {
          conversationId: payload.conversationId,
          userId,
        },
      },
    });

    if (!member) {
      return { ok: false, code: 'FORBIDDEN', message: 'Not a member of this conversation.' };
    }

    client.join(`conversation:${payload.conversationId}`);
    return { ok: true };
  }

  @SubscribeMessage(SocketEvents.MESSAGE_SEND)
  async handleMessageSend(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: MessageSendPayload,
  ) {
    const userId = client.data?.user?.userId;
    if (!userId || !payload?.conversationId || !payload?.clientMessageId || !payload?.content) {
      return { ok: false, message: 'Invalid payload' };
    }

    try {
      // Single send path with idempotency
      const message = await this.messagesService.sendMessage(
        userId,
        payload.conversationId,
        {
          clientMessageId: payload.clientMessageId,
          content: payload.content,
          replyToId: payload.replyToId,
          attachmentIds: payload.attachmentIds,
          type: (payload.type as any) || undefined,
          isEncrypted: payload.isEncrypted,
          senderDeviceId: payload.senderDeviceId,
          e2eeHeader: payload.e2eeHeader,
        },
      );

      return { ok: true, message };
    } catch (err: any) {
      return { ok: false, message: err.message };
    }
  }

  @SubscribeMessage(SocketEvents.MESSAGE_DELIVERED)
  async handleMessageDelivered(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: MessageDeliveredPayload,
  ) {
    const userId = client.data?.user?.userId;
    if (!userId || !payload?.conversationId || !payload?.messageId) return;

    const member = await this.prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: {
          conversationId: payload.conversationId,
          userId,
        },
      },
    });

    if (!member) return;

    const now = new Date();
    await this.prisma.messageReceipt.upsert({
      where: {
        messageId_memberId: {
          messageId: payload.messageId,
          memberId: member.id,
        },
      },
      update: { deliveredAt: now },
      create: {
        messageId: payload.messageId,
        memberId: member.id,
        deliveredAt: now,
      },
    });

    // Adjustment #4: Always expose userId (not internal memberId) in message:status
    this.realtimeService.emitToConversation(
      payload.conversationId,
      SocketEvents.MESSAGE_STATUS,
      {
        conversationId: payload.conversationId,
        messageId: payload.messageId,
        userId,
        status: 'DELIVERED',
        timestamp: now.toISOString(),
      },
    );
  }

  @SubscribeMessage(SocketEvents.MESSAGE_READ)
  async handleMessageRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: MessageReadPayload,
  ) {
    const userId = client.data?.user?.userId;
    if (!userId || !payload?.conversationId || !payload?.lastReadMessageId) return;

    const member = await this.prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: {
          conversationId: payload.conversationId,
          userId,
        },
      },
    });

    if (!member) return;

    const now = new Date();
    await this.prisma.conversationMember.update({
      where: { id: member.id },
      data: {
        lastReadMessageId: payload.lastReadMessageId,
        lastReadAt: now,
      },
    });

    await this.prisma.messageReceipt.upsert({
      where: {
        messageId_memberId: {
          messageId: payload.lastReadMessageId,
          memberId: member.id,
        },
      },
      update: { readAt: now },
      create: {
        messageId: payload.lastReadMessageId,
        memberId: member.id,
        readAt: now,
      },
    });

    this.realtimeService.emitToConversation(
      payload.conversationId,
      SocketEvents.MESSAGE_STATUS,
      {
        conversationId: payload.conversationId,
        messageId: payload.lastReadMessageId,
        userId,
        status: 'READ',
        timestamp: now.toISOString(),
      },
    );

    return { ok: true };
  }

  @SubscribeMessage(SocketEvents.TYPING_START)
  handleTypingStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: TypingPayload,
  ) {
    const user = client.data?.user;
    if (!user || !payload?.conversationId) return;

    client.to(`conversation:${payload.conversationId}`).emit(SocketEvents.TYPING_UPDATE, {
      conversationId: payload.conversationId,
      userId: user.userId,
      displayName: user.displayName,
      isTyping: true,
    });
  }

  @SubscribeMessage(SocketEvents.TYPING_STOP)
  handleTypingStop(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: TypingPayload,
  ) {
    const user = client.data?.user;
    if (!user || !payload?.conversationId) return;

    client.to(`conversation:${payload.conversationId}`).emit(SocketEvents.TYPING_UPDATE, {
      conversationId: payload.conversationId,
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
    const userId = client.data?.user?.userId;
    if (!userId || !payload?.channelId) {
      return { ok: false, error: 'Invalid payload' };
    }

    const channel = await this.prisma.channel.findUnique({
      where: { id: payload.channelId },
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

    client.join(`channel:${payload.channelId}`);
    return { ok: true, channelId: payload.channelId };
  }

  @SubscribeMessage(SocketEvents.CHANNEL_LEAVE)
  handleChannelLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: ChannelLeavePayload,
  ) {
    if (payload?.channelId) {
      client.leave(`channel:${payload.channelId}`);
    }
    return { ok: true };
  }

  @SubscribeMessage(SocketEvents.CHANNEL_MESSAGE_SEND)
  async handleChannelMessageSend(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: ChannelMessageSendPayload,
  ) {
    const userId = client.data?.user?.userId;
    if (!userId) {
      return { ok: false, error: 'Authentication required' };
    }

    try {
      const message = await this.channelsService.sendMessage(userId, payload.channelId, {
        clientMessageId: payload.clientMessageId,
        content: payload.content,
        replyToId: payload.replyToId,
        attachmentIds: payload.attachmentIds || [],
      });

      return { ok: true, message };
    } catch (err: any) {
      this.logger.error(`Channel message send failed: ${err.message}`);
      return { ok: false, error: err.message };
    }
  }

  @SubscribeMessage(SocketEvents.CHANNEL_TYPING_START)
  handleChannelTypingStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: ChannelTypingPayload,
  ) {
    const user = client.data?.user;
    if (!user || !payload?.channelId) return;

    client.to(`channel:${payload.channelId}`).emit(SocketEvents.CHANNEL_TYPING_UPDATE, {
      channelId: payload.channelId,
      userId: user.userId,
      displayName: user.displayName,
      isTyping: true,
    });
  }

  @SubscribeMessage(SocketEvents.CHANNEL_TYPING_STOP)
  handleChannelTypingStop(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: ChannelTypingPayload,
  ) {
    const user = client.data?.user;
    if (!user || !payload?.channelId) return;

    client.to(`channel:${payload.channelId}`).emit(SocketEvents.CHANNEL_TYPING_UPDATE, {
      channelId: payload.channelId,
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
      return { ok: false, error: err.message };
    }
  }

  @SubscribeMessage(SocketEvents.CALL_ACCEPT)
  async handleCallAccept(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: CallActionPayload,
  ) {
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
      return { ok: false, error: err.message };
    }
  }

  @SubscribeMessage(SocketEvents.CALL_REJECT)
  async handleCallReject(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: CallActionPayload,
  ) {
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
      return { ok: false, error: err.message };
    }
  }

  @SubscribeMessage(SocketEvents.CALL_END)
  async handleCallEnd(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: CallActionPayload,
  ) {
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
      return { ok: false, error: err.message };
    }
  }

  @SubscribeMessage(SocketEvents.CALL_OFFER)
  async handleCallOffer(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: CallOfferPayload,
  ) {
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

      // Relay SDP offer strictly to peer's user room
      this.realtimeService.emitToUser(peerId, SocketEvents.CALL_OFFER, {
        callId: parsed.data.callId,
        sdp: parsed.data.sdp,
      });

      return { ok: true };
    } catch (err: any) {
      this.logger.error(`Call offer relay failed: ${err.message}`);
      return { ok: false, error: err.message };
    }
  }

  @SubscribeMessage(SocketEvents.CALL_ANSWER)
  async handleCallAnswer(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: CallAnswerPayload,
  ) {
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

      // Relay SDP answer strictly to peer's user room
      this.realtimeService.emitToUser(peerId, SocketEvents.CALL_ANSWER, {
        callId: parsed.data.callId,
        sdp: parsed.data.sdp,
      });

      return { ok: true };
    } catch (err: any) {
      this.logger.error(`Call answer relay failed: ${err.message}`);
      return { ok: false, error: err.message };
    }
  }

  @SubscribeMessage(SocketEvents.CALL_ICE_CANDIDATE)
  async handleCallIceCandidate(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: CallIceCandidatePayload,
  ) {
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

      // Relay ICE candidate strictly to peer's user room
      this.realtimeService.emitToUser(peerId, SocketEvents.CALL_ICE_CANDIDATE, {
        callId: parsed.data.callId,
        candidate: parsed.data.candidate,
      });

      return { ok: true };
    } catch (err: any) {
      this.logger.error(`Call ICE candidate relay failed: ${err.message}`);
      return { ok: false, error: err.message };
    }
  }
}
