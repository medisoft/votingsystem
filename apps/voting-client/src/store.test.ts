import { afterEach, expect, it } from 'vitest';
import { useClientStore } from './store';

afterEach(() => {
  useClientStore.getState().setActivationToken(null);
  useClientStore.getState().setCredential(null);
});

it('holds an activation token only in memory', () => {
  expect(useClientStore.getState().activationToken).toBeNull();
  useClientStore.getState().setActivationToken('opaque-token-value');
  expect(useClientStore.getState().activationToken).toBe('opaque-token-value');
  useClientStore.getState().setActivationToken(null);
  expect(useClientStore.getState().activationToken).toBeNull();
});
