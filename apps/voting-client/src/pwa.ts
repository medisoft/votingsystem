import { registerSW } from 'virtual:pwa-register';

/**
 * Registers the first-party service worker generated at build time.
 * Does nothing when the browser cannot host a service worker.
 */
export function registerVotingClientServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  registerSW({ immediate: true });
}
