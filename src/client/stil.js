/**
 * Gemeinsame Bausteine der Comic-Darstellung: Palette und deterministisches Rauschen.
 *
 * Alles hier ist reine Darstellung. Es gibt KEIN `Math.random` und kein
 * `Date.now`: Rauschen entsteht aus Position und Seed, damit dieselbe Karte
 * immer dasselbe Bild ergibt (Replay, Online-Abgleich, Screenshots).
 *
 * @module stil
 */

/** Die Farbpalette des Entwurfs (Auftraggeber): dunkle Flächen, Neon-Akzente. */
export const PAL = Object.freeze({
  bg0: '#0D0F12',
  bg1: '#1B1F24',
  bg2: '#2B3138',
  bg3: '#3E444D',
  limette: '#7CFC00',
  orange: '#FFB800',
  rotorange: '#FF4D00',
  cyan: '#00E0FF',
  violett: '#884DFF',
  text: '#D9DEE7',
  kontur: '#07090B',
});

/**
 * Ganzzahl-Hash von (x, y, seed) auf [0, 1).
 *
 * @param {number} x
 * @param {number} y
 * @param {number} [seed]
 * @returns {number}
 */
export function hash2(x, y, seed = 0) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/**
 * Kleiner Zufallsgenerator mit festem Seed (mulberry32).
 *
 * @param {number} seed
 * @returns {() => number} liefert Werte in [0, 1)
 */
export function folge(seed) {
  let s = (seed | 0) + 0x6d2b79f5;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Eindimensionales Wertrauschen (glatt) auf [0, 1). */
export function rauschen1(x, seed = 0) {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return hash2(i, 0, seed) * (1 - u) + hash2(i + 1, 0, seed) * u;
}

/** Mischt zwei RGB-Tripel; `t` = 0 ergibt `a`, `t` = 1 ergibt `b`. */
export function mischeRgb(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

/** RGB-Tripel als CSS-Farbe. */
export function css([r, g, b], alpha = 1) {
  return alpha >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Hex-Farbe (`#rrggbb`) als RGB-Tripel. */
export function hexRgb(hex) {
  const wert = parseInt(hex.slice(1, 7), 16);
  return [(wert >> 16) & 255, (wert >> 8) & 255, wert & 255];
}

/**
 * Wie „grün" ist eine Bodenfarbe (0 bis 1)?
 *
 * Auf Schnee, Sand oder Basalt soll das Moos nicht neongrün leuchten; es wird
 * zur Bodenfarbe hin gezogen. Auf grünem Boden bleibt es voll.
 */
export function gruenAnteil(oberflaeche) {
  const [r, g, b] = oberflaeche;
  const vorsprung = g - Math.max(r, b);
  return Math.max(0.5, Math.min(1, 0.55 + vorsprung / 50));
}
