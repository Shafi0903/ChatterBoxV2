'use client';

import React from 'react';
import NextLink from 'next/link';
import { User, Settings, Search, MessageSquare, ShieldCheck, Zap } from 'lucide-react';
import { useAuthStore } from '../../../stores/auth.store';
import { Button } from '../../../components/ui/Button';

export default function HomePage() {
  const { user, profile } = useAuthStore();
  const displayName = profile?.displayName || user?.username || 'there';

  return (
    <div className="space-y-8 max-w-4xl mx-auto py-4">
      {/* Welcome Banner */}
      <div className="relative rounded-2xl bg-gradient-to-r from-accent/20 via-surface to-elevated p-8 border border-border overflow-hidden">
        <div className="relative z-10 max-w-xl">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent/15 border border-accent/30 text-accent-bright text-xs font-semibold mb-3">
            <Zap className="w-3.5 h-3.5" />
            <span>ChatterBox v0.1 — Phase 1 Live</span>
          </div>
          <h1 className="text-2xl font-bold text-primary">
            Welcome back, {displayName}!
          </h1>
          <p className="text-sm text-secondary mt-2 leading-relaxed">
            Your privacy-first social communication hub. Your identity, profile, and theme
            settings are active and securely synced.
          </p>
          <div className="flex flex-wrap items-center gap-3 mt-5">
            <NextLink href="/profile">
              <Button variant="primary" size="sm" className="gap-2">
                <User className="w-4 h-4" />
                <span>View Profile</span>
              </Button>
            </NextLink>
            <NextLink href="/settings">
              <Button variant="secondary" size="sm" className="gap-2">
                <Settings className="w-4 h-4" />
                <span>Adjust Settings</span>
              </Button>
            </NextLink>
          </div>
        </div>
      </div>

      {/* Feature Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Profile Card */}
        <div className="bg-surface border border-border rounded-2xl p-6 flex flex-col justify-between">
          <div>
            <div className="w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center text-accent-bright mb-3">
              <User className="w-5 h-5" />
            </div>
            <h2 className="text-sm font-semibold text-primary">Personal Profile</h2>
            <p className="text-xs text-muted mt-1 leading-relaxed">
              Customize your display name, bio, location, and topic tags. All metrics reflect genuine activity.
            </p>
          </div>
          <NextLink href="/profile" className="text-xs font-semibold text-accent-bright hover:underline mt-4">
            Manage profile →
          </NextLink>
        </div>

        {/* Global Search Card */}
        <div className="bg-surface border border-border rounded-2xl p-6 flex flex-col justify-between">
          <div>
            <div className="w-10 h-10 rounded-xl bg-status-online/15 flex items-center justify-center text-status-online mb-3">
              <Search className="w-5 h-5" />
            </div>
            <h2 className="text-sm font-semibold text-primary">Member Search</h2>
            <p className="text-xs text-muted mt-1 leading-relaxed">
              Press <kbd className="font-mono bg-elevated px-1 py-0.5 rounded text-[10px]">⌘ K</kbd> anywhere to instantly find registered users across the platform.
            </p>
          </div>
          <span className="text-xs font-semibold text-muted mt-4">
            Keyboard ready
          </span>
        </div>

        {/* Security Card */}
        <div className="bg-surface border border-border rounded-2xl p-6 flex flex-col justify-between">
          <div>
            <div className="w-10 h-10 rounded-xl bg-accent-bright/15 flex items-center justify-center text-accent-bright mb-3">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h2 className="text-sm font-semibold text-primary">Session Security</h2>
            <p className="text-xs text-muted mt-1 leading-relaxed">
              Protected by Argon2id, in-memory tokens, HttpOnly cookie rotation, and active token-reuse detection.
            </p>
          </div>
          <span className="text-xs font-semibold text-status-online mt-4">
            Protected & Verified
          </span>
        </div>
      </div>

      {/* Roadmap Section */}
      <div className="bg-surface border border-border rounded-2xl p-6">
        <h2 className="text-sm font-semibold text-primary mb-3">Upcoming Milestones</h2>
        <div className="space-y-3">
          <div className="flex items-start gap-3 p-3 rounded-xl bg-elevated/40 border border-border/50">
            <MessageSquare className="w-4 h-4 text-accent-bright shrink-0 mt-0.5" />
            <div>
              <span className="text-xs font-semibold text-primary block">Phase 2: Real-Time Direct & Group Messaging</span>
              <p className="text-[11px] text-muted mt-0.5">
                Socket.IO real-time delivery, typing indicators, message reactions, and Redis presence tracking.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 rounded-xl bg-elevated/40 border border-border/50">
            <ShieldCheck className="w-4 h-4 text-accent-bright shrink-0 mt-0.5" />
            <div>
              <span className="text-xs font-semibold text-primary block">Phase 3: End-to-End Encryption (E2EE)</span>
              <p className="text-[11px] text-muted mt-0.5">
                Device key bundles and client-side encryption for private 1:1 conversations.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
