/**
 * Deko des Fantasywalds (Kennung `kristallwald`, Biom 20) — reine Client-Optik.
 *
 * Nebelbänke (hinter dem Gelände, über den Hängen) und Feenlichter (kleine Leuchtpunkte über dem Boden) kommen als
 * eigene Ebene dazu, Riesenfarn und Leuchtpilze als Pflanzenarten (`pflanzenNeu.js`). Alles hängt nur an Seed und
 * Geländeoberfläche (`hash2`), nie an Zufall, Wanduhr oder Engine-Zustand (AGENTS.md §2): Die Orte stehen beim Aufbau fest,
 * nur die Darstellung bewegt sich.
 *
 * Bewegung ist abschaltbar: Bei `reduziert` (Reduced Motion) stehen Nebel und Lichter still in fester Helligkeit; die
 * Grafikstufe (`dichte` < 1) lässt einen festen Teil der Lichter weg.
 *
 * @module fantasywaldDeko
 */
import { hash2 } from './stil.js';

/** Biom-Kennung, für die diese Deko gilt. */
export const FANTASYWALD_BIOM = 'kristallwald';

/** Farben der Feenlichter (Kern, Schein) nach Index gewählt: türkis, violett, blassgelb. */
const FEEN_FARBEN = Object.freeze([
  Object.freeze({ kern: '210,255,248', schein: '90,255,220' }),
  Object.freeze({ kern: '236,214,255', schein: '176,110,255' }),
  Object.freeze({ kern: '255,250,200', schein: '255,226,120' }),
]);

/** Kantenlänge der Glühsprites. */
const SPRITE = 64;
const sprites = new Map();

/** Weicher Leuchtpunkt als Bild (einmal je Farbe gebaut); ohne DOM (Node-Tests) `null`. */
function glueh(farbe) {
  const hit = sprites.get(farbe.schein);
  if (hit !== undefined) return hit;
  const c = globalThis.document?.createElement?.('canvas');
  const x = c?.getContext?.('2d');
  if (!x) return null;
  c.width = SPRITE; c.height = SPRITE;
  const g = x.createRadialGradient(SPRITE / 2, SPRITE / 2, 0, SPRITE / 2, SPRITE / 2, SPRITE / 2);
  g.addColorStop(0, `rgba(${farbe.kern},1)`);
  g.addColorStop(0.12, `rgba(${farbe.kern},0.95)`);
  g.addColorStop(0.3, `rgba(${farbe.schein},0.38)`);
  g.addColorStop(1, `rgba(${farbe.schein},0)`);
  x.fillStyle = g; x.fillRect(0, 0, SPRITE, SPRITE);
  sprites.set(farbe.schein, c);
  return c;
}

/** Nebeltöne: blasses Türkis und blasses Violett. */
const NEBEL_TON = Object.freeze(['150,224,214', '184,160,236']);
const nebelSprites = [];
/** Weiche Nebelwolke (breit, flach auslaufend) als Bild je Ton; ohne DOM `null`. */
function nebelBild(ton) {
  if (nebelSprites[ton] !== undefined) return nebelSprites[ton];
  const c = globalThis.document?.createElement?.('canvas');
  const x = c?.getContext?.('2d');
  if (!x) return (nebelSprites[ton] = null);
  c.width = 256; c.height = 64;
  x.translate(128, 32); x.scale(1, 0.25);
  const g = x.createRadialGradient(0, 0, 0, 0, 0, 128);
  g.addColorStop(0, `rgba(${NEBEL_TON[ton]},0.9)`);
  g.addColorStop(0.5, `rgba(${NEBEL_TON[ton]},0.4)`);
  g.addColorStop(1, `rgba(${NEBEL_TON[ton]},0)`);
  x.fillStyle = g; x.fillRect(-128, -128, 256, 256);
  return (nebelSprites[ton] = c);
}

/**
 * Setzt Nebelbänke und Feenlichter über das Gelände.
 *
 * @param {Uint8Array} bitmap - 1 = fest
 * @param {number} breite
 * @param {number} hoehe
 * @param {number} seed
 * @returns {{nebel: Array<{x:number,y:number,b:number,h:number,alpha:number,phase:number,farbe:number}>,
 *            lichter: Array<{x:number,y:number,r:number,phase:number,tempo:number,farbe:number}>}}
 */
