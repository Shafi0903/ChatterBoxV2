'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  MapPin,
  Calendar,
  Edit3,
  MessageSquare,
  UserPlus,
  Layers,
  Image,
  Bookmark,
} from 'lucide-react';
import { PublicProfileResponse } from '@chatterbox/shared';
import { api, ApiError } from '../../../../lib/api';
import { useAuthStore } from '../../../../stores/auth.store';
import { Avatar } from '../../../../components/ui/Avatar';
import { Button } from '../../../../components/ui/Button';
import { Skeleton } from '../../../../components/ui/Skeleton';
import { EditProfileModal } from '../../../../components/profile/EditProfileModal';

export default function UserProfilePage() {
  const params = useParams();
  const router = useRouter();
  const currentUsername = params?.username as string;

  const { user: currentUser, profile: myProfile } = useAuthStore();
  const [profileData, setProfileData] = useState<PublicProfileResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'posts' | 'stories' | 'saved'>('posts');
  const [roadmapMessage, setRoadmapMessage] = useState<string | null>(null);

  const isOwnProfile =
    currentUser?.username?.toLowerCase() === currentUsername?.toLowerCase();

  const loadProfile = async () => {
    if (!currentUsername) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getProfile(currentUsername);
      setProfileData(data);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'NOT_FOUND') {
        setError(`User '@${currentUsername}' does not exist.`);
      } else {
        setError('Failed to load profile. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, [currentUsername]);

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
      {/* Roadmap message toast */}
      {roadmapMessage && (
        <div className="p-3 bg-accent/15 border border-accent/30 rounded-xl text-accent-bright text-xs flex items-center justify-between">
          <span>{roadmapMessage}</span>
          <button
            onClick={() => setRoadmapMessage(null)}
            className="text-accent-bright font-bold px-2 py-0.5 rounded hover:bg-accent/20"
          >
            ✕
          </button>
        </div>
      )}

      {/* Header Card */}
      <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-sm">
        {/* Banner */}
        <div className="h-44 w-full bg-gradient-to-r from-accent/30 via-accent-bright/20 to-elevated relative overflow-hidden">
          {profileData.bannerUrl && (
            // eslint-disable-next-line @next/next/no-img-element
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
            {/* Avatar: User adjustment #2: Do NOT render a static online dot on other users' profiles */}
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
                    onClick={() =>
                      setRoadmapMessage(
                        'Direct messaging unlocks in Phase 2 with real-time Socket.IO!',
                      )
                    }
                    className="gap-1.5"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Message</span>
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      setRoadmapMessage(
                        'Social graph and one-way following will arrive in Phase 6.',
                      )
                    }
                    className="gap-1.5"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Follow</span>
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

            {/* Real Metrics Bar: Honest Zero Values from DB */}
            <div className="flex items-center gap-6 mt-5 pt-4 border-t border-border">
              <div className="flex items-center gap-1.5 text-xs">
                <span className="font-bold text-primary">
                  {profileData.counts.posts}
                </span>
                <span className="text-muted">Posts</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <span className="font-bold text-primary">
                  {profileData.counts.followers}
                </span>
                <span className="text-muted">Followers</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <span className="font-bold text-primary">
                  {profileData.counts.following}
                </span>
                <span className="text-muted">Following</span>
              </div>
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
            <Image className="w-4 h-4" />
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
          <button
            onClick={() => setActiveTab('saved')}
            className={`flex items-center gap-2 px-5 py-3 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'saved'
                ? 'border-accent text-accent-bright'
                : 'border-transparent text-secondary hover:text-primary'
            }`}
          >
            <Bookmark className="w-4 h-4" />
            <span>Saved</span>
          </button>
        </div>

        {/* Tab Content: Honest Empty States */}
        <div className="p-12 text-center bg-surface border border-border rounded-2xl">
          {activeTab === 'posts' && (
            <div className="flex flex-col items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-elevated flex items-center justify-center text-muted">
                <Image className="w-5 h-5" />
              </div>
              <p className="text-sm font-medium text-primary">No posts yet</p>
              <p className="text-xs text-muted max-w-sm">
                Social feeds, image posts, and community discussions unlock in Phase 6.
              </p>
            </div>
          )}
          {activeTab === 'stories' && (
            <div className="flex flex-col items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-elevated flex items-center justify-center text-muted">
                <Layers className="w-5 h-5" />
              </div>
              <p className="text-sm font-medium text-primary">No active stories</p>
              <p className="text-xs text-muted max-w-sm">
                24-hour ephemeral stories unlock in Phase 6.
              </p>
            </div>
          )}
          {activeTab === 'saved' && (
            <div className="flex flex-col items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-elevated flex items-center justify-center text-muted">
                <Bookmark className="w-5 h-5" />
              </div>
              <p className="text-sm font-medium text-primary">Nothing saved</p>
              <p className="text-xs text-muted max-w-sm">
                Bookmark posts and messages when messaging and feed features go live.
              </p>
            </div>
          )}
        </div>
      </div>

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
