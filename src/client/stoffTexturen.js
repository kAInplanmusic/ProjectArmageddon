/**
 * Material-Texturen der Stoffe — reine Client-Optik, ohne Einfluss auf Maske, Hash oder Netz.
 *
 * Die nahtlosen Vorlagen (1024 px, `assets/material-texturen/`) liegen hier verkleinert als
 * 512-px-JPEG unter `assets/stoff-texturen/<name>.jpg`. `stoffOptik.tinteStoffe` multipliziert sie
 * beim Färben des Geländes auf die Stofffarbe: Pro Textur zählt nur das Verhältnis Pixel zu
 * Mittelwert (Detail), nicht ihre Grundfarbe — die Stofffarbe bleibt maßgeblich.
 *
 * Ohne geladene Texturen (Node, Tests, erster Frame) bleibt das Bild wie vorher.
 *
 * @module stoffTexturen
 */

/** Kantenlänge der Texturen in Pixeln (Zweierpotenz: Wiederholung per Maske). */
export const TEXTUR_GROESSE = 512;

/**
 * Stoff-Schlüssel (`config/stoffe.js`) → Textur. Stoffe ohne Eintrag behalten ihr Muster.
 * erde: Grundton des Geländes (Stoff 0), die Textur modelliert nur die Helligkeit.
 */
export const STOFF_TEXTUR = Object.freeze({
  erde: 'erde',
  sand: 'kies',
  schnee: 'schnee',
  eis: 'schnee',
  pilz: 'moos',
  holz: 'hecke',
  fels: 'fels',
  grundgestein: 'fels',
  basalt: 'kohle',
  obsidian: 'kohle',
  asche: 'kohle',
  regolith: 'kies',
  beton: 'kies',
});

/** Namen der Dateien (ohne Endung), die ausgeliefert werden. */
export const TEXTUR_NAMEN = Object.freeze([...new Set(Object.values(STOFF_TEXTUR))]);

const geladen = new Map();

/**
 * Meldet eine Textur an.
 * @param {string} name
 * @param {Uint8ClampedArray} rgba - TEXTUR_GROESSE² Pixel
 */
export function registriereStoffTextur(name, rgba) {
  const n = TEXTUR_GROESSE * TEXTUR_GROESSE;
  if (!rgba || rgba.length !== n * 4) return false;
  let r = 0; let g = 0; let b = 0;
  for (let i = 0; i < rgba.length; i += 4) { r += rgba[i]; g += rgba[i + 1]; b += rgba[i + 2]; }
  const mittel = [Math.max(1, r / n), Math.max(1, g / n), Math.max(1, b / n)];
  geladen.set(name, { rgba, mittel });
  return true;
}

/** Verwirft alle Texturen (Tests). */
export function leereStoffTexturen() { geladen.clear(); }

/** @returns {{rgba: Uint8ClampedArray, mittel: number[]}|null} */
export function stoffTextur(name) { return geladen.get(name) ?? null; }

/**
 * Lädt die Texturen im Browser (Bild → Canvas → Pixel). Fehler einzelner Dateien werden
 * verschluckt: Dann fehlt nur diese Textur.
 * @param {Record<string,string>} urls - Name → URL
 * @returns {Promise<number>} Zahl der geladenen Texturen
 */
export async function ladeStoffTexturen(urls) {
  let anzahl = 0;
  const leinwand = globalThis.document?.createElement?.('canvas');
  const ctx = leinwand?.getContext?.('2d', { willReadFrequently: true });
  if (!ctx) return 0;
  leinwand.width = TEXTUR_GROESSE;
  leinwand.height = TEXTUR_GROESSE;
  for (const [name, url] of Object.entries(urls)) {
    try {
      const bild = new globalThis.Image();
      bild.src = url;
      await bild.decode();
      ctx.drawImage(bild, 0, 0, TEXTUR_GROESSE, TEXTUR_GROESSE);
      if (registriereStoffTextur(name, ctx.getImageData(0, 0, TEXTUR_GROESSE, TEXTUR_GROESSE).data)) anzahl += 1;
    } catch { /* Textur fehlt: Stoff behält sein Muster. */ }
  }
  return anzahl;
}
