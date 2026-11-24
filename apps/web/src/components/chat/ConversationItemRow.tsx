import React from 'react';
import { ConversationItem } from '@chatterbox/shared';
import { useAuthStore } from '../../stores/auth.store';
import { useChatStore } from '../../stores/chat.store';
import { Avatar } from '../ui/Avatar';
import { Users2 } from 'lucide-react';
import { cn } from '../../lib/utils';

interface ConversationItemRowProps {
  conversation: ConversationItem;
  isActive: boolean;
  onSelect: (id: string) => void;
}

export const ConversationItemRow: React.FC<ConversationItemRowProps> = ({
  conversation,
  isActive,
  onSelect,
}) => {
  const currentUserId = useAuthStore((s) => s.user?.id);
  const presenceByUserId = useChatStore((s) => s.presenceByUserId);

  const isDm = conversation.type === 'DM';

  // For DMs, find the other member
  const otherMember = isDm
    ? conversation.members.find((m) => m.userId !== currentUserId)
    : null;

  const displayName = isDm
    ? otherMember?.displayName || otherMember?.username || 'Direct Message'
    : conversation.name || 'Group Chat';

  const avatarUrl = isDm
    ? otherMember?.avatarUrl
    : conversation.avatarUrl;

  const presenceStatus = isDm && otherMember ? presenceByUserId[otherMember.userId] : undefined;

  // Format relative time
  const formatTime = (isoString?: string | Date | null) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const lastMessageText = conversation.lastMessage
    ? conversation.lastMessage.content
    : 'No messages yet';

  const hasUnread = (conversation.unreadCount || 0) > 0;

  return (
    <button
      onClick={() => onSelect(conversation.id)}
      className={cn(
        'w-full text-left p-3 rounded-2xl flex items-center gap-3 transition-all duration-150 select-none group',
        isActive
          ? 'bg-accent/15 border border-accent/30 shadow-sm'
          : 'hover:bg-surface-hover border border-transparent',
      )}
    >
      {/* Avatar */}
      <div className="relative shrink-0">
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
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <span
            className={cn(
              'text-xs truncate tracking-tight',
              hasUnread || isActive
                ? 'font-semibold text-primary'
                : 'font-medium text-secondary group-hover:text-primary',
            )}
          >
            {displayName}
          </span>
          <span className="text-[10px] text-muted shrink-0">
            {formatTime(conversation.lastMessageAt || conversation.createdAt)}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2 mt-0.5">
          <p
            className={cn(
              'text-[11px] truncate leading-tight',
              hasUnread ? 'text-primary font-medium' : 'text-muted',
            )}
          >
            {lastMessageText}
          </p>

          {hasUnread && (
            <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-status-busy text-white text-[10px] font-bold flex items-center justify-center leading-none">
              {conversation.unreadCount! > 99 ? '99+' : conversation.unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  );
};
