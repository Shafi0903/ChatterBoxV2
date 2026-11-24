/**
 * Pure WebCrypto End-to-End Encryption Primitives
 * Compatible with Node.js 20+ and Modern Browsers
 */

// Encoding Helpers
export function arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

const getSubtle = (): SubtleCrypto => {
  if (!globalThis.crypto?.subtle) {
    throw new Error('WebCrypto API (crypto.subtle) is not available in this environment');
  }
  return globalThis.crypto.subtle;
};

function getRandomValues<T extends ArrayBufferView>(array: T): T {
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error('WebCrypto API (crypto.getRandomValues) is not available in this environment');
  }
  return globalThis.crypto.getRandomValues(array) as T;
}

/**
 * Key Generation
 */

export async function generateIdentityKeyPair(): Promise<CryptoKeyPair> {
  const subtle = getSubtle();
  return subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits']
  );
}

export async function generateSigningKeyPair(): Promise<CryptoKeyPair> {
  const subtle = getSubtle();
  return subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  );
}

export async function exportJwk(key: CryptoKey): Promise<string> {
  const subtle = getSubtle();
  const jwk = await subtle.exportKey('jwk', key);
  // Ensure we sort keys or clean undefined to keep it clean
  return JSON.stringify(jwk);
}

export async function importPublicEcdhKey(jwkJson: string): Promise<CryptoKey> {
  const subtle = getSubtle();
  const jwk = JSON.parse(jwkJson);
  delete jwk.d; // Ensure no private key
  return subtle.importKey(
    'jwk',
    { ...jwk, key_ops: [] },
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    []
  );
}

export async function importPrivateEcdhKey(jwkJson: string): Promise<CryptoKey> {
  const subtle = getSubtle();
  const jwk = JSON.parse(jwkJson);
  return subtle.importKey(
    'jwk',
    { ...jwk, key_ops: ['deriveKey', 'deriveBits'] },
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits']
  );
}

export async function importPublicEcdsaKey(jwkJson: string): Promise<CryptoKey> {
  const subtle = getSubtle();
  const jwk = JSON.parse(jwkJson);
  delete jwk.d;
  return subtle.importKey(
    'jwk',
    { ...jwk, key_ops: ['verify'] },
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['verify']
  );
}

export async function importPrivateEcdsaKey(jwkJson: string): Promise<CryptoKey> {
  const subtle = getSubtle();
  const jwk = JSON.parse(jwkJson);
  return subtle.importKey(
    'jwk',
    { ...jwk, key_ops: ['sign'] },
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign']
  );
}

/**
 * Signed PreKey Generation & Verification
 */

export async function generateSignedPreKey(
  signingPrivateKey: CryptoKey
): Promise<{ preKey: CryptoKeyPair; preKeyPublicJwk: string; signatureBase64: string }> {
  const subtle = getSubtle();
  const preKey = await generateIdentityKeyPair();
  const preKeyPublicJwk = await exportJwk(preKey.publicKey);
  const data = new TextEncoder().encode(preKeyPublicJwk);

  const signature = await subtle.sign(
    { name: 'ECDSA', hash: { name: 'SHA-256' } },
    signingPrivateKey,
    data
  );

  return {
    preKey,
    preKeyPublicJwk,
    signatureBase64: arrayBufferToBase64(signature),
  };
}

export async function verifySignedPreKey(
  signedPreKeyPublicJwk: string,
  signatureBase64: string,
  signingKeyPublicJwk: string
): Promise<boolean> {
  try {
    const subtle = getSubtle();
    const signingPublicKey = await importPublicEcdsaKey(signingKeyPublicJwk);
    const signature = base64ToArrayBuffer(signatureBase64);
    const data = new TextEncoder().encode(signedPreKeyPublicJwk);

    return await subtle.verify(
      { name: 'ECDSA', hash: { name: 'SHA-256' } },
      signingPublicKey,
      signature,
      data
    );
  } catch {
    return false;
  }
}

/**
 * One-Time PreKey Generation
 */