export function plaziereFantasyDeko(bitmap, breite, hoehe, seed) {
  const oberflaeche = new Int32Array(breite).fill(-1);
  for (let x = 0; x < breite; x += 1) {
    for (let y = 0; y < hoehe; y += 1) if (bitmap[y * breite + x]) { oberflaeche[x] = y; break; }
  }
  const s = Math.max(1, breite / 2560);
  const nebel = [];
  const nNebel = Math.max(3, Math.round(breite / (440 * s)));
  for (let i = 0; i < nNebel; i += 1) {
    const x = Math.floor((i + 0.15 + 0.7 * hash2(i, 1, seed + 5101)) / nNebel * breite);
    const ob = oberflaeche[Math.min(breite - 1, Math.max(0, x))];
    if (ob < 0 || ob > hoehe * 0.85) continue;
    nebel.push({
      x, y: ob - (18 + 34 * hash2(i, 2, seed + 5102)) * s,
      b: (420 + 380 * hash2(i, 3, seed + 5103)) * s, h: (100 + 70 * hash2(i, 4, seed + 5104)) * s,
      alpha: 0.34 + 0.2 * hash2(i, 5, seed + 5105), phase: hash2(i, 6, seed + 5106) * Math.PI * 2,
      farbe: hash2(i, 7, seed + 5107) < 0.5 ? 0 : 1,
    });
  }
  const lichter = [];
  const nLichter = Math.max(8, Math.round(breite / (52 * s)));
  for (let i = 0; i < nLichter; i += 1) {
    const x = Math.floor(hash2(i, 11, seed + 5111) * (breite - 40)) + 20;
    const ob = oberflaeche[x];
    if (ob < 0 || ob > hoehe * 0.9) continue;
    lichter.push({
      x, y: ob - (22 + 120 * hash2(i, 12, seed + 5112)) * s,
      r: (1 + 0.7 * hash2(i, 13, seed + 5113)) * s, phase: hash2(i, 14, seed + 5114) * Math.PI * 2,
      tempo: 0.5 + hash2(i, 15, seed + 5115), farbe: Math.floor(hash2(i, 16, seed + 5116) * FEEN_FARBEN.length) % FEEN_FARBEN.length,
    });
  }
  return { nebel, lichter };
}

/**
 * Zeichnet die Nebelbänke (Weltkoordinaten; hinter dem Gelände aufrufen, sie sind nur über dem Boden sichtbar).
 * @param {CanvasRenderingContext2D} ctx
 * @param {{nebel: Array}} deko
 * @param {number} sekunden - Spielzeit in Sekunden (nur für die Bewegung)
 * @param {boolean} reduziert - Reduced Motion: Nebel steht still
 * @returns {number} Zahl der gezeichneten Bänke
 */
export function zeichneFantasyNebel(ctx, deko, sekunden, reduziert) {
  if (!deko?.nebel?.length) return 0;
  let n = 0;
  ctx.save();
  for (const b of deko.nebel) {
    const bild = nebelBild(b.farbe);
    if (!bild) break;
    const drift = reduziert ? 0 : Math.sin(sekunden * 0.07 + b.phase) * 38;
    const atem = reduziert ? 1 : 0.88 + 0.12 * Math.sin(sekunden * 0.21 + b.phase * 2);
    ctx.globalAlpha = Math.min(1, b.alpha * atem);
    ctx.drawImage(bild, b.x - b.b / 2 + drift, b.y - b.h / 2, b.b, b.h);
    // Zweite, kleinere Wolke versetzt: aus einer Ellipse wird eine Bank mit Buckeln.
    ctx.globalAlpha = Math.min(1, b.alpha * atem * 0.7);
    ctx.drawImage(bild, b.x - b.b * 0.18 + drift * 1.5, b.y - b.h * 0.8, b.b * 0.5, b.h * 1.1);
    n += 1;
  }
  ctx.restore();
  return n;
}

/**
 * Zeichnet die Feenlichter (Weltkoordinaten, additiv). Sie schweben und pulsieren langsam; bei `reduziert` stehen sie fest.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{lichter: Array}} deko
 * @param {number} sekunden
 * @param {boolean} reduziert
 * @param {number} [dichte] - Grafikstufe 0 bis 1: ein fester Teil der Lichter entfällt
 * @returns {number} Zahl der gezeichneten Lichter
 */
export function zeichneFeenlichter(ctx, deko, sekunden, reduziert, dichte = 1) {
  if (!deko?.lichter?.length) return 0;
  let n = 0;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < deko.lichter.length; i += 1) {
    if (dichte < 1 && (i % 10) / 10 >= dichte) continue;
    const l = deko.lichter[i];
    const bild = glueh(FEEN_FARBEN[l.farbe]);
    if (!bild) return 0;
    const t = sekunden * l.tempo;
    const x = l.x + (reduziert ? 0 : Math.sin(t * 0.8 + l.phase) * 9);
    const y = l.y + (reduziert ? 0 : Math.sin(t * 0.55 + l.phase * 1.7) * 6);
    const an = reduziert ? 0.8 : 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * 1.3 + l.phase * 3));
    const g = l.r * 14;
    ctx.globalAlpha = an;
    ctx.drawImage(bild, x - g, y - g, g * 2, g * 2);
    n += 1;
  }
  ctx.restore();
  return n;
}
