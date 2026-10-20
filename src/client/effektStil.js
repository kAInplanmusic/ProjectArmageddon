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
import { ZAHL_FAMILIE } from '../shared/config/schaden.js';
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
  ...Object.fromEntries(Object.entries(ZAHL_FAMILIE).map(([familie, v]) => [`schaden-${familie}`, { farbe: v.farbe, groesse: 15 }])),
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

/** Linienzug aus Punkten (geschlossen, wenn der letzte dem ersten gleicht). */
function linienzug(ctx, punkte) {
  ctx.beginPath();
  ctx.moveTo(punkte[0].x, punkte[0].y);
  for (let i = 1; i < punkte.length; i += 1) ctx.lineTo(punkte[i].x, punkte[i].y);
}

/**
 * Rußschatten und Brandrand eines Kraters in die Geländeebene (nur dort, wo
 * Gelände steht: `source-atop`). Der Umriss ist die wahre Form des Kraters
 * (`kraterUmriss`), nicht ein Kreis. Von außen nach innen: weiter Rußschatten,
 * angesengter Saum, verkohlte Kante; dazu kurze Rußzungen, die in den Boden
 * ziehen. Die Zungen entstehen aus `hash2` über den Ort, nie aus Zufall.
 *
 * @param {Array<{x:number,y:number}>} umriss
 */
