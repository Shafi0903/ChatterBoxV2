'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  ChannelItem,
  ChannelMessageItem,
  CommunityDetail,
  CommunityRole,
  MediaAttachmentItem,
} from '@chatterbox/shared';
import { useCommunityStore } from '../../stores/community.store';
import { useAuthStore } from '../../stores/auth.store';
import { api } from '../../lib/api';
import { AttachmentList } from '../chat/AttachmentList';
import { Button } from '../ui/Button';
import {
  Hash,
  Megaphone,
  Users,
  Paperclip,
  Send,
  Reply,
  Edit2,
  Trash2,
  X,
  Loader2,
  AlertCircle,
  ShieldAlert,
} from 'lucide-react';

interface ChannelChatAreaProps {
  community: CommunityDetail;
  channel: ChannelItem;
  messages: ChannelMessageItem[];
  isLoadingMessages: boolean;
  onToggleMembers: () => void;
  isMembersOpen: boolean;
}

export const ChannelChatArea: React.FC<ChannelChatAreaProps> = ({
  community,
  channel,
  messages,
  isLoadingMessages,
  onToggleMembers,
  isMembersOpen,
}) => {
  const user = useAuthStore((s) => s.user);
  const replyingTo = useCommunityStore((s) => s.replyingTo);
  const setReplyingTo = useCommunityStore((s) => s.setReplyingTo);
  const sendMessage = useCommunityStore((s) => s.sendMessage);
  const editMessage = useCommunityStore((s) => s.editMessage);
  const deleteMessage = useCommunityStore((s) => s.deleteMessage);
  const emitTyping = useCommunityStore((s) => s.emitTyping);
  const typingUsers = useCommunityStore((s) => s.typingByChannelId[channel.id] || []);

  const [text, setText] = useState('');
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');

  // Attachments state
  const [stagedFiles, setStagedFiles] = useState<
    { id: string; file: File; uploadPromise: Promise<MediaAttachmentItem>; item?: MediaAttachmentItem; error?: string }[]
  >([]);
  const [isUploading, setIsUploading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const callerRole: CommunityRole = (community.callerRole as CommunityRole) || 'MEMBER';
  const isAnnouncement = channel.type === 'ANNOUNCEMENT';
  const canPostInChannel =
    !isAnnouncement || callerRole === 'OWNER' || callerRole === 'ADMIN' || callerRole === 'MODERATOR';

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    emitTyping(channel.id, e.target.value.trim().length > 0);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const tempId = `file_${Date.now()}_${i}`;

      setIsUploading(true);
      const uploadPromise = (async () => {
        // 1. Presign upload
        const presign = await api.presignUpload({
          filename: file.name,
          mimeType: (file.type || 'application/octet-stream') as any,
          sizeBytes: file.size,
        });

        // 2. Direct PUT to S3 / RustFS
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('PUT', presign.uploadUrl);
          xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
          xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error('S3 upload failed')));
          xhr.onerror = () => reject(new Error('Network error uploading to S3'));
          xhr.send(file);
        });

        // 3. Confirm upload
        return api.confirmUpload(presign.attachmentId);
      })();

      setStagedFiles((prev) => [...prev, { id: tempId, file, uploadPromise }]);

      try {
        const item = await uploadPromise;
        setStagedFiles((prev) =>
          prev.map((f) => (f.id === tempId ? { ...f, item } : f)),
        );
      } catch (err: any) {
        setStagedFiles((prev) =>
          prev.map((f) => (f.id === tempId ? { ...f, error: err.message || 'Upload failed' } : f)),
        );
      } finally {
        setIsUploading(false);
      }
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeStagedFile = (id: string) => {
    setStagedFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!canPostInChannel) return;

    const trimmed = text.trim();
    const readyAttachments = stagedFiles
      .filter((f) => f.item && !f.error)
      .map((f) => f.item!);

    if (!trimmed && readyAttachments.length === 0) return;

    const attachmentIds = readyAttachments.map((a) => a.id);
    const contentToSend = trimmed;

    // Reset local inputs immediately
    setText('');
    setStagedFiles([]);
    emitTyping(channel.id, false);

    try {
      await sendMessage(
        channel.id,
        contentToSend,
        replyingTo?.id,
        attachmentIds.length > 0 ? attachmentIds : undefined,
        readyAttachments,
      );
    } catch (err: any) {
      alert(err.message || 'Failed to send message');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const startEdit = (msg: ChannelMessageItem) => {
    setEditingMessageId(msg.id);
    setEditingContent(msg.content);
  };

  const saveEdit = async (msgId: string) => {
    if (!editingContent.trim()) return;
    try {
      await editMessage(msgId, editingContent.trim());
      setEditingMessageId(null);
    } catch (err: any) {
      alert(err.message || 'Failed to edit message');
    }
  };

  const handleDelete = async (msg: ChannelMessageItem) => {
    if (confirm('Delete this message?')) {
      try {
        await deleteMessage(msg.id);
      } catch (err: any) {
        alert(err.message || 'Failed to delete message');
      }
    }
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-background overflow-hidden relative">
      {/* Top Channel Bar */}
      <div className="h-14 px-4 border-b border-border flex items-center justify-between shrink-0 bg-surface/30">
        <div className="flex items-center gap-2.5 min-w-0">
          {isAnnouncement ? (
            <Megaphone className="w-5 h-5 text-accent-bright shrink-0" />
          ) : (
            <Hash className="w-5 h-5 text-accent-bright shrink-0" />
          )}
          <span className="font-bold text-sm text-primary truncate">{channel.name}</span>
          {channel.topic && (
            <>
              <div className="h-4 w-px bg-border hidden sm:block" />
              <span className="text-xs text-secondary truncate hidden sm:block max-w-md">
                {channel.topic}
              </span>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={onToggleMembers}
          className={`p-2 rounded-xl transition-colors ${
            isMembersOpen
              ? 'bg-accent/20 text-accent-bright border border-accent/40'
              : 'text-secondary hover:text-primary hover:bg-elevated'
          }`}
          title="Toggle Member List"
        >
          <Users className="w-4 h-4" />
        </button>
      </div>

      {/* Message Feed Area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Channel Greeting / Top Card */}
        <div className="pt-6 pb-4 border-b border-border/50">
          <div className="w-12 h-12 rounded-2xl bg-accent/20 border border-accent/40 flex items-center justify-center text-accent-bright mb-3">
            {isAnnouncement ? <Megaphone className="w-6 h-6" /> : <Hash className="w-6 h-6" />}
          </div>
          <h2 className="text-xl font-extrabold text-primary">
            Welcome to #{channel.name}!
          </h2>
          <p className="text-xs text-secondary mt-1">
            {channel.topic || `This is the start of the #${channel.name} channel.`}
          </p>
        </div>

        {isLoadingMessages ? (
          <div className="py-12 flex flex-col items-center justify-center text-center">
            <Loader2 className="w-6 h-6 text-accent animate-spin mb-2" />
            <span className="text-xs text-secondary">Loading messages...</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="py-8 text-center text-xs text-secondary">
            No messages here yet. Break the silence!
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = user?.id === msg.senderId;
            const isDeleted = !!msg.deletedAt;
            const canDelete =
              isMe ||
              callerRole === 'OWNER' ||
              callerRole === 'ADMIN' ||
              callerRole === 'MODERATOR';

            return (
              <div
                key={msg.id}
                className="group relative flex items-start gap-3 rounded-xl p-2 hover:bg-elevated/30 transition-colors"
              >
                {/* Avatar */}
                <div className="w-9 h-9 rounded-full bg-accent/20 border border-border flex items-center justify-center text-xs font-bold text-accent-bright shrink-0">
                  {msg.sender.displayName?.substring(0, 2).toUpperCase() || 'U'}
                </div>

                <div className="flex-1 min-w-0">
                  {/* Reply Quote Header */}
                  {msg.replyTo && (
                    <div className="flex items-center gap-1.5 text-[11px] text-secondary mb-1">
                      <Reply className="w-3 h-3 text-secondary shrink-0" />
                      <span className="font-semibold text-accent-bright">@{msg.replyTo.senderName}</span>
                      <span className="truncate max-w-xs">{msg.replyTo.content}</span>
                    </div>
                  )}

                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-xs text-primary">{msg.sender.displayName}</span>
                    <span className="text-[10px] text-secondary">
                      {new Date(msg.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    {msg.editedAt && !isDeleted && (
                      <span className="text-[10px] text-secondary italic">(edited)</span>
                    )}
                  </div>

                  {isDeleted ? (
                    <div className="text-xs text-secondary/60 italic">This message was deleted</div>
                  ) : editingMessageId === msg.id ? (
                    <div className="space-y-2 mt-1">
                      <textarea
                        value={editingContent}
                        onChange={(e) => setEditingContent(e.target.value)}
                        className="w-full p-2.5 rounded-xl bg-elevated border border-border text-primary text-xs focus:outline-hidden focus:border-accent resize-none"
                        rows={2}
                      />
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="primary" onClick={() => saveEdit(msg.id)}>
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setEditingMessageId(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {msg.content && (
                        <p className="text-xs text-primary/90 whitespace-pre-wrap leading-relaxed break-words">
                          {msg.content}
                        </p>
                      )}

                      {/* Attachments */}
                      {msg.attachments && msg.attachments.length > 0 && (
                        <div className="mt-2">
                          <AttachmentList attachments={msg.attachments} />
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Hover Action Menu */}
                {!isDeleted && (
                  <div className="opacity-0 group-hover:opacity-100 absolute right-2 top-2 bg-surface border border-border rounded-lg shadow-md flex items-center p-0.5 gap-0.5 transition-opacity">
                    <button
                      type="button"
                      onClick={() => setReplyingTo(msg)}
                      className="p-1.5 text-secondary hover:text-primary rounded-md hover:bg-elevated transition-colors"
                      title="Reply"
                    >
                      <Reply className="w-3.5 h-3.5" />
                    </button>

                    {isMe && (
                      <button
                        type="button"
                        onClick={() => startEdit(msg)}
                        className="p-1.5 text-secondary hover:text-primary rounded-md hover:bg-elevated transition-colors"
                        title="Edit Message"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => handleDelete(msg)}
                        className="p-1.5 text-status-busy hover:text-status-busy/80 rounded-md hover:bg-status-busy/10 transition-colors"
                        title="Delete Message"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Replying Banner */}
      {replyingTo && (
        <div className="px-4 py-1.5 bg-accent/10 border-t border-accent/20 flex items-center justify-between text-xs text-secondary shrink-0">
          <div className="flex items-center gap-1.5 truncate">
            <Reply className="w-3.5 h-3.5 text-accent-bright shrink-0" />
            <span>Replying to <span className="font-semibold text-accent-bright">@{replyingTo.sender.displayName}</span></span>
            <span className="truncate text-secondary/70">"{replyingTo.content}"</span>
          </div>
          <button
            type="button"
            onClick={() => setReplyingTo(null)}
            className="p-1 text-secondary hover:text-primary rounded-md"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Typing Indicator Footer */}
      {typingUsers.length > 0 && (
        <div className="px-4 py-1 text-[11px] text-accent-bright flex items-center gap-1.5 shrink-0 bg-background/80">
          <span className="inline-flex gap-1 items-center">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-bright animate-bounce" />
            <span className="w-1.5 h-1.5 rounded-full bg-accent-bright animate-bounce [animation-delay:0.2s]" />
            <span className="w-1.5 h-1.5 rounded-full bg-accent-bright animate-bounce [animation-delay:0.4s]" />
          </span>
          <span>
            {typingUsers.map((u) => u.displayName).join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
          </span>
        </div>
      )}

      {/* Composer Area */}
      <div className="p-4 border-t border-border bg-surface/20 shrink-0">
        {!canPostInChannel ? (
          /* Honest Announcement Read-Only Banner */
          <div className="p-3.5 rounded-xl bg-elevated/40 border border-border flex items-center justify-center gap-2 text-xs text-secondary text-center">
            <ShieldAlert className="w-4 h-4 text-status-warning shrink-0" />
            <span>Only administrators and moderators can post announcements in this channel.</span>
          </div>
        ) : (
          <form onSubmit={handleSend} className="space-y-2">
            {/* Staged Attachments Previews */}
            {stagedFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 pb-1">
                {stagedFiles.map((sf) => (
                  <div
                    key={sf.id}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-elevated border border-border text-xs text-primary"
                  >
                    <span className="truncate max-w-[120px]">{sf.file.name}</span>
                    {sf.error ? (
                      <span className="text-status-busy text-[10px]">{sf.error}</span>
                    ) : !sf.item ? (
                      <Loader2 className="w-3 h-3 text-accent animate-spin" />
                    ) : null}
                    <button
                      type="button"
                      onClick={() => removeStagedFile(sf.id)}
                      className="text-secondary hover:text-primary p-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-end gap-2 bg-elevated rounded-2xl border border-border px-3 py-2 focus-within:border-accent">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFileSelect}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-1.5 text-secondary hover:text-primary rounded-lg hover:bg-surface transition-colors shrink-0"
                title="Attach files or media"
              >
                <Paperclip className="w-4 h-4" />
              </button>

              <textarea
                value={text}
                onChange={handleTextChange}
                onKeyDown={handleKeyDown}
                placeholder={`Message #${channel.name}`}
                rows={1}
                className="flex-1 bg-transparent text-primary text-xs placeholder:text-secondary/50 focus:outline-hidden resize-none max-h-32 min-h-[24px] py-1"
              />

              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={(!text.trim() && stagedFiles.length === 0) || isUploading}
                className="p-1.5 h-8 w-8 rounded-xl flex items-center justify-center shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
