import { create } from 'zustand';

export interface ClientStore {
  /**
   * One-time activation token kept only in memory until credential
   * activation redeems it. Never written to web storage.
   */
  activationToken: string | null;
  setActivationToken: (activationToken: string | null) => void;
}

/**
 * Client session state. The activation token is in-memory only.
 */
export const useClientStore = create<ClientStore>((set) => ({
  activationToken: null,
  setActivationToken: (activationToken) => set({ activationToken }),
}));
