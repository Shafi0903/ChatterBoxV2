import { z } from 'zod';

export function isSafeHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export const safeHttpUrlSchema = (message = 'URL must be a valid http or https URL') =>
  z.string().url(message).refine(isSafeHttpUrl, { message });

export const cursorPaginationSchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
export type CursorPaginationQuery = z.infer<typeof cursorPaginationSchema>;
