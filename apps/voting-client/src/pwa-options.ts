/**
 * Installable PWA options for vite-plugin-pwa.
 * Assets are first-party only; the plugin must not inject third-party scripts.
 */
export const votingClientPwaOptions = {
  registerType: 'autoUpdate' as const,
  injectRegister: false as const,
  includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png'],
  manifest: {
    name: 'Sistema de votación',
    short_name: 'Votación',
    description: 'Cliente de votación anónima para propietarios.',
    theme_color: '#174d69',
    background_color: '#f3f6f8',
    display: 'standalone' as const,
    lang: 'es',
    start_url: '/',
    scope: '/',
    icons: [
      {
        src: 'icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: 'icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  },
  workbox: {
    globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
    navigateFallback: 'index.html',
    navigateFallbackDenylist: [/^\/api\//],
  },
};
