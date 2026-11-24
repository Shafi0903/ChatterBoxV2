'use client';

import React, { useState, useEffect } from 'react';
import { CommunityInviteItem } from '@chatterbox/shared';
import { api } from '../../lib/api';
import { Button } from '../ui/Button';
import { X, Copy, Check, Plus, Clock, Users } from 'lucide-react';

interface InviteModalProps {
  isOpen: boolean;
  communityId: string;
  communityName: string;
  onClose: () => void;
}

export const InviteModal: React.FC<InviteModalProps> = ({
  isOpen,
  communityId,
  communityName,
  onClose,
}) => {
  const [invites, setInvites] = useState<CommunityInviteItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // New invite options
  const [maxUses, setMaxUses] = useState<number | ''>('');
  const [expiresInHours, setExpiresInHours] = useState<number | ''>(24);
  const [error, setError] = useState<string | null>(null);

  const fetchInvites = async () => {
    setIsLoading(true);
    try {
      const data = await api.getInvites(communityId);
      setInvites(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load invites');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && communityId) {
      fetchInvites();
    }
  }, [isOpen, communityId]);

  if (!isOpen) return null;

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      const created = await api.createInvite(communityId, {
        maxUses: maxUses === '' ? null : Number(maxUses),
        expiresInHours: expiresInHours === '' ? null : Number(expiresInHours),
      });
      setInvites((prev) => [created, ...prev]);
    } catch (err: any) {
      setError(err.message || 'Failed to generate invite');
    } finally {
      setIsGenerating(false);
    }
  };

  const copyInviteUrl = (code: string) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const url = `${origin}/invite/${code}`;
    navigator.clipboard.writeText(url);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-surface border border-border rounded-2xl p-6 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-secondary hover:text-primary p-1 rounded-lg hover:bg-elevated transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <h2 className="text-lg font-bold text-primary mb-1">Invite Friends</h2>
        <p className="text-xs text-secondary mb-4">
          Invite people to <span className="text-primary font-medium">{communityName}</span>
        </p>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-status-busy/15 border border-status-busy/30 text-status-busy text-xs">
            {error}
          </div>
        )}

        {/* Create Invite Controls */}
        <div className="p-4 rounded-xl bg-elevated/40 border border-border mb-5">
          <div className="text-xs font-bold text-primary mb-2.5">Generate New Invite Link</div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-[10px] font-semibold text-secondary uppercase tracking-wider mb-1">
                Expire After
              </label>
              <select
                value={expiresInHours}
                onChange={(e) => setExpiresInHours(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg bg-elevated border border-border text-primary text-xs focus:outline-hidden focus:border-accent"
              >
                <option value={1}>1 hour</option>
                <option value={6}>6 hours</option>
                <option value={24}>1 day (24 hours)</option>
                <option value={72}>3 days (72 hours)</option>
                <option value={168}>7 days</option>
                <option value="">Never expire</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-secondary uppercase tracking-wider mb-1">
                Max Uses
              </label>
              <select
                value={maxUses}
                onChange={(e) => setMaxUses(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg bg-elevated border border-border text-primary text-xs focus:outline-hidden focus:border-accent"
              >
                <option value="">No limit</option>
                <option value={1}>1 use</option>
                <option value={5}>5 uses</option>
                <option value={10}>10 uses</option>
                <option value={25}>25 uses</option>
                <option value={100}>100 uses</option>
              </select>
            </div>
          </div>

          <Button
            type="button"
            variant="primary"
            size="sm"
            isLoading={isGenerating}
            onClick={handleGenerate}
            className="w-full flex items-center justify-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            Generate New Link
          </Button>
        </div>

        {/* Existing Invites List */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-secondary uppercase tracking-wider">
            Active Invites ({invites.length})
          </div>

          <div className="max-h-52 overflow-y-auto space-y-2 pr-1">
            {isLoading ? (
              <div className="text-xs text-secondary py-4 text-center">Loading invites...</div>
            ) : invites.length === 0 ? (
              <div className="text-xs text-secondary py-4 text-center bg-elevated/20 rounded-xl border border-dashed border-border">
                No active invites generated yet. Click generate above to create one.
              </div>
            ) : (
              invites.map((inv) => (
                <div
                  key={inv.id}
                  className="p-3 rounded-xl bg-elevated/60 border border-border flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="font-mono text-xs font-bold text-accent-bright">
                      {inv.code}
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-secondary mt-0.5">
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {inv.uses} {inv.maxUses ? `/ ${inv.maxUses} uses` : 'uses'}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {inv.expiresAt
                          ? `Expires ${new Date(inv.expiresAt).toLocaleDateString()}`
                          : 'Never expires'}
                      </span>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => copyInviteUrl(inv.code)}
                    className="shrink-0 flex items-center gap-1.5"
                  >
                    {copiedCode === inv.code ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-accent-bright" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Copy Link
                      </>
                    )}
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="flex justify-end pt-4 border-t border-border mt-5">
          <Button type="button" variant="secondary" size="md" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
};
