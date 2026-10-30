/**
 * Kulissen-URLs, von Vite aufgelöst.
 *
 * Renderer (`renderer.js`) und Kulissenmaler (`kulisseUndWasser.js`) brauchen dieselbe
 * Liste derselben Dateien. Der Glob steht deshalb hier einmal; die Schlüssel tragen wie
 * von Vite vergeben das Präfix `./assets/backdrops/`.
 *
 * @module kulissenUrls
 */

export const BACKDROP_URLS = import.meta.glob('./assets/backdrops/**/*.jpg', {
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
