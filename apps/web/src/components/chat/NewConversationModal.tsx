import React, { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { Avatar } from '../ui/Avatar';
import { api } from '../../lib/api';
import { useChatStore } from '../../stores/chat.store';
import { useAuthStore } from '../../stores/auth.store';
import { Search, UserPlus, Users2, X, Check } from 'lucide-react';
import { cn } from '../../lib/utils';

interface NewConversationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface SearchUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
}

export const NewConversationModal: React.FC<NewConversationModalProps> = ({
  isOpen,
  onClose,
}) => {
  const currentUserId = useAuthStore((s) => s.user?.id);
  const selectConversation = useChatStore((s) => s.selectConversation);
  const fetchConversations = useChatStore((s) => s.fetchConversations);

  const [tab, setTab] = useState<'dm' | 'group'>('dm');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Group creation state
  const [groupName, setGroupName] = useState('');
  const [selectedGroupMembers, setSelectedGroupMembers] = useState<SearchUser[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state on open/close
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setSearchResults([]);
      setGroupName('');
      setSelectedGroupMembers([]);
      setError(null);
      setIsSearching(false);
    }
  }, [isOpen, tab]);

  // Debounced search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const users = await api.searchUsers(searchQuery.trim(), 20);
        // Exclude self
        setSearchResults(users.filter((u) => u.id !== currentUserId));
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery, currentUserId]);

  const handleStartDm = async (user: SearchUser) => {
    setIsSubmitting(true);
    setError(null);
    try {
      const conv = await api.createDm(user.id);
      await fetchConversations();
      await selectConversation(conv.id);
      onClose();
    } catch {
      setError('Failed to start direct message. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleGroupMember = (user: SearchUser) => {
    setSelectedGroupMembers((prev) => {
      const exists = prev.some((u) => u.id === user.id);
      if (exists) {
        return prev.filter((u) => u.id !== user.id);
      }
      return [...prev, user];
    });
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim() || selectedGroupMembers.length === 0) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const memberIds = selectedGroupMembers.map((u) => u.id);
      const conv = await api.createGroup(groupName.trim(), memberIds);
      await fetchConversations();
      await selectConversation(conv.id);
      onClose();
    } catch {
      setError('Failed to create group. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Start a Conversation"
      description="Connect directly with friends or create a group chat."
    >
      {/* Tabs */}
      <div className="flex border-b border-border mb-4">
        <button
          type="button"
          onClick={() => setTab('dm')}
          className={cn(
            'flex-1 pb-2.5 text-xs font-semibold border-b-2 transition-colors flex items-center justify-center gap-1.5',
            tab === 'dm'
              ? 'border-accent-bright text-accent-bright'
              : 'border-transparent text-secondary hover:text-primary',
          )}
        >
          <UserPlus className="w-3.5 h-3.5" />
          <span>Direct Message</span>
        </button>
        <button
          type="button"
          onClick={() => setTab('group')}
          className={cn(
            'flex-1 pb-2.5 text-xs font-semibold border-b-2 transition-colors flex items-center justify-center gap-1.5',
            tab === 'group'
              ? 'border-accent-bright text-accent-bright'
              : 'border-transparent text-secondary hover:text-primary',
          )}
        >
          <Users2 className="w-3.5 h-3.5" />
          <span>New Group</span>
        </button>
      </div>

      {error && (
        <div className="mb-4 p-2.5 rounded-xl bg-status-busy/10 border border-status-busy/30 text-xs text-status-busy">
          {error}
        </div>
      )}

      {/* Tab 1: DM */}
      {tab === 'dm' && (
        <div className="space-y-4">
          <Input
            placeholder="Search users by name or @username..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
          />

          <div className="max-h-60 overflow-y-auto space-y-1">
            {isSearching ? (
              <p className="text-xs text-muted text-center py-6">Searching users...</p>
            ) : searchQuery.trim() && searchResults.length === 0 ? (
              <p className="text-xs text-muted text-center py-6">
                No users found matching &ldquo;{searchQuery}&rdquo;.
              </p>
            ) : searchResults.length > 0 ? (
              searchResults.map((user) => (
                <button
                  key={user.id}
                  disabled={isSubmitting}
                  onClick={() => handleStartDm(user)}
                  className="w-full text-left p-2.5 rounded-xl flex items-center justify-between hover:bg-surface-hover border border-transparent hover:border-border transition-colors group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Avatar
                      name={user.displayName}
                      src={user.avatarUrl}
                      size="sm"
                    />
                    <div className="min-w-0">
                      <span className="text-xs font-semibold text-primary truncate block">
                        {user.displayName}
                      </span>
                      <span className="text-[10px] text-muted truncate block">
                        @{user.username}
                      </span>
                    </div>
                  </div>
                  <span className="text-[11px] font-medium text-accent-bright group-hover:underline">
                    Chat
                  </span>
                </button>
              ))
            ) : (
              <p className="text-xs text-muted text-center py-6">
                Type a name or username above to find people to chat with.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Group */}
      {tab === 'group' && (
        <form onSubmit={handleCreateGroup} className="space-y-4">
          <Input
            label="Group Name"
            placeholder="e.g. Design Team, Gaming Squad"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            required
            autoFocus
          />

          {/* Selected Member Chips */}
          {selectedGroupMembers.length > 0 && (
            <div className="flex flex-wrap gap-1.5 p-2 rounded-xl bg-elevated/50 border border-border">
              {selectedGroupMembers.map((member) => (
                <span
                  key={member.id}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-accent/20 border border-accent/30 text-accent-bright text-[11px] font-medium"
                >
                  <span>{member.displayName}</span>
                  <button
                    type="button"
                    onClick={() => handleToggleGroupMember(member)}
                    className="hover:text-status-busy transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Search for group members */}
          <div>
            <label className="block text-xs font-medium text-secondary mb-1">
              Add Members ({selectedGroupMembers.length} selected)
            </label>
            <Input
              placeholder="Search people to add..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="max-h-48 overflow-y-auto space-y-1">
            {isSearching ? (
              <p className="text-xs text-muted text-center py-4">Searching users...</p>
            ) : searchResults.length > 0 ? (
              searchResults.map((user) => {
                const isSelected = selectedGroupMembers.some((u) => u.id === user.id);
                return (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => handleToggleGroupMember(user)}
                    className={cn(
                      'w-full text-left p-2 rounded-xl flex items-center justify-between border transition-colors',
                      isSelected
                        ? 'bg-accent/15 border-accent-bright/50'
                        : 'hover:bg-surface-hover border-transparent',
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Avatar
                        name={user.displayName}
                        src={user.avatarUrl}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <span className="text-xs font-semibold text-primary truncate block">
                          {user.displayName}
                        </span>
                        <span className="text-[10px] text-muted truncate block">
                          @{user.username}
                        </span>
                      </div>
                    </div>
                    {isSelected && (
                      <span className="w-5 h-5 rounded-full bg-accent text-white flex items-center justify-center">
                        <Check className="w-3 h-3" />
                      </span>
                    )}
                  </button>
                );
              })
            ) : searchQuery.trim() ? (
              <p className="text-xs text-muted text-center py-4">No users found.</p>
            ) : null}
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={isSubmitting || !groupName.trim() || selectedGroupMembers.length === 0}
            >
              {isSubmitting ? 'Creating...' : `Create Group (${selectedGroupMembers.length})`}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
};
