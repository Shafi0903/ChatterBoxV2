import React, { useMemo } from 'react';
import { ConversationMemberItem } from '@chatterbox/shared';
import { useAuthStore } from '../../stores/auth.store';
import { useChatStore } from '../../stores/chat.store';
import { MessageFeed } from './MessageFeed';
import { MessageComposer } from './MessageComposer';
import { Avatar } from '../ui/Avatar';
import {
  ArrowLeft,
  Users2,
  PanelRight,
  MessageSquare,
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
    isDetailsOpen,
    toggleDetails,
  } = useChatStore();

  const isDm = activeConversationDetail?.type === 'DM';

  // For DMs, find the other member
  const otherMember = useMemo(() => {
    if (!isDm || !activeConversationDetail) return null;
    return activeConversationDetail.members.find(
      (m: ConversationMemberItem) => m.userId !== currentUserId,
    );
  }, [isDm, activeConversationDetail, currentUserId]);

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
        <div className="flex items-center gap-1">
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
