/**
 * Die Deko der Sonderbiome (`config/biome-neu.js`): Pilze, Kristalle, Schilf, Kakteen, Knochen, Korallen.
 *
 * Gezeichnet wird wie in `pflanzen.js` (Comic-Kontur, Ebene hinter dem Gelände); die Form folgt
 * Position und Seed (`hash2`), nie dem Zufall. Die Farben kommen aus der Bodenfarbe der Karte.
 *
 * @module pflanzenNeu
 */
import { hash2, mischeRgb, css } from './stil.js';

/** Die neuen Arten und ihre Höhe (Mindesthöhe, Spanne) in px. */
export const NEUE_ARTEN = Object.freeze({
  pilz: [18, 22], kristall: [14, 20], schilf: [18, 16], kaktus: [22, 18], knochen: [8, 6], koralle: [14, 16],
  // Fantasywald (`fantasywaldDeko.js`): mannshoher Farn mit Leuchtsaum und Pilze mit Schein.
  riesenfarn: [56, 44], leuchtpilz: [22, 20],
});

/** Farben einer Art, aus der Oberflächenfarbe des Bodens gemischt. */
function farbenFuer(art, surface) {
  const basis = {
    pilz: [[176, 84, 120], [236, 190, 150]],
    kristall: [[120, 150, 230], [214, 226, 255]],
    schilf: [[132, 138, 70], [196, 188, 110]],
    kaktus: [[70, 128, 70], [124, 176, 100]],
    knochen: [[222, 214, 190], [168, 158, 134]],
    koralle: [[232, 120, 110], [246, 190, 150]],
    // Fantasywald-Arten bringen ihre Leuchtfarben selbst mit (feste Töne, unabhängig vom Boden).
    riesenfarn: [[24, 102, 92], [110, 240, 206]],
    leuchtpilz: [[94, 44, 150], [226, 184, 255]],
  }[art];
  return { dunkel: css(mischeRgb(surface, basis[0], 0.7)), hell: css(mischeRgb(surface, basis[1], 0.7)) };
}

/**
 * Zeichnet eine neue Pflanzenart.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {{art:string,x:number,y:number,h:number,spiegel:boolean,seed:number}} p
 * @param {{kontur:string|null, stamm:string}} f - Farben aus `pflanzenFarben`
 * @param {number[]} surface - RGB der Bodenoberfläche
 */
