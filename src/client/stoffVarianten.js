/**
 * Varianten der Stoff-Texturen — reine Client-Optik, ohne Einfluss auf Maske, Zustands-Hash, Replay oder Server.
 *
 * Jeder Stoff hat 5, 6 oder 7 Varianten (Anzahl fest aus der Stoff-Kennung). Eine Variante ist keine neue
 * Bilddatei, sondern eine Abwandlung der vorhandenen Textur über feste Achsen:
 *  - Lage: eine der 8 Spiegelungen/Drehungen des Quadrats (die Kachel bleibt dabei nahtlos),
 *  - Versatz (dx, dy) in Texturpixeln,
 *  - Maßstab (± etwa 12 %),
 *  - Farbabweichung: Helligkeit (± 5 %) und leichte Farbtonverschiebung je Kanal.
 * Variante 0 ist immer die unveränderte Textur, damit der Stoff wiedererkennbar bleibt.
 *
 * Gewählt wird je Stoff und Zellblock: Die Karte wird in Blöcke aus `BLOCK_ZELLEN`² Weltzellen (Zelle = 8 px)
 * geteilt, die Variante steht fest durch `hash2(Blockkoordinate, Kartenseed, Stoff)`. Die Wahl hängt nur an
 * Weltkoordinate, Seed und Stoff — nie an der Zeit oder am Gelände-Zustand. Trägt ein Krater Boden ab, bleiben
 * die Varianten der übrigen Pixel unverändert (sie „wandern" nicht).
 *
 * Blockgrenzen sind weich: `tinteStoffe` verschiebt die Blockkoordinate um ein glattes Rauschen (organische
 * Grenzen statt Raster) und überblendet in einem schmalen Band zum Nachbarblock (`NAHT_BAND`).
 *
 * @module stoffVarianten
 */
import { hash2 } from './stil.js';
import { STOFFE } from '../shared/config/stoffe.js';

export const VARIANTEN_MIN = 5;
export const VARIANTEN_MAX = 7;
/** Kantenlänge einer Weltzelle in Pixeln (wie die Stoffkarte). */
export const ZELLE = 8;
/** Zellen je Blockkante: 16 Zellen = 128 px (Zweierpotenz, damit Blockindex und Rest per Bitoperation fallen). */
export const BLOCK_ZELLEN = 16;
export const BLOCK_PX = ZELLE * BLOCK_ZELLEN;
/** Breite des Überblendbandes beiderseits einer Blockgrenze in Pixeln. */
export const NAHT_BAND = 6;
/** Größte Verschiebung der Blockgrenzen durch das Rauschen in Pixeln. */
export const GRENZ_VERSATZ = 22;

/**
 * Verzerrungsfeld der Texturkoordinate in `tinteStoffe`: je Oktave [Wellenlänge in px, größte Verschiebung in Texturpixeln].
 * Gemessen (6 Seeds, Schritt 4 px): mittlere Steigung der Verschiebung etwa 0,15, Spitzen unter 0,8 (Faltung der Textur ab 1,0 tritt nicht auf). Die Kachel erscheint je Ort um andere Beträge versetzt.
 */
export const WARP = Object.freeze([[480, 110], [200, 28], [72, 6]].map(Object.freeze));
/** Anteil der Verzerrung bei Plattenstoffen (starre Raster aus Fugen und Nieten). */
export const WARP_STARR = 0.15;
/** Fleckung: größte Abweichung der Helligkeit und je Kanal (Rot, Blau) des Farbtons, als Anteil. */
export const MAKRO_HELL = 0.09;
export const MAKRO_FARBE = 0.035;

/** Zufallsquelle der Parameter: fest, nie die Wanduhr. */
const SALZ_ANZAHL = 0x5a17;
const SALZ_PARAM = 0x7e11;
const SALZ_WAHL = 0x3c69;

/** Maßstäbe in 1/256 (256 = unverändert). */
const MASSSTAEBE = Object.freeze([256, 256, 288, 224, 272, 240]);

/**
 * Zahl der Varianten eines Stoffes: 5, 6 oder 7, fest aus der Kennung.
 * @param {number} stoffId
 * @returns {number}
 */
export function variantenAnzahl(stoffId) {
  return VARIANTEN_MIN + Math.floor(hash2(stoffId, 17, SALZ_ANZAHL) * (VARIANTEN_MAX - VARIANTEN_MIN + 1));
}

