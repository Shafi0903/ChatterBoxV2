'use client';

import React, { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Avatar } from '../ui/Avatar';
import { api } from '../../lib/api';
import { useCallStore } from '../../stores/call.store';
import { useAuthStore } from '../../stores/auth.store';
import { CallType, ConversationItem } from '@chatterbox/shared';
import { Search, Phone, Video, Loader2, User } from 'lucide-react';

interface NewCallModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ContactOption {
  userId: string;
  conversationId: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
}

export const NewCallModal: React.FC<NewCallModalProps> = ({ isOpen, onClose }) => {
  const currentUserId = useAuthStore((s) => s.user?.id);
  const { status: activeCallStatus, initiateCall } = useCallStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [searchResults, setSearchResults] = useState<ContactOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCalling, setIsCalling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load existing DM contacts when opened
  useEffect(() => {
    if (!isOpen) {
      setIsCalling(false);
      return;
    }

    setIsCalling(false);
    setSearchQuery('');
    setError(null);
    setIsLoading(true);

    (async () => {
      try {
        const convs = await api.getConversations('dm');
        const list: ContactOption[] = [];

        convs.forEach((c) => {
          if (c.type === 'DM') {
            const peer = c.members.find((m) => m.userId !== currentUserId);
            if (peer) {
              list.push({
                userId: peer.userId,
                conversationId: c.id,
                displayName: peer.displayName || peer.username,
                username: peer.username,
                avatarUrl: peer.avatarUrl || null,
              });
            }
          }
        });

        setContacts(list);
      } catch (err: any) {
        setError(err.message || 'Failed to load contacts');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [isOpen, currentUserId]);

  // Search contacts and public users
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const users = await api.searchUsers(searchQuery.trim(), 15);
        const filtered = users.filter((u) => u.id !== currentUserId);

        const mapped: ContactOption[] = filtered.map((u) => {
          // Check if an existing DM is already present
          const existing = contacts.find((c) => c.userId === u.id);
          return {
            userId: u.id,
            conversationId: existing ? existing.conversationId : '',
            displayName: u.displayName || u.username,
            username: u.username,
            avatarUrl: u.avatarUrl,
          };
        });

        setSearchResults(mapped);
      } catch {
        setSearchResults([]);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery, currentUserId, contacts]);

  const handleStartCall = async (contact: ContactOption, type: CallType) => {
    if (activeCallStatus !== 'idle' || isCalling) return;
    setIsCalling(true);
    setError(null);

    try {
      let convId = contact.conversationId;
      if (!convId) {
        // Resolve or create 1:1 DM
        const dm = await api.createDm(contact.userId);
        convId = dm.id;
      }

      setIsCalling(false);
      onClose();
      await initiateCall(convId, type);
    } catch (err: any) {
      setError(err.message || 'Failed to start call');
      setIsCalling(false);
    }
  };

  const displayedList = searchQuery.trim() ? searchResults : contacts;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Start a Call"
      description="Call a friend directly via voice or video"
      className="max-w-md"
    >
      <div className="flex flex-col gap-4 mt-2">
        {/* Search Bar */}
        <div className="relative">
          <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name or username..."
            className="pl-9 text-xs"
            autoFocus
          />
        </div>

        {error && (
          <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-medium">
            {error}
          </div>
        )}

        {/* Contact List */}
        <div className="max-h-72 overflow-y-auto flex flex-col gap-1 pr-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-10 gap-2 text-muted text-xs">
              <Loader2 className="w-4 h-4 animate-spin text-accent-bright" />
              <span>Loading contacts...</span>
            </div>
          ) : displayedList.length === 0 ? (
            <div className="text-center py-8 text-xs text-muted">
              {searchQuery.trim() ? 'No users found' : 'No direct messages yet. Search for a user above to call them.'}
            </div>
          ) : (
            displayedList.map((contact) => (
              <div
                key={contact.userId}
                className="flex items-center justify-between p-2.5 rounded-xl hover:bg-elevated/60 transition-colors border border-transparent hover:border-border"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Avatar name={contact.displayName} src={contact.avatarUrl} size="sm" />
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-semibold text-primary truncate">
                      {contact.displayName}
                    </span>
                    <span className="text-[11px] text-muted truncate">@{contact.username}</span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                  <button
                    type="button"
                    disabled={activeCallStatus !== 'idle' || isCalling}
                    onClick={() => handleStartCall(contact, CallType.AUDIO)}
                    className="p-2 rounded-xl bg-elevated hover:bg-emerald-500/15 border border-border hover:border-emerald-500/30 text-secondary hover:text-emerald-400 transition-colors disabled:opacity-40"
                    title={`Voice call ${contact.displayName}`}
                    aria-label={`Voice call ${contact.displayName}`}
                  >
                    <Phone className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={activeCallStatus !== 'idle' || isCalling}
                    onClick={() => handleStartCall(contact, CallType.VIDEO)}
                    className="p-2 rounded-xl bg-elevated hover:bg-accent/15 border border-border hover:border-accent/30 text-secondary hover:text-accent-bright transition-colors disabled:opacity-40"
                    title={`Video call ${contact.displayName}`}
                    aria-label={`Video call ${contact.displayName}`}
                  >
                    <Video className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
};
