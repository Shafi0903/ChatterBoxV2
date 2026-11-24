'use client';

import React, { useState } from 'react';
import { ChannelItem, ChannelType, createChannelSchema, updateChannelSchema } from '@chatterbox/shared';
import { api } from '../../lib/api';
import { useCommunityStore } from '../../stores/community.store';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { X, Hash, Megaphone } from 'lucide-react';

interface ChannelModalProps {
  isOpen: boolean;
  communityId: string;
  channel?: ChannelItem | null; // If editing
  onClose: () => void;
}

export const ChannelModal: React.FC<ChannelModalProps> = ({
  isOpen,
  communityId,
  channel,
  onClose,
}) => {
  const selectCommunity = useCommunityStore((s) => s.selectCommunity);
  const selectChannel = useCommunityStore((s) => s.selectChannel);

  const [name, setName] = useState(channel?.name || '');
  const [topic, setTopic] = useState(channel?.topic || '');
  const [type, setType] = useState<ChannelType>(channel?.type || 'TEXT');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Normalize name to lowercase slug-friendly
    const cleanName = name.toLowerCase().trim().replace(/\s+/g, '-');

    if (channel) {
      // Edit mode
      const parsed = updateChannelSchema.safeParse({
        name: cleanName,
        topic: topic || undefined,
      });

      if (!parsed.success) {
        setError(parsed.error.errors[0]?.message || 'Invalid channel name or topic');
        return;
      }

      setIsSubmitting(true);
      try {
        await api.updateChannel(channel.id, parsed.data);
        await selectCommunity(communityId, channel.id);
        onClose();
      } catch (err: any) {
        setError(err.message || 'Failed to update channel');
      } finally {
        setIsSubmitting(false);
      }
    } else {
      // Create mode
      const parsed = createChannelSchema.safeParse({
        name: cleanName,
        topic: topic || undefined,
        type,
      });

      if (!parsed.success) {
        setError(parsed.error.errors[0]?.message || 'Invalid channel fields');
        return;
      }

      setIsSubmitting(true);
      try {
        const created = await api.createChannel(communityId, parsed.data);
        await selectCommunity(communityId, created.id);
        await selectChannel(created.id);
        onClose();
      } catch (err: any) {
        setError(err.message || 'Failed to create channel');
      } finally {
        setIsSubmitting(false);
      }
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

        <h2 className="text-lg font-bold text-primary mb-1">
          {channel ? 'Edit Channel' : 'Create Channel'}
        </h2>
        <p className="text-xs text-secondary mb-4">
          {channel
            ? 'Update the channel name or topic description'
            : 'Channels are where your members converse and share updates'}
        </p>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-status-busy/15 border border-status-busy/30 text-status-busy text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {!channel && (
            <div>
              <label className="block text-xs font-semibold text-secondary uppercase tracking-wider mb-2">
                Channel Type
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setType('TEXT')}
                  className={`p-3 rounded-xl border text-left flex items-start gap-2.5 transition-colors ${
                    type === 'TEXT'
                      ? 'border-accent bg-accent/10 text-primary'
                      : 'border-border bg-elevated/40 text-secondary hover:bg-elevated'
                  }`}
                >
                  <Hash className={`w-4 h-4 mt-0.5 shrink-0 ${type === 'TEXT' ? 'text-accent-bright' : ''}`} />
                  <div>
                    <div className="text-xs font-bold">Text</div>
                    <div className="text-[10px] text-secondary leading-tight mt-0.5">
                      Open chat for all members
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setType('ANNOUNCEMENT')}
                  className={`p-3 rounded-xl border text-left flex items-start gap-2.5 transition-colors ${
                    type === 'ANNOUNCEMENT'
                      ? 'border-accent bg-accent/10 text-primary'
                      : 'border-border bg-elevated/40 text-secondary hover:bg-elevated'
                  }`}
                >
                  <Megaphone
                    className={`w-4 h-4 mt-0.5 shrink-0 ${
                      type === 'ANNOUNCEMENT' ? 'text-accent-bright' : ''
                    }`}
                  />
                  <div>
                    <div className="text-xs font-bold">Announcement</div>
                    <div className="text-[10px] text-secondary leading-tight mt-0.5">
                      Only Admins & Mods can post
                    </div>
                  </div>
                </button>
              </div>
            </div>
          )}

          <Input
            label="Channel Name"
            placeholder="e.g. general, announcements, memes"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
          />

          <div>
            <label className="block text-xs font-semibold text-secondary mb-1.5 uppercase tracking-wider">
              Channel Topic (Optional)
            </label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Let members know what this channel is about"
              className="w-full px-3.5 py-2.5 rounded-xl bg-elevated border border-border text-primary text-sm placeholder:text-secondary/50 focus:outline-hidden focus:border-accent"
            />
          </div>

          <div className="flex justify-end gap-2.5 pt-3 border-t border-border mt-5">
            <Button type="button" variant="secondary" size="md" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="md" isLoading={isSubmitting}>
              {channel ? 'Save Changes' : 'Create Channel'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
