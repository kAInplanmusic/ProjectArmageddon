/**
 * Klangprofile: reine Daten und reine Rechnung, ohne AudioContext.
 *
 * Jeder Klang ist eine Liste von Schichten (`rausch`, `ton`, `knistern`) mit
 * Zahlen; `klangSynth.js` baut daraus Knoten. Dieses Modul entscheidet nur,
 * WELCHES Profil zu einer Waffe, einem Einschlag oder einem Treffer gehört, wie
 * laut und wie weit links/rechts ein Klang liegt und wann eine Stimme gekappt wird.
 * So lässt sich alles ohne Browser prüfen.
 *
 * Aufbau der Schichten (Zeiten in Sekunden, Frequenzen in Hz):
 *
 *   rausch    Rauschen (farbe weiss|braun) durch einen Filter (`filter`, `f0`, optional
 *             `f1` als Ziel eines Gleitens über `sweep`), optional `hp` (zusätzlicher
 *             Hochpass), Hüllkurve `an` (Anstieg) und `ab` (Abfall bis −80 dB)
 *   ton       Oszillator (`welle`), `f0` → `f1` über `gleit`, `partiale` [[Verhältnis, Pegel]],
 *             `vibrato` {hz, tiefe}, `zittern` {hz, tiefe} (Amplitudenmodulation)
 *   knistern  `n` kurze Rauschstöße im Fenster `fenster`, Mittenfrequenz zufällig
 *             zwischen `fmin` und `fmax` (Feuerknistern, Eis, Schutt)
 *
 * Profil: `bus`, `pegel`, `nachhall` (Anteil an den gemeinsamen Hall), `streuung`
 * (Zufallsbreite je Klang für Tonhöhe, Filter, Pegel) und `schichten`.
 *
 * @module klangProfile
 */

export const KATEGORIEN = Object.freeze([
  'melee', 'ranged', 'heavy_ranged', 'elemental', 'magic', 'tech', 'utility', 'ultimate',
]);

export const BUSSE = Object.freeze(['schuss', 'treffer', 'umgebung', 'ui']);

/** Höchstzahl gleichzeitiger Stimmen. */
export const STIMMEN_MAX = 24;

/** Längste erlaubte Klangdauer inklusive Hall (s). */
export const DAUER_MAX = 3;

/** Länge der Hall-Impulsantwort (s). */
export const HALL_DAUER = 1.4;

const R = o => ({
  art: 'rausch', farbe: 'weiss', filter: 'bandpass', f0: 1000, q: 0.8, start: 0, an: 0.002, ab: 0.1, pegel: 0.5, ...o,
});
const T = o => ({
  art: 'ton', welle: 'sine', f0: 100, start: 0, an: 0.002, ab: 0.1, pegel: 0.5, ...o,
});
const K = o => ({
  art: 'knistern', farbe: 'weiss', n: 5, fenster: 0.3, fmin: 1000, fmax: 4000, q: 4, start: 0, ab: 0.04, pegel: 0.3, ...o,
});

const STREU = Object.freeze({ ton: 0.06, filter: 0.12, pegel: 0.08 });

const P = (bus, pegel, nachhall, schichten, streuung = STREU) => Object.freeze({
  bus, pegel, nachhall, streuung, schichten: Object.freeze(schichten.map(Object.freeze)),
});

/** Ein Echo einer Basisschicht: später, leiser. */
const echo = (start, pegel) => R({
  farbe: 'braun', filter: 'lowpass', f0: 500, f1: 60, start, an: 0.01, ab: 0.5, pegel,
});

/* ------------------------------------------------------------------ Schüsse */

