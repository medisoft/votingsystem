import type { PublicMetadata } from './credential-protocol';

export const CREDENTIAL_DB_NAME = 'voting-client';
export const CREDENTIAL_STORE_NAME = 'credentials';
export const ACTIVE_CREDENTIAL_KEY = 'active';

export interface StoredCredential {
  privateKey: CryptoKey;
  publicKey: string;
  publicKeyAlgorithm: 'Ed25519';
  credentialId: string;
  publicMetadata: PublicMetadata;
  preparedMessage: string;
  signature: string;
  storedAt: string;
}

export interface CredentialSummary {
  publicKey: string;
  publicKeyAlgorithm: 'Ed25519';
  expiresAt: string;
  weight: string;
  protocol: string;
}

export interface CredentialVault {
  get(): Promise<StoredCredential | null>;
  put(credential: StoredCredential): Promise<void>;
}

/**
 * Builds a non-persistent vault for tests.
 *
 * @returns In-memory credential vault.
 */
export function createMemoryVault(): CredentialVault {
  let record: StoredCredential | null = null;
  return {
    async get() {
      return record;
    },
    async put(credential) {
      record = credential;
    },
  };
}

/**
 * IndexedDB vault that can hold a non-extractable CryptoKey.
 *
 * @returns Persistent credential vault.
 */
export function createIndexedDbVault(): CredentialVault {
  return {
    get() {
      return withStore('readonly', (store) => {
        return requestToPromise<StoredCredential | undefined>(
          store.get(ACTIVE_CREDENTIAL_KEY),
        ).then((value) => value ?? null);
      });
    },
    async put(credential) {
      await withStore('readwrite', (store) => {
        return requestToPromise(store.put(credential, ACTIVE_CREDENTIAL_KEY));
      });
    },
  };
}

function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  if (!globalThis.indexedDB) {
    return Promise.reject(new Error('IndexedDB is not available'));
  }
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(CREDENTIAL_DB_NAME, 1);
    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains(CREDENTIAL_STORE_NAME)) {
        db.createObjectStore(CREDENTIAL_STORE_NAME);
      }
    };
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction(CREDENTIAL_STORE_NAME, mode);
      const store = tx.objectStore(CREDENTIAL_STORE_NAME);
      run(store).then(resolve, reject);
      tx.oncomplete = () => db.close();
      tx.onerror = () => reject(tx.error);
    };
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

let vault: CredentialVault | null = null;

/**
 * Returns the process credential vault, creating the IndexedDB vault on first use.
 *
 * @returns Active vault.
 */
export function getCredentialVault(): CredentialVault {
  vault ??= createIndexedDbVault();
  return vault;
}

/**
 * Replaces the process vault. Used by tests.
 *
 * @param next - Vault to use, or null to restore the default.
 */
export function setCredentialVault(next: CredentialVault | null): void {
  vault = next;
}

/**
 * Fields safe to keep in UI memory. The private key stays in the vault.
 *
 * @param credential - Stored issuance record.
 * @returns Display summary.
 */
export function toCredentialSummary(
  credential: StoredCredential,
): CredentialSummary {
  return {
    publicKey: credential.publicKey,
    publicKeyAlgorithm: credential.publicKeyAlgorithm,
    expiresAt: credential.publicMetadata.expiresAt,
    weight: credential.publicMetadata.weight,
    protocol: credential.publicMetadata.protocol,
  };
}
