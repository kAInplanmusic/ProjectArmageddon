/**
 * Comic-Optik des Geländes: Bruchstein, Moos-Kante, Kontur, Kraterränder.
 *
 * Die Funktionen laufen NACH dem Backen der Geländeebene (`terrainBaker.js`)
 * und verändern nur Farben — nie die Maske. Kollision und Sichtbarkeit bleiben
 * damit ein und dieselbe Wahrheit; der Pixelvergleich CPU/GPU im Baker bleibt
 * unberührt.
 *
 * Alles ist deterministisch: Stein-, Moos- und Rissmuster entstehen aus
 * Position und Seed (`hash2`), nie aus Zufall. Die Ebene wird gecacht und nur
 * bei einem Krater angefasst (`zeichneKraterRand`).
 *
 * @module gelaendeStil
 */
import {
  PAL, hash2, rauschen1, mischeRgb, hexRgb, gruenAnteil, css,
} from './stil.js';

/** Größe der großen Brocken (Kartenpixel, bei 2560×1440); die Zellen werden gewichtet und verzerrt. */
const GROSS_B = 124;
const GROSS_H = 92;
/** Die Zellabstände werden senkrecht gestreckt: Steine liegen breiter als hoch. */
const YSTRECK = 1.22;
const GROSS_HS = GROSS_H * YSTRECK;
const FUGE = [8, 9, 11];
const KONTUR = hexRgb(PAL.kontur);
const MOOS_LIMETTE = hexRgb(PAL.limette);
/** Kleine Palette der Steintöne: Blaugrau, Braungrau, Olivgrau, Schiefer. */
// Dunkler als zuerst (Entwurf: dunkles Olivbraun/Blaugrau): Faktor 0,78 auf die Grundtöne.
const TOENE = [[56, 68, 88], [92, 76, 60], [74, 82, 52], [84, 80, 74], [64, 72, 84]].map(c => c.map(v => Math.round(v * 0.78)));
const MOOS_STEIN = [52, 104, 30];
/** Anteil der Bodenfarbe (Oberfläche/Tiefe) an den Steintönen: jede Karte bekommt ihr eigenes Gestein. */
const STEIN_TON = 0.34;

/**
 * Welcher Saum gehört auf diesen Boden? Gras, Schnee, Sand oder nackter Fels.
 *
 * Aus der Oberflächenfarbe der Kulisse abgeleitet (reine Darstellung, keine Regel):
 * Auf einer Schneekarte liegt eine Schneehaube auf dem Fels, auf Sand eine Düne, auf
 * Basalt nur ein Staubsaum — nicht überall neongrünes Moos.
 *
 * @param {number[]} oberflaeche - RGB der Oberfläche
 * @returns {'gras'|'schnee'|'sand'|'fels'|'asche'}
 */
export function bodenArt(oberflaeche) {
  const [r, g, b] = oberflaeche;
  const hell = 0.299 * r + 0.587 * g + 0.114 * b;
  if (hell > 185 && b >= r - 6) return 'schnee';
  if (hell > 150 && r > b + 36 && r >= g - 6) return 'sand';
  if (g - Math.max(r, b) > 6) return 'gras';
  return hell < 100 ? 'asche' : 'fels';
}

/** Farben und Form des Saums je Bodenart (Dicke in Pixeln bei 2560×1440). */
function saumFuer(art, palette) {
  const o = palette.surface;
  const heller = (c, t) => mischeRgb(c, [255, 250, 240], t);
  switch (art) {
    case 'schnee':
      return { hell: [248, 251, 255], mittel: [218, 232, 246], tief: [172, 194, 224], basis: 10, amp: 8, tropf: 0.04, kruste: 0.5, bueschel: null };
    case 'sand':
      return { hell: heller(o, 0.35), mittel: mischeRgb(o, [236, 196, 120], 0.35), tief: mischeRgb(o, palette.deep, 0.35), basis: 6, amp: 6, tropf: 0.02, kruste: 0.7, bueschel: [[132, 118, 58], [196, 176, 96]] };
    case 'fels':
    case 'asche': {
      const staub = mischeRgb(o, art === 'asche' ? [120, 116, 112] : [200, 196, 184], 0.32);
      return { hell: staub, mittel: mischeRgb(staub, palette.deep, 0.4), tief: mischeRgb(staub, palette.deep, 0.7), basis: 4, amp: 4, tropf: 0.03, kruste: 0.8, bueschel: art === 'fels' ? [[78, 92, 62], [120, 136, 88]] : null };
    }
    default: {
      const gm = gruenAnteil(o);
      const tint = c => mischeRgb(o, c, gm);
      return {
        hell: tint([168, 255, 52]), mittel: tint(mischeRgb(MOOS_LIMETTE, [40, 130, 10], 0.3)), tief: tint([34, 96, 16]),
        basis: 9, amp: 9, tropf: 0.1, kruste: 0.5, bueschel: [mischeRgb(o, [110, 230, 24], gm), mischeRgb(o, [176, 255, 70], gm)],
      };
    }
  }
}

