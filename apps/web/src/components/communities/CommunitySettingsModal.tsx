'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CommunityDetail, updateCommunitySchema } from '@chatterbox/shared';
import { api } from '../../lib/api';
import { useCommunityStore } from '../../stores/community.store';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { X, Globe, Lock, Trash2, AlertTriangle } from 'lucide-react';

interface CommunitySettingsModalProps {
  isOpen: boolean;
  community: CommunityDetail;
  onClose: () => void;
}

export const CommunitySettingsModal: React.FC<CommunitySettingsModalProps> = ({
  isOpen,
  community,
  onClose,
}) => {
  const router = useRouter();
  const fetchMyCommunities = useCommunityStore((s) => s.fetchMyCommunities);
  const selectCommunity = useCommunityStore((s) => s.selectCommunity);

  const [name, setName] = useState(community.name);
  const [description, setDescription] = useState(community.description || '');
  const [isPublic, setIsPublic] = useState(community.isPublic);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Danger zone state
  const [confirmName, setConfirmName] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const isOwner = community.callerRole === 'OWNER';

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const parsed = updateCommunitySchema.safeParse({
      name,
      description: description || undefined,
      isPublic,
    });

    if (!parsed.success) {
      setError(parsed.error.errors[0]?.message || 'Invalid fields');
      return;
    }

    setIsSaving(true);
    try {
      await api.updateCommunity(community.id, parsed.data);
      await fetchMyCommunities();
      await selectCommunity(community.id);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to update community');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (confirmName !== community.name) {
      setDeleteError(`Type "${community.name}" exactly to confirm deletion`);
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);
    try {
      await api.deleteCommunity(community.id);
      await fetchMyCommunities();
      await selectCommunity(null);
      router.push('/communities');
      onClose();
    } catch (err: any) {
      setDeleteError(err.message || 'Failed to delete community');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-surface border border-border rounded-2xl p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-secondary hover:text-primary p-1 rounded-lg hover:bg-elevated transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <h2 className="text-lg font-bold text-primary mb-1">Community Overview</h2>
        <p className="text-xs text-secondary mb-4">
          Manage general settings and discoverability for this community
        </p>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-status-busy/15 border border-status-busy/30 text-status-busy text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-4">
          <Input
            label="Community Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />

          <div>
            <label className="block text-xs font-semibold text-secondary mb-1.5 uppercase tracking-wider">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3.5 py-2.5 rounded-xl bg-elevated border border-border text-primary text-sm placeholder:text-secondary/50 focus:outline-hidden focus:border-accent resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-secondary mb-2 uppercase tracking-wider">
              Visibility
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
                    Visible on Discover, open to any user
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
            <Button type="submit" variant="primary" size="md" isLoading={isSaving}>
              Save Changes
            </Button>
          </div>
        </form>

        {/* Danger Zone: Only for Owner */}
        {isOwner && (
          <div className="mt-8 pt-6 border-t border-status-busy/30">
            <div className="flex items-center gap-2 text-status-busy font-bold text-sm mb-2">
              <AlertTriangle className="w-4 h-4" />
              Danger Zone
            </div>
            <p className="text-xs text-secondary mb-3 leading-relaxed">
              Deleting this community is permanent. All channels, channel messages, and invites will be
              permanently wiped from PostgreSQL.
            </p>

            {deleteError && (
              <div className="mb-3 p-2.5 rounded-xl bg-status-busy/15 border border-status-busy/30 text-status-busy text-xs">
                {deleteError}
              </div>
            )}

            <div className="space-y-3 p-4 rounded-xl bg-status-busy/10 border border-status-busy/20">
              <label className="block text-xs font-medium text-secondary">
                To confirm, type <span className="font-bold text-primary font-mono">{community.name}</span>:
              </label>
              <Input
                placeholder={community.name}
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
              />
              <Button
                type="button"
                variant="danger"
                size="md"
                isLoading={isDeleting}
                disabled={confirmName !== community.name}
                onClick={handleDelete}
                className="w-full flex items-center justify-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Permanently Delete Community
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
