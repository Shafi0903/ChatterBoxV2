import React from 'react';
import NextLink from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-canvas text-primary flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-surface border border-border rounded-2xl p-8 shadow-2xl text-center space-y-5">
        <div className="w-14 h-14 rounded-2xl bg-accent/15 border border-accent/30 flex items-center justify-center mx-auto shadow-neon">
          <span className="text-xl font-bold text-accent-bright font-mono">404</span>
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-bold text-primary tracking-tight">
            Page Not Found
          </h1>
          <p className="text-xs text-secondary leading-relaxed">
            The page you&apos;re looking for doesn&apos;t exist or may have been moved.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 pt-2">
          <NextLink
            href="/home"
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-accent hover:bg-accent-bright text-white text-xs font-semibold transition-colors shadow-neon"
          >
            Go to Home
          </NextLink>
          <NextLink
            href="/login"
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-elevated hover:bg-surface-hover border border-border text-secondary hover:text-primary text-xs font-semibold transition-colors"
          >
            Sign In
          </NextLink>
        </div>
      </div>
    </div>
  );
}
