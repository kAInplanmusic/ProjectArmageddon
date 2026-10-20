import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  base: './',
  server: {
    // PA_PORT: Ausweichport, wenn ein fremder Server 5173 belegt (siehe playwright.config.mjs).
    port: Number(process.env.PA_PORT) || 5173,
    strictPort: true,
    host: '127.0.0.1',
  },
  preview: {
    port: 4173,
    strictPort: true,
    host: '127.0.0.1',
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: true,
  },
});
