/**
 * E2EE Lifecycle Manager
 * Handles device key initialization, automatic OTPK replenishment,
 * transparent message encryption, and client-side decryption.
 */

import {
  generateIdentityKeyPair,
  generateSigningKeyPair,
  generateSignedPreKey,
  generateOneTimePreKeys,
  signDeviceBundle,
  verifyDeviceBundle,
  exportJwk,
  encryptMessage,
  decryptMessage,
  verifySignedPreKey,
  MessageItem,
} from '@chatterbox/shared';
import {
  getUserKeys,
  saveUserKeys,
  addOneTimePreKeys,
  getPeerKeyPin,
  savePeerKeyPin,
  StoredUserKeys,
} from './keyStore';
import { api, ApiError } from './api';
import type { UserKeyBundleResponse } from '@chatterbox/shared';

// StrictMode Single-Flight Guard map for in-flight device initialization
const initInFlightMap = new Map<string, Promise<StoredUserKeys | null>>();
const SIGNED_PREKEY_ROTATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const KEY_BUNDLE_CACHE_TTL_MS = 15 * 1000; // 15s short-TTL burst cache to avoid 20/min 429s
const keyBundleCache = new Map<string, { bundle: UserKeyBundleResponse; expiresAt: number }>();

/**
 * Imports a private JWK as a non-extractable WebCrypto CryptoKey so JS/XSS
 * cannot export or read raw private key material out of IndexedDB.
 */
