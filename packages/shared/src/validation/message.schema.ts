import { z } from 'zod';

// Adjustment 1: Support captionless media messages (content can be empty if attachmentIds is present)
export const sendMessageSchema = z
  .object({
    clientMessageId: z.string().min(1, 'Client message ID is required for idempotency'),
    content: z.string().max(4000, 'Message cannot exceed 4000 characters').default(''),
    type: z.enum(['TEXT', 'IMAGE', 'VIDEO', 'FILE', 'AUDIO', 'SYSTEM']).optional(),
    replyToId: z.string().optional(),
    attachmentIds: z.array(z.string().min(1)).optional(),
    isEncrypted: z.boolean().optional(),
    senderDeviceId: z.string().min(1).optional(),
    e2eeHeader: z.any().optional(),
  })
  .refine(
    (data) => {
      const hasContent = data.content && data.content.trim().length > 0;
      const hasAttachments = data.attachmentIds && data.attachmentIds.length > 0;
      return hasContent || hasAttachments;
    },
    {
      message: 'Message content cannot be empty unless attachments are provided',
      path: ['content'],
    },
  );
export type SendMessageDto = z.infer<typeof sendMessageSchema>;

export const editMessageSchema = z.object({
  content: z.string().min(1, 'Content cannot be empty').max(4000, 'Message cannot exceed 4000 characters'),
  senderDeviceId: z.string().min(1).optional(),
  e2eeHeader: z.any().optional(),
});
export type EditMessageDto = z.infer<typeof editMessageSchema>;

export const toggleReactionSchema = z.object({
  emoji: z.string().min(1, 'Emoji required').max(10),
});
export type ToggleReactionDto = z.infer<typeof toggleReactionSchema>;
