import {
  Injectable,
  Inject,
  forwardRef,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import {
  MessageItem,
  SendMessageDto,
  EditMessageDto,
  CursorPaginationMeta,
  SocketEvents,
} from '@chatterbox/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { NotificationsService } from '../notifications/notifications.service';

const messageInclude = {
  sender: {
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
  replyTo: {
    select: {
      id: true,
      content: true,
      senderId: true,
      sender: {
        select: {
          username: true,
          profile: { select: { displayName: true } },
        },
      },
    },
  },
  reactions: true,
  attachments: true,
};

@Injectable()
export class MessagesService {
  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => RealtimeService))
    private realtimeService: RealtimeService,
    private notificationsService: NotificationsService,
  ) {}

  /**
   * User adjustment #3: Single send path with P2002 idempotency catch
   * Shared by both REST POST /conversations/:id/messages and Socket message:send
   */
  async sendMessage(
    senderId: string,
    conversationId: string,
    dto: SendMessageDto,
  ): Promise<MessageItem> {
    // 1. Verify membership and retrieve conversation encryption status
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        members: {
          where: { userId: senderId },
        },
      },
    });

    if (!conversation || conversation.members.length === 0) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'You are not a member of this conversation.',
      });
    }

    // 2. Validate E2EE constraints
    if (conversation.isEncrypted) {
      if (!dto.isEncrypted || !dto.e2eeHeader || !dto.senderDeviceId) {
        throw new BadRequestException(
          'This conversation is end-to-end encrypted. Messages must be encrypted with valid e2eeHeader and senderDeviceId.'
        );
      }

      // Verify senderDeviceId belongs to senderId and is not revoked
      const device = await this.prisma.device.findUnique({
        where: { id: dto.senderDeviceId },
      });

      if (!device || device.userId !== senderId || device.revokedAt !== null) {
        throw new BadRequestException('Invalid or revoked senderDeviceId');
      }
    } else {
      if (dto.isEncrypted) {
        throw new BadRequestException(
          'Cannot send encrypted message in a non-encrypted conversation'
        );
      }
    }

    // Verify attachment IDs if provided (Adjustment 1 & 2)
    let verifiedAttachments: any[] = [];
    let inferredType: any = dto.type || 'TEXT';

    if (dto.attachmentIds && dto.attachmentIds.length > 0) {
      verifiedAttachments = await this.prisma.mediaAttachment.findMany({
        where: {
          id: { in: dto.attachmentIds },
        },
      });

      if (verifiedAttachments.length !== dto.attachmentIds.length) {
        throw new BadRequestException('One or more attachments not found');
      }

      for (const att of verifiedAttachments) {
        if (att.uploaderId !== senderId) {
          throw new ForbiddenException('Cannot attach media uploaded by another user');
        }
        if (att.status !== 'READY') {
          throw new BadRequestException('Cannot attach media that is not READY');
        }
        if (att.messageId !== null || att.channelMessageId !== null) {
          throw new BadRequestException('Attachment is already linked to another message');
        }
      }

      // Infer type from first attachment if type not explicitly provided
      if (!dto.type) {
        const firstMime = verifiedAttachments[0].mimeType;
        if (firstMime.startsWith('image/')) inferredType = 'IMAGE';
        else if (firstMime.startsWith('video/')) inferredType = 'VIDEO';
        else if (firstMime.startsWith('audio/')) inferredType = 'AUDIO';
        else inferredType = 'FILE';
      }
    }

    try {
      const message = await this.prisma.$transaction(async (tx) => {
        const msg = await tx.message.create({
          data: {
            conversationId,
            senderId,
            clientMessageId: dto.clientMessageId,
            content: (dto.content || '').trim(),
            type: inferredType,
            replyToId: dto.replyToId,
            isEncrypted: !!conversation.isEncrypted,
            encryptionVersion: conversation.isEncrypted ? 1 : null,
            senderDeviceId: conversation.isEncrypted ? dto.senderDeviceId : null,
            e2eeHeader: conversation.isEncrypted ? (dto.e2eeHeader as any) : null,
          },
          include: messageInclude,
        });

        // Link attachments to this message
        if (verifiedAttachments.length > 0) {
          await tx.mediaAttachment.updateMany({
            where: {
              id: { in: dto.attachmentIds },
            },
            data: {
              messageId: msg.id,
            },
          });
        }

        await tx.conversation.update({
          where: { id: conversationId },
          data: { lastMessageAt: msg.createdAt },
        });

        // Re-query message with linked attachments
        const result = await tx.message.findUnique({
          where: { id: msg.id },
          include: messageInclude,
        });
        if (!result) {
          throw new NotFoundException('Message not found after creation');
        }
        return result;
      });

      const messageItem = this.formatMessageItem(message);

      // Broadcast to conversation room on new message creation
      this.realtimeService.emitToConversation(
        conversationId,
        SocketEvents.MESSAGE_NEW,
        { message: messageItem },
      );

      // Trigger NEW_MESSAGE notification for all other conversation members
      try {
        const otherMembers = await this.prisma.conversationMember.findMany({
          where: {
            conversationId,
            userId: { not: senderId },
          },
          select: { userId: true },
        });

        const senderUser = await this.prisma.user.findUnique({
          where: { id: senderId },
          select: { username: true, profile: { select: { displayName: true } } },
        });
        const senderName = senderUser?.profile?.displayName || senderUser?.username || 'Someone';

        let notifTitle = conversation.name || senderName;
        let notifBody = (dto.content || '').trim();

        if (conversation.isEncrypted) {
          // E2EE Privacy Boundary: never put ciphertext or plaintext in notification body
          notifTitle = conversation.name || 'Encrypted Message';
          notifBody = 'Sent an encrypted message';
        } else if (!notifBody && verifiedAttachments.length > 0) {
          notifBody = 'Sent an attachment';
        }

        for (const member of otherMembers) {
          await this.notificationsService.createNotification({
            userId: member.userId,
            actorId: senderId,
            type: 'NEW_MESSAGE',
            conversationId,
            messageId: message.id,
            title: notifTitle,
            body: notifBody,
          });
        }
      } catch (err) {
        // Log/swallow notification error so message delivery succeeds
        console.error('Failed to dispatch notification for new message:', err);
      }

      return messageItem;
    } catch (err: any) {
      // Catch Prisma P2002 unique constraint violation on (senderId, clientMessageId)
      if (err.code === 'P2002') {
        const existing = await this.prisma.message.findUnique({
          where: {
            senderId_clientMessageId: {
              senderId,
              clientMessageId: dto.clientMessageId,
            },
          },
          include: messageInclude,
        });

        if (existing) {
          // Return existing without duplicate broadcast
          return this.formatMessageItem(existing);
        }
      }
      throw err;
    }
  }

  /**
   * Cursor-paginated message history
   */
  async getMessages(
    conversationId: string,
    cursor?: string,
    limit = 50,
  ): Promise<{ data: MessageItem[]; meta: CursorPaginationMeta }> {
    const takeLimit = Math.min(Math.max(1, limit), 100);

    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      include: messageInclude,
      orderBy: { createdAt: 'desc' },
      take: takeLimit + 1,
      ...(cursor
        ? {
            cursor: { id: cursor },
            skip: 1,
          }
        : {}),
    });

    const hasMore = messages.length > takeLimit;
    const paginated = hasMore ? messages.slice(0, takeLimit) : messages;
    const nextCursor = hasMore ? paginated[paginated.length - 1].id : null;

    return {
      data: paginated.map((m) => this.formatMessageItem(m)),
      meta: {
        nextCursor,
        hasMore,
      },
    };
  }

  /**
   * Edits message content (Sender only)
   */
  async editMessage(
    userId: string,
    messageId: string,
    dto: EditMessageDto,
  ): Promise<MessageItem> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: {
        ...messageInclude,
        conversation: {
          select: { isEncrypted: true },
        },
      },
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    if (message.senderId !== userId) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'You can only edit your own messages.',
      });
    }

    if (message.deletedAt !== null) {
      throw new BadRequestException('Cannot edit a deleted message');
    }

    // Adjustment 2: If conversation isEncrypted, require fresh e2eeHeader and senderDeviceId
    if (message.conversation.isEncrypted) {
      if (!dto.e2eeHeader || !dto.senderDeviceId) {
        throw new BadRequestException(
          'Encrypted messages require updated e2eeHeader and senderDeviceId on edit'
        );
      }

      const device = await this.prisma.device.findUnique({
        where: { id: dto.senderDeviceId },
      });

      if (!device || device.userId !== userId || device.revokedAt !== null) {
        throw new BadRequestException('Invalid or revoked senderDeviceId');
      }
    }

    const now = new Date();
    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: {
        content: dto.content.trim(),
        editedAt: now,
        senderDeviceId: message.conversation.isEncrypted ? dto.senderDeviceId : undefined,
        e2eeHeader: message.conversation.isEncrypted ? (dto.e2eeHeader as any) : undefined,
      },
      include: messageInclude,
    });

    const formatted = this.formatMessageItem(updated);

    this.realtimeService.emitToConversation(
      message.conversationId,
      SocketEvents.MESSAGE_UPDATED,
      {
        messageId: updated.id,
        conversationId: updated.conversationId,
        content: updated.content,
        editedAt: now.toISOString(),
        senderDeviceId: updated.senderDeviceId,
        e2eeHeader: updated.e2eeHeader,
      },
    );

    return formatted;
  }

  /**
   * Soft-deletes a message (Sender or group OWNER/ADMIN)
   */
  async deleteMessage(userId: string, messageId: string): Promise<void> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    // Check permissions
    if (message.senderId !== userId) {
      const member = await this.prisma.conversationMember.findUnique({
        where: {
          conversationId_userId: {
            conversationId: message.conversationId,
            userId,
          },
        },
      });

      if (!member || (member.role !== 'OWNER' && member.role !== 'ADMIN')) {
        throw new ForbiddenException({
          code: 'FORBIDDEN',
          message: 'Permission denied to delete this message.',
        });
      }
    }

    const now = new Date();
    await this.prisma.message.update({
      where: { id: messageId },
      data: {
        deletedAt: now,
        content: 'This message was deleted',
      },
    });

    this.realtimeService.emitToConversation(
      message.conversationId,
      SocketEvents.MESSAGE_DELETED,
      {
        messageId: message.id,
        conversationId: message.conversationId,
        deletedAt: now.toISOString(),
      },
    );
  }

  /**
   * Toggles emoji reaction on a message
   */
  async toggleReaction(
    userId: string,
    messageId: string,
    emoji: string,
  ): Promise<MessageItem> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    // Verify membership in conversation
    const member = await this.prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: {
          conversationId: message.conversationId,
          userId,
        },
      },
    });

    if (!member) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'You are not a member of this conversation.',
      });
    }

    const existingReaction = await this.prisma.messageReaction.findUnique({
      where: {
        messageId_userId_emoji: {
          messageId,
          userId,
          emoji,
        },
      },
    });

    if (existingReaction) {
      await this.prisma.messageReaction.delete({
        where: { id: existingReaction.id },
      });
    } else {
      await this.prisma.messageReaction.create({
        data: {
          messageId,
          userId,
          emoji,
        },
      });
    }

    const updated = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: messageInclude,
    });

    const formatted = this.formatMessageItem(updated!);

    this.realtimeService.emitToConversation(
      message.conversationId,
      SocketEvents.MESSAGE_REACTION,
      {
        messageId,
        conversationId: message.conversationId,
        reactions: formatted.reactions,
      },
    );

    return formatted;
  }

  /**
   * Explicitly removes a reaction
   */
  async removeReaction(
    userId: string,
    messageId: string,
    emoji: string,
  ): Promise<MessageItem> {
    const reaction = await this.prisma.messageReaction.findUnique({
      where: {
        messageId_userId_emoji: {
          messageId,
          userId,
          emoji,
        },
      },
      include: {
        message: true,
      },
    });

    if (reaction) {
      await this.prisma.messageReaction.delete({
        where: { id: reaction.id },
      });

      const updated = await this.prisma.message.findUnique({
        where: { id: messageId },
        include: messageInclude,
      });

      const formatted = this.formatMessageItem(updated!);

      this.realtimeService.emitToConversation(
        reaction.message.conversationId,
        SocketEvents.MESSAGE_REACTION,
        {
          messageId,
          conversationId: reaction.message.conversationId,
          reactions: formatted.reactions,
        },
      );

      return formatted;
    }

    const unchanged = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: messageInclude,
    });
    return this.formatMessageItem(unchanged!);
  }

  private formatMessageItem(m: any): MessageItem {
    // Group reactions by emoji
    const reactionMap = new Map<string, string[]>();
    (m.reactions || []).forEach((r: any) => {
      const users = reactionMap.get(r.emoji) || [];
      users.push(r.userId);
      reactionMap.set(r.emoji, users);
    });

    const reactions = Array.from(reactionMap.entries()).map(([emoji, userIds]) => ({
      emoji,
      count: userIds.length,
      userIds,
    }));

    return {
      id: m.id,
      conversationId: m.conversationId,
      senderId: m.senderId,
      sender: {
        id: m.sender.id,
        username: m.sender.username,
        displayName: m.sender.profile?.displayName || m.sender.username,
        avatarUrl: m.sender.profile?.avatarUrl || null,
      },
      clientMessageId: m.clientMessageId,
      content: m.deletedAt !== null ? 'This message was deleted' : m.content,
      type: m.type,
      isEncrypted: m.isEncrypted,
      encryptionVersion: m.encryptionVersion,
      senderDeviceId: m.senderDeviceId,
      e2eeHeader: m.e2eeHeader,
      replyToId: m.replyToId,
      replyTo: m.replyTo
        ? {
            id: m.replyTo.id,
            content: m.replyTo.content,
            senderId: m.replyTo.senderId,
            senderName:
              m.replyTo.sender.profile?.displayName || m.replyTo.sender.username,
          }
        : null,
      editedAt: m.editedAt,
      deletedAt: m.deletedAt,
      createdAt: m.createdAt,
      reactions,
      attachments: (m.attachments || []).map((a: any) => ({
        id: a.id,
        uploaderId: a.uploaderId,
        messageId: a.messageId,
        storageKey: a.storageKey,
        originalName: a.originalName,
        mimeType: a.mimeType,
        sizeBytes: a.sizeBytes,
        durationSec: a.durationSec,
        width: a.width,
        height: a.height,
        status: a.status,
        createdAt: a.createdAt,
      })),
    };
  }
}
