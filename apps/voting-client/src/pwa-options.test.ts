import { expect, it } from 'vitest';
import { votingClientPwaOptions } from './pwa-options';

it('configures a first-party installable PWA manifest', () => {
  expect(votingClientPwaOptions.injectRegister).toBe(false);
  expect(votingClientPwaOptions.manifest.display).toBe('standalone');
  expect(votingClientPwaOptions.manifest.lang).toBe('es');
  expect(votingClientPwaOptions.manifest.start_url).toBe('/');
  expect(votingClientPwaOptions.workbox.navigateFallbackDenylist).toEqual([
    /^\/api\//,
  ]);
  expect(votingClientPwaOptions.manifest.icons).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ src: 'icon-192.png', sizes: '192x192' }),
      expect.objectContaining({ src: 'icon-512.png', sizes: '512x512' }),
    ]),
  );
});
