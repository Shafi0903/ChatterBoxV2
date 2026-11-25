'use client';

import React, { useState } from 'react';
import { CommunityDetail, CommunityMemberItem, CommunityRole } from '@chatterbox/shared';
import { api } from '../../lib/api';
import { useCommunityStore } from '../../stores/community.store';
import { useChatStore } from '../../stores/chat.store';
import { Crown, ShieldCheck, Shield, User, MoreVertical, X, UserMinus, ShieldAlert } from 'lucide-react';

interface MembersPanelProps {
  community: CommunityDetail;
  isOpen: boolean;
  onClose?: () => void;
}

const ROLE_PRIORITY: Record<CommunityRole, number> = {
  OWNER: 4,
  ADMIN: 3,
  MODERATOR: 2,
  MEMBER: 1,
};

export const MembersPanel: React.FC<MembersPanelProps> = ({ community, isOpen, onClose }) => {
  const selectCommunity = useCommunityStore((s) => s.selectCommunity);
  // Adjustment #4: Live presence synchronization from chat.store
  const presenceByUserId = useChatStore((s) => s.presenceByUserId);

  const [activeMenuMemberId, setActiveMenuMemberId] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  if (!isOpen) return null;

  const callerRole: CommunityRole = (community.callerRole as CommunityRole) || 'MEMBER';
  const callerRank = ROLE_PRIORITY[callerRole] || 1;

  // Group members by role
  const members = community.members || [];
  const owners = members.filter((m) => m.role === 'OWNER');
  const admins = members.filter((m) => m.role === 'ADMIN');
  const mods = members.filter((m) => m.role === 'MODERATOR');
  const generalMembers = members.filter((m) => m.role === 'MEMBER');

  const handleRoleChange = async (
    targetUserId: string,
    newRole: 'ADMIN' | 'MODERATOR' | 'MEMBER',
  ) => {
    setActiveMenuMemberId(null);
    setIsUpdating(true);
    try {
      await api.updateMemberRole(community.id, targetUserId, { role: newRole });
      await selectCommunity(community.id, undefined, true);
    } catch (err: any) {
      alert(err.message || 'Failed to update member role');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleTransferOwnership = async (targetMember: CommunityMemberItem) => {
    setActiveMenuMemberId(null);
    if (!confirm(`Are you sure you want to transfer Community Ownership of ${community.name} to ${targetMember.displayName} (@${targetMember.username})? You will become an Admin.`)) {
      return;
    }
    setIsUpdating(true);
    try {
      await api.transferCommunityOwnership(community.id, targetMember.userId);
      await selectCommunity(community.id, undefined, true);
    } catch (err: any) {
      alert(err.message || 'Failed to transfer ownership');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleKick = async (targetMember: CommunityMemberItem) => {
    setActiveMenuMemberId(null);
    if (confirm(`Kick ${targetMember.displayName} (@${targetMember.username}) from ${community.name}?`)) {
      setIsUpdating(true);
      try {
        await api.kickMember(community.id, targetMember.userId);
        await selectCommunity(community.id, undefined, true);
      } catch (err: any) {
        alert(err.message || 'Failed to kick member');
      } finally {
        setIsUpdating(false);
      }
    }
  };

  const renderMemberItem = (member: CommunityMemberItem) => {
    // Adjustment #4: Merge live presence status
    const livePresence = presenceByUserId[member.userId];
    const isOnline = livePresence ? livePresence !== 'OFFLINE' : member.presenceStatus !== 'OFFLINE';

    const targetRank = ROLE_PRIORITY[member.role] || 1;
    // Strict RBAC: Caller can only moderate users strictly lower in rank
    const canModerate = callerRank > targetRank;

    return (
      <div
        key={member.id}
        className="group relative flex items-center justify-between px-2.5 py-1.5 rounded-xl hover:bg-elevated/40 transition-colors"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Avatar with Presence Indicator */}
          <div className="relative shrink-0">
            <div className="w-8 h-8 rounded-full bg-accent/20 border border-border flex items-center justify-center text-xs font-bold text-accent-bright">
              {member.displayName.substring(0, 2).toUpperCase()}
            </div>
            <div
              className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-surface ${
                isOnline ? 'bg-status-online shadow-neon-green' : 'bg-status-offline'
              }`}
            />
          </div>

          <div className="min-w-0">
            <div className="text-xs font-semibold text-primary truncate flex items-center gap-1.5">
              <span>{member.displayName}</span>
              {member.role === 'OWNER' && <Crown className="w-3 h-3 text-status-away shrink-0" />}
              {member.role === 'ADMIN' && <ShieldCheck className="w-3 h-3 text-accent-bright shrink-0" />}
              {member.role === 'MODERATOR' && <Shield className="w-3 h-3 text-status-online shrink-0" />}
            </div>
            <div className="text-[10px] text-secondary truncate">@{member.username}</div>
          </div>
        </div>

        {canModerate && (
          <div className="relative">
            <button
              type="button"
              onClick={() =>
                setActiveMenuMemberId(activeMenuMemberId === member.id ? null : member.id)
              }
              className="p-1 rounded-md text-secondary hover:text-primary hover:bg-elevated transition-colors"
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>

            {/* Role & Moderation Popover */}
            {activeMenuMemberId === member.id && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setActiveMenuMemberId(null)}
                />
                <div className="absolute right-0 top-7 z-40 w-44 bg-surface border border-border rounded-xl p-1.5 shadow-2xl space-y-0.5 text-xs animate-in fade-in duration-100">
                  <div className="px-2 py-1 text-[10px] font-bold text-secondary uppercase tracking-wider">
                    Change Role
                  </div>

                  {callerRole === 'OWNER' && member.role !== 'OWNER' && (
                    <button
                      type="button"
                      onClick={() => handleTransferOwnership(member)}
                      className="w-full px-2 py-1.5 text-left text-status-away hover:bg-status-away/15 rounded-md flex items-center gap-1.5 font-semibold"
                    >
                      <Crown className="w-3.5 h-3.5 text-status-away" />
                      Transfer Ownership
                    </button>
                  )}

                  {callerRank > ROLE_PRIORITY['ADMIN'] && member.role !== 'ADMIN' && (
                    <button
                      type="button"
                      onClick={() => handleRoleChange(member.userId, 'ADMIN')}
                      className="w-full px-2 py-1.5 text-left text-primary hover:bg-elevated rounded-md flex items-center gap-1.5"
                    >
                      <ShieldCheck className="w-3.5 h-3.5 text-accent-bright" />
                      Make Admin
                    </button>
                  )}

                  {callerRank > ROLE_PRIORITY['MODERATOR'] && member.role !== 'MODERATOR' && (
                    <button
                      type="button"
                      onClick={() => handleRoleChange(member.userId, 'MODERATOR')}
                      className="w-full px-2 py-1.5 text-left text-primary hover:bg-elevated rounded-md flex items-center gap-1.5"
                    >
                      <Shield className="w-3.5 h-3.5 text-status-online" />
                      Make Moderator
                    </button>
                  )}

                  {member.role !== 'MEMBER' && (
                    <button
                      type="button"
                      onClick={() => handleRoleChange(member.userId, 'MEMBER')}
                      className="w-full px-2 py-1.5 text-left text-primary hover:bg-elevated rounded-md flex items-center gap-1.5"
                    >
                      <User className="w-3.5 h-3.5 text-secondary" />
                      Make Member
                    </button>
                  )}

                  <div className="h-px bg-border my-1" />

                  <button
                    type="button"
                    onClick={() => handleKick(member)}
                    className="w-full px-2 py-1.5 text-left text-status-busy hover:bg-status-busy/15 rounded-md flex items-center gap-1.5 font-medium"
                  >
                    <UserMinus className="w-3.5 h-3.5" />
                    Kick Member
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-60 shrink-0 bg-surface/40 border-l border-border flex flex-col select-none relative">
      <div className="h-14 px-4 border-b border-border flex items-center justify-between">
        <span className="font-bold text-xs uppercase tracking-wider text-secondary">
          Members ({members.length})
        </span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="md:hidden text-secondary hover:text-primary p-1 rounded-md"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        {owners.length > 0 && (
          <div>
            <div className="text-[10px] font-bold text-secondary uppercase tracking-wider px-2 mb-1">
              Owner — {owners.length}
            </div>
            <div className="space-y-0.5">{owners.map(renderMemberItem)}</div>
          </div>
        )}

        {admins.length > 0 && (
          <div>
            <div className="text-[10px] font-bold text-secondary uppercase tracking-wider px-2 mb-1">
              Admins — {admins.length}
            </div>
            <div className="space-y-0.5">{admins.map(renderMemberItem)}</div>
          </div>
        )}

        {mods.length > 0 && (
          <div>
            <div className="text-[10px] font-bold text-secondary uppercase tracking-wider px-2 mb-1">
              Moderators — {mods.length}
            </div>
            <div className="space-y-0.5">{mods.map(renderMemberItem)}</div>
          </div>
        )}

        {generalMembers.length > 0 && (
          <div>
            <div className="text-[10px] font-bold text-secondary uppercase tracking-wider px-2 mb-1">
              Members — {generalMembers.length}
            </div>
            <div className="space-y-0.5">{generalMembers.map(renderMemberItem)}</div>
          </div>
        )}
      </div>
    </div>
  );
};
