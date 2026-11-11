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
 *  - tiefsee: flüssigkeitsähnliches Wasser-Gel statt blauem Fels (halbtransparent anmutender Tiefenverlauf, Strömungs-Kaustik,
 *    heller Meniskus-Rand an jeder Kante, Blasen, biolumineszente Adern, Trübung mit der Tiefe), dunkles Wasser in den Höhlen;
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
  tiefsee: Object.freeze({ farbe: [8, 40, 72], deckkraft: 222 }),
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


/** Weiches Gitterrauschen mit vorberechneten Gitterwerten und Hermite-Glättung (schnell, ohne Kanten); Rückgabe: Abtastfunktion (x, y) -> [0, 1]. */
function gitter(seed, breite, hoehe, s) {
  const nx = Math.ceil(breite / s) + 3; const ny = Math.ceil(hoehe / s) + 3;
  const g = new Float32Array(nx * ny);
  for (let iy = 0; iy < ny; iy += 1) for (let ix = 0; ix < nx; ix += 1) g[iy * nx + ix] = hash2(ix, iy, seed);
  const mx = nx - 2.001; const my = ny - 2.001;
  return (x, y) => {
    let gx = x / s; let gy = y / s;
    gx = gx < 0 ? 0 : gx > mx ? mx : gx; gy = gy < 0 ? 0 : gy > my ? my : gy;
    const ix = gx | 0; const iy = gy | 0;
    let fx = gx - ix; let fy = gy - iy;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    const i = iy * nx + ix;
    const a = g[i]; const b = g[i + 1]; const c = g[i + nx]; const e = g[i + nx + 1];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + e) * fx * fy;
  };
}

/** Abstand jedes festen Pixels zur nächsten Luft in halben Pixeln (Chamfer 2/3, gedeckelt bei 255); Luft = 0. */
function randAbstand(bitmap, breite, hoehe) {
  const dist = new Uint8Array(breite * hoehe);
  for (let i = 0; i < dist.length; i += 1) dist[i] = bitmap[i] ? 255 : 0;
  for (let y = 0; y < hoehe; y += 1) {
    for (let x = 0; x < breite; x += 1) {
      const i = y * breite + x; let v = dist[i];
      if (v === 0) continue;
      if (x === 0 || y === 0) { dist[i] = 3; continue; }
      let c = dist[i - 1] + 2; if (c < v) v = c;
      c = dist[i - breite] + 2; if (c < v) v = c;
      c = dist[i - breite - 1] + 3; if (c < v) v = c;
      if (x + 1 < breite) { c = dist[i - breite + 1] + 3; if (c < v) v = c; }
      dist[i] = v > 255 ? 255 : v;
    }
  }
  for (let y = hoehe - 1; y >= 0; y -= 1) {
    for (let x = breite - 1; x >= 0; x -= 1) {
      const i = y * breite + x; let v = dist[i];
      if (v === 0) continue;
      if (x === breite - 1 || y === hoehe - 1) { if (v > 3) dist[i] = 3; continue; }
      let c = dist[i + 1] + 2; if (c < v) v = c;
      c = dist[i + breite] + 2; if (c < v) v = c;
      c = dist[i + breite + 1] + 3; if (c < v) v = c;
      if (x > 0) { c = dist[i + breite - 1] + 3; if (c < v) v = c; }
      dist[i] = v > 255 ? 255 : v;
    }
  }
  return dist;
}

/** Wasserfarbe nach Tiefe t in [0, 1]: oben türkis-durchscheinend, unten fast schwarzblau. */
function wasserFarbe(t) {
  const a = [30, 118, 148]; const m = [12, 58, 98]; const u = [3, 16, 40];
  const w = t < 0.5 ? t / 0.5 : (t - 0.5) / 0.5; const p = t < 0.5 ? a : m; const q = t < 0.5 ? m : u;
  return [p[0] + (q[0] - p[0]) * w, p[1] + (q[1] - p[1]) * w, p[2] + (q[2] - p[2]) * w];
}

