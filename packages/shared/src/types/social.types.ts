import { MediaAttachmentItem } from './media.types';

export type PostVisibility = 'PUBLIC' | 'FOLLOWERS';

export interface FollowItem {
  id: string;
  followerId: string;
  followingId: string;
  createdAt: string | Date;
}

export interface FollowUserSummary {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  isFollowing: boolean;
  followsYou?: boolean;
  followersCount?: number;
  followingCount?: number;
}

export interface PostAuthorSummary {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface PostItem {
  id: string;
  authorId: string;
  author: PostAuthorSummary;
  content: string;
  visibility: PostVisibility;
  likesCount: number;
  commentsCount: number;
  isLiked: boolean;
  attachments: MediaAttachmentItem[];
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface PostCommentItem {
  id: string;
  postId: string;
  authorId: string;
  author: PostAuthorSummary;
  content: string;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface StoryItem {
  id: string;
  authorId: string;
  author: PostAuthorSummary;
  caption: string | null;
  backgroundColor: string | null;
  attachment: MediaAttachmentItem | null;
  hasViewed: boolean;
  viewCount?: number;
  expiresAt: string | Date;
  createdAt: string | Date;
}

export interface AuthorStoriesGroup {
  author: PostAuthorSummary;
  stories: StoryItem[];
  hasUnviewed: boolean;
}

export interface StoryViewerItem {
  id: string;
  viewerId: string;
  viewer: PostAuthorSummary;
  viewedAt: string | Date;
}
