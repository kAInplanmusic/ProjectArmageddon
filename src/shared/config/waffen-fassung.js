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
 *     auf unter 2x Stufenmedian gesenkt (`BALANCE_KORREKTUREN_3`, Standard). Der Katalog
 *     selbst trägt diese Fassung; Fassung 2 legt `WAFFEN_F2_WERTE` darüber.
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
export const WAFFEN_STANDARD = WAFFEN_KORREKTUR;

/** Unbekannte Werte fallen auf den Standard (wie `normalisiereKit`). */
export function normalisiereWaffen(fassung) {
  return fassung === WAFFEN_ALT || fassung === WAFFEN_BALANCE || fassung === WAFFEN_KORREKTUR
    ? fassung : WAFFEN_STANDARD;
}

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

const zwischenspeicher = new Map();

/**
 * Die Waffe in der Fassung eines Matches. Fassung 3 ist der Katalog selbst; Fassung 2
 * legt `WAFFEN_F2_WERTE` darüber, Fassung 1 zusätzlich die Altwerte (je einmal
 * berechnet, eingefroren).
 *
 * @param {string} id
 * @param {number} [fassung]
 * @returns {object|null}
 */
export function getWaffe(id, fassung = WAFFEN_STANDARD) {
  const waffe = getWeapon(id);
  if (!waffe || fassung === WAFFEN_KORREKTUR) return waffe;
  const f2 = WAFFEN_F2_WERTE[id];
  const alt = fassung === WAFFEN_ALT ? WAFFEN_ALT_WERTE[id] : null;
  if (!f2 && !alt) return waffe;
  const schluessel = `${fassung}:${id}`;
  let kopie = zwischenspeicher.get(schluessel);
  if (!kopie) {
    kopie = Object.freeze({ ...waffe, ...f2, ...alt });
    zwischenspeicher.set(schluessel, kopie);
  }
  return kopie;
}
