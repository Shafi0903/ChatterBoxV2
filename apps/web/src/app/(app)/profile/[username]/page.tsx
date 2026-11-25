'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  MapPin,
  Calendar,
  Edit3,
  MessageSquare,
  UserPlus,
  UserCheck,
  Layers,
  Image as ImageIcon,
} from 'lucide-react';
import { PublicProfileResponse, PostItem } from '@chatterbox/shared';
import { api, ApiError } from '../../../../lib/api';
import { useAuthStore } from '../../../../stores/auth.store';
import { Avatar } from '../../../../components/ui/Avatar';
import { Button } from '../../../../components/ui/Button';
import { Skeleton } from '../../../../components/ui/Skeleton';
import { EditProfileModal } from '../../../../components/profile/EditProfileModal';
import { FollowListModal } from '../../../../components/profile/FollowListModal';
import { PostCard } from '../../../../components/social/PostCard';

export default function UserProfilePage() {
  const params = useParams();
  const router = useRouter();
  const currentUsername = params?.username as string;

  const { user: currentUser, profile: myProfile } = useAuthStore();
  const [profileData, setProfileData] = useState<PublicProfileResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'posts' | 'stories'>('posts');
  const [isStartingDm, setIsStartingDm] = useState(false);

  // Social Phase 6 state
  const [isFollowing, setIsFollowing] = useState(false);
  const [followActionLoading, setFollowActionLoading] = useState(false);
  const [followModalType, setFollowModalType] = useState<'followers' | 'following' | null>(null);

  // User posts state
  const [userPosts, setUserPosts] = useState<PostItem[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [postsCursor, setPostsCursor] = useState<string | null>(null);
  const [postsHasMore, setPostsHasMore] = useState(false);

  const isOwnProfile =
    currentUser?.username?.toLowerCase() === currentUsername?.toLowerCase();

  const loadProfile = useCallback(async () => {
    if (!currentUsername) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getProfile(currentUsername);
      setProfileData(data);
      setIsFollowing(Boolean(data.isFollowing));
    } catch (err) {
      if (err instanceof ApiError && err.code === 'NOT_FOUND') {
        setError(`User '@${currentUsername}' does not exist.`);
      } else {
        setError('Failed to load profile. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [currentUsername]);

  const loadUserPosts = useCallback(async (userId: string, cursor?: string) => {
    try {
      setPostsLoading(true);
      const res = await api.getUserPosts(userId, cursor, 10);
      if (cursor) {
        setUserPosts((prev) => [...prev, ...res.data]);
      } else {
        setUserPosts(res.data);
      }
      setPostsCursor(res.meta?.nextCursor ?? null);
      setPostsHasMore(res.meta?.hasMore ?? false);
    } catch (err) {
      console.error('Failed to load user posts', err);
    } finally {
      setPostsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (profileData?.userId && activeTab === 'posts') {
      loadUserPosts(profileData.userId);
    }
  }, [profileData?.userId, activeTab, loadUserPosts]);

  const handleStartMessage = async () => {
    if (!profileData?.userId) return;
    setIsStartingDm(true);
    try {
      const conv = await api.createDm(profileData.userId);
      router.push(`/messages?c=${conv.id}`);
    } catch {
      alert('Failed to start conversation. Please try again.');
    } finally {
      setIsStartingDm(false);
    }
  };

  const handleToggleFollow = async () => {
    if (!profileData?.userId || followActionLoading) return;
    const previous = isFollowing;
    const delta = previous ? -1 : 1;

    // Optimistic toggle
    setIsFollowing(!previous);
    setProfileData((prev) =>
      prev
        ? {
            ...prev,
            isFollowing: !previous,
            counts: {
              ...prev.counts,
              followers: Math.max(0, prev.counts.followers + delta),
            },
          }
        : null
    );
    setFollowActionLoading(true);

    try {
      if (previous) {
        await api.unfollowUser(profileData.userId);
      } else {
        await api.followUser(profileData.userId);
      }
    } catch (err) {
      // Revert
      setIsFollowing(previous);
      setProfileData((prev) =>
        prev
          ? {
              ...prev,
              isFollowing: previous,
              counts: {
                ...prev.counts,
                followers: Math.max(0, prev.counts.followers - delta),
              },
            }
          : null
      );
      alert('Failed to update follow status');
    } finally {
      setFollowActionLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <Skeleton className="w-full h-44 rounded-2xl" />
        <div className="flex items-end justify-between px-4 -mt-16">
          <Skeleton className="w-24 h-24 rounded-full border-4 border-canvas" />
          <Skeleton className="w-28 h-9 rounded-xl" />
        </div>
        <div className="px-4 space-y-2">
          <Skeleton className="w-48 h-6" />
          <Skeleton className="w-32 h-4" />
          <Skeleton className="w-full h-16 rounded-xl mt-4" />
        </div>
      </div>
    );
  }

  if (error || !profileData) {
    return (
      <div className="py-16 text-center max-w-md mx-auto">
        <div className="w-12 h-12 rounded-full bg-elevated flex items-center justify-center text-muted mx-auto mb-3">
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-primary">{error || 'Profile not found'}</h2>
        <p className="text-xs text-muted mt-1">The requested user profile could not be retrieved.</p>
        <Button
          variant="secondary"
          size="sm"
          className="mt-4"
          onClick={() => router.push('/home')}
        >
          Return Home
        </Button>
      </div>
    );
  }

  const joinDate = profileData.createdAt
    ? new Date(profileData.createdAt).toLocaleDateString('en-US', {
        month: 'short',
        year: 'numeric',
      })
    : null;

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      {/* Header Card */}
      <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-sm">
        {/* Banner */}
        <div className="h-44 w-full bg-gradient-to-r from-accent/30 via-accent-bright/20 to-elevated relative overflow-hidden">
          {profileData.bannerUrl && (
            <img
              src={profileData.bannerUrl}
              alt="Profile banner"
              className="w-full h-full object-cover"
            />
          )}
        </div>

        {/* Identity & Actions Bar */}
        <div className="p-6 pt-0 relative">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 -mt-12 sm:-mt-16 mb-4">
            <div className="relative">
              <Avatar
                name={profileData.displayName}
                src={profileData.avatarUrl}
                size="xl"
                showOnlineDot={isOwnProfile}
                className="ring-4 ring-surface"
              />
            </div>

            {/* CTA Button */}
            <div className="flex items-center gap-2 self-start sm:self-auto">
              {isOwnProfile ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setIsEditModalOpen(true)}
                  className="gap-2"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Edit Profile</span>
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleStartMessage}
                    disabled={isStartingDm}
                    className="gap-1.5"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>{isStartingDm ? 'Opening...' : 'Message'}</span>
                  </Button>

                  <Button
                    variant={isFollowing ? 'secondary' : 'primary'}
                    size="sm"
                    onClick={handleToggleFollow}
                    disabled={followActionLoading}
                    className="gap-1.5"
                  >
                    {isFollowing ? (
                      <>
                        <UserCheck className="w-3.5 h-3.5" />
                        <span>Following</span>
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>Follow</span>
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* User Details */}
          <div>
            <h1 className="text-xl font-bold text-primary">
              {profileData.displayName}
            </h1>
            <p className="text-xs text-secondary mt-0.5">
              @{profileData.username}
            </p>

            {profileData.bio && (
              <p className="text-sm text-primary/90 mt-3 leading-relaxed max-w-2xl whitespace-pre-wrap">
                {profileData.bio}
              </p>
            )}

            {/* Metadata Chips */}
            <div className="flex flex-wrap items-center gap-4 text-xs text-muted mt-3">
              {profileData.location && (
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" />
                  <span>{profileData.location}</span>
                </div>
              )}
              {joinDate && (
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Joined {joinDate}</span>
                </div>
              )}
            </div>

            {/* Tags */}
            {profileData.tags && profileData.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {profileData.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-elevated text-secondary border border-border"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}

            {/* Real Social Metrics Bar with Clickable Follow Modals */}
            <div className="flex items-center gap-6 mt-5 pt-4 border-t border-border">
              <div className="flex items-center gap-1.5 text-xs">
                <span className="font-bold text-primary">
                  {profileData.counts.posts}
                </span>
                <span className="text-muted">Posts</span>
              </div>

              <button
                onClick={() => setFollowModalType('followers')}
                className="flex items-center gap-1.5 text-xs hover:text-cyan-400 transition-colors"
              >
                <span className="font-bold text-primary">
                  {profileData.counts.followers}
                </span>
                <span className="text-muted">Followers</span>
              </button>

              <button
                onClick={() => setFollowModalType('following')}
                className="flex items-center gap-1.5 text-xs hover:text-cyan-400 transition-colors"
              >
                <span className="font-bold text-primary">
                  {profileData.counts.following}
                </span>
                <span className="text-muted">Following</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Media & Content Tabs */}
      <div className="space-y-4">
        <div className="flex border-b border-border">
          <button
            onClick={() => setActiveTab('posts')}
            className={`flex items-center gap-2 px-5 py-3 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'posts'
                ? 'border-accent text-accent-bright'
                : 'border-transparent text-secondary hover:text-primary'
            }`}
          >
            <ImageIcon className="w-4 h-4" />
            <span>Posts</span>
          </button>
          <button
            onClick={() => setActiveTab('stories')}
            className={`flex items-center gap-2 px-5 py-3 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'stories'
                ? 'border-accent text-accent-bright'
                : 'border-transparent text-secondary hover:text-primary'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Stories</span>
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'posts' && (
          <div className="space-y-4">
            {postsLoading && userPosts.length === 0 ? (
              <div className="p-12 text-center bg-surface border border-border rounded-2xl">
                <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <p className="text-xs text-muted">Loading posts...</p>
              </div>
            ) : userPosts.length === 0 ? (
              <div className="p-12 text-center bg-surface border border-border rounded-2xl">
                <div className="w-10 h-10 rounded-full bg-elevated flex items-center justify-center text-muted mx-auto mb-2">
                  <ImageIcon className="w-5 h-5" />
                </div>
                <p className="text-sm font-medium text-primary">No posts yet</p>
                <p className="text-xs text-muted max-w-sm mx-auto mt-1">
                  {isOwnProfile
                    ? 'Publish your first post on the Home feed to see it here.'
                    : `@${profileData.username} hasn't posted anything yet.`}
                </p>
              </div>
            ) : (
              <>
                {userPosts.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    onPostDeleted={(deletedId) => {
                      setUserPosts((prev) => prev.filter((p) => p.id !== deletedId));
                      setProfileData((prev) =>
                        prev
                          ? {
                              ...prev,
                              counts: {
                                ...prev.counts,
                                posts: Math.max(0, prev.counts.posts - 1),
                              },
                            }
                          : null
                      );
                    }}
                    onPostUpdated={(updated) => {
                      setUserPosts((prev) =>
                        prev.map((p) => (p.id === updated.id ? updated : p))
                      );
                    }}
                  />
                ))}

                {postsHasMore && (
                  <div className="text-center pt-2">
                    <button
                      onClick={() =>
                        profileData?.userId &&
                        loadUserPosts(profileData.userId, postsCursor ?? undefined)
                      }
                      disabled={postsLoading}
                      className="px-4 py-2 rounded-xl bg-elevated border border-border text-xs font-semibold text-secondary hover:text-primary transition-colors"
                    >
                      {postsLoading ? 'Loading...' : 'Load more posts'}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === 'stories' && (
          <div className="p-12 text-center bg-surface border border-border rounded-2xl">
            <div className="w-10 h-10 rounded-full bg-elevated flex items-center justify-center text-muted mx-auto mb-2">
              <Layers className="w-5 h-5" />
            </div>
            <p className="text-sm font-medium text-primary">Active Stories</p>
            <p className="text-xs text-muted max-w-sm mx-auto mt-1">
              Active stories appear in the 24-hour stories tray on your Home feed.
            </p>
          </div>
        )}
      </div>

      {/* Followers / Following Modal */}
      {followModalType && (
        <FollowListModal
          userId={profileData.userId}
          type={followModalType}
          onClose={() => setFollowModalType(null)}
          onFollowCountChange={() => loadProfile()}
        />
      )}

      {/* Edit Profile Modal */}
      {isOwnProfile && (
        <EditProfileModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          currentProfile={myProfile}
          onProfileUpdated={(updated) => {
            setProfileData((prev) =>
              prev
                ? {
                    ...prev,
                    displayName: updated.displayName,
                    bio: updated.bio,
                    avatarUrl: updated.avatarUrl,
                    location: updated.location,
                    tags: updated.tags,
                  }
                : null,
            );
          }}
        />
      )}
    </div>
  );
}
