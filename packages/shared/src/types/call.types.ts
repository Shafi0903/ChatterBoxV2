export enum CallType {
  AUDIO = 'AUDIO',
  VIDEO = 'VIDEO',
}

export enum CallStatus {
  RINGING = 'RINGING',
  ACTIVE = 'ACTIVE',
  ENDED = 'ENDED',
  MISSED = 'MISSED',
  REJECTED = 'REJECTED',
  FAILED = 'FAILED',
}

export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface IceServersResponse {
  iceServers: IceServerConfig[];
}

export interface CallUserSummary {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface CallItem {
  id: string;
  conversationId: string;
  callerId: string;
  calleeId: string;
  type: CallType;
  status: CallStatus;
  startedAt: string | Date | null;
  endedAt: string | Date | null;
  durationSec: number | null;
  createdAt: string | Date;
  caller: CallUserSummary;
  callee: CallUserSummary;
}

export interface CallHistoryItem extends CallItem {
  peer: CallUserSummary;
  direction: 'incoming' | 'outgoing';
}

export interface PaginatedCallsResponse {
  data: CallHistoryItem[];
  meta: {
    nextCursor: string | null;
    hasMore: boolean;
  };
}
