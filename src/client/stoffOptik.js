/**
 * Darstellung der Stoffkarte im Gelände: Färbung und Struktur je Stoff.
 *
 * Läuft als letzter Schritt von `faerbeGelaende` über denselben Pixelpuffer und verändert nur
 * Farben, nie die Maske. Zellgrenzen (8 px) werden durch zwei kleine Versatztabellen aufgebrochen,
 * damit Adern und Schichten als Bruchkanten erscheinen und nicht als Quadrate. Alles folgt Position
 * und Seed (`hash2`).
 *
 * @module stoffOptik
 */
import { hash2 } from './stil.js';
import { STOFFE } from '../shared/config/stoffe.js';

/** Wie stark der Stoff die vorhandene Gesteinsfarbe überdeckt (0 bis 1). */
const DECKUNG = 0.58;

function tabelle(laenge, seed, amp) {
  const t = new Int8Array(laenge);
  for (let i = 0; i < laenge; i += 1) {
    const a = hash2(seed, i >> 3, 1);
    const b = hash2(seed, (i >> 3) + 1, 1);
    const f = (i & 7) / 8;
    t[i] = Math.round(((a + (b - a) * f) - 0.5) * 2 * amp);
  }
  return t;
}

/**
 * Färbt die Pixel nicht-normaler Stoffe ein.
 *
 * @param {Uint8ClampedArray} d - RGBA, Deckkraft schon gesetzt
 * @param {Uint8Array} bitmap
 * @param {{feld:Uint8Array, spalten:number, zeilen:number}} karte
 */
export function tinteStoffe(d, bitmap, breite, hoehe, karte, seed = 0) {
  const wy = tabelle(hoehe, seed + 311, 4);
  const wx = tabelle(breite, seed + 312, 4);
  const { spalten, zeilen } = karte;
  // Feuerfassung 2: ausgebrannte und erstarrte Zellen (Überlagerung) färben sich nach ihrem neuen Stoff.
  const feld = karte.ueber ? karte.feld.map((v, i) => (karte.ueber[i] ? karte.ueber[i] - 1 : v)) : karte.feld;

  /*
   * Vorab, was im Pixelrumpf sonst Millionen Mal gesucht würde (gleiche Rechnung, gleiches Bild):
   *  - Versatztabellen `wx`/`wy` werden nur indiziert;
   *  - Muster als Zahl statt Zeichenkette, Farbe als drei Zahlen je Stoff;
   *  - Zellzeilen ohne jeden Stoff: Eine Pixelzeile y liest nur die Zellzeilen
   *    ((y-4)>>3 .. (y+4)>>3), weil `wx` zwischen -4 und 4 liegt. Sind die alle leer, entfällt die Zeile.
   */
  const MUSTER = { schichten: 1, facetten: 2, platten: 3, fasern: 4, poroes: 5 };
  const muster = new Uint8Array(STOFFE.length);
  const f0 = new Float64Array(STOFFE.length);
  const f1 = new Float64Array(STOFFE.length);
  const f2 = new Float64Array(STOFFE.length);
  for (let id = 0; id < STOFFE.length; id += 1) {
    const st = STOFFE[id];
    if (!st) continue;
    muster[id] = MUSTER[st.muster] ?? 0;
    if (st.farbe) { f0[id] = st.farbe[0]; f1[id] = st.farbe[1]; f2[id] = st.farbe[2]; }
  }
  const zeileBelegt = new Uint8Array(zeilen);
  for (let gy = 0; gy < zeilen; gy += 1) {
    for (let gx = 0; gx < spalten; gx += 1) if (feld[gy * spalten + gx] !== 0) { zeileBelegt[gy] = 1; break; }
  }
  const spaltenMax = spalten - 1;
  const zeilenMax = zeilen - 1;

  for (let y = 0; y < hoehe; y += 1) {
    const lo = Math.min(zeilenMax, Math.max(0, (y - 4) >> 3));
    const hi = Math.min(zeilenMax, Math.max(0, (y + 4) >> 3));
    let belegt = false;
    for (let g = lo; g <= hi; g += 1) if (zeileBelegt[g]) { belegt = true; break; }
    if (!belegt) continue;
    const zeile = y * breite;
    const versatzY = wy[y];
    for (let x = 0; x < breite; x += 1) {
      if (!bitmap[zeile + x]) continue;
      const gx0 = (x + versatzY) >> 3;
      const gx = gx0 < 0 ? 0 : gx0 > spaltenMax ? spaltenMax : gx0;
      const gy0 = (y + wx[x]) >> 3;
      const gy = gy0 < 0 ? 0 : gy0 > zeilenMax ? zeilenMax : gy0;
      const id = feld[gy * spalten + gx];
      if (id === 0) continue;
      const o = (zeile + x) * 4;
      let licht = 1;
      switch (muster[id]) {
        case 1: licht = 0.9 + 0.2 * (((y >> 2) + (x >> 7)) & 1); break;
        case 2: licht = ((x + y) % 14 < 2) ? 1.35 : (((x - y) & 15) < 3 ? 0.8 : 1); break;
        case 3: licht = ((x & 7) === 0 || (y & 7) === 0) ? 0.55 : (((x & 7) === 3 && (y & 7) === 3) ? 1.4 : 1); break;
        case 4: licht = 0.85 + 0.3 * hash2(seed, x >> 1, (y >> 5) + 3); break;
        case 5: licht = hash2(seed, x, y) < 0.08 ? 0.7 : 1.05; break;
        default: licht = 0.88 + 0.24 * hash2(seed, x, y); break;
      }
      d[o] = d[o] * (1 - DECKUNG) + Math.min(255, f0[id] * licht) * DECKUNG;
      d[o + 1] = d[o + 1] * (1 - DECKUNG) + Math.min(255, f1[id] * licht) * DECKUNG;
      d[o + 2] = d[o + 2] * (1 - DECKUNG) + Math.min(255, f2[id] * licht) * DECKUNG;
    }
  }
}
