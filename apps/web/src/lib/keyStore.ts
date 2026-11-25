/**
 * IndexedDB Key Store for ChatterBox E2EE
 * Stores non-extractable WebCrypto CryptoKey objects in IndexedDB (v2),
 * migrating any legacy v1 plaintext JWK records automatically.
 * Scoped strictly by userId. Never clears on normal logout.
 */

export interface StoredUserKeys {
  userId: string;
  deviceId: string;
  deviceName: string;
  identityKeyPair: {
    publicKeyJwk: string;
    privateKey?: CryptoKey; // non-extractable ECDH CryptoKey
    privateKeyJwk?: string; // legacy v1 only, cleared on migration
  };
  signingKeyPair: {
    publicKeyJwk: string;
    privateKey?: CryptoKey; // non-extractable ECDSA CryptoKey
    privateKeyJwk?: string; // legacy v1 only, cleared on migration
  };
  signedPreKeyPair: {
    publicKeyJwk: string;
    privateKey?: CryptoKey; // non-extractable ECDH CryptoKey
    privateKeyJwk?: string; // legacy v1 only, cleared on migration
    signatureBase64: string;
    identityBindingSignature?: string;
    rotatedAt?: number;
  };
  oneTimePreKeys: Record<number, CryptoKey | string>; // keyId -> non-extractable CryptoKey (or legacy JWK)
  createdAt: number;
  updatedAt: number;
}

export interface PeerDevicePin {
  identityKeyPublic: string;
  signingKeyPublic: string;
  firstSeenAt: number;
}

export interface PeerKeyPinRecord {
  peerKey: string; // `${ownerUserId}:${peerUserId}`
  ownerUserId: string;
  peerUserId: string;
  devices: Record<string, PeerDevicePin>;
  updatedAt: number;
}

const DB_NAME = 'chatterbox_e2ee_v1';
const DB_VERSION = 2;
const STORE_NAME = 'user_device_keys';
const PIN_STORE_NAME = 'peer_key_pins';

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.resolve(null);
  }

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'userId' });
      }
      if (!db.objectStoreNames.contains(PIN_STORE_NAME)) {
        db.createObjectStore(PIN_STORE_NAME, { keyPath: 'peerKey' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getUserKeys(userId: string): Promise<StoredUserKeys | null> {
  const db = await openDatabase();
  if (!db) return null;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(userId);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function saveUserKeys(keys: StoredUserKeys): Promise<void> {
  const db = await openDatabase();
  if (!db) return;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put({
      ...keys,
      updatedAt: Date.now(),
    });

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function addOneTimePreKeys(
  userId: string,
  newKeys: Record<number, CryptoKey | string>
): Promise<void> {
  const existing = await getUserKeys(userId);
  if (!existing) {
    throw new Error(`Cannot add prekeys: No existing keys found for user ${userId}`);
  }

  existing.oneTimePreKeys = {
    ...existing.oneTimePreKeys,
    ...newKeys,
  };
  existing.updatedAt = Date.now();

  await saveUserKeys(existing);
}

export async function getPeerKeyPin(
  ownerUserId: string,
  peerUserId: string
): Promise<PeerKeyPinRecord | null> {
  const db = await openDatabase();
  if (!db) return null;

  const peerKey = `${ownerUserId}:${peerUserId}`;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PIN_STORE_NAME, 'readonly');
    const store = tx.objectStore(PIN_STORE_NAME);
    const request = store.get(peerKey);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function savePeerKeyPin(record: PeerKeyPinRecord): Promise<void> {
  const db = await openDatabase();
  if (!db) return;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(PIN_STORE_NAME, 'readwrite');
    const store = tx.objectStore(PIN_STORE_NAME);
    const request = store.put({
      ...record,
      updatedAt: Date.now(),
    });

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function deleteUserKeys(userId: string): Promise<void> {
  const db = await openDatabase();
  if (!db) return;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(userId);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
