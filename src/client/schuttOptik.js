/**
 * Optik der Zerstörung Fassung 4: Schutt und Staub nach Material, Brandspuren, Risse,
 * fliegende Partikel-Zellen und das Nachziehen der Geländeebene für Zustandsereignisse.
 *
 * Die Simulation (`engine/zerstoerung.js`) entscheidet, welche Zellen verschwinden, fliegen und
 * sich wieder absetzen (`terrain_removed`, `terrain_crumble`, `terrain_added`, `terrain_slumped`).
 * Hier steht nur, wie es aussieht — nichts davon fließt in einen Hash. Alles entsteht aus Ort und
 * Seed (`hash2`), nie aus Zufall.
 *
 * Brandspuren sind reine Optik-Textur: Sie werden mit `source-atop` in die Geländeebene gemalt
 * (nur dort, wo Gelände steht) und ändern weder Maske noch Zellen.
 *
 * @module schuttOptik
 */
import { hash2 } from './stil.js';
import { SCHUTT_GRAVITATION, SCHUTT_LEBEN } from '../shared/config/zerstoerung.js';

const SCHWARZ_BRAUN = 'rgba(8, 6, 5, 0.8)';

/**
 * Farben von Schutt, Trümmern und Staub nach Bodenart (`bodenArt` aus `gelaendeStil.js`).
 *
 * @param {'gras'|'schnee'|'sand'|'fels'|'asche'} art
 * @param {{deep:number[]}} palette
 * @returns {{truemmer:string[], schutt:string[], staub:string, staubFaktor:number}}
 */
export function materialStil(art, palette) {
  const [r, g, b] = palette?.deep ?? [92, 70, 52];
  switch (art) {
    case 'schnee':
      return { truemmer: ['#f4f8ff', '#d4e4f6', '#a9c2e0'], schutt: ['#ffffff', '#dce9f7', '#b9cfe8', '#8fa9c8'], staub: 'rgb(236, 243, 252)', staubFaktor: 1.35 };
    case 'sand':
      return { truemmer: ['#d9bc78', '#c4a062', '#a98448'], schutt: ['#e2c88a', '#cfae6e', '#b8935a', '#9c7a44'], staub: 'rgb(222, 196, 140)', staubFaktor: 1.6 };
    case 'fels':
      return { truemmer: ['#6f7378', '#8a8e92', '#4a4d52'], schutt: ['#8a8e92', '#6f7378', '#5a5d62', '#a2a5a8'], staub: 'rgb(150, 150, 148)', staubFaktor: 1 };
    case 'asche':
      return { truemmer: ['#3a3836', '#555250', '#222120'], schutt: ['#4a4745', '#363432', '#5e5b58', '#262423'], staub: 'rgb(88, 84, 80)', staubFaktor: 1.1 };
    default:
      return {
        truemmer: [`rgb(${r}, ${g}, ${b})`, `rgb(${r + 24}, ${g + 18}, ${b + 12})`, '#3b2f26'],
        schutt: [`rgb(${r + 12}, ${g + 9}, ${b + 6})`, `rgb(${r + 30}, ${g + 22}, ${b + 14})`, `rgb(${r - 10}, ${g - 8}, ${b - 6})`, '#3b2f26'],
        staub: `rgb(${r}, ${g}, ${b})`,
        staubFaktor: 1,
      };
  }
}

/** Rand- und Glutfarben der Brandspur nach Bodenart. */
function brandFarben(art) {
  switch (art) {
    case 'sand': return { rand: 'rgba(120, 214, 196, 0.5)', glanz: 'rgba(235, 255, 248, 0.5)', glut: 'rgba(255, 190, 90, 0.3)', russ: 0.42 }; // Glas
    case 'schnee': return { rand: 'rgba(52, 84, 128, 0.55)', glanz: 'rgba(190, 220, 248, 0.45)', glut: 'rgba(120, 170, 220, 0.25)', russ: 0.3 }; // Schmelzwasser
    case 'fels':
    case 'asche': return { rand: 'rgba(255, 112, 36, 0.5)', glanz: 'rgba(255, 190, 90, 0.4)', glut: 'rgba(255, 90, 30, 0.45)', russ: 0.6 }; // Lavaadern
    default: return { rand: 'rgba(255, 128, 44, 0.42)', glanz: 'rgba(255, 210, 120, 0.3)', glut: 'rgba(255, 96, 32, 0.38)', russ: 0.58 }; // verbrannte Erde
  }
}

