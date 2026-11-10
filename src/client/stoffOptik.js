/**
 * Darstellung der Stoffkarte im Gelände: Färbung und Struktur je Stoff.
 *
 * Läuft als letzter Schritt von `faerbeGelaende` über denselben Pixelpuffer und verändert nur
 * Farben, nie die Maske. Zellgrenzen (8 px) werden durch zwei kleine Versatztabellen aufgebrochen,
 * damit Adern und Schichten als Bruchkanten erscheinen und nicht als Quadrate. Alles folgt Position
 * und Seed (`hash2`). Jede Textur erscheint in 5 bis 7 Varianten je Stoff (`stoffVarianten.js`), die je 128-px-Block
 * nach Seed gewählt und an den Blockgrenzen weich überblendet werden.
 *
 * @module stoffOptik
 */
import { hash2, rauschen1 } from './stil.js';
import { STOFFE } from '../shared/config/stoffe.js';
import { STOFF_TEXTUR, TEXTUR_GROESSE, stoffTextur } from './stoffTexturen.js';
import {
  VARIANTEN_MAX, BLOCK_PX, NAHT_BAND, GRENZ_VERSATZ, variantenTabellen, waehleVariante,
} from './stoffVarianten.js';

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

/**
 * Texturprobe mit Variante: liest das Texel (x, y) der Textur `tex` in der Variante `v` des Stoffes `id`
 * (Lage, Versatz, Maßstab, Farbe) und legt die drei Kanäle in `PROBE`. Spiegelung und Drehung lassen die
 * Kachel nahtlos, weil Breite und Höhe gleich sind und die Maske umbricht.
 */
