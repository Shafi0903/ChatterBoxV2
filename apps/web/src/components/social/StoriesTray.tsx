'use client';

import React, { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { useSocialStore } from '@/stores/social.store';
import { CreateStoryModal } from './CreateStoryModal';
import { StoryViewerModal } from './StoryViewerModal';

export function StoriesTray() {
  const { user, profile } = useAuthStore();
  const {
    storyGroups,
    isLoadingStories,
    fetchStories,
  } = useSocialStore();

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [viewerGroupIdx, setViewerGroupIdx] = useState<number | null>(null);
  const [storiesError, setStoriesError] = useState<string | null>(null);

  useEffect(() => {
    setStoriesError(null);
    fetchStories().catch((err: any) => {
      setStoriesError(err?.message || 'Failed to load stories.');
    });
  }, [fetchStories]);

  // Find user's own active stories
  const myGroupIndex = storyGroups.findIndex((g) => g.author.id === user?.id);
  const myGroup = myGroupIndex !== -1 ? storyGroups[myGroupIndex] : null;

  return (
    <>
      <div className="w-full bg-surface border border-border rounded-2xl p-4 mb-6 shadow-xs">
        <div className="flex items-center gap-4 overflow-x-auto no-scrollbar py-1">
          {/* Create / My Story Slot */}
          <div className="flex flex-col items-center gap-1.5 flex-shrink-0 cursor-pointer group">
            <div className="relative">
              <div
                onClick={() => {
                  if (myGroup && myGroup.stories.length > 0) {
                    setViewerGroupIdx(myGroupIndex);
                  } else {
                    setCreateModalOpen(true);
                  }
                }}
                className={`w-16 h-16 rounded-full p-0.5 transition-transform group-hover:scale-105 ${
                  myGroup && myGroup.stories.length > 0
                    ? myGroup.hasUnviewed
                      ? 'bg-gradient-to-tr from-cyan-400 via-indigo-500 to-fuchsia-500 shadow-[0_0_12px_rgba(6,182,212,0.5)]'
                      : 'bg-elevated'
                    : 'border-2 border-dashed border-border hover:border-accent'
                }`}
              >
                <div className="w-full h-full rounded-full bg-elevated overflow-hidden flex items-center justify-center">
                  {profile?.avatarUrl ? (
                    <img
                      src={profile.avatarUrl}
                      alt={profile.displayName || user?.username}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-primary font-bold text-base">
                      {(profile?.displayName || user?.username || 'U').charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
              </div>

              {/* Add Story Plus Badge */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setCreateModalOpen(true);
                }}
                className="absolute bottom-0 right-0 w-5 h-5 rounded-full bg-accent text-white flex items-center justify-center shadow-md hover:bg-accent-bright hover:scale-110 transition-all border-2 border-surface"
                title="Create Story"
              >
                <Plus className="w-3.5 h-3.5 stroke-[3]" />
              </button>
            </div>
            <span className="text-xs text-primary font-medium max-w-[64px] truncate text-center">
              Your Story
            </span>
          </div>

          {/* Other User Stories */}
          {storiesError ? (
            <div className="flex items-center gap-2 text-xs text-status-busy px-2">
              <span>{storiesError}</span>
              <button
                type="button"
                onClick={() => {
                  setStoriesError(null);
                  fetchStories().catch((err: any) => {
                    setStoriesError(err?.message || 'Failed to load stories.');
                  });
                }}
                className="underline font-semibold"
              >
                Retry
              </button>
            </div>
          ) : isLoadingStories ? (
            // Skeletons
            [...Array(4)].map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-1.5 flex-shrink-0 animate-pulse">
                <div className="w-16 h-16 rounded-full bg-elevated" />
                <div className="w-12 h-2.5 bg-elevated rounded-full" />
              </div>
            ))
          ) : (
            storyGroups
              .map((group, idx) => ({ group, originalIdx: idx }))
              .filter(({ group }) => group.author.id !== user?.id)
              .map(({ group, originalIdx }) => (
                <div
                  key={group.author.id}
                  onClick={() => setViewerGroupIdx(originalIdx)}
                  className="flex flex-col items-center gap-1.5 flex-shrink-0 cursor-pointer group"
                >
                  <div
                    className={`w-16 h-16 rounded-full p-0.5 transition-transform group-hover:scale-105 ${
                      group.hasUnviewed
                        ? 'bg-gradient-to-tr from-cyan-400 via-indigo-500 to-fuchsia-500 shadow-[0_0_12px_rgba(6,182,212,0.4)] animate-pulse'
                        : 'bg-elevated opacity-75'
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
                        <span className="text-primary font-bold text-base">
                          {(group.author.displayName || group.author.username).charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-primary font-medium max-w-[68px] truncate text-center">
                    {group.author.displayName || group.author.username}
                  </span>
                </div>
              ))
          )}
        </div>
      </div>

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
    </>
  );
}
