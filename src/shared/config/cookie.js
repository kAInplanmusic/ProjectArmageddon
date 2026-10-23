/**
 * Cookie, der „Kater des Weltuntergangs".
 *
 * Ein neutraler NPC wie Günther (kein Team, nicht besiegbar). Er schläft oder
 * frisst. Sein Hunger wächst stetig; je größer er ist, desto lauter miaut er —
 * die Lautstärke IST die Dringlichkeit. Wird er nicht rechtzeitig gefüttert,
 * tobt er und zerstört alles in seinem Weg.
 *
 * ## Versionsmarke (AGENTS.md §2)
 *
 * Cookie verändert jede Partie (Schaden, Löcher im Gelände, Kisten fehlen).
 * Deshalb trägt der Replay-Kopf `config.cookie`:
 *
 *   - `COOKIE_ALT` (1): es gibt keinen Cookie. Das Feld FEHLT in jeder
 *     Aufzeichnung aus der Zeit davor; `ReplayRecorder.fromJSON` setzt dann
 *     diesen Wert — Bit für Bit das alte Verhalten.
 *   - `COOKIE_KATER` (2): Cookie liegt auf der Karte, Zufall nur über den
 *     eigenen Teilgenerator `COOKIE`.
 *   - `COOKIE_FEINSCHLIFF` (3): wie 2, dazu die Messwerte unten (Kuscheln und Futternapf
 *     gemäßigt). Fassung 2 bleibt Bit für Bit, was sie war.
 *
 * Alle Zeitangaben in Ticks (60 Hz), Strecken in Kartenpixeln der
 * Referenzbreite 1280; Tempo und Reichweiten wachsen mit der Kartenbreite wie
 * bei Günther.
 *
 * @module config/cookie
 */

export const COOKIE_ALT = 1;
export const COOKIE_KATER = 2;
export const COOKIE_FEINSCHLIFF = 3;
/** Fassung NEUER Partien (Server und Client geben sie ausdrücklich mit). */
export const COOKIE_STANDARD = COOKIE_FEINSCHLIFF;

/** Fehlende oder unbekannte Werte sind `COOKIE_ALT` (siehe `normalisiereGuenther`). */
export function normalisiereCookie(fassung) {
  if (fassung === COOKIE_FEINSCHLIFF) return COOKIE_FEINSCHLIFF;
  return fassung === COOKIE_KATER ? COOKIE_KATER : COOKIE_ALT;
}

export const COOKIE_IDENTITY = Object.freeze({
  name: 'Cookie',
  titel: 'Kater des Weltuntergangs',
  /** Schulterhöhe / Länge in Kartenpixeln. */
  height: 30,
  length: 44,
});

/**
 * Posen (= Sprites in `assets/cookie/`). Die Reihenfolge ist das Drahtformat
 * (Index in den Flag-Bits 1–5 des Cookie-Blocks) — nur hinten anhängen.
 */
export const COOKIE_POSEN = Object.freeze([
  'schlafen', 'schlafen_seite', 'brot', 'fressen', 'miau_leise', 'miau_laut', 'hungerwut',
  'spielen', 'kuscheln', 'putzen', 'strecken', 'sitzen', 'liegen', 'gehen',
]);

/**
 * Hunger: 0 (satt) bis 100 (am Verhungern).
 *
 * Er wächst um `proTick`; im Schlaf langsamer (`schlafFaktor`). 100 Hunger in
 * etwa 2 Minuten Spielzeit: Cookie meldet sich also mehrmals je Partie.
 */
export const COOKIE_HUNGER = Object.freeze({
  start: [8, 22],
  proTick: 100 / 7200,
  schlafFaktor: 0.6,
  max: 100,
  /** Untergrenze der Stufen (Hunger ≥ Wert). Lautstärke steigt mit der Stufe. */
  stufen: Object.freeze({ schlaf: 0, leise: 30, laut: 60, wut: 85 }),
  /** Pegel des Miauens je Stufe (0–1) — das Maß der Dringlichkeit. */
  pegel: Object.freeze({ leise: 0.3, laut: 0.65, wut: 1 }),
  /** Abstand zwischen zwei Rufen je Stufe in Ticks. */
  rufTakt: Object.freeze({ leise: 300, laut: 160, wut: 80 }),
});

/** Stufe zu einem Hungerwert. */
export function cookieStufe(hunger) {
  const s = COOKIE_HUNGER.stufen;
  if (hunger >= s.wut) return 'wut';
  if (hunger >= s.laut) return 'laut';
  if (hunger >= s.leise) return 'leise';
  return 'schlaf';
}

/** Füttern, Kuscheln, Futternapf. */
export const COOKIE_PFLEGE = Object.freeze({
  /** Wer Cookie beim Laufen berührt, füttert ihn (wie Günthers Rad). */
  fuetternRadius: 38,
  fuetternMinBewegung: 0.6,
  fuetternHunger: 45,
  fuetternHeilung: 10,
  fuetternSperre: 300,
  fressenTicks: 120,
  putzenTicks: 90,
  /** Kuscheln: stillstehen in der Nähe. */
  kuschelnRadius: 55,
  kuschelnStillTicks: 60,
  kuschelnTicks: 120,
  kuschelnHeilung: 20,
  kuschelnHunger: 10,
  kuschelnSperre: 1200,
  /** Futternapf: eine liegende Kiste in dieser Nähe frisst er. */
  napfRadius: 70,
  napfHunger: 30,
  /** Bei „laut" läuft er zu einer Kiste in dieser Reichweite (Anteil Kartenbreite). */
  kistenSuchAnteil: 0.3,
  gehTempoAnteil: 0.6 / 1280,
});

