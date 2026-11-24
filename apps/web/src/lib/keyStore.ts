/**
 * IndexedDB Key Store for ChatterBox E2EE
 * Scoped strictly by userId. Never clears on normal logout.
 */

export interface StoredUserKeys {
  userId: string;
  deviceId: string;
  deviceName: string;
  identityKeyPair: {
    publicKeyJwk: string;
    privateKeyJwk: string;
  };
  signingKeyPair: {
    publicKeyJwk: string;
    privateKeyJwk: string;
  };
  signedPreKeyPair: {
    publicKeyJwk: string;
    privateKeyJwk: string;
    signatureBase64: string;
  };
  oneTimePreKeys: Record<number, string>; // keyId -> privateKeyJwk
  createdAt: number;
  updatedAt: number;
}

const DB_NAME = 'chatterbox_e2ee_v1';
const DB_VERSION = 1;
const STORE_NAME = 'user_device_keys';

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
  newKeys: Record<number, string>
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
