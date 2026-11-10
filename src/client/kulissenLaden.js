import { paletteFor } from '../shared/config/backdrops.js';
import { kulissenUrl } from './kulissenUrls.js';
import { KulissenBildspeicher, waehleKulissenBreite } from './kulissenQuelle.js';

/**
 * Lädt eine Kulisse in den Renderer (`ziel`).
 *
 * Zwei Quellenwege:
 * - `foto` ist ein lokales Panorama (neue Kulissenwahl); es wird über die
 *   Kandidatenliste geladen, damit ein fehlendes Format auf das nächste
 *   zurückfällt.
 * - sonst gilt die 4K-Quellwahl aus A18: Breite nach sichtbarer Größe,
 *   DPR-Deckel und Geräteleistung.
 *
 * Ausgelagert aus `renderer.js`, damit die Klasse unter ihrem Zeilenbudget
 * bleibt; die Funktion setzt nur Felder des übergebenen Renderers.
 *
 * @param {object} ziel Renderer-Instanz
 * @param {{key:string, file:string, foto?:string, biomeId?:string, id?:string}} backdrop
 * @param {{onError?:(fehler:Error)=>void}} [optionen]
 */
export function ladeKulisse(ziel, backdrop, { onError } = {}) {
  ziel.backdropKey = backdrop.key;

  if (backdrop.foto) {
    ziel.backdrop = backdrop;
    ziel.backdropReady = false;
    ziel.kulissenCache = null;
    ziel.palette = paletteFor({ key: `${backdrop.biomeId}/${backdrop.id}` });
    // Adresstabelle der Fotos erst jetzt nachladen (`panoramenUrls.js`, nicht im Startbündel).
    import('./panoramenUrls.js').then(({ panoramaUrls }) => {
      if (ziel.backdropKey !== backdrop.key) return;
      ladeFoto(ziel, backdrop, panoramaUrls(backdrop.foto), onError);
    }, (fehler) => {
      if (ziel.backdropKey === backdrop.key) onError?.(fehler);
    });
    return;
  }

  ziel.backdrop = backdrop;
  ziel.backdropReady = false;
  // Die zusammengesetzte Fläche (Zuschnitt, Sättigung, Verlauf) gehört zur alten Kulisse.
  ziel.kulissenCache = null;
  // Die Bodenfarbe gilt sofort, nicht erst nach dem Laden des Bildes: sonst
  // zeigte der Boden kurz die vorige Farbe.
  ziel.palette = paletteFor(backdrop);
  // Quellbreite nach sichtbarer Größe, DPR-Deckel und Geräteleistung (A18).
  const sichtbareBreite = ziel.canvas.clientWidth || ziel.width;
  ziel.backdropSichtbar = sichtbareBreite;
  ziel.backdropBreite = waehleKulissenBreite({
    sichtbareBreite,
    dpr: globalThis.devicePixelRatio,
    leistung: ziel.leistung ?? {},
  }).breite;
  ziel.kulissenBilder ??= new KulissenBildspeicher({ urlFuer: kulissenUrl });
  ziel.kulissenBilder.hole(backdrop, ziel.backdropBreite, {
    onBild: (bild, datei) => {
      // Nur übernehmen, wenn inzwischen keine andere Kulisse gesetzt wurde.
      if (ziel.backdropKey !== backdrop.key) return;
      ziel.backdropImage = bild;
      ziel.backdropDatei = datei;
      ziel.backdropReady = true;
    },
    onFehler: () => {
      ziel.backdropReady = false;
      onError?.(new Error(`Kulisse nicht gefunden oder lädt nicht: ${backdrop.file}`));
    },
  });
}

/** Lädt ein Panoramafoto aus den gegebenen Quellen (Rückfall der Reihe nach, zuletzt die gemalte Kulisse). */
function ladeFoto(ziel, backdrop, quellen, onError) {
  const url = kulissenUrl(backdrop.file);
  if (url) quellen.push(url);
  if (!quellen.length) {
    ziel.backdrop = null;
    ziel.backdropReady = false;
    onError?.(new Error(`Kulisse nicht gefunden: ${backdrop.file}`));
    return;
  }
  ziel.backdrop = backdrop;
  ziel.backdropReady = false;
  ziel.kulissenCache = null;
  ziel.palette = paletteFor({ key: `${backdrop.biomeId}/${backdrop.id}` });
  const bild = new Image();
  bild.decoding = 'async';
  bild.onload = () => {
    // Nur übernehmen, wenn inzwischen keine andere Kulisse gesetzt wurde.
    if (ziel.backdropKey !== backdrop.key) return;
    ziel.backdropImage = bild;
    ziel.backdropReady = true;
  };
  bild.onerror = () => {
    if (ziel.backdropKey !== backdrop.key) return;
    if (quellen.length) { bild.src = quellen.shift(); return; }
    ziel.backdropReady = false;
    onError?.(new Error(`Kulisse lädt nicht: ${backdrop.file}`));
  };
  bild.src = quellen.shift();
}
