/**
 * Schnee und Hagel — reine Darstellung (Client-Optik), Zufall nur als feste Funktion von Zeit und Platznummer (`hash2`).
 * Berührt weder Engine noch RNG, Hash oder Replays.
 *
 * Schnee: fünf Tiefenlagen. Hinten sehr viele winzige Punkte, vorn wenige große, weiche Flocken (vorgemalte Sprites, ein
 * `drawImage` je Flocke) und ganz vorn ein paar riesige, blasse Kristallflocken. Je größer, desto schneller, wiegender und
 * heller im Vordergrund (Parallaxe).
 *
 * Hagel: harte, helle Körner mit dunklem Rand und Glanzpunkt, schnell und fast gerade, dazu vereinzelt sehr große Körner.
 * Am Boden: Aufschlagring, Splitter, Abpraller. Ein Korn ist durch `hagelKornLuft` (Platz in der Luft) und `maleHagelkorn`
 * (Aussehen) beschrieben; beides hängt nur an einer Position. Eine spätere Regelung kann ein Korn an Engine-Positionen
 * binden, ohne an der Darstellung etwas zu ändern.
 *
 * Dichte: `dichte` (Grafikstufe, `partikelDichte`) wirkt abgeschwächt (`^0,8`), damit auch Lite (0,5) noch dichten Schneefall
 * und deutlichen Hagel zeigt.
 *
 * @module wetterNiederschlag
 */
import { hash2 } from './stil.js';
import { waehleOberflaeche } from './wetterOberflaeche.js';

const ZWEI_PI = Math.PI * 2;

/** Wirksame Dichte: abgeschwächt, damit niedrige Grafikstufen nicht kahl wirken. */
export function niederschlagDichte(dichte) {
  return Math.pow(Math.max(0, dichte), 0.8);
}

// ---------------------------------------------------------------------------------------------------------------
// Sprites (einmal gemalt; ohne `document`, also in Tests, null — dann Ersatzzeichnung mit Kreisen)
// ---------------------------------------------------------------------------------------------------------------
const SPRITE = 64;
const sprites = {};

function spriteBauen(art) {
  if (typeof document === 'undefined') return null;
  try {
    const c = document.createElement('canvas');
    c.width = SPRITE; c.height = SPRITE;
    const cx = c.getContext('2d');
    const m = SPRITE / 2;
    const g = cx.createRadialGradient(m, m, 0, m, m, m);
    if (art === 'kristall') {
      g.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
      g.addColorStop(0.35, 'rgba(244, 250, 255, 0.4)');
      g.addColorStop(1, 'rgba(240, 248, 255, 0)');
    } else {
      g.addColorStop(0, 'rgba(255, 255, 255, 1)');
      g.addColorStop(0.45, 'rgba(250, 253, 255, 0.82)');
      g.addColorStop(0.8, 'rgba(222, 235, 250, 0.3)');
      g.addColorStop(1, 'rgba(220, 235, 250, 0)');
    }
    cx.fillStyle = g;
    cx.fillRect(0, 0, SPRITE, SPRITE);
    if (art === 'kristall') {
      cx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      cx.lineCap = 'round';
      for (let a = 0; a < 3; a += 1) {
        const w = (a * Math.PI) / 3 + 0.2;
        const dx = Math.cos(w); const dy = Math.sin(w);
        cx.lineWidth = 2.4;
        cx.beginPath(); cx.moveTo(m - dx * m * 0.8, m - dy * m * 0.8); cx.lineTo(m + dx * m * 0.8, m + dy * m * 0.8); cx.stroke();
        cx.lineWidth = 1.5;
        for (const s of [-1, 1]) for (const f of [0.35, 0.62]) {
          const px = m + dx * m * f * s; const py = m + dy * m * f * s;
          const ox = Math.cos(w + 1.05 * s) * m * 0.2; const oy = Math.sin(w + 1.05 * s) * m * 0.2;
          cx.beginPath(); cx.moveTo(px, py); cx.lineTo(px + ox, py + oy); cx.moveTo(px, py); cx.lineTo(px - oy * 0 + Math.cos(w - 1.05 * s) * m * 0.2, py + Math.sin(w - 1.05 * s) * m * 0.2); cx.stroke();
        }
      }
    }
    return c;
  } catch { return null; }
}