export function zeichneKraterRuss(ctx, umriss, x, y, seed = 0) {
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const stufen = [
    ['rgba(12, 9, 7, 0.16)', 22],
    ['rgba(18, 12, 8, 0.26)', 13],
    ['rgba(231, 111, 81, 0.22)', 7],
    ['rgba(8, 6, 5, 0.82)', 3],
  ];
  for (const [farbe, breite] of stufen) {
    ctx.strokeStyle = farbe;
    ctx.lineWidth = breite;
    linienzug(ctx, umriss);
    ctx.stroke();
  }
  const sx = Math.round(x);
  const sy = Math.round(y);
  const n = umriss.length - 1;
  const zungen = Math.min(10, 4 + Math.floor(n / 8));
  ctx.strokeStyle = 'rgba(8, 6, 5, 0.55)';
  ctx.lineWidth = 1.4;
  for (let i = 0; i < zungen; i += 1) {
    const p = umriss[Math.floor(hash2(sx + i, sy, seed + 11) * n) % n];
    const w = Math.atan2(p.y - y, p.x - x);
    const laenge = 5 + hash2(sx, sy + i, seed + 13) * 11;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + Math.cos(w) * laenge, p.y + Math.sin(w) * laenge);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Narbe eines Kraters (bleibt über dem Gelände stehen): ein angesengter Ton und
 * ein dunkler Saum. Mit `umriss` folgt sie der wahren Kraterform, sonst (Altfassung)
 * dem Kreis.
 */
export function zeichneNarbe(ctx, narbe) {
  const bahnFuer = zugabe => {
    if (narbe.umriss) { linienzug(ctx, narbe.umriss); return; }
    ctx.beginPath();
    ctx.arc(narbe.x, narbe.y, narbe.radius + zugabe, 0, Math.PI * 2);
  };
  ctx.globalAlpha = 0.18;
  ctx.strokeStyle = '#e76f51';
  ctx.lineWidth = 5;
  bahnFuer(4);
  ctx.stroke();
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 2;
  bahnFuer(1.5);
  ctx.stroke();
}

/** Trümmerstücke: kleine gedrehte Erdbrocken, die zum Ende hin verblassen. */
export function zeichneTruemmer(ctx, truemmer, toene) {
  for (const t of truemmer) {
    ctx.globalAlpha = Math.min(1, t.life * 1.6);
    ctx.fillStyle = toene[t.ton % toene.length];
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.rotate(t.winkel);
    ctx.fillRect(-t.groesse / 2, -t.groesse / 2, t.groesse, t.groesse * 0.8);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

/**
 * Mündungsblitz bzw. Wirkungsglanz einer gehaltenen Waffe.
 *
 * Der Ursprung liegt am Mündungsanker, +x zeigt in Waffenrichtung. Form und
 * Größe kommen aus der Kategorie (`waffenAnimation.js`), die Farbe aus dem
 * Manifest (`flashColor`). Nur Pfade und Füllungen, keine Allokation je Bild.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {'kegel'|'stern'|'ring'|'funke'} form
 * @param {number} g - Größe in Weltpixeln
 * @param {number} a - Stärke 0..1 (1 = frisch)
 * @param {string} farbe - Blitzfarbe der Waffe
 */
export function zeichneMuendungsblitz(ctx, form, g, a, farbe) {
  if (a <= 0 || g <= 0) return;
  const wachs = 1 + (1 - a) * 0.7;
  const l = g * wachs;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = farbe;
  ctx.strokeStyle = farbe;
  switch (form) {
    case 'kegel': {
      ctx.globalAlpha = 0.3 * a;
      ctx.beginPath();
      ctx.arc(l * 0.12, 0, l * 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.75 * a;
      ctx.beginPath();
      ctx.moveTo(-1, -l * 0.3);
      ctx.quadraticCurveTo(l * 0.45, -l * 0.14, l, 0);
      ctx.quadraticCurveTo(l * 0.45, l * 0.14, -1, l * 0.3);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 0.9 * a;
      ctx.fillStyle = '#fffbe6';
      ctx.beginPath();
      ctx.moveTo(-1, -l * 0.13);
      ctx.lineTo(l * 0.62, 0);
      ctx.lineTo(-1, l * 0.13);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, g * 0.16 * (0.6 + a * 0.4), 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'stern': {
      ctx.globalAlpha = 0.8 * a;
      ctx.beginPath();
      for (let i = 0; i < 12; i += 1) {
        const r = (i % 2 === 0 ? l : l * 0.36) * (i === 0 ? 1.3 : 1);
        const w = (i / 12) * Math.PI * 2;
        if (i === 0) ctx.moveTo(Math.cos(w) * r, Math.sin(w) * r);
        else ctx.lineTo(Math.cos(w) * r, Math.sin(w) * r);
      }
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 0.95 * a;
      ctx.fillStyle = '#fffbe6';
      ctx.beginPath();
      ctx.arc(0, 0, g * 0.2, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'ring': {
      ctx.globalAlpha = 0.85 * a;
      ctx.lineWidth = 0.8 + 2.2 * a;
      ctx.beginPath();
      ctx.arc(0, 0, g * (0.3 + 0.7 * (1 - a)), 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.9 * a;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, g * 0.2 * a + 1, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    default: {
      // funke: kurzer Fächer aus drei Strahlen und ein Kern.
      ctx.globalAlpha = 0.9 * a;
      ctx.lineWidth = 1.2 + a;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = -1; i <= 1; i += 1) {
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(i * 0.55) * l, Math.sin(i * 0.55) * l);
      }
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, g * 0.15 + 0.5, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }
  ctx.restore();
}

/**
 * Ein Flugobjekt als Sprite: um die Mitte gedreht, mit weichem Glanz in der
 * Blitzfarbe dahinter.
 *
 * @param {object} sp - Eintrag aus `waffenSprites.js` (`projektil`, `glanz`)
 * @param {number} winkel - Zeichenwinkel (Flugrichtung plus Eigenrotation)
 * @param {number} groesse - Kantenlänge der Zelle in Weltpixeln
 */
export function zeichneGeschossSprite(ctx, sp, x, y, winkel, groesse) {
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = 0.55;
  ctx.drawImage(sp.glanz, -groesse * 0.7, -groesse * 0.7, groesse * 1.4, groesse * 1.4);
  ctx.globalAlpha = 1;
  ctx.rotate(winkel);
  ctx.drawImage(sp.projektil, -groesse / 2, -groesse / 2, groesse, groesse);
  ctx.restore();
}

/**
 * Kurzer Schweif aus den letzten Positionen (Ringpuffer), nach hinten dünner
 * und durchsichtiger, in der Blitzfarbe der Waffe.
 *
 * @param {import('./waffenAnimation.js').SchweifRing} ring
 * @param {string} farbe
 * @param {number} breite - Breite am Geschoss in Weltpixeln
 */
export function zeichneSchweif(ctx, ring, farbe, breite) {
  const n = ring.anzahl;
  if (n < 2) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = farbe;
  for (let i = 1; i < n; i += 1) {
    const anteil = i / (n - 1);
    ctx.globalAlpha = 0.12 + 0.6 * anteil;
    ctx.lineWidth = breite * (0.25 + 0.75 * anteil);
    ctx.beginPath();
    ctx.moveTo(ring.xAn(i - 1), ring.yAn(i - 1));
    ctx.lineTo(ring.xAn(i), ring.yAn(i));
    ctx.stroke();
  }
  ctx.restore();
}
