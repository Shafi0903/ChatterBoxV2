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
  exportJwk,
  importPrivateEcdhKey,
  encryptMessage,
  decryptMessage,
  verifySignedPreKey,
  MessageItem,
} from '@chatterbox/shared';
import {
  getUserKeys,
  saveUserKeys,
  addOneTimePreKeys,
  StoredUserKeys,
} from './keyStore';
import { api } from './api';

// Adjustment 1: StrictMode Single-Flight Guard map for in-flight device initialization
const initInFlightMap = new Map<string, Promise<StoredUserKeys | null>>();

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
      const localKeys = await getUserKeys(user.id);
      const activeDevices = await api.getMyDevices().catch(() => []);

      const matchingActiveDevice = localKeys
        ? activeDevices.find((d) => d.id === localKeys.deviceId && d.revokedAt === null)
        : null;

      if (!localKeys || !matchingActiveDevice) {
        // Generate new key pairs
        const identity = await generateIdentityKeyPair();
        const signing = await generateSigningKeyPair();
        const signedPreKey = await generateSignedPreKey(signing.privateKey);
        const otpkList = await generateOneTimePreKeys(20, 1);

        const identityPublicJwk = await exportJwk(identity.publicKey);
        const identityPrivateJwk = await exportJwk(identity.privateKey);

        const signingPublicJwk = await exportJwk(signing.publicKey);
        const signingPrivateJwk = await exportJwk(signing.privateKey);

        const signedPreKeyPrivateJwk = await exportJwk(signedPreKey.preKey.privateKey);

        const otpkPrivateMap: Record<number, string> = {};
        for (const otpk of otpkList) {
          otpkPrivateMap[otpk.keyId] = await exportJwk(otpk.keyPair.privateKey);
        }

        const deviceName = detectDeviceName();

        const registered = await api.registerDevice({
          deviceName,
          identityKeyPublic: identityPublicJwk,
          signingKeyPublic: signingPublicJwk,
          signedPreKeyPublic: signedPreKey.preKeyPublicJwk,
          signedPreKeySignature: signedPreKey.signatureBase64,
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
            privateKeyJwk: identityPrivateJwk,
          },
          signingKeyPair: {
            publicKeyJwk: signingPublicJwk,
            privateKeyJwk: signingPrivateJwk,
          },
          signedPreKeyPair: {
            publicKeyJwk: signedPreKey.preKeyPublicJwk,
            privateKeyJwk: signedPreKeyPrivateJwk,
            signatureBase64: signedPreKey.signatureBase64,
          },
          oneTimePreKeys: otpkPrivateMap,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        await saveUserKeys(newStoredKeys);
        return newStoredKeys;
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

        const newPrivateMap: Record<number, string> = {};
        for (const otpk of newOtpkList) {
          newPrivateMap[otpk.keyId] = await exportJwk(otpk.keyPair.privateKey);
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
}

/**
 * Encrypts plaintext for all active devices of the recipient and sender's own device.
 * User adjustment #3: Wraps for sender's own device using local signedPreKeyPair without consuming sender's OTPKs.
 */
export async function encryptForConversation(
  conversationId: string,
  recipientUserId: string,
  senderUserId: string,
  plaintext: string
): Promise<EncryptResult> {
  const senderKeys = await getUserKeys(senderUserId);
  if (!senderKeys) {
    throw new Error('No local device keys found. Please re-authenticate or refresh.');
  }

  // Fetch recipient active key bundle
  const recipientBundle = await api.getUserKeyBundles(recipientUserId);
  if (!recipientBundle.devices || recipientBundle.devices.length === 0) {
    throw new Error('Recipient has no registered active devices capable of E2EE.');
  }

  const recipientDeviceList = [];

  for (const device of recipientBundle.devices) {
    // Cryptographically verify signed pre-key signature
    const isValid = await verifySignedPreKey(
      device.signedPreKeyPublic,
      device.signedPreKeySignature,
      device.signingKeyPublic
    );
    if (!isValid) {
      throw new Error(`Device ${device.deviceName} signature verification failed.`);
    }

    recipientDeviceList.push({
      deviceId: device.deviceId,
      identityPublicKey: device.identityKeyPublic,
      signedPreKeyPublic: device.signedPreKeyPublic,
      oneTimePreKeyPublic: device.oneTimePreKey?.publicKey,
      oneTimePreKeyId: device.oneTimePreKey?.keyId,
    });
  }

  // User adjustment #3: Add sender's own device using local signedPreKeyPair
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
    recipients: recipientDeviceList,
  });

  return {
    ciphertext: encrypted.ciphertext,
    e2eeHeader: encrypted.e2eeHeader,
    senderDeviceId: senderKeys.deviceId,
  };
}

/**
 * Decrypts incoming encrypted message content using IndexedDB private keys.
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
    const localKeys = await getUserKeys(currentUserId);
    if (!localKeys) {
      return '🔒 Unable to decrypt on this device';
    }

    const envelope = message.e2eeHeader.devices?.[localKeys.deviceId];
    if (!envelope) {
      return '🔒 Unable to decrypt on this device';
    }

    // Determine target private key: OTPK if present and found in local history, otherwise signed prekey
    let targetPrivateKeyJwk: string | undefined;
    if (envelope.oneTimePreKeyId != null) {
      targetPrivateKeyJwk = localKeys.oneTimePreKeys[envelope.oneTimePreKeyId];
    }

    if (!targetPrivateKeyJwk) {
      targetPrivateKeyJwk = localKeys.signedPreKeyPair.privateKeyJwk;
    }

    const privateKey = await importPrivateEcdhKey(targetPrivateKeyJwk);

    return await decryptMessage({
      ciphertext: message.content,
      e2eeHeader: message.e2eeHeader,
      recipientDeviceId: localKeys.deviceId,
      recipientPrivateKey: privateKey,
      conversationId: message.conversationId,
      senderId: message.senderId,
    });
  } catch (err) {
    console.warn('[E2EE] Decryption error for message:', message.id, err);
    return '🔒 Unable to decrypt on this device';
  }
}
