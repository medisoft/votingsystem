import { expect, it } from 'vitest';
import { useClientStore } from './store';

it('exposes a Zustand store for later feature slices', () => {
  expect(useClientStore.getState()).toEqual({});
});