function glatt(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * Baut die Steinstruktur: drei Ebenen ineinander.
 *
 * Große Brocken sind gewichtete Voronoi-Zellen (Power-Diagramm) auf einem
 * gestaffelten, stark gestreuten Raster. Jeder Brocken bleibt entweder ganz
 * oder zerfällt in 2 bis 4 mittlere Steine, von denen manche nochmals in 2 bis
 * 3 kleine Füllsteine brechen. So entstehen wenige große, mehrere mittlere und
 * viele kleine Steine in einer Wand — kein gleichmäßiges Pflaster.
 */
function baueSteine(breite, hoehe, seed, palette) {
  const nx = Math.ceil(breite / GROSS_B) + 5;
  const ny = Math.ceil(hoehe / GROSS_H) + 5;
  const n = nx * ny;
  const s = {
    nx, ny,
    p1x: new Float32Array(n), p1y: new Float32Array(n), w1: new Float32Array(n),
    n2: new Uint8Array(n),
    p2x: new Float32Array(n * 4), p2y: new Float32Array(n * 4),
    n3: new Uint8Array(n * 4),
    p3x: new Float32Array(n * 12), p3y: new Float32Array(n * 12),
    lcx: new Float32Array(n * 12), lcy: new Float32Array(n * 12), lsz: new Float32Array(n * 12),
    lr: new Float32Array(n * 12), lg: new Float32Array(n * 12), lb: new Float32Array(n * 12),
    lflag: new Uint8Array(n * 12), lang: new Float32Array(n * 12),
    inv2: new Float32Array(n * 16), inv3: new Float32Array(n * 36),
  };
  const tint = mischeRgb(palette.surface, palette.deep, 0.5);
  for (let j = 0; j < ny; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      const gi = i - 2;
      const gj = j - 2;
      const k = j * nx + i;
      const h = a => hash2(gi, gj, seed + a);
      const x1 = (gi + 0.3 * (gj & 1) + 0.05 + 0.9 * h(11)) * GROSS_B;
      const y1 = (gj + 0.05 + 0.9 * h(23)) * GROSS_HS;
      s.p1x[k] = x1;
      s.p1y[k] = y1;
      s.w1[k] = (h(31) - 0.45) * 0.6 * GROSS_B * GROSS_B;
      const r = h(37);
      const n2 = r < 0.26 ? 1 : r < 0.54 ? 2 : r < 0.82 ? 3 : 4;
      s.n2[k] = n2;
      const ton = Math.floor(h(41) * TOENE.length) % TOENE.length;
      for (let j2 = 0; j2 < n2; j2 += 1) {
        const k2 = k * 4 + j2;
        const hh = a => hash2(gi * 4 + j2, gj, seed + a);
        const qx = n2 === 1 ? x1 : x1 + (hh(51) - 0.5) * 0.75 * GROSS_B;
        const qy = n2 === 1 ? y1 : y1 + (hh(52) - 0.5) * 0.75 * GROSS_HS;
        s.p2x[k2] = qx;
        s.p2y[k2] = qy;
        const n3 = n2 > 1 && hh(53) < 0.4 ? (hh(54) < 0.5 ? 2 : 3) : 0;
        s.n3[k2] = n3;
        const grosser = n2 === 1 ? 58 : n2 === 2 ? 44 : n2 === 3 ? 36 : 30;
        for (let m = 0; m < Math.max(1, n3); m += 1) {
          const kl = k2 * 3 + m;
          const h3 = a => hash2(gi * 12 + j2 * 3 + m, gj, seed + a);
          let cx = qx;
          let cy = qy;
          let sz = grosser;
          if (n3) {
            cx = qx + (h3(61) - 0.5) * 36;
            cy = qy + (h3(62) - 0.5) * 30;
            s.p3x[kl] = cx;
            s.p3y[kl] = cy;
            sz = 19 + 4 * h3(63);
          }
          s.lcx[kl] = cx;
          s.lcy[kl] = cy;
          s.lsz[kl] = sz;
          const ton2 = h3(64) < 0.2 ? Math.floor(h3(65) * TOENE.length) % TOENE.length : ton;
          const v = 0.78 + 0.46 * h3(66);
          const t = TOENE[ton2];
          s.lr[kl] = (t[0] * (1 - STEIN_TON) + tint[0] * STEIN_TON) * v;
          s.lg[kl] = (t[1] * (1 - STEIN_TON) + tint[1] * STEIN_TON) * v;
          s.lb[kl] = (t[2] * (1 - STEIN_TON) + tint[2] * STEIN_TON) * v;
          // Bit 1 Riss, 2 Moosfleck, 4 Ader (Quarz oder Erz), 8 Erzton statt Quarz.
          s.lflag[kl] = (sz > 26 && h3(67) < 0.3 ? 1 : 0) | (h3(68) < 0.22 ? 2 : 0)
            | (h3(70) < 0.34 ? 4 : 0) | (h3(71) < 0.45 ? 8 : 0);
          s.lang[kl] = h3(69) * Math.PI;
        }
      }
      for (let a = 0; a < n2; a += 1) {
        for (let c = 0; c < n2; c += 1) {
          s.inv2[k * 16 + a * 4 + c] = 0.5 / (Math.hypot(s.p2x[k * 4 + a] - s.p2x[k * 4 + c], s.p2y[k * 4 + a] - s.p2y[k * 4 + c]) + 1e-6);
        }
        const q = k * 4 + a;
        for (let u = 0; u < s.n3[q]; u += 1) {
          for (let c = 0; c < s.n3[q]; c += 1) {
            s.inv3[q * 9 + u * 3 + c] = 0.5 / (Math.hypot(s.p3x[q * 3 + u] - s.p3x[q * 3 + c], s.p3y[q * 3 + u] - s.p3y[q * 3 + c]) + 1e-6);
          }
        }
      }
    }
  }
  return s;
}

