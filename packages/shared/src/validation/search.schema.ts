import { z } from 'zod';

export const globalSearchSchema = z.object({
  q: z.string().min(1, 'Search query must not be empty').max(100, 'Search query too long'),
  type: z.enum(['all', 'users', 'communities', 'posts', 'messages']).default('all'),
  limit: z.coerce.number().min(1).max(20).default(5),
});

export type GlobalSearchQuery = z.infer<typeof globalSearchSchema>;