function pfad(ctx, umriss) {
  ctx.beginPath();
  ctx.moveTo(umriss[0].x, umriss[0].y);
  for (let i = 1; i < umriss.length; i += 1) ctx.lineTo(umriss[i].x, umriss[i].y);
}

/**
 * Brandspur um einen Krater (Feuer, Plasma, Energie): verbrannte Erde, dazu je nach Boden
 * Glut-Adern (Fels), Glasur (Sand), Schmelzrand (Schnee) oder angesengter Saum (Gras).
 * Wird in die Geländeebene gemalt und bleibt dort stehen.
 *
 * @param {CanvasRenderingContext2D} ctx - Kontext der Geländeebene
 * @param {Array<{x:number,y:number}>} umriss - wahre Kraterform
 */
export function zeichneBrandspur(ctx, umriss, x, y, radius, bodenArt, seed = 0) {
  const f = brandFarben(bodenArt);
  const aussen = radius * 1.9;
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const verlauf = ctx.createRadialGradient(x, y, radius * 0.5, x, y, aussen);
  verlauf.addColorStop(0, `rgba(10, 8, 6, ${f.russ + 0.1})`);
  verlauf.addColorStop(0.55, `rgba(14, 10, 8, ${f.russ * 0.55})`);
  verlauf.addColorStop(1, 'rgba(14, 10, 8, 0)');
  ctx.fillStyle = verlauf;
  ctx.fillRect(x - aussen, y - aussen, aussen * 2, aussen * 2);
  // Glut bzw. Glasur am Rand: breit und weich, dann schmal und hell.
  ctx.strokeStyle = f.glut;
  ctx.lineWidth = 11;
  pfad(ctx, umriss);
  ctx.stroke();
  ctx.strokeStyle = f.rand;
  ctx.lineWidth = 4;
  pfad(ctx, umriss);
  ctx.stroke();
  ctx.strokeStyle = f.glanz;
  ctx.lineWidth = 1.4;
  pfad(ctx, umriss);
  ctx.stroke();
  // Adern: kurze Strahlen, die vom Rand in den Boden ziehen (Lava, Sprünge in der Glasur).
  const sx = Math.round(x);
  const sy = Math.round(y);
  const n = umriss.length - 1;
  const adern = Math.min(14, 5 + Math.floor(radius / 8));
  ctx.strokeStyle = f.rand;
  ctx.lineWidth = 1.6;
  for (let i = 0; i < adern; i += 1) {
    const p = umriss[Math.floor(hash2(sx + i, sy, seed + 41) * n) % n];
    const dx = p.x - x;
    const dy = p.y - y;
    const len = Math.hypot(dx, dy) || 1;
    const lang = 6 + hash2(sx, sy + i, seed + 43) * radius * 0.5;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + dx / len * lang, p.y + dy / len * lang + 2);
    ctx.stroke();
  }
  ctx.restore();
}

/** Wand eines Bohrtunnels: dunkler Innenring mit Schleifspuren (nur Optik). */
export function zeichneBohrwand(ctx, umriss) {
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(6, 5, 4, 0.7)';
  ctx.lineWidth = 7;
  pfad(ctx, umriss);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(200, 196, 188, 0.28)';
  ctx.lineWidth = 1.2;
  pfad(ctx, umriss);
  ctx.stroke();
  ctx.restore();
}

