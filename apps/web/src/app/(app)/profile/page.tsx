'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../../../stores/auth.store';
import { Skeleton } from '../../../components/ui/Skeleton';

export default function ProfileRedirectPage() {
  const router = useRouter();
  const { user, isInitialized } = useAuthStore();

  useEffect(() => {
    if (isInitialized) {
      if (user?.username) {
        router.replace(`/profile/${user.username}`);
      } else {
        router.replace('/login');
      }
    }
  }, [user, isInitialized, router]);

  return (
    <div className="py-12 flex flex-col items-center justify-center gap-4">
      <Skeleton className="w-24 h-24 rounded-full" />
      <Skeleton className="w-48 h-6" />
      <Skeleton className="w-32 h-4" />
    </div>
  );
}
