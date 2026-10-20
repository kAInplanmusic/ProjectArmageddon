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
  const { feld, spalten, zeilen } = karte;
  for (let y = 0; y < hoehe; y += 1) {
    const zeile = y * breite;
    for (let x = 0; x < breite; x += 1) {
      if (!bitmap[zeile + x]) continue;
      const gx = Math.min(spalten - 1, Math.max(0, (x + wy[y]) >> 3));
      const gy = Math.min(zeilen - 1, Math.max(0, (y + wx[x]) >> 3));
      const id = feld[gy * spalten + gx];
      if (id === 0) continue;
      const st = STOFFE[id];
      const o = (zeile + x) * 4;
      let licht = 1;
      switch (st.muster) {
        case 'schichten': licht = 0.9 + 0.2 * (((y >> 2) + (x >> 7)) & 1); break;
        case 'facetten': licht = ((x + y) % 14 < 2) ? 1.35 : (((x - y) & 15) < 3 ? 0.8 : 1); break;
        case 'platten': licht = ((x & 7) === 0 || (y & 7) === 0) ? 0.55 : (((x & 7) === 3 && (y & 7) === 3) ? 1.4 : 1); break;
        case 'fasern': licht = 0.85 + 0.3 * hash2(seed, x >> 1, (y >> 5) + 3); break;
        case 'poroes': licht = hash2(seed, x, y) < 0.08 ? 0.7 : 1.05; break;
        default: licht = 0.88 + 0.24 * hash2(seed, x, y); break;
      }
      const f = st.farbe;
      d[o] = d[o] * (1 - DECKUNG) + Math.min(255, f[0] * licht) * DECKUNG;
      d[o + 1] = d[o + 1] * (1 - DECKUNG) + Math.min(255, f[1] * licht) * DECKUNG;
      d[o + 2] = d[o + 2] * (1 - DECKUNG) + Math.min(255, f[2] * licht) * DECKUNG;
    }
  }
}
