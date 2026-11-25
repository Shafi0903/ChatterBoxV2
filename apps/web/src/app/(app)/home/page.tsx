'use client';

import React, { useEffect, useState } from 'react';
import { StoriesTray } from '@/components/social/StoriesTray';
import { PostComposer } from '@/components/social/PostComposer';
import { PostCard } from '@/components/social/PostCard';
import { useSocialStore } from '@/stores/social.store';
import { Users, Compass, RefreshCw } from 'lucide-react';

export default function HomePage() {
  const {
    activeTab,
    setActiveTab,
    postsByTab,
    hasMoreByTab,
    isLoadingFeed,
    isLoadingMore,
    fetchFeed,
    fetchOlderFeed,
  } = useSocialStore();

  const [feedError, setFeedError] = useState<string | null>(null);
  const posts = postsByTab[activeTab] || [];
  const hasMore = hasMoreByTab[activeTab] || false;

  useEffect(() => {
    setFeedError(null);
    fetchFeed(activeTab).catch((err: any) => {
      setFeedError(err?.message || 'Failed to load feed. Please try again.');
    });
  }, [activeTab, fetchFeed]);

  return (
    <div className="max-w-2xl mx-auto py-2 pb-16">
      {/* 24-Hour Stories Bar */}
      <StoriesTray />

      {/* Post Composer */}
      <PostComposer />

      {/* Feed Tabs: Following vs Explore */}
      <div className="flex items-center justify-between border-b border-border mb-5 pb-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('following')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'following'
                ? 'bg-elevated text-primary shadow-sm border border-border'
                : 'text-secondary hover:text-primary hover:bg-surface-hover'
            }`}
          >
            <Users className="w-4 h-4 text-accent-bright" />
            <span>Following</span>
          </button>

          <button
            onClick={() => setActiveTab('explore')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'explore'
                ? 'bg-elevated text-primary shadow-sm border border-border'
                : 'text-secondary hover:text-primary hover:bg-surface-hover'
            }`}
          >
            <Compass className="w-4 h-4 text-cyan-400" />
            <span>Explore</span>
          </button>
        </div>

        <button
          onClick={() => {
            setFeedError(null);
            fetchFeed(activeTab, true).catch((err: any) => {
              setFeedError(err?.message || 'Failed to refresh feed.');
            });
          }}
          disabled={isLoadingFeed}
          className="p-2 text-secondary hover:text-primary rounded-lg hover:bg-surface-hover transition-colors"
          title="Refresh feed"
        >
          <RefreshCw className={`w-4 h-4 ${isLoadingFeed ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Feed Error Banner */}
      {feedError && (
        <div className="mb-4 p-3.5 rounded-2xl bg-status-busy/10 border border-status-busy/25 text-xs text-status-busy flex items-center justify-between gap-2">
          <span>{feedError}</span>
          <button
            type="button"
            onClick={() => {
              setFeedError(null);
              fetchFeed(activeTab, true).catch((err: any) => {
                setFeedError(err?.message || 'Failed to load feed.');
              });
            }}
            className="font-semibold underline shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {/* Feed Posts List */}
      <div className="space-y-4">
        {isLoadingFeed && posts.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            <p className="text-secondary text-xs">Loading feed...</p>
          </div>
        ) : posts.length === 0 ? (
          <div className="bg-surface border border-border rounded-2xl p-12 text-center shadow-xs">
            <div className="w-12 h-12 rounded-full bg-elevated border border-border flex items-center justify-center mx-auto mb-3">
              {activeTab === 'following' ? (
                <Users className="w-6 h-6 text-accent-bright" />
              ) : (
                <Compass className="w-6 h-6 text-cyan-400" />
              )}
            </div>
            <h3 className="text-sm font-semibold text-primary">
              {activeTab === 'following' ? 'No posts from people you follow' : 'No posts yet'}
            </h3>
            <p className="text-xs text-secondary mt-1.5 max-w-sm mx-auto leading-relaxed">
              {activeTab === 'following'
                ? 'Follow other users or switch to the Explore tab to discover posts from the community.'
                : 'Be the first to share something with the world above!'}
            </p>
          </div>
        ) : (
          <>
            {posts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}

            {hasMore && (
              <div className="pt-4 text-center">
                <button
                  onClick={() => fetchOlderFeed(activeTab)}
                  disabled={isLoadingMore}
                  className="px-5 py-2.5 rounded-xl bg-surface border border-border hover:bg-surface-hover text-secondary hover:text-primary text-xs font-semibold transition-all disabled:opacity-50 shadow-xs"
                >
                  {isLoadingMore ? 'Loading more...' : 'Load more posts'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
