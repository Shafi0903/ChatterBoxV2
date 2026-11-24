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
  NOTIFICATION_NEW: 'notification:new',

  // Phase 5 Channel Events
  CHANNEL_JOIN: 'channel:join',
  CHANNEL_LEAVE: 'channel:leave',
  CHANNEL_MESSAGE_SEND: 'channel:message:send',
  CHANNEL_TYPING_START: 'channel:typing:start',
  CHANNEL_TYPING_STOP: 'channel:typing:stop',
  CHANNEL_MESSAGE_NEW: 'channel:message:new',
  CHANNEL_MESSAGE_UPDATED: 'channel:message:updated',
  CHANNEL_MESSAGE_DELETED: 'channel:message:deleted',
  CHANNEL_TYPING_UPDATE: 'channel:typing:update',
  COMMUNITY_UPDATED: 'community:updated',
} as const;

export interface ConversationJoinPayload {
  conversationId: string;
}

export interface MessageSendPayload {
  conversationId: string;
  clientMessageId: string;
  content: string;
  replyToId?: string;
  attachmentIds?: string[];
  type?: string;
  isEncrypted?: boolean;
  senderDeviceId?: string;
  e2eeHeader?: any;
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
  senderDeviceId?: string | null;
  e2eeHeader?: any | null;
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

export interface ChannelJoinPayload {
  channelId: string;
}

export interface ChannelLeavePayload {
  channelId: string;
}

export interface ChannelMessageSendPayload {
  channelId: string;
  clientMessageId: string;
  content: string;
  replyToId?: string;
  attachmentIds?: string[];
}

export interface ChannelTypingPayload {
  channelId: string;
}

export interface ChannelTypingUpdatePayload {
  channelId: string;
  userId: string;
  displayName: string;
  isTyping: boolean;
}

export interface CommunityUpdatedPayload {
  community: import('../types/community.types').CommunityItem;
}
