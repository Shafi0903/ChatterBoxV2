export type ConversationType = 'DM' | 'GROUP';
export type ConversationRole = 'OWNER' | 'ADMIN' | 'MEMBER';
export type PresenceStatus = 'ONLINE' | 'AWAY' | 'IN_CALL' | 'OFFLINE';

export interface ConversationMemberItem {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  role: ConversationRole;
  lastReadAt: string | Date | null;
  joinedAt: string | Date;
  presence: PresenceStatus;
}

export interface ConversationItem {
  id: string;
  type: ConversationType;
  name: string | null;
  avatarUrl: string | null;
  dmKey: string | null;
  isEncrypted: boolean;
  lastMessageAt: string | Date | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  unreadCount: number;
  members: ConversationMemberItem[];
  lastMessage?: {
    id: string;
    content: string;
    senderId: string;
    senderName: string;
    createdAt: string | Date;
  } | null;
}

export type ConversationDetail = ConversationItem;
