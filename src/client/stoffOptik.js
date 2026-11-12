/**
 * Darstellung der Stoffkarte im Gelände: Färbung und Struktur je Stoff.
 *
 * Läuft als letzter Schritt von `faerbeGelaende` über denselben Pixelpuffer und verändert nur
 * Farben, nie die Maske. Zellgrenzen (8 px) werden durch zwei kleine Versatztabellen aufgebrochen,
 * damit Adern und Schichten als Bruchkanten erscheinen und nicht als Quadrate. Alles folgt Position
 * und Seed (`hash2`). Jeder Stoff hat je Karte eine von 5 bis 7 Varianten
 * (`stoffVarianten.js`); innerhalb der Karte verzerrt ein glattes Feld die Texturkoordinate und ein Fleckenfeld moduliert
 * Helligkeit und Farbton (siehe `tinteStoffe`), damit sich die 512-px-Kachel nirgends sichtbar wiederholt.
 *
 * @module stoffOptik
 */
import { hash2 } from './stil.js';
import { STOFFE } from '../shared/config/stoffe.js';
import { STOFF_TEXTUR, TEXTUR_GROESSE, stoffTextur } from './stoffTexturen.js';
import {
  VARIANTEN_MAX, WARP, WARP_STARR, MAKRO_HELL, MAKRO_FARBE, variantenTabellen, waehleVariante,
} from './stoffVarianten.js';

/** Wie stark der Stoff die vorhandene Gesteinsfarbe überdeckt (0 bis 1). */
const DECKUNG = 0.58;
/** Wie stark das Texturdetail die Stofffarbe moduliert (Stoffe) bzw. die Geländefarbe (Erde, Stoff 0). */
const TEX_STAERKE = 0.85;
const TEX_STAERKE_ERDE = 0.6;
const TEX_MASKE = TEXTUR_GROESSE - 1;
const TEX_MASKE2 = TEXTUR_GROESSE * 2 - 1;
/** Gespiegelte Texturen: Grenze (px Abstand zur Spiegelachse), ab der von der versetzten zur unverschobenen Lage gewechselt wird, und ihre Welligkeit (± px). */
export const SPIEGEL_MITTE = 128;
export const SPIEGEL_WELLE = 24;
/** Wellige Grenze als Tabelle über eine Periode (1024 px in Viererschritten): Summe zweier Sinuswellen, ganzzahlig. */
const WELLE = Int8Array.from({ length: 256 }, (_, i) => Math.round(SPIEGEL_WELLE * (0.65 * Math.sin(i / 256 * Math.PI * 2 * 3 + 0.7) + 0.35 * Math.sin(i / 256 * Math.PI * 2 * 7 + 2.1))));
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
 * Kachel nahtlos, weil Breite und Höhe gleich sind und die Maske umbricht. `spiegel`: Textur mit Kachelnaht wird gespiegelt gekachelt.
 */
const PROBE = new Float64Array(3);
function probe(tex, ganz, farbe, id, v, x, y, spiegel) {
  const o = (id * VARIANTEN_MAX + v) * 4;
  const lage = ganz[o];
  const sc = ganz[o + 3];
  let u = ((x * sc) >> 8) + ganz[o + 1];
  let w = ((y * sc) >> 8) + ganz[o + 2];
  if (lage & 4) { const t = u; u = w; w = t; }
  if (lage & 1) u = ~u;
  if (lage & 2) w = ~w;
  if (spiegel) {
    /*
     * Nicht nahtlose Textur: gespiegelt kacheln (Periode 2 × Kantenlänge), die Kachelkanten sind dann stetig. Das Spiegelbild
     * zeigte aber an jeder Spiegelachse „Schmetterlingsrisse“ (Risse und Fugen laufen symmetrisch auseinander). Darum gibt es je
     * Achse (u und v getrennt) zwei Lagen: die unverschobene und eine um eine halbe Kachel (256 px) versetzte, deren Achse genau in
     * der Mitte der anderen liegt. Nahe einer Achse (Abstand < SPIEGEL_MITTE, die Grenze wellt um ± SPIEGEL_WELLE) gilt die versetzte
     * Lage, sonst die unverschobene; pro Pixel genau EINE Probe (keine Überblendung, kein Ghosting, siehe `stoff-varianten.test.js`).
     * Jedes Pixel liegt so mindestens ~100 px von der Achse der gezeigten Lage entfernt. Die versetzten Lagen werden transponiert
     * gelesen (Achsenlage bleibt), damit Motive nicht im 256-px-Raster gleich ausgerichtet wiederkehren. Die Grenzen zwischen den
     * Lagen sind wellige Schnitte durch die Textur (wie Bruchkanten), keine Linien einer Spiegelung.
     */
    const ua = u & TEX_MASKE2; const wa = w & TEX_MASKE2;
    const du = (ua > TEX_MASKE ? TEX_MASKE2 - ua : ua); const dw = (wa > TEX_MASKE ? TEX_MASKE2 - wa : wa);
    const au = Math.min(du, TEX_MASKE - du); const aw = Math.min(dw, TEX_MASKE - dw); // Abstand zur Achse, 0 .. 255
    const verschoben = au < SPIEGEL_MITTE + WELLE[(wa >> 2) & 255];
    const verschobenW = aw < SPIEGEL_MITTE + WELLE[(ua >> 2) & 255];
    let uu = (verschoben ? u + 256 : u) & TEX_MASKE2; if (uu > TEX_MASKE) uu = TEX_MASKE2 - uu;
    let ww = (verschobenW ? w + 256 : w) & TEX_MASKE2; if (ww > TEX_MASKE) ww = TEX_MASKE2 - ww;
    const ti = ((verschoben || verschobenW ? (uu << 9) | ww : (ww << 9) | uu)) * 4;
    const f = (id * VARIANTEN_MAX + v) * 3;
    PROBE[0] = tex[ti] * farbe[f]; PROBE[1] = tex[ti + 1] * farbe[f + 1]; PROBE[2] = tex[ti + 2] * farbe[f + 2];
    return;
  }
  const ti = (((w & TEX_MASKE) << 9) | (u & TEX_MASKE)) * 4;
  const f = (id * VARIANTEN_MAX + v) * 3;
  PROBE[0] = tex[ti] * farbe[f];
  PROBE[1] = tex[ti + 1] * farbe[f + 1];
  PROBE[2] = tex[ti + 2] * farbe[f + 2];
}

