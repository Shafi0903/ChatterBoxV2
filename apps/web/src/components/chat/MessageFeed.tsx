import React, { useEffect, useRef, useMemo, useState } from 'react';
import { MessageItem, ConversationDetail } from '@chatterbox/shared';
import { useAuthStore } from '../../stores/auth.store';
import { useChatStore } from '../../stores/chat.store';
import { MessageBubble } from './MessageBubble';
import { EditMessageModal } from './EditMessageModal';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { Loader2 } from 'lucide-react';

interface MessageFeedProps {
  conversationId: string;
  conversationDetail: ConversationDetail | null;
}

export const MessageFeed: React.FC<MessageFeedProps> = ({
  conversationId,
  conversationDetail,
}) => {
  const currentUserId = useAuthStore((s) => s.user?.id);
  const messages = useChatStore((s) => s.messagesByConversationId[conversationId] || []);
  const hasMore = useChatStore((s) => s.hasMoreByConversationId[conversationId] || false);
  const isLoadingMore = useChatStore((s) => s.isLoadingMoreMessages);
  const fetchOlderMessages = useChatStore((s) => s.fetchOlderMessages);
  const editMessage = useChatStore((s) => s.editMessage);
  const deleteMessage = useChatStore((s) => s.deleteMessage);

  const bottomRef = useRef<HTMLDivElement>(null);
  const isFirstLoadRef = useRef(true);

  // Edit / Delete modal states
  const [editingMsg, setEditingMsg] = useState<MessageItem | null>(null);
  const [deletingMsg, setDeletingMsg] = useState<MessageItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Check if current user is OWNER or ADMIN of group
  const isGroupOwnerOrAdmin = useMemo(() => {
    if (!conversationDetail || conversationDetail.type !== 'GROUP') return false;
    const member = conversationDetail.members.find((m) => m.userId === currentUserId);
    return member?.role === 'OWNER' || member?.role === 'ADMIN';
  }, [conversationDetail, currentUserId]);

  // Scroll to bottom on initial load and when new messages arrive
  useEffect(() => {
    if (isFirstLoadRef.current && messages.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: 'auto' });
      isFirstLoadRef.current = false;
    } else {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length]);

  // Date Divider Helpers
  const formatDateLabel = (isoString: string | Date) => {
    const d = new Date(isoString);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
    });
  };

  const groupedMessages = useMemo(() => {
    const groups: { dateLabel: string; items: MessageItem[] }[] = [];
    let currentLabel = '';
    let currentGroup: MessageItem[] = [];

    messages.forEach((msg) => {
      const label = formatDateLabel(msg.createdAt);
      if (label !== currentLabel) {
        if (currentGroup.length > 0) {
          groups.push({ dateLabel: currentLabel, items: currentGroup });
        }
        currentLabel = label;
        currentGroup = [msg];
      } else {
        currentGroup.push(msg);
      }
    });

    if (currentGroup.length > 0) {
      groups.push({ dateLabel: currentLabel, items: currentGroup });
    }

    return groups;
  }, [messages]);

  const handleConfirmDelete = async () => {
    if (!deletingMsg) return;
    setIsDeleting(true);
    try {
      await deleteMessage(deletingMsg.id);
      setDeletingMsg(null);
    } catch {
      // Ignore
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
      {/* Load More Button */}
      {hasMore && (
        <div className="flex justify-center py-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => fetchOlderMessages(conversationId)}
            disabled={isLoadingMore}
            className="text-xs gap-1.5"
          >
            {isLoadingMore && <Loader2 className="w-3 h-3 animate-spin" />}
            <span>{isLoadingMore ? 'Loading messages...' : 'Load older messages'}</span>
          </Button>
        </div>
      )}

      {/* Grouped Messages by Date */}
      {groupedMessages.map((group) => (
        <div key={group.dateLabel} className="space-y-3">
          {/* Date Divider */}
          <div className="relative flex items-center justify-center my-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <span className="relative px-3 py-0.5 rounded-full bg-surface border border-border text-[10px] font-semibold text-muted">
              {group.dateLabel}
            </span>
          </div>

          {/* Messages in Group */}
          {group.items.map((msg) => (
            <MessageBubble
              key={msg.id || msg.clientMessageId}
              message={msg}
              isGroup={conversationDetail?.type === 'GROUP'}
              canDeleteAsAdmin={isGroupOwnerOrAdmin}
              onEdit={(m) => setEditingMsg(m)}
              onDelete={(m) => setDeletingMsg(m)}
            />
          ))}
        </div>
      ))}

      <div ref={bottomRef} />

      {/* Edit Message Modal */}
      <EditMessageModal
        message={editingMsg}
        isOpen={Boolean(editingMsg)}
        onClose={() => setEditingMsg(null)}
        onSave={async (id, content) => {
          await editMessage(id, content);
        }}
      />

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={Boolean(deletingMsg)}
        onClose={() => setDeletingMsg(null)}
        title="Delete Message"
        description="Are you sure you want to delete this message? Its content will be cleared."
      >
        <div className="flex justify-end gap-2 mt-4">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setDeletingMsg(null)}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            size="sm"
            onClick={handleConfirmDelete}
            disabled={isDeleting}
          >
            {isDeleting ? 'Deleting...' : 'Delete'}
          </Button>
        </div>
      </Modal>
    </div>
  );
};
