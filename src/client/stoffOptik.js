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
import { STOFF_TEXTUR, TEXTUR_GROESSE, stoffTextur } from './stoffTexturen.js';

/** Wie stark der Stoff die vorhandene Gesteinsfarbe überdeckt (0 bis 1). */
const DECKUNG = 0.58;
/** Wie stark das Texturdetail die Stofffarbe moduliert (Stoffe) bzw. die Geländefarbe (Erde, Stoff 0). */
const TEX_STAERKE = 0.85;
const TEX_STAERKE_ERDE = 0.6;
const TEX_MASKE = TEXTUR_GROESSE - 1;
/** Biom-Materialien (ab dieser Kennung) mit eigener Textur zeigen deren Farbe; die Basisstoffe bleiben wie früher. */
const ERSTER_BIOM_STOFF = 18;
/** Wie stark die Textur eines Biom-Materials die Farbe bestimmt (0 = nur Stofffarbe, 1 = nur Textur). */
const TEX_FARBE = 0.8;
/** Deckkraft eines Biom-Materials mit Textur (die Gesteinsfarbe darunter scheint kaum durch). */
const DECKUNG_TEX = 0.94;

/** Weicher Wert in [0, 1]: Gitterwerte (Zellgröße sx × sy) bilinear verbunden — kein Pixelrauschen, keine Streifen. */
function glatt(seed, x, y, sx, sy) {
  const gx = x / sx;
  const gy = y / sy;
  const ix = Math.floor(gx);
  const iy = Math.floor(gy);
  const fx = gx - ix;
  const fy = gy - iy;
  const a = hash2(seed, ix, iy);
  const b = hash2(seed, ix + 1, iy);
  const c = hash2(seed, ix, iy + 1);
  const d = hash2(seed, ix + 1, iy + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

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
  // Texturen je Stoff (nur wenn geladen): Pixelfeld und 1/Mittelwert je Kanal.
  const texPixel = new Array(STOFFE.length).fill(null);
  const texMittel = new Float64Array(STOFFE.length * 3);
  const texFarbe = new Uint8Array(STOFFE.length);
  let erdeTextur = false;
  for (let id = 0; id < STOFFE.length; id += 1) {
    const t = stoffTextur(STOFF_TEXTUR[STOFFE[id]?.key]);
    if (!t) continue;
    texPixel[id] = t.rgba;
    if (id >= ERSTER_BIOM_STOFF) texFarbe[id] = 1;
    for (let c = 0; c < 3; c += 1) texMittel[id * 3 + c] = 1 / t.mittel[c];
    if (id === 0) erdeTextur = true;
  }
  const zeileBelegt = new Uint8Array(zeilen);
  if (erdeTextur) zeileBelegt.fill(1);
  for (let gy = 0; gy < zeilen; gy += 1) {
    if (zeileBelegt[gy]) continue;
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
      const o = (zeile + x) * 4;
      const tex = texPixel[id];
      if (id === 0) {
        // Erde: Grundton des Geländes bleibt, nur das Texturdetail moduliert die Helligkeit.
        if (!tex) continue;
        const ti = (((y & TEX_MASKE) << 9) | (x & TEX_MASKE)) * 4;
        d[o] *= 1 + (tex[ti] * texMittel[0] - 1) * TEX_STAERKE_ERDE;
        d[o + 1] *= 1 + (tex[ti + 1] * texMittel[1] - 1) * TEX_STAERKE_ERDE;
        d[o + 2] *= 1 + (tex[ti + 2] * texMittel[2] - 1) * TEX_STAERKE_ERDE;
        continue;
      }
      let licht = 1;
      switch (muster[id]) {
        case 1: licht = 0.9 + 0.2 * (((y >> 2) + (x >> 7)) & 1); break;
        case 2: licht = ((x + y) % 14 < 2) ? 1.35 : (((x - y) & 15) < 3 ? 0.8 : 1); break;
        case 3: licht = ((x & 7) === 0 || (y & 7) === 0) ? 0.55 : (((x & 7) === 3 && (y & 7) === 3) ? 1.4 : 1); break;
        case 4: licht = 0.88 + 0.24 * glatt(seed + 7, x, y, 3, 36); break;
        case 5: licht = glatt(seed + 11, x, y, 5, 5) < 0.3 ? 0.82 : 1.04; break;
        default: licht = 0.92 + 0.16 * glatt(seed + 13, x, y, 4, 4); break;
      }
      let m0 = 1; let m1 = 1; let m2 = 1;
      if (tex) {
        const ti = (((y & TEX_MASKE) << 9) | (x & TEX_MASKE)) * 4;
        const k = id * 3;
        m0 = 1 + (tex[ti] * texMittel[k] - 1) * TEX_STAERKE;
        m1 = 1 + (tex[ti + 1] * texMittel[k + 1] - 1) * TEX_STAERKE;
        m2 = 1 + (tex[ti + 2] * texMittel[k + 2] - 1) * TEX_STAERKE;
      }
      if (texFarbe[id]) {
        // Biom-Material mit Textur: deren Farbe trägt das Bild, Stofffarbe und Muster färben nur leicht nach.
        const ti = (((y & TEX_MASKE) << 9) | (x & TEX_MASKE)) * 4;
        const l = 0.9 + 0.1 * licht;
        d[o] = d[o] * (1 - DECKUNG_TEX) + Math.min(255, (tex[ti] * TEX_FARBE + f0[id] * (1 - TEX_FARBE)) * l) * DECKUNG_TEX;
        d[o + 1] = d[o + 1] * (1 - DECKUNG_TEX) + Math.min(255, (tex[ti + 1] * TEX_FARBE + f1[id] * (1 - TEX_FARBE)) * l) * DECKUNG_TEX;
        d[o + 2] = d[o + 2] * (1 - DECKUNG_TEX) + Math.min(255, (tex[ti + 2] * TEX_FARBE + f2[id] * (1 - TEX_FARBE)) * l) * DECKUNG_TEX;
        continue;
      }
      d[o] = d[o] * (1 - DECKUNG) + Math.min(255, f0[id] * licht * m0) * DECKUNG;
      d[o + 1] = d[o + 1] * (1 - DECKUNG) + Math.min(255, f1[id] * licht * m1) * DECKUNG;
      d[o + 2] = d[o + 2] * (1 - DECKUNG) + Math.min(255, f2[id] * licht * m2) * DECKUNG;
    }
  }
}
