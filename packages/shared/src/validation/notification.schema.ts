import { z } from 'zod';

export const notificationsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 20))
    .pipe(z.number().int().min(1).max(50)),
});

export type NotificationsQueryInput = z.infer<typeof notificationsQuerySchema>;
