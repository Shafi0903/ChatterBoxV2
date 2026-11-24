import { z } from 'zod';

export const updateUserSettingsSchema = z.object({
  theme: z.enum(['DARK', 'LIGHT', 'SYSTEM']).optional(),
  profileVisibility: z.enum(['PUBLIC', 'FOLLOWERS_ONLY', 'PRIVATE']).optional(),
  showOnlineStatus: z.boolean().optional(),
  showReadReceipts: z.boolean().optional(),
  allowDirectMessages: z.boolean().optional(),
  notifyNewMessages: z.boolean().optional(),
  notifyMentions: z.boolean().optional(),
});

export type UpdateUserSettingsDto = z.infer<typeof updateUserSettingsSchema>;