/** Risse um den Einschlag eines Erdbebens: strahlenförmig, nach außen dünner. */
export function zeichneBebenRisse(ctx, x, y, radius, seed = 0) {
  const sx = Math.round(x);
  const sy = Math.round(y);
  const anzahl = 7 + Math.min(7, Math.floor(radius / 14));
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(8, 6, 5, 0.75)';
  for (let i = 0; i < anzahl; i += 1) {
    const w = (i + hash2(sx, sy + i, seed + 51) * 0.7) / anzahl * Math.PI * 2;
    let px = x + Math.cos(w) * radius * 0.9;
    let py = y + Math.sin(w) * radius * 0.9;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(px, py);
    const teile = 3 + Math.floor(hash2(sx + i, sy, seed + 53) * 3);
    for (let s = 0; s < teile; s += 1) {
      const wa = w + (hash2(sx + s, sy + i, seed + 55) - 0.5) * 0.9;
      const l = radius * (0.22 + hash2(sx + s, sy - i, seed + 57) * 0.22);
      px += Math.cos(wa) * l;
      py += Math.sin(wa) * l;
      ctx.lineTo(px, py);
      ctx.lineWidth = Math.max(0.8, 2.2 - s * 0.5);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/* ------------------------------------------------ Risse und Geröll nach dem Einschlag */

/** Kleinster Kraterradius, an dem Risse und Geröll zu sehen sind (kleinere Löcher bleiben sauber). */
export const RISS_MIN_RADIUS = 14;

/**
 * Haarrisse, die vom Kraterrand ins Gestein laufen — Linienzüge von je 3 bis 4 Punkten. Nur Optik:
 * Ort und Seed bestimmen alles (`hash2`), der Client rechnet auf jedem Gerät dasselbe.
 * Die Risse beginnen am Rand der wahren Kraterform und laufen nach außen und eher abwärts.
 *
 * @param {Array<{x:number,y:number}>} umriss - wahre Kraterform (geschlossener Linienzug)
 * @returns {Array<Array<{x:number,y:number}>>}
 */
export function kraterRisse(umriss, x, y, radius, seed = 0) {
  if (!umriss?.length || !(radius >= RISS_MIN_RADIUS)) return [];
  const anzahl = Math.min(9, 3 + Math.floor(radius / 12));
  const risse = [];
  const sx = Math.round(x);
  const sy = Math.round(y);
  for (let i = 0; i < anzahl; i += 1) {
    const start = umriss[Math.floor(hash2(sx + i, sy, seed + 71) * (umriss.length - 1))];
    let dx = start.x - x;
    let dy = start.y - y;
    const l = Math.hypot(dx, dy) || 1;
    dx /= l;
    dy = dy / l + 0.35;
    const punkte = [{ x: start.x, y: start.y }];
    let px = start.x;
    let py = start.y;
    const teile = 3 + Math.floor(hash2(sx, sy + i, seed + 73) * 2);
    for (let t = 0; t < teile; t += 1) {
      const schlenker = (hash2(sx + t, sy - i, seed + 75) - 0.5) * 1.1;
      const laenge = radius * (0.16 + hash2(sx - t, sy + i, seed + 77) * 0.16);
      px += (dx * Math.cos(schlenker) - dy * Math.sin(schlenker)) * laenge;
      py += (dx * Math.sin(schlenker) + dy * Math.cos(schlenker)) * laenge;
      punkte.push({ x: px, y: py });
    }
    risse.push(punkte);
  }
  return risse;
}

/**
 * Geröllzellen: kleine Brocken (1 bis 3 px), die rund um die UNTERE Kraterhälfte im Gestein liegen,
 * wo das Material nachgesackt wäre. Jede Zelle hat eine ganzzahlige Lage und einen Farbindex `ton`.
 * Die Zellen werden nur mit `source-atop` gemalt: Wo kein Gelände steht, entsteht kein Pixel.
 *
 * @returns {Array<{x:number,y:number,w:number,ton:number}>}
 */
export function geroellZellen(umriss, x, y, radius, seed = 0) {
  if (!umriss?.length || !(radius >= RISS_MIN_RADIUS)) return [];
  const anzahl = Math.min(26, Math.round(radius * 0.7));
  const sx = Math.round(x);
  const sy = Math.round(y);
  const zellen = [];
  for (let i = 0; i < anzahl; i += 1) {
    const punkt = umriss[Math.floor(hash2(sx + i, sy, seed + 81) * (umriss.length - 1))];
    if (punkt.y < y - radius * 0.2) continue;
    const dx = punkt.x - x;
    const dy = punkt.y - y;
    const l = Math.hypot(dx, dy) || 1;
    const tiefe = 1 + hash2(sx, sy + i, seed + 83) * 5;
    zellen.push({
      x: Math.round(punkt.x + (dx / l) * tiefe),
      y: Math.round(punkt.y + (dy / l) * tiefe),
      w: 1 + Math.floor(hash2(sx - i, sy, seed + 85) * 3),
      ton: Math.floor(hash2(sx + i, sy + i, seed + 87) * 4),
    });
  }
  return zellen;
}

/** Zeichnet Risse (dunkel, mit hellem Nachbarstrich) in die Geländeebene; nur dort, wo Gelände steht. */
export function zeichneKraterRisse(ctx, risse) {
  if (!risse.length) return;
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const rissLinie of risse) {
    for (const [farbe, breite, versatz] of [['rgba(255, 255, 255, 0.14)', 1, 1], ['rgba(8, 6, 5, 0.7)', 1.4, 0]]) {
      ctx.strokeStyle = farbe;
      ctx.lineWidth = breite;
      ctx.beginPath();
      ctx.moveTo(rissLinie[0].x, rissLinie[0].y + versatz);
      for (let i = 1; i < rissLinie.length; i += 1) ctx.lineTo(rissLinie[i].x, rissLinie[i].y + versatz);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Zeichnet die Geröllzellen in den Farben des Materials (`materialStil(...).schutt`); nur auf Gelände. */
export function zeichneGeroell(ctx, zellen, farben) {
  if (!zellen.length) return;
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  for (const z of zellen) {
    ctx.fillStyle = farben[z.ton % farben.length];
    ctx.fillRect(z.x, z.y, z.w, z.w);
  }
  ctx.restore();
}

/* ------------------------------------------------ Geländeebene nachziehen */

/** Löscht Spaltenläufe `[x, y0, y1, ...]` aus der Ebene und zieht an den neuen Kanten eine dunkle Linie nach. */
export function loescheLaeufe(ctx, runs) {
  for (let i = 0; i + 2 < runs.length; i += 3) ctx.clearRect(runs[i], runs[i + 1], 1, runs[i + 2] - runs[i + 1] + 1);
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = SCHWARZ_BRAUN;
  for (let i = 0; i + 2 < runs.length; i += 3) {
    const x = runs[i];
    const y0 = runs[i + 1];
    const laenge = runs[i + 2] - y0 + 1;
    ctx.fillRect(x - 1, y0, 1, laenge);
    ctx.fillRect(x + 1, y0, 1, laenge);
    ctx.fillRect(x, y0 - 1, 1, 1);
    ctx.fillRect(x, y0 + laenge, 1, 1);
  }
  ctx.restore();
}

/** Setzt die abgesetzten Schuttzellen als einzelne Pixel in der Farbe des Materials (`ton` aus dem Ort). */
export function setzeSchuttZellen(ctx, zellen, farben, seed = 0) {
  for (let i = 0; i + 1 < zellen.length; i += 2) {
    const x = zellen[i];
    const y = zellen[i + 1];
    ctx.fillStyle = farben[Math.floor(hash2(x, y, seed + 61) * farben.length) % farben.length];
    ctx.fillRect(x, y, 1, 1);
  }
}

/** Setzrutsch: Das Pixel (x1, y1) wandert samt Farbe nach (x2, y2), in der Reihenfolge der Simulation. */
export function verschiebeZellen(ctx, quelle, zuege) {
  for (let i = 0; i + 3 < zuege.length; i += 4) {
    ctx.drawImage(quelle, zuege[i], zuege[i + 1], 1, 1, zuege[i + 2], zuege[i + 3], 1, 1);
    ctx.clearRect(zuege[i], zuege[i + 1], 1, 1);
  }
}

/* ------------------------------------------------- fliegende Partikel-Zellen */

/**
 * Fliegende Zellen aus `terrain_crumble.teile` (`[x, y, vx, vy, ...]`) mit derselben Schwerkraft
 * wie die Simulation. Die Anzeige prüft nur die Bitmap: Trifft eine Zelle Gelände, ist ihr Flug zu Ende
 * (das Absetzen selbst meldet `terrain_added`).
 */
export function erzeugeFlugSchutt(teile, farben, seed = 0) {
  const liste = [];
  for (let i = 0; i + 3 < teile.length; i += 4) {
    liste.push({
      x: teile[i], y: teile[i + 1], vx: teile[i + 2], vy: teile[i + 3], alter: 0,
      farbe: farben[Math.floor(hash2(Math.floor(teile[i]), Math.floor(teile[i + 1]), seed + 71) * farben.length) % farben.length],
    });
  }
  return liste;
}

/** Ein Bild: Schwerkraft, Flug, Ende bei Gelände, Kartenrand oder Lebensdauer. */
export function schreiteFlugSchutt(liste, bitmap, breite, hoehe) {
  const uebrig = [];
  for (const p of liste) {
    const vy = p.vy + SCHUTT_GRAVITATION;
    const x = p.x + p.vx;
    const y = p.y + vy;
    const alter = p.alter + 1;
    if (alter >= SCHUTT_LEBEN || x < 0 || x >= breite || y >= hoehe) continue;
    if (bitmap && y >= 0 && bitmap[Math.floor(y) * breite + Math.floor(x)]) continue;
    uebrig.push({ ...p, x, y, vy, alter });
  }
  return uebrig;
}

export function zeichneFlugSchutt(ctx, liste) {
  for (const p of liste) {
    ctx.fillStyle = p.farbe;
    ctx.fillRect(Math.floor(p.x) - 0.5, Math.floor(p.y) - 0.5, 2, 2);
  }
}
