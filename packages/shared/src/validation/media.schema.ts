import { z } from 'zod';

export const ALLOWED_MIME_TYPES = [
  // Images (max 10MB)
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  // Audio (max 10MB)
  'audio/webm',
  'audio/ogg',
  'audio/mpeg',
  // Video (max 50MB)
  'video/mp4',
  'video/webm',
  // Documents (max 50MB)
  'application/pdf',
  'text/plain',
] as const;

export const MAX_MEDIA_SIZES: Record<string, number> = {
  image: 10 * 1024 * 1024, // 10MB
  audio: 10 * 1024 * 1024, // 10MB
  video: 50 * 1024 * 1024, // 50MB
  document: 50 * 1024 * 1024, // 50MB
};

export function getMaxSizeBytes(mimeType: string): number {
  if (mimeType.startsWith('image/')) return MAX_MEDIA_SIZES.image;
  if (mimeType.startsWith('audio/')) return MAX_MEDIA_SIZES.audio;
  if (mimeType.startsWith('video/')) return MAX_MEDIA_SIZES.video;
  return MAX_MEDIA_SIZES.document;
}

export const presignUploadSchema = z
  .object({
    filename: z.string().min(1).max(255),
    mimeType: z.enum(ALLOWED_MIME_TYPES, {
      errorMap: () => ({ message: 'Unsupported file type' }),
    }),
    sizeBytes: z.number().int().positive(),
    durationSec: z.number().positive().optional(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
  })
  .refine((data) => data.sizeBytes <= getMaxSizeBytes(data.mimeType), {
    message: 'File size exceeds maximum allowed limit for this type',
    path: ['sizeBytes'],
  });

export type PresignUploadInput = z.infer<typeof presignUploadSchema>;

export const confirmUploadSchema = z.object({
  attachmentId: z.string().min(1),
});

export type ConfirmUploadInput = z.infer<typeof confirmUploadSchema>;
