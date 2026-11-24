'use client';

import React, { useState } from 'react';
import { CommunityDetail, ChannelItem, CommunityRole } from '@chatterbox/shared';
import { api } from '../../lib/api';
import { useCommunityStore } from '../../stores/community.store';
import {
  Hash,
  Megaphone,
  Plus,
  ChevronDown,
  Settings,
  UserPlus,
  LogOut,
  Trash2,
  Lock,
  Edit2,
  Trash,
} from 'lucide-react';

interface ChannelSidebarProps {
  community: CommunityDetail;
  activeChannelId: string | null;
  onSelectChannel: (channelId: string) => void;
  onOpenInviteModal: () => void;
  onOpenChannelModal: (channel?: ChannelItem | null) => void;
  onOpenSettingsModal: () => void;
}

export const ChannelSidebar: React.FC<ChannelSidebarProps> = ({
  community,
  activeChannelId,
  onSelectChannel,
  onOpenInviteModal,
  onOpenChannelModal,
  onOpenSettingsModal,
}) => {
  const fetchMyCommunities = useCommunityStore((s) => s.fetchMyCommunities);
  const selectCommunity = useCommunityStore((s) => s.selectCommunity);

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const callerRole: CommunityRole = (community.callerRole as CommunityRole) || 'MEMBER';
  const isOwner = callerRole === 'OWNER';
  const isAdmin = callerRole === 'ADMIN' || isOwner;
  const isMod = callerRole === 'MODERATOR' || isAdmin;

  const handleLeave = async () => {
    if (confirm(`Are you sure you want to leave ${community.name}?`)) {
      try {
        await api.leaveCommunity(community.id);
        await fetchMyCommunities();
        await selectCommunity(null);
      } catch (err: any) {
        alert(err.message || 'Failed to leave community');
      }
    }
  };

  const handleDeleteChannel = async (e: React.MouseEvent, channel: ChannelItem) => {
    e.stopPropagation();
    if (confirm(`Delete #${channel.name}? All channel messages will be removed.`)) {
      try {
        await api.deleteChannel(channel.id);
        await selectCommunity(community.id);
      } catch (err: any) {
        alert(err.message || 'Failed to delete channel');
      }
    }
  };

  return (
    <div className="w-60 shrink-0 bg-surface/50 border-r border-border flex flex-col select-none relative">
      {/* Community Header with Dropdown Trigger */}
      <div className="relative border-b border-border">
        <button
          type="button"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="w-full h-14 px-4 flex items-center justify-between hover:bg-elevated/40 transition-colors text-left"
        >
          <div className="min-w-0 flex items-center gap-2">
            <span className="font-bold text-sm text-primary truncate">{community.name}</span>
            {!community.isPublic && (
              <span title="Private Space">
                <Lock className="w-3.5 h-3.5 text-secondary shrink-0" />
              </span>
            )}
          </div>
          <ChevronDown
            className={`w-4 h-4 text-secondary shrink-0 transition-transform ${
              isMenuOpen ? 'rotate-180' : ''
            }`}
          />
        </button>

        {/* Dropdown Menu */}
        {isMenuOpen && (
          <>
            <div
              className="fixed inset-0 z-30"
              onClick={() => setIsMenuOpen(false)}
            />
            <div className="absolute top-14 left-2 right-2 z-40 bg-surface border border-border rounded-xl p-1.5 shadow-2xl animate-in fade-in duration-100 space-y-0.5">
              {isMod && (
                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    onOpenInviteModal();
                  }}
                  className="w-full px-2.5 py-2 text-xs font-medium text-accent-bright hover:bg-accent/15 rounded-lg flex items-center gap-2 transition-colors text-left"
                >
                  <UserPlus className="w-4 h-4" />
                  Invite People
                </button>
              )}

              {isAdmin && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setIsMenuOpen(false);
                      onOpenChannelModal(null);
                    }}
                    className="w-full px-2.5 py-2 text-xs font-medium text-primary hover:bg-elevated rounded-lg flex items-center gap-2 transition-colors text-left"
                  >
                    <Plus className="w-4 h-4 text-secondary" />
                    Create Channel
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsMenuOpen(false);
                      onOpenSettingsModal();
                    }}
                    className="w-full px-2.5 py-2 text-xs font-medium text-primary hover:bg-elevated rounded-lg flex items-center gap-2 transition-colors text-left"
                  >
                    <Settings className="w-4 h-4 text-secondary" />
                    Community Settings
                  </button>
                </>
              )}

              <div className="h-px bg-border my-1" />

              {!isOwner ? (
                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    handleLeave();
                  }}
                  className="w-full px-2.5 py-2 text-xs font-medium text-status-busy hover:bg-status-busy/15 rounded-lg flex items-center gap-2 transition-colors text-left"
                >
                  <LogOut className="w-4 h-4" />
                  Leave Community
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    onOpenSettingsModal();
                  }}
                  className="w-full px-2.5 py-2 text-xs font-medium text-status-busy hover:bg-status-busy/15 rounded-lg flex items-center gap-2 transition-colors text-left"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete Community
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* Channels Section */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        <div>
          <div className="flex items-center justify-between px-2 mb-1">
            <span className="text-[11px] font-bold text-secondary uppercase tracking-wider">
              Channels
            </span>
            {isAdmin && (
              <button
                type="button"
                onClick={() => onOpenChannelModal(null)}
                className="text-secondary hover:text-primary p-0.5 rounded-sm hover:bg-elevated transition-colors"
                title="Create Channel"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="space-y-0.5">
            {community.channels?.map((ch) => {
              const isActive = ch.id === activeChannelId;
              const isAnnouncement = ch.type === 'ANNOUNCEMENT';

              return (
                <div
                  key={ch.id}
                  onClick={() => onSelectChannel(ch.id)}
                  className={`group relative flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-colors ${
                    isActive
                      ? 'bg-elevated text-primary font-semibold shadow-xs'
                      : 'text-secondary hover:text-primary hover:bg-elevated/40'
                  }`}
                >
                  <div className="min-w-0 flex items-center gap-2">
                    {isAnnouncement ? (
                      <Megaphone className={`w-4 h-4 shrink-0 ${isActive ? 'text-accent-bright' : 'text-secondary'}`} />
                    ) : (
                      <Hash className={`w-4 h-4 shrink-0 ${isActive ? 'text-accent-bright' : 'text-secondary'}`} />
                    )}
                    <span className="truncate">{ch.name}</span>
                  </div>

                  {/* Channel Admin hover actions */}
                  {isAdmin && (
                    <div className="hidden group-hover:flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenChannelModal(ch);
                        }}
                        className="p-1 hover:text-accent-bright rounded-sm"
                        title="Edit Channel"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                      {community.channels.length > 1 && (
                        <button
                          type="button"
                          onClick={(e) => handleDeleteChannel(e, ch)}
                          className="p-1 hover:text-status-busy rounded-sm"
                          title="Delete Channel"
                        >
                          <Trash className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
