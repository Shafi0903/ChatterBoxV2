'use client';

import { useEffect } from 'react';
import { useThemeStore } from '../stores/theme.store';
import { useAuthStore } from '../stores/auth.store';

export function ThemeInitializer() {
  const initSystemThemeListener = useThemeStore((s) => s.initSystemThemeListener);
  const initializeAuth = useAuthStore((s) => s.initializeAuth);

  useEffect(() => {
    // 1. Initialize auth session on mount
    initializeAuth();

    // 2. Initialize system theme listener
    const cleanup = initSystemThemeListener();
    return cleanup;
  }, [initializeAuth, initSystemThemeListener]);

  return null;
}