export async function generateOneTimePreKeys(
  count: number,
  startKeyId = 1
): Promise<Array<{ keyId: number; keyPair: CryptoKeyPair; publicJwk: string }>> {
  const result = [];
  for (let i = 0; i < count; i++) {
    const keyPair = await generateIdentityKeyPair();
    const publicJwk = await exportJwk(keyPair.publicKey);
    result.push({
      keyId: startKeyId + i,
      keyPair,
      publicJwk,
    });
  }
  return result;
}

/**
 * Key Agreement & Derivation (X3DH-style ECDH + HKDF)
 */

export async function deriveSharedSecret(
  privateKey: CryptoKey,
  publicKey: CryptoKey,
  info: string = 'ChatterBox-E2EE-Key-Derivation'
): Promise<CryptoKey> {
  const subtle = getSubtle();
  // Derive 256 bits via ECDH
  const derivedBits = await subtle.deriveBits(
    { name: 'ECDH', public: publicKey },
    privateKey,
    256
  );

  // Import raw bits as HKDF key
  const hkdfKey = await subtle.importKey(
    'raw',
    derivedBits,
    'HKDF',
    false,
    ['deriveKey']
  );

  // Derive AES-GCM 256-bit key
  return subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(32), // zero-salt
      info: new TextEncoder().encode(info),
    },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Message Encryption & Decryption
 */

export interface EncryptMessageParams {
  plaintext: string;
  conversationId: string;
  senderId: string;
  senderDeviceId: string;
  recipients: Array<{
    deviceId: string;
    identityPublicKey: string;
    signedPreKeyPublic: string;
    oneTimePreKeyPublic?: string | null;
    oneTimePreKeyId?: number | null;
  }>;
}

export interface EncryptMessageResult {
  ciphertext: string; // Base64 AES-GCM ciphertext
  e2eeHeader: {
    version: 1;
    ephemeralPublicKey: string; // JSON JWK
    iv: string; // Base64 12-byte IV
    devices: Record<string, {
      wrappedKey: string;
      wrapIv: string;
      oneTimePreKeyId?: number | null;
    }>;
  };
}

export async function encryptMessage(params: EncryptMessageParams): Promise<EncryptMessageResult> {
  const subtle = getSubtle();

  // 1. Generate 256-bit random Message Key
  const messageKey = await subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true, // extractable so we can wrap it
    ['encrypt', 'decrypt']
  );
  const rawMessageKey = await subtle.exportKey('raw', messageKey);

  // 2. Encrypt plaintext with Message Key and AAD = `${conversationId}:${senderId}`
  const iv = getRandomValues(new Uint8Array(12));
  const aad = new TextEncoder().encode(`${params.conversationId}:${params.senderId}`);
  const plaintextBuffer = new TextEncoder().encode(params.plaintext);

  const ciphertextBuffer = await subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aad },
    messageKey,
    plaintextBuffer
  );

  // 3. Generate Ephemeral ECDH KeyPair for this message
  const ephemeralKeyPair = await generateIdentityKeyPair();
  const ephemeralPublicKeyJwk = await exportJwk(ephemeralKeyPair.publicKey);

  // 4. Wrap message key for each recipient device
  const devices: Record<string, { wrappedKey: string; wrapIv: string; oneTimePreKeyId?: number | null }> = {};

  for (const recipient of params.recipients) {
    // Derive key between ephemeral private key and recipient's signed prekey (or one-time prekey if available)
    const targetPreKeyJwk = recipient.oneTimePreKeyPublic || recipient.signedPreKeyPublic;
    const recipientPreKey = await importPublicEcdhKey(targetPreKeyJwk);

    const wrapKey = await deriveSharedSecret(
      ephemeralKeyPair.privateKey,
      recipientPreKey,
      `ChatterBox-WrapKey-${recipient.deviceId}`
    );

    const wrapIv = getRandomValues(new Uint8Array(12));
    const wrappedKeyBuffer = await subtle.encrypt(
      { name: 'AES-GCM', iv: wrapIv },
      wrapKey,
      rawMessageKey
    );

    devices[recipient.deviceId] = {
      wrappedKey: arrayBufferToBase64(wrappedKeyBuffer),
      wrapIv: arrayBufferToBase64(wrapIv),
      oneTimePreKeyId: recipient.oneTimePreKeyId ?? null,
    };
  }

  return {
    ciphertext: arrayBufferToBase64(ciphertextBuffer),
    e2eeHeader: {
      version: 1,
      ephemeralPublicKey: ephemeralPublicKeyJwk,
      iv: arrayBufferToBase64(iv),
      devices,
    },
  };
}

