export type NotificationType =
  | 'NEW_MESSAGE'
  | 'GROUP_INVITE'
  | 'MENTION'
  | 'SYSTEM'
  | 'NEW_FOLLOWER'
  | 'POST_LIKE'
  | 'POST_COMMENT'
  | 'MISSED_CALL';

export interface NotificationItem {
  id: string;
  userId: string;
  actorId: string | null;
  actor?: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  } | null;
  type: NotificationType;
  conversationId?: string | null;
  messageId?: string | null;
  postId?: string | null;
  title: string;
  body: string;
  readAt: string | Date | null;
  createdAt: string | Date;
}

export interface PaginatedNotificationsResponse {
  data: NotificationItem[];
  meta: {
    nextCursor: string | null;
    hasMore: boolean;
    unreadCount: number;
  };
}
