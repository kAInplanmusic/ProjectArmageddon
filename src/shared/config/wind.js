/**
 * Windfassung: `config.wind` im Replay-Kopf (`AERO` + `ENG-1`).
 *
 * ## Warum es eine Versionsmarke gibt (AGENTS.md §2)
 *
 * Wind bewegt Geschosse, Figuren und abgeworfene Kisten. Zwei Änderungen sehen
 * im Spielverlauf sofort sichtbar aus:
 *
 *   - Der Wind wird ab Fassung 2 JE ZUG gewürfelt statt je Runde, und zwar aus
 *     einem EIGENEN Seed-Zweig (`SEED_OFFSETS.WIND`) statt aus `MATCH_BASE`.
 *   - Jede Waffe trägt einen `windFactor` (0 bis 2,5; eine ausdrückliche 0
 *     heißt „windfrei"). Er wird nur ab dieser Fassung angewandt; ältere
 *     Aufzeichnungen fliegen weiter mit Faktor 1 für jede Waffe.
 *   - Wasser setzt den Windfaktor 0: Ein Geschoss unter Wasser wird nicht mehr
 *     seitlich getrieben (Wasser ist ein Medium, siehe `MASTERDOTO.md`, „Wasser
 *     als Medium").
 *
 * Deshalb:
 *
 *   - `WIND_ALT` (1): Wind je Runde aus `MATCH_BASE`, Waffenfaktor 1, kein
 *     Wasser-Stillstand. Das Feld FEHLT in jeder Datei aus der Zeit davor;
 *     `fromJSON` löst es auf diese Fassung auf, und der Motor rechnet Bit für
 *     Bit wie vorher.
 *   - `WIND_JE_ZUG` (2, Standard): Wind je Zug aus `WIND`, Wurf/Abwurf aus
 *     `KISTENWURF` (getrennte Ströme, ENG-1), `windFactor` aus dem Katalog,
 *     Wasser setzt den Faktor 0.
 *
 * Der Wert ist reine Konfiguration, kein Zufall und keine Uhr.
 *
 * @module config/wind
 */

export const WIND_ALT = 1;
export const WIND_JE_ZUG = 2;
export const WIND_STANDARD = WIND_JE_ZUG;

/** Größter Betrag des Windes (px/Tick² je Faktoreinheit) — wie bisher in `match.js`. */
export const MAX_WIND = 0.05;

/** Größter erlaubter Waffenfaktor (Katalogwerte 0 bis 2,5). */
export const WIND_FAKTOR_MAX = 2.5;

/** Anzahl der Segmente in der HUD-Anzeige. */
export const WIND_SEGMENTE = 5;

/** Unbekannte Werte fallen auf den Standard (wie `normalisiereSeil`); das Fehlen im Replay-Kopf löst `fromJSON` auf ALT auf. */
export function normalisiereWind(fassung) {
  return fassung === WIND_ALT || fassung === WIND_JE_ZUG ? fassung : WIND_STANDARD;
}

/**
 * Windanzeige in Segmenten: Pfeil plus gefüllte/leere Blöcke.
 *
 * Warum Segmente statt einer Zahl: Der Wind ist eine Größe, die man im Spiel
 * abschätzen muss, keine Messgröße. Fünf Stufen reichen, um „kaum" von „stark"
 * zu unterscheiden, und die Richtung steht als Pfeil davor. Die Zahl bleibt im
 * Zustand (`state.wind`) für Vorhersage und Werkzeuge erhalten.
 *
 * @param {number} wind - Windwert wie im Matchzustand (±`MAX_WIND`)
 * @param {object} [optionen]
 * @param {number} [optionen.maxWind=MAX_WIND] - Betrag, der alle Segmente füllt
 * @param {number} [optionen.segmente=WIND_SEGMENTE]
 * @returns {string} z. B. `→ ▮▮▯▯▯`
 */
export function windSegmente(wind, { maxWind = MAX_WIND, segmente = WIND_SEGMENTE } = {}) {
  const wert = Number.isFinite(wind) ? wind : 0;
  const anzahl = Math.max(1, Math.trunc(segmente) || WIND_SEGMENTE);
  const grenze = Number.isFinite(maxWind) && maxWind > 0 ? maxWind : MAX_WIND;
  const anteil = Math.min(1, Math.abs(wert) / grenze);
  const voll = Math.min(anzahl, Math.round(anteil * anzahl));
  return `${wert >= 0 ? '→' : '←'} ${'▮'.repeat(voll)}${'▯'.repeat(anzahl - voll)}`;
}
