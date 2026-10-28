/**
 * Geländedetails: kleine Dinge auf und unter dem Boden, die ihn bewohnt wirken lassen.
 *
 *   OBEN   Steine und Geröllhaufen, Pflanzen je Bodenart (Farn, Blume, Pilz; Strauch im Sand; verkohlter Stumpf in der Asche;
 *          Eiskristall im Schnee), Felsbrocken am Hang
 *   UNTEN  Wurzeln und Tropfsteine unter Überhängen und Decken (Wurzeln im Gras, Eiszapfen im Schnee, Tropfstein im Fels)
 *
 * Reine Darstellung auf der fertigen Geländeebene (nur in Luft gezeichnet, nie in den Fels): Maske, Kollision, Hash und Replay
 * bleiben unberührt. Alles folgt Position und Seed (`hash2`), nichts würfelt; derselbe Seed zeigt dieselben Details.
 *
 * @module gelaendeDetails
 */
import { hash2, mischeRgb, css } from './stil.js';

const KONTUR = 'rgba(14, 10, 8, 0.85)';
/** Abstand der Prüfspalten und Mindestluft über/unter einer Kante, damit Details nicht in Engstellen kleben. */
const SCHRITT = 7;
const MIN_LUFT = 22;

/** Oberkanten (fest unter Luft) und Unterkanten (fest über Luft) in den Prüfspalten; der Kartenrand zählt als Luft. */
export function findeKanten(bitmap, breite, hoehe) {
  const oben = [];
  const unten = [];
  const luftBis = (x, y0, schritt) => {
    for (let i = 1; i <= MIN_LUFT; i += 1) {
      const y = y0 + schritt * i;
      if (y < 0 || y >= hoehe) return schritt < 0; // oben ist der Rand offen, unten nicht
      if (bitmap[y * breite + x]) return false;
    }
    return true;
  };
  for (let x = 8; x < breite - 8; x += SCHRITT) {
    for (let y = 0; y < hoehe; y += 1) {
      if (!bitmap[y * breite + x]) continue;
      const luftDarueber = y === 0 || !bitmap[(y - 1) * breite + x];
      const luftDarunter = y === hoehe - 1 || !bitmap[(y + 1) * breite + x];
      if (luftDarueber && luftBis(x, y, -1)) oben.push({ x, y });
      if (luftDarunter && y < hoehe - 1 && luftBis(x, y, 1)) unten.push({ x, y });
    }
  }
  return { oben, unten };
}

/** Höhenunterschied der Oberkante zwischen x-5 und x+5 (Hangneigung); große Zahl = steil oder unbekannt. */
function neigung(bitmap, breite, hoehe, x, y) {
  const oben = (xx) => {
    for (let yy = Math.max(0, y - 14); yy < Math.min(hoehe, y + 14); yy += 1) if (bitmap[yy * breite + xx]) return yy;
    return null;
  };
  const a = oben(x - 5);
  const b = oben(x + 5);
  return a === null || b === null ? 99 : Math.abs(a - b);
}

function stein(ctx, x, y, r, hell, dunkel) {
  ctx.beginPath();
  ctx.ellipse(x, y - r * 0.55, r * 1.25, r * 0.85, 0, 0, Math.PI * 2);
  ctx.fillStyle = css(dunkel);
  ctx.fill();
  ctx.strokeStyle = KONTUR;
  ctx.lineWidth = 1.3;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(x - r * 0.3, y - r * 0.85, r * 0.7, r * 0.4, -0.3, 0, Math.PI * 2);
  ctx.fillStyle = css(hell);
  ctx.fill();
}

function blatt(ctx, x, y, laenge, winkel, breite, farbe) {
  const ex = x + Math.sin(winkel) * laenge;
  const ey = y - Math.cos(winkel) * laenge;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + Math.sin(winkel) * laenge * 0.5 + breite, y - Math.cos(winkel) * laenge * 0.55, ex, ey);
  ctx.quadraticCurveTo(x + Math.sin(winkel) * laenge * 0.5 - breite, y - Math.cos(winkel) * laenge * 0.45, x, y);
  ctx.fillStyle = css(farbe);
  ctx.fill();
  ctx.strokeStyle = KONTUR;
  ctx.lineWidth = 1;
  ctx.stroke();
}

