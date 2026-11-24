import { create } from 'zustand';
import { ThemePreference } from '@chatterbox/shared';

interface ThemeState {
  theme: ThemePreference;
  resolvedTheme: 'dark' | 'light';
  setTheme: (theme: ThemePreference) => void;
  applyTheme: (theme: ThemePreference) => void;
  initSystemThemeListener: () => () => void;
}

function resolveSystemTheme(): 'dark' | 'light' {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function updateDOMTheme(resolved: 'dark' | 'light') {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (resolved === 'dark') {
    root.classList.add('dark');
    root.classList.remove('light');
  } else {
    root.classList.add('light');
    root.classList.remove('dark');
  }
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: 'DARK',
  resolvedTheme: 'dark',

  applyTheme: (theme: ThemePreference) => {
    const resolved = theme === 'SYSTEM' ? resolveSystemTheme() : theme === 'LIGHT' ? 'light' : 'dark';
    updateDOMTheme(resolved);
    set({ theme, resolvedTheme: resolved });
  },

  setTheme: (theme: ThemePreference) => {
    get().applyTheme(theme);
  },

  initSystemThemeListener: () => {
    if (typeof window === 'undefined') return () => {};

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (get().theme === 'SYSTEM') {
        const resolved = mediaQuery.matches ? 'dark' : 'light';
        updateDOMTheme(resolved);
        set({ resolvedTheme: resolved });
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  },
}));
