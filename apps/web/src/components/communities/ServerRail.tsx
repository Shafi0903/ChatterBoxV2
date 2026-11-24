'use client';

import React from 'react';
import NextLink from 'next/link';
import { CommunityItem } from '@chatterbox/shared';
import { Compass, Plus, Users2 } from 'lucide-react';

interface ServerRailProps {
  communities: CommunityItem[];
  activeCommunityId: string | null;
  onSelectCommunity: (id: string) => void;
  onOpenCreateModal: () => void;
}

export const ServerRail: React.FC<ServerRailProps> = ({
  communities,
  activeCommunityId,
  onSelectCommunity,
  onOpenCreateModal,
}) => {
  return (
    <div className="w-16 shrink-0 bg-surface/95 border-r border-border flex flex-col items-center py-3 select-none z-20">
      {/* Discover Button */}
      <NextLink
        href="/discover"
        className="group relative w-12 h-12 rounded-2xl bg-elevated/60 hover:bg-accent/20 border border-border hover:border-accent flex items-center justify-center text-secondary hover:text-accent-bright transition-all mb-2"
        title="Discover Communities"
      >
        <Compass className="w-5 h-5 transition-transform group-hover:scale-110" />
      </NextLink>

      {/* Divider */}
      <div className="w-8 h-[2px] bg-border rounded-full my-2" />

      {/* Community List */}
      <div className="flex-1 w-full flex flex-col items-center gap-2 overflow-y-auto no-scrollbar py-1">
        {communities.map((c) => {
          const isActive = c.id === activeCommunityId;
          const initials = c.name
            .split(' ')
            .map((w) => w[0])
            .join('')
            .substring(0, 2)
            .toUpperCase();

          return (
            <div key={c.id} className="relative group flex items-center justify-center w-full">
              {/* Active / Hover Pill Indicator */}
              <div
                className={`absolute left-0 w-1 bg-accent-bright rounded-r-full transition-all duration-200 ${
                  isActive
                    ? 'h-8'
                    : 'h-2 scale-0 group-hover:scale-100 group-hover:h-5'
                }`}
              />

              <button
                type="button"
                onClick={() => onSelectCommunity(c.id)}
                className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xs font-bold transition-all duration-200 ${
                  isActive
                    ? 'bg-accent text-white shadow-neon rounded-2xl'
                    : 'bg-elevated/60 text-primary border border-border hover:rounded-xl hover:bg-elevated hover:border-accent/40'
                }`}
                title={c.name}
              >
                {initials || <Users2 className="w-5 h-5" />}
              </button>
            </div>
          );
        })}

        {/* Add Community Button */}
        <button
          type="button"
          onClick={onOpenCreateModal}
          className="group w-12 h-12 rounded-2xl bg-elevated/40 hover:bg-status-online/15 border border-dashed border-border hover:border-status-online flex items-center justify-center text-secondary hover:text-status-online transition-all mt-1"
          title="Add a Community"
        >
          <Plus className="w-5 h-5 transition-transform group-hover:rotate-90 duration-200" />
        </button>
      </div>
    </div>
  );
};
