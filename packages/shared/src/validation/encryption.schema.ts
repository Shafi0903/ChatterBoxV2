import { z } from 'zod';

export function isValidPublicJwkEC(rawJwk: string): boolean {
  try {
    const parsed = JSON.parse(rawJwk);
    if (!parsed || typeof parsed !== 'object') return false;
    if (parsed.kty !== 'EC' || parsed.crv !== 'P-256') return false;
    if (typeof parsed.x !== 'string' || typeof parsed.y !== 'string') return false;
    // Strictly forbid private key parameter 'd'
    if (parsed.d !== undefined) return false;
    return true;
  } catch {
    return false;
  }
}

const publicJwkSchema = z.string().refine(isValidPublicJwkEC, {
  message: 'Invalid public EC P-256 JWK or private key parameter present',
});

const base64StringSchema = z.string().min(1).regex(/^[A-Za-z0-9+/=]+$/, {
  message: 'Must be a valid base64-encoded string',
});

export const oneTimePreKeyItemSchema = z.object({
  keyId: z.number().int().nonnegative(),
  publicKey: publicJwkSchema,
});

export const registerDeviceSchema = z.object({
  deviceName: z.string().min(1).max(100),
  identityKeyPublic: publicJwkSchema,
  signingKeyPublic: publicJwkSchema,
  signedPreKeyPublic: publicJwkSchema,
  signedPreKeySignature: base64StringSchema,
  oneTimePreKeys: z.array(oneTimePreKeyItemSchema).min(1).max(200),
});

export type RegisterDeviceInput = z.infer<typeof registerDeviceSchema>;

export const replenishPreKeysSchema = z.object({
  preKeys: z.array(oneTimePreKeyItemSchema).min(1).max(200),
});

export type ReplenishPreKeysInput = z.infer<typeof replenishPreKeysSchema>;

export const e2eeDeviceEnvelopeSchema = z.object({
  wrappedKey: base64StringSchema,
  wrapIv: base64StringSchema,
  oneTimePreKeyId: z.number().int().nonnegative().optional().nullable(),
});

export const e2eeHeaderSchema = z.object({
  version: z.literal(1),
  ephemeralPublicKey: publicJwkSchema,
  iv: base64StringSchema,
  devices: z.record(z.string().min(1), e2eeDeviceEnvelopeSchema),
});

export type E2eeHeaderInput = z.infer<typeof e2eeHeaderSchema>;

export const enableE2eeSchema = z.object({
  conversationId: z.string().uuid(),
});

export type EnableE2eeInput = z.infer<typeof enableE2eeSchema>;
