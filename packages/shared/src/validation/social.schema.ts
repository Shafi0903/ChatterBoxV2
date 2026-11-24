import { z } from 'zod';

export const createPostSchema = z
  .object({
    content: z.string().max(5000, 'Post content cannot exceed 5000 characters').default(''),
    visibility: z.enum(['PUBLIC', 'FOLLOWERS']).default('PUBLIC'),
    attachmentIds: z.array(z.string()).max(4, 'Cannot attach more than 4 items to a post').default([]),
  })
  .refine(
    (data) => data.content.trim().length > 0 || data.attachmentIds.length > 0,
    {
      message: 'Post must have either text content or at least one attachment',
      path: ['content'],
    },
  );

export type CreatePostDto = z.infer<typeof createPostSchema>;

export const createCommentSchema = z.object({
  content: z
    .string()
    .min(1, 'Comment cannot be empty')
    .max(1000, 'Comment cannot exceed 1000 characters')
    .transform((val) => val.trim()),
});

export type CreateCommentDto = z.infer<typeof createCommentSchema>;

export const createStorySchema = z
  .object({
    caption: z
      .string()
      .max(300, 'Story caption cannot exceed 300 characters')
      .optional()
      .nullable(),
    backgroundColor: z
      .string()
      .max(50, 'Invalid background color value')
      .optional()
      .nullable(),
    attachmentId: z.string().optional().nullable(),
  })
  .refine(
    (data) =>
      (data.caption && data.caption.trim().length > 0) ||
      (data.attachmentId && data.attachmentId.trim().length > 0),
    {
      message: 'Story must have either media or a caption',
      path: ['caption'],
    },
  );

export type CreateStoryDto = z.infer<typeof createStorySchema>;