export const SCHUSS_PROFILE = Object.freeze({
  pistole: P('schuss', 0.85, 0.3, [
    R({ filter: 'highpass', f0: 2200, q: 0.7, an: 0.001, ab: 0.05, pegel: 0.9 }),
    R({ f0: 1400, f1: 500, q: 1, an: 0.001, ab: 0.12, pegel: 0.6 }),
    T({ f0: 220, f1: 70, gleit: 0.06, an: 0.001, ab: 0.12, pegel: 0.7 }),
  ]),
  gewehr: P('schuss', 0.9, 0.5, [
    R({ filter: 'highpass', f0: 3500, an: 0.001, ab: 0.04, pegel: 0.9 }),
    R({ filter: 'lowpass', f0: 900, f1: 250, q: 0.7, an: 0.002, ab: 0.3, pegel: 0.7 }),
    T({ f0: 150, f1: 55, gleit: 0.12, ab: 0.2, pegel: 0.8 }),
  ]),
  schwer: P('schuss', 1, 0.6, [
    R({ farbe: 'braun', filter: 'lowpass', f0: 500, f1: 80, sweep: 0.5, an: 0.004, ab: 0.7, pegel: 0.9 }),
    T({ f0: 90, f1: 38, gleit: 0.4, ab: 0.6, pegel: 1 }),
    T({ welle: 'triangle', f0: 180, f1: 60, gleit: 0.1, ab: 0.25, pegel: 0.5 }),
    R({ filter: 'highpass', f0: 1500, an: 0.001, ab: 0.06, pegel: 0.5 }),
    T({ f0: 210, an: 0.01, ab: 0.5, pegel: 0.15, partiale: [[2.7, 0.5]] }),
  ]),
  rakete: P('schuss', 0.9, 0.3, [
    T({ f0: 150, f1: 55, gleit: 0.15, ab: 0.18, pegel: 0.8 }),
    R({ f0: 1200, f1: 5200, sweep: 0.5, q: 1.2, start: 0.03, an: 0.05, ab: 0.6, pegel: 0.55 }),
    R({ farbe: 'braun', filter: 'lowpass', f0: 700, f1: 200, ab: 0.3, pegel: 0.4 }),
  ]),
  feuer: P('schuss', 0.85, 0.2, [
    R({ f0: 300, f1: 2000, sweep: 0.25, q: 0.9, an: 0.08, ab: 0.5, pegel: 0.8 }),
    K({ n: 6, fenster: 0.5, fmin: 1500, fmax: 6000, q: 4, ab: 0.03, pegel: 0.5 }),
    T({ f0: 90, f1: 60, gleit: 0.3, ab: 0.4, pegel: 0.4 }),
  ]),
  eis: P('schuss', 0.8, 0.45, [
    K({ n: 5, fenster: 0.15, fmin: 3500, fmax: 9000, q: 14, ab: 0.05, pegel: 0.5 }),
    T({ welle: 'triangle', f0: 2400, f1: 1800, gleit: 0.15, ab: 0.15, pegel: 0.25 }),
    R({ filter: 'highpass', f0: 5000, an: 0.001, ab: 0.08, pegel: 0.6 }),
    T({ f0: 1200, an: 0.002, ab: 0.35, pegel: 0.25, partiale: [[2.4, 0.5], [4.1, 0.3]] }),
  ]),
  blitz: P('schuss', 0.85, 0.25, [
    T({ welle: 'sawtooth', f0: 2600, f1: 160, gleit: 0.12, ab: 0.2, pegel: 0.5, zittern: { hz: 90, tiefe: 0.5 } }),
    R({ filter: 'highpass', f0: 2500, an: 0.001, ab: 0.12, pegel: 0.7 }),
    K({ n: 4, fenster: 0.2, fmin: 800, fmax: 5000, q: 2, ab: 0.03, pegel: 0.5 }),
    T({ f0: 70, f1: 50, gleit: 0.2, ab: 0.25, pegel: 0.5 }),
  ]),
  magie: P('schuss', 0.7, 0.55, [
    T({
      f0: 660, f1: 1980, gleit: 0.5, an: 0.05, ab: 0.7, pegel: 0.4, vibrato: { hz: 6, tiefe: 0.01 },
      partiale: [[1.003, 0.6], [0.997, 0.6], [1.5, 0.5], [2, 0.35], [3, 0.2]],
    }),
    T({ welle: 'triangle', f0: 990, f1: 2640, gleit: 0.5, start: 0.08, an: 0.05, ab: 0.6, pegel: 0.25 }),
    R({ filter: 'highpass', f0: 6000, an: 0.1, ab: 0.7, pegel: 0.12 }),
  ]),
  laser: P('schuss', 0.7, 0.15, [
    T({ welle: 'sawtooth', f0: 4200, f1: 500, gleit: 0.25, ab: 0.3, pegel: 0.45 }),
    T({ welle: 'square', f0: 3000, f1: 600, gleit: 0.2, ab: 0.2, pegel: 0.25 }),
    R({ filter: 'highpass', f0: 5000, an: 0.001, ab: 0.06, pegel: 0.6 }),
  ]),
  strahl: P('schuss', 0.65, 0.2, [
    T({ welle: 'sawtooth', f0: 180, f1: 560, gleit: 0.5, an: 0.04, ab: 0.65, pegel: 0.35, zittern: { hz: 40, tiefe: 0.4 } }),
    T({ f0: 1400, f1: 2600, gleit: 0.3, an: 0.04, ab: 0.4, pegel: 0.25 }),
    R({ f0: 3000, q: 3, an: 0.05, ab: 0.5, pegel: 0.25 }),
  ]),
  nahkampf: P('schuss', 0.85, 0.08, [
    R({ f0: 700, f1: 3000, sweep: 0.18, q: 0.8, an: 0.04, ab: 0.2, pegel: 1 }),
    T({ f0: 180, f1: 60, gleit: 0.1, start: 0.17, ab: 0.12, pegel: 0.4 }),
    R({ f0: 1500, q: 0.8, start: 0.17, an: 0.001, ab: 0.08, pegel: 0.8 }),
  ]),
  wurf: P('schuss', 0.6, 0.05, [
    R({ f0: 250, f1: 900, sweep: 0.3, q: 0.6, an: 0.08, ab: 0.3, pegel: 0.9 }),
    R({ filter: 'highpass', f0: 3000, an: 0.001, ab: 0.02, pegel: 0.4 }),
    T({ f0: 130, f1: 90, gleit: 0.1, ab: 0.1, pegel: 0.45 }),
  ]),
  selbst: P('schuss', 0.6, 0.3, [
    T({ f0: 1319, an: 0.02, ab: 0.3, pegel: 0.3 }),
    T({ f0: 2093, start: 0.1, an: 0.02, ab: 0.4, pegel: 0.3 }),
    T({ f0: 4186, start: 0.1, an: 0.02, ab: 0.25, pegel: 0.15 }),
    R({ filter: 'highpass', f0: 6000, an: 0.1, ab: 0.3, pegel: 0.05 }),
  ]),
  ultimate: P('schuss', 1, 0.7, [
    T({ f0: 70, f1: 30, gleit: 1.2, ab: 1.4, pegel: 0.7 }),
    R({ farbe: 'braun', filter: 'lowpass', f0: 900, f1: 60, sweep: 1.2, an: 0.01, ab: 1.3, pegel: 0.6 }),
    T({
      welle: 'sawtooth', f0: 110, f1: 880, gleit: 0.9, an: 0.3, ab: 1.0, pegel: 0.18,
      partiale: [[1.5, 0.6], [2, 0.4]],
    }),
    T({ f0: 440, f1: 1320, gleit: 0.5, start: 0.1, an: 0.05, ab: 0.8, pegel: 0.5, partiale: [[1.003, 0.6], [0.997, 0.6], [2, 0.35]] }),
    R({ filter: 'highpass', f0: 2500, an: 0.001, ab: 0.1, pegel: 0.9 }),
  ]),
});

