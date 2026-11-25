import React, { useMemo, useState, useRef, useEffect } from 'react';
import { ConversationMemberItem, CallType } from '@chatterbox/shared';
import { useAuthStore } from '../../stores/auth.store';
import { useChatStore } from '../../stores/chat.store';
import { useCallStore } from '../../stores/call.store';
import { MessageFeed } from './MessageFeed';
import { MessageComposer } from './MessageComposer';
import { SafetyNumberModal } from './SafetyNumberModal';
import { Avatar } from '../ui/Avatar';
import { api } from '../../lib/api';
import {
  ArrowLeft,
  Users2,
  PanelRight,
  MessageSquare,
  Lock,
  Shield,
  Loader2,
  Phone,
  Video,
  AlertCircle,
} from 'lucide-react';
import { cn } from '../../lib/utils';

interface ActiveChatProps {
  conversationId: string | null;
  onBack: () => void;
}

export const ActiveChat: React.FC<ActiveChatProps> = ({
  conversationId,
  onBack,
}) => {
  const currentUserId = useAuthStore((s) => s.user?.id);
  const {
    activeConversationDetail,
    presenceByUserId,
    typingByConversationId,
    peerKeyWarnings,
    dismissPeerKeyWarning,
    isDetailsOpen,
    toggleDetails,
  } = useChatStore();

  const isDm = activeConversationDetail?.type === 'DM';
  const isEncrypted = Boolean(activeConversationDetail?.isEncrypted);
  const [isSafetyModalOpen, setIsSafetyModalOpen] = useState(false);
  const [isEnablingE2ee, setIsEnablingE2ee] = useState(false);
  const [enableE2eeError, setEnableE2eeError] = useState<string | null>(null);
  const e2eeErrorTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setEnableE2eeError(null);
    return () => {
      if (e2eeErrorTimerRef.current) {
        clearTimeout(e2eeErrorTimerRef.current);
      }
    };
  }, [conversationId]);

  // Reactive call store state for header call buttons & errors
  const callStatus = useCallStore((s) => s.status);
  const callError = useCallStore((s) => s.callError);
  const initiateCall = useCallStore((s) => s.initiateCall);

  // For DMs, find the other member
  const otherMember = useMemo(() => {
    if (!isDm || !activeConversationDetail) return null;
    return activeConversationDetail.members.find(
      (m: ConversationMemberItem) => m.userId !== currentUserId,
    );
  }, [isDm, activeConversationDetail, currentUserId]);

  const handleEnableE2ee = async () => {
    if (!conversationId) return;
    setIsEnablingE2ee(true);
    setEnableE2eeError(null);
    if (e2eeErrorTimerRef.current) {
      clearTimeout(e2eeErrorTimerRef.current);
    }
    try {
      await api.enableConversationE2ee(conversationId);
      // Update local conversation detail state
      useChatStore.setState((s) => ({
        activeConversationDetail: s.activeConversationDetail
          ? { ...s.activeConversationDetail, isEncrypted: true }
          : null,
        conversations: s.conversations.map((c) =>
          c.id === conversationId ? { ...c, isEncrypted: true } : c,
        ),
      }));
    } catch (err: any) {
      const msg =
        err?.message ||
        'Cannot enable E2EE: both participants must have registered an active E2EE device.';
      setEnableE2eeError(msg);
      e2eeErrorTimerRef.current = setTimeout(() => setEnableE2eeError(null), 10000);
    } finally {
      setIsEnablingE2ee(false);
    }
  };

  const displayName = isDm
    ? otherMember?.displayName || otherMember?.username || 'Direct Message'
    : activeConversationDetail?.name || 'Group Chat';

  const avatarUrl = isDm
    ? otherMember?.avatarUrl
    : activeConversationDetail?.avatarUrl;

  const presenceStatus = isDm && otherMember ? presenceByUserId[otherMember.userId] : undefined;

  // Real online count for groups
  const onlineCount = useMemo(() => {
    if (!activeConversationDetail || isDm) return 0;
    return activeConversationDetail.members.filter(
      (m: ConversationMemberItem) => presenceByUserId[m.userId] === 'ONLINE',
    ).length;
  }, [activeConversationDetail, isDm, presenceByUserId]);

  // Typing users for active conversation
  const typers = useMemo(() => {
    if (!conversationId) return [];
    return typingByConversationId[conversationId] || [];
  }, [conversationId, typingByConversationId]);

  const typingText = useMemo(() => {
    if (typers.length === 0) return null;
    if (typers.length === 1) return `${typers[0].displayName} is typing...`;
    if (typers.length === 2) return `${typers[0].displayName} and ${typers[1].displayName} are typing...`;
    return `${typers.length} people are typing...`;
  }, [typers]);

  // If no conversation selected
  if (!conversationId || !activeConversationDetail) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-canvas select-none">
        <div className="w-14 h-14 rounded-2xl bg-accent/15 border border-accent/25 flex items-center justify-center text-accent-bright mb-4 shadow-neon">
          <MessageSquare className="w-7 h-7" />
        </div>
        <h2 className="text-base font-bold text-primary">Your Messages</h2>
        <p className="text-xs text-muted max-w-sm mt-1.5 leading-relaxed">
          Select a chat from the conversation list or click + to start a new 1:1 direct message or group conversation.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-canvas overflow-hidden min-w-0">
      {/* Chat Header */}
      <div className="h-16 px-4 bg-surface border-b border-border flex items-center justify-between shrink-0 select-none">
        <div className="flex items-center gap-3 min-w-0">
          {/* Mobile Back Button */}
          <button
            type="button"
            onClick={onBack}
            className="md:hidden p-1.5 -ml-1 rounded-xl text-secondary hover:text-primary hover:bg-surface-hover transition-colors"
            title="Back to conversations"
            aria-label="Back to conversations"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          {/* Avatar */}
          {isDm ? (
            <Avatar
              name={displayName}
              src={avatarUrl}
              size="md"
              presenceStatus={presenceStatus}
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-accent/20 border border-border flex items-center justify-center text-accent-bright shrink-0">
              <Users2 className="w-4 h-4" />
            </div>
          )}

          {/* Title & Presence */}
          <div className="flex flex-col min-w-0">
            <span className="text-xs sm:text-sm font-semibold text-primary truncate">
              {displayName}
            </span>
            <div className="flex items-center gap-1.5 text-[10px] text-muted">
              {isDm ? (
                <>
                  <span
                    className={cn(
                      'w-1.5 h-1.5 rounded-full',
                      presenceStatus === 'ONLINE' ? 'bg-status-online' : 'bg-status-offline',
                    )}
                  />
                  <span>{presenceStatus === 'ONLINE' ? 'Online' : 'Offline'}</span>
                </>
              ) : (
                <span>
                  {activeConversationDetail.members.length} members • {onlineCount} online
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-2">
          {/* Phase 7 1:1 Voice & Video Call Buttons */}
          {isDm && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={callStatus !== 'idle'}
                onClick={() => initiateCall(conversationId, CallType.AUDIO)}
                className="p-2 rounded-xl text-secondary hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors disabled:opacity-40 disabled:pointer-events-none"
                title={callStatus !== 'idle' ? 'Call in progress' : 'Start Voice Call'}
                aria-label="Start Voice Call"
              >
                <Phone className="w-4 h-4" />
              </button>
              <button
                type="button"
                disabled={callStatus !== 'idle'}
                onClick={() => initiateCall(conversationId, CallType.VIDEO)}
                className="p-2 rounded-xl text-secondary hover:text-accent-bright hover:bg-accent/15 transition-colors disabled:opacity-40 disabled:pointer-events-none"
                title={callStatus !== 'idle' ? 'Call in progress' : 'Start Video Call'}
                aria-label="Start Video Call"
              >
                <Video className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* E2EE Controls for 1:1 DMs */}
          {isDm && (
            <>
              {isEncrypted ? (
                <button
                  type="button"
                  onClick={() => setIsSafetyModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-500/10 border border-emerald-500/25 hover:bg-emerald-500/20 text-emerald-400 text-[11px] font-semibold transition-all duration-150 shadow-sm"
                  title="Verified End-to-End Encrypted. Click to verify safety number."
                >
                  <Lock className="w-3 h-3 text-emerald-400" />
                  <span className="hidden sm:inline">End-to-End Encrypted</span>
                  <span className="sm:hidden">E2EE</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isEnablingE2ee}
                  onClick={handleEnableE2ee}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-surface hover:bg-surface-hover border border-border text-secondary hover:text-primary text-[11px] font-semibold transition-all duration-150 disabled:opacity-50"
                  title="Enable End-to-End Encryption for this direct message"
                >
                  {isEnablingE2ee ? (
                    <Loader2 className="w-3 h-3 animate-spin text-accent-bright" />
                  ) : (
                    <Shield className="w-3 h-3 text-emerald-400" />
                  )}
                  <span>Enable E2EE</span>
                </button>
              )}
            </>
          )}

          {/* Toggle Details Panel */}
          <button
            type="button"
            onClick={toggleDetails}
            className={cn(
              'p-2 rounded-xl transition-colors',
              isDetailsOpen
                ? 'bg-accent/20 text-accent-bright'
                : 'text-secondary hover:text-primary hover:bg-surface-hover',
            )}
            title="Toggle details panel"
            aria-label="Toggle details panel"
          >
            <PanelRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* TOFU Peer Key Change Warning */}
      {conversationId && peerKeyWarnings[conversationId] && (
        <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 text-amber-700 dark:text-amber-300 text-xs flex items-center justify-between gap-2 animate-in fade-in">
          <span>{peerKeyWarnings[conversationId]}</span>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setIsSafetyModalOpen(true)}
              className="underline font-semibold"
            >
              Verify
            </button>
            <button
              type="button"
              onClick={() => dismissPeerKeyWarning(conversationId)}
              className="p-1 hover:opacity-75"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Enable E2EE Error Toast */}
      {enableE2eeError && (
        <div
          role="alert"
          className="px-4 py-2.5 bg-amber-500/15 border-b border-amber-500/30 text-amber-800 dark:text-amber-300 text-xs font-medium flex items-center justify-between gap-2 animate-in fade-in"
        >
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>{enableE2eeError}</span>
          </div>
          <button
            type="button"
            onClick={() => setEnableE2eeError(null)}
            className="p-1 hover:opacity-75 shrink-0"
            aria-label="Dismiss E2EE error"
          >
            ×
          </button>
        </div>
      )}

      {/* Call Error Banner */}
      {callError && (
        <div className="px-4 py-2.5 bg-rose-500/15 border-b border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 dark:bg-rose-400" />
            <span>{callError}</span>
          </div>
          <button
            onClick={() => useCallStore.setState({ callError: null })}
            className="p-1 text-rose-700 dark:text-rose-300 hover:opacity-75"
          >
            ×
          </button>
        </div>
      )}

      {/* Safety Number Modal */}
      {isDm && otherMember && (
        <SafetyNumberModal
          isOpen={isSafetyModalOpen}
          onClose={() => setIsSafetyModalOpen(false)}
          peerUserId={otherMember.userId}
          peerDisplayName={displayName}
        />
      )}

      {/* Message Feed */}
      <MessageFeed
        conversationId={conversationId}
        conversationDetail={activeConversationDetail}
      />

      {/* Live Typing Footer */}
      {typingText && (
        <div className="px-4 py-1.5 text-[11px] text-accent-bright italic flex items-center gap-1.5 bg-surface/60 border-t border-border/50 animate-in fade-in duration-100">
          <span className="flex gap-1 items-center">
            <span className="w-1 h-1 rounded-full bg-accent-bright animate-bounce" />
            <span className="w-1 h-1 rounded-full bg-accent-bright animate-bounce [animation-delay:0.2s]" />
            <span className="w-1 h-1 rounded-full bg-accent-bright animate-bounce [animation-delay:0.4s]" />
          </span>
          <span>{typingText}</span>
        </div>
      )}

      {/* Message Composer */}
      <MessageComposer conversationId={conversationId} />
    </div>
  );
};