/** Die 8 Lagen als Bitfeld: 1 = u spiegeln, 2 = v spiegeln, 4 = u/v tauschen. */
function lagenReihenfolge(stoffId) {
  const lagen = [0, 1, 2, 3, 4, 5, 6, 7];
  // Lage 0 (unverändert) bleibt vorn; der Rest wird nach festem Hash gemischt (Fisher-Yates).
  for (let i = lagen.length - 1; i > 1; i -= 1) {
    const j = 1 + Math.floor(hash2(stoffId, i, SALZ_PARAM) * i);
    [lagen[i], lagen[j]] = [lagen[j], lagen[i]];
  }
  return lagen;
}

let cache = null;

/**
 * Alle Variantenparameter, einmal berechnet.
 *
 * Aufbau (Stoff `s`, Variante `v`, `o = s * VARIANTEN_MAX + v`):
 *  - `ganz[o * 4 ..]`: Lage, dx, dy, Maßstab (1/256);
 *  - `farbe[o * 3 ..]`: Multiplikator je Kanal;
 *  - `anzahl[s]`: Zahl der Varianten.
 * @returns {{ganz: Int16Array, farbe: Float32Array, anzahl: Uint8Array}}
 */
export function variantenTabellen() {
  if (cache) return cache;
  const n = STOFFE.length;
  const ganz = new Int16Array(n * VARIANTEN_MAX * 4);
  const farbe = new Float32Array(n * VARIANTEN_MAX * 3).fill(1);
  const anzahl = new Uint8Array(n);
  for (let s = 0; s < n; s += 1) {
    const k = variantenAnzahl(s);
    anzahl[s] = k;
    const lagen = lagenReihenfolge(s);
    for (let v = 0; v < VARIANTEN_MAX; v += 1) {
      const o = (s * VARIANTEN_MAX + v) * 4;
      ganz[o + 3] = 256;
      if (v === 0 || v >= k) continue;
      const h = (i) => hash2(s * 16 + v, i, SALZ_PARAM);
      ganz[o] = lagen[v];
      ganz[o + 1] = Math.floor(h(1) * 512);
      ganz[o + 2] = Math.floor(h(2) * 512);
      ganz[o + 3] = MASSSTAEBE[Math.floor(h(3) * MASSSTAEBE.length)];
      const hell = 1 + (h(4) - 0.5) * 0.1; // ± 5 % Helligkeit (größere Sprünge zeigten die Blockgrenzen als Naht)
      const f = (VARIANTEN_MAX * s + v) * 3;
      farbe[f] = hell * (1 + (h(5) - 0.5) * 0.08);
      farbe[f + 1] = hell * (1 + (h(6) - 0.5) * 0.08);
      farbe[f + 2] = hell * (1 + (h(7) - 0.5) * 0.08);
    }
  }
  cache = { ganz, farbe, anzahl };
  return cache;
}

/**
 * Variante eines Stoffes in einem Zellblock.
 * @param {number} seed - Kartenseed (Szenerie-Seed des Renderers)
 * @param {number} stoffId
 * @param {number} bx - Blockspalte (Weltzelle ÷ BLOCK_ZELLEN, abgerundet)
 * @param {number} by - Blockzeile
 * @returns {number} 0 .. variantenAnzahl(stoffId) - 1
 */
export function waehleVariante(seed, stoffId, bx, by) {
  const k = variantenAnzahl(stoffId);
  const s = (Math.imul(seed | 0, 31) + Math.imul(stoffId + 1, 0x9e3779b1) + SALZ_WAHL) | 0;
  return Math.min(k - 1, Math.floor(hash2(bx, by, s) * k));
}

/**
 * Variante an einer Weltkoordinate (Pixel), ohne Grenzverschiebung und Überblendung: der Bezugspunkt,
 * an dem Tests und Werkzeuge die Wahl prüfen. `tinteStoffe` verschiebt und überblendet die Blockgrenzen
 * zusätzlich, bleibt aber von denselben Eingaben abhängig.
 */
export function varianteAnPunkt(seed, stoffId, x, y) {
  return waehleVariante(seed, stoffId, Math.floor(x / BLOCK_PX), Math.floor(y / BLOCK_PX));
}