export function zeichneNeuePflanze(ctx, p, f, surface) {
  const c = farbenFuer(p.art, surface);
  const s = p.spiegel ? -1 : 1;
  const umriss = () => { if (f.kontur) { ctx.strokeStyle = f.kontur; ctx.lineWidth = 2; ctx.stroke(); } };
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (p.art === 'riesenfarn') {
    zeichneRiesenfarn(ctx, p, f, s);
  } else if (p.art === 'leuchtpilz') {
    zeichneLeuchtpilz(ctx, p, s);
  } else if (p.art === 'pilz') {
    const hut = p.h * (0.5 + 0.2 * hash2(p.seed, 1, 2));
    ctx.fillStyle = c.hell;
    ctx.fillRect(p.x - p.h * 0.07, p.y - p.h * 0.7, p.h * 0.14, p.h * 0.7);
    ctx.beginPath();
    ctx.moveTo(p.x - hut, p.y - p.h * 0.62);
    ctx.quadraticCurveTo(p.x, p.y - p.h * 1.35, p.x + hut, p.y - p.h * 0.62);
    ctx.closePath();
    ctx.fillStyle = c.dunkel;
    ctx.fill();
    umriss();
    ctx.fillStyle = c.hell;
    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath();
      ctx.arc(p.x + (i - 1) * hut * 0.45 * s, p.y - p.h * (0.85 + 0.08 * (i % 2)), p.h * 0.06, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (p.art === 'kristall') {
    const n = 3 + Math.floor(hash2(p.seed, 3, 4) * 2);
    for (let i = 0; i < n; i += 1) {
      const bx = p.x + (i - (n - 1) / 2) * p.h * 0.28 * s;
      const bh = p.h * (0.55 + 0.45 * hash2(p.seed, i, 5));
      const bb = p.h * 0.13;
      ctx.beginPath();
      ctx.moveTo(bx - bb, p.y);
      ctx.lineTo(bx - bb * 0.8, p.y - bh * 0.75);
      ctx.lineTo(bx, p.y - bh);
      ctx.lineTo(bx + bb * 0.8, p.y - bh * 0.75);
      ctx.lineTo(bx + bb, p.y);
      ctx.closePath();
      ctx.fillStyle = i % 2 ? c.hell : c.dunkel;
      ctx.fill();
      umriss();
    }
  } else if (p.art === 'schilf') {
    for (let i = 0; i < 6; i += 1) {
      const bx = p.x + (i - 2.5) * 2.5;
      const kopf = bx + (hash2(p.seed, i, 6) - 0.5) * p.h * 0.5;
      const bh = p.h * (0.7 + 0.4 * hash2(p.seed, i, 7));
      ctx.strokeStyle = i % 2 ? c.hell : c.dunkel;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(bx, p.y);
      ctx.quadraticCurveTo(bx, p.y - bh * 0.6, kopf, p.y - bh);
      ctx.stroke();
      if (i % 3 === 0) {
        ctx.fillStyle = c.dunkel;
        ctx.fillRect(kopf - 1.5, p.y - bh - 5, 3, 7);
      }
    }
  } else if (p.art === 'kaktus') {
    const b = p.h * 0.16;
    ctx.fillStyle = c.dunkel;
    ctx.fillRect(p.x - b, p.y - p.h, b * 2, p.h);
    ctx.fillRect(p.x - b * 3, p.y - p.h * 0.6, b * 2, b * 1.4);
    ctx.fillRect(p.x - b * 3, p.y - p.h * 0.95 * 0.6 - b * 2, b * 1.4, b * 3);
    ctx.fillRect(p.x + b, p.y - p.h * 0.45, b * 2, b * 1.4);
    ctx.fillRect(p.x + b * 2, p.y - p.h * 0.45 - b * 2.4, b * 1.4, b * 3);
    ctx.fillStyle = c.hell;
    ctx.fillRect(p.x - b * 0.4, p.y - p.h, b * 0.5, p.h);
  } else if (p.art === 'knochen') {
    ctx.strokeStyle = c.hell;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(p.x - p.h, p.y - 1);
    ctx.lineTo(p.x + p.h, p.y - p.h * 0.5);
    ctx.stroke();
    ctx.fillStyle = c.hell;
    ctx.beginPath(); ctx.arc(p.x + p.h, p.y - p.h * 0.5, 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(p.x - p.h, p.y - 1, 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(p.x - p.h * 0.1, p.y - p.h * 0.7, p.h * 0.5, Math.PI, 0); ctx.fillStyle = c.dunkel; ctx.fill();
  } else {
    // Koralle: verzweigte Äste mit runden Spitzen.
    ctx.strokeStyle = c.dunkel;
    ctx.lineWidth = 3;
    for (let i = 0; i < 4; i += 1) {
      const w = -Math.PI * (0.2 + 0.6 * (i / 3));
      const l = p.h * (0.7 + 0.4 * hash2(p.seed, i, 8));
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + Math.cos(w) * l, p.y + Math.sin(w) * l);
      ctx.stroke();
      ctx.fillStyle = c.hell;
      ctx.beginPath(); ctx.arc(p.x + Math.cos(w) * l, p.y + Math.sin(w) * l, 3, 0, Math.PI * 2); ctx.fill();
    }
  }
}

/** Riesenfarn: 7 bis 9 Wedel in weitem Bogen, je Wedel Fiederblättchen, dunkles Blaugrün mit türkisem Leuchtsaum. */
function zeichneRiesenfarn(ctx, p, f, s) {
  const wedel = 7 + Math.floor(hash2(p.seed, 21, 3) * 3);
  for (let i = 0; i < wedel; i += 1) {
    const t = wedel === 1 ? 0.5 : i / (wedel - 1);
    const w = -Math.PI * (0.08 + 0.84 * t) + (hash2(p.seed, i, 22) - 0.5) * 0.25; // Richtung vom Fuß aus
    const l = p.h * (0.75 + 0.45 * hash2(p.seed, i, 23)) * (0.65 + 0.35 * Math.sin(Math.PI * t));
    const ex = p.x + Math.cos(w) * l; const ey = p.y + Math.sin(w) * l * 0.9;
    const kx = p.x + Math.cos(w) * l * 0.55; const ky = p.y + Math.sin(w) * l * 0.95 - l * 0.22; // Wedel wölbt sich nach oben
    ctx.strokeStyle = 'rgb(18,70,66)'; ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.quadraticCurveTo(kx, ky, ex, ey); ctx.stroke();
    const n = Math.max(5, Math.round(l / 5));
    for (let k = 1; k < n; k += 1) {
      const u = k / n;
      const qx = (1 - u) * (1 - u) * p.x + 2 * (1 - u) * u * kx + u * u * ex;
      const qy = (1 - u) * (1 - u) * p.y + 2 * (1 - u) * u * ky + u * u * ey;
      const tx = 2 * (1 - u) * (kx - p.x) + 2 * u * (ex - kx); const ty = 2 * (1 - u) * (ky - p.y) + 2 * u * (ey - ky);
      const tl = Math.hypot(tx, ty) || 1; const nx = -ty / tl; const ny = tx / tl;
      const fl = l * 0.2 * (1 - u * 0.75);
      ctx.strokeStyle = k % 2 ? 'rgb(24,102,92)' : 'rgb(30,122,104)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(qx, qy); ctx.lineTo(qx + nx * fl, qy + ny * fl + fl * 0.25); ctx.moveTo(qx, qy); ctx.lineTo(qx - nx * fl, qy - ny * fl + fl * 0.25); ctx.stroke();
      if (k % 2 === 0) {
        ctx.fillStyle = 'rgba(120,255,214,0.8)';
        ctx.fillRect(qx + nx * fl - 0.8, qy + ny * fl + fl * 0.25 - 0.8, 1.6, 1.6);
        ctx.fillRect(qx - nx * fl - 0.8, qy - ny * fl + fl * 0.25 - 0.8, 1.6, 1.6);
      }
    }
    ctx.strokeStyle = 'rgba(110,240,206,0.65)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.quadraticCurveTo(kx, ky, ex, ey); ctx.stroke();
  }
  void f; void s;
}

/** Leuchtpilz: Schein (weicher Kreis), Stiel, Hut in Violett oder Türkis mit hellen Punkten. */
function zeichneLeuchtpilz(ctx, p, s) {
  const violett = hash2(p.seed, 31, 5) < 0.55;
  const hut = p.h * (0.42 + 0.14 * hash2(p.seed, 1, 2));
  const cy = p.y - p.h * 0.7;
  const kern = violett ? '176,96,255' : '70,240,214';
  const hell = violett ? '226,184,255' : '176,255,240';
  const dunkel = violett ? 'rgb(94,44,150)' : 'rgb(20,120,118)';
  const g = ctx.createRadialGradient(p.x, cy, 0, p.x, cy, p.h * 1.05);
  g.addColorStop(0, `rgba(${kern},0.5)`); g.addColorStop(1, `rgba(${kern},0)`);
  ctx.fillStyle = g; ctx.fillRect(p.x - p.h * 1.1, cy - p.h * 1.1, p.h * 2.2, p.h * 2.2);
  ctx.fillStyle = 'rgb(196,214,206)';
  ctx.fillRect(p.x - p.h * 0.06, p.y - p.h * 0.7, p.h * 0.12, p.h * 0.7);
  ctx.beginPath(); ctx.moveTo(p.x - hut, cy); ctx.quadraticCurveTo(p.x, cy - p.h * 0.85, p.x + hut, cy); ctx.closePath();
  ctx.fillStyle = dunkel; ctx.fill();
  ctx.strokeStyle = `rgb(${hell})`; ctx.lineWidth = 1.4; ctx.stroke();
  ctx.fillStyle = `rgba(${hell},0.95)`;
  for (let i = 0; i < 3; i += 1) { ctx.beginPath(); ctx.arc(p.x + (i - 1) * hut * 0.45 * s, cy - p.h * (0.22 + 0.1 * (i % 2)), p.h * 0.055, 0, Math.PI * 2); ctx.fill(); }
}
