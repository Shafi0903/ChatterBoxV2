'use client';

import React, { useState, useEffect } from 'react';
import { MediaAttachmentItem } from '@chatterbox/shared';
import { api } from '../../lib/api';
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

// In-memory cache for presigned download URLs (4-minute TTL to stay safely under 5m presigned expiry)
const mediaUrlCache = new Map<string, { url: string; expiresAt: number }>();
const inFlightUrlPromises = new Map<string, Promise<string>>();

async function fetchAuthorizedUrl(attachmentId: string): Promise<string> {
  const cached = mediaUrlCache.get(attachmentId);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.url;
  }

  // Deduplicate in-flight requests for the same attachment
  if (inFlightUrlPromises.has(attachmentId)) {
    return inFlightUrlPromises.get(attachmentId)!;
  }

  const promise = api
    .getMediaDownloadUrl(attachmentId)
    .then((res) => {
      // 4 minutes = 240,000 ms
      mediaUrlCache.set(attachmentId, {
        url: res.downloadUrl,
        expiresAt: Date.now() + 240 * 1000,
      });
      inFlightUrlPromises.delete(attachmentId);
      return res.downloadUrl;
    })
    .catch((err) => {
      inFlightUrlPromises.delete(attachmentId);
      throw err;
    });

  inFlightUrlPromises.set(attachmentId, promise);
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
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

  useEffect(() => {
    let mounted = true;

    fetchAuthorizedUrl(attachment.id)
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
  }, [attachment.id]);

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

  // 1. Image View with Lightbox
  if (isImage) {
    return (
      <>
        <div className="relative group rounded-xl overflow-hidden border border-border/80 bg-surface max-w-sm">
          <img
            src={downloadUrl}
            alt={attachment.originalName}
            onClick={() => setIsLightboxOpen(true)}
            className="w-full max-h-72 object-cover cursor-pointer hover:opacity-95 transition-opacity"
            loading="lazy"
          />
          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-2 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
            <span className="text-[11px] font-medium text-white truncate max-w-[200px]">
              {attachment.originalName}
            </span>
            <a
              href={downloadUrl}
              download={attachment.originalName}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="p-1 rounded-md bg-white/20 hover:bg-white/30 text-white transition-colors"
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

  // 4. File / Document View (PDF, TXT, etc.)
  return (
    <div className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-surface/80 hover:bg-surface border border-border transition-colors max-w-sm">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-8 h-8 rounded-lg bg-accent/15 border border-accent/30 flex items-center justify-center text-accent-bright shrink-0">
          <FileText className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-primary truncate max-w-[180px]">
            {attachment.originalName}
          </p>
          <p className="text-[10px] text-muted">{formatFileSize(attachment.sizeBytes)}</p>
        </div>
      </div>

      <a
        href={downloadUrl}
        download={attachment.originalName}
        target="_blank"
        rel="noopener noreferrer"
        className="p-1.5 rounded-lg bg-elevated hover:bg-elevated/80 border border-border text-muted hover:text-primary transition-colors shrink-0"
        title={`Download ${attachment.originalName}`}
      >
        <Download className="w-4 h-4" />
      </a>
    </div>
  );
};
