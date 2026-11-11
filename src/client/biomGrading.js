/**
 * Biom-Grading des Geländes für die Biome 15 bis 20 — reine Client-Optik.
 *
 * Läuft nach `faerbeGelaende` über die schon gefärbten Pixel und verändert nur Farben, nie die Maske, die Stoffkarte,
 * den Zustands-Hash oder den Zufall der Engine (AGENTS.md §2). Alles hängt nur an Weltposition und Seed (`hash2`),
 * nie an der Zeit: Abtragen verschiebt nichts. Zweck: Die sechs Biome unterscheiden sich im Bild nicht nur durch
 * Stoff und Kulisse, sondern durch Farbwelt und Oberfläche:
 *
 *  - schlackeschmiede: aufgehellte, warme Schlacke mit glühenden Lavaadern (heller nach unten, zur Schmelze hin);
 *  - kristallarchipel: eisige Facetten (Dreiecke mit Kantenlicht) statt fleckiger Wand;
 *  - tempelstadt: warmer Sandstein ohne Mooskleckse, dazu Zierfriese (goldenes Zickzack zwischen Fugen);
 *  - tiefsee: kaltes Blau, biolumineszente Punkte, Dunkelwerden mit der Tiefe;
 *  - dimensionsriss: nur leicht (Violett bleibt, Kontrast etwas höher);
 *  - kristallwald („Fantasywald“): dunkles, bemoostes Holz in Grün/Blau-Grün, Rindenmaserung, violett-türkise Leuchtflecken.
 *
 * @module biomGrading
 */
import { hash2 } from './stil.js';

/** Farbe und Deckkraft der Höhlenluft (`fuelleHoehlenluft`) je Biom; ohne Eintrag gilt der Standard (fast schwarz). */
export const HOEHLEN_FUELLUNG = Object.freeze({
  schlackeschmiede: Object.freeze({ farbe: [34, 20, 18], deckkraft: 225 }),
  kristallarchipel: Object.freeze({ farbe: [22, 52, 84], deckkraft: 190 }),
  tempelstadt: Object.freeze({ farbe: [40, 28, 24], deckkraft: 215 }),
  tiefsee: Object.freeze({ farbe: [6, 26, 46], deckkraft: 215 }),
  kristallwald: Object.freeze({ farbe: [14, 22, 34], deckkraft: 220 }),
});

/** Biome mit Grading (Reihenfolge wie in der Biomliste). */
export const GRADING_BIOME = Object.freeze(['schlackeschmiede', 'kristallarchipel', 'tempelstadt', 'tiefsee', 'dimensionsriss', 'kristallwald']);