/* -------------------------------------------------------- Einschläge, Treffer, Welt */

const ex = (pegel, hall, schichten) => P('treffer', pegel, hall, schichten, { ton: 0.04, filter: 0.1, pegel: 0.06 });
const schutt = o => K({ n: 8, fenster: 0.5, fmin: 300, fmax: 1500, q: 1.5, start: 0.15, ab: 0.06, pegel: 0.25, farbe: 'braun', ...o });

export const EREIGNIS_PROFILE = Object.freeze({
  explosion_klein: ex(0.9, 0.2, [
    R({ farbe: 'braun', filter: 'lowpass', f0: 1800, f1: 200, sweep: 0.25, an: 0.006, ab: 0.3, pegel: 0.9 }),
    T({ f0: 120, f1: 45, gleit: 0.25, ab: 0.3, pegel: 0.8 }),
    R({ filter: 'highpass', f0: 2500, an: 0.001, ab: 0.05, pegel: 0.4 }),
  ]),
  explosion_mittel: ex(1, 0.3, [
    R({ farbe: 'braun', filter: 'lowpass', f0: 1500, f1: 120, sweep: 0.4, an: 0.006, ab: 0.55, pegel: 0.9 }),
    T({ f0: 100, f1: 38, gleit: 0.4, ab: 0.55, pegel: 0.9 }),
    R({ filter: 'highpass', f0: 2500, an: 0.001, ab: 0.06, pegel: 0.4 }),
    schutt({}),
  ]),
  explosion_gross: ex(1, 0.5, [
    R({ farbe: 'braun', filter: 'lowpass', f0: 1400, f1: 60, sweep: 0.7, an: 0.008, ab: 0.9, pegel: 0.95 }),
    T({ f0: 90, f1: 30, gleit: 0.7, ab: 0.9, pegel: 1 }),
    R({ filter: 'highpass', f0: 2000, an: 0.001, ab: 0.08, pegel: 0.4 }),
    schutt({ n: 10, fenster: 0.7 }),
    echo(0.28, 0.35),
  ]),
  explosion_riesig: ex(1, 0.65, [
    R({ farbe: 'braun', filter: 'lowpass', f0: 1200, f1: 50, sweep: 0.9, an: 0.01, ab: 1.2, pegel: 1 }),
    T({ f0: 70, f1: 24, gleit: 1, ab: 1.3, pegel: 1 }),
    R({ filter: 'highpass', f0: 1800, an: 0.001, ab: 0.1, pegel: 0.4 }),
    schutt({ n: 12, fenster: 0.9 }),
    echo(0.3, 0.4),
    echo(0.62, 0.25),
  ]),
  einschlag_erde: ex(0.8, 0.1, [
    R({ farbe: 'braun', filter: 'lowpass', f0: 700, f1: 150, an: 0.002, ab: 0.15, pegel: 0.8 }),
    T({ f0: 100, f1: 55, gleit: 0.1, ab: 0.12, pegel: 0.6 }),
    K({ n: 3, fenster: 0.1, fmin: 600, fmax: 2500, q: 2, start: 0.02, ab: 0.04, pegel: 0.2 }),
  ]),
  einschlag_fels: ex(0.8, 0.15, [
    R({ f0: 2000, q: 2, an: 0.001, ab: 0.08, pegel: 0.7 }),
    T({ f0: 260, f1: 120, gleit: 0.08, ab: 0.1, pegel: 0.4 }),
    K({ n: 3, fenster: 0.12, fmin: 1500, fmax: 5000, q: 6, ab: 0.03, pegel: 0.35 }),
  ]),
  /* Metallplatte getroffen (Stoffkarte, Stoff `metall`): heller Klirr mit langem Nachklang statt Dumpfem. */
  einschlag_metall: ex(0.85, 0.2, [
    R({ f0: 3200, q: 3, an: 0.001, ab: 0.06, pegel: 0.6 }),
    T({ f0: 880, f1: 760, gleit: 0.2, partiale: [[1, 1], [2.76, 0.5], [5.4, 0.3]], ab: 0.5, pegel: 0.45 }),
    K({ n: 4, fenster: 0.2, fmin: 3000, fmax: 8000, q: 10, ab: 0.03, pegel: 0.3 }),
  ]),
  explosion_metall: ex(1, 0.35, [
    R({ farbe: 'braun', filter: 'lowpass', f0: 1600, f1: 160, sweep: 0.3, an: 0.004, ab: 0.4, pegel: 0.8 }),
    T({ f0: 110, f1: 55, gleit: 0.3, ab: 0.35, pegel: 0.7 }),
    T({ f0: 700, f1: 620, gleit: 0.4, partiale: [[1, 1], [2.76, 0.5], [5.4, 0.3]], ab: 0.7, pegel: 0.4 }),
    R({ filter: 'highpass', f0: 3000, an: 0.001, ab: 0.08, pegel: 0.45 }),
  ]),
  platscher_klein: P('treffer', 0.8, 0.1, [
    R({ f0: 600, f1: 2400, sweep: 0.2, an: 0.02, ab: 0.25, pegel: 0.6 }),
    T({ f0: 300, f1: 900, gleit: 0.08, an: 0.005, ab: 0.1, pegel: 0.3 }),
    K({ n: 4, fenster: 0.3, fmin: 1500, fmax: 4000, q: 8, start: 0.05, ab: 0.05, pegel: 0.2 }),
  ]),
  platscher_gross: P('treffer', 0.95, 0.25, [
    R({ f0: 400, f1: 1800, sweep: 0.4, an: 0.03, ab: 0.6, pegel: 0.8 }),
    T({ f0: 100, f1: 50, gleit: 0.3, ab: 0.4, pegel: 0.8 }),
    K({ n: 8, fenster: 0.8, fmin: 1500, fmax: 4000, q: 8, start: 0.08, ab: 0.05, pegel: 0.25 }),
  ]),
  treffer_figur_klein: P('treffer', 0.7, 0.05, [
    R({ f0: 1100, q: 1.2, an: 0.001, ab: 0.08, pegel: 0.6 }),
    T({ f0: 180, f1: 110, gleit: 0.06, ab: 0.08, pegel: 0.35 }),
  ]),
  treffer_figur_mittel: P('treffer', 0.8, 0.08, [
    R({ f0: 800, q: 1, an: 0.001, ab: 0.12, pegel: 0.7 }),
    T({ f0: 150, f1: 70, gleit: 0.1, ab: 0.15, pegel: 0.6 }),
  ]),
  treffer_figur_gross: P('treffer', 0.95, 0.12, [
    R({ f0: 700, q: 1, an: 0.001, ab: 0.15, pegel: 0.7 }),
    R({ farbe: 'braun', filter: 'lowpass', f0: 500, f1: 120, an: 0.002, ab: 0.3, pegel: 0.6 }),
    T({ f0: 130, f1: 45, gleit: 0.2, ab: 0.35, pegel: 0.8 }),
  ]),
  treffer_krit: P('treffer', 0.95, 0.2, [
    R({ f0: 700, q: 1, an: 0.001, ab: 0.15, pegel: 0.7 }),
    R({ farbe: 'braun', filter: 'lowpass', f0: 500, f1: 120, an: 0.002, ab: 0.3, pegel: 0.6 }),
    T({ f0: 130, f1: 45, gleit: 0.2, ab: 0.35, pegel: 0.8 }),
    T({ f0: 2200, an: 0.001, ab: 0.25, pegel: 0.25, partiale: [[1.5, 0.5]] }),
    R({ filter: 'highpass', f0: 4000, an: 0.001, ab: 0.06, pegel: 0.35 }),
  ]),
  treffer_selbst: P('treffer', 0.8, 0.05, [
    R({ farbe: 'braun', filter: 'lowpass', f0: 400, an: 0.002, ab: 0.2, pegel: 0.7 }),
    T({ welle: 'triangle', f0: 120, f1: 70, gleit: 0.15, ab: 0.2, pegel: 0.6 }),
    T({ f0: 400, f1: 250, gleit: 0.2, ab: 0.2, pegel: 0.2 }),
  ]),
  landung_figur: P('umgebung', 0.6, 0.03, [
    R({ farbe: 'braun', filter: 'lowpass', f0: 500, f1: 150, an: 0.002, ab: 0.1, pegel: 0.5 }),
    T({ f0: 90, f1: 55, gleit: 0.08, ab: 0.1, pegel: 0.4 }),
  ]),
  aufprall_hart: P('treffer', 0.9, 0.1, [
    R({ f0: 700, q: 1, an: 0.001, ab: 0.1, pegel: 0.6 }),
    T({ f0: 110, f1: 45, gleit: 0.2, ab: 0.25, pegel: 0.8 }),
    R({ farbe: 'braun', filter: 'lowpass', f0: 400, f1: 100, ab: 0.2, pegel: 0.5 }),
  ]),
  landung_insel: P('umgebung', 1, 0.3, [
    R({ farbe: 'braun', filter: 'lowpass', f0: 600, f1: 60, sweep: 0.6, an: 0.005, ab: 0.8, pegel: 0.9 }),
    T({ f0: 70, f1: 32, gleit: 0.5, ab: 0.7, pegel: 0.9 }),
    K({ n: 12, fenster: 0.6, fmin: 200, fmax: 1200, q: 1.5, start: 0.05, ab: 0.07, pegel: 0.3, farbe: 'braun' }),
  ]),
  truemmer: P('umgebung', 0.7, 0.1, [
    K({ n: 14, fenster: 0.7, fmin: 250, fmax: 2500, q: 2, ab: 0.06, pegel: 0.35 }),
    R({ farbe: 'braun', filter: 'lowpass', f0: 400, an: 0.1, ab: 0.6, pegel: 0.3 }),
  ]),
  tod: P('treffer', 0.7, 0.1, [
    T({ f0: 500, f1: 110, gleit: 0.5, an: 0.005, ab: 0.55, pegel: 0.3 }),
    R({ f0: 1200, f1: 300, sweep: 0.4, ab: 0.4, pegel: 0.25 }),
    T({ f0: 90, f1: 50, gleit: 0.1, start: 0.5, ab: 0.15, pegel: 0.5 }),
  ]),
  kiste: P('umgebung', 0.7, 0.15, [
    T({ welle: 'triangle', f0: 660, an: 0.005, ab: 0.15, pegel: 0.3 }),
    T({ welle: 'triangle', f0: 990, start: 0.08, an: 0.005, ab: 0.25, pegel: 0.3 }),
    R({ filter: 'highpass', f0: 3000, an: 0.001, ab: 0.04, pegel: 0.25 }),
    T({ f0: 220, f1: 160, gleit: 0.05, ab: 0.06, pegel: 0.4 }),
  ]),
  /* Tier-NPCs: Günther (Bellen, Winseln, Fressen) und Cookie (Miauen in drei Stufen, Schockwelle). */
  bellen: P('umgebung', 0.8, 0.12, [0, 0.16].flatMap(start => [
    T({ welle: 'sawtooth', f0: 720, f1: 380, gleit: 0.07, start, an: 0.004, ab: 0.09, pegel: 0.35, partiale: [[2, 0.3]] }),
    R({ f0: 1400, q: 1.2, start, an: 0.002, ab: 0.06, pegel: 0.3 }),
  ]), { ton: 0.08, filter: 0.1, pegel: 0.1 }),
  winseln: P('umgebung', 0.6, 0.15, [
    T({ f0: 900, f1: 1500, gleit: 0.25, an: 0.04, ab: 0.35, pegel: 0.3, vibrato: { hz: 7, tiefe: 30 } }),
    T({ f0: 1500, f1: 800, gleit: 0.3, start: 0.3, an: 0.02, ab: 0.35, pegel: 0.25, vibrato: { hz: 7, tiefe: 25 } }),
  ], { ton: 0.05, filter: 0.05, pegel: 0.05 }),
  fressen: P('umgebung', 0.6, 0.05, [
    K({ n: 9, fenster: 0.7, fmin: 600, fmax: 3000, q: 3, ab: 0.05, pegel: 0.45 }),
    R({ farbe: 'braun', filter: 'lowpass', f0: 600, an: 0.02, ab: 0.4, pegel: 0.2 }),
  ]),
  miau_leise: P('umgebung', 0.35, 0.2, [
    T({ welle: 'triangle', f0: 620, f1: 880, gleit: 0.18, an: 0.03, ab: 0.3, pegel: 0.35, partiale: [[2, 0.25]] }),
    T({ welle: 'triangle', f0: 880, f1: 560, gleit: 0.2, start: 0.18, an: 0.02, ab: 0.28, pegel: 0.3 }),
  ], { ton: 0.05, filter: 0.05, pegel: 0.05 }),
  miau_laut: P('umgebung', 0.8, 0.15, [
    T({ welle: 'sawtooth', f0: 520, f1: 980, gleit: 0.16, an: 0.02, ab: 0.34, pegel: 0.35, partiale: [[2, 0.4]], vibrato: { hz: 6, tiefe: 20 } }),
    T({ welle: 'sawtooth', f0: 980, f1: 480, gleit: 0.3, start: 0.16, an: 0.02, ab: 0.4, pegel: 0.35 }),
    R({ f0: 1800, q: 2, an: 0.02, ab: 0.4, pegel: 0.12 }),
  ], { ton: 0.05, filter: 0.05, pegel: 0.05 }),
  miau_wut: P('umgebung', 1, 0.2, [
    T({ welle: 'sawtooth', f0: 380, f1: 1100, gleit: 0.12, an: 0.01, ab: 0.5, pegel: 0.45, partiale: [[2, 0.5], [3, 0.3]], zittern: { hz: 28, tiefe: 0.4 } }),
    T({ welle: 'square', f0: 1100, f1: 300, gleit: 0.4, start: 0.12, an: 0.01, ab: 0.55, pegel: 0.3 }),
    R({ f0: 2200, q: 1, an: 0.01, ab: 0.6, pegel: 0.3 }),
  ], { ton: 0.06, filter: 0.06, pegel: 0.06 }),
  schockwelle: P('umgebung', 1, 0.5, [
    T({ f0: 90, f1: 28, gleit: 1.0, an: 0.01, ab: 1.1, pegel: 0.9 }),
    R({ farbe: 'braun', filter: 'lowpass', f0: 1200, f1: 60, sweep: 1.2, an: 0.01, ab: 1.2, pegel: 0.8 }),
    T({ welle: 'sine', f0: 1760, f1: 440, gleit: 0.8, start: 0.05, an: 0.01, ab: 0.9, pegel: 0.15 }),
  ]),
  /* Feuer und Lava (Ereigniskatalog: lava_ausbruch, flammenwand, feuer_verbrennt, lava_erstarrt, feuer_schmilzt). */
  lava_grollen: P('umgebung', 0.9, 0.4, [
    T({ f0: 70, f1: 32, gleit: 0.9, an: 0.02, ab: 1.0, pegel: 0.8 }),
    R({ farbe: 'braun', filter: 'lowpass', f0: 500, f1: 80, sweep: 0.9, an: 0.05, ab: 1.0, pegel: 0.7 }),
    K({ n: 10, fenster: 0.8, fmin: 300, fmax: 1800, q: 2, ab: 0.06, pegel: 0.25 }),
  ]),
  flammen: P('umgebung', 0.7, 0.2, [
    R({ farbe: 'braun', filter: 'lowpass', f0: 900, f1: 300, sweep: 0.5, an: 0.08, ab: 0.7, pegel: 0.6 }),
    K({ n: 14, fenster: 0.9, fmin: 1500, fmax: 6000, q: 3, ab: 0.03, pegel: 0.3 }),
  ]),
  zischen: P('umgebung', 0.6, 0.1, [
    R({ f0: 2400, f1: 4200, sweep: 0.5, q: 0.9, an: 0.01, ab: 0.6, pegel: 0.5 }),
    K({ n: 8, fenster: 0.4, fmin: 1500, fmax: 5000, q: 4, ab: 0.02, pegel: 0.2 }),
  ]),
  /* Wirkungen auf Figuren (Ereigniskatalog: heal, frozen, shield_absorbed, pulled, turret_fired). */
  heilung: P('treffer', 0.5, 0.35, [
    T({ f0: 660, f1: 990, gleit: 0.18, an: 0.02, ab: 0.35, pegel: 0.35 }),
    T({ f0: 1320, f1: 1760, gleit: 0.18, start: 0.09, an: 0.02, ab: 0.4, pegel: 0.28 }),
    R({ filter: 'highpass', f0: 6000, an: 0.08, ab: 0.3, pegel: 0.05 }),
  ], { ton: 0.03, filter: 0.05, pegel: 0.05 }),
  einfrieren: P('treffer', 0.6, 0.25, [
    T({ f0: 2600, f1: 1500, gleit: 0.15, partiale: [[1, 1], [2.76, 0.5], [5.4, 0.25]], an: 0.001, ab: 0.45, pegel: 0.35 }),
    K({ n: 7, fenster: 0.3, fmin: 3500, fmax: 9000, q: 12, ab: 0.03, pegel: 0.3 }),
    R({ filter: 'highpass', f0: 5000, an: 0.001, ab: 0.06, pegel: 0.35 }),
  ]),
  schild: P('treffer', 0.6, 0.2, [
    T({ welle: 'triangle', f0: 520, f1: 260, gleit: 0.12, partiale: [[1, 1], [1.5, 0.5]], an: 0.002, ab: 0.28, pegel: 0.55 }),
    R({ f0: 3500, q: 4, an: 0.001, ab: 0.04, pegel: 0.45 }),
  ]),
  heranziehen: P('treffer', 0.55, 0.1, [
    R({ f0: 200, f1: 1400, sweep: 0.22, q: 0.7, an: 0.1, ab: 0.15, pegel: 0.8 }),
    T({ welle: 'sawtooth', f0: 90, f1: 220, gleit: 0.22, an: 0.1, ab: 0.12, pegel: 0.3 }),
    R({ farbe: 'braun', filter: 'lowpass', f0: 600, start: 0.24, an: 0.001, ab: 0.1, pegel: 0.6 }),
  ]),
  geschuetz: P('schuss', 0.55, 0.05, [
    R({ f0: 1900, q: 1.2, an: 0.001, ab: 0.05, pegel: 0.8 }),
    T({ welle: 'square', f0: 240, f1: 110, gleit: 0.06, an: 0.001, ab: 0.09, pegel: 0.35 }),
  ], { ton: 0.05, filter: 0.1, pegel: 0.08 }),
  waffenwechsel: P('ui', 0.6, 0, [
    R({ f0: 2500, q: 3, an: 0.001, ab: 0.015, pegel: 1 }),
    R({ f0: 1800, q: 3, start: 0.045, an: 0.001, ab: 0.02, pegel: 0.7 }),
    T({ f0: 700, f1: 400, gleit: 0.03, ab: 0.03, pegel: 0.3 }),
  ], { ton: 0.04, filter: 0.08, pegel: 0.05 }),
  bereit: P('ui', 0.5, 0.1, [
    T({ f0: 1318, an: 0.005, ab: 0.15, pegel: 0.4 }),
    T({ f0: 1760, start: 0.07, an: 0.005, ab: 0.22, pegel: 0.25 }),
  ], { ton: 0, filter: 0, pegel: 0 }),
  ticken: P('umgebung', 0.5, 0, [0, 0.5, 1].flatMap(start => [
    R({ f0: 3000, q: 6, start, an: 0.001, ab: 0.02, pegel: 0.5 }),
    T({ f0: 1800, start, an: 0.001, ab: 0.015, pegel: 0.3 }),
  ]), { ton: 0.02, filter: 0.05, pegel: 0.05 }),
});

