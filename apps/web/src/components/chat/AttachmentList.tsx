'use client';

import React, { useState, useEffect } from 'react';
import { MediaAttachmentItem } from '@chatterbox/shared';
import { api } from '../../lib/api';
import { useAuthStore } from '../../stores/auth.store';
import { MediaLightbox } from './MediaLightbox';
import {
  Download,
  FileText,
  Play,
  Pause,
  Loader2,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { cn } from '../../lib/utils';

interface AttachmentListProps {
  attachments: MediaAttachmentItem[];
}

// Short-lived in-memory cache for scoped media URLs (never caches JWT access tokens)
const mediaUrlCache = new Map<string, { url: string; expiresAt: number }>();
const inFlightUrlPromises = new Map<string, Promise<string>>();

async function fetchAuthorizedUrl(attachmentId: string, userId?: string): Promise<string> {
  const cacheKey = `${userId || 'anon'}:${attachmentId}`;
  const cached = mediaUrlCache.get(cacheKey);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.url;
  }

  // Deduplicate in-flight requests for the same user + attachment
  const existingPromise = inFlightUrlPromises.get(cacheKey);
  if (existingPromise) {
    return existingPromise;
  }

  const promise = api
    .getMediaDownloadUrl(attachmentId)
    .then((res) => {
      const targetUrl = res.proxyUrl || res.downloadUrl;
      // Keep cache TTL strictly below server expiry (max 90s)
      const ttlMs = Math.max(10_000, Math.min(((res.expiresIn || 120) - 30) * 1000, 90_000));
      mediaUrlCache.set(cacheKey, {
        url: targetUrl,
        expiresAt: Date.now() + ttlMs,
      });
      return targetUrl;
    })
    .finally(() => {
      inFlightUrlPromises.delete(cacheKey);
    });

  inFlightUrlPromises.set(cacheKey, promise);
  return promise;
}

export const AttachmentList: React.FC<AttachmentListProps> = ({ attachments }) => {
  if (!attachments || attachments.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 mt-1.5 w-full">
      {attachments.map((att) => (
        <AttachmentItem key={att.id} attachment={att} />
      ))}
    </div>
  );
};

const AttachmentItem: React.FC<{ attachment: MediaAttachmentItem }> = ({ attachment }) => {
  const currentUserId = useAuthStore((s) => s.user?.id);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    setHasError(false);

    fetchAuthorizedUrl(attachment.id, currentUserId)
      .then((url) => {
        if (mounted) {
          setDownloadUrl(url);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        console.error('Failed to get download URL for attachment:', attachment.id, err);
        if (mounted) {
          setHasError(true);
          setIsLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [attachment.id, currentUserId]);

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const isImage = attachment.mimeType.startsWith('image/');
  const isVideo = attachment.mimeType.startsWith('video/');
  const isAudio = attachment.mimeType.startsWith('audio/');

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-xl bg-surface/50 border border-border/50 animate-pulse text-xs text-muted">
        <Loader2 className="w-4 h-4 animate-spin text-accent-bright" />
        <span>Loading media...</span>
      </div>
    );
  }

  if (hasError || !downloadUrl) {
    return (
      <div className="flex items-center gap-2 p-2.5 rounded-xl bg-status-busy/10 border border-status-busy/20 text-xs text-status-busy">
        <AlertCircle className="w-4 h-4 shrink-0" />
        <span>Attachment unavailable or unauthorized.</span>
      </div>
    );
  }

  // 1. Image View with Lightbox (if image failed to render as <img>, cleanly fall back to file card layout)
  if (isImage && !imageError) {
    return (
      <>
        <div className="relative group rounded-xl overflow-hidden border border-border/80 bg-surface/90 max-w-sm sm:max-w-md">
          <img
            src={downloadUrl}
            alt={attachment.originalName}
            onClick={() => setIsLightboxOpen(true)}
            onError={() => setImageError(true)}
            className="w-full max-h-80 object-cover cursor-pointer hover:opacity-95 transition-opacity bg-elevated/40"
            loading="lazy"
          />
          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/85 via-black/50 to-transparent p-2.5 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
            <span className="text-[11px] font-medium text-white truncate max-w-[200px] drop-shadow-xs">
              {attachment.originalName}
            </span>
            <a
              href={downloadUrl}
              download={attachment.originalName}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="p-1.5 rounded-lg bg-black/60 hover:bg-black/80 border border-white/20 text-white transition-colors shrink-0 shadow-sm"
              title="Download image"
            >
              <Download className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        {isLightboxOpen && (
          <MediaLightbox
            src={downloadUrl}
            alt={attachment.originalName}
            filename={attachment.originalName}
            onClose={() => setIsLightboxOpen(false)}
          />
        )}
      </>
    );
  }

  // 2. Video View
  if (isVideo) {
    return (
      <div className="rounded-xl overflow-hidden border border-border/80 bg-black/90 max-w-sm">
        <video
          src={downloadUrl}
          controls
          preload="metadata"
          className="w-full max-h-72 rounded-xl"
        >
          Your browser does not support video playback.
        </video>
      </div>
    );
  }

  // 3. Audio / Voice Note View
  if (isAudio) {
    return (
      <div className="p-2.5 rounded-xl bg-surface/80 border border-border flex flex-col gap-1.5 max-w-sm">
        <div className="flex items-center justify-between text-[11px] text-muted">
          <span className="font-medium text-primary truncate max-w-[200px]">
            {attachment.originalName}
          </span>
          <span>{formatFileSize(attachment.sizeBytes)}</span>
        </div>
        <audio
          src={downloadUrl}
          controls
          className="w-full h-8 accent-accent"
          preload="metadata"
        >
          Your browser does not support audio playback.
        </audio>
      </div>
    );
  }

  // 4. File / Document View (PDF, TXT, or fallback for broken image)
  return (
    <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-surface/80 hover:bg-surface border border-border transition-colors max-w-sm sm:max-w-md w-full">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="w-9 h-9 rounded-xl bg-accent/15 border border-accent/30 flex items-center justify-center text-accent-bright shrink-0 shadow-xs">
          <FileText className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1 pr-2">
          <p className="text-xs font-semibold text-primary truncate" title={attachment.originalName}>
            {attachment.originalName}
          </p>
          <p className="text-[10px] text-muted mt-0.5">{formatFileSize(attachment.sizeBytes)}</p>
        </div>
      </div>

      <a
        href={downloadUrl}
        download={attachment.originalName}
        target="_blank"
        rel="noopener noreferrer"
        className="p-2 rounded-xl bg-elevated hover:bg-surface-hover border border-border text-secondary hover:text-primary transition-colors shrink-0 flex items-center justify-center ml-2"
        title={`Download ${attachment.originalName}`}
      >
        <Download className="w-4 h-4" />
      </a>
    </div>
  );
};
