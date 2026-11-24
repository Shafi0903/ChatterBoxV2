'use client';

import React from 'react';
import NextLink from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, MessageSquare, Search, Users2, User } from 'lucide-react';
import { useChatStore } from '../../stores/chat.store';
import { cn } from '../../lib/utils';

interface MobileNavProps {
  onOpenSearch: () => void;
}

export const MobileNav: React.FC<MobileNavProps> = ({ onOpenSearch }) => {
  const pathname = usePathname();
  const totalUnread = useChatStore((s) => s.getTotalUnreadCount());

  const links = [
    { label: 'Home', href: '/home', icon: Home },
    { label: 'Messages', href: '/messages', icon: MessageSquare },
    { label: 'Search', href: '#search', icon: Search, onClick: onOpenSearch },
    { label: 'Communities', href: '/communities', icon: Users2 },
    { label: 'Profile', href: '/profile', icon: User },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-surface/95 backdrop-blur-md border-t border-border z-30 flex items-center justify-around px-2">
      {links.map((link) => {
        const Icon = link.icon;
        const isActive =
          link.href !== '#search' &&
          (pathname === link.href || (link.href !== '/home' && pathname.startsWith(link.href)));

        if (link.onClick) {
          return (
            <button
              key={link.label}
              onClick={link.onClick}
              className="flex flex-col items-center justify-center min-w-[44px] min-h-[44px] text-muted hover:text-primary transition-colors"
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] mt-0.5">{link.label}</span>
            </button>
          );
        }

        return (
          <NextLink
            key={link.label}
            href={link.href}
            className={cn(
              'relative flex flex-col items-center justify-center min-w-[44px] min-h-[44px] transition-colors',
              isActive
                ? 'text-accent-bright font-medium'
                : 'text-muted hover:text-primary',
            )}
          >
            <div className="relative">
              <Icon className="w-5 h-5" />
              {link.label === 'Messages' && totalUnread > 0 && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-status-busy ring-2 ring-surface" />
              )}
            </div>
            <span className="text-[10px] mt-0.5">{link.label}</span>
          </NextLink>
        );
      })}
    </nav>
  );
};