/** Alle Profile unter einem Namen. */
export const ALLE_PROFILE = Object.freeze({ ...SCHUSS_PROFILE, ...EREIGNIS_PROFILE });

/** Dauer eines Profils ohne Hall (s). */
export function profilDauer(profil) {
  let ende = 0;
  for (const s of profil.schichten) {
    let e;
    if (s.art === 'knistern') e = s.start + s.fenster + s.ab;
    else e = s.start + s.an + s.ab;
    if (e > ende) ende = e;
  }
  return ende;
}

/** Gesamtdauer inklusive Hallschwanz (s). */
export function gesamtDauer(profil) {
  return profilDauer(profil) + (profil.nachhall > 0 ? HALL_DAUER : 0);
}

/* ------------------------------------------------------------ Waffe → Profil */

/** Specials, die wie eine Rakete oder ein Geschütz klingen. */
const RAKETEN_SPECIALS = new Set([
  'rocket', 'mortar', 'launcher', 'artillery', 'drill_rocket', 'hell_cannon', 'air_strike',
  'meteor_rain', 'guided_sheep', 'rocket_punch',
]);

/** Specials, die auf den Anwender wirken (Heilung, Schild, Sprung, Aufbau): sanfter Hinweiston. */
const SELBST_SPECIALS = new Set([
  'heal', 'shield_heal', 'instant_heal', 'buff', 'random_buff', 'mutation', 'time_control',
  'area_buff', 'target_scan', 'mobility', 'teleport', 'dimension_orb', 'shield_freeze', 'portal',
  'portal_field', 'loop', 'supply_drop', 'bunker', 'teleport_platform', 'hologram_portal',
  'camouflage', 'water_mobility', 'flight', 'grapple', 'guardian', 'ammo_drop',
]);

