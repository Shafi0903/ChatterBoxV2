'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createCommunitySchema, CreateCommunityDto } from '@chatterbox/shared';
import { api, ApiError } from '../../lib/api';
import { useCommunityStore } from '../../stores/community.store';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { X, Sparkles, Key, Globe, Lock } from 'lucide-react';

interface CreateCommunityModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CreateCommunityModal: React.FC<CreateCommunityModalProps> = ({ isOpen, onClose }) => {
  const router = useRouter();
  const selectCommunity = useCommunityStore((s) => s.selectCommunity);
  const fetchMyCommunities = useCommunityStore((s) => s.fetchMyCommunities);

  const [activeTab, setActiveTab] = useState<'create' | 'join'>('create');

  // Create state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Join state
  const [inviteCode, setInviteCode] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);

  if (!isOpen) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    const parsed = createCommunitySchema.safeParse({
      name,
      description: description || undefined,
      isPublic,
    });

    if (!parsed.success) {
      setCreateError(parsed.error.errors[0]?.message || 'Invalid form fields');
      return;
    }

    setIsCreating(true);
    try {
      const created = await api.createCommunity(parsed.data);
      await fetchMyCommunities();
      await selectCommunity(created.id);
      router.push(`/communities?c=${created.id}`);
      onClose();
    } catch (err: any) {
      setCreateError(err.message || 'Failed to create community');
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setJoinError(null);

    const trimmed = inviteCode.trim();
    if (!trimmed) {
      setJoinError('Please enter an invite code');
      return;
    }

    setIsJoining(true);
    try {
      const joined = await api.joinByInviteCode(trimmed);
      await fetchMyCommunities();
      await selectCommunity(joined.id);
      router.push(`/communities?c=${joined.id}`);
      onClose();
    } catch (err: any) {
      setJoinError(err.message || 'Invalid or expired invite code');
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-md bg-surface border border-border rounded-2xl p-6 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-secondary hover:text-primary p-1 rounded-lg hover:bg-elevated transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Tab Toggle */}
        <div className="flex border-b border-border pb-3 mb-5 gap-4">
          <button
            type="button"
            onClick={() => setActiveTab('create')}
            className={`text-sm font-semibold pb-2 border-b-2 transition-colors ${
              activeTab === 'create'
                ? 'border-accent text-accent-bright'
                : 'border-transparent text-secondary hover:text-primary'
            }`}
          >
            Create Community
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('join')}
            className={`text-sm font-semibold pb-2 border-b-2 transition-colors ${
              activeTab === 'join'
                ? 'border-accent text-accent-bright'
                : 'border-transparent text-secondary hover:text-primary'
            }`}
          >
            Join via Invite Code
          </button>
        </div>

        {activeTab === 'create' ? (
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="text-xs text-secondary mb-2">
              Communities are real spaces for discussion and channels. Give your server a name and personality.
            </div>

            {createError && (
              <div className="p-3 rounded-xl bg-status-busy/15 border border-status-busy/30 text-status-busy text-xs">
                {createError}
              </div>
            )}

            <Input
              label="Community Name"
              placeholder="e.g. Cyberpunk Lounge"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />

            <div>
              <label className="block text-xs font-semibold text-secondary mb-1.5 uppercase tracking-wider">
                Description (Optional)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this community about?"
                rows={3}
                className="w-full px-3.5 py-2.5 rounded-xl bg-elevated border border-border text-primary text-sm placeholder:text-secondary/50 focus:outline-hidden focus:border-accent resize-none"
              />
            </div>

            <div className="pt-1">
              <label className="block text-xs font-semibold text-secondary mb-2 uppercase tracking-wider">
                Privacy
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setIsPublic(true)}
                  className={`p-3 rounded-xl border text-left flex items-start gap-2.5 transition-colors ${
                    isPublic
                      ? 'border-accent bg-accent/10 text-primary'
                      : 'border-border bg-elevated/40 text-secondary hover:bg-elevated'
                  }`}
                >
                  <Globe className={`w-4 h-4 mt-0.5 shrink-0 ${isPublic ? 'text-accent-bright' : ''}`} />
                  <div>
                    <div className="text-xs font-bold">Public</div>
                    <div className="text-[10px] text-secondary leading-tight mt-0.5">
                      Visible in Discover, open to anyone
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setIsPublic(false)}
                  className={`p-3 rounded-xl border text-left flex items-start gap-2.5 transition-colors ${
                    !isPublic
                      ? 'border-accent bg-accent/10 text-primary'
                      : 'border-border bg-elevated/40 text-secondary hover:bg-elevated'
                  }`}
                >
                  <Lock className={`w-4 h-4 mt-0.5 shrink-0 ${!isPublic ? 'text-accent-bright' : ''}`} />
                  <div>
                    <div className="text-xs font-bold">Private</div>
                    <div className="text-[10px] text-secondary leading-tight mt-0.5">
                      Invite code only, hidden from Discover
                    </div>
                  </div>
                </button>
              </div>
            </div>

            <div className="flex justify-end gap-2.5 pt-3 border-t border-border mt-5">
              <Button type="button" variant="secondary" size="md" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="md" isLoading={isCreating}>
                Create Community
              </Button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleJoin} className="space-y-4">
            <div className="text-xs text-secondary mb-2">
              Have an invite code from a friend? Enter the 8-character code below to join instantly.
            </div>

            {joinError && (
              <div className="p-3 rounded-xl bg-status-busy/15 border border-status-busy/30 text-status-busy text-xs">
                {joinError}
              </div>
            )}

            <Input
              label="Invite Code"
              placeholder="e.g. 7f9a2b1c"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              required
              autoFocus
            />

            <div className="flex justify-end gap-2.5 pt-3 border-t border-border mt-5">
              <Button type="button" variant="secondary" size="md" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="md" isLoading={isJoining}>
                Join Community
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
