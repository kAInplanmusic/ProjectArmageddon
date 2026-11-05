import { defineConfig } from 'vite';
import { ermittleBauinfo } from './scripts/release/bauinfo.mjs';

/*
 * Versionskennung (DEP-1): Version, Git-Stand und Bauzeit gehen als `__PA_BAUINFO__` in den
 * Client (Menü-Fuß, `src/client/bauinfo.js`) und als `dist/version.json` neben den Build. Der
 * Server liest diese Datei und meldet sie in `/healthz` (`src/server/bauinfo.js`) — so ist
 * nachprüfbar, welcher Build gerade ausgeliefert wird.
 */
const BAUINFO = ermittleBauinfo();

export default defineConfig({
  root: '.',
  base: './',
  define: {
    __PA_BAUINFO__: JSON.stringify(BAUINFO),
  },
  plugins: [{
    name: 'pa-bauinfo',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: `${JSON.stringify(BAUINFO, null, 2)}\n` });
    },
  }],
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
    // Auftragswarteschlange 3.4: Die Sourcemap ist ein Entwicklungs-Artefakt
    // (~2 MB im dist/) und gehört nicht in die Auslieferung.
    sourcemap: false,
  },
});