/**
 * Korrekturen je Waffen-ID (Muster wie `KORREKTUREN` in waffenAnimation.js):
 * Waffe → Profilname, wo die Kategorieregel falsch läge.
 */
export const PROFIL_KORREKTUR = Object.freeze({
  // Wurfwaffen und Bögen
  pa_049: 'wurf', pa_050: 'wurf', pa_051: 'wurf', pa_058: 'wurf', pa_059: 'wurf',
  // Handfeuerwaffen
  pa_040: 'pistole', pa_057: 'pistole', pa_060: 'gewehr', pa_054: 'schwer',
  pa_055: 'gewehr', pa_056: 'gewehr',
  // Fäuste und Handwerkszeug unter „ranged"
  pa_023: 'nahkampf', pa_024: 'nahkampf', pa_025: 'nahkampf', pa_026: 'nahkampf', pa_031: 'nahkampf',
  pa_036: 'rakete', pa_033: 'magie', pa_034: 'magie',
  // Geräte und Zauber mit Wirkung auf andere
  pa_113: 'nahkampf', pa_120: 'laser', pa_117: 'wurf', pa_116: 'magie', pa_124: 'laser',
  pa_132: 'nahkampf', pa_137: 'feuer', pa_138: 'magie',
  // Katapult, Meteor, Erdspalter: schwere Schläge
  pa_064: 'schwer', pa_065: 'schwer', pa_135: 'schwer',
});

