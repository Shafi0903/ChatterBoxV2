'use client';

import React from 'react';
import NextLink from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Home,
  MessageSquare,
  PhoneCall,
  Users2,
  Layers,
  Compass,
  User,
  Settings,
  LogOut,
} from 'lucide-react';
import { useAuthStore } from '../../stores/auth.store';
import { Avatar } from '../ui/Avatar';
import { cn } from '../../lib/utils';

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
}

const navItems: NavItem[] = [
  { label: 'Home', href: '/home', icon: Home },
  { label: 'Messages', href: '/messages', icon: MessageSquare },
  { label: 'Calls', href: '/calls', icon: PhoneCall },
  { label: 'Communities', href: '/communities', icon: Users2 },
  { label: 'Stories', href: '/stories', icon: Layers },
  { label: 'Discover', href: '/discover', icon: Compass },
  { label: 'Profile', href: '/profile', icon: User },
  { label: 'Settings', href: '/settings', icon: Settings },
];

export const Sidebar: React.FC = () => {
  const pathname = usePathname();
  const router = useRouter();
  const { user, profile, logout } = useAuthStore();

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  const displayName = profile?.displayName || user?.username || 'User';
  const username = user?.username ? `@${user.username}` : '';

  return (
    <aside className="hidden md:flex flex-col w-[220px] h-screen bg-surface border-r border-border shrink-0 fixed left-0 top-0 z-30 select-none">
      {/* Brand Header */}
      <div className="p-5 border-b border-border flex flex-col gap-1">
        <NextLink href="/home" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-xl bg-accent flex items-center justify-center shadow-neon group-hover:bg-accent-bright transition-colors shrink-0">
            <svg
              className="w-4.5 h-4.5 text-white"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
          </div>
          <span className="font-bold text-base text-primary tracking-tight">
            ChatterBox
          </span>
        </NextLink>
        <span className="text-[10px] text-muted font-medium tracking-wide">
          Connect · Chat · Share · Belong
        </span>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href ||
            (item.href !== '/home' && pathname.startsWith(item.href));

          return (
            <NextLink
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all duration-150',
                isActive
                  ? 'bg-accent/15 text-accent-bright font-semibold shadow-sm'
                  : 'text-secondary hover:text-primary hover:bg-surface-hover',
              )}
            >
              <Icon className={cn('w-4 h-4 shrink-0', isActive ? 'text-accent-bright' : 'text-muted')} />
              <span>{item.label}</span>
            </NextLink>
          );
        })}
      </nav>

      {/* Bottom Logged-in User Card */}
      <div className="p-3 border-t border-border">
        <div className="flex items-center justify-between p-2 rounded-xl bg-elevated/50 hover:bg-surface-hover border border-border/50 transition-colors">
          <NextLink
            href="/profile"
            className="flex items-center gap-2.5 min-w-0 flex-1 mr-2"
          >
            {/* Active green status dot shown ONLY on the logged-in user's own card */}
            <Avatar
              name={displayName}
              src={profile?.avatarUrl}
              size="sm"
              showOnlineDot={true}
            />
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-semibold text-primary truncate leading-tight">
                {displayName}
              </span>
              <span className="text-[10px] text-muted truncate">
                {username}
              </span>
            </div>
          </NextLink>

          <button
            onClick={handleLogout}
            title="Log out"
            aria-label="Log out"
            className="p-1.5 rounded-lg text-muted hover:text-status-busy hover:bg-status-busy/10 transition-colors shrink-0"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
};
