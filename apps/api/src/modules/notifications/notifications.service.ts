import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import {
  NotificationItem,
  PaginatedNotificationsResponse,
  SocketEvents,
  NotificationType,
} from '@chatterbox/shared';

export interface CreateNotificationParams {
  userId: string;
  actorId?: string | null;
  type: NotificationType;
  conversationId?: string | null;
  messageId?: string | null;
  title: string;
  body: string;
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => RealtimeService))
    private readonly realtimeService: RealtimeService,
  ) {}

  /**
   * Persists a Notification and delivers real-time socket event.
   * Enforces UserSettings and muted conversations rules.
   */
  async createNotification(params: CreateNotificationParams): Promise<NotificationItem | null> {
    // 1. Skip self-notifications
    if (params.actorId && params.actorId === params.userId) {
      return null;
    }

    // 2. Check recipient settings
    const settings = await this.prisma.userSettings.findUnique({
      where: { userId: params.userId },
    });

    if (settings) {
      if (params.type === 'NEW_MESSAGE' && !settings.notifyNewMessages) {
        return null;
      }
      if (params.type === 'MENTION' && !settings.notifyMentions) {
        return null;
      }
    }

    // 3. Check if conversation is muted by recipient
    if (params.conversationId) {
      const member = await this.prisma.conversationMember.findUnique({
        where: {
          conversationId_userId: {
            conversationId: params.conversationId,
            userId: params.userId,
          },
        },
      });

      if (member?.isMuted) {
        return null;
      }
    }

    // 4. Persist Notification
    const notification = await this.prisma.notification.create({
      data: {
        userId: params.userId,
        actorId: params.actorId ?? null,
        type: params.type,
        conversationId: params.conversationId ?? null,
        messageId: params.messageId ?? null,
        title: params.title,
        body: params.body,
      },
      include: {
        actor: {
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
    });

    const item = this.formatNotificationItem(notification);

    // 5. Emit live socket event to user room
    this.realtimeService.emitToUser(params.userId, SocketEvents.NOTIFICATION_NEW, {
      notification: item,
    });

    return item;
  }

  /**
   * Cursor-paginated notification history + unread count
   */
  async getNotifications(
    userId: string,
    cursor?: string,
    limit = 20,
  ): Promise<PaginatedNotificationsResponse> {
    const takeLimit = Math.min(Math.max(1, limit), 50);

    const [notifications, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        include: {
          actor: {
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
        orderBy: { createdAt: 'desc' },
        take: takeLimit + 1,
        ...(cursor
          ? {
              cursor: { id: cursor },
              skip: 1,
            }
          : {}),
      }),
      this.prisma.notification.count({
        where: { userId, readAt: null },
      }),
    ]);

    const hasMore = notifications.length > takeLimit;
    const data = hasMore ? notifications.slice(0, takeLimit) : notifications;
    const nextCursor = hasMore ? data[data.length - 1].id : null;

    return {
      data: data.map((n) => this.formatNotificationItem(n)),
      meta: {
        nextCursor,
        hasMore,
        unreadCount,
      },
    };
  }

  /**
   * Marks a single notification as read
   */
  async markAsRead(userId: string, notificationId: string): Promise<NotificationItem> {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
      include: {
        actor: {
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
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (notification.userId !== userId) {
      throw new ForbiddenException('Cannot modify another user notification');
    }

    if (notification.readAt) {
      return this.formatNotificationItem(notification);
    }

    const updated = await this.prisma.notification.update({
      where: { id: notificationId },
      data: { readAt: new Date() },
      include: {
        actor: {
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
    });

    return this.formatNotificationItem(updated);
  }

  /**
   * Marks all unread notifications for a user as read
   */
  async markAllAsRead(userId: string): Promise<{ success: true; count: number }> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });

    return { success: true, count: result.count };
  }

  private formatNotificationItem(n: any): NotificationItem {
    return {
      id: n.id,
      userId: n.userId,
      actorId: n.actorId,
      actor: n.actor
        ? {
            id: n.actor.id,
            username: n.actor.username,
            displayName: n.actor.profile?.displayName || n.actor.username,
            avatarUrl: n.actor.profile?.avatarUrl || null,
          }
        : null,
      type: n.type,
      conversationId: n.conversationId,
      messageId: n.messageId,
      title: n.title,
      body: n.body,
      readAt: n.readAt,
      createdAt: n.createdAt,
    };
  }
}
