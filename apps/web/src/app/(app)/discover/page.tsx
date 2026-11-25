'use client';

import React, { useState, useEffect } from 'react';
import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import { CommunityItem } from '@chatterbox/shared';
import { api } from '../../../lib/api';
import { useCommunityStore } from '../../../stores/community.store';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import {
  Compass,
  Search,
  Users,
  Hash,
  Globe,
  ArrowRight,
  Loader2,
  Sparkles,
} from 'lucide-react';

export default function DiscoverPage() {
  const router = useRouter();
  const selectCommunity = useCommunityStore((s) => s.selectCommunity);
  const fetchMyCommunities = useCommunityStore((s) => s.fetchMyCommunities);

  const [query, setQuery] = useState('');
  const [communities, setCommunities] = useState<(CommunityItem & { isMember: boolean })[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isJoiningId, setIsJoiningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadCommunities = async (searchQuery?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.discoverCommunities(searchQuery);
      setCommunities(res.data);
    } catch (err: any) {
      setError(err?.message || 'Failed to load public communities.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCommunities();
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadCommunities(query);
  };

  const handleJoin = async (community: CommunityItem & { isMember: boolean }) => {
    setError(null);
    if (community.isMember) {
      try {
        await selectCommunity(community.id);
        router.push(`/communities?c=${community.id}`);
      } catch (err: any) {
        setError(err?.message || 'Failed to open community.');
      }
      return;
    }

    setIsJoiningId(community.id);
    try {
      await api.joinCommunity(community.id);
      await fetchMyCommunities();
      await selectCommunity(community.id);
      router.push(`/communities?c=${community.id}`);
    } catch (err: any) {
      setError(err?.message || 'Failed to join community.');
    } finally {
      setIsJoiningId(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Hero Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-accent/20 via-surface to-elevated border border-border p-8 mb-8 shadow-2xl">
        <div className="max-w-xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/20 border border-accent/40 text-accent-bright text-xs font-semibold mb-3">
            <Compass className="w-3.5 h-3.5" />
            Public Communities
          </div>
          <h1 className="text-3xl font-extrabold text-primary tracking-tight">
            Discover Your Next Space
          </h1>
          <p className="text-sm text-secondary mt-2 leading-relaxed">
            Explore active public communities, text chat hubs, and discussion boards across ChatterBox.
            Zero dummy metrics—all member counts and channels are live from PostgreSQL.
          </p>

          <form onSubmit={handleSearch} className="mt-6 flex items-center gap-2 max-w-md">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-secondary absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by community name or description..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-surface/90 border border-border text-primary text-sm placeholder:text-secondary/50 focus:outline-hidden focus:border-accent"
              />
            </div>
            <Button type="submit" variant="primary" size="md">
              Search
            </Button>
          </form>
        </div>
      </div>

      {/* Community Grid */}
      {error && (
        <div className="mb-6 p-3.5 rounded-2xl bg-status-busy/10 border border-status-busy/25 text-xs text-status-busy flex items-center justify-between gap-2">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => loadCommunities(query || undefined)}
            className="font-semibold underline shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-lg font-bold text-primary flex items-center gap-2">
          Featured Communities
          <span className="text-xs font-normal text-secondary">
            ({communities.length} {communities.length === 1 ? 'space' : 'spaces'})
          </span>
        </h2>
      </div>

      {isLoading ? (
        <div className="py-20 flex flex-col items-center justify-center text-center">
          <Loader2 className="w-8 h-8 text-accent animate-spin mb-3" />
          <p className="text-xs text-secondary">Discovering real communities...</p>
        </div>
      ) : communities.length === 0 ? (
        <div className="py-16 text-center rounded-2xl bg-surface/50 border border-border border-dashed p-8">
          <div className="w-12 h-12 rounded-2xl bg-elevated border border-border mx-auto flex items-center justify-center text-secondary mb-3">
            <Compass className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-primary">No public communities found</h3>
          <p className="text-xs text-secondary mt-1 max-w-sm mx-auto">
            {query.trim()
              ? `No public communities match "${query}". Try searching for another keyword.`
              : 'No public communities have been created yet. Be the first to start one!'}
          </p>
          <div className="mt-4">
            <NextLink href="/communities">
              <Button variant="primary" size="sm">
                Create a Community
              </Button>
            </NextLink>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {communities.map((c) => (
            <div
              key={c.id}
              className="group rounded-2xl bg-surface border border-border hover:border-accent/40 transition-all p-5 flex flex-col justify-between shadow-lg hover:shadow-neon/20"
            >
              <div>
                <div className="flex items-start gap-3.5 mb-3">
                  <div className="w-12 h-12 rounded-2xl bg-accent/20 border border-accent/40 flex items-center justify-center text-accent-bright font-bold text-base shrink-0">
                    {c.name.substring(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-bold text-primary truncate group-hover:text-accent-bright transition-colors">
                      {c.name}
                    </h3>
                    <div className="flex items-center gap-2 mt-0.5 text-[11px] text-secondary">
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3 text-secondary" />
                        {c.memberCount} {c.memberCount === 1 ? 'member' : 'members'}
                      </span>
                      <span>·</span>
                      <span className="flex items-center gap-1">
                        <Hash className="w-3 h-3 text-secondary" />
                        {c.channelCount} {c.channelCount === 1 ? 'channel' : 'channels'}
                      </span>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-secondary line-clamp-3 mb-4 leading-relaxed">
                  {c.description || 'Welcome to our community! Join us for lively discussions and shared interests.'}
                </p>
              </div>

              <div className="pt-3 border-t border-border flex items-center justify-between">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-elevated text-[10px] font-semibold text-secondary">
                  <Globe className="w-2.5 h-2.5 text-accent-bright" />
                  Public
                </span>

                <Button
                  variant={c.isMember ? 'secondary' : 'primary'}
                  size="sm"
                  isLoading={isJoiningId === c.id}
                  onClick={() => handleJoin(c)}
                  className="flex items-center gap-1.5"
                >
                  {c.isMember ? (
                    'Open Space'
                  ) : (
                    <>
                      Join Space
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
