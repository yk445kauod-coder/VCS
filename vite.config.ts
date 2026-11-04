import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// The dashboard is served by Duty itself from `web-dist`, and during `npm run dev`
// it proxies the API to the Node server so you get HMR without CORS games.
export default defineConfig({
  root: path.resolve(__dirname, 'web'),
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'web/src') },
  },
  server: {
    port: 5273,
    host: '0.0.0.0',
    proxy: {
      '/api': 'http://localhost:8787',
      '/webhooks': 'http://localhost:8787',
      '/widget': 'http://localhost:8787',
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'web-dist'),
    emptyOutDir: true,
    sourcemap: false,
  },
});
