'use client';

import React, { useEffect } from 'react';
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

  const posts = postsByTab[activeTab] || [];
  const hasMore = hasMoreByTab[activeTab] || false;

  useEffect(() => {
    fetchFeed(activeTab);
  }, [activeTab, fetchFeed]);

  return (
    <div className="max-w-2xl mx-auto py-2 pb-16">
      {/* 24-Hour Stories Bar */}
      <StoriesTray />

      {/* Post Composer */}
      <PostComposer />

      {/* Feed Tabs: Following vs Explore */}
      <div className="flex items-center justify-between border-b border-zinc-800/80 mb-5 pb-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('following')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'following'
                ? 'bg-zinc-800 text-white shadow-sm'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900/50'
            }`}
          >
            <Users className="w-4 h-4 text-indigo-400" />
            <span>Following</span>
          </button>

          <button
            onClick={() => setActiveTab('explore')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'explore'
                ? 'bg-zinc-800 text-white shadow-sm'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900/50'
            }`}
          >
            <Compass className="w-4 h-4 text-cyan-400" />
            <span>Explore</span>
          </button>
        </div>

        <button
          onClick={() => fetchFeed(activeTab, true)}
          disabled={isLoadingFeed}
          className="p-2 text-zinc-500 hover:text-zinc-300 rounded-lg transition-colors"
          title="Refresh feed"
        >
          <RefreshCw className={`w-4 h-4 ${isLoadingFeed ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Feed Posts List */}
      <div className="space-y-4">
        {isLoadingFeed && posts.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-zinc-500 text-xs">Loading feed...</p>
          </div>
        ) : posts.length === 0 ? (
          <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-2xl p-12 text-center">
            <div className="w-12 h-12 rounded-full bg-zinc-900 flex items-center justify-center text-zinc-500 mx-auto mb-3">
              {activeTab === 'following' ? (
                <Users className="w-6 h-6 text-indigo-400" />
              ) : (
                <Compass className="w-6 h-6 text-cyan-400" />
              )}
            </div>
            <h3 className="text-sm font-semibold text-zinc-200">
              {activeTab === 'following' ? 'No posts from people you follow' : 'No posts yet'}
            </h3>
            <p className="text-xs text-zinc-500 mt-1 max-w-sm mx-auto">
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
                  className="px-5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white text-xs font-semibold transition-all disabled:opacity-50"
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
