'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, User } from 'lucide-react';
import { api } from '../../lib/api';
import { Avatar } from '../ui/Avatar';
import { Skeleton } from '../ui/Skeleton';

interface SearchResult {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
}

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SearchModal: React.FC<SearchModalProps> = ({
  isOpen,
  onClose,
}) => {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Debounced search effect
  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setResults([]);
      setHasSearched(false);
      return;
    }

    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setIsLoading(false);
      setHasSearched(false);
      return;
    }

    setIsLoading(true);
    setHasSearched(true);

    const timer = setTimeout(async () => {
      try {
        const data = await api.searchUsers(trimmed, 20);
        setResults(data);
      } catch {
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query, isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSelectUser = (username: string) => {
    onClose();
    router.push(`/profile/${username}`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-xl bg-surface border border-border rounded-2xl shadow-2xl z-10 overflow-hidden flex flex-col max-h-[80vh]"
      >
        {/* Search Input Header */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border bg-elevated/40">
          <Search className="w-5 h-5 text-muted shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search users by name or @username..."
            autoFocus
            className="flex-1 bg-transparent text-sm text-primary placeholder:text-muted focus:outline-none"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="p-1 rounded-lg text-muted hover:text-primary hover:bg-surface-hover"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <kbd className="hidden sm:inline-flex px-1.5 py-0.5 text-[10px] font-mono text-muted bg-surface border border-border rounded">
            ESC
          </kbd>
        </div>

        {/* Results Area */}
        <div className="flex-1 overflow-y-auto p-2 min-h-[160px]">
          {isLoading ? (
            <div className="space-y-2 p-2">
              <div className="flex items-center gap-3 p-2">
                <Skeleton className="w-10 h-10 rounded-full" />
                <div className="space-y-1.5 flex-1">
                  <Skeleton className="w-32 h-4" />
                  <Skeleton className="w-20 h-3" />
                </div>
              </div>
              <div className="flex items-center gap-3 p-2">
                <Skeleton className="w-10 h-10 rounded-full" />
                <div className="space-y-1.5 flex-1">
                  <Skeleton className="w-40 h-4" />
                  <Skeleton className="w-24 h-3" />
                </div>
              </div>
            </div>
          ) : results.length > 0 ? (
            <div className="space-y-1">
              <span className="text-[10px] font-semibold text-muted uppercase tracking-wider px-3 py-1 block">
                Matching Users ({results.length})
              </span>
              {results.map((user) => (
                <button
                  key={user.id}
                  onClick={() => handleSelectUser(user.username)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surface-hover text-left transition-colors group"
                >
                  <Avatar
                    name={user.displayName}
                    src={user.avatarUrl}
                    size="md"
                  />
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-sm font-semibold text-primary group-hover:text-accent-bright transition-colors truncate">
                      {user.displayName}
                    </span>
                    <span className="text-xs text-muted truncate">
                      @{user.username}
                    </span>
                    {user.bio && (
                      <span className="text-xs text-secondary truncate mt-0.5">
                        {user.bio}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          ) : hasSearched ? (
            <div className="py-12 flex flex-col items-center justify-center text-center">
              <div className="w-10 h-10 rounded-full bg-elevated flex items-center justify-center text-muted mb-2">
                <User className="w-5 h-5" />
              </div>
              <p className="text-sm font-medium text-primary">No users found</p>
              <p className="text-xs text-muted mt-0.5">
                No matching accounts for &ldquo;{query}&rdquo;
              </p>
            </div>
          ) : (
            <div className="py-12 flex flex-col items-center justify-center text-center">
              <div className="w-10 h-10 rounded-full bg-elevated flex items-center justify-center text-muted mb-2">
                <Search className="w-5 h-5" />
              </div>
              <p className="text-sm font-medium text-primary">
                Search registered users
              </p>
              <p className="text-xs text-muted mt-0.5">
                Find members by their username or display name
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