function nachSchadensart(w, vorgabe) {
  switch (w.damageType) {
    case 'fire': return 'feuer';
    case 'ice': return 'eis';
    case 'electric': return 'blitz';
    case 'energy': case 'magnetic': return w.delivery === 'hitscan' ? 'strahl' : 'laser';
    case 'explosive': return (w.blastRadius ?? 0) > 0 || w.fuseTime > 0 ? 'rakete' : vorgabe;
    case 'impact': return 'schwer';
    default: return vorgabe;
  }
}

/**
 * Das Klangprofil einer Waffe: Korrekturtabelle, Selbstwirkung, Kategorie,
 * Schadensart, Zünder (Wurf), Hitscan (Strahl).
 *
 * @param {{id?:string, category?:string, damage?:number, damageType?:string, delivery?:string,
 *   fuseTime?:number, blastRadius?:number, special?:string, targeting?:string}} w
 * @returns {string} Schlüssel in `SCHUSS_PROFILE`
 */
export function schussProfilFuer(w) {
  if (!w) return 'pistole';
  const korr = PROFIL_KORREKTUR[w.id];
  if (korr) return korr;
  const kat = w.category;
  if (kat === 'ultimate') return 'ultimate';
  if (w.damage === 0 || SELBST_SPECIALS.has(w.special)) return 'selbst';
  if (w.targeting === 'self_or_area' && kat === 'utility') return 'selbst';
  if (RAKETEN_SPECIALS.has(w.special)) return 'rakete';
  if ((w.fuseTime ?? 0) > 0) return 'wurf';
  switch (kat) {
    case 'melee': return 'nahkampf';
    case 'ranged': return nachSchadensart(w, 'pistole');
    case 'heavy_ranged': return nachSchadensart(w, 'schwer');
    case 'elemental': return nachSchadensart(w, 'magie');
    case 'magic': {
      const p = nachSchadensart(w, 'magie');
      return p === 'rakete' ? 'magie' : p;
    }
    case 'tech': return nachSchadensart(w, 'laser');
    case 'utility': return nachSchadensart(w, 'selbst');
    default: return 'pistole';
  }
}

