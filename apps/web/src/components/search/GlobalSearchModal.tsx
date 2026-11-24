'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  X,
  User,
  Users2,
  FileText,
  MessageSquare,
  Lock,
  ArrowRight,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { api } from '../../lib/api';
import { Avatar } from '../ui/Avatar';
import {
  GlobalSearchResponse,
  SearchType,
  SearchUserItem,
  SearchCommunityItem,
  SearchPostItem,
  SearchMessageItem,
} from '@chatterbox/shared';
import { cn } from '../../lib/utils';

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type FlattenedResult =
  | { category: 'users'; item: SearchUserItem }
  | { category: 'communities'; item: SearchCommunityItem }
  | { category: 'posts'; item: SearchPostItem }
  | { category: 'messages'; item: SearchMessageItem };

const CATEGORIES: { label: string; value: SearchType }[] = [
  { label: 'All', value: 'all' },
  { label: 'Users', value: 'users' },
  { label: 'Communities', value: 'communities' },
  { label: 'Posts', value: 'posts' },
  { label: 'Messages', value: 'messages' },
];

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({
  isOpen,
  onClose,
}) => {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const requestIdRef = useRef(0);

  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<SearchType>('all');
  const [results, setResults] = useState<GlobalSearchResponse>({
    users: [],
    communities: [],
    posts: [],
    messages: [],
  });
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
      setResults({ users: [], communities: [], posts: [], messages: [] });
      setHasSearched(false);
      setSelectedIndex(0);
      setSelectedCategory('all');
    }
  }, [isOpen]);

  // Debounced search with request cancellation
  useEffect(() => {
    if (!isOpen) return;

    const trimmed = query.trim();
    if (!trimmed) {
      setResults({ users: [], communities: [], posts: [], messages: [] });
      setIsLoading(false);
      setHasSearched(false);
      setSelectedIndex(0);
      return;
    }

    setIsLoading(true);
    setHasSearched(true);
    const currentReqId = ++requestIdRef.current;

    const timer = setTimeout(async () => {
      try {
        const data = await api.globalSearch(trimmed, selectedCategory, 6);
        if (currentReqId === requestIdRef.current) {
          setResults(data);
          setSelectedIndex(0);
        }
      } catch {
        if (currentReqId === requestIdRef.current) {
          setResults({ users: [], communities: [], posts: [], messages: [] });
        }
      } finally {
        if (currentReqId === requestIdRef.current) {
          setIsLoading(false);
        }
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query, selectedCategory, isOpen]);

  // Flattened results for keyboard navigation
  const flattenedItems: FlattenedResult[] = useMemo(() => {
    const list: FlattenedResult[] = [];
    results.users.forEach((item) => list.push({ category: 'users', item }));
    results.communities.forEach((item) => list.push({ category: 'communities', item }));
    results.posts.forEach((item) => list.push({ category: 'posts', item }));
    results.messages.forEach((item) => list.push({ category: 'messages', item }));
    return list;
  }, [results]);

  const totalResultsCount = flattenedItems.length;

  const navigateToItem = useCallback(
    (target: FlattenedResult) => {
      onClose();
      switch (target.category) {
        case 'users':
          router.push(`/profile/${target.item.username}`);
          break;
        case 'communities':
          router.push(`/communities?c=${target.item.id}`);
          break;
        case 'posts':
          router.push(`/posts/${target.item.id}`);
          break;
        case 'messages':
          router.push(`/messages?c=${target.item.conversationId}`);
          break;
      }
    },
    [onClose, router],
  );

  // Keyboard navigation listener (ArrowUp, ArrowDown, Enter, Esc)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
      return;
    }

    if (flattenedItems.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % flattenedItems.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + flattenedItems.length) % flattenedItems.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const current = flattenedItems[selectedIndex];
      if (current) {
        navigateToItem(current);
      }
    }
  };

  if (!isOpen) return null;

  let runningIndex = -1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4 bg-black/60 backdrop-blur-md animate-fade-in select-none"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl rounded-3xl bg-surface border border-border shadow-2xl overflow-hidden flex flex-col max-h-[80vh] animate-scale-in"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Top Glow */}
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-accent via-emerald-500 to-accent-bright" />

        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3.5 border-b border-border gap-3 bg-surface shrink-0">
          <Search className="w-5 h-5 text-muted shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search users, communities, posts, or unencrypted messages..."
            className="flex-1 bg-transparent text-sm text-primary placeholder-muted outline-none"
          />
          {isLoading && <Loader2 className="w-4 h-4 animate-spin text-accent-bright shrink-0" />}
          {query && !isLoading && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="p-1 rounded-lg text-muted hover:text-primary transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <kbd className="hidden sm:inline-flex items-center gap-0.5 px-2 py-0.5 text-[10px] font-mono text-muted bg-elevated border border-border rounded-md">
            <span>ESC</span>
          </kbd>
        </div>

        {/* Category Filter Pills */}
        <div className="flex items-center gap-1.5 px-4 py-2 border-b border-border/50 bg-elevated/40 overflow-x-auto shrink-0 scrollbar-none">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              type="button"
              onClick={() => setSelectedCategory(cat.value)}
              className={cn(
                'px-3 py-1 rounded-full text-xs font-semibold transition-all duration-150 shrink-0',
                selectedCategory === cat.value
                  ? 'bg-accent text-white shadow-neon'
                  : 'bg-surface hover:bg-surface-hover text-secondary hover:text-primary border border-border/60',
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Results Container */}
        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {totalResultsCount > 0 ? (
            <>
              {/* 1. Users */}
              {results.users.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 px-3 py-1 text-[11px] font-bold text-muted uppercase tracking-wider">
                    <User className="w-3.5 h-3.5 text-accent-bright" />
                    <span>Users ({results.users.length})</span>
                  </div>
                  {results.users.map((u) => {
                    runningIndex++;
                    const isSelected = runningIndex === selectedIndex;
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => navigateToItem({ category: 'users', item: u })}
                        className={cn(
                          'w-full flex items-center justify-between p-2.5 rounded-2xl text-left transition-all duration-150 group',
                          isSelected
                            ? 'bg-accent/15 border border-accent/30'
                            : 'hover:bg-surface-hover border border-transparent',
                        )}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <Avatar
                            name={u.displayName || u.username}
                            src={u.avatarUrl}
                            size="md"
                          />
                          <div className="flex flex-col min-w-0">
                            <span className="text-sm font-semibold text-primary group-hover:text-accent-bright truncate">
                              {u.displayName || u.username}
                            </span>
                            <span className="text-xs text-muted truncate">@{u.username}</span>
                            {u.bio && (
                              <span className="text-[11px] text-secondary truncate mt-0.5">
                                {u.bio}
                              </span>
                            )}
                          </div>
                        </div>

                        {u.isFollowing && (
                          <span className="px-2 py-0.5 rounded-full bg-elevated border border-border text-[10px] font-semibold text-secondary shrink-0">
                            Following
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* 2. Communities */}
              {results.communities.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 px-3 py-1 text-[11px] font-bold text-muted uppercase tracking-wider">
                    <Users2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Communities ({results.communities.length})</span>
                  </div>
                  {results.communities.map((c) => {
                    runningIndex++;
                    const isSelected = runningIndex === selectedIndex;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => navigateToItem({ category: 'communities', item: c })}
                        className={cn(
                          'w-full flex items-center justify-between p-2.5 rounded-2xl text-left transition-all duration-150 group',
                          isSelected
                            ? 'bg-accent/15 border border-accent/30'
                            : 'hover:bg-surface-hover border border-transparent',
                        )}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center text-emerald-400 font-bold shrink-0">
                            {c.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="text-sm font-semibold text-primary group-hover:text-accent-bright truncate">
                              {c.name}
                            </span>
                            <span className="text-xs text-muted truncate">
                              c/{c.slug} • {c.memberCount} members
                            </span>
                            {c.description && (
                              <span className="text-[11px] text-secondary truncate mt-0.5">
                                {c.description}
                              </span>
                            )}
                          </div>
                        </div>

                        {c.isMember && (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/25 text-[10px] font-semibold text-emerald-400 shrink-0">
                            Joined
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* 3. Posts */}
              {results.posts.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 px-3 py-1 text-[11px] font-bold text-muted uppercase tracking-wider">
                    <FileText className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Posts ({results.posts.length})</span>
                  </div>
                  {results.posts.map((p) => {
                    runningIndex++;
                    const isSelected = runningIndex === selectedIndex;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => navigateToItem({ category: 'posts', item: p })}
                        className={cn(
                          'w-full flex items-start gap-3 p-2.5 rounded-2xl text-left transition-all duration-150 group',
                          isSelected
                            ? 'bg-accent/15 border border-accent/30'
                            : 'hover:bg-surface-hover border border-transparent',
                        )}
                      >
                        <Avatar
                          name={p.author.displayName || p.author.username}
                          src={p.author.avatarUrl}
                          size="sm"
                        />
                        <div className="flex flex-col min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-primary">
                              {p.author.displayName || p.author.username}
                            </span>
                            <span className="text-[10px] text-muted">@{p.author.username}</span>
                          </div>
                          <p className="text-xs text-secondary line-clamp-2 mt-0.5">
                            {p.content}
                          </p>
                          <div className="flex items-center gap-3 text-[10px] text-muted mt-1">
                            <span>{p.likesCount} likes</span>
                            <span>•</span>
                            <span>{p.commentsCount} comments</span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* 4. Messages (Unencrypted only) */}
              {results.messages.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 px-3 py-1 text-[11px] font-bold text-muted uppercase tracking-wider">
                    <MessageSquare className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Messages ({results.messages.length})</span>
                  </div>
                  {results.messages.map((m) => {
                    runningIndex++;
                    const isSelected = runningIndex === selectedIndex;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => navigateToItem({ category: 'messages', item: m })}
                        className={cn(
                          'w-full flex items-start gap-3 p-2.5 rounded-2xl text-left transition-all duration-150 group',
                          isSelected
                            ? 'bg-accent/15 border border-accent/30'
                            : 'hover:bg-surface-hover border border-transparent',
                        )}
                      >
                        <Avatar
                          name={m.sender.displayName || m.sender.username}
                          src={m.sender.avatarUrl}
                          size="sm"
                        />
                        <div className="flex flex-col min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-primary">
                              {m.sender.displayName || m.sender.username}
                            </span>
                            {m.conversationName && (
                              <span className="text-[10px] text-muted bg-elevated px-1.5 py-0.5 rounded">
                                {m.conversationName}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-secondary line-clamp-1 mt-0.5">
                            {m.content}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          ) : hasSearched && !isLoading ? (
            <div className="py-16 flex flex-col items-center justify-center text-center">
              <div className="w-12 h-12 rounded-2xl bg-elevated flex items-center justify-center text-muted mb-3">
                <Search className="w-6 h-6 opacity-40" />
              </div>
              <p className="text-sm font-semibold text-primary">No results found</p>
              <p className="text-xs text-muted max-w-sm mt-1 leading-relaxed">
                No matching users, communities, posts, or unencrypted messages found for &ldquo;{query}&rdquo;.
              </p>
            </div>
          ) : (
            <div className="py-16 flex flex-col items-center justify-center text-center">
              <div className="w-12 h-12 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent-bright mb-3">
                <Sparkles className="w-6 h-6" />
              </div>
              <p className="text-sm font-semibold text-primary">Global Search & Command Palette</p>
              <p className="text-xs text-muted max-w-sm mt-1 leading-relaxed">
                Search across registered members, communities, social posts, and unencrypted messages. Use arrow keys to navigate and Enter to open.
              </p>
            </div>
          )}
        </div>

        {/* Footer with E2EE Transparency Notice */}
        <div className="p-3 bg-elevated/40 border-t border-border flex items-center justify-between text-[11px] text-muted shrink-0">
          <div className="flex items-center gap-1.5">
            <Lock className="w-3 h-3 text-emerald-400" />
            <span>End-to-End Encrypted chats remain strictly on-device and are excluded from search.</span>
          </div>

          <div className="hidden sm:flex items-center gap-3 text-[10px]">
            <span>↑↓ to navigate</span>
            <span>↵ to select</span>
            <span>ESC to close</span>
          </div>
        </div>
      </div>
    </div>
  );
};
