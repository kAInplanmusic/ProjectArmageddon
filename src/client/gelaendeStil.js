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

const ZELLE_B = 50;
const ZELLE_H = 32;
const STEIN_NEUTRAL = [74, 66, 58];
const FUGE = [11, 10, 9];
const KONTUR = hexRgb(PAL.kontur);
const MOOS_LIMETTE = hexRgb(PAL.limette);

/** Feature-Punkte der Steinzellen (versetzte Reihen wie ein Bruchsteinmauerwerk). */
function baueZellen(breite, hoehe, seed) {
  const nx = Math.ceil(breite / ZELLE_B) + 3;
  const ny = Math.ceil(hoehe / ZELLE_H) + 3;
  const px = new Float32Array(nx * ny);
  const py = new Float32Array(nx * ny);
  const wert = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      const gi = i - 1;
      const gj = j - 1;
      const k = j * nx + i;
      const versatz = (gj & 1) * 0.5;
      px[k] = (gi + versatz + 0.12 + 0.76 * hash2(gi, gj, seed + 11)) * ZELLE_B;
      py[k] = (gj + 0.12 + 0.76 * hash2(gi, gj, seed + 23)) * ZELLE_H;
      wert[k] = hash2(gi, gj, seed + 37);
    }
  }
  return { nx, px, py, wert };
}

function glatt(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * Färbt die Geländeebene als Bruchsteinwand mit Moos-Kante und Kontur.
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
  const { nx, px, py, wert } = baueZellen(breite, hoehe, seed);

  for (let y = 0; y < hoehe; y += 1) {
    const cj = (y / ZELLE_H) | 0;
    for (let x = 0; x < breite; x += 1) {
      const idx = y * breite + x;
      if (!bitmap[idx]) continue;
      const o = idx * 4;
      if (d[o + 3] === 0) continue;

      const ci = (x / ZELLE_B) | 0;
      let d1 = 1e9;
      let d2 = 1e9;
      let best = 0;
      for (let dj = 0; dj < 3; dj += 1) {
        const rowBase = (cj + dj) * nx;
        for (let di = 0; di < 3; di += 1) {
          const k = rowBase + ci + di;
          const dx = x - px[k];
          const dy = (y - py[k]) * 1.35;
          const dd = dx * dx + dy * dy;
          if (dd < d1) { d2 = d1; d1 = dd; best = k; } else if (dd < d2) { d2 = dd; }
        }
      }
      const rand = (Math.sqrt(d2) - Math.sqrt(d1)) * 0.5;
      const v = wert[best];
      const grob = 0.9 + 0.2 * rauschen1(x / 90 + y / 140, seed + 5);

      const f = (0.58 + 0.3 * v) * grob;
      let r = (d[o] * 0.3 + STEIN_NEUTRAL[0] * 0.7) * f;
      let g = (d[o + 1] * 0.3 + STEIN_NEUTRAL[1] * 0.7) * f;
      let b = (d[o + 2] * 0.3 + STEIN_NEUTRAL[2] * 0.7) * f;
      if (v > 0.93) { r *= 0.9; g *= 1.08; b *= 0.9; }

      const schatten = 0.62 + 0.38 * glatt(1.0, 9, rand);
      r *= schatten; g *= schatten; b *= schatten;

      if (rand < 4.2) {
        const dx = x - px[best];
        const dy = (y - py[best]) * 1.35;
        if (dx + dy < 0) {
          const licht = (4.2 - rand) / 4.2 * 34;
          r += licht; g += licht * 0.95; b += licht * 0.85;
        }
      }
      const korn = hash2(x, y, seed + 71) * 7 - 3.5;
      r += korn; g += korn; b += korn;

      if (rand < 1.05) {
        const t = glatt(0.45, 1.05, rand);
        r = FUGE[0] + (r - FUGE[0]) * t;
        g = FUGE[1] + (g - FUGE[1]) * t;
        b = FUGE[2] + (b - FUGE[2]) * t;
      }
      d[o] = r < 0 ? 0 : r > 255 ? 255 : r;
      d[o + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
      d[o + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
    }
  }

  const buescheln = malMoos(d, bitmap, breite, hoehe, palette, seed);
  zeichneKontur(d, bitmap, breite, hoehe);
  ctx.putImageData(bild, 0, 0);
  zeichneBueschel(ctx, buescheln, palette, seed);
  return buescheln;
}

/** Moos- und Grasschicht an jeder Oberkante; schreibt direkt in die Pixel. */
function malMoos(d, bitmap, breite, hoehe, palette, seed) {
  const gm = gruenAnteil(palette.surface);
  const tint = (c) => mischeRgb(palette.surface, c, gm);
  const hell = tint([168, 255, 52]);
  const mittel = tint(mischeRgb(MOOS_LIMETTE, [40, 130, 10], 0.3));
  const tief = tint([34, 96, 16]);
  const buescheln = [];

  for (let x = 0; x < breite; x += 1) {
    const dicke = 6 + 6 * rauschen1(x / 34, seed + 91) + 2.5 * hash2(x, 3, seed + 92)
      + (hash2(x >> 2, 9, seed + 93) > 0.9 ? 4 : 0);
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
      if (lauf > dicke) {
        while (y + 1 < hoehe && bitmap[(y + 1) * breite + x]) y += 1;
        continue;
      }
      const k = lauf - 1;
      let c;
      if (k === 0) c = hell;
      else if (k < dicke - 2.2) c = mittel;
      else c = tief;
      if (k >= dicke - 1 && hash2(x, y, seed + 94) < 0.5) continue;
      const o = (y * breite + x) * 4;
      d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
      if (k === 0 && y > 0 && hash2(x, 5, seed + 95) > 0.935 && x > 4 && x < breite - 5) {
        buescheln.push({ x, y, h: 4 + Math.floor(hash2(x, 6, seed + 96) * 6) });
      }
    }
  }
  return buescheln;
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
function zeichneBueschel(ctx, buescheln, palette, seed) {
  const gm = gruenAnteil(palette.surface);
  const halm = css(mischeRgb(palette.surface, [110, 230, 24], gm));
  const halmHell = css(mischeRgb(palette.surface, [176, 255, 70], gm));
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