function pflanze(ctx, art, x, y, s, saum, seed) {
  const g = hash2(x, y, seed + 207);
  if (art === 'gras') {
    if (g < 0.4) { // Farn
      for (let i = -2; i <= 2; i += 1) blatt(ctx, x, y + 1, (9 + 5 * (1 - Math.abs(i) / 3)) * s, i * 0.42, 2.4 * s, i % 2 ? saum.mittel : saum.hell);
    } else if (g < 0.72) { // Blume
      ctx.strokeStyle = css(saum.tief); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x, y + 1); ctx.lineTo(x, y - 11 * s); ctx.stroke();
      const farbe = [[226, 196, 80], [214, 118, 96], [200, 170, 226]][Math.floor(hash2(x, y, seed + 208) * 3)];
      ctx.fillStyle = css(farbe); ctx.strokeStyle = KONTUR; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, y - 12 * s, 3.1 * s, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    } else { // Pilz
      ctx.fillStyle = 'rgb(222, 212, 190)'; ctx.fillRect(x - 1.5 * s, y - 6 * s, 3 * s, 7 * s);
      ctx.beginPath(); ctx.ellipse(x, y - 6.5 * s, 5.5 * s, 3.4 * s, 0, Math.PI, 0); ctx.fillStyle = 'rgb(168, 72, 62)'; ctx.fill();
      ctx.strokeStyle = KONTUR; ctx.lineWidth = 1; ctx.stroke();
    }
  } else if (art === 'sand') { // Strauchtrieb
    ctx.strokeStyle = css(saum.tief); ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    for (let i = -1; i <= 1; i += 1) { ctx.beginPath(); ctx.moveTo(x, y + 1); ctx.quadraticCurveTo(x + i * 5 * s, y - 6 * s, x + i * 8 * s, y - 12 * s); ctx.stroke(); }
  } else if (art === 'asche') { // verkohlter Stumpf
    ctx.fillStyle = 'rgb(34, 28, 26)'; ctx.strokeStyle = KONTUR; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(x - 3 * s, y + 1); ctx.lineTo(x - 2 * s, y - 11 * s); ctx.lineTo(x + 1 * s, y - 8 * s); ctx.lineTo(x + 3 * s, y - 13 * s); ctx.lineTo(x + 4 * s, y + 1); ctx.closePath(); ctx.fill(); ctx.stroke();
  } else if (art === 'schnee') { // Eiskristall
    ctx.fillStyle = 'rgba(190, 228, 250, 0.95)'; ctx.strokeStyle = KONTUR; ctx.lineWidth = 1;
    for (const [dx, h] of [[-4, 9], [0, 14], [4, 8]]) {
      ctx.beginPath(); ctx.moveTo(x + dx * s - 2.2 * s, y + 1); ctx.lineTo(x + dx * s, y - h * s); ctx.lineTo(x + dx * s + 2.2 * s, y + 1); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  }
}

function haengend(ctx, art, x, y, s, seed, palette) {
  const laenge = (10 + 22 * hash2(x, y, seed + 211)) * s;
  if (art === 'schnee') { // Eiszapfen
    ctx.fillStyle = 'rgba(206, 236, 252, 0.95)'; ctx.strokeStyle = KONTUR; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x - 3 * s, y); ctx.lineTo(x + 3 * s, y); ctx.lineTo(x + hash2(x, 1, seed) * 2 - 1, y + laenge); ctx.closePath(); ctx.fill(); ctx.stroke();
  } else if (art === 'gras') { // Wurzel
    ctx.strokeStyle = 'rgb(74, 52, 34)'; ctx.lineWidth = 2.2 * s; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, y);
    ctx.bezierCurveTo(x + 5 * s * (hash2(x, 2, seed) - 0.5) * 2, y + laenge * 0.35, x - 6 * s * (hash2(x, 3, seed) - 0.5) * 2, y + laenge * 0.7, x + 3 * s * (hash2(x, 4, seed) - 0.5) * 2, y + laenge);
    ctx.stroke();
    ctx.strokeStyle = 'rgb(112, 84, 52)'; ctx.lineWidth = 0.9 * s; ctx.stroke();
  } else { // Tropfstein
    ctx.fillStyle = css(mischeRgb(palette.surface, palette.deep, 0.5)); ctx.strokeStyle = KONTUR; ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.moveTo(x - 3.4 * s, y); ctx.lineTo(x + 3.4 * s, y); ctx.lineTo(x, y + laenge * 0.9); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
}

/**
 * Streut die Details auf die fertige Geländeebene.
 * @param {CanvasRenderingContext2D} ctx Kontext der Geländeebene (nach `putImageData`)
 * @param {Uint8Array} bitmap Maske
 * @param {'gras'|'schnee'|'sand'|'fels'|'asche'} art Bodenart
 * @param {{hell:number[], mittel:number[], tief:number[]}} saum Farben der Oberkante
 * @param {{surface:number[], deep:number[]}} palette
 * @returns {number} Zahl der gesetzten Details (für Tests)
 */
export function zeichneDetails(ctx, bitmap, breite, hoehe, art, saum, palette, seed = 0) {
  const { oben, unten } = findeKanten(bitmap, breite, hoehe);
  const s = Math.max(0.8, breite / 2560 * 1.6);
  const felsig = mischeRgb(palette.surface, [150, 148, 150], 0.45);
  const dunkel = mischeRgb(felsig, palette.deep, 0.45);
  const hell = mischeRgb(felsig, [236, 232, 220], 0.28);
  let n = 0;
  ctx.save();
  ctx.lineJoin = 'round';
  for (const k of oben) {
    const w = hash2(k.x, k.y, seed + 201);
    if (w > 0.4) continue; // etwa jede zweite bis dritte Prüfspalte
    if (neigung(bitmap, breite, hoehe, k.x, k.y) > 9) {
      if (w < 0.07) { stein(ctx, k.x, k.y + 3, (6 + 5 * hash2(k.x, 2, seed + 202)) * s, hell, dunkel); n += 1; } // Brocken am Hang
      continue;
    }
    if (w < 0.1) {
      stein(ctx, k.x, k.y + 2, (3 + 4 * hash2(k.x, 3, seed + 203)) * s, hell, dunkel);
      if (hash2(k.x, 4, seed + 204) > 0.5) stein(ctx, k.x + 7 * s, k.y + 2, (2 + 2.5 * hash2(k.x, 5, seed + 205)) * s, hell, dunkel);
    } else {
      pflanze(ctx, art, k.x, k.y + 1, s, saum, seed);
    }
    n += 1;
  }
  for (const k of unten) {
    if (hash2(k.x, k.y, seed + 206) > 0.32) continue;
    haengend(ctx, art, k.x, k.y - 1, s, seed, palette);
    n += 1;
  }
  ctx.restore();
  return n;
}
