export type MediaAttachmentStatus = 'PENDING' | 'READY' | 'FAILED';

export interface MediaAttachmentItem {
  id: string;
  uploaderId: string;
  messageId: string | null;
  storageKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  durationSec?: number | null;
  width?: number | null;
  height?: number | null;
  status: MediaAttachmentStatus;
  downloadUrl?: string | null;
  createdAt: string | Date;
}

export interface PresignUploadDto {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  durationSec?: number;
  width?: number;
  height?: number;
}

export interface PresignUploadResponse {
  attachmentId: string;
  storageKey: string;
  uploadUrl: string;
  expiresIn: number;
}

export interface MediaDownloadUrlResponse {
  attachmentId: string;
  downloadUrl: string;
  expiresIn: number;
}
