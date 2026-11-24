'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../../../lib/api';
import { useCallStore } from '../../../stores/call.store';
import { CallHistoryItem, CallType } from '@chatterbox/shared';
import { Avatar } from '../../../components/ui/Avatar';
import {
  PhoneCall,
  Phone,
  Video,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  PhoneOff,
  Loader2,
  Calendar,
} from 'lucide-react';
import { cn } from '../../../lib/utils';

export default function CallsPage() {
  const [calls, setCalls] = useState<CallHistoryItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const { status: activeCallStatus, initiateCall } = useCallStore();

  const fetchHistory = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.getCallHistory(undefined, 30);
      setCalls(res.data);
      setNextCursor(res.meta.nextCursor);
      setHasMore(res.meta.hasMore);
    } catch {
      // Ignored
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const loadMore = async () => {
    if (!nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const res = await api.getCallHistory(nextCursor, 30);
      setCalls((prev) => [...prev, ...res.data]);
      setNextCursor(res.meta.nextCursor);
      setHasMore(res.meta.hasMore);
    } catch {
      // Ignored
    } finally {
      setIsLoadingMore(false);
    }
  };

  const formatDuration = (sec: number | null) => {
    if (sec === null || sec === undefined) return null;
    const mins = Math.floor(sec / 60);
    const remainingSecs = sec % 60;
    if (mins === 0) return `${remainingSecs}s`;
    return `${mins}m ${remainingSecs}s`;
  };

  const formatCallDate = (isoDate: string | Date) => {
    const d = new Date(isoDate);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();

    const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (isToday) return `Today at ${timeStr}`;
    return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${timeStr}`;
  };

  const getCallStatusMeta = (call: CallHistoryItem) => {
    if (call.status === 'MISSED') {
      return {
        label: 'Missed Call',
        icon: PhoneMissed,
        color: 'text-rose-400',
        bg: 'bg-rose-500/10 border-rose-500/20',
      };
    }
    if (call.status === 'REJECTED') {
      return {
        label: 'Declined',
        icon: PhoneOff,
        color: 'text-amber-400',
        bg: 'bg-amber-500/10 border-amber-500/20',
      };
    }
    if (call.direction === 'outgoing') {
      return {
        label: 'Outgoing',
        icon: PhoneOutgoing,
        color: 'text-accent-bright',
        bg: 'bg-accent/10 border-accent/20',
      };
    }
    return {
      label: 'Incoming',
      icon: PhoneIncoming,
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10 border-emerald-500/20',
    };
  };

  return (
    <div className="py-6 max-w-4xl mx-auto flex flex-col gap-6 select-none">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-accent/15 border border-accent/25 flex items-center justify-center text-accent-bright shadow-neon">
            <PhoneCall className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-primary">Call History</h1>
            <p className="text-xs text-muted">Recent voice and video calls</p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted">
          <Loader2 className="w-6 h-6 animate-spin text-accent-bright" />
          <span className="text-xs">Loading call history...</span>
        </div>
      ) : calls.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 px-4 text-center rounded-3xl bg-surface/50 border border-border">
          <div className="w-14 h-14 rounded-2xl bg-elevated flex items-center justify-center text-muted mb-3">
            <PhoneCall className="w-7 h-7 opacity-40" />
          </div>
          <h2 className="text-sm font-bold text-primary">No calls yet</h2>
          <p className="text-xs text-muted max-w-sm mt-1 leading-relaxed">
            When you make or receive 1:1 voice and video calls in direct messages, they will appear here.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {calls.map((call) => {
            const statusMeta = getCallStatusMeta(call);
            const StatusIcon = statusMeta.icon;
            const durationText = formatDuration(call.durationSec);

            return (
              <div
                key={call.id}
                className="flex items-center justify-between p-4 rounded-2xl bg-surface hover:bg-surface-hover/80 border border-border transition-all duration-150 group"
              >
                {/* Peer & Details */}
                <div className="flex items-center gap-3.5 min-w-0">
                  <Avatar
                    name={call.peer.displayName || call.peer.username}
                    src={call.peer.avatarUrl}
                    size="md"
                  />

                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-semibold text-primary truncate">
                      {call.peer.displayName || call.peer.username}
                    </span>

                    <div className="flex items-center gap-2 text-xs text-muted mt-0.5">
                      <div className={cn('inline-flex items-center gap-1 font-medium', statusMeta.color)}>
                        <StatusIcon className="w-3.5 h-3.5" />
                        <span>{statusMeta.label}</span>
                      </div>

                      <span>•</span>

                      <div className="flex items-center gap-1 text-[11px] text-muted">
                        <Calendar className="w-3 h-3" />
                        <span>{formatCallDate(call.createdAt)}</span>
                      </div>

                      {durationText && (
                        <>
                          <span>•</span>
                          <span className="font-mono text-[11px] text-secondary">{durationText}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Call Type & Quick Callback Actions */}
                <div className="flex items-center gap-2">
                  <div className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-elevated border border-border text-[11px] font-semibold text-secondary">
                    {call.type === 'VIDEO' ? <Video className="w-3 h-3 text-accent-bright" /> : <Phone className="w-3 h-3 text-emerald-400" />}
                    <span>{call.type === 'VIDEO' ? 'Video' : 'Voice'}</span>
                  </div>

                  <div className="flex items-center gap-1 ml-2">
                    {/* 1-Click Voice Call Back */}
                    <button
                      type="button"
                      disabled={activeCallStatus !== 'idle'}
                      onClick={() => initiateCall(call.conversationId, CallType.AUDIO)}
                      className="p-2 rounded-xl bg-elevated hover:bg-emerald-500/15 border border-border hover:border-emerald-500/30 text-secondary hover:text-emerald-400 transition-colors disabled:opacity-40 disabled:pointer-events-none"
                      title={`Call back ${call.peer.displayName || call.peer.username} (Voice)`}
                    >
                      <Phone className="w-4 h-4" />
                    </button>

                    {/* 1-Click Video Call Back */}
                    <button
                      type="button"
                      disabled={activeCallStatus !== 'idle'}
                      onClick={() => initiateCall(call.conversationId, CallType.VIDEO)}
                      className="p-2 rounded-xl bg-elevated hover:bg-accent/15 border border-border hover:border-accent/30 text-secondary hover:text-accent-bright transition-colors disabled:opacity-40 disabled:pointer-events-none"
                      title={`Call back ${call.peer.displayName || call.peer.username} (Video)`}
                    >
                      <Video className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {hasMore && (
            <div className="flex justify-center pt-4">
              <button
                type="button"
                onClick={loadMore}
                disabled={isLoadingMore}
                className="px-5 py-2 rounded-xl bg-surface hover:bg-surface-hover border border-border text-xs font-semibold text-secondary hover:text-primary transition-colors disabled:opacity-50"
              >
                {isLoadingMore ? 'Loading more...' : 'Load older calls'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
