export interface UserProfile {
  id: string;
  userId: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  location: string | null;
  tags: string[];
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface PublicProfileResponse {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  location: string | null;
  tags: string[];
  createdAt: Date | string;
  counts: {
    posts: number;
    followers: number;
    following: number;
  };
  isFollowing?: boolean;
}
