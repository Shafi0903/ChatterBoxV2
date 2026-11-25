import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import {
  ConversationItem,
  CreateDmDto,
  CreateGroupDto,
  UpdateConversationDto,
  AddMembersDto,
  MarkConversationReadDto,
  SocketEvents,
} from '@chatterbox/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PresenceService } from '../realtime/presence.service';
import { RealtimeService } from '../realtime/realtime.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class ConversationsService {
  constructor(
    private prisma: PrismaService,
    private presenceService: PresenceService,
    private realtimeService: RealtimeService,
    private notificationsService: NotificationsService,
  ) {}

  /**
   * Retrieves conversations for the caller with dynamic unread counts and live presence
   */
  async getConversations(
    userId: string,
    filter: 'all' | 'dm' | 'group' = 'all',
    archived = false,
  ): Promise<ConversationItem[]> {
    const whereClause: any = {
      userId,
      isArchived: archived,
    };

    if (filter === 'dm') {
      whereClause.conversation = { type: 'DM' };
    } else if (filter === 'group') {
      whereClause.conversation = { type: 'GROUP' };
    }

    const memberships = await this.prisma.conversationMember.findMany({
      where: whereClause,
      include: {
        conversation: {
          include: {
            members: {
              include: {
                user: {
                  select: {
                    id: true,
                    username: true,
                    profile: {
                      select: {
                        displayName: true,
                        avatarUrl: true,
                      },
                    },
                  },
                },
              },
            },
            messages: {
              where: { deletedAt: null },
              orderBy: { createdAt: 'desc' },
              take: 1,
              include: {
                sender: {
                  select: {
                    id: true,
                    username: true,
                    profile: { select: { displayName: true } },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: {
        conversation: {
          lastMessageAt: 'desc',
        },
      },
    });

    // Collect all member user IDs for bulk presence lookup
    const allMemberUserIds = new Set<string>();
    memberships.forEach((m) => {
      m.conversation.members.forEach((mem) => allMemberUserIds.add(mem.userId));
    });

    const presenceMap = await this.presenceService.getMultiplePresence(
      Array.from(allMemberUserIds),
    );

    // Compute unread counts and map to ConversationItem
    const results: ConversationItem[] = await Promise.all(
      memberships.map(async (m) => {
        const conv = m.conversation;

        // Compute unread count from messages newer than lastReadAt sent by others
        const unreadCount = await this.prisma.message.count({
          where: {
            conversationId: conv.id,
            senderId: { not: userId },
            deletedAt: null,
            ...(m.lastReadAt ? { createdAt: { gt: m.lastReadAt } } : {}),
          },
        });

        const lastMsg = conv.messages[0];

        return {
          id: conv.id,
          type: conv.type,
          name: conv.name,
          avatarUrl: conv.avatarUrl,
          dmKey: conv.dmKey,
          isEncrypted: conv.isEncrypted,
          lastMessageAt: conv.lastMessageAt,
          createdAt: conv.createdAt,
          updatedAt: conv.updatedAt,
          unreadCount,
          members: conv.members.map((mem) => ({
            id: mem.id,
            userId: mem.userId,
            username: mem.user.username,
            displayName: mem.user.profile?.displayName || mem.user.username,
            avatarUrl: mem.user.profile?.avatarUrl || null,
            role: mem.role,
            lastReadAt: mem.lastReadAt,
            joinedAt: mem.joinedAt,
            presence: presenceMap.get(mem.userId) || 'OFFLINE',
          })),
          lastMessage: lastMsg
            ? {
                id: lastMsg.id,
                content: lastMsg.content,
                senderId: lastMsg.senderId,
                senderName:
                  lastMsg.sender.profile?.displayName || lastMsg.sender.username,
                createdAt: lastMsg.createdAt,
              }
            : null,
        };
      }),
    );

    return results;
  }

  /**
   * Creates or returns an idempotent 1:1 direct message conversation
   */
  async createDm(callerId: string, dto: CreateDmDto): Promise<ConversationItem> {
    const targetUserId = dto.targetUserId;

    // Adjustment #3: Reject self DM with 400
    if (targetUserId === callerId) {
      throw new BadRequestException('Cannot start a direct message with yourself');
    }

    // Adjustment #3: Reject non-existent / inactive target user with 404
    const targetUser = await this.prisma.user.findFirst({
      where: { id: targetUserId, isActive: true, deletedAt: null },
    });
    if (!targetUser) {
      throw new NotFoundException('Target user does not exist or is inactive');
    }

    // Deterministic sorted dmKey
    const dmKey = [callerId, targetUserId].sort().join('_');

    // Check existing DM
    const existing = await this.prisma.conversation.findUnique({
      where: { dmKey },
    });

    if (existing) {
      return this.getConversation(callerId, existing.id);
    }

    // Enforce UserSettings.allowDirectMessages before creating a new DM
    const targetSettings = await this.prisma.userSettings.findUnique({
      where: { userId: targetUserId },
      select: { allowDirectMessages: true },
    });
    if (targetSettings && !targetSettings.allowDirectMessages) {
      throw new ForbiddenException('This user does not accept direct messages');
    }

    // Create new DM inside transaction (handling concurrent P2002 race on dmKey)
    let newConv;
    try {
      newConv = await this.prisma.$transaction(async (tx) => {
        const conv = await tx.conversation.create({
          data: {
            type: 'DM',
            dmKey,
            isEncrypted: false,
          },
        });

        await tx.conversationMember.createMany({
          data: [
            { conversationId: conv.id, userId: callerId, role: 'MEMBER' },
            { conversationId: conv.id, userId: targetUserId, role: 'MEMBER' },
          ],
        });

        return conv;
      });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        const raceExisting = await this.prisma.conversation.findUnique({
          where: { dmKey },
        });
        if (raceExisting) {
          return this.getConversation(callerId, raceExisting.id);
        }
      }
      throw err;
    }

    const conversation = await this.getConversation(callerId, newConv.id);

    // Adjustment #1: Live room join for active sockets & emit conversation:updated
    this.realtimeService.joinUserSocketsToRoom(callerId, newConv.id);
    this.realtimeService.joinUserSocketsToRoom(targetUserId, newConv.id);
    this.realtimeService.emitToUser(callerId, SocketEvents.CONVERSATION_UPDATED, { conversation });
    this.realtimeService.emitToUser(targetUserId, SocketEvents.CONVERSATION_UPDATED, { conversation });

    return conversation;
  }

  /**
   * Creates a new group conversation with creator as OWNER
   */
  async createGroup(callerId: string, dto: CreateGroupDto): Promise<ConversationItem> {
    // Validate target members
    const uniqueMemberIds = Array.from(new Set(dto.memberIds.filter((id) => id !== callerId)));
    if (uniqueMemberIds.length === 0) {
      throw new BadRequestException('Group must have at least one additional member');
    }

    const validUsers = await this.prisma.user.findMany({
      where: {
        id: { in: uniqueMemberIds },
        isActive: true,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (validUsers.length !== uniqueMemberIds.length) {
      throw new BadRequestException('One or more selected members are invalid or deactivated');
    }

    const newConv = await this.prisma.$transaction(async (tx) => {
      const conv = await tx.conversation.create({
        data: {
          type: 'GROUP',
          name: dto.name.trim(),
          isEncrypted: false,
        },
      });

      await tx.conversationMember.create({
        data: {
          conversationId: conv.id,
          userId: callerId,
          role: 'OWNER',
        },
      });

      await tx.conversationMember.createMany({
        data: validUsers.map((u) => ({
          conversationId: conv.id,
          userId: u.id,
          role: 'MEMBER',
        })),
      });

      return conv;
    });

    const conversation = await this.getConversation(callerId, newConv.id);

    // Adjustment #1: Live room join for active sockets of all group members
    this.realtimeService.joinUserSocketsToRoom(callerId, newConv.id);
    this.realtimeService.emitToUser(callerId, SocketEvents.CONVERSATION_UPDATED, { conversation });

    validUsers.forEach((u) => {
      this.realtimeService.joinUserSocketsToRoom(u.id, newConv.id);
      this.realtimeService.emitToUser(u.id, SocketEvents.CONVERSATION_UPDATED, { conversation });
    });

    // Adjustment #3: Trigger GROUP_INVITE notification for all initial members (excluding creator)
    try {
      const creator = await this.prisma.user.findUnique({
        where: { id: callerId },
        select: { username: true, profile: { select: { displayName: true } } },
      });
      const creatorName = creator?.profile?.displayName || creator?.username || 'Someone';

      for (const u of validUsers) {
        await this.notificationsService.createNotification({
          userId: u.id,
          actorId: callerId,
          type: 'GROUP_INVITE',
          conversationId: newConv.id,
          title: 'Group Invitation',
          body: `${creatorName} added you to group "${newConv.name || conversation.name}"`,
        });
      }
    } catch (err) {
      console.error('Failed to dispatch notification for group create:', err);
    }

    return conversation;
  }

  /**
   * Fetches single conversation details with live presence
   */
  async getConversation(callerId: string, conversationId: string): Promise<ConversationItem> {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                profile: { select: { displayName: true, avatarUrl: true } },
              },
            },
          },
        },
        messages: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            sender: {
              select: {
                id: true,
                username: true,
                profile: { select: { displayName: true } },
              },
            },
          },
        },
      },
    });

    if (!conv) {
      throw new NotFoundException('Conversation not found');
    }

    const callerMember = conv.members.find((m) => m.userId === callerId);

    const memberUserIds = conv.members.map((m) => m.userId);
    const presenceMap = await this.presenceService.getMultiplePresence(memberUserIds);

    const unreadCount = callerMember
      ? await this.prisma.message.count({
          where: {
            conversationId: conv.id,
            senderId: { not: callerId },
            deletedAt: null,
            ...(callerMember.lastReadAt ? { createdAt: { gt: callerMember.lastReadAt } } : {}),
          },
        })
      : 0;

    const lastMsg = conv.messages[0];

    return {
      id: conv.id,
      type: conv.type,
      name: conv.name,
      avatarUrl: conv.avatarUrl,
      dmKey: conv.dmKey,
      isEncrypted: conv.isEncrypted,
      lastMessageAt: conv.lastMessageAt,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
      unreadCount,
      members: conv.members.map((mem) => ({
        id: mem.id,
        userId: mem.userId,
        username: mem.user.username,
        displayName: mem.user.profile?.displayName || mem.user.username,
        avatarUrl: mem.user.profile?.avatarUrl || null,
        role: mem.role,
        lastReadAt: mem.lastReadAt,
        joinedAt: mem.joinedAt,
        presence: presenceMap.get(mem.userId) || 'OFFLINE',
      })),
      lastMessage: lastMsg
        ? {
            id: lastMsg.id,
            content: lastMsg.content,
            senderId: lastMsg.senderId,
            senderName:
              lastMsg.sender.profile?.displayName || lastMsg.sender.username,
            createdAt: lastMsg.createdAt,
          }
        : null,
    };
  }

  /**
   * Updates group conversation metadata (OWNER / ADMIN)
   */
  async updateConversation(
    callerId: string,
    conversationId: string,
    dto: UpdateConversationDto,
  ): Promise<ConversationItem> {
    const updated = await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.avatarUrl !== undefined ? { avatarUrl: dto.avatarUrl } : {}),
      },
    });

    const convItem = await this.getConversation(callerId, updated.id);
    this.realtimeService.emitToConversation(
      conversationId,
      SocketEvents.CONVERSATION_UPDATED,
      { conversation: convItem },
    );

    return convItem;
  }

  /**
   * Adds members to a group conversation
   */
  async addMembers(
    callerId: string,
    conversationId: string,
    dto: AddMembersDto,
  ): Promise<ConversationItem> {
    const usersToAdd = await this.prisma.user.findMany({
      where: {
        id: { in: dto.userIds },
        isActive: true,
        deletedAt: null,
      },
      select: { id: true },
    });

    // Filter out existing members
    const existing = await this.prisma.conversationMember.findMany({
      where: {
        conversationId,
        userId: { in: usersToAdd.map((u) => u.id) },
      },
      select: { userId: true },
    });
    const existingSet = new Set(existing.map((e) => e.userId));

    const newMembers = usersToAdd.filter((u) => !existingSet.has(u.id));
    if (newMembers.length > 0) {
      await this.prisma.conversationMember.createMany({
        data: newMembers.map((u) => ({
          conversationId,
          userId: u.id,
          role: 'MEMBER',
        })),
      });

      // Adjustment #1: Join active sockets & broadcast
      newMembers.forEach((u) => {
        this.realtimeService.joinUserSocketsToRoom(u.id, conversationId);
      });
    }

    const convItem = await this.getConversation(callerId, conversationId);
    this.realtimeService.emitToConversation(
      conversationId,
      SocketEvents.CONVERSATION_UPDATED,
      { conversation: convItem },
    );

    // Adjustment #3: Trigger GROUP_INVITE notification for newly added members
    if (newMembers.length > 0) {
      try {
        const caller = await this.prisma.user.findUnique({
          where: { id: callerId },
          select: { username: true, profile: { select: { displayName: true } } },
        });
        const callerName = caller?.profile?.displayName || caller?.username || 'Someone';

        for (const u of newMembers) {
          await this.notificationsService.createNotification({
            userId: u.id,
            actorId: callerId,
            type: 'GROUP_INVITE',
            conversationId,
            title: 'Group Invitation',
            body: `${callerName} added you to group "${convItem.name}"`,
          });
        }
      } catch (err) {
        console.error('Failed to dispatch notification for add members:', err);
      }
    }

    return convItem;
  }

  /**
   * Removes member from group or leaves group
   */
  async removeMember(
    callerId: string,
    conversationId: string,
    targetUserId: string,
    callerRole: 'OWNER' | 'ADMIN' | 'MEMBER',
  ): Promise<void> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, type: true },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    if (conversation.type === 'DM') {
      throw new BadRequestException('Cannot remove members or leave a 1:1 direct message');
    }

    // If removing someone else, must be OWNER or ADMIN
    if (targetUserId !== callerId && callerRole !== 'OWNER' && callerRole !== 'ADMIN') {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Admin or Owner privileges required.',
      });
    }

    const targetMember = await this.prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId: targetUserId,
        },
      },
    });

    if (!targetMember) {
      throw new NotFoundException('Target user is not a member of this conversation');
    }

    if (targetMember.role === 'OWNER' && targetUserId !== callerId) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Cannot remove the conversation owner.',
      });
    }

    if (targetUserId !== callerId && callerRole === 'ADMIN' && targetMember.role === 'ADMIN') {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Admins cannot remove other admins.',
      });
    }

    await this.prisma.conversationMember.deleteMany({
      where: {
        conversationId,
        userId: targetUserId,
      },
    });

    // Evict removed user's active sockets from the conversation room immediately
    this.realtimeService.leaveUserSocketsFromRoom(
      targetUserId,
      `conversation:${conversationId}`,
    );

    const convItem = await this.getConversation(callerId, conversationId);
    this.realtimeService.emitToConversation(
      conversationId,
      SocketEvents.CONVERSATION_UPDATED,
      { conversation: convItem },
    );
    // Notify the removed user so their client removes/updates the conversation
    this.realtimeService.emitToUser(
      targetUserId,
      SocketEvents.CONVERSATION_UPDATED,
      { conversation: convItem },
    );
  }

  /**
   * Marks conversation read up to a message
   */
  async markRead(
    callerId: string,
    conversationId: string,
    dto: MarkConversationReadDto,
  ): Promise<void> {
    const now = new Date();

    const member = await this.prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId: callerId,
        },
      },
    });

    if (!member) return;

    // Verify message exists and belongs to this conversation
    const targetMessage = await this.prisma.message.findFirst({
      where: {
        id: dto.lastReadMessageId,
        conversationId,
      },
      select: { id: true },
    });

    if (!targetMessage) {
      throw new BadRequestException('Target message does not exist in this conversation');
    }

    await this.prisma.conversationMember.update({
      where: { id: member.id },
      data: {
        lastReadMessageId: dto.lastReadMessageId,
        lastReadAt: now,
      },
    });

    // Respect UserSettings.showReadReceipts before storing/broadcasting read receipt
    const settings = await this.prisma.userSettings.findUnique({
      where: { userId: callerId },
      select: { showReadReceipts: true },
    });
    const showReceipts = settings?.showReadReceipts ?? true;

    if (showReceipts) {
      await this.prisma.messageReceipt.upsert({
        where: {
          messageId_memberId: {
            messageId: dto.lastReadMessageId,
            memberId: member.id,
          },
        },
        update: {
          readAt: now,
        },
        create: {
          messageId: dto.lastReadMessageId,
          memberId: member.id,
          readAt: now,
        },
      });

      this.realtimeService.emitToConversation(
        conversationId,
        SocketEvents.MESSAGE_STATUS,
        {
          conversationId,
          messageId: dto.lastReadMessageId,
          userId: callerId,
          status: 'READ',
          timestamp: now.toISOString(),
        },
      );
    }
  }
}
