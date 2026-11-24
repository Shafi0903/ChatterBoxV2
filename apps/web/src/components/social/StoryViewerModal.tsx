'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Eye,
  Trash2,
  Volume2,
  VolumeX,
  Clock,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import { useSocialStore } from '@/stores/social.store';
import type { AuthorStoriesGroup, StoryItem, StoryViewerItem } from '@chatterbox/shared';

interface StoryViewerModalProps {
  initialGroupIndex?: number;
  onClose: () => void;
}

export function StoryViewerModal({ initialGroupIndex = 0, onClose }: StoryViewerModalProps) {
  const { user } = useAuthStore();
  const { storyGroups, deleteStoryLocal, markStoryViewedLocal } = useSocialStore();

  const [currentGroupIdx, setCurrentGroupIdx] = useState(initialGroupIndex);
  const [currentStoryIdx, setCurrentStoryIdx] = useState(0);
  const [progress, setProgress] = useState(0); // 0 to 100
  const [isPaused, setIsPaused] = useState(false);
  const [mediaLoading, setMediaLoading] = useState(true);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(true);
  const [showViewersSheet, setShowViewersSheet] = useState(false);
  const [viewers, setViewers] = useState<StoryViewerItem[]>([]);
  const [viewersTotal, setViewersTotal] = useState(0);
  const [loadingViewers, setLoadingViewers] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const group: AuthorStoriesGroup | undefined = storyGroups[currentGroupIdx];
  const story: StoryItem | undefined = group?.stories[currentStoryIdx];
  const isAuthor = user?.id === group?.author?.id;

  // Clean navigation
  const nextStory = useCallback(() => {
    if (!group) return;
    if (currentStoryIdx < group.stories.length - 1) {
      setCurrentStoryIdx((prev) => prev + 1);
      setProgress(0);
    } else if (currentGroupIdx < storyGroups.length - 1) {
      setCurrentGroupIdx((prev) => prev + 1);
      setCurrentStoryIdx(0);
      setProgress(0);
    } else {
      onClose();
    }
  }, [group, currentStoryIdx, currentGroupIdx, storyGroups.length, onClose]);

  const prevStory = useCallback(() => {
    if (currentStoryIdx > 0) {
      setCurrentStoryIdx((prev) => prev - 1);
      setProgress(0);
    } else if (currentGroupIdx > 0) {
      setCurrentGroupIdx((prev) => prev - 1);
      const prevGroup = storyGroups[currentGroupIdx - 1];
      setCurrentStoryIdx(prevGroup ? prevGroup.stories.length - 1 : 0);
      setProgress(0);
    }
  }, [currentStoryIdx, currentGroupIdx, storyGroups]);

  // Handle media URL resolution
  useEffect(() => {
    let active = true;
    if (!story) return;

    setProgress(0);
    setShowViewersSheet(false);

    if (story.attachment) {
      setMediaLoading(true);
      api
        .getMediaDownloadUrl(story.attachment.id)
        .then((res) => {
          if (active) {
            setMediaUrl(res.downloadUrl);
            setMediaLoading(false);
          }
        })
        .catch((err) => {
          console.error('Failed to load story media download url', err);
          if (active) {
            setMediaUrl(null);
            setMediaLoading(false);
          }
        });
    } else {
      setMediaUrl(null);
      setMediaLoading(false);
    }

    // Mark viewed if not already
    if (!story.hasViewed && user?.id !== group?.author?.id) {
      api.markStoryViewed(story.id).catch(console.error);
      markStoryViewedLocal(story.id);
    }

    return () => {
      active = false;
    };
  }, [story, user?.id, group?.author?.id, markStoryViewedLocal]);

  // Timer logic for image and text stories (5 seconds)
  useEffect(() => {
    if (!story || mediaLoading || isPaused || showViewersSheet) {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
      return;
    }

    // If it's a video, progression is handled by onTimeUpdate of the video element
    const isVideo = story.attachment?.mimeType.startsWith('video/');
    if (isVideo) {
      if (videoRef.current) {
        videoRef.current.play().catch(() => {});
      }
      return;
    }

    const duration = 5000; // 5 seconds
    const intervalTime = 50; // update every 50ms
    const step = (intervalTime / duration) * 100;

    progressIntervalRef.current = setInterval(() => {
      setProgress((prev) => {
        if (prev + step >= 100) {
          clearInterval(progressIntervalRef.current!);
          nextStory();
          return 100;
        }
        return prev + step;
      });
    }, intervalTime);

    return () => {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, [story, mediaLoading, isPaused, showViewersSheet, nextStory]);

  // Video time update handler
  const handleVideoTimeUpdate = () => {
    if (!videoRef.current) return;
    const { currentTime, duration } = videoRef.current;
    if (duration > 0) {
      setProgress((currentTime / duration) * 100);
    }
  };

  // Fetch viewers list when sheet opens
  useEffect(() => {
    if (!showViewersSheet || !story || !isAuthor) return;

    setLoadingViewers(true);
    api
      .getStoryViews(story.id)
      .then((res) => {
        setViewers(res.data);
        setViewersTotal(res.meta?.totalCount ?? res.data.length);
      })
      .catch((err) => {
        console.error('Failed to load story viewers', err);
      })
      .finally(() => {
        setLoadingViewers(false);
      });
  }, [showViewersSheet, story, isAuthor]);

  // Delete story handler
  const handleDeleteStory = async () => {
    if (!story || !isAuthor || isDeleting) return;
    if (!confirm('Are you sure you want to delete this story?')) return;

    try {
      setIsDeleting(true);
      await deleteStoryLocal(story.id);

      if (group.stories.length <= 1) {
        if (storyGroups.length <= 1) {
          onClose();
        } else if (currentGroupIdx < storyGroups.length - 1) {
          setCurrentStoryIdx(0);
        } else {
          setCurrentGroupIdx((prev) => Math.max(0, prev - 1));
          setCurrentStoryIdx(0);
        }
      } else {
        if (currentStoryIdx >= group.stories.length - 1) {
          setCurrentStoryIdx((prev) => Math.max(0, prev - 1));
        }
      }
    } catch (err: any) {
      alert(err.message || 'Failed to delete story');
    } finally {
      setIsDeleting(false);
    }
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') nextStory();
      if (e.key === 'ArrowLeft') prevStory();
      if (e.key === 'Escape') onClose();
      if (e.key === ' ') {
        e.preventDefault();
        setIsPaused((p) => !p);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nextStory, prevStory, onClose]);

  if (!group || !story) return null;

  const isVideo = story.attachment?.mimeType.startsWith('video/');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-md">
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-50 p-2 text-zinc-400 hover:text-white rounded-full bg-zinc-900/60 transition-colors"
        aria-label="Close stories"
      >
        <X className="w-6 h-6" />
      </button>

      {/* Prev / Next Nav Buttons for Desktop */}
      <button
        onClick={prevStory}
        disabled={currentGroupIdx === 0 && currentStoryIdx === 0}
        className="hidden md:flex absolute left-4 z-40 p-3 text-zinc-300 hover:text-white bg-zinc-900/60 hover:bg-zinc-800 rounded-full transition-all disabled:opacity-30 disabled:pointer-events-none"
        aria-label="Previous story"
      >
        <ChevronLeft className="w-6 h-6" />
      </button>

      <button
        onClick={nextStory}
        className="hidden md:flex absolute right-4 z-40 p-3 text-zinc-300 hover:text-white bg-zinc-900/60 hover:bg-zinc-800 rounded-full transition-all"
        aria-label="Next story"
      >
        <ChevronRight className="w-6 h-6" />
      </button>

      {/* Main Story Container (9:16 aspect ratio box) */}
      <div
        className="relative w-full max-w-[420px] h-[85vh] max-h-[800px] bg-zinc-950 rounded-2xl overflow-hidden shadow-2xl flex flex-col border border-zinc-800 select-none"
        onMouseDown={() => setIsPaused(true)}
        onMouseUp={() => setIsPaused(false)}
        onTouchStart={() => setIsPaused(true)}
        onTouchEnd={() => setIsPaused(false)}
      >
        {/* Top Progress Bars */}
        <div className="absolute top-3 inset-x-3 z-30 flex gap-1.5 pointer-events-none">
          {group.stories.map((st, idx) => {
            let width = '0%';
            if (idx < currentStoryIdx) width = '100%';
            else if (idx === currentStoryIdx) width = `${progress}%`;

            return (
              <div
                key={st.id}
                className="flex-1 h-1 bg-white/20 rounded-full overflow-hidden"
              >
                <div
                  className="h-full bg-white transition-all duration-75 ease-linear rounded-full"
                  style={{ width }}
                />
              </div>
            );
          })}
        </div>

        {/* Top Header: Author info & controls */}
        <div className="absolute top-6 inset-x-3 z-30 flex items-center justify-between pointer-events-auto">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center font-bold text-white text-sm shadow">
              {group.author.avatarUrl ? (
                <img
                  src={group.author.avatarUrl}
                  alt={group.author.displayName || group.author.username}
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                (group.author.displayName || group.author.username).charAt(0).toUpperCase()
              )}
            </div>
            <div className="flex flex-col">
              <span className="text-white text-sm font-semibold leading-tight drop-shadow">
                {group.author.displayName || group.author.username}
              </span>
              <span className="text-zinc-300 text-xs flex items-center gap-1 drop-shadow">
                <Clock className="w-3 h-3" />
                {new Date(story.createdAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isVideo && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsMuted((m) => !m);
                }}
                className="p-1.5 text-white/90 hover:text-white bg-black/40 rounded-full backdrop-blur-sm"
              >
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
            )}

            {isAuthor && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteStory();
                }}
                disabled={isDeleting}
                className="p-1.5 text-red-400 hover:text-red-300 bg-black/40 rounded-full backdrop-blur-sm"
                title="Delete story"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Story Canvas / Media Viewport */}
        <div className="relative flex-1 w-full h-full flex items-center justify-center overflow-hidden">
          {!story.attachment ? (
            <div
              className={`w-full h-full p-8 flex items-center justify-center text-center ${
                story.backgroundColor || 'bg-gradient-to-br from-indigo-900 to-purple-900'
              }`}
            >
              <p className="text-white text-xl md:text-2xl font-bold break-words max-w-full drop-shadow-md">
                {story.caption}
              </p>
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-black relative">
              {mediaLoading && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
                </div>
              )}

              {mediaUrl && (
                isVideo ? (
                  <video
                    ref={videoRef}
                    src={mediaUrl}
                    className="w-full h-full object-contain"
                    playsInline
                    autoPlay
                    muted={isMuted}
                    onTimeUpdate={handleVideoTimeUpdate}
                    onEnded={nextStory}
                    onWaiting={() => setIsPaused(true)}
                    onPlaying={() => setIsPaused(false)}
                  />
                ) : (
                  <img
                    src={mediaUrl}
                    alt="Story"
                    className="w-full h-full object-contain"
                    onLoad={() => setMediaLoading(false)}
                  />
                )
              )}

              {story.caption && (
                <div className="absolute bottom-16 inset-x-4 bg-black/60 backdrop-blur-sm p-3 rounded-xl border border-white/10 text-white text-sm text-center">
                  {story.caption}
                </div>
              )}
            </div>
          )}

          {/* Left/Right click tap areas for navigation */}
          <div
            className="absolute inset-y-0 left-0 w-1/3 z-20 cursor-pointer"
            onClick={prevStory}
          />
          <div
            className="absolute inset-y-0 right-0 w-1/3 z-20 cursor-pointer"
            onClick={nextStory}
          />
        </div>

        {/* Bottom Author Bar (Seen by X viewers) */}
        {isAuthor && (
          <div className="absolute bottom-3 inset-x-3 z-30 flex justify-center">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowViewersSheet(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/60 hover:bg-black/80 backdrop-blur-md text-white text-xs font-medium border border-white/10 transition-colors shadow-lg"
            >
              <Eye className="w-3.5 h-3.5 text-cyan-400" />
              <span>Seen by {story.viewCount ?? 0}</span>
            </button>
          </div>
        )}

        {/* Viewers Bottom Sheet */}
        {showViewersSheet && isAuthor && (
          <div
            className="absolute inset-x-0 bottom-0 max-h-[60%] z-40 bg-zinc-900/95 border-t border-zinc-800 rounded-t-2xl p-4 flex flex-col shadow-2xl backdrop-blur-md animate-in slide-in-from-bottom-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <span className="text-sm font-semibold text-white flex items-center gap-2">
                <Eye className="w-4 h-4 text-cyan-400" />
                Viewers ({viewersTotal})
              </span>
              <button
                onClick={() => setShowViewersSheet(false)}
                className="text-zinc-400 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto mt-2 space-y-2.5 max-h-60 pr-1">
              {loadingViewers ? (
                <div className="flex justify-center py-6">
                  <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : viewers.length === 0 ? (
                <p className="text-zinc-500 text-xs text-center py-6">No views yet</p>
              ) : (
                viewers.map((item) => (
                  <div
                    key={item.viewerId}
                    className="flex items-center justify-between py-1"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-zinc-800 flex items-center justify-center font-bold text-white text-xs">
                        {item.viewer.avatarUrl ? (
                          <img
                            src={item.viewer.avatarUrl}
                            alt={item.viewer.displayName || item.viewer.username}
                            className="w-full h-full rounded-full object-cover"
                          />
                        ) : (
                          (item.viewer.displayName || item.viewer.username).charAt(0).toUpperCase()
                        )}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-zinc-200 text-xs font-medium">
                          {item.viewer.displayName || item.viewer.username}
                        </span>
                        <span className="text-zinc-500 text-[10px]">
                          @{item.viewer.username}
                        </span>
                      </div>
                    </div>
                    <span className="text-zinc-500 text-[10px]">
                      {new Date(item.viewedAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
