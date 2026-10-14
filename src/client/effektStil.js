/**
 * Zeichenroutinen für Zielhilfe, Geschosse, Explosionen und Schadenszahlen.
 *
 * Reine Darstellung im Stil des Entwurfs: Neon-Linien mit Glow (zweimal
 * gezeichnet, breit und blass, schmal und hell), Glut-Kerne, Funken, Druckring.
 * Die Zustandslogik bleibt in `effects.js` und `gefuehl.js`.
 *
 * Blitze sind klein und kurz (11 Bilder, ein Einschlag je Schuss): weit unter
 * den drei Blitzen je Sekunde von WCAG 2.3.1, und nie vollflächig.
 *
 * @module effektStil
 */
import { PAL, hash2 } from './stil.js';

function bahn(ctx, punkte) {
  ctx.beginPath();
  ctx.moveTo(punkte[0].x, punkte[0].y);
  for (const q of punkte) ctx.lineTo(q.x, q.y);
}

/** Pfeilspitze am Ende einer Linie, in Richtung (dx, dy). */
function pfeilspitze(ctx, x, y, dx, dy, groesse, farbe) {
  const laenge = Math.hypot(dx, dy) || 1;
  const ux = dx / laenge;
  const uy = dy / laenge;
  ctx.beginPath();
  ctx.moveTo(x + ux * groesse, y + uy * groesse);
  ctx.lineTo(x - ux * groesse * 0.6 - uy * groesse * 0.75, y - uy * groesse * 0.6 + ux * groesse * 0.75);
  ctx.lineTo(x - ux * groesse * 0.2, y - uy * groesse * 0.2);
  ctx.lineTo(x - ux * groesse * 0.6 + uy * groesse * 0.75, y - uy * groesse * 0.6 - ux * groesse * 0.75);
  ctx.closePath();
  ctx.fillStyle = farbe;
  ctx.strokeStyle = PAL.kontur;
  ctx.lineWidth = 1.4;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.fill();
}

/**
 * Leuchtende Flugbahn mit Pfeilspitze und Fadenkreuz.
 *
 * @param {Array<{x:number,y:number}>} punkte
 * @param {Array<Array<number>>} segmente - Fadenkreuz-Striche (`fadenkreuzSegmente`)
 * @param {number} innen - Radius des inneren Kreises
 */
