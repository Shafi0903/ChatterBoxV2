export type SearchType = 'all' | 'users' | 'communities' | 'posts' | 'messages';

export interface SearchUserItem {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  isFollowing: boolean;
}

export interface SearchCommunityItem {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  iconUrl: string | null;
  isPublic: boolean;
  memberCount: number;
  isMember: boolean;
}

export interface SearchPostItem {
  id: string;
  authorId: string;
  author: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  };
  content: string;
  visibility: 'PUBLIC' | 'FOLLOWERS';
  createdAt: string | Date;
  likesCount: number;
  commentsCount: number;
}

export interface SearchMessageItem {
  id: string;
  conversationId: string;
  senderId: string;
  sender: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  };
  content: string;
  createdAt: string | Date;
  conversationName: string | null;
}

export interface GlobalSearchResponse {
  users: SearchUserItem[];
  communities: SearchCommunityItem[];
  posts: SearchPostItem[];
  messages: SearchMessageItem[];
}

export interface HealthCheckResponse {
  status: 'ok' | 'degraded';
  services: {
    postgres: boolean;
    redis: boolean;
    s3: boolean;
  };
  uptimeSec: number;
  timestamp: string;
}
