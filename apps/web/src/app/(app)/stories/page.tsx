'use client';

import React from 'react';
import NextLink from 'next/link';
import { Layers } from 'lucide-react';
import { Button } from '../../../components/ui/Button';

export default function StoriesPlaceholderPage() {
  return (
    <div className="py-20 flex flex-col items-center justify-center text-center max-w-lg mx-auto">
      <div className="w-16 h-16 rounded-3xl bg-accent/15 border border-accent/30 flex items-center justify-center text-accent-bright shadow-neon mb-4">
        <Layers className="w-8 h-8" />
      </div>

      <h1 className="text-xl font-bold text-primary">
        Ephemeral Stories
      </h1>

      <span className="inline-block mt-2 px-3 py-1 rounded-full bg-elevated border border-border text-accent-bright text-xs font-semibold">
        Unlocks in Phase 6
      </span>

      <p className="text-xs text-secondary mt-3 leading-relaxed">
        24-hour disappearing photos and videos, viewer lists, and story reactions will be introduced in Phase 6.
      </p>

      <div className="mt-6">
        <NextLink href="/home">
          <Button variant="secondary" size="md">
            Return Home
          </Button>
        </NextLink>
      </div>
    </div>
  );
}
