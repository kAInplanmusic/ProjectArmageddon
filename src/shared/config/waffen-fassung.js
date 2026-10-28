/**
 * Katalogfassung der Waffenwerte (`config.waffen` im Replay-Kopf).
 *
 * Die Balance-Korrektur vom 2026-10-14 ändert Schadenswerte einzelner Waffen
 * (`BALANCE_KORREKTUREN` in `scripts/build-weapon-catalog.mjs`). Eine Aufzeichnung
 * davor müsste mit den neuen Werten ein anderes Match spielen. Deshalb gilt wie bei
 * `kit` und `zerstoerung`:
 *
 *   - `WAFFEN_ALT` (1): Werte vor der Korrektur. Eine Aufzeichnung OHNE `waffen`
 *     im Kopf ist `WAFFEN_ALT`.
 *   - `WAFFEN_BALANCE` (2): Werte nach der Korrektur.
 *   - `WAFFEN_KORREKTUR` (3): Maschinenpistole angehoben, Energiefaust und Flammenklinge
 *     auf unter 2x Stufenmedian gesenkt (`BALANCE_KORREKTUREN_3`). Fassung 3 legt
 *     `WAFFEN_F3_WERTE` auf den Katalog, Fassung 2 zusätzlich `WAFFEN_F2_WERTE`.
 *   - `WAFFEN_FEIN` (4): neun Ausreißer des Stufenvergleichs nachgezogen
 *     (`BALANCE_KORREKTUREN_4`) und 20 gleich fliegende Wurf-/Schusswaffen differenziert
 *     (`FLUGPROFILE_4`). Der Katalog selbst trägt diese Fassung.
 *   - `WAFFEN_FAIR` (5, Standard): Selbstschaden eigener Flächenwirkung gedeckelt
 *     (`SELBSTSCHADEN_GRENZE`), dazu `WAFFEN_F5_WERTE` auf dem Katalog (Messung nachgezogen).
 *     Seit 2026-10-28 tragen vier Waffen im Katalog eine zutreffendere Schadensart
 *     (`ARTEN_BIS_F4`); die Fassungen 1 bis 4 behalten ihre alte Art.
 *   - `WAFFEN_ZUENDER` (6, Standard): Die Armierung einer Zündergranate ist korrigiert. Bis
 *     Fassung 5 stellte der Motor die bereits armierte Granate JEDEN Takt neu auf den Treffpunkt
 *     (der liegt im Festen) und ließ sie so je Takt rund 0,3 px sinken; sie zündete 11 bis 82 px
 *     unter dem Aufprall, teils außerhalb des eigenen Sprengradius. Ab Fassung 6 bleibt sie am
 *     Aufprallpunkt liegen und zündet dort (`services.match.zuenderBleibtLiegen`, gelesen in
 *     `projectileSystem.js`). Die Werte entsprechen Fassung 5; gewirkt hat die Regel nur auf die
 *     Waffen mit `fuseTime` > 0. Fassung 5 verhält sich bitgleich wie zuvor (sinkt weiter).
 *
 * `WAFFEN_ALT_WERTE` hält je geänderter Waffe die Altwerte jener Felder, die sich
 * durch die Korrektur geändert haben (`damage` und der daraus abgeleitete
 * `powerScore`; Stufe, Abklingzeit, Reichweite, Zünder bleiben unverändert).
 * `tests/waffen-fassung.test.js` belegt: Katalog + Altwerte = der Katalog vor der
 * Korrektur (Prüfsumme), und ein Spiel mit `waffen: 1` verläuft wie vorher.
 *
 * @module config/waffen-fassung
 */
import { getWeapon } from './weapons.js';

export const WAFFEN_ALT = 1;
export const WAFFEN_BALANCE = 2;
export const WAFFEN_KORREKTUR = 3;
export const WAFFEN_FEIN = 4;
export const WAFFEN_FAIR = 5;
export const WAFFEN_ZUENDER = 6;
export const WAFFEN_STANDARD = WAFFEN_ZUENDER;

/**
 * Obergrenze des Selbstschadens durch eigene Flächenwirkung ab Fassung 5, als Anteil der
 * Höchstgesundheit des Schützen: Ein einzelner eigener Schuss nimmt nie mehr als dieses Maß
 * (Messung: `scripts/waffen-selbstschaden.mjs`). Wer sich selbst trifft, verliert viel, stirbt
 * aber nicht aus voller Gesundheit durch einen Zufallstreffer. Fassung 4 und älter: keine Grenze.
 */
export const SELBSTSCHADEN_GRENZE = 0.4;

/** Unbekannte Werte fallen auf den Standard (wie `normalisiereKit`). */
export function normalisiereWaffen(fassung) {
  return fassung === WAFFEN_ALT || fassung === WAFFEN_BALANCE || fassung === WAFFEN_KORREKTUR || fassung === WAFFEN_FEIN
    || fassung === WAFFEN_FAIR || fassung === WAFFEN_ZUENDER ? fassung : WAFFEN_STANDARD;
}

/**
 * Werte der Fassung 3 für die Waffen, die Fassung 4 verändert (`damage` und die
 * abgeleiteten `powerScore` und `maxRange`; Stufe und Abklingzeit bleiben gleich).
 */
