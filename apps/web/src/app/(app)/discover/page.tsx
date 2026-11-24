'use client';

import React from 'react';
import NextLink from 'next/link';
import { Compass } from 'lucide-react';
import { Button } from '../../../components/ui/Button';

export default function DiscoverPlaceholderPage() {
  return (
    <div className="py-20 flex flex-col items-center justify-center text-center max-w-lg mx-auto">
      <div className="w-16 h-16 rounded-3xl bg-accent/15 border border-accent/30 flex items-center justify-center text-accent-bright shadow-neon mb-4">
        <Compass className="w-8 h-8" />
      </div>

      <h1 className="text-xl font-bold text-primary">
        Discover
      </h1>

      <span className="inline-block mt-2 px-3 py-1 rounded-full bg-elevated border border-border text-accent-bright text-xs font-semibold">
        Explore Members & Communities
      </span>

      <p className="text-xs text-secondary mt-3 leading-relaxed">
        Browse trending channels and popular creators. In Phase 1, you can use the global search command <kbd className="font-mono bg-elevated px-1 py-0.5 rounded text-[10px]">⌘ K</kbd> to find any registered user.
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