/** Kachel (256×256) aus zweistufigem Wertrauschen für die Steinmaserung; kein Streifenmuster. */
function maserKachel(seed) {
  const N = 256;
  const t = new Float32Array(N * N);
  const stufen = [[32, 0.65], [8, 0.35]];
  for (const [zelle, gewicht] of stufen) {
    const g = N / zelle;
    for (let y = 0; y < N; y += 1) {
      const fy = y / zelle;
      const j = Math.floor(fy);
      const v = fy - j;
      const sv = v * v * (3 - 2 * v);
      for (let x = 0; x < N; x += 1) {
        const fx = x / zelle;
        const i = Math.floor(fx);
        const u = fx - i;
        const su = u * u * (3 - 2 * u);
        const a = hash2(i % g, j % g, seed + zelle);
        const b = hash2((i + 1) % g, j % g, seed + zelle);
        const c = hash2(i % g, (j + 1) % g, seed + zelle);
        const dd = hash2((i + 1) % g, (j + 1) % g, seed + zelle);
        t[y * N + x] += gewicht * ((a * (1 - su) + b * su) * (1 - sv) + (c * (1 - su) + dd * su) * sv);
      }
    }
  }
  return t;
}

/** Kachel (256×256) für Adern: nur grobes Rauschen, damit die Linien lang und ruhig laufen statt zu kritzeln. */
function aderKachel(seed) {
  const N = 256;
  const zelle = 64;
  const g = N / zelle;
  const t = new Float32Array(N * N);
  for (let y = 0; y < N; y += 1) {
    const fy = y / zelle;
    const j = Math.floor(fy);
    const sv = (fy - j) * (fy - j) * (3 - 2 * (fy - j));
    for (let x = 0; x < N; x += 1) {
      const fx = x / zelle;
      const i = Math.floor(fx);
      const su = (fx - i) * (fx - i) * (3 - 2 * (fx - i));
      const a = hash2(i % g, j % g, seed);
      const b = hash2((i + 1) % g, j % g, seed);
      const c = hash2(i % g, (j + 1) % g, seed);
      const dd = hash2((i + 1) % g, (j + 1) % g, seed);
      t[y * N + x] = (a * (1 - su) + b * su) * (1 - sv) + (c * (1 - su) + dd * su) * sv;
    }
  }
  return t;
}

