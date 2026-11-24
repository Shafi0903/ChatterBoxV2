import { z } from 'zod';

export const communityRoleEnum = z.enum(['OWNER', 'ADMIN', 'MODERATOR', 'MEMBER']);
export const channelTypeEnum = z.enum(['TEXT', 'ANNOUNCEMENT']);

export const createCommunitySchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
  description: z.string().trim().max(500).optional(),
  isPublic: z.boolean().default(true),
  iconUrl: z.string().url().optional(),
  bannerUrl: z.string().url().optional(),
});

export const updateCommunitySchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  description: z.string().trim().max(500).optional().nullable(),
  isPublic: z.boolean().optional(),
  iconUrl: z.string().url().optional().nullable(),
  bannerUrl: z.string().url().optional().nullable(),
});

export const createChannelSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Channel name must be at least 2 characters')
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'Channel name must be lowercase alphanumeric and hyphens'),
  topic: z.string().trim().max(255).optional().nullable(),
  type: channelTypeEnum.default('TEXT'),
  position: z.number().int().min(0).default(0),
});

export const updateChannelSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'Channel name must be lowercase alphanumeric and hyphens')
    .optional(),
  topic: z.string().trim().max(255).optional().nullable(),
  position: z.number().int().min(0).optional(),
});

export const createInviteSchema = z.object({
  maxUses: z.number().int().positive().max(1000).optional().nullable(),
  expiresInHours: z.number().positive().max(720).optional().nullable(), // Max 30 days
});

export const updateMemberRoleSchema = z.object({
  role: z.enum(['ADMIN', 'MODERATOR', 'MEMBER']),
});

// Adjustment #1: Allow empty content if attachmentIds is provided and non-empty
export const sendChannelMessageSchema = z
  .object({
    clientMessageId: z.string().min(1, 'clientMessageId is required'),
    content: z.string().max(4000).default(''),
    replyToId: z.string().optional().nullable(),
    attachmentIds: z.array(z.string()).max(10).default([]),
  })
  .refine(
    (data) => data.content.trim().length > 0 || (data.attachmentIds && data.attachmentIds.length > 0),
    {
      message: 'Message must have content or at least one attachment',
      path: ['content'],
    },
  );

export const editChannelMessageSchema = z.object({
  content: z.string().trim().min(1, 'Content cannot be empty').max(4000),
});

export type CreateCommunityDto = z.infer<typeof createCommunitySchema>;
export type UpdateCommunityDto = z.infer<typeof updateCommunitySchema>;
export type CreateChannelDto = z.infer<typeof createChannelSchema>;
export type UpdateChannelDto = z.infer<typeof updateChannelSchema>;
export type CreateInviteDto = z.infer<typeof createInviteSchema>;
export type UpdateMemberRoleDto = z.infer<typeof updateMemberRoleSchema>;
export type SendChannelMessageDto = z.infer<typeof sendChannelMessageSchema>;
export type EditChannelMessageDto = z.infer<typeof editChannelMessageSchema>;
