import { useEffect, useState } from 'react';
import { getCredentialVault, toCredentialSummary } from './credential-vault';
import { useClientStore } from './store';

/**
 * Loads the stored credential into UI memory once on mount.
 *
 * @returns Whether the vault read finished, and the display summary if any.
 */
export function useHydratedCredential() {
  const credential = useClientStore((state) => state.credential);
  const setCredential = useClientStore((state) => state.setCredential);
  const [ready, setReady] = useState(
    () => useClientStore.getState().credential !== null,
  );

  useEffect(() => {
    let cancelled = false;
    void getCredentialVault()
      .get()
      .then((stored) => {
        if (cancelled) return;
        if (stored) setCredential(toCredentialSummary(stored));
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [setCredential]);

  return { ready, credential };
}