/** 1-D-Rauschtabelle (0..1) für Verzerrung und Maserung. */
function tabelle(laenge, skala, seed) {
  const t = new Float32Array(laenge);
  for (let i = 0; i < laenge; i += 1) t[i] = rauschen1(i / skala, seed);
  return t;
}

/**
 * Färbt die Geländeebene als Wand aus großen, unregelmäßigen Bruchsteinen mit
 * Tiefenverlauf, Moosflecken, Rissen, Moos-Kante und Kontur.
 *
 * @param {{getContext:function}} layer - die gebackene Geländeebene
 * @param {Uint8Array} bitmap - 1 = fest
 * @param {number} breite
 * @param {number} hoehe
 * @param {{surface:number[], deep:number[]}} palette
 * @param {number} [seed]
 * @returns {Array<{x:number,y:number,h:number}>} Grasbüschel-Positionen (für den Aufrufer ohne Belang)
 */
export function veredleGelaende(layer, bitmap, breite, hoehe, palette, seed = 0) {
  const ctx = layer.getContext('2d');
  const bild = ctx.getImageData(0, 0, breite, hoehe);
  const d = bild.data;
  const S = baueSteine(breite, hoehe, seed, palette);
  const { nx, ny, p1x, p1y, w1, n2, p2x, p2y, n3, p3x, p3y, lcx, lcy, lsz, lr, lg, lb, lflag, lang, inv2, inv3 } = S;

  // Verzerrung: Kanten wackeln, damit aus geraden Voronoi-Kanten Bruchkanten werden.
  const wxy = tabelle(hoehe, 31, seed + 201);
  const wxy2 = tabelle(hoehe, 11, seed + 202);
  const wyx = tabelle(breite, 41, seed + 203);
  const wyx2 = tabelle(breite, 13, seed + 204);
  const mx = tabelle(breite, 23, seed + 205);
  const kachel = maserKachel(seed + 206);
  const adern = aderKachel(seed + 211);
  const strata = tabelle(hoehe, 19, seed + 207);
  // Gesteinslagen: breite wellige Bänder (Sediment) mit Farbwechsel warm/kalt, dazu feine Fugen an den Lagengrenzen.
  const LAGE_RAND = 48;
  const lagen = tabelle(hoehe + 2 * LAGE_RAND, 27, seed + 208);
  const lagenFein = tabelle(hoehe + 2 * LAGE_RAND, 7, seed + 209);
  const art = bodenArt(palette.surface);
  const saum = saumFuer(art, palette);
  // Erdschicht unter dem Saum: die Bodenfarbe, abgedunkelt und leicht erdig.
  const erde = mischeRgb(mischeRgb(palette.surface, palette.deep, 0.6), art === 'schnee' ? [96, 110, 128] : [74, 54, 36], 0.4).map(v => v * 0.62);
  const ERDE_TIEFE = 54;
  const runStart = new Int32Array(breite).fill(-1);

  for (let y = 0; y < hoehe; y += 1) {
    const verschX = (wxy[y] - 0.5) * 16 + (wxy2[y] - 0.5) * 6;
    const hoeheFaktor = 1 - 0.2 * (y / hoehe);
    const schicht = 0.96 + 0.08 * strata[y];
    for (let x = 0; x < breite; x += 1) {
      const idx = y * breite + x;
      if (!bitmap[idx]) { runStart[x] = -1; continue; }
      if (runStart[x] < 0) runStart[x] = y;
      const o = idx * 4;
      if (d[o + 3] === 0) continue;

      const sx = x + verschX;
      const sy = (y + (wyx[x] - 0.5) * 14 + (wyx2[x] - 0.5) * 5) * YSTRECK;
      let ci = Math.floor(sx / GROSS_B) + 2;
      let cj = Math.floor(sy / GROSS_HS) + 2;
      ci = ci < 1 ? 1 : ci > nx - 2 ? nx - 2 : ci;
      cj = cj < 1 ? 1 : cj > ny - 2 ? ny - 2 : cj;

      // Ebene 1: gewichtete Zellen (Power-Diagramm), Abstand zur Mittelsenkrechten als Randmaß.
      let D1 = 1e18;
      let D2 = 1e18;
      let best = 0;
      let zweit = 0;
      for (let dj = -1; dj <= 1; dj += 1) {
        const zeile = (cj + dj) * nx + ci;
        for (let di = -1; di <= 1; di += 1) {
          const k = zeile + di;
          const dx = sx - p1x[k];
          const dy = sy - p1y[k];
          const dd = dx * dx + dy * dy - w1[k];
          if (dd < D1) { D2 = D1; zweit = best; D1 = dd; best = k; } else if (dd < D2) { D2 = dd; zweit = k; }
        }
      }
      const ax = p1x[best] - p1x[zweit];
      const ay = p1y[best] - p1y[zweit];
      let e = (D2 - D1) / (2 * Math.sqrt(ax * ax + ay * ay) + 1e-6);

      // Ebene 2: mittlere Steine im Brocken (Randmaß über vorberechnete Kehrwerte der Punktabstände).
      const c2 = n2[best];
      let j2 = 0;
      if (c2 > 1) {
        let a1 = 1e18;
        let a2 = 1e18;
        let z2 = 0;
        const basis = best * 4;
        for (let t = 0; t < c2; t += 1) {
          const dx = sx - p2x[basis + t];
          const dy = sy - p2y[basis + t];
          const dd = dx * dx + dy * dy;
          if (dd < a1) { a2 = a1; z2 = j2; a1 = dd; j2 = t; } else if (dd < a2) { a2 = dd; z2 = t; }
        }
        const e2s = (a2 - a1) * inv2[best * 16 + j2 * 4 + z2] * 1.3;
        if (e2s < e) e = e2s;
      }

      // Ebene 3: kleine Füllsteine.
      const k2 = best * 4 + j2;
      const c3 = n3[k2];
      let m = 0;
      if (c3 > 0) {
        let a1 = 1e18;
        let a2 = 1e18;
        let z3 = 0;
        const basis = k2 * 3;
        for (let t = 0; t < c3; t += 1) {
          const dx = sx - p3x[basis + t];
          const dy = sy - p3y[basis + t];
          const dd = dx * dx + dy * dy;
          if (dd < a1) { a2 = a1; z3 = m; a1 = dd; m = t; } else if (dd < a2) { a2 = dd; z3 = t; }
        }
        const e3s = (a2 - a1) * inv3[k2 * 9 + m * 3 + z3] * 1.7;
        if (e3s < e) e = e3s;
      }

      const leaf = k2 * 3 + m;
      const sz = lsz[leaf];
      const ddx = (sx - lcx[leaf]) / sz;
      const ddy = (sy - lcy[leaf]) / sz;
      let g = -(0.55 * ddx + 0.83 * ddy);
      g = g < -1 ? -1 : g > 1 ? 1 : g;
      const mm = 2 * kachel[(((y + (x >> 8) * 97) & 255) << 8) | (x & 255)];
      const fleck = 0.9 + 0.1 * mm;
      const tiefe = y - runStart[x];

      // Lagen: schräg-wellige Bänder; die feine Lage setzt dünne dunkle Fugen und zieht warm/kalt.
      const ly = (y + LAGE_RAND + (wyx[x] - 0.5) * 44 + (x >> 4) * 0.35) | 0;
      const lage = lagen[ly < 0 ? 0 : ly];
      const fein = lagenFein[ly < 0 ? 0 : ly];
      const warm = lage * 2 - 1;
      const lageF = (0.9 + 0.2 * lage + 0.06 * fein) * schicht;
      const f = (1 + 0.3 * g) * fleck * lageF;
      let r = lr[leaf] * f * (1 + 0.1 * warm);
      let gg = lg[leaf] * f;
      let b = lb[leaf] * f * (1 - 0.1 * warm);
      const fuge = fein - 0.5;
      if (fuge < 0.012 && fuge > -0.012) { r *= 0.8; gg *= 0.8; b *= 0.82; }

      // Erdschicht direkt unter dem Saum: weich ins Gestein verlaufend, mit Körnung am Übergang.
      if (tiefe < ERDE_TIEFE + 12) {
        const eg = 1 - glatt(10 + mx[x] * 12, ERDE_TIEFE + (mm - 1) * 10, tiefe);
        if (eg > 0) {
          const q = eg * 0.55;
          const eh = 0.78 + 0.3 * g + 0.2 * (mm - 1);
          r += (erde[0] * eh - r) * q; gg += (erde[1] * eh - gg) * q; b += (erde[2] * eh - b) * q;
        }
      }

      // Kantenlicht: oben/links hell, unten/rechts dunkel; schmal bei kleinen Steinen.
      if (e < 5) {
        const k = 1 - e / 5;
        const bev = k * k;
        const licht = g > 0 ? bev * g * 62 : bev * g * 34;
        r += licht; gg += licht * 0.97; b += licht * 0.9;
      }

      // Moosfleck auf der Oberseite einzelner Steine.
      const flagge = lflag[leaf];
      if (flagge & 2) {
        const w = lang[leaf];
        const mxp = lcx[leaf] + Math.cos(w) * sz * 0.35;
        const myp = lcy[leaf] - sz * 0.5;
        const dx = sx - mxp;
        const dy = sy - myp;
        const rad = sz * 0.62;
        const nah = 1 - Math.sqrt(dx * dx + dy * dy) / rad;
        if (nah > 0) {
          const a = nah * 1.5 - 0.3 + (hash2(x >> 1, y >> 1, seed + 88) - 0.5) * 0.7 + (mm - 1) * 0.5;
          if (a > 0 && g > -0.2) {
            const q = (a > 1 ? 1 : a) * 0.8;
            const hell = 0.8 + 0.35 * g;
            r += (MOOS_STEIN[0] * hell - r) * q;
            gg += (MOOS_STEIN[1] * hell - gg) * q;
            b += (MOOS_STEIN[2] * hell - b) * q;
          }
        }
      }

      // Adern: dünne Quarz- oder Erzbänder, die auf einem Teil der Steine schräg durchlaufen.
      if ((flagge & 4) && e > 2) {
        const dk = adern[((((y - (x >> 1)) & 255) << 8) | ((x + (y >> 1)) & 255))] - 0.5;
        const ad = dk < 0 ? -dk : dk;
        if (ad < 0.016) {
          const q = (1 - ad / 0.016) * 0.7;
          if (flagge & 8) { r += (176 - r) * q; gg += (122 - gg) * q; b += (58 - b) * q; }
          else { r += (214 - r) * q; gg += (224 - gg) * q; b += (230 - b) * q; }
        }
      }

      // Riss.
      if ((flagge & 1) && e > 1.7) {
        const w = lang[leaf];
        const ca = Math.cos(w);
        const sa = Math.sin(w);
        const entlang = ddx * ca + ddy * sa;
        const quer = (-ddx * sa + ddy * ca) * sz + (mx[x] - 0.5) * 4;
        const ae = entlang < 0 ? -entlang : entlang;
        if (ae < 0.85 && quer < 0.8 * (1.1 - ae) && quer > -0.8 * (1.1 - ae)) {
          r *= 0.42; gg *= 0.42; b *= 0.45;
        }
      }

      // Tiefe: nach unten deutlich dunkler und kühler, Rand der Karte als Vignette.
      const t = glatt(18, 640, tiefe);
      const rand = Math.min(x, breite - 1 - x) / breite;
      const vign = 1 - 0.2 * (1 - glatt(0, 0.1, rand));
      const dunkel = (1.06 - 0.56 * t) * hoeheFaktor * vign;
      r *= dunkel * (1 - 0.06 * t);
      gg *= dunkel;
      b *= dunkel * (1 + 0.05 * t);

      const korn = hash2(x, y, seed + 71) * 7 - 3.5;
      r += korn; gg += korn; b += korn;

      if (e < 1.5) {
        const q = glatt(0.5, 1.5, e);
        r = FUGE[0] + (r - FUGE[0]) * q;
        gg = FUGE[1] + (gg - FUGE[1]) * q;
        b = FUGE[2] + (b - FUGE[2]) * q;
      }
      d[o] = r < 0 ? 0 : r > 255 ? 255 : r;
      d[o + 1] = gg < 0 ? 0 : gg > 255 ? 255 : gg;
      d[o + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
    }
  }

  const buescheln = malMoos(d, bitmap, breite, hoehe, saum, seed);
  zeichneRand(d, bitmap, breite, hoehe, art);
  zeichneKontur(d, bitmap, breite, hoehe);
  ctx.putImageData(bild, 0, 0);
  zeichneBueschel(ctx, buescheln, saum, seed);
  return buescheln;
}

/** Moos- und Grasschicht an jeder Oberkante; schreibt direkt in die Pixel. */
function malMoos(d, bitmap, breite, hoehe, saum, seed) {
  const { hell, mittel, tief } = saum;
  const buescheln = [];

  for (let x = 0; x < breite; x += 1) {
    // Dicke der Moosschicht: wellig, mit einzelnen Tropfkanten, die als Zungen nach unten hängen.
    const gruppe = Math.floor(x / 3);
    const traufe = hash2(gruppe, 13, seed + 99) > 1 - saum.tropf
      ? (6 + 16 * hash2(gruppe, 14, seed + 99)) * (1 - Math.abs((x % 3) - 1) * 0.35) : 0;
    const dicke = saum.basis + saum.amp * rauschen1(x / 38, seed + 91) + 3 * saum.kruste * hash2(x, 3, seed + 92)
      + (hash2(x >> 2, 9, seed + 93) > 0.88 ? 5 * saum.kruste : 0) + traufe;
    let lauf = 0;
    let luft = 1000;
    for (let y = 0; y < hoehe; y += 1) {
      const fest = bitmap[y * breite + x];
      if (!fest) { lauf = 0; luft += 1; continue; }
      if (lauf === 0 && luft < 30) {
        while (y + 1 < hoehe && bitmap[(y + 1) * breite + x]) y += 1;
        luft = 0;
        continue;
      }
      if (lauf === 0) luft = 0;
      lauf += 1;
      const o = (y * breite + x) * 4;
      if (lauf > dicke) {
        // Schatten unter dem Moos: setzt die grüne Schicht gegen den Stein ab.
        if (lauf <= dicke + 5) {
          const sch = 0.55 + 0.09 * (lauf - dicke);
          d[o] *= sch; d[o + 1] *= sch; d[o + 2] *= sch;
          continue;
        }
        while (y + 1 < hoehe && bitmap[(y + 1) * breite + x]) y += 1;
        continue;
      }
      const k = lauf - 1;
      let c;
      if (k < 2) c = hell;
      else if (k < dicke - 3) c = mittel;
      else c = tief;
      if (k >= dicke - 1.5 && hash2(x, y, seed + 94) < 0.5) continue;
      d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
      if (saum.bueschel && k === 0 && y > 0 && hash2(x, 5, seed + 95) > 0.9 && x > 4 && x < breite - 5) {
        buescheln.push({ x, y, h: 6 + Math.floor(hash2(x, 6, seed + 96) * 9) });
      }
    }
  }
  return buescheln;
}

/**
 * Kantenlicht (Rim-Light) und Kantenschatten: Das Licht fällt von links oben. Feste Pixel mit Luft links
 * oder oben (ein bis zwei Pixel weit) werden aufgehellt, solche mit Luft rechts oder unten abgedunkelt.
 * Das hebt Felsflanken und Überhänge vom Hintergrund ab und kostet nur Nachbarschaftslesen im Bake-Lauf.
 */
function zeichneRand(d, bitmap, breite, hoehe, art) {
  // Sonnenfarbe je Boden: warm auf Gras und Sand, kühl auf Schnee und Fels.
  const licht = art === 'schnee' ? [196, 224, 255] : art === 'sand' ? [255, 226, 160] : art === 'gras' ? [236, 255, 170] : [214, 214, 232];
  for (let y = 2; y < hoehe - 2; y += 1) {
    const zeile = y * breite;
    for (let x = 2; x < breite - 2; x += 1) {
      const i = zeile + x;
      if (!bitmap[i]) continue;
      const o = i * 4;
      if (d[o + 3] === 0) continue;
      const l1 = !bitmap[i - 1];
      const o1 = !bitmap[i - breite];
      const r1 = !bitmap[i + 1];
      const u1 = !bitmap[i + breite];
      if (l1 || o1 || r1 || u1) {
        // Erste Pixelreihe an der Kante.
        if (l1 || o1) {
          const st = (l1 ? 0.32 : 0.16) + (o1 && l1 ? 0.1 : 0);
          d[o] += (licht[0] - d[o]) * st; d[o + 1] += (licht[1] - d[o + 1]) * st; d[o + 2] += (licht[2] - d[o + 2]) * st;
        } else {
          d[o] *= 0.72; d[o + 1] *= 0.72; d[o + 2] *= 0.74;
        }
        continue;
      }
      // Zweite Reihe: schwächer.
      if (!bitmap[i - 2] || !bitmap[i - 2 * breite]) {
        d[o] += (licht[0] - d[o]) * 0.12; d[o + 1] += (licht[1] - d[o + 1]) * 0.12; d[o + 2] += (licht[2] - d[o + 2]) * 0.12;
      } else if (!bitmap[i + 2] || !bitmap[i + 2 * breite]) {
        d[o] *= 0.88; d[o + 1] *= 0.88; d[o + 2] *= 0.89;
      }
    }
  }
}

/** Dunkle Comic-Kontur: jedes Luftpixel neben festem Gelände wird zur Linie. */
function zeichneKontur(d, bitmap, breite, hoehe) {
  for (let y = 0; y < hoehe; y += 1) {
    const zeile = y * breite;
    for (let x = 0; x < breite; x += 1) {
      if (bitmap[zeile + x]) continue;
      const nachbar = (y > 0 && bitmap[zeile - breite + x])
        || (y + 1 < hoehe && bitmap[zeile + breite + x])
        || (x > 0 && bitmap[zeile + x - 1])
        || (x + 1 < breite && bitmap[zeile + x + 1]);
      if (!nachbar) continue;
      const o = (zeile + x) * 4;
      d[o] = KONTUR[0]; d[o + 1] = KONTUR[1]; d[o + 2] = KONTUR[2]; d[o + 3] = 255;
    }
  }
}

/** Kleine Grashalme über der Kante (mit dunkler Kontur). */
function zeichneBueschel(ctx, buescheln, saum, seed) {
  if (!saum.bueschel) return;
  const halm = css(saum.bueschel[0]);
  const halmHell = css(saum.bueschel[1]);
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const b of buescheln) {
    const n = 3;
    for (let i = 0; i < n; i += 1) {
      const neigung = (i - 1) * 2.6 + (hash2(b.x, i, seed + 97) - 0.5) * 2;
      const h = b.h * (0.65 + 0.35 * hash2(b.x, i + 3, seed + 98));
      const x0 = b.x + (i - 1) * 1.7;
      ctx.beginPath();
      ctx.moveTo(x0 - 1.2, b.y);
      ctx.quadraticCurveTo(x0 + neigung * 0.4, b.y - h * 0.6, x0 + neigung, b.y - h);
      ctx.quadraticCurveTo(x0 + neigung * 0.5 + 0.8, b.y - h * 0.5, x0 + 1.2, b.y);
      ctx.closePath();
      ctx.fillStyle = i === 1 ? halmHell : halm;
      ctx.strokeStyle = PAL.kontur;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.fill();
    }
  }
  ctx.restore();
}