async function importNonExtractablePrivateKey(
  jwkOrJson: JsonWebKey | string,
  algorithm: 'ECDH' | 'ECDSA',
): Promise<CryptoKey> {
  const jwk = typeof jwkOrJson === 'string' ? JSON.parse(jwkOrJson) : { ...jwkOrJson };
  if (algorithm === 'ECDH') {
    return globalThis.crypto.subtle.importKey(
      'jwk',
      { ...jwk, key_ops: ['deriveKey', 'deriveBits'] },
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      ['deriveKey', 'deriveBits'],
    );
  }
  return globalThis.crypto.subtle.importKey(
    'jwk',
    { ...jwk, key_ops: ['sign'] },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
}

/**
 * Converts an extractable CryptoKey to a non-extractable CryptoKey in memory
 * and discards the temporary JWK immediately.
 */
async function toNonExtractablePrivateKey(
  key: CryptoKey,
  algorithm: 'ECDH' | 'ECDSA',
): Promise<CryptoKey> {
  if (!key.extractable) return key;
  const jwk = await globalThis.crypto.subtle.exportKey('jwk', key);
  return importNonExtractablePrivateKey(jwk, algorithm);
}

/**
 * Ensures any legacy v1 StoredUserKeys with plaintext JWKs are migrated
 * in-place to non-extractable CryptoKey objects.
 */
async function ensureNonExtractableKeys(keys: StoredUserKeys): Promise<StoredUserKeys> {
  let migrated = false;

  if (!keys.identityKeyPair.privateKey && keys.identityKeyPair.privateKeyJwk) {
    keys.identityKeyPair.privateKey = await importNonExtractablePrivateKey(
      keys.identityKeyPair.privateKeyJwk,
      'ECDH',
    );
    delete keys.identityKeyPair.privateKeyJwk;
    migrated = true;
  }

  if (!keys.signingKeyPair.privateKey && keys.signingKeyPair.privateKeyJwk) {
    keys.signingKeyPair.privateKey = await importNonExtractablePrivateKey(
      keys.signingKeyPair.privateKeyJwk,
      'ECDSA',
    );
    delete keys.signingKeyPair.privateKeyJwk;
    migrated = true;
  }

  if (!keys.signedPreKeyPair.privateKey && keys.signedPreKeyPair.privateKeyJwk) {
    keys.signedPreKeyPair.privateKey = await importNonExtractablePrivateKey(
      keys.signedPreKeyPair.privateKeyJwk,
      'ECDH',
    );
    delete keys.signedPreKeyPair.privateKeyJwk;
    migrated = true;
  }

  for (const [keyIdStr, val] of Object.entries(keys.oneTimePreKeys)) {
    if (typeof val === 'string') {
      keys.oneTimePreKeys[Number(keyIdStr)] = await importNonExtractablePrivateKey(val, 'ECDH');
      migrated = true;
    }
  }

  if (migrated) {
    await saveUserKeys(keys);
  }

  return keys;
}

function detectDeviceName(): string {
  if (typeof window === 'undefined') return 'Web Browser';
  const ua = window.navigator.userAgent;
  let browser = 'Web Browser';
  if (ua.includes('Firefox/')) browser = 'Firefox';
  else if (ua.includes('Edg/')) browser = 'Edge';
  else if (ua.includes('Chrome/')) browser = 'Chrome';
  else if (ua.includes('Safari/')) browser = 'Safari';

  let os = 'Desktop';
  if (ua.includes('Macintosh')) os = 'macOS';
  else if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Linux')) os = 'Linux';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

  return `${browser} on ${os}`;
}

export async function initializeDeviceKeys(user: { id: string; username: string }): Promise<StoredUserKeys | null> {
  if (typeof window === 'undefined' || !globalThis.crypto?.subtle) {
    return null;
  }

  // Deduplicate concurrent calls (e.g. React 19 StrictMode double-mounting)
  const existingPromise = initInFlightMap.get(user.id);
  if (existingPromise) {
    return existingPromise;
  }

  const initPromise = (async () => {
    try {
      const rawLocalKeys = await getUserKeys(user.id);
      const localKeys = rawLocalKeys ? await ensureNonExtractableKeys(rawLocalKeys) : null;
      const activeDevices = await api.getMyDevices().catch(() => []);

      const matchingActiveDevice = localKeys
        ? activeDevices.find((d) => d.id === localKeys.deviceId && d.revokedAt === null)
        : null;

      if (!localKeys || !matchingActiveDevice) {
        // Generate new key pairs
        const identity = await generateIdentityKeyPair();
        const signing = await generateSigningKeyPair();
        const identityPublicJwk = await exportJwk(identity.publicKey);
        const signingPublicJwk = await exportJwk(signing.publicKey);
        const signedPreKey = await generateSignedPreKey(signing.privateKey, identityPublicJwk);
        const otpkList = await generateOneTimePreKeys(20, 1);

        const identityBindingSignature = await signDeviceBundle(
          signing.privateKey,
          identityPublicJwk,
          signedPreKey.preKeyPublicJwk,
        );

        // Convert all private keys to non-extractable CryptoKeys before persisting to IndexedDB
        const identityPrivateKey = await toNonExtractablePrivateKey(identity.privateKey, 'ECDH');
        const signingPrivateKey = await toNonExtractablePrivateKey(signing.privateKey, 'ECDSA');
        const signedPreKeyPrivateKey = await toNonExtractablePrivateKey(signedPreKey.preKey.privateKey, 'ECDH');

        const otpkPrivateMap: Record<number, CryptoKey> = {};
        for (const otpk of otpkList) {
          otpkPrivateMap[otpk.keyId] = await toNonExtractablePrivateKey(otpk.keyPair.privateKey, 'ECDH');
        }

        const deviceName = detectDeviceName();

        const registered = await api.registerDevice({
          deviceName,
          identityKeyPublic: identityPublicJwk,
          signingKeyPublic: signingPublicJwk,
          signedPreKeyPublic: signedPreKey.preKeyPublicJwk,
          signedPreKeySignature: signedPreKey.signatureBase64,
          identityBindingSignature,
          oneTimePreKeys: otpkList.map((k) => ({
            keyId: k.keyId,
            publicKey: k.publicJwk,
          })),
        });

        const newStoredKeys: StoredUserKeys = {
          userId: user.id,
          deviceId: registered.id,
          deviceName,
          identityKeyPair: {
            publicKeyJwk: identityPublicJwk,
            privateKey: identityPrivateKey,
          },
          signingKeyPair: {
            publicKeyJwk: signingPublicJwk,
            privateKey: signingPrivateKey,
          },
          signedPreKeyPair: {
            publicKeyJwk: signedPreKey.preKeyPublicJwk,
            privateKey: signedPreKeyPrivateKey,
            signatureBase64: signedPreKey.signatureBase64,
            identityBindingSignature,
            rotatedAt: Date.now(),
          },
          oneTimePreKeys: otpkPrivateMap,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        await saveUserKeys(newStoredKeys);
        return newStoredKeys;
      }

      // Rotate signed prekey periodically (every 7 days)
      const lastRotatedAt = localKeys.signedPreKeyPair.rotatedAt ?? localKeys.createdAt;
      if (
        localKeys.signingKeyPair.privateKey &&
        Date.now() - lastRotatedAt > SIGNED_PREKEY_ROTATION_MS
      ) {
        try {
          const nextSignedPreKey = await generateSignedPreKey(
            localKeys.signingKeyPair.privateKey,
            localKeys.identityKeyPair.publicKeyJwk,
          );
          const nextBindingSig = await signDeviceBundle(
            localKeys.signingKeyPair.privateKey,
            localKeys.identityKeyPair.publicKeyJwk,
            nextSignedPreKey.preKeyPublicJwk,
          );
          await api.rotateSignedPreKey(matchingActiveDevice.id, {
            signedPreKeyPublic: nextSignedPreKey.preKeyPublicJwk,
            signedPreKeySignature: nextSignedPreKey.signatureBase64,
            identityBindingSignature: nextBindingSig,
          });
          localKeys.signedPreKeyPair = {
            publicKeyJwk: nextSignedPreKey.preKeyPublicJwk,
            privateKey: await toNonExtractablePrivateKey(nextSignedPreKey.preKey.privateKey, 'ECDH'),
            signatureBase64: nextSignedPreKey.signatureBase64,
            identityBindingSignature: nextBindingSig,
            rotatedAt: Date.now(),
          };
          await saveUserKeys(localKeys);
        } catch (rotErr) {
          console.warn('[E2EE] Signed prekey rotation deferred:', rotErr);
        }
      }

      // Check remaining prekeys and replenish if below 5
      if (matchingActiveDevice.remainingPreKeys < 5) {
        const existingKeyIds = Object.keys(localKeys.oneTimePreKeys).map((k) => parseInt(k, 10));
        const maxKeyId = existingKeyIds.length > 0 ? Math.max(...existingKeyIds) : 0;
        const newOtpkList = await generateOneTimePreKeys(20, maxKeyId + 1);

        await api.replenishPreKeys(matchingActiveDevice.id, {
          preKeys: newOtpkList.map((k) => ({
            keyId: k.keyId,
            publicKey: k.publicJwk,
          })),
        });

        const newPrivateMap: Record<number, CryptoKey> = {};
        for (const otpk of newOtpkList) {
          newPrivateMap[otpk.keyId] = await toNonExtractablePrivateKey(otpk.keyPair.privateKey, 'ECDH');
        }

        await addOneTimePreKeys(user.id, newPrivateMap);
        localKeys.oneTimePreKeys = {
          ...localKeys.oneTimePreKeys,
          ...newPrivateMap,
        };
      }

      return localKeys;
    } catch (err) {
      console.error('[E2EE] Failed to initialize device keys:', err);
      return null;
    } finally {
      initInFlightMap.delete(user.id);
    }
  })();

  initInFlightMap.set(user.id, initPromise);
  return initPromise;
}

export interface EncryptResult {
  ciphertext: string;
  e2eeHeader: any;
  senderDeviceId: string;
  keyChangeWarning?: string;
}

/**
 * Encrypts plaintext for all active devices of the recipient and sender's own device.
 * Verifies signed prekey signatures, enforces TOFU key pinning, and signs message headers.
 */
export async function encryptForConversation(
  conversationId: string,
  recipientUserId: string,
  senderUserId: string,
  plaintext: string
): Promise<EncryptResult> {
  const rawSenderKeys = await getUserKeys(senderUserId);
  const senderKeys = rawSenderKeys ? await ensureNonExtractableKeys(rawSenderKeys) : null;
  if (!senderKeys) {
    throw new Error('No local device keys found. Please re-authenticate or refresh.');
  }

  // Fetch recipient active key bundle with short-TTL burst cache & 429 fallback
  const cacheKey = `${senderUserId}:${recipientUserId}`;
  const cachedEntry = keyBundleCache.get(cacheKey);
  let recipientBundle: UserKeyBundleResponse;

  if (cachedEntry && cachedEntry.expiresAt > Date.now()) {
    recipientBundle = cachedEntry.bundle;
  } else {
    try {
      const fetchedBundle = await api.getUserKeyBundles(recipientUserId);
      // Cache a signed-prekey-only copy for burst sends (never reuse consumed one-time prekeys)
      keyBundleCache.set(cacheKey, {
        bundle: {
          ...fetchedBundle,
          devices: fetchedBundle.devices.map((d) => ({ ...d, oneTimePreKey: null })),
        },
        expiresAt: Date.now() + KEY_BUNDLE_CACHE_TTL_MS,
      });
      recipientBundle = fetchedBundle;
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        if (cachedEntry) {
          recipientBundle = cachedEntry.bundle;
        } else {
          throw new Error('Too many encryption key requests. Please wait a few seconds and try again.');
        }
      } else {
        throw err;
      }
    }
  }

  if (!recipientBundle.devices || recipientBundle.devices.length === 0) {
    throw new Error('Recipient has no registered active devices capable of E2EE.');
  }

  const existingPin = await getPeerKeyPin(senderUserId, recipientUserId).catch(() => null);
  const updatedDevicesMap = { ...(existingPin?.devices || {}) };
  let keyChangeWarning: string | undefined;

  const recipientDeviceList = [];

  for (const device of recipientBundle.devices) {
    // 1. Cryptographically verify signed pre-key signature (supports bound & unbound signatures)
    const isValidSig =
      (await verifySignedPreKey(
        device.signedPreKeyPublic,
        device.signedPreKeySignature,
        device.signingKeyPublic,
      )) ||
      (await verifySignedPreKey(
        device.signedPreKeyPublic,
        device.signedPreKeySignature,
        device.signingKeyPublic,
        device.identityKeyPublic,
      ));

    if (!isValidSig) {
      throw new Error(`Device ${device.deviceName} signature verification failed.`);
    }

    // 2. Verify explicit identity-to-prekey binding signature if supplied by server
    const bindingSig = (device as { identityBindingSignature?: string }).identityBindingSignature;
    if (bindingSig) {
      const isBindingValid = await verifyDeviceBundle(
        device.identityKeyPublic,
        device.signedPreKeyPublic,
        bindingSig,
        device.signingKeyPublic,
      );
      if (!isBindingValid) {
        throw new Error(`Device ${device.deviceName} identity key binding verification failed.`);
      }
    }

    // 3. TOFU Key Pinning verification
    const pinned = existingPin?.devices[device.deviceId];
    if (pinned) {
      if (
        pinned.identityKeyPublic !== device.identityKeyPublic ||
        pinned.signingKeyPublic !== device.signingKeyPublic
      ) {
        throw new Error(
          `Security Alert: Encryption identity keys for ${device.deviceName} changed unexpectedly. Verify Safety Number before sending.`,
        );
      }
    } else {
      if (existingPin && Object.keys(existingPin.devices).length > 0) {
        keyChangeWarning =
          'This contact registered a new encryption device. Verify their Safety Number to confirm their identity.';
      }
      updatedDevicesMap[device.deviceId] = {
        identityKeyPublic: device.identityKeyPublic,
        signingKeyPublic: device.signingKeyPublic,
        firstSeenAt: Date.now(),
      };
    }

    recipientDeviceList.push({
      deviceId: device.deviceId,
      identityPublicKey: device.identityKeyPublic,
      signedPreKeyPublic: device.signedPreKeyPublic,
      oneTimePreKeyPublic: device.oneTimePreKey?.publicKey,
      oneTimePreKeyId: device.oneTimePreKey?.keyId,
    });
  }

  await savePeerKeyPin({
    peerKey: `${senderUserId}:${recipientUserId}`,
    ownerUserId: senderUserId,
    peerUserId: recipientUserId,
    devices: updatedDevicesMap,
    updatedAt: Date.now(),
  }).catch(() => {});

  // Wrap for sender's own device using local signedPreKeyPair without consuming sender's OTPKs
  recipientDeviceList.push({
    deviceId: senderKeys.deviceId,
    identityPublicKey: senderKeys.identityKeyPair.publicKeyJwk,
    signedPreKeyPublic: senderKeys.signedPreKeyPair.publicKeyJwk,
    oneTimePreKeyPublic: null,
    oneTimePreKeyId: null,
  });

  const encrypted = await encryptMessage({
    plaintext,
    conversationId,
    senderId: senderUserId,
    senderDeviceId: senderKeys.deviceId,
    senderSigningPrivateKey: senderKeys.signingKeyPair.privateKey,
    recipients: recipientDeviceList,
  });

  return {
    ciphertext: encrypted.ciphertext,
    e2eeHeader: encrypted.e2eeHeader,
    senderDeviceId: senderKeys.deviceId,
    keyChangeWarning,
  };
}

/**
 * Decrypts incoming encrypted message content using IndexedDB non-extractable private keys.
 * Returns decrypted plaintext or an honest placeholder if missing/undecryptable.
 */
export async function decryptMessageContent(
  message: MessageItem,
  currentUserId: string
): Promise<string> {
  if (!message.isEncrypted || !message.e2eeHeader) {
    return message.content;
  }

  if (message.deletedAt !== null) {
    return 'This message was deleted';
  }

  if (typeof window === 'undefined' || !globalThis.crypto?.subtle) {
    return '🔒 Encrypted message';
  }

  try {
    const rawKeys = await getUserKeys(currentUserId);
    const localKeys = rawKeys ? await ensureNonExtractableKeys(rawKeys) : null;
    if (!localKeys) {
      return '🔒 Unable to decrypt on this device';
    }

    const envelope = message.e2eeHeader.devices?.[localKeys.deviceId];
    if (!envelope) {
      return '🔒 Unable to decrypt on this device';
    }

    // Determine target private CryptoKey: OTPK if present and found locally, otherwise signed prekey
    let recipientPrivateKey: CryptoKey | undefined;
    if (envelope.oneTimePreKeyId != null) {
      const storedOtpk = localKeys.oneTimePreKeys[envelope.oneTimePreKeyId];
      if (storedOtpk && typeof storedOtpk !== 'string') {
        recipientPrivateKey = storedOtpk;
      }
    }

    if (!recipientPrivateKey) {
      recipientPrivateKey = localKeys.signedPreKeyPair.privateKey;
    }

    if (!recipientPrivateKey) {
      return '🔒 Unable to decrypt on this device';
    }

    // Look up pinned sender signing key if available to verify senderSignature
    let senderSigningPublicKey: string | undefined;
    if (message.senderId === currentUserId && message.senderDeviceId === localKeys.deviceId) {
      senderSigningPublicKey = localKeys.signingKeyPair.publicKeyJwk;
    } else if (message.senderId && message.senderDeviceId) {
      const peerPin = await getPeerKeyPin(currentUserId, message.senderId).catch(() => null);
      senderSigningPublicKey = peerPin?.devices[message.senderDeviceId]?.signingKeyPublic;
    }

    return await decryptMessage({
      ciphertext: message.content,
      e2eeHeader: message.e2eeHeader,
      recipientDeviceId: localKeys.deviceId,
      recipientPrivateKey,
      conversationId: message.conversationId,
      senderId: message.senderId,
      senderDeviceId: message.senderDeviceId ?? undefined,
      senderSigningPublicKey,
      requireSenderSignature: Boolean(senderSigningPublicKey),
    });
  } catch (err) {
    console.warn('[E2EE] Decryption error for message:', message.id, err);
    return '🔒 Unable to decrypt on this device';
  }
}
