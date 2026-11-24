import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { fileURLToPath } from 'node:url';

const sharedSrc = fileURLToPath(new URL('../shared/src/index.ts', import.meta.url));
const apiTarget = process.env.API_TARGET ?? 'http://127.0.0.1:3000';

export default defineConfig({
  plugins: [preact()],
  resolve: { alias: { '@pixel/shared': sharedSrc } },
  server: {
    port: 5173,
    // Same-origin in development: the client talks to /api via the Vite proxy,
    // so cookies stay first-party and SameSite=Strict works.
    proxy: {
      '/api': { target: apiTarget, changeOrigin: false },
      '/socket.io': { target: apiTarget, ws: true },
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets-built',
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1600, // Phaser alone is ~1.2 MB minified
  },
});
