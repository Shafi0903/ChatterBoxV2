'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../../stores/auth.store';
import { Sidebar } from '../../components/layout/Sidebar';
import { TopBar } from '../../components/layout/TopBar';
import { MobileNav } from '../../components/layout/MobileNav';
import { SearchModal } from '../../components/layout/SearchModal';
import { Skeleton } from '../../components/ui/Skeleton';

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { user, isInitialized } = useAuthStore();
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Keyboard shortcut listener for CMD+K / CTRL+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Auth Guard
  useEffect(() => {
    if (isInitialized && !user) {
      router.replace('/login');
    }
  }, [user, isInitialized, router]);

  // Loading skeleton while restoring session on page reload
  if (!isInitialized) {
    return (
      <div className="flex h-screen w-screen bg-canvas">
        {/* Sidebar skeleton */}
        <div className="hidden md:flex flex-col w-[220px] h-screen bg-surface border-r border-border p-4 gap-4 shrink-0">
          <Skeleton className="w-32 h-8" />
          <div className="flex-1 space-y-2 mt-4">
            <Skeleton className="w-full h-9" />
            <Skeleton className="w-full h-9" />
            <Skeleton className="w-full h-9" />
            <Skeleton className="w-full h-9" />
          </div>
          <Skeleton className="w-full h-12" />
        </div>

        {/* Content area skeleton */}
        <div className="flex-1 flex flex-col">
          <div className="h-16 bg-surface border-b border-border flex items-center justify-between px-6">
            <Skeleton className="w-64 h-9" />
            <div className="flex gap-3">
              <Skeleton className="w-9 h-9 rounded-xl" />
              <Skeleton className="w-9 h-9 rounded-xl" />
            </div>
          </div>
          <div className="p-8 space-y-4">
            <Skeleton className="w-48 h-8" />
            <Skeleton className="w-full h-64 rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  // If unauthenticated, redirecting
  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-canvas text-primary flex">
      {/* Desktop Fixed Sidebar */}
      <Sidebar />

      {/* Main Container */}
      <div className="flex-1 flex flex-col min-w-0 md:ml-[220px]">
        {/* Fixed Top Bar */}
        <TopBar onOpenSearch={() => setIsSearchOpen(true)} />

        {/* Scrollable Page Content (with topbar offset and mobile nav padding) */}
        <main className="flex-1 pt-16 pb-20 md:pb-6 px-4 md:px-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>

      {/* Mobile Navigation */}
      <MobileNav onOpenSearch={() => setIsSearchOpen(true)} />

      {/* Command Palette Search Modal */}
      <SearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
      />
    </div>
  );
}
