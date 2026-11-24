import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useChatStore } from '../../stores/chat.store';
import { Send, X, Reply } from 'lucide-react';

interface MessageComposerProps {
  conversationId: string;
}

export const MessageComposer: React.FC<MessageComposerProps> = ({ conversationId }) => {
  const replyingTo = useChatStore((s) => s.replyingTo);
  const setReplyingTo = useChatStore((s) => s.setReplyingTo);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const emitTyping = useChatStore((s) => s.emitTyping);

  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        120,
      )}px`;
    }
  }, [text]);

  // Focus textarea when replying
  useEffect(() => {
    if (replyingTo) {
      textareaRef.current?.focus();
    }
  }, [replyingTo]);

  const handleStopTyping = useCallback(() => {
    emitTyping(conversationId, false);
  }, [conversationId, emitTyping]);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setText(val);

    // Emit typing indicator
    if (val.trim()) {
      emitTyping(conversationId, true);

      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
      }
      typingTimerRef.current = setTimeout(handleStopTyping, 2000);
    } else {
      handleStopTyping();
    }
  };

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;

    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
    }
    handleStopTyping();

    const replyId = replyingTo?.id;
    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    await sendMessage(conversationId, trimmed, replyId);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="p-3 bg-surface border-t border-border select-none">
      {/* Reply Banner */}
      {replyingTo && (
        <div className="flex items-center justify-between p-2 mb-2 rounded-xl bg-elevated border border-border text-xs animate-in slide-in-from-bottom-2 duration-150">
          <div className="flex items-center gap-2 min-w-0">
            <Reply className="w-3.5 h-3.5 text-accent-bright shrink-0" />
            <div className="min-w-0">
              <span className="font-semibold text-primary truncate block text-[11px]">
                Replying to{' '}
                {replyingTo.sender.displayName || replyingTo.sender.username}
              </span>
              <p className="text-muted text-[10px] truncate">{replyingTo.content}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setReplyingTo(null)}
            className="p-1 rounded-lg text-muted hover:text-primary hover:bg-surface transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Input Row */}
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          placeholder="Type a message... (Enter to send, Shift+Enter for new line)"
          rows={1}
          className="flex-1 max-h-[120px] p-2.5 rounded-xl bg-elevated border border-border text-xs text-primary placeholder:text-muted focus:outline-none focus:border-accent-bright transition-colors resize-none leading-relaxed"
        />

        <button
          type="button"
          onClick={handleSend}
          disabled={!text.trim()}
          className="w-9 h-9 rounded-xl bg-accent hover:bg-accent-bright disabled:opacity-40 disabled:hover:bg-accent text-white flex items-center justify-center transition-all duration-150 shrink-0 shadow-neon disabled:shadow-none"
          title="Send message"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
