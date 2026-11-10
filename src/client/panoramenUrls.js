/**
 * Adressen der Panoramafotos (`assets/panoramen`). Eigener Baustein, der erst beim Laden einer Fotokulisse
 * nachgeladen wird (`kulissenLaden.js`): 22 Fotos mit je zwei Stufen gehören nicht ins Startbündel
 * (LADEZEIT, Bundle-Gate).
 *
 * SDR bleibt SDR, auch im AVIF-Container. Die alten HDR-Vorarbeiten und die Quell-WebP sind nicht im Glob.
 *
 * @module panoramenUrls
 */
let panoramen = null;
let stil = null;

function panoramenTabelle() {
  if (panoramen === null) {
    try {
      panoramen = import.meta.glob(['./assets/panoramen/*-sdr.avif', './assets/panoramen/*-1280.webp'], {
        eager: true, query: '?url', import: 'default',
      });
    } catch {
      panoramen = {};
    }
  }
  return panoramen;
}

/** Quellen eines Fotos, passende Stufe zuerst (kleine Displays: 1280er WebP, sonst SDR-AVIF). */
export function panoramaUrls(id) {
  const klein = globalThis.matchMedia?.('(max-width: 1280px)').matches;
  const pfad = './assets/panoramen/' + id;
  const tabelle = panoramenTabelle();
  return (klein
    ? [tabelle[pfad + '-1280.webp'], tabelle[pfad + '-sdr.avif']]
    : [tabelle[pfad + '-sdr.avif'], tabelle[pfad + '-1280.webp']]).filter(Boolean);
}

/** Panorama-Kulissen (`assets/panoramen-kulissen`, 1280x720 WebP, `config/backdrops-panorama.js`): nur die gewaehlte Datei wird geladen. */
export function stilUrls(datei) {
  if (stil === null) {
    try {
      stil = import.meta.glob('./assets/panoramen-kulissen/*.webp', { eager: true, query: '?url', import: 'default' });
    } catch {
      stil = {};
    }
  }
  return [stil['./assets/panoramen-kulissen/' + datei]].filter(Boolean);
}
