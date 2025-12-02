import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    // We are no longer defining the API key here, 
    // as it will be provided by the user in the browser.
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    }
  },
  server: {
    port: 3000,
    host: '0.0.0.0', // Allows access from network
  },
  build: {
    outDir: 'dist'
  }
});
