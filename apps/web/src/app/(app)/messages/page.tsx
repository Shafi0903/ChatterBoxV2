'use client';

import React from 'react';
import NextLink from 'next/link';
import { MessageSquare, ArrowRight } from 'lucide-react';
import { Button } from '../../../components/ui/Button';

export default function MessagesPlaceholderPage() {
  return (
    <div className="py-20 flex flex-col items-center justify-center text-center max-w-lg mx-auto">
      <div className="w-16 h-16 rounded-3xl bg-accent/15 border border-accent/30 flex items-center justify-center text-accent-bright shadow-neon mb-4">
        <MessageSquare className="w-8 h-8" />
      </div>

      <h1 className="text-xl font-bold text-primary">
        Direct & Group Messaging
      </h1>

      <span className="inline-block mt-2 px-3 py-1 rounded-full bg-elevated border border-border text-accent-bright text-xs font-semibold">
        Unlocks in Phase 2
      </span>

      <p className="text-xs text-secondary mt-3 leading-relaxed">
        Real-time direct messaging, group conversations, cursor-paginated chat history,
        typing indicators, delivery status checks, and live presence will be fully available in Phase 2.
      </p>

      <div className="mt-6 flex items-center gap-3">
        <NextLink href="/home">
          <Button variant="secondary" size="md">
            Return Home
          </Button>
        </NextLink>
        <NextLink href="/profile">
          <Button variant="primary" size="md" className="gap-1.5">
            <span>Explore Profile</span>
            <ArrowRight className="w-4 h-4" />
          </Button>
        </NextLink>
      </div>
    </div>
  );
}