function sprite(art) {
  if (!(art in sprites)) sprites[art] = spriteBauen(art);
  return sprites[art];
}

// ---------------------------------------------------------------------------------------------------------------
// Schnee
// ---------------------------------------------------------------------------------------------------------------

/** Tiefenlagen von hinten nach vorn. `rad` in px bei 1920 Breite, `tempo` = Bildhöhen je Sekunde. */
const SCHNEE_LAGEN = Object.freeze([
  { n: 300, rad: 2.0, tempo: 0.04, alpha: 0.58, wiegen: 8, salz: 7, art: null },
  { n: 180, rad: 3.7, tempo: 0.066, alpha: 0.74, wiegen: 12, salz: 8, art: null },
  { n: 100, rad: 7.0, tempo: 0.1, alpha: 0.8, wiegen: 18, salz: 9, art: 'weich' },
  { n: 42, rad: 13, tempo: 0.15, alpha: 0.72, wiegen: 26, salz: 10, art: 'weich' },
  { n: 14, rad: 24, tempo: 0.21, alpha: 0.55, wiegen: 36, salz: 11, art: 'kristall' },
]);

/** Schnee in fünf Tiefen, Wiegen und Winddrift. Kleine Lagen in einem Pfad, große Flocken als Sprites. */
export function zeichneSchnee(p, st, dichte = 1) {
  if (!(st > 0.01)) return;
  const { ctx, b, h, t, m, still, schraeg } = p;
  const d = niederschlagDichte(dichte);
  ctx.save();
  for (const lage of SCHNEE_LAGEN) {
    const n = Math.round(lage.n * st * d);
    if (n <= 0) continue;
    const bild = lage.art ? sprite(lage.art) : null;
    const pfad = !bild;
    if (pfad) {
      ctx.fillStyle = `rgba(246, 250, 255, ${lage.alpha})`;
      ctx.beginPath();
    } else {
      ctx.globalAlpha = lage.alpha;
    }
    for (let i = 0; i < n; i += 1) {
      const tiefe = 0.75 + hash2(i, 1, lage.salz) * 0.5;
      const fall = still ? 0 : t * h * lage.tempo * tiefe;
      const rad = lage.rad * m * (0.7 + 0.6 * hash2(i, 5, lage.salz));
      const y = ((hash2(i, 2, lage.salz) * (h + 2 * rad)) + fall) % (h + 2 * rad) - rad;
      const wiegen = still ? 0 : Math.sin(t * (0.6 + hash2(i, 3, lage.salz)) + i) * lage.wiegen * m;
      const drift = still ? 0 : t * 60 * m * schraeg * 2.2 * (0.6 + lage.rad / 12);
      const x = (((hash2(i, 4, lage.salz) * b + wiegen + drift) % b) + b) % b;
      if (pfad) {
        ctx.moveTo(x + rad, y);
        ctx.arc(x, y, rad, 0, ZWEI_PI);
      } else {
        ctx.drawImage(bild, x - rad, y - rad, rad * 2, rad * 2);
      }
    }
    if (pfad) ctx.fill();
  }
  // Ohne Sprites (Tests): die großen Lagen als weiche Kreise.
  if (!sprite('weich')) {
    for (const lage of SCHNEE_LAGEN.filter(l => l.art)) {
      const n = Math.round(lage.n * st * d);
      if (n <= 0) continue;
      ctx.fillStyle = `rgba(246, 250, 255, ${lage.alpha * 0.8})`;
      ctx.beginPath();
      for (let i = 0; i < n; i += 1) {
        const rad = lage.rad * m * (0.7 + 0.6 * hash2(i, 5, lage.salz));
        const x = hash2(i, 4, lage.salz) * b; const y = hash2(i, 2, lage.salz) * h;
        ctx.moveTo(x + rad, y); ctx.arc(x, y, rad, 0, ZWEI_PI);
      }
      ctx.fill();
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------------------------------------------
// Hagel
// ---------------------------------------------------------------------------------------------------------------

const HAGEL_LAGEN = Object.freeze([
  { n: 90, rad: 2.3, tempo: 2.3, laenge: 18, alpha: 0.78, salz: 11 },
  { n: 50, rad: 3.7, tempo: 2.9, laenge: 28, alpha: 0.92, salz: 12 },
  { n: 20, rad: 5.5, tempo: 3.5, laenge: 42, alpha: 0.97, salz: 13 },
]);
/** Sehr große Körner: wenige, langsamer in der Bildhöhe (sie sind nah), dafür riesig. */
const HAGEL_GROSS = Object.freeze({ n: 3, rad: 12, tempo: 2.6, laenge: 60, salz: 14 });
/** Neigung der Fallbahn im Verhältnis zum Wind: Hagel fällt fast gerade. */
const HAGEL_NEIGUNG = 0.22;

/**
 * Platz eines Hagelkorns in der Luft zur Zeit `t` — reine Funktion von Zeit und Platznummer.
 * Später durch eine Engine-Position ersetzbar: `maleHagelkorn` braucht nur (x, y, Radius).
 * @returns {{x:number, y:number, rad:number, dx:number, dy:number}} Mittelpunkt, Radius, Richtung der Bahn je Pixel Fall
 */
export function hagelKornLuft(i, lage, p) {
  const { b, h, t, m, still, schraeg } = p;
  const sl = schraeg * HAGEL_NEIGUNG;
  const lauf = 0.9 + 0.2 * hash2(i, 6, lage.salz);
  const rad = lage.rad * m * (0.85 + 0.3 * hash2(i, 5, lage.salz));
  const hh = h + 120 * m;
  const yAbs = hash2(i, 2, lage.salz) * hh + (still ? 0 : t * h * lage.tempo * lauf);
  const y = (yAbs % hh) - 60 * m;
  const x = (((hash2(i, 4, lage.salz) * (b + 200 * m) + sl * yAbs) % (b + 200 * m)) + (b + 200 * m)) % (b + 200 * m) - 100 * m;
  return { x, y, rad, dx: sl, dy: 1 };
}

/**
 * Ein Hagelkorn malen: weicher Schein, Kugel (weiß nach Eisblau), dunkler Rand, Glanzpunkt. Nur Aussehen, keine Zeit.
 * @param {number} rad Radius in px
 * @param {number} [alpha=1]
 */
export function maleHagelkorn(ctx, x, y, rad, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = 0.35 * alpha;
  ctx.fillStyle = 'rgba(214, 236, 255, 1)';
  ctx.beginPath(); ctx.arc(x, y, rad * 1.7, 0, ZWEI_PI); ctx.fill();
  const g = ctx.createRadialGradient(x - rad * 0.35, y - rad * 0.4, rad * 0.1, x, y, rad);
  g.addColorStop(0, 'rgba(255, 255, 255, 1)');
  g.addColorStop(0.6, 'rgba(238, 248, 255, 1)');
  g.addColorStop(1, 'rgba(176, 208, 236, 1)');
  ctx.globalAlpha = alpha;
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, rad, 0, ZWEI_PI); ctx.fill();
  ctx.strokeStyle = 'rgba(70, 104, 148, 0.75)';
  ctx.lineWidth = Math.max(1, rad * 0.16);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.beginPath(); ctx.arc(x - rad * 0.32, y - rad * 0.36, Math.max(0.8, rad * 0.24), 0, ZWEI_PI); ctx.fill();
  ctx.restore();
}

/** Hagel in der Luft: schnelle, fast gerade Körner in drei Tiefen mit Schlieren, dazu wenige sehr große Körner. */
export function zeichneHagelLuft(p, st, dichte = 1) {
  if (!(st > 0.01)) return;
  const { ctx, m } = p;
  const d = niederschlagDichte(dichte);
  ctx.save();
  ctx.lineCap = 'round';
  for (const lage of HAGEL_LAGEN) {
    const n = Math.round(lage.n * st * d);
    if (n <= 0) continue;
    const kornen = [];
    for (let i = 0; i < n; i += 1) kornen.push(hagelKornLuft(i, lage, p));
    // 1) Schlieren (Bewegungsunschärfe), 2) Körner, 3) dunkler Rand, 4) Glanzpunkte: je ein Pfad.
    ctx.strokeStyle = `rgba(222, 240, 255, ${0.34 * lage.alpha})`;
    ctx.lineWidth = lage.rad * m * 1.1;
    ctx.beginPath();
    for (const k of kornen) {
      const l = lage.laenge * m;
      ctx.moveTo(k.x - k.dx * l, k.y - l);
      ctx.lineTo(k.x, k.y);
    }
    ctx.stroke();
    ctx.fillStyle = `rgba(248, 252, 255, ${lage.alpha})`;
    ctx.beginPath();
    for (const k of kornen) { ctx.moveTo(k.x + k.rad, k.y); ctx.arc(k.x, k.y, k.rad, 0, ZWEI_PI); }
    ctx.fill();
    ctx.strokeStyle = `rgba(80, 112, 154, ${0.62 * lage.alpha})`;
    ctx.lineWidth = Math.max(1, 1.1 * m);
    ctx.beginPath();
    for (const k of kornen) { ctx.moveTo(k.x + k.rad, k.y); ctx.arc(k.x, k.y, k.rad, 0, ZWEI_PI); }
    ctx.stroke();
  }
  // Große Körner einzeln: Schlieren, dann Korn.
  const ng = st > 0.3 ? Math.max(1, Math.round(HAGEL_GROSS.n * st * d)) : 0;
  for (let i = 0; i < ng; i += 1) {
    const k = hagelKornLuft(i, HAGEL_GROSS, p);
    const l = HAGEL_GROSS.laenge * m;
    ctx.strokeStyle = 'rgba(226, 242, 255, 0.3)';
    ctx.lineWidth = k.rad * 1.2;
    ctx.beginPath(); ctx.moveTo(k.x - k.dx * l, k.y - l); ctx.lineTo(k.x, k.y); ctx.stroke();
    maleHagelkorn(ctx, k.x, k.y, k.rad, 0.95);
  }
  ctx.restore();
}

/**
 * Hagel schlägt auf: ein Korn fällt schnell und fast gerade, prallt zweimal ab (Höhe 30 und 12 px, kleiner werdend), beim
 * Aufschlag Ring, Splitterfächer und fliegende Eissplitter. Jedes 6. Korn ist groß, jedes 17. riesig (stärkerer Ring, mehr
 * Splitter). Eine Funktion der Zeit je Platznummer — kein gespeicherter Zustand.
 */
export function zeichneHagelAufprall(ctx, ob, sicht, t, st, dichte = 1, schraeg = 0) {
  const anzahl = Math.round(34 * st * niederschlagDichte(dichte));
  if (anzahl <= 0 || !ob) return;
  ctx.save();
  const periode = 1.0;
  const fallAnteil = 0.3;
  for (let i = 0; i < anzahl; i += 1) {
    const takt = Math.floor(t / periode + hash2(i, 1, 51));
    const ph = (t / periode + hash2(i, 1, 51)) - takt;
    const o = waehleOberflaeche(ob, hash2(i, takt, 52), hash2(i, takt, 53), sicht, true);
    if (!o) continue;
    const g = i % 17 === 0 ? 3.4 : (i % 6 === 0 ? 2.0 : 1);
    const k = Math.pow(g, 0.7);
    const rad = 2.9 * g;
    if (ph < fallAnteil) {
      const f = 1 - ph / fallAnteil; // 1 oben, 0 am Boden
      const hoeheF = 380 * f;
      const x = o.x - schraeg * HAGEL_NEIGUNG * hoeheF;
      const y = o.y - hoeheF;
      ctx.strokeStyle = 'rgba(222, 240, 255, 0.4)';
      ctx.lineWidth = rad * 1.1;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x - schraeg * HAGEL_NEIGUNG * 30 * k, y - 30 * k);
      ctx.lineTo(x, y);
      ctx.stroke();
      if (g > 1.5) maleHagelkorn(ctx, x, y, rad, 1);
      else {
        ctx.fillStyle = 'rgba(248, 252, 255, 0.98)';
        ctx.beginPath(); ctx.arc(x, y, rad, 0, ZWEI_PI); ctx.fill();
        ctx.strokeStyle = 'rgba(80, 112, 154, 0.6)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      continue;
    }
    const u = (ph - fallAnteil) / (1 - fallAnteil); // 0 bis 1 nach dem Aufschlag
    const richt = hash2(i, takt, 54) < 0.5 ? -1 : 1;
    const u1 = Math.min(1, u / 0.5);
    const u2 = Math.max(0, (u - 0.5) / 0.35);
    const hoch = u < 0.5 ? 30 * k * 4 * u1 * (1 - u1) : (u < 0.85 ? 12 * k * 4 * u2 * (1 - u2) : 0);
    const x = o.x + richt * u * 26 * k;
    const y = o.y - hoch - rad * 0.7;
    const blass = u > 0.8 ? 1 - (u - 0.8) / 0.2 : 1;
    if (g > 1.5) maleHagelkorn(ctx, x, y, rad, blass);
    else {
      ctx.globalAlpha = blass;
      ctx.fillStyle = 'rgba(248, 252, 255, 0.98)';
      ctx.beginPath(); ctx.arc(x, y, rad, 0, ZWEI_PI); ctx.fill();
      ctx.strokeStyle = 'rgba(80, 112, 154, 0.6)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    if (u < 0.3) {
      const a = u / 0.3;
      ctx.globalAlpha = 1 - a;
      ctx.strokeStyle = 'rgba(236, 248, 255, 0.95)';
      ctx.lineWidth = 1.6 * Math.sqrt(g);
      ctx.beginPath();
      ctx.ellipse(o.x, o.y, 4 + a * 18 * k, 1.4 + a * 4.2 * k, 0, 0, ZWEI_PI);
      ctx.stroke();
      if (a > 0.15) { // zweiter, schwächerer Ring
        ctx.globalAlpha = (1 - a) * 0.6;
        ctx.beginPath();
        ctx.ellipse(o.x, o.y, 2 + (a - 0.15) * 14 * k, 0.8 + (a - 0.15) * 3 * k, 0, 0, ZWEI_PI);
        ctx.stroke();
      }
      // Splitterfächer: kurze, harte Strahlen nach oben.
      ctx.globalAlpha = 1 - a;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      const strahlen = g > 1.5 ? 9 : 6;
      for (let s = 0; s < strahlen; s += 1) {
        const w = -0.25 - (s / (strahlen - 1)) * (Math.PI - 0.5) + (hash2(i, s, 55) - 0.5) * 0.2;
        ctx.moveTo(o.x + Math.cos(w) * (a * 6 * k + 2), o.y + Math.sin(w) * (a * 6 * k + 2));
        ctx.lineTo(o.x + Math.cos(w) * (a * 20 * k + 4), o.y + Math.sin(w) * (a * 20 * k + 4));
      }
      ctx.stroke();
      // Eissplitter als Punkte, fliegen ballistisch.
      ctx.fillStyle = 'rgba(244, 251, 255, 0.95)';
      ctx.beginPath();
      for (let s = 0; s < strahlen - 1; s += 1) {
        const w = -0.35 - (s / (strahlen - 2)) * (Math.PI - 0.7);
        const v = 18 + 14 * hash2(i, s, 56);
        const sx = o.x + Math.cos(w) * a * v * k; const sy = o.y + Math.sin(w) * a * v * k + a * a * 16 * k;
        const sr = 0.9 + 0.8 * hash2(i, s, 57);
        ctx.moveTo(sx + sr, sy); ctx.arc(sx, sy, sr, 0, ZWEI_PI);
      }
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}