const PROBE = new Float64Array(3);
function probe(tex, ganz, farbe, id, v, x, y) {
  const o = (id * VARIANTEN_MAX + v) * 4;
  const lage = ganz[o];
  const sc = ganz[o + 3];
  let u = ((x * sc) >> 8) + ganz[o + 1];
  let w = ((y * sc) >> 8) + ganz[o + 2];
  if (lage & 4) { const t = u; u = w; w = t; }
  if (lage & 1) u = ~u;
  if (lage & 2) w = ~w;
  const ti = (((w & TEX_MASKE) << 9) | (u & TEX_MASKE)) * 4;
  const f = (id * VARIANTEN_MAX + v) * 3;
  PROBE[0] = tex[ti] * farbe[f];
  PROBE[1] = tex[ti + 1] * farbe[f + 1];
  PROBE[2] = tex[ti + 2] * farbe[f + 2];
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
  /*
   * LADEZEIT: Nur Stoffe, die auf DIESER Karte vorkommen, fragen ihre Textur an. `stoffTextur`
   * merkt sich jede Anfrage ohne Treffer und lädt genau diese Dateien nach (siehe
   * `stoffTexturen.js`); eine Karte braucht eine Handvoll der rund 110 Texturen. Stoff 0 (Erde) ist
   * der Grund jeder Zelle ohne Eintrag und gilt immer als vorhanden. Für das Bild ändert die
   * Einschränkung nichts: `texPixel[id]` wird nur für Stoffe gelesen, die im Feld stehen.
   */
  const vorhanden = new Uint8Array(STOFFE.length);
  vorhanden[0] = 1;
  for (let i = 0; i < feld.length; i += 1) if (feld[i] < vorhanden.length) vorhanden[feld[i]] = 1;
  for (let id = 0; id < STOFFE.length; id += 1) {
    if (!vorhanden[id]) continue;
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

  /*
   * Varianten (reine Optik, siehe stoffVarianten.js): Blockraster aus 128-px-Blöcken mit glatt verschobenen
   * Grenzen (`gu` je Zeile, `gv` je Spalte) und weicher Überblendung zum Nachbarblock im Band `NAHT_BAND`.
   * Die Wahl je (Stoff, Block) liegt in lazy gefüllten Tabellen.
   */
  const { ganz, farbe: vFarbe } = variantenTabellen();
  const blSpalten = Math.ceil(breite / BLOCK_PX) + 5;
  const blZeilen = Math.ceil(hoehe / BLOCK_PX) + 5;
  const blockWahl = new Array(STOFFE.length).fill(null);
  const wahl = (id, bx, by) => {
    let t = blockWahl[id];
    if (!t) { t = new Uint8Array(blSpalten * blZeilen).fill(255); blockWahl[id] = t; }
    const i = (by + 2) * blSpalten + bx + 2;
    return t[i] === 255 ? (t[i] = waehleVariante(seed, id, bx, by)) : t[i];
  };
  const gu = new Int16Array(hoehe);
  const gv = new Int16Array(breite);
  for (let y = 0; y < hoehe; y += 1) gu[y] = Math.round((rauschen1(y / 40, seed + 421) - 0.5) * 2 * GRENZ_VERSATZ);
  for (let x = 0; x < breite; x += 1) gv[x] = Math.round((rauschen1(x / 40, seed + 422) - 0.5) * 2 * GRENZ_VERSATZ);
  const bandGewicht = new Float32Array(BLOCK_PX);
  const bandRichtung = new Int8Array(BLOCK_PX);
  for (let f = 0; f < BLOCK_PX; f += 1) {
    let t = -1;
    if (f < NAHT_BAND) { t = (f + 0.5) / NAHT_BAND; bandRichtung[f] = -1; }
    else if (f >= BLOCK_PX - NAHT_BAND) { t = (BLOCK_PX - f - 0.5) / NAHT_BAND; bandRichtung[f] = 1; }
    if (t >= 0) bandGewicht[f] = 0.5 * (1 - t * t * (3 - 2 * t));
  }
  const BLOCK_MASKE = BLOCK_PX - 1;
  const BLOCK_SHIFT = Math.log2(BLOCK_PX);
  let p0 = 0; let p1 = 0; let p2 = 0;

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
      if (tex) {
        // Variante: Block der (verschobenen) Weltposition, im Randband weich zum Nachbarblock überblendet.
        const qx = x + gu[y];
        const qy = y + gv[x];
        const bx = qx >> BLOCK_SHIFT;
        const by = qy >> BLOCK_SHIFT;
        const ax = qx & BLOCK_MASKE;
        const ay = qy & BLOCK_MASKE;
        const wxn = bandGewicht[ax];
        const wyn = bandGewicht[ay];
        probe(tex, ganz, vFarbe, id, wahl(id, bx, by), x, y);
        if (wxn === 0 && wyn === 0) {
          p0 = PROBE[0]; p1 = PROBE[1]; p2 = PROBE[2];
        } else {
          const wa = (1 - wxn) * (1 - wyn);
          p0 = PROBE[0] * wa; p1 = PROBE[1] * wa; p2 = PROBE[2] * wa;
          const nx = bx + bandRichtung[ax];
          const ny = by + bandRichtung[ay];
          if (wxn > 0) {
            const wb = wxn * (1 - wyn);
            probe(tex, ganz, vFarbe, id, wahl(id, nx, by), x, y);
            p0 += PROBE[0] * wb; p1 += PROBE[1] * wb; p2 += PROBE[2] * wb;
          }
          if (wyn > 0) {
            const wc = (1 - wxn) * wyn;
            probe(tex, ganz, vFarbe, id, wahl(id, bx, ny), x, y);
            p0 += PROBE[0] * wc; p1 += PROBE[1] * wc; p2 += PROBE[2] * wc;
            if (wxn > 0) {
              const wd = wxn * wyn;
              probe(tex, ganz, vFarbe, id, wahl(id, nx, ny), x, y);
              p0 += PROBE[0] * wd; p1 += PROBE[1] * wd; p2 += PROBE[2] * wd;
            }
          }
        }
      }
      if (id === 0) {
        // Erde: Grundton des Geländes bleibt, nur das Texturdetail moduliert die Helligkeit.
        if (!tex) continue;
        d[o] *= 1 + (p0 * texMittel[0] - 1) * TEX_STAERKE_ERDE;
        d[o + 1] *= 1 + (p1 * texMittel[1] - 1) * TEX_STAERKE_ERDE;
        d[o + 2] *= 1 + (p2 * texMittel[2] - 1) * TEX_STAERKE_ERDE;
        continue;
      }
      let licht = 1;
      switch (muster[id]) {
        case 1: licht = 0.93 + 0.14 * glatt(seed + 5, x, y, 260, 24); break; // weiche Schichtbänder statt 4-px-Streifen
        case 2: licht = ((x + y) % 14 < 2) ? 1.14 : (((x - y) & 15) < 3 ? 0.9 : 1); break;
        case 3: licht = ((x & 7) === 0 || (y & 7) === 0) ? 0.55 : (((x & 7) === 3 && (y & 7) === 3) ? 1.4 : 1); break;
        case 4: licht = 0.88 + 0.24 * glatt(seed + 7, x, y, 3, 36); break;
        case 5: licht = glatt(seed + 11, x, y, 5, 5) < 0.3 ? 0.82 : 1.04; break;
        default: licht = 0.92 + 0.16 * glatt(seed + 13, x, y, 4, 4); break;
      }
      let m0 = 1; let m1 = 1; let m2 = 1;
      if (tex) {
        const k = id * 3;
        m0 = 1 + (p0 * texMittel[k] - 1) * TEX_STAERKE;
        m1 = 1 + (p1 * texMittel[k + 1] - 1) * TEX_STAERKE;
        m2 = 1 + (p2 * texMittel[k + 2] - 1) * TEX_STAERKE;
      }
      if (texFarbe[id]) {
        // Biom-Material mit Textur: deren Farbe trägt das Bild, Stofffarbe und Muster färben nur leicht nach.
        const l = 0.9 + 0.1 * licht;
        d[o] = d[o] * (1 - DECKUNG_TEX) + Math.min(255, (p0 * TEX_FARBE + f0[id] * (1 - TEX_FARBE)) * l) * DECKUNG_TEX;
        d[o + 1] = d[o + 1] * (1 - DECKUNG_TEX) + Math.min(255, (p1 * TEX_FARBE + f1[id] * (1 - TEX_FARBE)) * l) * DECKUNG_TEX;
        d[o + 2] = d[o + 2] * (1 - DECKUNG_TEX) + Math.min(255, (p2 * TEX_FARBE + f2[id] * (1 - TEX_FARBE)) * l) * DECKUNG_TEX;
        continue;
      }
      d[o] = d[o] * (1 - DECKUNG) + Math.min(255, f0[id] * licht * m0) * DECKUNG;
      d[o + 1] = d[o + 1] * (1 - DECKUNG) + Math.min(255, f1[id] * licht * m1) * DECKUNG;
      d[o + 2] = d[o + 2] * (1 - DECKUNG) + Math.min(255, f2[id] * licht * m2) * DECKUNG;
    }
  }
}
