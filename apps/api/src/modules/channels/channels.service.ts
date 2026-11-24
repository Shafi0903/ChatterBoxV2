import {
  Injectable,
  Inject,
  forwardRef,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import {
  CreateChannelDto,
  UpdateChannelDto,
  SendChannelMessageDto,
  EditChannelMessageDto,
  ChannelItem,
  ChannelMessageItem,
  SocketEvents,
  CommunityRole,
} from '@chatterbox/shared';

const channelMessageInclude = {
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
  attachments: true,
};

@Injectable()
export class ChannelsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => RealtimeService))
    private readonly realtimeService: RealtimeService,
  ) {}

  /**
   * Creates a channel in a community (OWNER or ADMIN)
   */
  async createChannel(
    communityId: string,
    dto: CreateChannelDto,
  ): Promise<ChannelItem> {
    const slugName = dto.name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-]+/g, '-');

    const existing = await this.prisma.channel.findUnique({
      where: {
        communityId_name: {
          communityId,
          name: slugName,
        },
      },
    });

    if (existing) {
      throw new BadRequestException(`Channel #${slugName} already exists in this community`);
    }

    const channel = await this.prisma.channel.create({
      data: {
        communityId,
        name: slugName,
        topic: dto.topic?.trim() || null,
        type: dto.type || 'TEXT',
        position: dto.position ?? 0,
      },
    });

    return {
      id: channel.id,
      communityId: channel.communityId,
      name: channel.name,
      topic: channel.topic,
      type: channel.type as any,
      position: channel.position,
      createdAt: channel.createdAt,
    };
  }

  /**
   * Update channel metadata (OWNER or ADMIN)
   */
  async updateChannel(
    channelId: string,
    dto: UpdateChannelDto,
  ): Promise<ChannelItem> {
    const channel = await this.prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) throw new NotFoundException('Channel not found');

    const slugName = dto.name
      ? dto.name.toLowerCase().trim().replace(/[^a-z0-9-]+/g, '-')
      : undefined;

    const updated = await this.prisma.channel.update({
      where: { id: channelId },
      data: {
        ...(slugName ? { name: slugName } : {}),
        ...(dto.topic !== undefined ? { topic: dto.topic?.trim() || null } : {}),
        ...(dto.position !== undefined ? { position: dto.position } : {}),
      },
    });

    return {
      id: updated.id,
      communityId: updated.communityId,
      name: updated.name,
      topic: updated.topic,
      type: updated.type as any,
      position: updated.position,
      createdAt: updated.createdAt,
    };
  }

  /**
   * Delete channel (OWNER or ADMIN; prevent deleting last remaining channel)
   */
  async deleteChannel(channelId: string): Promise<{ success: true }> {
    const channel = await this.prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) throw new NotFoundException('Channel not found');

    const channelCount = await this.prisma.channel.count({
      where: { communityId: channel.communityId },
    });

    if (channelCount <= 1) {
      throw new BadRequestException('Cannot delete the last remaining channel in the community');
    }

    await this.prisma.channel.delete({ where: { id: channelId } });
    return { success: true };
  }

  /**
   * Cursor-paginated message history for channel (Community members only)
   */
  async getChannelMessages(
    userId: string,
    channelId: string,
    cursor?: string,
    limit = 50,
  ): Promise<{ data: ChannelMessageItem[]; meta: { nextCursor: string | null; hasMore: boolean } }> {
    const channel = await this.prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) throw new NotFoundException('Channel not found');

    // Authorize caller
    const member = await this.prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId: channel.communityId, userId } },
    });
    if (!member) {
      throw new ForbiddenException('You must be a member of the community to read channel messages');
    }

    const takeLimit = Math.min(Math.max(1, limit), 100);

    const messages = await this.prisma.channelMessage.findMany({
      where: { channelId, deletedAt: null },
      include: channelMessageInclude,
      orderBy: { createdAt: 'desc' },
      take: takeLimit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = messages.length > takeLimit;
    const items = hasMore ? messages.slice(0, takeLimit) : messages;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    return {
      data: items.map((m) => this.formatChannelMessageItem(m)),
      meta: { nextCursor, hasMore },
    };
  }

  /**
   * Post message to channel (Enforces ANNOUNCEMENT role restriction)
   */
  async sendMessage(
    senderId: string,
    channelId: string,
    dto: SendChannelMessageDto,
  ): Promise<ChannelMessageItem> {
    const channel = await this.prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) throw new NotFoundException('Channel not found');

    const member = await this.prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId: channel.communityId, userId: senderId } },
    });
    if (!member) {
      throw new ForbiddenException('You must be a member of the community to send messages');
    }

    // Role check for ANNOUNCEMENT channels: only OWNER, ADMIN, MODERATOR
    if (channel.type === 'ANNOUNCEMENT' && member.role === 'MEMBER') {
      throw new ForbiddenException('Only community moderators and administrators can post in announcement channels');
    }

    // Adjustment #1: Verify attachment IDs if provided
    let verifiedAttachments: any[] = [];
    if (dto.attachmentIds && dto.attachmentIds.length > 0) {
      verifiedAttachments = await this.prisma.mediaAttachment.findMany({
        where: { id: { in: dto.attachmentIds } },
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
        // Verify not already attached to another DM, Channel message, Post or Story
        if (
          att.messageId !== null ||
          att.channelMessageId !== null ||
          att.postId !== null ||
          att.storyId !== null
        ) {
          throw new BadRequestException('Attachment is already linked to another message or post');
        }
      }
    }

    try {
      const message = await this.prisma.$transaction(async (tx) => {
        const msg = await tx.channelMessage.create({
          data: {
            channelId,
            senderId,
            clientMessageId: dto.clientMessageId,
            content: (dto.content || '').trim(),
            replyToId: dto.replyToId || null,
          },
          include: channelMessageInclude,
        });

        if (verifiedAttachments.length > 0) {
          await tx.mediaAttachment.updateMany({
            where: { id: { in: dto.attachmentIds } },
            data: { channelMessageId: msg.id },
          });
        }

        const reloaded = await tx.channelMessage.findUnique({
          where: { id: msg.id },
          include: channelMessageInclude,
        });

        return reloaded!;
      });

      const formatted = this.formatChannelMessageItem(message);

      // Broadcast to channel room
      this.realtimeService.emitToRoom(
        `channel:${channelId}`,
        SocketEvents.CHANNEL_MESSAGE_NEW,
        { message: formatted },
      );

      return formatted;
    } catch (err: any) {
      // Idempotency: return existing if P2002 on (senderId, clientMessageId)
      if (err.code === 'P2002') {
        const existing = await this.prisma.channelMessage.findUnique({
          where: {
            senderId_clientMessageId: {
              senderId,
              clientMessageId: dto.clientMessageId,
            },
          },
          include: channelMessageInclude,
        });
        if (existing) {
          return this.formatChannelMessageItem(existing);
        }
      }
      throw err;
    }
  }

  /**
   * Edit channel message (Sender only)
   */
  async editMessage(
    senderId: string,
    messageId: string,
    dto: EditChannelMessageDto,
  ): Promise<ChannelMessageItem> {
    const message = await this.prisma.channelMessage.findUnique({
      where: { id: messageId },
    });
    if (!message) throw new NotFoundException('Message not found');

    if (message.senderId !== senderId) {
      throw new ForbiddenException('You can only edit your own messages');
    }

    if (message.deletedAt) {
      throw new BadRequestException('Cannot edit deleted message');
    }

    const updated = await this.prisma.channelMessage.update({
      where: { id: messageId },
      data: {
        content: dto.content.trim(),
        editedAt: new Date(),
      },
      include: channelMessageInclude,
    });

    const formatted = this.formatChannelMessageItem(updated);

    this.realtimeService.emitToRoom(
      `channel:${updated.channelId}`,
      SocketEvents.CHANNEL_MESSAGE_UPDATED,
      {
        messageId: updated.id,
        channelId: updated.channelId,
        content: updated.content,
        editedAt: updated.editedAt,
      },
    );

    return formatted;
  }

  /**
   * Delete channel message (Sender OR OWNER / ADMIN / MODERATOR)
   */
  async deleteMessage(
    userId: string,
    messageId: string,
  ): Promise<{ success: true }> {
    const message = await this.prisma.channelMessage.findUnique({
      where: { id: messageId },
      include: { channel: true },
    });
    if (!message) throw new NotFoundException('Message not found');

    if (message.senderId !== userId) {
      // Check community moderator/admin rank
      const member = await this.prisma.communityMember.findUnique({
        where: {
          communityId_userId: {
            communityId: message.channel.communityId,
            userId,
          },
        },
      });

      if (!member || (member.role !== 'OWNER' && member.role !== 'ADMIN' && member.role !== 'MODERATOR')) {
        throw new ForbiddenException('Insufficient permissions to delete this message');
      }
    }

    const deleted = await this.prisma.channelMessage.update({
      where: { id: messageId },
      data: { deletedAt: new Date() },
    });

    this.realtimeService.emitToRoom(
      `channel:${deleted.channelId}`,
      SocketEvents.CHANNEL_MESSAGE_DELETED,
      {
        messageId: deleted.id,
        channelId: deleted.channelId,
        deletedAt: deleted.deletedAt,
      },
    );

    return { success: true };
  }

  private formatChannelMessageItem(m: any): ChannelMessageItem {
    return {
      id: m.id,
      channelId: m.channelId,
      senderId: m.senderId,
      sender: {
        id: m.sender.id,
        username: m.sender.username,
        displayName: m.sender.profile?.displayName || m.sender.username,
        avatarUrl: m.sender.profile?.avatarUrl || null,
      },
      clientMessageId: m.clientMessageId,
      content: m.deletedAt ? 'This message was deleted' : m.content,
      replyToId: m.replyToId,
      replyTo: m.replyTo
        ? {
            id: m.replyTo.id,
            content: m.replyTo.content,
            senderId: m.replyTo.senderId,
            senderName:
              m.replyTo.sender.profile?.displayName ||
              m.replyTo.sender.username,
          }
        : null,
      attachments: m.attachments || [],
      editedAt: m.editedAt,
      deletedAt: m.deletedAt,
      createdAt: m.createdAt,
    };
  }
}
