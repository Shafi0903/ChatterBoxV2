export type CommunityRole = 'OWNER' | 'ADMIN' | 'MODERATOR' | 'MEMBER';
export type ChannelType = 'TEXT' | 'ANNOUNCEMENT';

export interface CommunityItem {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  iconUrl: string | null;
  bannerUrl: string | null;
  isPublic: boolean;
  ownerId: string;
  memberCount: number;
  channelCount: number;
  callerRole?: CommunityRole | null;
  createdAt: string | Date;
}

export interface CommunityDetail extends CommunityItem {
  channels: ChannelItem[];
  members: CommunityMemberItem[];
}

export interface CommunityMemberItem {
  id: string;
  communityId: string;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  role: CommunityRole;
  joinedAt: string | Date;
  presenceStatus?: string;
}

export interface ChannelItem {
  id: string;
  communityId: string;
  name: string;
  topic: string | null;
  type: ChannelType;
  position: number;
  createdAt: string | Date;
}

export interface ChannelMessageItem {
  id: string;
  channelId: string;
  senderId: string;
  sender: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  };
  clientMessageId: string;
  content: string;
  replyToId: string | null;
  replyTo?: {
    id: string;
    content: string;
    senderId: string;
    senderName: string;
  } | null;
  attachments?: any[];
  editedAt: string | Date | null;
  deletedAt: string | Date | null;
  createdAt: string | Date;
}

export interface CommunityInviteItem {
  id: string;
  communityId: string;
  creatorId: string;
  code: string;
  maxUses: number | null;
  uses: number;
  expiresAt: string | Date | null;
  createdAt: string | Date;
}