/** Felder, die langsam variieren, werden nur alle 4 Pixel in x ausgewertet (Zeitgewinn, optisch gleich). */
const SCHRITT = 4;

/**
 * Tiefsee-Gelände als Wasser-Gel: statt Fels ein tiefenabhängiger Farbverlauf mit weicher Strömungs-Kaustik,
 * Blasen, biolumineszenten Adern und einem hellen Meniskus-Rand an jeder Kante (Lesbarkeit der Kontur).
 * Rein statisch (nur Weltposition und Seed).
 */
function gradeTiefsee(d, bitmap, breite, hoehe, seed) {
  const s = Math.max(1, breite / 2560);
  const dist = randAbstand(bitmap, breite, hoehe);
  const warpX = gitter(seed + 931, breite, hoehe, 90 * s); const warpY = gitter(seed + 932, breite, hoehe, 90 * s);
  const stroem1 = gitter(seed + 933, breite, hoehe, 38 * s); const stroem2 = gitter(seed + 934, breite, hoehe, 24 * s);
  const licht = gitter(seed + 935, breite, hoehe, 170 * s);
  const ader = gitter(seed + 936, breite, hoehe, 52 * s); const haufen = gitter(seed + 937, breite, hoehe, 320 * s);
  const plankton = gitter(seed + 938, breite, hoehe, 9 * s);
  const BZ = Math.round(64 * s);
  const lauf = new Int32Array(breite);
  const bx = new Float32Array(Math.ceil(breite / BZ) + 1); const by = new Float32Array(bx.length); const br = new Float32Array(bx.length);
  let bandNr = -1;
  let wx = 0; let wy = 0; let weich = 0; let hf = 0;
  // Gewählte Variante (Reihe A/B/C verglichen): breite, sanfte Kaustik, seltene Adern, weiter Meniskus-Schein.
  const cw = 0.34; const cs = 0.3; const hs0 = 0.62; const RW = 16;
  for (let y = 0; y < hoehe; y += 1) {
    const t = y / hoehe;
    const farbe = wasserFarbe(t);
    const oben = (1 - t) * (1 - t);
    const nrY = Math.floor(y / BZ);
    if (nrY !== bandNr) {
      bandNr = nrY;
      for (let k = 0; k < bx.length; k += 1) {
        const w = hash2(k, nrY, seed + 941);
        br[k] = w < 0.4 ? (2.2 + 4.8 * hash2(k, nrY, seed + 942)) * s : 0;
        bx[k] = k * BZ + BZ * (0.2 + 0.6 * hash2(k, nrY, seed + 943));
        by[k] = nrY * BZ + BZ * (0.2 + 0.6 * hash2(k, nrY, seed + 944));
      }
    }
    for (let x = 0; x < breite; x += 1) {
      const idx = y * breite + x;
      if (!bitmap[idx]) { lauf[x] = 0; continue; }
      lauf[x] += 1;
      const o = idx * 4;
      if (d[o + 3] === 0) continue;
      if ((x & (SCHRITT - 1)) === 0 || x === 0) {
        wx = (warpX(x, y) - 0.5) * 46 * s; wy = (warpY(x, y) - 0.5) * 46 * s;
        weich = licht(x, y); hf = haufen(x, y);
      }
      const lum = (0.3 * d[o] + 0.59 * d[o + 1] + 0.11 * d[o + 2]) / 160;
      const n1 = stroem1(x + wx, y + wy); const n2 = stroem2(x - wy, y + wx);
      // Grundfarbe: Tiefenverlauf, leicht von der alten Helligkeit (Schichtung) und weichem Licht moduliert.
      const k = (0.9 + 0.16 * (lum < 1.6 ? lum : 1.6)) * (0.8 + 0.4 * weich) * (0.9 + 0.2 * n2);
      let r = farbe[0] * k; let gr = farbe[1] * k; let b = farbe[2] * k;
      // Kaustik: weiches Netz heller Linien, nach unten ausklingend.
      const c = Math.abs(n1 + n2 - 1);
      if (c < cw) { const f = (1 - c / cw); const f2 = f * f * f * (0.2 + 0.8 * oben) * cs; r += 70 * f2; gr += 175 * f2; b += 190 * f2; }
      // Biolumineszente Adern nur in Gruppen, nach unten kräftiger.
      const hs = (hf - hs0) / 0.2;
      if (hs > 0) {
        const stark = (0.25 + 0.75 * t) * (hs > 1 ? 1 : hs);
        const av = Math.abs(ader(x + wy, y - wx) - 0.5) * 2;
        if (av < 0.04) { const f = 1 - av / 0.04; const f2 = f * f * (stark * 1.5 > 1 ? 1 : stark * 1.5); r += 20 * f2; gr += 235 * f2; b += 180 * f2; } else if (av < 0.12) { const f = (1 - (av - 0.04) / 0.08) * stark * 0.3; gr += 90 * f; b += 70 * f; }
      }
      const pk = plankton(x, y); if (pk > 0.93) { const f = (pk - 0.93) / 0.07 * 0.8; gr += 190 * f; b += 150 * f; r += 20 * f; }
      // Blasen: heller Ring, aufgehellter Innenraum, Glanzpunkt.
      const kz = (x / BZ) | 0;
      for (let kk = kz - 1; kk <= kz + 1; kk += 1) {
        if (kk < 0 || kk >= bx.length || br[kk] === 0) continue;
        const rad = br[kk];
        const dy = y - by[kk]; if (dy > rad + 1.6 || dy < -rad - 1.6) continue;
        const dx = x - bx[kk];
        const q2 = dx * dx + dy * dy;
        if (q2 > (rad + 1.6) * (rad + 1.6)) continue;
        const dd = Math.sqrt(q2);
        if (dd > rad - 1.1) { const f = Math.max(0, 1 - Math.abs(dd - rad) / 1.5) * 0.9; r += 90 * f; gr += 190 * f; b += 200 * f; } else { r += 8; gr += 28; b += 36; }
        if (dx < -rad * 0.2 && dy < -rad * 0.2 && dx > -rad * 0.65 && dy > -rad * 0.65 && dd < rad * 0.7) { r += 100; gr += 120; b += 120; }
      }
      // Trübung mit der Tiefe: Richtung dunkles Blau.
      const trueb = 0.18 * t;
      r += (4 - r) * trueb; gr += (22 - gr) * trueb; b += (50 - b) * trueb;
      // Meniskus-Rand: dünne helle Linie direkt an der Kante, weicher Schein nach innen (oben stärker, innen flacher).
      const e = dist[idx] / 2 / s;
      if (e < RW) {
        const oberkante = lauf[x] < 14 * s ? 1 : 0.55;
        const linie = e < 1.8 ? 1 - e / 1.8 : 0;
        const schein = (1 - e / RW) * (1 - e / RW);
        const f = Math.min(1, linie * 0.95 + schein * 0.5) * oberkante;
        r += (175 - r) * f * 0.8 + 18 * schein; gr += (238 - gr) * f * 0.8 + 70 * schein * oberkante; b += (250 - b) * f * 0.8 + 76 * schein * oberkante;
      }
      d[o] = r < 0 ? 0 : r > 255 ? 255 : r;
      d[o + 1] = gr < 0 ? 0 : gr > 255 ? 255 : gr;
      d[o + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
    }
  }
}

/**
 * Höhlenwasser der Tiefsee: die schon gefüllte (halbtransparente) Höhlenluft bekommt einen weichen Tiefenverlauf,
 * leichtes Licht und einen Kaustik-Hauch, bleibt aber deutlich dunkler als das Wassergel-Gelände.
 * Verändert nur Farbe, nie Maske oder Deckkraft.
 */
export function veredleHoehlenwasser(d, bitmap, breite, hoehe, seed = 0) {
  const s = Math.max(1, breite / 2560);
  const licht = gitter(seed + 961, breite, hoehe, 140 * s);
  const s1 = gitter(seed + 962, breite, hoehe, 40 * s); const s2 = gitter(seed + 963, breite, hoehe, 26 * s);
  let n = 0;
  for (let y = 0; y < hoehe; y += 1) {
    const t = y / hoehe;
    for (let x = 0; x < breite; x += 1) {
      const idx = y * breite + x;
      if (bitmap[idx]) continue;
      const o = idx * 4;
      if (d[o + 3] === 0) continue;
      const l = 0.75 + 0.5 * licht(x, y);
      let r = (10 - 6 * t) * l; let g = (50 - 24 * t) * l; let b = (86 - 34 * t) * l;
      const c = Math.abs(s1(x, y) + s2(x, y) - 1);
      if (c < 0.22) { const f = 1 - c / 0.22; const f2 = f * f * f * (1 - t * 0.6) * 0.3; r += 25 * f2; g += 110 * f2; b += 130 * f2; }
      d[o] = r > 255 ? 255 : r; d[o + 1] = g > 255 ? 255 : g; d[o + 2] = b > 255 ? 255 : b;
      n += 1;
    }
  }
  return n;
}

/**
 * Seegras auf der Tiefsee-Oberkante: höhere, leicht biolumineszente Wedel mit hellem Schein, gut gegen die Kulisse lesbar.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Uint8Array} bitmap - 1 = fest; die Standorte folgen jeder nach oben offenen Kante (auch Simse und Höhlenböden)
 * @returns {number} Zahl der Wedel
 */
export function zeichneSeegras(ctx, bitmap, breite, hoehe, seed) {
  const s = Math.max(1, breite / 2560);
  const liste = [];
  const raster = Math.max(5, Math.round(6 * s));
  for (let x = 6; x < breite - 6; x += raster) {
    if (hash2(x, 3, seed + 975) > 0.2) continue;
    for (let y = 4; y < hoehe - 2; y += 1) {
      const i = y * breite + x;
      if (bitmap[i] && !bitmap[i - breite] && !bitmap[i - 3 * breite]) { liste.push({ x, y, h: 4 + 8 * hash2(x, y, seed + 976) }); break; }
    }
  }
  let n = 0;
  ctx.save();
  ctx.lineCap = 'round';
  for (const b of liste) {
    const wedel = 2 + (hash2(b.x, 7, seed + 971) > 0.5 ? 1 : 0);
    for (let i = 0; i < wedel; i += 1) {
      const h = (16 + 18 * hash2(b.x, i, seed + 972) + b.h) * s;
      const x0 = b.x + (i - wedel / 2) * 3.2 * s;
      const sw = (hash2(b.x, i + 9, seed + 973) - 0.5) * 16 * s;
      const kopf = hash2(b.x, i + 4, seed + 974) > 0.7;
      ctx.beginPath(); ctx.moveTo(x0, b.y + 1); ctx.quadraticCurveTo(x0 + sw * 1.4, b.y - h * 0.55, x0 + sw, b.y - h);
      ctx.strokeStyle = 'rgba(60, 230, 200, 0.22)'; ctx.lineWidth = 7 * s; ctx.stroke();
      ctx.strokeStyle = 'rgb(14, 120, 118)'; ctx.lineWidth = 3.6 * s; ctx.stroke();
      ctx.strokeStyle = 'rgb(96, 236, 200)'; ctx.lineWidth = 1.6 * s; ctx.stroke();
      if (kopf) { ctx.fillStyle = 'rgb(170, 255, 230)'; ctx.beginPath(); ctx.arc(x0 + sw, b.y - h, 2.4 * s, 0, Math.PI * 2); ctx.fill(); }
      n += 1;
    }
  }
  ctx.restore();
  return n;
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
  if (biom === 'tiefsee') { gradeTiefsee(d, bitmap, breite, hoehe, seed); return true; }
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
