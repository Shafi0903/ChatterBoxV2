'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../stores/auth.store';

export default function IndexPage() {
  const router = useRouter();
  const { user, isInitialized } = useAuthStore();

  useEffect(() => {
    if (isInitialized) {
      if (user) {
        router.replace('/home');
      } else {
        router.replace('/login');
      }
    }
  }, [user, isInitialized, router]);

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-canvas">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-accent flex items-center justify-center shadow-neon animate-pulse">
          <span className="text-white font-bold text-xl">C</span>
        </div>
        <p className="text-xs text-muted">Loading ChatterBox...</p>
      </div>
    </div>
  );
}