/** Toben. */
export const COOKIE_WUT = Object.freeze({
  /** Tempo als Anteil der Kartenbreite je Tick (2,2 px bei 1280). */
  tempoAnteil: 2.2 / 1280,
  /** Alle so viele Ticks reißt er ein Loch ins Gelände. */
  kraterTakt: 12,
  kraterRadius: 30,
  kraterTiefe: 80,
  /** Figuren in dieser Nähe nehmen Schaden (je Figur mit Sperre). */
  schlagRadius: 46,
  schlagSchaden: 40,
  schlagSperre: 120,
  stossX: 5,
  stossY: -3.5,
  /** Objekte (Kisten) im Radius gehen kaputt. */
  objektRadius: 50,
  /** Nach so vielen Ticks bricht er erschöpft zusammen (Hunger sinkt dabei auf `erschoepftHunger`). */
  maxTicks: 1800,
  erschoepftHunger: 50,
  erschoepftTicks: 240,
});

/**
 * „Spielen": extrem selten. Würfel je Rundenwechsel; wirkt als kosmische
 * Schockwelle.
 */
export const COOKIE_SPIELEN = Object.freeze({
  chanceProRunde: 0.008,
  ticks: 150,
  wirkung: 60,
  /** Reichweite als Anteil der Kartenbreite. */
  radiusAnteil: 0.6,
  schadenMax: 35,
  schadenMin: 10,
  stossX: 7,
  stossY: -5,
  kraterRadius: 55,
  kraterTiefe: 100,
  /** Ringe von Kratern um Cookie (Abstand als Vielfaches von `kraterRadius`). */
  ringe: Object.freeze([0, 1.6, -1.6, 3.2, -3.2]),
});

/*
 * ============================================================================
 * Fassung 3: Feinschliff nach Messung (`config.cookie` = 3)
 * ============================================================================
 *
 * Messung der Fassung 2 (`node scripts/tiere-verteilung.mjs --cookie=2`, 60 Seeds):
 *
 *     Kuscheln         bis 30 mal je Partie, bis ~390 Leben für EINE Figur (Figur hat 100):
 *                      wer neben Cookie steht, ist unsterblich, und Cookie wird nie hungrig
 *                      (Hungerwut nur in 5 % der Partien, wenn Spieler ihn aufsuchen).
 *     Futternapf       frisst 45 % aller Kisten der Partie, schon ab Hunger 30, läuft ihnen 380 px nach.
 *     Hungerwut        Schläge zu 40: 1,4-1,6 je Partie, ~60 Schaden (bei stehenden Figuren).
 *
 * Fassung 3: Kuscheln heilt 12 (statt 20), je Figur höchstens dreimal, mit 50 s Sperre, und
 * senkt den Hunger nur um 5. Der Futternapf frisst erst ab Hunger 60 (Stufe „laut") und
 * sättigt stärker (dafür höchstens alle 60 s) und sucht nur 15 % der Kartenbreite weit. Der Schlag der
 * Hungerwut zieht 25 ab, mit 2,5 s Sperre. Der Hunger wächst um ein Drittel langsamer, die Wut ist kürzer und folgt auf längere Ruhe (Messung:
 * Hungerwut in 77 % der Partien, 2,1 mal je Partie, bei Fassung 2 53 % und 0,9 mal). Stufen, Pegel und
 * Spielen bleiben unverändert.
 */
export const COOKIE_PFLEGE_3 = Object.freeze({
  ...COOKIE_PFLEGE,
  kuschelnHeilung: 12,
  kuschelnHunger: 5,
  kuschelnSperre: 3000,
  kuschelnMax: 3,
  napfAbHunger: 60,
  napfHunger: 45,
  /** Zwischen zwei Kisten im Napf vergehen mindestens so viele Ticks (60 s). */
  napfSperre: 3600,
  /** Er läuft nur zu Kisten in dieser Nähe (Anteil Kartenbreite; vorher 0,3). */
  kistenSuchAnteil: 0.15,
});

/** Hunger der Fassung 3: 100 Hunger in 3 statt 2 Minuten (Stufen und Pegel bleiben). */
export const COOKIE_HUNGER_3 = Object.freeze({
  ...COOKIE_HUNGER,
  proTick: 100 / 10800,
});

/**
 * Toben der Fassung 3: derselbe Ablauf, aber kürzer (20 statt 30 s), mit längerer Pause danach
 * (er sinkt auf Hunger 30 statt 50) und mildem Schlag (25 statt 40, mit 2,5 s Sperre).
 */
export const COOKIE_WUT_3 = Object.freeze({
  ...COOKIE_WUT,
  schlagSchaden: 25,
  schlagSperre: 150,
  maxTicks: 1200,
  erschoepftHunger: 30,
});

/** Die Hungerwerte einer Fassung. */
export function cookieHunger(fassung) {
  return fassung >= COOKIE_FEINSCHLIFF ? COOKIE_HUNGER_3 : COOKIE_HUNGER;
}

/** Die Wutwerte einer Fassung. */
export function cookieWut(fassung) {
  return fassung >= COOKIE_FEINSCHLIFF ? COOKIE_WUT_3 : COOKIE_WUT;
}

/** Die Pflegewerte einer Fassung (Simulation und Anzeige lesen hier). */
export function cookiePflege(fassung) {
  return fassung >= COOKIE_FEINSCHLIFF ? COOKIE_PFLEGE_3 : COOKIE_PFLEGE;
}
