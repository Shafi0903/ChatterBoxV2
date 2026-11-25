import React, { useState, useMemo } from 'react';
import { ConversationMemberItem } from '@chatterbox/shared';
import { useAuthStore } from '../../stores/auth.store';
import { useChatStore } from '../../stores/chat.store';
import { api } from '../../lib/api';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import {
  X,
  Crown,
  ShieldAlert,
  UserPlus,
  LogOut,
  Trash2,
  Edit2,
  Check,
  Search,
} from 'lucide-react';

interface GroupDetailsPanelProps {
  onClose: () => void;
}

interface SearchUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
}

export const GroupDetailsPanel: React.FC<GroupDetailsPanelProps> = ({ onClose }) => {
  const currentUserId = useAuthStore((s) => s.user?.id);
  const {
    activeConversationDetail,
    presenceByUserId,
    selectConversation,
    fetchConversations,
  } = useChatStore();

  const isDm = activeConversationDetail?.type === 'DM';

  // State for group renaming
  const [isEditingName, setIsEditingName] = useState(false);
  const [renamedTitle, setRenamedTitle] = useState(
    activeConversationDetail?.name || '',
  );
  const [isRenaming, setIsRenaming] = useState(false);

  // State for Add Member modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addSearchQuery, setAddSearchQuery] = useState('');
  const [addSearchResults, setAddSearchResults] = useState<SearchUser[]>([]);
  const [isAddingMember, setIsAddingMember] = useState(false);

  // State for Member Removal confirmation
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);
  const [isLeaving, setIsLeaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const myRole = useMemo(() => {
    if (!activeConversationDetail || isDm) return 'MEMBER';
    const member = activeConversationDetail.members.find(
      (m: ConversationMemberItem) => m.userId === currentUserId,
    );
    return member?.role || 'MEMBER';
  }, [activeConversationDetail, isDm, currentUserId]);

  const isOwnerOrAdmin = myRole === 'OWNER' || myRole === 'ADMIN';

  if (!activeConversationDetail) return null;

  const handleRenameGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renamedTitle.trim()) return;

    setIsRenaming(true);
    setActionError(null);
    try {
      await api.updateConversation(activeConversationDetail.id, {
        name: renamedTitle.trim(),
      });
      await fetchConversations();
      await selectConversation(activeConversationDetail.id);
      setIsEditingName(false);
    } catch (err: any) {
      setActionError(err?.message || 'Failed to rename group.');
    } finally {
      setIsRenaming(false);
    }
  };

  const handleSearchUsers = async (q: string) => {
    setAddSearchQuery(q);
    if (!q.trim()) {
      setAddSearchResults([]);
      return;
    }

    try {
      const results = await api.searchUsers(q.trim(), 10);
      const existingMemberIds = new Set(
        activeConversationDetail.members.map((m) => m.userId),
      );
      setAddSearchResults(results.filter((u) => !existingMemberIds.has(u.id)));
    } catch {
      setAddSearchResults([]);
    }
  };

  const handleAddMember = async (user: SearchUser) => {
    setIsAddingMember(true);
    setActionError(null);
    try {
      await api.addGroupMembers(activeConversationDetail.id, [user.id]);
      await fetchConversations();
      await selectConversation(activeConversationDetail.id);
      setIsAddModalOpen(false);
      setAddSearchQuery('');
      setAddSearchResults([]);
    } catch (err: any) {
      setActionError(err?.message || 'Failed to add member.');
    } finally {
      setIsAddingMember(false);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    setActionError(null);
    try {
      await api.removeGroupMember(activeConversationDetail.id, userId);
      await fetchConversations();
      await selectConversation(activeConversationDetail.id);
      setRemovingUserId(null);
    } catch (err: any) {
      setActionError(err?.message || 'Failed to remove member.');
    }
  };

  const handleLeaveGroup = async () => {
    if (!currentUserId) return;
    setIsLeaving(true);
    setActionError(null);
    try {
      await api.removeGroupMember(activeConversationDetail.id, currentUserId);
      await fetchConversations();
      await selectConversation(null);
      onClose();
    } catch (err: any) {
      setActionError(err?.message || 'Failed to leave group.');
    } finally {
      setIsLeaving(false);
    }
  };

  return (
    <div className="w-[260px] h-full bg-surface border-l border-border flex flex-col shrink-0 overflow-y-auto select-none">
      {/* Panel Header */}
      <div className="h-16 px-4 border-b border-border flex items-center justify-between shrink-0">
        <span className="text-xs font-bold text-primary tracking-tight">
          {isDm ? 'Details' : 'Group Members'}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-lg text-secondary hover:text-primary hover:bg-surface-hover transition-colors"
          title="Close details"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 space-y-5 flex-1">
        {actionError && (
          <div className="p-2.5 rounded-xl bg-status-busy/10 border border-status-busy/25 text-[11px] text-status-busy flex items-center justify-between gap-2">
            <span>{actionError}</span>
            <button type="button" onClick={() => setActionError(null)} className="shrink-0">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        {/* Conversation Info */}
        <div className="text-center pb-4 border-b border-border">
          <div className="w-16 h-16 rounded-full mx-auto mb-2 overflow-hidden bg-accent/20 border border-border flex items-center justify-center text-accent-bright font-bold text-lg">
            {activeConversationDetail.name ? activeConversationDetail.name[0]?.toUpperCase() : 'C'}
          </div>

          {!isDm && isEditingName ? (
            <form onSubmit={handleRenameGroup} className="flex items-center gap-1 mt-2">
              <input
                type="text"
                value={renamedTitle}
                onChange={(e) => setRenamedTitle(e.target.value)}
                className="w-full text-xs p-1.5 rounded-lg bg-elevated border border-border text-primary focus:outline-none focus:border-accent-bright"
                autoFocus
              />
              <button
                type="submit"
                disabled={isRenaming || !renamedTitle.trim()}
                className="p-1.5 rounded-lg bg-accent text-white"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setIsEditingName(false)}
                className="p-1.5 rounded-lg text-muted hover:text-primary"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </form>
          ) : (
            <div className="flex items-center justify-center gap-1.5 mt-1">
              <h2 className="text-sm font-bold text-primary truncate max-w-[180px]">
                {activeConversationDetail.name || (isDm ? 'Direct Message' : 'Group Chat')}
              </h2>
              {!isDm && isOwnerOrAdmin && (
                <button
                  type="button"
                  onClick={() => setIsEditingName(true)}
                  className="p-1 rounded text-muted hover:text-primary transition-colors"
                  title="Rename Group"
                >
                  <Edit2 className="w-3 h-3" />
                </button>
              )}
            </div>
          )}

          <p className="text-[10px] text-muted mt-1">
            Created on{' '}
            {new Date(activeConversationDetail.createdAt).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </p>
        </div>

        {/* Member Management Controls (Groups only) */}
        {!isDm && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-secondary">
                Members ({activeConversationDetail.members.length})
              </span>

              {isOwnerOrAdmin && (
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(true)}
                  className="flex items-center gap-1 text-[11px] text-accent-bright hover:underline font-semibold"
                >
                  <UserPlus className="w-3 h-3" />
                  <span>Add</span>
                </button>
              )}
            </div>

            {/* Members List */}
            <div className="space-y-1">
              {activeConversationDetail.members.map((m: ConversationMemberItem) => {
                const presence = presenceByUserId[m.userId] || m.presence || 'OFFLINE';
                const isMemberSelf = m.userId === currentUserId;
                const canRemove =
                  isOwnerOrAdmin && !isMemberSelf && m.role !== 'OWNER';

                return (
                  <div
                    key={m.id}
                    className="flex items-center justify-between p-2 rounded-xl hover:bg-surface-hover transition-colors group"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Avatar
                        name={m.displayName || m.username}
                        src={m.avatarUrl}
                        size="sm"
                        presenceStatus={presence}
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1">
                          <span className="text-xs font-semibold text-primary truncate">
                            {m.displayName || m.username}
                          </span>
                          {m.role === 'OWNER' && (
                            <span title="Owner">
                              <Crown className="w-3 h-3 text-status-away shrink-0" />
                            </span>
                          )}
                          {m.role === 'ADMIN' && (
                            <span title="Admin">
                              <ShieldAlert className="w-3 h-3 text-accent-bright shrink-0" />
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-muted truncate block">
                          @{m.username}
                        </span>
                      </div>
                    </div>

                    {canRemove && (
                      <button
                        type="button"
                        onClick={() => setRemovingUserId(m.userId)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-muted hover:text-status-busy transition-all"
                        title="Remove member"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Leave Group */}
            <div className="pt-4 mt-4 border-t border-border">
              <Button
                variant="danger"
                size="sm"
                className="w-full gap-1.5 text-xs"
                onClick={handleLeaveGroup}
                disabled={isLeaving}
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>{isLeaving ? 'Leaving...' : 'Leave Group'}</span>
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Add Member Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add Group Members"
        description="Search for users to add into this group."
      >
        <div className="space-y-4">
          <Input
            placeholder="Search users..."
            value={addSearchQuery}
            onChange={(e) => handleSearchUsers(e.target.value)}
            autoFocus
          />

          <div className="max-h-56 overflow-y-auto space-y-1">
            {addSearchResults.map((user) => (
              <div
                key={user.id}
                className="flex items-center justify-between p-2 rounded-xl hover:bg-surface-hover border border-transparent hover:border-border transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Avatar name={user.displayName} src={user.avatarUrl} size="sm" />
                  <div className="min-w-0">
                    <span className="text-xs font-semibold text-primary truncate block">
                      {user.displayName}
                    </span>
                    <span className="text-[10px] text-muted truncate block">
                      @{user.username}
                    </span>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => handleAddMember(user)}
                  disabled={isAddingMember}
                  className="text-xs"
                >
                  Add
                </Button>
              </div>
            ))}
          </div>
        </div>
      </Modal>

      {/* Confirm Remove Member Modal */}
      <Modal
        isOpen={Boolean(removingUserId)}
        onClose={() => setRemovingUserId(null)}
        title="Remove Member"
        description="Are you sure you want to remove this member from the group?"
      >
        <div className="flex justify-end gap-2 mt-4">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setRemovingUserId(null)}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => removingUserId && handleRemoveMember(removingUserId)}
          >
            Remove
          </Button>
        </div>
      </Modal>
    </div>
  );
};
