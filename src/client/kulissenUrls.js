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
 * Die native 4K-Fassung liegt unter `assets/backdrops-4k/` und trägt die Breite im
 * Dateinamen (`maritime_calm_day-2560.webp`, `…-3840.webp`). Der Ordner ist bis zur
 * Bildproduktion leer; fehlt eine Fassung, fällt der Speicher auf die Basisdatei
 * zurück (`kulissenQuelle.js`).
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

/** Native Großfassungen (1920/2560/3840), sobald produziert. */
const BACKDROP_URLS_4K = import.meta.glob('./assets/backdrops-4k/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
});

/** URL einer neuen Kulisse (Dateiname aus `BACKDROPS_NEU`), sonst `undefined`. */
export function kulissenUrlNeu(datei) {
  return BACKDROP_URLS_NEU[`./assets/backdrops-neu/${datei}`];
}

/** URL einer 4K-Fassung (Dateiname mit Breite), sonst `undefined`. */
export function kulissenUrl4k(datei) {
  return BACKDROP_URLS_4K[`./assets/backdrops-4k/${datei}`];
}

/**
 * Eine URL für einen Kulissennamen, in fester Reihenfolge: klassische Kulissen,
 * neue Biome, native Großfassung. `undefined`, wenn keine Datei existiert.
 */
export function kulissenUrl(datei) {
  return BACKDROP_URLS[`./assets/backdrops/${datei}`]
    ?? kulissenUrlNeu(datei)
    ?? kulissenUrl4k(datei);
}

export default BACKDROP_URLS;

// SDR bleibt SDR, auch im AVIF-Container. Die alten HDR-Vorarbeiten sind nicht im Glob.
const PANORAMEN = import.meta.glob(['./assets/panoramen/*-sdr.avif', './assets/panoramen/*-1280.webp'], {
  eager: true, query: '?url', import: 'default',
});

export function panoramaUrls(id) {
  const klein = globalThis.matchMedia?.('(max-width: 1280px)').matches;
  const pfad = './assets/panoramen/' + id;
  return (klein
    ? [PANORAMEN[pfad + '-1280.webp'], PANORAMEN[pfad + '-sdr.avif']]
    : [PANORAMEN[pfad + '-sdr.avif'], PANORAMEN[pfad + '-1280.webp']]).filter(Boolean);
}
