import { z } from 'zod';

export const RESERVED_USERNAMES = [
  'admin',
  'administrator',
  'support',
  'moderator',
  'system',
  'chatterbox',
  'official',
  'security',
  'root',
  'help',
] as const;

export const registerSchema = z.object({
  email: z
    .string()
    .email('Please provide a valid email address')
    .toLowerCase()
    .trim(),
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must be at most 30 characters')
    .regex(
      /^[a-zA-Z0-9_]+$/,
      'Username can only contain letters, numbers, and underscores',
    )
    .toLowerCase()
    .trim()
    .refine(
      (val) => !RESERVED_USERNAMES.includes(val as any),
      { message: 'This username is reserved and cannot be registered' },
    ),
  displayName: z
    .string()
    .min(1, 'Display name cannot be empty')
    .max(50, 'Display name must be at most 50 characters')
    .trim(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters'),
});

export type RegisterDto = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  identifier: z
    .string()
    .min(1, 'Identifier (email or username) is required')
    .max(100, 'Identifier too long')
    .trim(),
  password: z
    .string()
    .min(1, 'Password is required')
    .max(128, 'Password too long'),
});

export type LoginDto = z.infer<typeof loginSchema>;
