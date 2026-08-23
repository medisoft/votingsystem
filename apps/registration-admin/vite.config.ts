import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { applyProductionAdminCsp } from './src/csp';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'production-admin-csp',
      transformIndexHtml(html, ctx) {
        if (ctx.server) return html;
        return applyProductionAdminCsp(html);
      },
    },
  ],
  server: {
    port: 5173,
    allowedHosts: ['.local'],
    proxy: {
      '/api': {
        target: process.env.API_PROXY_TARGET ?? 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  test: { environment: 'jsdom', setupFiles: './src/test/setup.ts' },
});