export const WAFFEN_F3_WERTE = Object.freeze({
  pa_011: Object.freeze({ gravityScale: 1.15, knockback: 30, maxRange: 180, powerScore: 34.76, projectileSpeed: 40.8, speedFactor: 0.5829 }),
  pa_012: Object.freeze({ bounces: 1, gravityScale: 1.15, knockback: 30, maxRange: 180, powerScore: 42.46, projectileSpeed: 40.8, speedFactor: 0.5829 }),
  pa_014: Object.freeze({ gravityScale: 1.15, maxRange: 180, projectileSpeed: 40.8, speedFactor: 0.5829 }),
  pa_015: Object.freeze({ gravityScale: 1.15, knockback: 30, maxRange: 180, powerScore: 41.36 }),
  pa_016: Object.freeze({ bounces: 1, gravityScale: 1.15, knockback: 30, maxRange: 180, powerScore: 36.96, projectileSpeed: 40.8, speedFactor: 0.5829 }),
  pa_019: Object.freeze({ bounces: 1, gravityScale: 1.15, knockback: 30, maxRange: 180, powerScore: 35.86, projectileSpeed: 40.8, speedFactor: 0.5829 }),
  pa_020: Object.freeze({ bounces: 1, gravityScale: 1.15, knockback: 30, maxRange: 180, powerScore: 43.56, projectileSpeed: 40.8, speedFactor: 0.5829 }),
  pa_021: Object.freeze({ bounces: 1, gravityScale: 1.15, knockback: 30, maxRange: 180, powerScore: 39.16, projectileSpeed: 40.8, speedFactor: 0.5829 }),
  pa_024: Object.freeze({ gravityScale: 1, knockback: 30, maxRange: 565, powerScore: 30.36, projectileSpeed: 70, speedFactor: 1 }),
  pa_025: Object.freeze({ gravityScale: 1, knockback: 30, maxRange: 565, powerScore: 38.06, projectileSpeed: 70, speedFactor: 1 }),
  pa_027: Object.freeze({ bounces: 0, gravityScale: 1, knockback: 30, maxRange: 565, powerScore: 29.26, projectileSpeed: 70, speedFactor: 1 }),
  pa_033: Object.freeze({ gravityScale: 1, knockback: 30, maxRange: 565, powerScore: 27.06, projectileSpeed: 70, speedFactor: 1 }),
  pa_034: Object.freeze({ gravityScale: 1, knockback: 30, maxRange: 565, powerScore: 34.76, projectileSpeed: 70, speedFactor: 1 }),
  pa_036: Object.freeze({ gravityScale: 1, knockback: 30, maxRange: 565, powerScore: 38.06, projectileSpeed: 70, speedFactor: 1 }),
  pa_038: Object.freeze({ damage: 50, powerScore: 96.92 }),
  pa_042: Object.freeze({ gravityScale: 1, knockback: 30, maxRange: 565, powerScore: 55.44, projectileSpeed: 70, speedFactor: 1 }),
  pa_043: Object.freeze({ gravityScale: 1, knockback: 30, maxRange: 565, powerScore: 48.24, projectileSpeed: 70, speedFactor: 1 }),
  pa_045: Object.freeze({ gravityScale: 1, knockback: 30, maxRange: 565, powerScore: 53.64, projectileSpeed: 70, speedFactor: 1 }),
  pa_047: Object.freeze({ bounces: 0, gravityScale: 1, knockback: 30, maxRange: 565, powerScore: 58.14, projectileSpeed: 70, speedFactor: 1 }),
  pa_050: Object.freeze({ bounces: 0, gravityScale: 1, knockback: 30, maxRange: 565, powerScore: 56.34, projectileSpeed: 70, speedFactor: 1 }),
  pa_051: Object.freeze({ gravityScale: 1, knockback: 30, maxRange: 565, powerScore: 50.04, projectileSpeed: 70, speedFactor: 1 }),
  pa_059: Object.freeze({ damage: 55, powerScore: 55.23 }),
  pa_060: Object.freeze({ damage: 28, powerScore: 28.44 }),
  pa_068: Object.freeze({ damage: 50, powerScore: 47.88 }),
  pa_069: Object.freeze({ damage: 46, powerScore: 82.8 }),
  pa_083: Object.freeze({ damage: 50, maxRange: 578, powerScore: 52.56 }),
  pa_104: Object.freeze({ damage: 62, powerScore: 58.14 }),
  pa_118: Object.freeze({ damage: 52, maxRange: 485, powerScore: 118.5 }),
  pa_139: Object.freeze({ damage: 78, maxRange: 1040, powerScore: 161.67 }),
});

/**
 * Werte der Fassung 2 für die Waffen, die Fassung 3 verändert (`damage` und die
 * abgeleiteten `powerScore` und `maxRange`; Abklingzeit und Stufe bleiben gleich).
 */
export const WAFFEN_F2_WERTE = Object.freeze({
  pa_040: Object.freeze({ damage: 18, powerScore: 25.5 }),
  pa_120: Object.freeze({ damage: 55, powerScore: 60.53, maxRange: 513 }),
  pa_137: Object.freeze({ damage: 55, powerScore: 75.83, maxRange: 733 }),
});

