import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';
import { applyProductionClientCsp } from './src/csp';
import { votingClientPwaOptions } from './src/pwa-options';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      ...votingClientPwaOptions,
      disable: process.env.VITEST === 'true',
    }),
    {
      name: 'production-client-csp',
      transformIndexHtml(html, ctx) {
        if (ctx.server) return html;
        return applyProductionClientCsp(html);
      },
    },
  ],
  server: {
    port: 5174,
    allowedHosts: ['.local'],
    proxy: {
      '/api': {
        target: process.env.API_PROXY_TARGET ?? 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 4174,
    proxy: {
      '/api': {
        target: process.env.API_PROXY_TARGET ?? 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  test: { environment: 'jsdom', setupFiles: './src/test/setup.ts' },
});