/** Einzelne Texturprobe als Dreierfeld (für Tests und Werkzeuge): wie im Pixelrumpf von `tinteStoffe`, ohne Verzerrungs- und Fleckenfeld. */
export function texturProbe(tex, ganz, farbe, id, v, x, y, spiegel) {
  probe(tex, ganz, farbe, id, v, x, y, spiegel);
  return [PROBE[0], PROBE[1], PROBE[2]];
}

/** Platten im Läuferverband (64 x 32 px, jede Reihe versetzt): Fuge 1 px, Helligkeit je Platte leicht verschieden. */
function platte(seed, x, y) {
  const r = y >> 5;
  const xs = x + ((hash2(seed + 19, r, 3) * 64) | 0);
  const sp = xs >> 6;
  if ((y & 31) === 0 || (xs & 63) === 0) return 0.62;
  return 0.94 + 0.12 * hash2(seed + 23, sp, r);
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
  const texSpiegel = new Uint8Array(STOFFE.length);
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
    if (t.spiegel) texSpiegel[id] = 1;
    if (id >= ERSTER_BIOM_STOFF) texFarbe[id] = 1;
    for (let c = 0; c < 3; c += 1) texMittel[id * 3 + c] = 1 / t.mittel[c];
    if (id === 0) erdeTextur = true;
  }
  // Starre Raster (Plattenstoffe: Fugen, Nieten, Gitter) vertragen kaum Verzerrung, sie würden als Wellenraster erscheinen.
  const warpFaktor = new Float32Array(STOFFE.length).fill(1);
  for (let id = 0; id < STOFFE.length; id += 1) if (muster[id] === 3) warpFaktor[id] = WARP_STARR;
  const zeileBelegt = new Uint8Array(zeilen);
  if (erdeTextur) zeileBelegt.fill(1);
  for (let gy = 0; gy < zeilen; gy += 1) {
    if (zeileBelegt[gy]) continue;
    for (let gx = 0; gx < spalten; gx += 1) if (feld[gy * spalten + gx] !== 0) { zeileBelegt[gy] = 1; break; }
  }
  const spaltenMax = spalten - 1;
  const zeilenMax = zeilen - 1;

  /*
   * Großflächige Variation (reine Optik): Statt Blöcke mit eigener Variante zu wechseln (sichtbare Schnitte, gesprenkelte
   * Ränder) läuft die Texturkoordinate durch ein glattes Verzerrungsfeld (`WARP`, drei Oktaven, Wellenlängen 56 bis 360 px,
   * Stützstellen alle 16 px, bilinear): Die Kachel (512 px) erscheint an jeder Stelle um einen anderen Betrag verschoben und
   * leicht gedehnt, also nie als Wiederholung im Abstand von 512 px, und es gibt keine Nähte. Dazu moduliert ein niederfrequentes
   * Fleckenfeld Helligkeit (± `MAKRO_HELL`) und Farbton (± `MAKRO_FARBE`), Wellenlängen 170 und 460 px. Je Karte und Stoff wählt
   * `waehleVariante(seed, id, 0, 0)` Lage, Versatz, Maßstab und Farbe der Textur (Karten sehen verschieden aus).
   * Alles hängt nur an Weltposition und Seed, nie an der Maske: Abtragen verschiebt nichts.
   */
  const { ganz, farbe: vFarbe } = variantenTabellen();
  const kartenVariante = new Array(STOFFE.length).fill(-1);
  const GS = 16;
  const gb = Math.ceil(breite / GS) + 2;
  const gh = Math.ceil(hoehe / GS) + 2;
  const NF = 5; // Felder: du, dv, Helligkeit, Farbe 1, Farbe 2
  const feldWerte = [];
  for (let k = 0; k < NF; k += 1) feldWerte.push(new Float32Array(gb * gh));
  const W = WARP;
  for (let j = 0; j < gh; j += 1) {
    for (let i = 0; i < gb; i += 1) {
      const px = i * GS; const py = j * GS;
      const o = j * gb + i;
      for (let k = 0; k < 2; k += 1) {
        let t = 0;
        for (let q = 0; q < W.length; q += 1) t += (glatt(seed + 421 + k * 10 + q, px, py, W[q][0], W[q][0]) - 0.5) * 2 * W[q][1];
        feldWerte[k][o] = t;
      }
      feldWerte[2][o] = ((glatt(seed + 451, px, py, 460, 460) - 0.5) * 1.4 + (glatt(seed + 452, px, py, 170, 170) - 0.5) * 0.6) * MAKRO_HELL;
      feldWerte[3][o] = (glatt(seed + 453, px, py, 400, 400) - 0.5) * 2 * MAKRO_FARBE;
      feldWerte[4][o] = (glatt(seed + 454, px, py, 400, 400) - 0.5) * 2 * MAKRO_FARBE;
    }
  }
  const zeilenWerte = [];
  for (let k = 0; k < NF; k += 1) zeilenWerte.push(new Float32Array(gb));
  const fxTab = new Float32Array(breite);
  for (let x = 0; x < breite; x += 1) fxTab[x] = (x & (GS - 1)) / GS;
  const GS_SHIFT = Math.log2(GS);
  let p0 = 0; let p1 = 0; let p2 = 0;
  let mh = 1; let mc1 = 0; let mc2 = 0;

  for (let y = 0; y < hoehe; y += 1) {
    const lo = Math.min(zeilenMax, Math.max(0, (y - 4) >> 3));
    const hi = Math.min(zeilenMax, Math.max(0, (y + 4) >> 3));
    let belegt = false;
    for (let g = lo; g <= hi; g += 1) if (zeileBelegt[g]) { belegt = true; break; }
    if (!belegt) continue;
    const zeile = y * breite;
    const versatzY = wy[y];
    {
      const k0 = (y >> GS_SHIFT) * gb;
      const fy = (y & (GS - 1)) / GS;
      for (let k = 0; k < NF; k += 1) {
        const f = feldWerte[k]; const z = zeilenWerte[k];
        for (let i = 0; i < gb; i += 1) z[i] = f[k0 + i] + (f[k0 + gb + i] - f[k0 + i]) * fy;
      }
    }
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
        const fxk = fxTab[x];
        const gi = x >> GS_SHIFT;
        const z0 = zeilenWerte[0]; const z1 = zeilenWerte[1];
        const wf = warpFaktor[id];
        const du = ((z0[gi] + (z0[gi + 1] - z0[gi]) * fxk) * wf) | 0;
        const dv = ((z1[gi] + (z1[gi + 1] - z1[gi]) * fxk) * wf) | 0;
        const z2 = zeilenWerte[2]; const z3 = zeilenWerte[3]; const z4 = zeilenWerte[4];
        mh = 1 + z2[gi] + (z2[gi + 1] - z2[gi]) * fxk;
        mc1 = z3[gi] + (z3[gi + 1] - z3[gi]) * fxk;
        mc2 = z4[gi] + (z4[gi + 1] - z4[gi]) * fxk;
        let v = kartenVariante[id];
        if (v < 0) v = kartenVariante[id] = waehleVariante(seed, id, 0, 0);
        probe(tex, ganz, vFarbe, id, v, x + du, y + dv, texSpiegel[id]);
        p0 = PROBE[0] * mh * (1 + mc1); p1 = PROBE[1] * mh; p2 = PROBE[2] * mh * (1 + mc2);
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
        case 2: licht = 0.88 + 0.24 * glatt(seed + 17, x + y, x - y, 70, 70); break; // große Facetten statt Diagonalstreifen
        case 3: licht = platte(seed, x, y); break;
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
