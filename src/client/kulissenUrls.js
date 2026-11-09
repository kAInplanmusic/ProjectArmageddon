/**
 * Kulissen-URLs, von Vite aufgelöst.
 *
 * Renderer (`renderer.js`) und Kulissenmaler (`kulisseUndWasser.js`) brauchen dieselbe
 * Liste derselben Dateien. Der Glob steht deshalb hier einmal; die Schlüssel tragen wie
 * von Vite vergeben das Präfix `./assets/backdrops/`.
 *
 * Format WebP (seit 2026-11-04, BLD-1): gegenüber den früheren JPG rund ein Drittel
 * weniger Bytes bei SSIM-belegter Gleichwertigkeit, Messung in `docs/ladezeit.md`,
 * Umwandlung mit `scripts/kulissen-webp.py`.
 *
 * @module kulissenUrls
 */

export const BACKDROP_URLS = import.meta.glob('./assets/backdrops/**/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
});

/**
 * Die Kulissen der Biome 15 bis 20 (`config/backdrops-neu.js`): eigener Ordner, WebP. Eigener Glob, damit das Muster oben
 * (nur `backdrops/`) für die klassischen Kulissen unverändert bleibt.
 */
const BACKDROP_URLS_NEU = import.meta.glob('./assets/backdrops-neu/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
});

/** URL einer neuen Kulisse (Dateiname aus `BACKDROPS_NEU`), sonst `undefined`. */
export function kulissenUrlNeu(datei) {
  return BACKDROP_URLS_NEU[`./assets/backdrops-neu/${datei}`];
}

export default BACKDROP_URLS;

const PANORAMEN = import.meta.glob('./assets/panoramen/*.{avif,webp}', {
  eager: true, query: '?url', import: 'default',
});

export function panoramaUrls(id, hdr) {
  const klein = globalThis.matchMedia?.('(max-width: 1280px)').matches;
  const pfad = './assets/panoramen/' + id + (klein ? '-1280' : '');
  return [hdr && PANORAMEN[pfad + '.avif'], PANORAMEN[pfad + '.webp']].filter(Boolean);
}

/** Nur ein tatsächlich unterstützter erweiterter Zeichenpuffer bekommt PQ-Bilder. */
export function spielKontext(canvas) {
  if (globalThis.matchMedia?.('(dynamic-range: high)').matches && canvas.configureHighDynamicRange) {
    try {
      const ctx = canvas.getContext('2d', { colorType: 'float16', colorSpace: 'display-p3' });
      if (ctx?.getContextAttributes?.().colorType === 'float16') {
        canvas.configureHighDynamicRange({ mode: 'extended' });
        return { ctx, hdr: true };
      }
    } catch { /* SDR auf diesem Gerät */ }
  }
  return { ctx: canvas.getContext('2d'), hdr: false };
}
