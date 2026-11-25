import { z } from 'zod';

const booleanStringSchema = z.enum(['true', 'false', '1', '0']);

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    CORS_ORIGIN: z.string().min(1).default('http://localhost:3000'),
    TRUST_PROXY: z.string().optional(),
    THROTTLE_DISABLED: booleanStringSchema.optional(),

    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
    JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
    JWT_ACCESS_EXPIRES_IN: z.string().min(1).default('15m'),
    JWT_REFRESH_EXPIRES_IN: z.string().min(1).default('7d'),

    S3_ENDPOINT: z.string().url('S3_ENDPOINT must be a valid URL').default('http://localhost:9000'),
    S3_PUBLIC_ENDPOINT: z.string().url('S3_PUBLIC_ENDPOINT must be a valid URL').optional().or(z.literal('')),
    S3_BUCKET: z.string().min(1).default('chatterbox-media'),
    S3_ACCESS_KEY: z.string().min(1).default('minioadmin'),
    S3_SECRET_KEY: z.string().min(1).default('minioadmin'),
    API_PUBLIC_URL: z.string().url('API_PUBLIC_URL must be a valid URL').optional().or(z.literal('')),

    STUN_URLS: z.string().optional(),
    TURN_URL: z.string().optional().or(z.literal('')),
    TURN_USERNAME: z.string().optional().or(z.literal('')),
    TURN_CREDENTIAL: z.string().optional().or(z.literal('')),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === 'production') {
      if (data.THROTTLE_DISABLED === 'true' || data.THROTTLE_DISABLED === '1') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['THROTTLE_DISABLED'],
          message: 'THROTTLE_DISABLED cannot be enabled in production',
        });
      }
      if (data.S3_ACCESS_KEY === 'minioadmin' || data.S3_SECRET_KEY === 'minioadmin') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['S3_ACCESS_KEY'],
          message: 'Default minioadmin S3 credentials are forbidden in production',
        });
      }
    }
    if (data.TURN_URL && !/^turns?:/.test(data.TURN_URL)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['TURN_URL'],
        message: 'TURN_URL must use turn: or turns: scheme',
      });
    }
  });

export function validateEnv(config: Record<string, unknown> = process.env) {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => ` - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Environment validation failed:\n${formatted}`);
  }
  return result.data;
}
