import React, { useState, useMemo } from 'react';
import { MessageItem } from '@chatterbox/shared';
import { useAuthStore } from '../../stores/auth.store';
import { useChatStore } from '../../stores/chat.store';
import { Avatar } from '../ui/Avatar';
import {
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
  Reply,
  Edit2,
  Trash2,
  Smile,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { AttachmentList } from './AttachmentList';

interface MessageBubbleProps {
  message: MessageItem;
  isGroup: boolean;
  canDeleteAsAdmin: boolean;
  onEdit: (message: MessageItem) => void;
  onDelete: (message: MessageItem) => void;
}

const QUICK_EMOJIS = ['👍', '❤️', '😂', '🔥', '😮', '😢'];

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  isGroup,
  canDeleteAsAdmin,
  onEdit,
  onDelete,
}) => {
  const currentUserId = useAuthStore((s) => s.user?.id);
  const setReplyingTo = useChatStore((s) => s.setReplyingTo);
  const toggleReaction = useChatStore((s) => s.toggleReaction);
  const retryMessage = useChatStore((s) => s.retryMessage);

  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const isSender = message.senderId === currentUserId;
  const isDeleted = Boolean(message.deletedAt);

  // User adjustment #2: Look up decrypted reply content from messagesByConversationId or fallback cleanly
  const replyContent = useMemo(() => {
    if (!message.replyTo) return null;
    const conversationMessages = useChatStore.getState().messagesByConversationId[message.conversationId] || [];
    const source = conversationMessages.find((m) => m.id === message.replyTo!.id);
    if (source && source.content) {
      return source.content;
    }
    const rawContent = message.replyTo.content;
    if (rawContent && rawContent.length > 50 && !rawContent.includes(' ')) {
      return '🔒 Encrypted message';
    }
    return rawContent || 'Message';
  }, [message.replyTo, message.conversationId]);

  const formatTime = (isoString: string | Date) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    } catch {
      return '';
    }
  };

  const handleEmojiClick = async (emoji: string) => {
    setShowEmojiPicker(false);
    await toggleReaction(message.id, emoji);
  };

  // Group reactions: message.reactions has { emoji: string, count: number, userIds: string[] }
  const reactionCounts = useMemo(() => {
    const map: Record<string, { count: number; hasReacted: boolean }> = {};
    (message.reactions || []).forEach((r) => {
      map[r.emoji] = {
        count: r.count,
        hasReacted: currentUserId ? r.userIds.includes(currentUserId) : false,
      };
    });
    return map;
  }, [message.reactions, currentUserId]);

  return (
    <div
      className={cn(
        'group relative flex flex-col mb-3 transition-opacity duration-150',
        isSender ? 'items-end' : 'items-start',
        message.status === 'SENDING' && 'opacity-70',
      )}
    >
      {/* Group Sender Header */}
      {!isSender && isGroup && (
        <div className="flex items-center gap-1.5 mb-1 px-1">
          <Avatar
            name={message.sender.displayName || message.sender.username}
            src={message.sender.avatarUrl}
            size="sm"
          />
          <span className="text-[11px] font-semibold text-secondary">
            {message.sender.displayName || message.sender.username}
          </span>
        </div>
      )}

      {/* Bubble Container */}
      <div className="relative max-w-[85%] sm:max-w-[70%]">
        {/* Hover Action Bar */}
        {!isDeleted && (
          <div
            className={cn(
              'absolute -top-7 hidden group-hover:flex items-center gap-1 p-1 rounded-xl bg-surface border border-border shadow-md z-10 animate-in fade-in duration-100',
              isSender ? 'right-0' : 'left-0',
            )}
          >
            {/* Quick Reaction Toggle */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowEmojiPicker((prev) => !prev)}
                className="p-1 rounded-lg text-muted hover:text-primary hover:bg-elevated transition-colors"
                title="Add reaction"
              >
                <Smile className="w-3.5 h-3.5" />
              </button>

              {showEmojiPicker && (
                <div className="absolute bottom-full mb-1 flex items-center gap-1 p-1.5 rounded-xl bg-surface border border-border shadow-xl z-20">
                  {QUICK_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => handleEmojiClick(emoji)}
                      className="p-1 rounded-lg hover:bg-elevated text-sm transition-transform hover:scale-125"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Reply */}
            <button
              type="button"
              onClick={() => setReplyingTo(message)}
              className="p-1 rounded-lg text-muted hover:text-primary hover:bg-elevated transition-colors"
              title="Reply"
            >
              <Reply className="w-3.5 h-3.5" />
            </button>

            {/* Edit (Sender only) */}
            {isSender && (
              <button
                type="button"
                onClick={() => onEdit(message)}
                className="p-1 rounded-lg text-muted hover:text-primary hover:bg-elevated transition-colors"
                title="Edit message"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Delete (Sender or Admin) */}
            {(isSender || canDeleteAsAdmin) && (
              <button
                type="button"
                onClick={() => onDelete(message)}
                className="p-1 rounded-lg text-muted hover:text-status-busy hover:bg-status-busy/10 transition-colors"
                title="Delete message"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Message Bubble Body */}
        <div
          className={cn(
            'px-3.5 py-2.5 rounded-2xl text-xs leading-relaxed break-words shadow-sm',
            isSender
              ? 'bg-accent text-white rounded-br-xs'
              : 'bg-elevated text-primary rounded-bl-xs border border-border/50',
          )}
        >
          {/* Reply Quote Banner */}
          {message.replyTo && (
            <div
              className={cn(
                'mb-2 p-2 rounded-xl text-[11px] border-l-2',
                isSender
                  ? 'bg-black/20 border-white/60 text-white/90'
                  : 'bg-surface border-accent-bright text-secondary',
              )}
            >
              <span className="font-semibold block truncate">
                {message.replyTo.senderName}
              </span>
              <p className="truncate italic">
                {replyContent}
              </p>
            </div>
          )}

          {/* Content */}
          {isDeleted ? (
            <span className="italic opacity-60">This message was deleted</span>
          ) : (
            <>
              {message.content && <p className="whitespace-pre-wrap">{message.content}</p>}
              {message.attachments && message.attachments.length > 0 && (
                <AttachmentList attachments={message.attachments} />
              )}
            </>
          )}

          {/* Footer Metadata */}
          <div
            className={cn(
              'flex items-center justify-end gap-1 mt-1 text-[10px]',
              isSender ? 'text-white/70' : 'text-muted',
            )}
          >
            {message.editedAt && !isDeleted && (
              <span className="text-[9px] italic opacity-80">(edited)</span>
            )}
            <span>{formatTime(message.createdAt)}</span>

            {/* Delivery Checkmarks (Sent messages only) */}
            {isSender && (
              <span className="inline-flex items-center ml-0.5">
                {message.status === 'SENDING' && (
                  <Clock className="w-3 h-3 animate-spin" />
                )}
                {message.status === 'SENT' && (
                  <Check className="w-3.5 h-3.5 opacity-80" />
                )}
                {message.status === 'DELIVERED' && (
                  <CheckCheck className="w-3.5 h-3.5 opacity-80" />
                )}
                {message.status === 'READ' && (
                  <CheckCheck className="w-3.5 h-3.5 text-accent-bright font-bold" />
                )}
                {message.status === 'FAILED' && (
                  <button
                    type="button"
                    onClick={() => retryMessage(message.conversationId, message.clientMessageId!)}
                    className="inline-flex items-center gap-1 text-status-busy hover:underline font-semibold"
                    title="Send failed. Click to retry."
                  >
                    <AlertCircle className="w-3 h-3" />
                    <span>Retry</span>
                  </button>
                )}
              </span>
            )}
          </div>
        </div>

        {/* Reaction Pills */}
        {Object.keys(reactionCounts).length > 0 && (
          <div className="flex flex-wrap items-center gap-1 mt-1 px-1">
            {Object.entries(reactionCounts).map(([emoji, data]) => (
              <button
                key={emoji}
                type="button"
                onClick={() => handleEmojiClick(emoji)}
                className={cn(
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border transition-all duration-150',
                  data.hasReacted
                    ? 'bg-accent/25 border-accent-bright text-accent-bright font-semibold'
                    : 'bg-elevated/70 border-border text-secondary hover:text-primary hover:border-border-subtle',
                )}
              >
                <span>{emoji}</span>
                <span className="text-[10px]">{data.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
