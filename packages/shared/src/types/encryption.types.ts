export interface JsonWebKeyEC extends JsonWebKey {
  kty: 'EC';
  crv: 'P-256';
  x: string;
  y: string;
  d?: never; // Strictly forbidden in public keys
}

export interface DeviceKeyBundle {
  deviceId: string;
  deviceName: string;
  identityKeyPublic: string; // JSON-stringified JsonWebKeyEC
  signingKeyPublic: string;  // JSON-stringified JsonWebKeyEC
  signedPreKeyPublic: string; // JSON-stringified JsonWebKeyEC
  signedPreKeySignature: string; // base64 ECDSA signature
  oneTimePreKey?: {
    keyId: number;
    publicKey: string; // JSON-stringified JsonWebKeyEC
  } | null;
}

export interface UserKeyBundleResponse {
  userId: string;
  devices: DeviceKeyBundle[];
}

export interface RegisterDeviceDto {
  deviceName: string;
  identityKeyPublic: string;     // stringified EC P-256 public JWK
  signingKeyPublic: string;      // stringified EC P-256 public JWK
  signedPreKeyPublic: string;    // stringified EC P-256 public JWK
  signedPreKeySignature: string; // base64 ECDSA signature
  oneTimePreKeys: Array<{
    keyId: number;
    publicKey: string; // stringified EC P-256 public JWK
  }>;
}

export interface ReplenishPreKeysDto {
  preKeys: Array<{
    keyId: number;
    publicKey: string;
  }>;
}

export interface E2eeDeviceEnvelope {
  wrappedKey: string;      // Base64 AES-GCM wrapped 256-bit message key
  wrapIv: string;          // Base64 12-byte IV used for wrapping
  oneTimePreKeyId?: number | null;
}

export interface E2eeHeader {
  version: number;                // 1
  ephemeralPublicKey: string;     // JSON-stringified JsonWebKeyEC (sender's ephemeral ECDH public key)
  iv: string;                     // Base64 12-byte IV for message ciphertext
  devices: Record<string, E2eeDeviceEnvelope>; // key = deviceId
}

export interface DeviceSummary {
  id: string;
  deviceName: string;
  identityKeyPublic: string;
  signingKeyPublic: string;
  signedPreKeyPublic: string;
  signedPreKeySignature: string;
  remainingPreKeys: number;
  lastActiveAt: string | Date;
  revokedAt: string | Date | null;
  createdAt: string | Date;
}
