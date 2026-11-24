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

  // Phase 7 WebRTC Signaling Events
  // Client -> Server
  CALL_INITIATE: 'call:initiate',
  CALL_ACCEPT: 'call:accept',
  CALL_REJECT: 'call:reject',
  CALL_END: 'call:end',
  CALL_OFFER: 'call:offer',
  CALL_ANSWER: 'call:answer',
  CALL_ICE_CANDIDATE: 'call:ice-candidate',

  // Server -> Client
  CALL_INCOMING: 'call:incoming',
  CALL_ACCEPTED: 'call:accepted',
  CALL_REJECTED: 'call:rejected',
  CALL_ENDED: 'call:ended',
  CALL_BUSY: 'call:busy',
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

// Phase 7 WebRTC Signaling Payloads
export interface CallInitiatePayload {
  conversationId: string;
  type: 'AUDIO' | 'VIDEO';
}

export interface CallActionPayload {
  callId: string;
}

export interface CallOfferPayload {
  callId: string;
  sdp: {
    type: string;
    sdp: string;
    [key: string]: any;
  };
}

export interface CallAnswerPayload {
  callId: string;
  sdp: {
    type: string;
    sdp: string;
    [key: string]: any;
  };
}

export interface CallIceCandidatePayload {
  callId: string;
  candidate: {
    candidate: string;
    [key: string]: any;
  };
}

export interface CallIncomingPayload {
  call: import('../types/call.types').CallItem;
}

export interface CallAcceptedPayload {
  callId: string;
  acceptedBy: string;
  startedAt: string | Date;
}

export interface CallRejectedPayload {
  callId: string;
  rejectedBy: string;
  reason?: string;
}

export interface CallEndedPayload {
  callId: string;
  endedBy?: string;
  reason: 'ended' | 'canceled' | 'rejected' | 'missed' | 'busy' | 'failed' | 'disconnected';
  durationSec?: number | null;
}

export interface CallBusyPayload {
  conversationId: string;
  callId?: string;
  reason: string;
}

