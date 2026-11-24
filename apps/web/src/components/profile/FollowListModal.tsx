'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { X, UserPlus, UserCheck } from 'lucide-react';
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
  type,
  onClose,
  onFollowCountChange,
}: FollowListModalProps) {
  const { user: currentUser } = useAuthStore();
  const [items, setItems] = useState<FollowUserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [actionLoadingIds, setActionLoadingIds] = useState<Record<string, boolean>>({});

  const fetchUsers = async (cursor?: string) => {
    try {
      setLoading(true);
      const res =
        type === 'followers'
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
      console.error(`Failed to load ${type}`, err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [userId, type]);

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <h2 className="text-base font-semibold text-white capitalize">{type}</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* List Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading && items.length === 0 ? (
            <div className="py-8 flex justify-center">
              <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <p className="text-zinc-500 text-sm text-center py-8">
              No {type} found.
            </p>
          ) : (
            items.map((item) => {
              const isSelf = item.id === currentUser?.id;
              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 p-2 rounded-xl hover:bg-zinc-900/50 transition-colors"
                >
                  <Link
                    href={`/profile/${item.username}`}
                    onClick={onClose}
                    className="flex items-center gap-3 min-w-0"
                  >
                    <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center font-bold text-white text-sm flex-shrink-0">
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
                      <div className="text-sm font-semibold text-white truncate">
                        {item.displayName || item.username}
                      </div>
                      <div className="text-xs text-zinc-500 truncate">
                        @{item.username}
                      </div>
                    </div>
                  </Link>

                  {!isSelf && (
                    <button
                      onClick={() => handleToggleFollow(item)}
                      disabled={actionLoadingIds[item.id]}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                        item.isFollowing
                          ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
                          : 'bg-cyan-500 hover:bg-cyan-400 text-zinc-950 shadow-md shadow-cyan-500/20'
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

          {hasMore && (
            <button
              onClick={() => fetchUsers(nextCursor ?? undefined)}
              disabled={loading}
              className="w-full py-2 text-xs text-cyan-400 hover:text-cyan-300 font-medium"
            >
              {loading ? 'Loading...' : `Load more ${type}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