/**
 * Kraterrand: dunkler Saum, angesengter Ring und Risse im verbleibenden Gelände.
 *
 * Wird nach dem Ausstanzen auf die Geländeebene gezeichnet. `source-atop`
 * malt nur dort, wo noch Boden steht — der Rand folgt dem Loch von selbst.
 *
 * @param {CanvasRenderingContext2D} ctx - Kontext der Geländeebene
 */
export function zeichneKraterRand(ctx, x, y, radius, seed = 0) {
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.strokeStyle = 'rgba(10, 8, 6, 0.38)';
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.arc(x, y, radius + 4, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(8, 6, 5, 0.9)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, radius + 1.5, 0, Math.PI * 2);
  ctx.stroke();

  // Frische Bruchkante: hellerer Rand oben/links (Licht), dunkel unten/rechts — passt zu den Steinkanten.
  ctx.strokeStyle = 'rgba(150, 146, 128, 0.4)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, radius + 6, Math.PI * 0.85, Math.PI * 1.7);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(6, 7, 9, 0.5)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, radius + 7, Math.PI * -0.1, Math.PI * 0.7);
  ctx.stroke();

  const sx = Math.round(x);
  const sy = Math.round(y);
  const anzahl = 4 + Math.min(5, Math.floor(radius / 10));
  ctx.strokeStyle = 'rgba(8, 6, 5, 0.85)';
  ctx.lineWidth = 1.4;
  for (let i = 0; i < anzahl; i += 1) {
    let w = ((i + hash2(sx, sy + i, seed + 3) * 0.8) / anzahl) * Math.PI * 2;
    let lx = x + Math.cos(w) * (radius + 1);
    let ly = y + Math.sin(w) * (radius + 1);
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    const teile = 2 + (hash2(sx, sy + i, seed + 5) > 0.5 ? 1 : 0);
    for (let s = 0; s < teile; s += 1) {
      w += (hash2(sx + s, sy + i, seed + 7) - 0.5) * 1.1;
      const laenge = 5 + hash2(sx + s, sy - i, seed + 9) * 9;
      lx += Math.cos(w) * laenge;
      ly += Math.sin(w) * laenge;
      ctx.lineTo(lx, ly);
    }
    ctx.stroke();
  }
  ctx.restore();
}
