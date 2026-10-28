/**
 * Tageszeit und Wetter zum Wählen — reine Darstellung über dem fertigen Bild.
 *
 * Die gemalten Kulissen haben ihre eigene Stimmung (`wetterLicht.js` leitet das Wetter aus dem Beschreibungstext ab). Hier kann der
 * Spieler beides überschreiben:
 *
 *   Zeit    automatisch · Tag · Morgen · Abend · Nacht · Herbstgold   (Farbstimmung über dem ganzen Bild, Sterne, Laub)
 *   Wetter  automatisch · klar · Sonne · Regen · Sturm · Schnee · Nebel · Laubfall
 *
 * Alles folgt Zeit und Position (`hash2`), nichts würfelt; „reduzierte Bewegung" zeigt stehende Bilder. Kein Einfluss auf Maske,
 * Hash, Replay oder Netz.
 *
 * @module stimmung
 */
import { hash2 } from './stil.js';

/** Wahl der Tageszeit/Stimmung (Schlüssel → Beschriftung im Menü). */
export const ZEITEN = Object.freeze({
  auto: 'automatisch (wie die Kulisse)',
  tag: 'Tag',
  morgen: 'Morgen',
  abend: 'Abend',
  nacht: 'Nacht',
  herbst: 'Herbstgold',
});

/** Wahl des Wetters (Schlüssel → Beschriftung im Menü). */
export const WETTER_WAHL = Object.freeze({
  auto: 'automatisch (wie die Kulisse)',
  klar: 'klar',
  sonne: 'Sonne',
  regen: 'Regen',
  sturm: 'Sturm',
  schnee: 'Schnee',
  nebel: 'Nebel',
  laub: 'Laubfall',
});

/** Unbekannte Werte fallen auf „automatisch". */
export function normalisiereWahl(wert, liste) {
  return typeof wert === 'string' && Object.hasOwn(liste, wert) ? wert : 'auto';
}

/**
 * Überschreibt das aus der Kulisse abgeleitete Wetter.
 * @param {{regen:number, schnee:number, gewitter:boolean, nebel:number, lichter:boolean}} basis aus `wetterAus`
 * @param {string} [wetter='auto']
 * @param {string} [zeit='auto'] Herbstgold bringt bei „automatisch" Laub mit
 * @returns {{regen:number, schnee:number, gewitter:boolean, nebel:number, lichter:boolean, sonne:number, laub:number, wind:number}}
 */
export function wetterMit(basis, wetter = 'auto', zeit = 'auto') {
  const aus = { ...basis, sonne: 0, laub: 0, wind: 0 };
  const w = normalisiereWahl(wetter, WETTER_WAHL);
  const z = normalisiereWahl(zeit, ZEITEN);
  if (w !== 'auto') {
    Object.assign(aus, { regen: 0, schnee: 0, gewitter: false, nebel: 0 });
    if (w === 'sonne') aus.sonne = 1;
    if (w === 'regen') aus.regen = 0.7;
    if (w === 'sturm') Object.assign(aus, { regen: 1, gewitter: true, wind: 1 });
    if (w === 'schnee') aus.schnee = 0.8;
    if (w === 'nebel') aus.nebel = 0.8;
    if (w === 'laub') aus.laub = 0.8;
  } else if (z === 'herbst') {
    aus.laub = 0.55;
  }
  if (aus.gewitter && aus.wind === 0) aus.wind = 0.6;
  return aus;
}

/**
 * Farbstimmung je Tageszeit: Schichten, die der Reihe nach über das ganze Bild gelegt werden
 * (`modus`: Canvas-Mischmodus, `farbe`: RGB, `alpha`, optional `verlauf`: 'oben' = nach unten auslaufend).
 */
export const STIMMUNG_SCHICHTEN = Object.freeze({
  tag: Object.freeze([{ modus: 'lighter', farbe: [255, 246, 225], alpha: 0.05 }]),
  morgen: Object.freeze([
    { modus: 'multiply', farbe: [255, 214, 190], alpha: 0.28 },
    { modus: 'source-over', farbe: [255, 168, 120], alpha: 0.24, verlauf: 'oben' },
  ]),
  abend: Object.freeze([
    { modus: 'multiply', farbe: [255, 156, 98], alpha: 0.44 },
    { modus: 'source-over', farbe: [255, 110, 40], alpha: 0.16, verlauf: 'unten' },
  ]),
  nacht: Object.freeze([
    { modus: 'multiply', farbe: [70, 92, 160], alpha: 0.62 },
    { modus: 'source-over', farbe: [4, 8, 26], alpha: 0.16 },
  ]),
  herbst: Object.freeze([
    { modus: 'multiply', farbe: [255, 188, 104], alpha: 0.44 },
    { modus: 'soft-light', farbe: [255, 170, 40], alpha: 0.3 },
  ]),
});

const LAUB_FARBEN = Object.freeze(['rgb(204, 112, 28)', 'rgb(226, 172, 44)', 'rgb(168, 62, 30)', 'rgb(190, 132, 36)']);

