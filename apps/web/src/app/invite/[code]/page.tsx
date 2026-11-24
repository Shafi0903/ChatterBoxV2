'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import NextLink from 'next/link';
import { api, ApiError } from '../../../lib/api';
import { useAuthStore } from '../../../stores/auth.store';
import { useCommunityStore } from '../../../stores/community.store';
import { Button } from '../../../components/ui/Button';
import { Loader2, AlertCircle, Compass, Users } from 'lucide-react';

export default function InviteLandingPage() {
  const params = useParams();
  const router = useRouter();
  const code = params?.code as string;

  const user = useAuthStore((s) => s.user);
  const isInitialized = useAuthStore((s) => s.isInitialized);
  const fetchMyCommunities = useCommunityStore((s) => s.fetchMyCommunities);
  const selectCommunity = useCommunityStore((s) => s.selectCommunity);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isInitialized) return;

    if (!user) {
      // Adjustment #2: Redirect unauthenticated user with safe relative redirect param
      router.replace(`/login?redirect=${encodeURIComponent(`/invite/${code}`)}`);
      return;
    }

    if (!code) {
      setError('Invalid invite link');
      setIsLoading(false);
      return;
    }

    const join = async () => {
      try {
        const community = await api.joinByInviteCode(code);
        await fetchMyCommunities();
        await selectCommunity(community.id);
        router.replace(`/communities?c=${community.id}`);
      } catch (err: any) {
        setIsLoading(false);
        setError(err.message || 'This invite is invalid, has expired, or reached its maximum uses.');
      }
    };

    join();
  }, [code, user, isInitialized, router, fetchMyCommunities, selectCommunity]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-md bg-surface border border-border rounded-2xl p-8 shadow-2xl text-center">
        {isLoading ? (
          <div className="py-8 flex flex-col items-center">
            <Loader2 className="w-10 h-10 text-accent animate-spin mb-4" />
            <h2 className="text-lg font-bold text-primary">Joining Community...</h2>
            <p className="text-xs text-secondary mt-1">Verifying your invite code and syncing membership</p>
          </div>
        ) : error ? (
          <div className="py-4 flex flex-col items-center">
            <div className="w-12 h-12 rounded-2xl bg-status-busy/15 border border-status-busy/30 flex items-center justify-center text-status-busy mb-4">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-bold text-primary">Invite Unavailable</h2>
            <p className="text-xs text-secondary mt-2 mb-6 leading-relaxed max-w-xs">{error}</p>

            <div className="flex flex-col gap-2.5 w-full">
              <NextLink href="/discover" className="w-full">
                <Button variant="primary" size="md" className="w-full flex items-center justify-center gap-2">
                  <Compass className="w-4 h-4" />
                  Explore Public Communities
                </Button>
              </NextLink>
              <NextLink href="/home" className="w-full">
                <Button variant="secondary" size="md" className="w-full">
                  Return to Home
                </Button>
              </NextLink>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
