import { ConversationItem, PresenceStatus } from '../types/conversation.types';
import { MessageItem } from '../types/message.types';

export const SocketEvents = {
  // Client -> Server
  CONVERSATION_JOIN: 'conversation:join',
  MESSAGE_SEND: 'message:send',
  MESSAGE_DELIVERED: 'message:delivered',
  MESSAGE_READ: 'message:read',
  TYPING_START: 'typing:start',
  TYPING_STOP: 'typing:stop',

  // Server -> Client
  MESSAGE_NEW: 'message:new',
  MESSAGE_UPDATED: 'message:updated',
  MESSAGE_DELETED: 'message:deleted',
  MESSAGE_REACTION: 'message:reaction',
  MESSAGE_STATUS: 'message:status',
  TYPING_UPDATE: 'typing:update',
  PRESENCE_CHANGED: 'presence:changed',
  CONVERSATION_UPDATED: 'conversation:updated',
} as const;

export interface ConversationJoinPayload {
  conversationId: string;
}

export interface MessageSendPayload {
  conversationId: string;
  clientMessageId: string;
  content: string;
  replyToId?: string;
  type?: string;
}

export interface MessageDeliveredPayload {
  conversationId: string;
  messageId: string;
}

export interface MessageReadPayload {
  conversationId: string;
  lastReadMessageId: string;
}

export interface MessageUpdatedPayload {
  messageId: string;
  conversationId: string;
  content: string;
  editedAt: string | Date;
}

export interface MessageDeletedPayload {
  messageId: string;
  conversationId: string;
  deletedAt: string | Date;
}

export interface MessageReactionPayload {
  messageId: string;
  conversationId: string;
  reactions: import('../types/message.types').MessageReactionItem[];
}

export interface TypingPayload {
  conversationId: string;
}

// User adjustment #4: Always expose userId (not internal memberId) in message:status
export interface MessageStatusPayload {
  conversationId: string;
  messageId: string;
  userId: string;
  status: 'DELIVERED' | 'READ';
  timestamp: string;
}

export interface TypingUpdatePayload {
  conversationId: string;
  userId: string;
  displayName: string;
  isTyping: boolean;
}

export interface PresenceChangedPayload {
  userId: string;
  status: PresenceStatus;
}

export interface ConversationUpdatedPayload {
  conversation: ConversationItem;
}