/**
 * Zeichnet Farbstimmung, Sterne (Nacht), Sonnenstrahlen und Laubfall über das fertige Bild (Bildschirmkoordinaten).
 * @param {object} r Renderer (`ctx`, `width`, `height`, `time`, `reducedMotion`, `stimmung`)
 * @param {{sonne:number, laub:number}} w Wetter nach `wetterMit`
 * @param {number} [dichte=1] Grafikstufe
 */
export function zeichneStimmung(r, w, dichte = 1) {
  const ctx = r.ctx;
  if (!ctx) return;
  const zeit = normalisiereWahl(r.stimmung?.zeit, ZEITEN);
  const b = r.width;
  const h = r.height;
  const t = (r.time ?? 0) / 60;
  const still = r.reducedMotion;
  const m = b / 1920;

  const schichten = STIMMUNG_SCHICHTEN[zeit];
  if (schichten) {
    ctx.save();
    ctx.resetTransform();
    const cb = ctx.canvas?.width ?? b;
    const ch = ctx.canvas?.height ?? h;
    for (const s of schichten) {
      ctx.globalCompositeOperation = s.modus;
      const [fr, fg, fb] = s.farbe;
      if (s.verlauf) {
        const g = ctx.createLinearGradient(0, 0, 0, ch);
        const oben = s.verlauf === 'oben';
        g.addColorStop(0, `rgba(${fr}, ${fg}, ${fb}, ${oben ? s.alpha : 0})`);
        g.addColorStop(oben ? 0.65 : 0.4, `rgba(${fr}, ${fg}, ${fb}, ${oben ? 0 : 0})`);
        g.addColorStop(1, `rgba(${fr}, ${fg}, ${fb}, ${oben ? 0 : s.alpha})`);
        ctx.fillStyle = g;
      } else {
        ctx.fillStyle = `rgba(${fr}, ${fg}, ${fb}, ${s.alpha})`;
      }
      ctx.fillRect(0, 0, cb, ch);
    }
    ctx.restore();
  }

  // Sterne bei Nacht: wenige, funkelnd, nur im oberen Drittel.
  if (zeit === 'nacht') {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const n = Math.round(70 * dichte);
    for (let i = 0; i < n; i += 1) {
      const funkeln = still ? 0.8 : 0.55 + 0.45 * Math.sin(t * (1 + hash2(i, 3, 8) * 2.5) + i);
      ctx.fillStyle = `rgba(235, 242, 255, ${0.5 * funkeln})`;
      ctx.fillRect(hash2(i, 1, 8) * b, hash2(i, 2, 8) * h * 0.38, (1 + hash2(i, 4, 8) * 1.4) * m, (1 + hash2(i, 4, 8) * 1.4) * m);
    }
    ctx.restore();
  }

  // Sonne: Schein oben links und breite Lichtbahnen, die langsam atmen.
  if (w?.sonne > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const sx = b * 0.16;
    const sy = -h * 0.06;
    const glanz = ctx.createRadialGradient(sx, sy, 0, sx, sy, b * 0.42);
    glanz.addColorStop(0, 'rgba(255, 238, 190, 0.34)');
    glanz.addColorStop(0.4, 'rgba(255, 226, 160, 0.1)');
    glanz.addColorStop(1, 'rgba(255, 220, 150, 0)');
    ctx.fillStyle = glanz;
    ctx.fillRect(0, 0, b, h);
    for (let i = 0; i < 6; i += 1) {
      const atem = still ? 1 : 0.7 + 0.3 * Math.sin(t * 0.35 + i * 1.3);
      const winkel = 0.35 + i * 0.17;
      const breite = (0.05 + hash2(i, 1, 12) * 0.05) * b;
      ctx.fillStyle = `rgba(255, 240, 200, ${0.05 * atem})`;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + Math.cos(winkel) * b * 1.5 - breite, sy + Math.sin(winkel) * b * 1.5);
      ctx.lineTo(sx + Math.cos(winkel) * b * 1.5 + breite, sy + Math.sin(winkel) * b * 1.5);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // Laubfall: goldene und rote Blätter, die trudeln.
  if (w?.laub > 0) {
    const n = Math.round(80 * w.laub * dichte);
    ctx.save();
    for (let i = 0; i < n; i += 1) {
      const tiefe = 0.5 + hash2(i, 1, 14) * 0.5;
      const fall = still ? 0 : t * h * 0.09 * tiefe;
      const y = ((hash2(i, 2, 14) * h) + fall) % (h + 30) - 15;
      const wiegen = still ? 0 : Math.sin(t * (0.8 + hash2(i, 3, 14)) + i) * 36 * m;
      const x = hash2(i, 4, 14) * b + wiegen;
      const drehen = still ? hash2(i, 5, 14) * 6.28 : t * (1 + hash2(i, 5, 14) * 2) + i;
      ctx.fillStyle = LAUB_FARBEN[i % LAUB_FARBEN.length];
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.ellipse(x, y, (3 + tiefe * 5) * m, (1.6 + tiefe * 2.4) * m, drehen, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
