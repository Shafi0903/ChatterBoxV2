import { MediaAttachmentItem } from './media.types';

export type MessageType =
  | 'TEXT'
  | 'IMAGE'
  | 'VIDEO'
  | 'FILE'
  | 'AUDIO'
  | 'SYSTEM';

export type MessageStatus = 'SENDING' | 'SENT' | 'DELIVERED' | 'READ';

export interface MessageReactionItem {
  emoji: string;
  count: number;
  userIds: string[];
}

export interface MessageItem {
  id: string;
  conversationId: string;
  senderId: string;
  sender: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  };
  clientMessageId: string;
  content: string;
  type: MessageType;
  isEncrypted: boolean;
  encryptionVersion?: number | null;
  senderDeviceId?: string | null;
  e2eeHeader?: any | null;
  replyToId: string | null;
  replyTo?: {
    id: string;
    content: string;
    senderId: string;
    senderName: string;
  } | null;
  attachments?: MediaAttachmentItem[];
  editedAt: string | Date | null;
  deletedAt: string | Date | null;
  createdAt: string | Date;
  status?: MessageStatus | 'FAILED';
  reactions: MessageReactionItem[];
}

export interface CursorPaginationMeta {
  nextCursor: string | null;
  hasMore: boolean;
}
