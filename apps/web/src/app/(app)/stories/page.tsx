'use client';

import React, { useState, useEffect } from 'react';
import NextLink from 'next/link';
import { StoriesTray } from '@/components/social/StoriesTray';
import { CreateStoryModal } from '@/components/social/CreateStoryModal';
import { StoryViewerModal } from '@/components/social/StoryViewerModal';
import { useSocialStore } from '@/stores/social.store';
import { useAuthStore } from '@/stores/auth.store';
import { Button } from '@/components/ui/Button';
import {
  Sparkles,
  Plus,
  Clock,
  Eye,
  RefreshCw,
  Image as ImageIcon,
  Layers,
  ChevronRight,
} from 'lucide-react';

export default function StoriesPage() {
  const { user, profile } = useAuthStore();
  const { storyGroups, isLoadingStories, fetchStories } = useSocialStore();

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [viewerGroupIdx, setViewerGroupIdx] = useState<number | null>(null);
  const [storiesError, setStoriesError] = useState<string | null>(null);

  useEffect(() => {
    setStoriesError(null);
    fetchStories().catch((err: any) => {
      setStoriesError(err?.message || 'Failed to load stories.');
    });
  }, [fetchStories]);

  // Find caller's own active stories group
  const myGroupIndex = storyGroups.findIndex((g) => g.author.id === user?.id);
  const myGroup = myGroupIndex !== -1 ? storyGroups[myGroupIndex] : null;

  // Followed authors with active stories
  const followedGroups = storyGroups
    .map((group, idx) => ({ group, originalIdx: idx }))
    .filter(({ group }) => group.author.id !== user?.id);

  return (
    <div className="max-w-4xl mx-auto py-4 px-2 pb-16 space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-primary flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-accent-bright" />
              <span>Ephemeral Stories</span>
            </h1>
          </div>
          <p className="text-xs text-secondary mt-1 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-muted" />
            <span>Disappearing photos, videos, and thoughts that vanish after 24 hours.</span>
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => {
              setStoriesError(null);
              fetchStories().catch((err: any) => {
                setStoriesError(err?.message || 'Failed to load stories.');
              });
            }}
            disabled={isLoadingStories}
            className="p-2.5 rounded-xl bg-surface border border-border text-secondary hover:text-primary hover:bg-surface-hover transition-colors shadow-xs"
            title="Refresh stories"
          >
            <RefreshCw className={`w-4 h-4 ${isLoadingStories ? 'animate-spin' : ''}`} />
          </button>

          <Button
            onClick={() => setCreateModalOpen(true)}
            size="md"
            className="flex items-center gap-2 shadow-neon"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Add Story</span>
          </Button>
        </div>
      </div>

      {/* Horizontal Interactive Stories Tray */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-primary">Active Story Rings</h2>
        <StoriesTray />
      </section>

      {/* Grid of Active Story Cards */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-primary">Explore Stories</h2>
          <span className="text-xs text-secondary">
            {storyGroups.length} {storyGroups.length === 1 ? 'author' : 'authors'} active
          </span>
        </div>

        {storiesError && (
          <div className="p-3.5 rounded-2xl bg-status-busy/10 border border-status-busy/25 text-xs text-status-busy flex items-center justify-between gap-2">
            <span>{storiesError}</span>
            <button
              type="button"
              onClick={() => {
                setStoriesError(null);
                fetchStories().catch((err: any) => {
                  setStoriesError(err?.message || 'Failed to load stories.');
                });
              }}
              className="font-semibold underline shrink-0"
            >
              Retry
            </button>
          </div>
        )}

        {isLoadingStories ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="aspect-[9/16] rounded-2xl bg-surface border border-border animate-pulse p-4 flex flex-col justify-between"
              >
                <div className="w-10 h-10 rounded-full bg-elevated" />
                <div className="space-y-2">
                  <div className="w-3/4 h-3 bg-elevated rounded-full" />
                  <div className="w-1/2 h-2.5 bg-elevated rounded-full" />
                </div>
              </div>
            ))}
          </div>
        ) : storyGroups.length === 0 ? (
          <div className="bg-surface border border-border rounded-2xl p-12 text-center shadow-xs">
            <div className="w-12 h-12 rounded-full bg-elevated border border-border flex items-center justify-center text-accent-bright mx-auto mb-3">
              <Layers className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-primary">No Active Stories Right Now</h3>
            <p className="text-xs text-secondary mt-1.5 max-w-sm mx-auto leading-relaxed">
              Stories shared by you and people you follow appear here for 24 hours. Be the first to share a moment today!
            </p>
            <div className="mt-5">
              <Button onClick={() => setCreateModalOpen(true)} size="md">
                <Plus className="w-4 h-4 stroke-[2.5] mr-1.5" />
                <span>Create Your Story</span>
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {/* My Story Card */}
            {myGroup && (
              <div
                onClick={() => setViewerGroupIdx(myGroupIndex)}
                className="group relative aspect-[9/16] rounded-2xl overflow-hidden cursor-pointer border-2 border-accent/40 shadow-xs hover:shadow-neon hover:scale-[1.02] transition-all bg-elevated"
              >
                {/* Background Gradient / Presentation */}
                <div
                  className={`w-full h-full bg-gradient-to-br ${
                    myGroup.stories[0]?.backgroundColor || 'from-purple-900 via-indigo-950 to-black'
                  } flex items-center justify-center p-4 text-center`}
                >
                  <p className="text-xs text-white font-medium line-clamp-4">
                    {myGroup.stories[0]?.caption || (myGroup.stories[0]?.attachment ? 'Photo / Video Story' : 'Your Story')}
                  </p>
                </div>

                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none" />

                {/* Card Top Pill */}
                <div className="absolute top-3 left-3 right-3 flex items-center justify-between text-white text-[11px] font-semibold drop-shadow">
                  <span className="px-2 py-0.5 rounded-full bg-accent/80 backdrop-blur-xs">
                    Your Story
                  </span>
                  <span className="flex items-center gap-1 opacity-90">
                    <Eye className="w-3.5 h-3.5" />
                    <span>{myGroup.stories.length}</span>
                  </span>
                </div>

                {/* Card Bottom Meta */}
                <div className="absolute bottom-3 left-3 right-3 text-white">
                  <p className="text-xs font-semibold drop-shadow truncate">
                    {profile?.displayName || user?.username}
                  </p>
                  <p className="text-[10px] text-white/80 drop-shadow flex items-center gap-1 mt-0.5">
                    <Clock className="w-3 h-3" />
                    <span>{myGroup.stories.length} active</span>
                  </p>
                </div>
              </div>
            )}

            {/* Followed Authors' Story Cards */}
            {followedGroups.map(({ group, originalIdx }) => {
              const latestStory = group.stories[0];

              return (
                <div
                  key={group.author.id}
                  onClick={() => setViewerGroupIdx(originalIdx)}
                  className={`group relative aspect-[9/16] rounded-2xl overflow-hidden cursor-pointer shadow-xs hover:scale-[1.02] transition-all bg-elevated ${
                    group.hasUnviewed
                      ? 'border-2 border-accent shadow-neon'
                      : 'border border-border opacity-90 hover:opacity-100'
                  }`}
                >
                  {/* Background Gradient / Presentation */}
                  <div
                    className={`w-full h-full bg-gradient-to-br ${
                      latestStory?.backgroundColor || 'from-indigo-900 via-purple-950 to-black'
                    } flex items-center justify-center p-4 text-center`}
                  >
                    <p className="text-xs text-white font-medium line-clamp-4">
                      {latestStory?.caption || (latestStory?.attachment ? 'Photo / Video Story' : 'Story')}
                    </p>
                  </div>

                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none" />

                  {/* Card Top Avatar Ring */}
                  <div className="absolute top-3 left-3">
                    <div
                      className={`w-9 h-9 rounded-full p-0.5 ${
                        group.hasUnviewed
                          ? 'bg-gradient-to-tr from-cyan-400 via-indigo-500 to-fuchsia-500 shadow-md'
                          : 'bg-white/40'
                      }`}
                    >
                      <div className="w-full h-full rounded-full bg-elevated overflow-hidden flex items-center justify-center">
                        {group.author.avatarUrl ? (
                          <img
                            src={group.author.avatarUrl}
                            alt={group.author.displayName || group.author.username}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-primary text-xs font-bold">
                            {(group.author.displayName || group.author.username)
                              .charAt(0)
                              .toUpperCase()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Card Bottom Meta */}
                  <div className="absolute bottom-3 left-3 right-3 text-white">
                    <p className="text-xs font-semibold drop-shadow truncate">
                      {group.author.displayName || group.author.username}
                    </p>
                    <p className="text-[10px] text-white/80 drop-shadow flex items-center gap-1 mt-0.5">
                      <span>@{group.author.username}</span>
                      <span>•</span>
                      <span>{group.stories.length} stories</span>
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Modals */}
      <CreateStoryModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
      />

      {viewerGroupIdx !== null && (
        <StoryViewerModal
          initialGroupIndex={viewerGroupIdx}
          onClose={() => setViewerGroupIdx(null)}
        />
      )}
    </div>
  );
}
