import { z } from 'zod';
import { safeHttpUrlSchema } from './url.schema';

export const updateProfileSchema = z.object({
  displayName: z
    .string()
    .min(1, 'Display name cannot be empty')
    .max(50, 'Display name must be at most 50 characters')
    .trim()
    .optional(),
  bio: z
    .string()
    .max(280, 'Bio must be at most 280 characters')
    .nullable()
    .optional(),
  avatarUrl: safeHttpUrlSchema('Avatar URL must be a valid http or https URL')
    .nullable()
    .optional(),
  bannerUrl: safeHttpUrlSchema('Banner URL must be a valid http or https URL')
    .nullable()
    .optional(),
  location: z
    .string()
    .max(100, 'Location must be at most 100 characters')
    .nullable()
    .optional(),
  tags: z
    .array(z.string().max(30, 'Tag must be at most 30 characters'))
    .max(10, 'At most 10 tags allowed')
    .optional(),
});

export type UpdateProfileDto = z.infer<typeof updateProfileSchema>;