/** Altwerte der durch die Balance-Korrektur geänderten Felder, je Waffe. */
export const WAFFEN_ALT_WERTE = Object.freeze({
  pa_001: Object.freeze({ damage: 28, powerScore: 50.2 }),
  pa_005: Object.freeze({ damage: 42, powerScore: 63.56 }),
  pa_006: Object.freeze({ damage: 20, powerScore: 52.36 }),
  pa_007: Object.freeze({ damage: 22, powerScore: 32.12 }),
  pa_009: Object.freeze({ damage: 30, powerScore: 60.61 }),
  pa_039: Object.freeze({ damage: 58, powerScore: 110.73 }),
  pa_040: Object.freeze({ damage: 14, powerScore: 20.5 }),
  pa_066: Object.freeze({ damage: 64, powerScore: 105.12 }),
  pa_140: Object.freeze({ damage: 72, powerScore: 73.36 }),
});

/**
 * Werte der Fassung 5 über dem Katalog (der Katalog bleibt Fassung 4): je Waffe die Felder, die
 * die Messung `scripts/waffen-balance.mjs` nachgezogen hat. Ältere Fassungen sehen sie nicht.
 */
const WAFFEN_F5_WERTE = Object.freeze({
  pa_026: Object.freeze({ damage: 36 }),
  pa_041: Object.freeze({ damage: 48 }),
  pa_055: Object.freeze({ damage: 42 }),
  pa_059: Object.freeze({ damage: 41 }),
  pa_063: Object.freeze({ damage: 32 }),
  pa_071: Object.freeze({ damage: 55 }),
  pa_075: Object.freeze({ damage: 45 }),
  pa_097: Object.freeze({ damage: 30 }),
  pa_104: Object.freeze({ damage: 45 }),
  pa_140: Object.freeze({ damage: 47 }),
});

/**
 * Schadensarten der Fassungen 1 bis 4 (Namens- und Artendurchsicht 2026-10-28).
 *
 * Im Katalog stehen seitdem die zutreffenderen Arten: Raketenrucksack `utility` (Fluggerät, wie
 * Jetpack und Gleitschirm), Salvengeber `explosive` (kleine Rakete mit Sprengradius), Astraltrank
 * `astral` (heißt Astral, gleiche Familie `magie`) und Endlosschleife `time` (das alte `temporal`
 * war dieselbe Art wie `time`). Aufzeichnungen der Fassungen 1 bis 4 laufen mit der alten Art
 * weiter (AGENTS.md §2); erst die Fassung 5 liest die neue.
 */
export const ARTEN_BIS_F4 = Object.freeze({
  pa_032: Object.freeze({ damageType: 'physical' }),
  pa_041: Object.freeze({ damageType: 'physical' }),
  pa_084: Object.freeze({ damageType: 'arcane' }),
  pa_122: Object.freeze({ damageType: 'temporal' }),
});

const zwischenspeicher = new Map();

/**
 * Die Waffe in der Fassung eines Matches. Fassung 4 ist der Katalog selbst; ab Fassung 5 liegen die Werte aus `WAFFEN_F5_WERTE` darüber (Fassung 6 teilt sie, ihr Unterschied ist die Zünderregel des Motors); Fassung 3
 * legt `WAFFEN_F3_WERTE` darüber, Fassung 2 zusätzlich `WAFFEN_F2_WERTE`, Fassung 1 zusätzlich die Altwerte (je einmal
 * berechnet, eingefroren).
 *
 * @param {string} id
 * @param {number} [fassung]
 * @returns {object|null}
 */
export function getWaffe(id, fassung = WAFFEN_STANDARD) {
  const waffe = getWeapon(id);
  if (!waffe) return waffe;
  if (fassung >= WAFFEN_FAIR) {
    const f5 = WAFFEN_F5_WERTE[id];
    if (!f5) return waffe;
    const schluessel5 = `${fassung}:${id}`;
    let kopie5 = zwischenspeicher.get(schluessel5);
    if (!kopie5) { kopie5 = Object.freeze({ ...waffe, ...f5 }); zwischenspeicher.set(schluessel5, kopie5); }
    return kopie5;
  }
  const art = ARTEN_BIS_F4[id];
  if (fassung === WAFFEN_FEIN && !art) return waffe;
  const f3 = fassung === WAFFEN_FEIN ? null : WAFFEN_F3_WERTE[id];
  const f2 = fassung <= WAFFEN_BALANCE ? WAFFEN_F2_WERTE[id] : null;
  const alt = fassung === WAFFEN_ALT ? WAFFEN_ALT_WERTE[id] : null;
  if (!f3 && !f2 && !alt && !art) return waffe;
  const schluessel = `${fassung}:${id}`;
  let kopie = zwischenspeicher.get(schluessel);
  if (!kopie) {
    kopie = Object.freeze({ ...waffe, ...f3, ...f2, ...alt, ...art });
    zwischenspeicher.set(schluessel, kopie);
  }
  return kopie;
}
