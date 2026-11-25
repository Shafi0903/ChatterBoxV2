'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useThemeStore } from '../stores/theme.store';
import { useAuthStore } from '../stores/auth.store';

const AUTH_REQUIRED_PREFIXES = [
  '/home',
  '/messages',
  '/calls',
  '/communities',
  '/stories',
  '/discover',
  '/profile',
  '/settings',
  '/posts',
];

export function ThemeInitializer() {
  const pathname = usePathname();
  const initSystemThemeListener = useThemeStore((s) => s.initSystemThemeListener);
  const initializeAuth = useAuthStore((s) => s.initializeAuth);

  useEffect(() => {
    const isProtectedAppRoute = AUTH_REQUIRED_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );

    // Skip /auth/refresh on unauthenticated public/404 routes when no session hint exists
    initializeAuth({ skipRefreshIfNoHint: !isProtectedAppRoute });

    // Initialize system theme listener
    const cleanup = initSystemThemeListener();
    return cleanup;
  }, [initializeAuth, initSystemThemeListener, pathname]);

  return null;
}
