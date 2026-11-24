'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useChatStore } from '../../stores/chat.store';
import { VoiceRecorder } from './VoiceRecorder';
import {
  Send,
  X,
  Reply,
  Paperclip,
  Image as ImageIcon,
  Mic,
  Loader2,
  FileText,
  AlertCircle,
  ShieldCheck,
} from 'lucide-react';
import { api } from '../../lib/api';
import { cn } from '../../lib/utils';
import {
  ALLOWED_MIME_TYPES,
  MAX_MEDIA_SIZES,
  getMaxSizeBytes,
} from '@chatterbox/shared';

interface MessageComposerProps {
  conversationId: string;
}

interface StagedAttachment {
  id: string; // client temporary ID
  file: File;
  previewUrl?: string;
  name: string;
  sizeBytes: number;
  mimeType: string;
  progress: number; // 0 - 100
  status: 'UPLOADING' | 'READY' | 'FAILED';
  attachmentId?: string; // from backend confirm
  error?: string;
}

export const MessageComposer: React.FC<MessageComposerProps> = ({ conversationId }) => {
  const replyingTo = useChatStore((s) => s.replyingTo);
  const setReplyingTo = useChatStore((s) => s.setReplyingTo);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const emitTyping = useChatStore((s) => s.emitTyping);
  const conversations = useChatStore((s) => s.conversations);

  const [text, setText] = useState('');
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [stagedFiles, setStagedFiles] = useState<StagedAttachment[]>([]);
  const [composerError, setComposerError] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);

  const activeConv = conversations.find((c) => c.id === conversationId);
  const isEncrypted = Boolean(activeConv?.isEncrypted);

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

  // Adjustment #2: Revoke all object URLs on unmount
  useEffect(() => {
    return () => {
      stagedFiles.forEach((f) => {
        if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
      });
    };
  }, []);

  const handleStopTyping = useCallback(() => {
    emitTyping(conversationId, false);
  }, [conversationId, emitTyping]);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setText(val);

    if (val.trim()) {
      emitTyping(conversationId, true);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(handleStopTyping, 2000);
    } else {
      handleStopTyping();
    }
  };

  // Upload a single file to RustFS S3 with live progress
  const uploadFile = async (file: File) => {
    const tempId = crypto.randomUUID();
    const isImage = file.type.startsWith('image/');
    const previewUrl = isImage ? URL.createObjectURL(file) : undefined;

    const staged: StagedAttachment = {
      id: tempId,
      file,
      previewUrl,
      name: file.name,
      sizeBytes: file.size,
      mimeType: file.type || 'application/octet-stream',
      progress: 0,
      status: 'UPLOADING',
    };

    setStagedFiles((prev) => [...prev, staged]);

    try {
      // 1. Presign
      const presignRes = await api.presignUpload({
        filename: file.name,
        mimeType: staged.mimeType as any,
        sizeBytes: file.size,
      });

      // 2. Adjustment #2: Clean XHR PUT without withCredentials or auth headers
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', presignRes.uploadUrl, true);
        xhr.withCredentials = false;
        xhr.setRequestHeader('Content-Type', staged.mimeType);

        xhr.upload.onprogress = (evt) => {
          if (evt.lengthComputable) {
            const percent = Math.round((evt.loaded / evt.total) * 100);
            setStagedFiles((prev) =>
              prev.map((item) =>
                item.id === tempId ? { ...item, progress: percent } : item
              )
            );
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`Upload failed with status ${xhr.status}`));
          }
        };

        xhr.onerror = () => reject(new Error('Network error uploading file to media storage'));
        xhr.send(file);
      });

      // 3. Confirm upload
      const confirmRes = await api.confirmUpload(presignRes.attachmentId);

      setStagedFiles((prev) =>
        prev.map((item) =>
          item.id === tempId
            ? {
                ...item,
                progress: 100,
                status: 'READY',
                attachmentId: confirmRes.id,
              }
            : item
        )
      );
    } catch (err: any) {
      console.error('File upload failed:', err);
      setStagedFiles((prev) =>
        prev.map((item) =>
          item.id === tempId
            ? { ...item, status: 'FAILED', error: err.message || 'Upload failed' }
            : item
        )
      );
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setComposerError(null);
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // Validate MIME type against shared allowlists
      const isAllowed = (ALLOWED_MIME_TYPES as readonly string[]).includes(file.type);

      if (!isAllowed) {
        setComposerError(`File "${file.name}" has an unsupported format.`);
        continue;
      }

      // Validate size
      const maxSize = getMaxSizeBytes(file.type);

      if (file.size > maxSize) {
        const maxMb = Math.round(maxSize / (1024 * 1024));
        setComposerError(`"${file.name}" exceeds maximum allowed limit of ${maxMb}MB.`);
        continue;
      }

      uploadFile(file);
    }

    // Reset input value
    e.target.value = '';
  };

  const handleRemoveStaged = (id: string) => {
    setStagedFiles((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((item) => item.id !== id);
    });
  };

  const handleSend = async () => {
    // Check if any uploads are still in progress
    const isStillUploading = stagedFiles.some((f) => f.status === 'UPLOADING');
    if (isStillUploading) return;

    const trimmed = text.trim();
    const readyAttachments = stagedFiles.filter((f) => f.status === 'READY' && f.attachmentId);

    // Cannot send if both text and attachments are empty
    if (!trimmed && readyAttachments.length === 0) return;

    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    handleStopTyping();

    const replyId = replyingTo?.id;
    const attachmentIds = readyAttachments.map((f) => f.attachmentId!);

    const stagedForStore = readyAttachments.map((f) => ({
      id: f.attachmentId!,
      originalName: f.name,
      mimeType: f.mimeType,
      sizeBytes: f.sizeBytes,
      status: 'READY' as const,
    }));

    setText('');
    setStagedFiles([]);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    await sendMessage(conversationId, trimmed, replyId, attachmentIds, stagedForStore);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleVoiceNoteSent = async (attachmentId: string, durationSec: number, staged: any) => {
    setIsRecordingVoice(false);
    await sendMessage(conversationId, '', undefined, [attachmentId], [staged]);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // If in voice recording mode, replace composer with VoiceRecorder
  if (isRecordingVoice) {
    return (
      <div className="p-3 bg-surface border-t border-border">
        <VoiceRecorder
          conversationId={conversationId}
          onSendVoiceNote={handleVoiceNoteSent}
          onCancel={() => setIsRecordingVoice(false)}
        />
      </div>
    );
  }

  const isUploadingAny = stagedFiles.some((f) => f.status === 'UPLOADING');
  const hasFailedUploads = stagedFiles.some((f) => f.status === 'FAILED');
  const canSend = (text.trim().length > 0 || stagedFiles.some((f) => f.status === 'READY')) && !isUploadingAny;

  return (
    <div className="p-3 bg-surface border-t border-border select-none">
      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileSelect}
        accept="image/*,video/mp4,video/webm,audio/*,application/pdf,text/plain"
      />
      <input
        ref={imageInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileSelect}
        accept="image/*,video/mp4,video/webm"
      />

      {/* Validation error banner */}
      {composerError && (
        <div className="flex items-center justify-between p-2 mb-2 rounded-xl bg-status-busy/15 border border-status-busy/30 text-xs text-status-busy animate-in fade-in">
          <div className="flex items-center gap-1.5 min-w-0">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{composerError}</span>
          </div>
          <button
            type="button"
            onClick={() => setComposerError(null)}
            className="p-1 text-status-busy hover:bg-status-busy/20 rounded-md"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

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
              <p className="text-muted text-[10px] truncate">{replyingTo.content || 'Media message'}</p>
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

      {/* Staged Attachments Tray */}
      {stagedFiles.length > 0 && (
        <div className="mb-2 p-2 rounded-xl bg-elevated/70 border border-border/80 flex flex-col gap-2">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 max-w-full">
            {stagedFiles.map((item) => (
              <div
                key={item.id}
                className="relative group shrink-0 w-24 h-24 rounded-xl bg-surface border border-border overflow-hidden flex flex-col items-center justify-center p-1.5 text-center"
              >
                {item.previewUrl ? (
                  <img
                    src={item.previewUrl}
                    alt={item.name}
                    className="w-full h-full object-cover rounded-lg"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center w-full h-full text-muted">
                    <FileText className="w-6 h-6 mb-1 text-accent-bright" />
                    <span className="text-[9px] font-medium text-primary truncate max-w-[80px]">
                      {item.name}
                    </span>
                    <span className="text-[8px] text-muted">{formatFileSize(item.sizeBytes)}</span>
                  </div>
                )}

                {/* Progress / Status Overlay */}
                {item.status === 'UPLOADING' && (
                  <div className="absolute inset-0 bg-surface/80 backdrop-blur-xs flex flex-col items-center justify-center gap-1 p-2">
                    <Loader2 className="w-4 h-4 animate-spin text-accent-bright" />
                    <span className="text-[9px] font-mono font-semibold text-primary">
                      {item.progress}%
                    </span>
                  </div>
                )}

                {item.status === 'FAILED' && (
                  <div className="absolute inset-0 bg-status-busy/80 backdrop-blur-xs flex flex-col items-center justify-center p-1 text-white">
                    <AlertCircle className="w-4 h-4 mb-0.5" />
                    <span className="text-[8px] leading-tight">Failed</span>
                  </div>
                )}

                {/* Remove Button */}
                <button
                  type="button"
                  onClick={() => handleRemoveStaged(item.id)}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-surface/90 hover:bg-status-busy hover:text-white text-muted border border-border flex items-center justify-center transition-colors shadow-sm"
                  title="Remove attachment"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>

          {/* Crypto Honesty Notice for Encrypted Chats */}
          {isEncrypted && (
            <div className="flex items-center gap-1.5 text-[10px] text-emerald-400/90 px-1">
              <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
              <span>Media files are stored privately on server; captions are end-to-end encrypted.</span>
            </div>
          )}
        </div>
      )}

      {/* Input Row */}
      <div className="flex items-end gap-1.5">
        {/* Attachment Triggers */}
        <div className="flex items-center gap-0.5 pb-1">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-2 rounded-xl text-muted hover:text-primary hover:bg-elevated transition-colors"
            title="Attach file (PDF, TXT, Media)"
          >
            <Paperclip className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            className="p-2 rounded-xl text-muted hover:text-primary hover:bg-elevated transition-colors"
            title="Attach photo or video"
          >
            <ImageIcon className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => setIsRecordingVoice(true)}
            className="p-2 rounded-xl text-muted hover:text-accent-bright hover:bg-elevated transition-colors"
            title="Record voice note"
          >
            <Mic className="w-4 h-4" />
          </button>
        </div>

        {/* Text Area */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          placeholder={
            stagedFiles.length > 0
              ? 'Add an optional caption...'
              : 'Type a message... (Enter to send, Shift+Enter for new line)'
          }
          rows={1}
          className="flex-1 max-h-[120px] p-2.5 rounded-xl bg-elevated border border-border text-xs text-primary placeholder:text-muted focus:outline-none focus:border-accent-bright transition-colors resize-none leading-relaxed"
        />

        {/* Send Button */}
        <button
          type="button"
          onClick={handleSend}
          disabled={!canSend}
          className="w-9 h-9 rounded-xl bg-accent hover:bg-accent-bright disabled:opacity-40 disabled:hover:bg-accent text-white flex items-center justify-center transition-all duration-150 shrink-0 shadow-neon disabled:shadow-none mb-0.5"
          title="Send message"
        >
          {isUploadingAny ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </button>
      </div>
    </div>
  );
};
