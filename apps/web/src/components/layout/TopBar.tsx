'use client';

import React, { useState } from 'react';
import { Bell } from 'lucide-react';
import NextLink from 'next/link';
import { useAuthStore } from '../../stores/auth.store';
import { useThemeStore } from '../../stores/theme.store';
import { useNotificationStore } from '../../stores/notification.store';
import { NotificationsDropdown } from '../notifications/NotificationsDropdown';
import { Avatar } from '../ui/Avatar';
import { api } from '../../lib/api';

interface TopBarProps {
  onOpenSearch: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({ onOpenSearch }) => {
  const { user, profile, settings, updateSettingsState } = useAuthStore();
  const { resolvedTheme, setTheme } = useThemeStore();
  const [showNotifications, setShowNotifications] = useState(false);
  const unreadCount = useNotificationStore((s) => s.unreadCount);

  const toggleTheme = async () => {
    const nextTheme = resolvedTheme === 'dark' ? 'LIGHT' : 'DARK';
    setTheme(nextTheme);

    // Persist to backend if logged in
    try {
      const updated = await api.updateSettings({ theme: nextTheme });
      updateSettingsState(updated);
    } catch {
      // Ignored
    }
  };

  const displayName = profile?.displayName || user?.username || 'User';

  return (
    <header className="h-16 bg-surface/80 backdrop-blur-md border-b border-border fixed top-0 right-0 left-0 md:left-[220px] z-20 flex items-center justify-between px-4 md:px-6">
      {/* Centered Global Search Trigger */}
      <div className="flex-1 max-w-md">
        <button
          onClick={onOpenSearch}
          className="w-full flex items-center justify-between px-3.5 py-2 bg-elevated/70 hover:bg-elevated border border-border hover:border-accent/40 rounded-xl text-xs text-muted transition-all duration-150 group cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <svg
              className="w-3.5 h-3.5 text-muted group-hover:text-primary transition-colors"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <span className="truncate">Search users, messages, or communities...</span>
          </div>
          <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono text-muted bg-surface border border-border rounded-md">
            <span>⌘</span>
            <span>K</span>
          </kbd>
        </button>
      </div>

      {/* Right Controls Group */}
      <div className="flex items-center gap-2 md:gap-3 ml-4">
        {/* Theme Toggle Button */}
        <button
          onClick={toggleTheme}
          title={`Switch to ${resolvedTheme === 'dark' ? 'Light' : 'Dark'} mode`}
          aria-label="Toggle theme"
          className="p-2 rounded-xl text-secondary hover:text-primary hover:bg-surface-hover border border-transparent hover:border-border transition-colors"
        >
          {resolvedTheme === 'dark' ? (
            // Sun Icon for switching to light
            <svg className="w-4 h-4 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="5"></circle>
              <line x1="12" y1="1" x2="12" y2="3"></line>
              <line x1="12" y1="21" x2="12" y2="23"></line>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
              <line x1="1" y1="12" x2="3" y2="12"></line>
              <line x1="21" y1="12" x2="23" y2="12"></line>
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
            </svg>
          ) : (
            // Moon Icon for switching to dark
            <svg className="w-4 h-4 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
            </svg>
          )}
        </button>

        {/* Notifications Popover Trigger */}
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            title="Notifications"
            aria-label="Notifications"
            className="p-2 rounded-xl text-secondary hover:text-primary hover:bg-surface-hover border border-transparent hover:border-border transition-colors relative"
          >
            <Bell className="w-4 h-4" />
            {/* Real Unread Count Badge */}
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-accent text-[9px] font-bold text-white flex items-center justify-center leading-none shadow-sm">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          {showNotifications && (
            <NotificationsDropdown onClose={() => setShowNotifications(false)} />
          )}
        </div>

        {/* User Avatar shortcut leading directly to /profile */}
        <NextLink href="/profile" className="rounded-full ring-2 ring-transparent hover:ring-accent-bright transition-all">
          <Avatar
            name={displayName}
            src={profile?.avatarUrl}
            size="sm"
          />
        </NextLink>
      </div>
    </header>
  );
};
