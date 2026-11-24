'use client';

import React from 'react';
import NextLink from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, MessageSquare, Search, Users2, User } from 'lucide-react';
import { cn } from '../../lib/utils';

interface MobileNavProps {
  onOpenSearch: () => void;
}

export const MobileNav: React.FC<MobileNavProps> = ({ onOpenSearch }) => {
  const pathname = usePathname();

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
              'flex flex-col items-center justify-center min-w-[44px] min-h-[44px] transition-colors',
              isActive
                ? 'text-accent-bright font-medium'
                : 'text-muted hover:text-primary',
            )}
          >
            <Icon className="w-5 h-5" />
            <span className="text-[10px] mt-0.5">{link.label}</span>
          </NextLink>
        );
      })}
    </nav>
  );
};
