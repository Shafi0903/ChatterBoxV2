'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Image as ImageIcon,
  Send,
  X,
  Globe,
  Users,
  Paperclip,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import { useSocialStore } from '@/stores/social.store';
import type { MediaAttachmentItem, PostItem } from '@chatterbox/shared';

interface StagedAttachment {
  file: File;
  previewUrl: string;
  isUploading: boolean;
  progress: number;
  uploadedAttachment?: MediaAttachmentItem;
  error?: string;
}

interface PostComposerProps {
  onPostCreated?: (newPost: PostItem) => void;
}

export function PostComposer({ onPostCreated }: PostComposerProps) {
  const { user, profile } = useAuthStore();
  const { createPost } = useSocialStore();

  const [content, setContent] = useState('');
  const [visibility, setVisibility] = useState<'PUBLIC' | 'FOLLOWERS'>('PUBLIC');
  const [stagedFiles, setStagedFiles] = useState<StagedAttachment[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Clean up object URLs on unmount or removal
  useEffect(() => {
    return () => {
      stagedFiles.forEach((item) => {
        if (item.previewUrl.startsWith('blob:')) {
          URL.revokeObjectURL(item.previewUrl);
        }
      });
    };
  }, []);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (stagedFiles.length + files.length > 4) {
      alert('You can attach up to 4 files per post.');
      return;
    }

    const newStaged: StagedAttachment[] = Array.from(files).map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
      isUploading: true,
      progress: 0,
    }));

    setStagedFiles((prev) => [...prev, ...newStaged]);
    if (fileInputRef.current) fileInputRef.current.value = '';

    // Upload each file via presigned upload pipeline
    for (let i = 0; i < newStaged.length; i++) {
      const item = newStaged[i];
      try {
        const presign = await api.presignUpload({
          filename: item.file.name,
          mimeType: (item.file.type || 'application/octet-stream') as any,
          sizeBytes: item.file.size,
        });

        // Clean XHR PUT to RustFS
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('PUT', presign.uploadUrl);
          xhr.withCredentials = false;
          xhr.setRequestHeader('Content-Type', item.file.type || 'application/octet-stream');

          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              const p = Math.round((event.loaded / event.total) * 100);
              setStagedFiles((current) =>
                current.map((s) => (s.file === item.file ? { ...s, progress: p } : s))
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
          xhr.onerror = () => reject(new Error('Network error during upload'));
          xhr.send(item.file);
        });

        // Confirm upload
        const confirmed = await api.confirmUpload(presign.attachmentId);

        setStagedFiles((current) =>
          current.map((s) =>
            s.file === item.file
              ? { ...s, isUploading: false, progress: 100, uploadedAttachment: confirmed }
              : s
          )
        );
      } catch (err: any) {
        setStagedFiles((current) =>
          current.map((s) =>
            s.file === item.file
              ? { ...s, isUploading: false, error: err.message || 'Upload failed' }
              : s
          )
        );
      }
    }
  };

  const removeStagedFile = (idx: number) => {
    const item = stagedFiles[idx];
    if (item?.previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(item.previewUrl);
    }
    setStagedFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    // Check if any files are still uploading
    if (stagedFiles.some((s) => s.isUploading)) {
      alert('Please wait for file uploads to complete.');
      return;
    }

    const trimmed = content.trim();
    const readyAttachments = stagedFiles
      .map((s) => s.uploadedAttachment?.id)
      .filter((id): id is string => Boolean(id));

    if (!trimmed && readyAttachments.length === 0) {
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      const newPost = await createPost({
        content: trimmed,
        visibility,
        attachmentIds: readyAttachments,
      });

      // Cleanup preview URLs
      stagedFiles.forEach((item) => {
        if (item.previewUrl.startsWith('blob:')) {
          URL.revokeObjectURL(item.previewUrl);
        }
      });

      setContent('');
      setStagedFiles([]);
      onPostCreated?.(newPost);
    } catch (err: any) {
      setError(err.message || 'Failed to publish post');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-2xl p-4 mb-6 backdrop-blur-sm">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center font-bold text-white text-sm flex-shrink-0">
            {profile?.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                alt={profile.displayName || user?.username}
                className="w-full h-full rounded-full object-cover"
              />
            ) : (
              (profile?.displayName || user?.username || 'U').charAt(0).toUpperCase()
            )}
          </div>

          <div className="flex-1">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="What's happening?"
              maxLength={5000}
              rows={3}
              className="w-full bg-transparent text-white text-sm placeholder-zinc-500 resize-none focus:outline-none"
            />
          </div>
        </div>

        {/* Staged Attachments Previews */}
        {stagedFiles.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
            {stagedFiles.map((item, idx) => (
              <div
                key={idx}
                className="relative group rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800 aspect-square flex items-center justify-center"
              >
                {item.file.type.startsWith('image/') ? (
                  <img
                    src={item.previewUrl}
                    alt="Preview"
                    className="w-full h-full object-cover"
                  />
                ) : item.file.type.startsWith('video/') ? (
                  <video
                    src={item.previewUrl}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="p-2 text-center text-xs text-zinc-400 break-all">
                    <Paperclip className="w-5 h-5 mx-auto mb-1 text-zinc-500" />
                    {item.file.name}
                  </div>
                )}

                {item.isUploading && (
                  <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-1.5 p-2">
                    <div className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                    <span className="text-[10px] text-zinc-300 font-mono">
                      {item.progress}%
                    </span>
                  </div>
                )}

                {item.error && (
                  <div className="absolute inset-0 bg-red-950/80 p-1 flex items-center justify-center text-[10px] text-red-200 text-center">
                    {item.error}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => removeStagedFile(idx)}
                  className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-zinc-300 hover:text-white transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {error && (
          <p className="text-xs text-red-400">{error}</p>
        )}

        {/* Action Controls & Submit */}
        <div className="flex items-center justify-between pt-2 border-t border-zinc-800/80">
          <div className="flex items-center gap-2">
            {/* File Upload Button */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={stagedFiles.length >= 4}
              className="p-2 text-zinc-400 hover:text-cyan-400 rounded-lg hover:bg-zinc-900 transition-colors disabled:opacity-40"
              title="Add media"
            >
              <ImageIcon className="w-4 h-4" />
            </button>

            {/* Visibility Selector */}
            <div className="flex items-center rounded-lg bg-zinc-900 border border-zinc-800 p-0.5 text-xs text-zinc-300">
              <button
                type="button"
                onClick={() => setVisibility('PUBLIC')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-colors ${
                  visibility === 'PUBLIC'
                    ? 'bg-cyan-500/20 text-cyan-400 font-medium'
                    : 'hover:text-white'
                }`}
              >
                <Globe className="w-3 h-3" />
                <span>Public</span>
              </button>
              <button
                type="button"
                onClick={() => setVisibility('FOLLOWERS')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-colors ${
                  visibility === 'FOLLOWERS'
                    ? 'bg-indigo-500/20 text-indigo-400 font-medium'
                    : 'hover:text-white'
                }`}
              >
                <Users className="w-3 h-3" />
                <span>Followers</span>
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={
              (!content.trim() && stagedFiles.length === 0) ||
              isSubmitting ||
              stagedFiles.some((s) => s.isUploading)
            }
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 disabled:hover:bg-cyan-500 text-zinc-950 font-semibold text-xs transition-colors shadow-lg shadow-cyan-500/20"
          >
            <Send className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>{isSubmitting ? 'Posting...' : 'Post'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