/** Weicher Wert in [0, 1] (Gitterwerte bilinear). */
function glatt(seed, x, y, s) {
  const gx = x / s; const gy = y / s;
  const ix = Math.floor(gx); const iy = Math.floor(gy);
  const fx = gx - ix; const fy = gy - iy;
  const a = hash2(seed, ix, iy); const b = hash2(seed, ix + 1, iy);
  const c = hash2(seed, ix, iy + 1); const d = hash2(seed, ix + 1, iy + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/** Grundgrading: Sättigung, Kontrast um 110, Multiplikator und Versatz je Kanal. */
const GRUND = {
  schlackeschmiede: { saet: 0.8, kontrast: 1.15, mul: [1.3, 1.05, 0.95], add: [4, 1, 0] },
  kristallarchipel: { saet: 0.9, kontrast: 1.05, mul: [0.95, 1.05, 1.1], add: [-4, 6, 14] },
  tempelstadt: { saet: 0.75, kontrast: 1.04, mul: [1.1, 0.98, 0.84], add: [30, 14, 2] },
  tiefsee: { saet: 0.85, kontrast: 1.1, mul: [0.62, 0.95, 1.22], add: [-4, 6, 16] },
  dimensionsriss: { saet: 1.1, kontrast: 1.1, mul: [1.05, 1, 1.08], add: [0, 0, 0] },
  kristallwald: { saet: 0.55, kontrast: 1.12, mul: [0.42, 0.62, 0.6], add: [-2, 3, 5] },
};

/** Dreiecks-Facetten: Gitter im gescherten Raster, jede Hälfte einer Zelle mit eigener Helligkeit, Kantenlicht an den Fugen. */
function facette(seed, x, y, groesse) {
  const u = (x + y * 0.45) / groesse;
  const v = (y - x * 0.32) / groesse;
  const iu = Math.floor(u); const iv = Math.floor(v);
  const fu = u - iu; const fv = v - iv;
  const hälfte = fu + fv > 1 ? 1 : 0;
  const hell = hash2(iu * 2 + hälfte, iv, seed) - 0.5;
  const kante = Math.min(fu, fv, Math.abs(fu + fv - 1) * 0.7, 1 - fu, 1 - fv);
  return { hell, kante: kante < 0.035 ? 1 - kante / 0.035 : 0 };
}

/**
 * Wendet das Grading des Bioms auf die gefärbten Geländepixel an.
 *
 * @param {Uint8ClampedArray} d - RGBA (schon gefärbt)
 * @param {Uint8Array} bitmap - 1 = fest
 * @param {number} breite
 * @param {number} hoehe
 * @param {string|null} biom - Sonderbiom-Kennung
 * @param {number} [seed]
 * @returns {boolean} ob ein Grading galt
 */
export function gradeBiom(d, bitmap, breite, hoehe, biom, seed = 0) {
  const g = GRUND[biom];
  if (!g) return false;
  const [mr, mg, mb] = g.mul; const [ar, ag, ab] = g.add;
  for (let y = 0; y < hoehe; y += 1) {
    const tiefe = y / hoehe;
    const band = y % 160;
    const bandNr = Math.floor(y / 160);
    for (let x = 0; x < breite; x += 1) {
      const idx = y * breite + x;
      if (!bitmap[idx]) continue;
      const o = idx * 4;
      if (d[o + 3] === 0) continue;
      let r = d[o]; let gr = d[o + 1]; let b = d[o + 2];
      const lum = 0.3 * r + 0.59 * gr + 0.11 * b;

      // Biomspezifische Vorarbeit auf den Rohfarben.
      if (biom === 'tempelstadt' && gr > r * 0.95) { gr = r * 0.95 - (gr - r * 0.95) * 0.2; b *= 0.9; } // Mooskleckse werden Sandstein

      r = lum + (r - lum) * g.saet; gr = lum + (gr - lum) * g.saet; b = lum + (b - lum) * g.saet;
      r = ((r - 110) * g.kontrast + 110) * mr + ar;
      gr = ((gr - 110) * g.kontrast + 110) * mg + ag;
      b = ((b - 110) * g.kontrast + 110) * mb + ab;

      switch (biom) {
        case 'schlackeschmiede': {
          // Lavaadern: dünne Linien dort, wo ein verzerrtes Rauschen seinen Mittelwert kreuzt; nach unten (zur Schmelze) stärker.
          const w = glatt(seed + 901, x, y, 90) * 14;
          const n = glatt(seed + 902, x + w, y - w, 42) * 0.65 + glatt(seed + 903, x, y, 19) * 0.35;
          const rr = Math.abs(n - 0.5) * 2;
          const cluster = glatt(seed + 904, x, y, 300);
          const stark = (0.35 + 0.65 * tiefe) * (cluster > 0.38 ? 1 : cluster / 0.38);
          if (rr < 0.06) {
            const t = (1 - rr / 0.06) * Math.min(1, stark * 1.4);
            const t2 = t * t;
            r += (255 - r) * t2 * 0.95; gr += (140 - gr) * t2 * 0.9; b += (40 - b) * t2 * 0.8;
          } else if (rr < 0.16) {
            const t = (1 - (rr - 0.06) / 0.1) * stark * 0.4;
            r += 90 * t; gr += 28 * t; b += 4 * t;
          }
          break;
        }
        case 'kristallarchipel': {
          const f = facette(seed + 911, x, y, 54);
          const f2 = facette(seed + 912, x + 17, y + 9, 21);
          const k = 1 + f.hell * 0.26 + f2.hell * 0.08;
          r *= k; gr *= k; b *= k;
          if (f.kante) { r += 22 * f.kante; gr += 44 * f.kante; b += 56 * f.kante; }
          break;
        }
        case 'tempelstadt': {
          if (bandNr % 3 !== 1 && hash2(bandNr, 5, seed + 921) > 0.25) {
            // Zierfries: Fuge oben und unten, dazwischen goldenes Zickzack.
            if (band < 3 || (band >= 22 && band < 25)) { r *= 0.45; gr *= 0.42; b *= 0.4; }
            else if (band >= 3 && band < 22) {
              const zz = Math.abs((x % 40) - 20) / 20 * 11;
              const dist = Math.abs((band - 12.5) - (zz - 5.5));
              if (dist < 2.2) { const t = 1 - dist / 2.2; r += (222 - r) * t * 0.9; gr += (172 - gr) * t * 0.9; b += (70 - b) * t * 0.9; }
              else { r *= 0.86; gr *= 0.84; b *= 0.82; }
            }
          }
          break;
        }
        case 'tiefsee': {
          const dunkler = 1 - 0.42 * tiefe;
          r *= dunkler; gr *= dunkler; b *= dunkler;
          const punkt = glatt(seed + 931, x, y, 11);
          if (punkt > 0.9) { const t = (punkt - 0.9) / 0.1; r += 20 * t; gr += 190 * t; b += 170 * t; }
          break;
        }
        case 'kristallwald': {
          const rinde = glatt(seed + 951, x, y, 4) ;
          const maser = glatt(seed + 952, x, y * 0.12, 5);
          const k = 0.82 + 0.3 * maser + 0.12 * rinde;
          r *= k; gr *= k; b *= k;
          const fleck = glatt(seed + 953, x, y, 16);
          if (fleck > 0.84) {
            const t = Math.min(1, (fleck - 0.84) / 0.08);
            const violett = glatt(seed + 954, x, y, 230) > 0.5;
            if (violett) { r += 150 * t; gr += 60 * t; b += 230 * t; } else { r += 30 * t; gr += 230 * t; b += 200 * t; }
          } else if (fleck > 0.76) {
            const t = (fleck - 0.76) / 0.08 * 0.25;
            r += 10 * t; gr += 70 * t; b += 80 * t;
          }
          break;
        }
        default: break;
      }
      d[o] = r < 0 ? 0 : r > 255 ? 255 : r;
      d[o + 1] = gr < 0 ? 0 : gr > 255 ? 255 : gr;
      d[o + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
    }
  }
  return true;
}
