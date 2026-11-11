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
  plugins: [...(process.env.PA_WEB_BUILD === '1' ? [{
    // Web-Zugang (docs/zugang-www.md): nur dieser Build lädt Login/Start-Seite und bekommt `pa-web.json`.
    name: 'pa-web-zugang',
    apply: 'build',
    // Nur die Spielseite: die Messseite (messung.html) bleibt ohne Zugangsschicht erreichbar und lädt sie auch nicht.
    transformIndexHtml: { order: 'pre', handler: (_html, ctx) => (String(ctx?.path ?? '').endsWith('/messung.html') ? [] : [{ tag: 'script', attrs: { type: 'module', src: '/src/client/webStart.js' }, injectTo: 'body' }]) },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'pa-web.json', source: '{"gateway":true}\n' });
    },
  }] : []), {
    name: 'pa-bauinfo',
    // Entwicklungsbelege bleiben im Quelltext, nicht in jeder HTML-Auslieferung.
    transformIndexHtml: html => html.replace(/<!--[\s\S]*?-->/g, ''),
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
    // Zwei Einstiegsseiten: das Spiel und die eigenständige Messseite (src/client/messung/, nicht im Spiel-Bündel).
    rollupOptions: { input: { index: 'index.html', messung: 'messung.html' } },
    // Kleine Bilddateien bleiben URLs: Base64 würde den Start-JavaScript-Block aufblähen.
    assetsInlineLimit: 0,
    // BUILD-1: Das Modul-Preload-Polyfill (~0,5 KiB) ist für `target: es2022` unnötig —
    // jedes Ziel unterstützt `rel="modulepreload"`. Ohne Polyfill bleibt nur der
    // eigentliche Preload-Mechanismus; gemessen −528 B roh / −336 B gzip im Einstieg.
    modulePreload: { polyfill: false },
    // Auftragswarteschlange 3.4: Die Sourcemap ist ein Entwicklungs-Artefakt
    // (~2 MB im dist/) und gehört nicht in die Auslieferung.
    sourcemap: false,
  },
});
