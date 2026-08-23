import { create } from 'zustand';
import type { CredentialSummary } from './credential-vault';

export interface ClientStore {
  /**
   * One-time activation token kept only in memory until credential
   * activation redeems it. Never written to web storage.
   */
  activationToken: string | null;
  setActivationToken: (activationToken: string | null) => void;
  /**
   * Display fields for the stored anonymous credential. The private key
   * remains in IndexedDB.
   */
  credential: CredentialSummary | null;
  setCredential: (credential: CredentialSummary | null) => void;
}

/**
 * Client session state. The activation token is in-memory only.
 */
export const useClientStore = create<ClientStore>((set) => ({
  activationToken: null,
  setActivationToken: (activationToken) => set({ activationToken }),
  credential: null,
  setCredential: (credential) => set({ credential }),
}));