/** Standardprofil je Kategorie (Stellvertreter für Tests und Auswertung). */
export const KATEGORIE_PROFIL = Object.freeze({
  melee: 'nahkampf', ranged: 'pistole', heavy_ranged: 'schwer', elemental: 'feuer',
  magic: 'magie', tech: 'laser', utility: 'selbst', ultimate: 'ultimate',
});

/* ----------------------------------------------------- Einschlag und Treffer */

/** Klasse einer Explosion nach Radius (Weltpixel); 0 = kein Sprengsatz. */
export function explosionKlasse(radius) {
  const r = Number(radius);
  if (!(r > 0)) return 'einschlag';
  if (r < 28) return 'klein';
  if (r < 46) return 'mittel';
  if (r < 68) return 'gross';
  return 'riesig';
}

/** Profilname für einen Einschlag. */
export function einschlagProfil({ radius = 0, material = 'erde', stoff = null } = {}) {
  const k = explosionKlasse(radius);
  if (material === 'wasser') return k === 'gross' || k === 'riesig' ? 'platscher_gross' : 'platscher_klein';
  if (stoff === 'metall') return k === 'einschlag' || k === 'klein' ? 'einschlag_metall' : 'explosion_metall';
  if (k === 'einschlag') return material === 'fels' ? 'einschlag_fels' : 'einschlag_erde';
  return `explosion_${k}`;
}