export interface DecryptMessageParams {
  ciphertext: string;
  e2eeHeader: {
    version: number;
    ephemeralPublicKey: string;
    iv: string;
    devices: Record<string, {
      wrappedKey: string;
      wrapIv: string;
      oneTimePreKeyId?: number | null;
    }>;
  };
  recipientDeviceId: string;
  recipientPrivateKey: CryptoKey; // PreKey matching the one used for encryption
  conversationId: string;
  senderId: string;
}

export async function decryptMessage(params: DecryptMessageParams): Promise<string> {
  const subtle = getSubtle();

  const deviceEnvelope = params.e2eeHeader.devices[params.recipientDeviceId];
  if (!deviceEnvelope) {
    throw new Error(`No wrapped key found in envelope for device ${params.recipientDeviceId}`);
  }

  // 1. Derive wrapKey using ephemeralPublicKey and recipientPrivateKey
  const ephemeralPublicKey = await importPublicEcdhKey(params.e2eeHeader.ephemeralPublicKey);
  const wrapKey = await deriveSharedSecret(
    params.recipientPrivateKey,
    ephemeralPublicKey,
    `ChatterBox-WrapKey-${params.recipientDeviceId}`
  );

  // 2. Unwrap Message Key
  const wrappedKeyBuffer = base64ToArrayBuffer(deviceEnvelope.wrappedKey);
  const wrapIv = new Uint8Array(base64ToArrayBuffer(deviceEnvelope.wrapIv));

  const rawMessageKey = await subtle.decrypt(
    { name: 'AES-GCM', iv: wrapIv },
    wrapKey,
    wrappedKeyBuffer
  );

  // 3. Decrypt ciphertext using Message Key
  const messageKey = await subtle.importKey(
    'raw',
    rawMessageKey,
    'AES-GCM',
    false,
    ['decrypt']
  );

  const iv = new Uint8Array(base64ToArrayBuffer(params.e2eeHeader.iv));
  const aad = new TextEncoder().encode(`${params.conversationId}:${params.senderId}`);
  const ciphertextBuffer = base64ToArrayBuffer(params.ciphertext);

  const decryptedBuffer = await subtle.decrypt(
    { name: 'AES-GCM', iv, additionalData: aad },
    messageKey,
    ciphertextBuffer
  );

  return new TextDecoder().decode(decryptedBuffer);
}

/**
 * Safety Number Computation
 * 15-digit visual fingerprint: 3 blocks of 5 digits: XXXXX XXXXX XXXXX
 */
export async function computeSafetyNumber(
  identityKeyA: string,
  identityKeyB: string
): Promise<string> {
  const subtle = getSubtle();
  // Sort canonically so both parties compute the exact same fingerprint
  const sorted = [identityKeyA, identityKeyB].sort();
  const data = new TextEncoder().encode(sorted.join(':::'));
  const digest = await subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(digest);

  // Take first 8 bytes and format as 15 digits
  let num = BigInt(0);
  for (let i = 0; i < 8; i++) {
    num = (num << BigInt(8)) | BigInt(bytes[i]);
  }
  // Modulo 10^15
  const mod = BigInt('1000000000000000');
  const fingerprintNum = (num % mod).toString().padStart(15, '0');

  return `${fingerprintNum.slice(0, 5)} ${fingerprintNum.slice(5, 10)} ${fingerprintNum.slice(10, 15)}`;
}