export function zeichneZielhilfe(ctx, punkte, segmente, innen, farbe = PAL.limette) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  bahn(ctx, punkte);
  ctx.globalAlpha = 0.16;
  ctx.strokeStyle = farbe;
  ctx.lineWidth = 9;
  ctx.stroke();
  ctx.globalAlpha = 0.34;
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.lineWidth = 2;
  ctx.stroke();

  const n = punkte.length;
  const ende = punkte[n - 1];
  const vor = punkte[Math.max(0, n - 4)];
  pfeilspitze(ctx, ende.x, ende.y, ende.x - vor.x, ende.y - vor.y, 7, farbe);

  ctx.strokeStyle = PAL.kontur;
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  for (const [x1, y1, x2, y2] of segmente) { ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); }
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(ende.x, ende.y, innen, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = farbe;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  for (const [x1, y1, x2, y2] of segmente) { ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); }
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(ende.x, ende.y, innen, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** Bereits abgeschickter Schuss: durchgezogene Neon-Linie in Cyan mit gefülltem Einschlagpunkt. */
export function zeichneVorhersage(ctx, punkte, einschlag) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  bahn(ctx, punkte);
  ctx.globalAlpha = 0.2;
  ctx.strokeStyle = PAL.cyan;
  ctx.lineWidth = 8;
  ctx.stroke();
  ctx.globalAlpha = 0.95;
  ctx.lineWidth = 2.4;
  ctx.stroke();
  if (einschlag) {
    ctx.globalAlpha = 1;
    ctx.fillStyle = PAL.cyan;
    ctx.strokeStyle = PAL.kontur;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(einschlag.x, einschlag.y, 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fill();
  }
  ctx.restore();
}

/** Geschoss mit Glutkern; der Zünder-Countdown bleibt Sache des Renderers. */
export function zeichneGeschoss(ctx, x, y) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, 11);
  g.addColorStop(0, 'rgba(255, 245, 210, 1)');
  g.addColorStop(0.3, 'rgba(255, 184, 0, 0.95)');
  g.addColorStop(0.65, 'rgba(255, 77, 0, 0.45)');
  g.addColorStop(1, 'rgba(255, 77, 0, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff6d6';
  ctx.strokeStyle = PAL.kontur;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(x, y, 3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fill();
}

/** Rauchspur: nach hinten grau, breit und durchsichtig; vorn glühend. */
export function zeichneSpur(ctx, punkte) {
  ctx.lineCap = 'round';
  for (let i = 1; i < punkte.length; i += 1) {
    const anteil = i / punkte.length;
    ctx.globalAlpha = 0.07 + 0.2 * (1 - anteil);
    ctx.strokeStyle = '#8b9199';
    ctx.lineWidth = 3 + 6 * (1 - anteil);
    ctx.beginPath();
    ctx.moveTo(punkte[i - 1].x, punkte[i - 1].y);
    ctx.lineTo(punkte[i].x, punkte[i].y);
    ctx.stroke();
  }
  for (let i = 1; i < punkte.length; i += 1) {
    const anteil = i / punkte.length;
    ctx.globalAlpha = 0.2 + 0.7 * anteil;
    ctx.strokeStyle = anteil > 0.6 ? PAL.orange : PAL.rotorange;
    ctx.lineWidth = 1.2 + 2.6 * anteil;
    ctx.beginPath();
    ctx.moveTo(punkte[i - 1].x, punkte[i - 1].y);
    ctx.lineTo(punkte[i].x, punkte[i].y);
    ctx.stroke();
  }
}

/**
 * Explosionsblitz: orangener Kern, Druckring und Funkenstrahlen.
 *
 * Ring und Funken bewegen sich und entfallen bei reduzierter Bewegung; der
 * Kern bleibt, damit der Einschlag sichtbar ist.
 */
export function zeichneExplosion(ctx, e, reduziert) {
  const alpha = Math.max(0, Math.min(1, e.life));
  const alter = 1 - e.life;
  const radius = Math.max(1, e.radius * (1 + alter * 0.6));
  ctx.save();
  const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, radius);
  g.addColorStop(0, `rgba(255, 246, 214, ${alpha})`);
  g.addColorStop(0.3, `rgba(255, 184, 0, ${alpha * 0.9})`);
  g.addColorStop(0.65, `rgba(255, 77, 0, ${alpha * 0.55})`);
  g.addColorStop(1, 'rgba(255, 77, 0, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(e.x, e.y, radius, 0, Math.PI * 2);
  ctx.fill();
  if (!reduziert) {
    ctx.strokeStyle = `rgba(255, 220, 150, ${alpha * 0.8})`;
    ctx.lineWidth = 3 * alpha + 0.5;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.radius * (0.7 + alter * 2.1), 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineCap = 'round';
    const sx = Math.round(e.x);
    const sy = Math.round(e.y);
    for (let i = 0; i < 12; i += 1) {
      const w = (i / 12) * Math.PI * 2 + hash2(sx, sy, i) * 0.4;
      const a = e.radius * (0.5 + alter * 1.4);
      const b = a + e.radius * (0.25 + 0.5 * hash2(sy, sx, i + 40)) * alpha;
      ctx.strokeStyle = i % 3 === 0 ? `rgba(255, 77, 0, ${alpha})` : `rgba(255, 184, 0, ${alpha})`;
      ctx.lineWidth = 1.5 + alpha;
      ctx.beginPath();
      ctx.moveTo(e.x + Math.cos(w) * a, e.y + Math.sin(w) * a);
      ctx.lineTo(e.x + Math.cos(w) * b, e.y + Math.sin(w) * b);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Funken als kurze Striche in Flugrichtung mit hellem Kopf. */
export function zeichneFunken(ctx, teilchen) {
  ctx.lineCap = 'round';
  for (const t of teilchen) {
    ctx.globalAlpha = Math.max(0, t.life);
    ctx.strokeStyle = t.color;
    ctx.lineWidth = Math.max(1, t.radius * t.life * 0.8);
    ctx.beginPath();
    ctx.moveTo(t.x - t.vx * 1.6, t.y - t.vy * 1.6);
    ctx.lineTo(t.x, t.y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

const ZAHL_ART = Object.freeze({
  schaden: { farbe: '#FF3B3B', groesse: 15 },
  kritisch: { farbe: PAL.orange, groesse: 22 },
  heilung: { farbe: PAL.limette, groesse: 15 },
  schild: { farbe: PAL.cyan, groesse: 15 },
});

/**
 * Schwebende Zahl mit dunkler Kontur (Kontrast gegen jeden Hintergrund).
 *
 * @param {{x:number,y:number,text:string,art:string,life:number}} z
 */
export function zeichneSchadenszahl(ctx, z) {
  const art = ZAHL_ART[z.art] ?? ZAHL_ART.schaden;
  ctx.save();
  ctx.globalAlpha = Math.min(1, z.life * 2.2);
  ctx.font = `900 ${art.groesse}px Impact, "Arial Black", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 4;
  ctx.strokeStyle = PAL.kontur;
  ctx.strokeText(z.text, z.x, z.y);
  ctx.fillStyle = art.farbe;
  ctx.fillText(z.text, z.x, z.y);
  ctx.restore();
}