/** Profilname für einen Treffer an einer Figur. */
export function trefferProfil({ schaden = 0, maxHealth = 100, kritisch = false, selbst = false } = {}) {
  if (selbst) return 'treffer_selbst';
  const nenner = Number.isFinite(maxHealth) && maxHealth > 0 ? maxHealth : 100;
  const anteil = Math.max(0, Number(schaden) / nenner);
  if (kritisch) return 'treffer_krit';
  if (anteil < 0.1) return 'treffer_figur_klein';
  if (anteil < 0.3) return 'treffer_figur_mittel';
  return 'treffer_figur_gross';
}

/* ------------------------------------------------------- Raum: Panning, Abstand */

/**
 * Lautstärke, Stereolage, Dunkelheit und Verzögerung nach Bildposition.
 *
 * @param {{x:number,y:number}|null} quelle Weltposition (null = mittig, volle Stärke)
 * @param {{x:number,y:number,halbBreite:number}|null} hoerer Bildmitte und halbe Bildbreite
 * @returns {{pan:number, pegel:number, tiefpass:number, verzoegerung:number}}
 */
export function raeumlich(quelle, hoerer) {
  if (!quelle || !hoerer || !Number.isFinite(quelle.x) || !Number.isFinite(quelle.y)
    || !(hoerer.halbBreite > 0)) {
    return { pan: 0, pegel: 1, tiefpass: 0, verzoegerung: 0 };
  }
  const dx = quelle.x - hoerer.x;
  const dy = quelle.y - hoerer.y;
  const abstand = Math.hypot(dx, dy);
  const norm = abstand / hoerer.halbBreite;
  const pan = Math.max(-0.85, Math.min(0.85, (dx / hoerer.halbBreite) * 0.85));
  const pegel = norm <= 1 ? 1 - 0.3 * norm : Math.max(0.12, 0.7 * (norm ** -1.3));
  const tiefpass = norm > 1.2 ? Math.max(1500, 16000 / (1 + (norm - 1.2) * 2)) : 0;
  const verzoegerung = Math.min(0.4, abstand / 2400);
  return { pan, pegel, tiefpass, verzoegerung };
}

/* -------------------------------------------------------------- Stimmenlimit */

/**
 * Verwaltet gleichzeitige Stimmen. Jede Stimme: `{start, ende, kappen(zeit)}`.
 * Ist das Limit erreicht, wird die älteste gekappt.
 */
export class StimmenVerwalter {
  #max;
  #aktiv = [];
  #gekappt = 0;
  #spitze = 0;

  constructor(max = STIMMEN_MAX) { this.#max = max; }

  get anzahl() { return this.#aktiv.length; }
  get gekappt() { return this.#gekappt; }
  get spitze() { return this.#spitze; }
  get max() { return this.#max; }

  /** Meldet eine neue Stimme; liefert, wie viele dafür gekappt wurden. */
  melde(stimme, jetzt) {
    this.#aktiv = this.#aktiv.filter(s => s.ende > jetzt);
    let gekappt = 0;
    while (this.#aktiv.length >= this.#max) {
      let aeltester = 0;
      for (let i = 1; i < this.#aktiv.length; i += 1) {
        if (this.#aktiv[i].start < this.#aktiv[aeltester].start) aeltester = i;
      }
      const [weg] = this.#aktiv.splice(aeltester, 1);
      try { weg.kappen?.(jetzt); } catch { /* eine kaputte Stimme darf nichts verhindern */ }
      gekappt += 1;
    }
    this.#aktiv.push(stimme);
    this.#gekappt += gekappt;
    if (this.#aktiv.length > this.#spitze) this.#spitze = this.#aktiv.length;
    return gekappt;
  }

  /** Aktive Stimmen zum Zeitpunkt `jetzt`. */
  aktiv(jetzt) { return this.#aktiv.filter(s => s.ende > jetzt).length; }
}

/* ------------------------------------------------------------------- Zufall */

/** Kleiner deterministischer Zufall (mulberry32) für Auswertung und Tests. */
export function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Zufallsfaktor 1 ± breite (gleichverteilt). */
export function streue(zufall, breite) {
  return 1 + (zufall() * 2 - 1) * breite;
}

/**
 * Ist der Effektton in dieser Umgebung hörbar?
 * `?ton=0` aus, `?ton=1` erzwungen, sonst aus bei `navigator.webdriver`.
 */
export function tonErlaubt({ suche = '', webdriver = false } = {}) {
  let wert = null;
  try { wert = new URLSearchParams(suche).get('ton'); } catch { /* ignorieren */ }
  if (wert === '0' || wert === 'aus') return false;
  if (wert === '1' || wert === 'an') return true;
  return !webdriver;
}
