/**
 * Kulissen-URLs, von Vite aufgelöst.
 *
 * Renderer (`renderer.js`) und Kulissenmaler (`kulisseUndWasser.js`) brauchen dieselbe
 * Liste derselben Dateien. Die Globs stehen deshalb hier einmal; die Schlüssel tragen wie
 * von Vite vergeben das Präfix `./assets/backdrops/`.
 *
 * A5/ENG-12: Jeder Glob wird erst beim ersten Zugriff ausgewertet (Funktionen mit
 * Zwischenspeicher), nicht beim Modulimport. `node --test` kennt `import.meta.glob`
 * nicht; der try/catch liefert dort eine leere Tabelle, statt die Importkette des
 * Renderers unladbar zu machen. Im Vite-Build ersetzt Vite den Aufruf statisch
 * durch die URL-Tabelle — das Verhalten im Browser ist unverändert.
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

let klassisch = null;
let neu = null;
let gross = null;

/** Klassische Kulissen (`backdrops/`, inklusive `stimmung/`). Leer ohne Vite (node --test). */
export function klassischeKulissen() {
  if (klassisch === null) {
    try {
      klassisch = import.meta.glob('./assets/backdrops/**/*.webp', {
        eager: true,
        query: '?url',
        import: 'default',
      });
    } catch {
      klassisch = {};
    }
  }
  return klassisch;
}

/**
 * Die Kulissen der Biome 15 bis 20 (`config/backdrops-neu.js`): eigener Ordner, WebP.
 * Eigener Glob, damit das Muster oben (nur `backdrops/`) für die klassischen Kulissen
 * unverändert bleibt.
 */
function kulissenNeu() {
  if (neu === null) {
    try {
      neu = import.meta.glob('./assets/backdrops-neu/*.webp', {
        eager: true,
        query: '?url',
        import: 'default',
      });
    } catch {
      neu = {};
    }
  }
  return neu;
}

/** Native Großfassungen (1920/2560/3840), sobald produziert. */
function kulissen4k() {
  if (gross === null) {
    try {
      gross = import.meta.glob('./assets/backdrops-4k/*.webp', {
        eager: true,
        query: '?url',
        import: 'default',
      });
    } catch {
      gross = {};
    }
  }
  return gross;
}

/** URL einer neuen Kulisse (Dateiname aus `BACKDROPS_NEU`), sonst `undefined`. */
export function kulissenUrlNeu(datei) {
  return kulissenNeu()[`./assets/backdrops-neu/${datei}`];
}

/** URL einer 4K-Fassung (Dateiname mit Breite), sonst `undefined`. */
export function kulissenUrl4k(datei) {
  return kulissen4k()[`./assets/backdrops-4k/${datei}`];
}

/**
 * Eine URL für einen Kulissennamen, in fester Reihenfolge: klassische Kulissen,
 * neue Biome, native Großfassung. `undefined`, wenn keine Datei existiert.
 */
export function kulissenUrl(datei) {
  return klassischeKulissen()[`./assets/backdrops/${datei}`]
    ?? kulissenUrlNeu(datei)
    ?? kulissenUrl4k(datei);
}

// Panoramafotos: Adresstabelle im nachgeladenen Baustein `panoramenUrls.js` (nicht im Startbündel).
