'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { X, UserPlus, UserCheck, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import type { FollowUserSummary } from '@chatterbox/shared';

interface FollowListModalProps {
  userId: string;
  type: 'followers' | 'following';
  onClose: () => void;
  onFollowCountChange?: () => void;
}

export function FollowListModal({
  userId,
  type: initialType,
  onClose,
  onFollowCountChange,
}: FollowListModalProps) {
  const { user: currentUser } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'followers' | 'following'>(initialType);
  const [items, setItems] = useState<FollowUserSummary[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [actionLoadingIds, setActionLoadingIds] = useState<Record<string, boolean>>({});

  const fetchUsers = async (cursor?: string, currentTab = activeTab) => {
    try {
      setLoading(true);
      const res =
        currentTab === 'followers'
          ? await api.getFollowers(userId, cursor, 20)
          : await api.getFollowing(userId, cursor, 20);

      if (cursor) {
        setItems((prev) => [...prev, ...res.data]);
      } else {
        setItems(res.data);
      }
      setNextCursor(res.meta?.nextCursor ?? null);
      setHasMore(res.meta?.hasMore ?? false);
    } catch (err: any) {
      console.error(`Failed to load ${currentTab}`, err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setSearchQuery('');
    setItems([]);
    setNextCursor(null);
    setHasMore(false);
    fetchUsers(undefined, activeTab);
  }, [userId, activeTab]);

  const handleToggleFollow = async (item: FollowUserSummary) => {
    if (actionLoadingIds[item.id]) return;

    const previousState = item.isFollowing;
    // Optimistic toggle
    setItems((prev) =>
      prev.map((u) => (u.id === item.id ? { ...u, isFollowing: !previousState } : u))
    );
    setActionLoadingIds((prev) => ({ ...prev, [item.id]: true }));

    try {
      if (previousState) {
        await api.unfollowUser(item.id);
      } else {
        await api.followUser(item.id);
      }
      onFollowCountChange?.();
    } catch (err) {
      // Revert optimistic toggle
      setItems((prev) =>
        prev.map((u) => (u.id === item.id ? { ...u, isFollowing: previousState } : u))
      );
      console.error('Failed to toggle follow status', err);
    } finally {
      setActionLoadingIds((prev) => ({ ...prev, [item.id]: false }));
    }
  };

  // Instant in-modal search filter
  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return items;
    return items.filter(
      (u) =>
        u.username.toLowerCase().includes(query) ||
        u.displayName.toLowerCase().includes(query) ||
        (u.bio && u.bio.toLowerCase().includes(query)),
    );
  }, [items, searchQuery]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
      <div className="bg-surface border border-border rounded-2xl w-full max-w-md max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header with Dual Tab Switcher */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div className="flex items-center gap-1 bg-elevated/80 p-1 rounded-xl border border-border/60">
            <button
              onClick={() => setActiveTab('followers')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'followers'
                  ? 'bg-surface text-primary shadow-xs'
                  : 'text-secondary hover:text-primary'
              }`}
            >
              Followers
            </button>
            <button
              onClick={() => setActiveTab('following')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'following'
                  ? 'bg-surface text-primary shadow-xs'
                  : 'text-secondary hover:text-primary'
              }`}
            >
              Following
            </button>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-secondary hover:text-primary hover:bg-surface-hover transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Search Bar */}
        <div className="px-4 py-2.5 border-b border-border/70 bg-surface/50">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-muted absolute left-3 pointer-events-none" />
            <input
              type="text"
              placeholder={`Search ${activeTab}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-elevated/70 border border-border focus:border-accent pl-9 pr-8 py-1.5 rounded-xl text-xs text-primary placeholder:text-muted focus:outline-hidden transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 p-0.5 text-muted hover:text-primary"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* List Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading && items.length === 0 ? (
            <div className="py-12 flex justify-center">
              <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredItems.length === 0 ? (
            <p className="text-secondary text-xs text-center py-10">
              {searchQuery ? `No results for "${searchQuery}"` : `No ${activeTab} found.`}
            </p>
          ) : (
            filteredItems.map((item) => {
              const isSelf = item.id === currentUser?.id;
              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 p-2 rounded-xl hover:bg-surface-hover transition-colors"
                >
                  <Link
                    href={`/profile/${item.username}`}
                    onClick={onClose}
                    className="flex items-center gap-3 min-w-0"
                  >
                    <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-accent to-accent-bright flex items-center justify-center font-bold text-white text-sm shrink-0">
                      {item.avatarUrl ? (
                        <img
                          src={item.avatarUrl}
                          alt={item.displayName || item.username}
                          className="w-full h-full rounded-full object-cover"
                        />
                      ) : (
                        (item.displayName || item.username).charAt(0).toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold text-primary truncate">
                          {item.displayName || item.username}
                        </span>
                        {item.followsYou && !isSelf && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-elevated border border-border text-muted">
                            Follows you
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-secondary truncate">
                        @{item.username}
                      </div>
                    </div>
                  </Link>

                  {!isSelf && (
                    <button
                      onClick={() => handleToggleFollow(item)}
                      disabled={actionLoadingIds[item.id]}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 ${
                        item.isFollowing
                          ? 'bg-elevated border border-border text-primary hover:border-status-busy hover:text-status-busy'
                          : 'bg-accent hover:bg-accent-bright text-white shadow-xs'
                      }`}
                    >
                      {item.isFollowing ? (
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
                    </button>
                  )}
                </div>
              );
            })
          )}

          {hasMore && !searchQuery && (
            <button
              onClick={() => fetchUsers(nextCursor ?? undefined)}
              disabled={loading}
              className="w-full py-2 text-xs text-accent-bright hover:underline font-medium"
            >
              {loading ? 'Loading...' : `Load more ${activeTab}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
