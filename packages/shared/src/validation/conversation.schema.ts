import { z } from 'zod';

export const createDmSchema = z.object({
  targetUserId: z.string().min(1, 'Target user ID is required'),
});
export type CreateDmDto = z.infer<typeof createDmSchema>;

export const createGroupSchema = z.object({
  name: z.string().min(1, 'Group name cannot be empty').max(50, 'Group name too long').trim(),
  memberIds: z.array(z.string().min(1)).min(1, 'At least one member is required').max(99),
});
export type CreateGroupDto = z.infer<typeof createGroupSchema>;

export const updateConversationSchema = z.object({
  name: z.string().min(1).max(50).trim().optional(),
  avatarUrl: z.string().url().nullable().optional(),
});
export type UpdateConversationDto = z.infer<typeof updateConversationSchema>;

export const addMembersSchema = z.object({
  userIds: z.array(z.string().min(1)).min(1, 'At least one user ID required'),
});
export type AddMembersDto = z.infer<typeof addMembersSchema>;

export const markConversationReadSchema = z.object({
  lastReadMessageId: z.string().min(1, 'Last read message ID is required'),
});
export type MarkConversationReadDto = z.infer<typeof markConversationReadSchema>;
