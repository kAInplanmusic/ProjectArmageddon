/**
 * Ereignisfassung: Naturereignisse, Unglücke und Besucher (TODO 2.13, Wunsch des Auftraggebers 2026-11-28).
 * Marke im Replay-Kopf (`config.ereignisse`, AGENTS.md §2):
 *
 *   - `EREIGNISSE_ALT` (1): keine Ereignisse. Das Feld FEHLT in jeder Datei aus der Zeit davor; der Motor holt dann keinen
 *     Zufallsstrom und greift nicht ein (bitgleich).
 *   - `EREIGNISSE_START` (2): `engine/systems/ereignisSystem.js` mit den ersten drei Ereignissen: Blondine, Gewitter, Erdbeben.
 *
 * ## Regeln der Fassung 2
 *
 * - Ab Runde `abRunde` zieht der Motor zu Rundenbeginn aus dem Zweig `EREIGNISSE` (`shared/seed.js`), ob ein Ereignis
 *   kommt (`chance`) und welches (`gewichte`). Höchstens eines je Runde.
 * - **Blondine:** trifft eine zufällige lebende Figur. Verhältnis Kuss : Auslachen = 8 : 1 (Entscheidung 2026-11-28).
 *   Kuss heilt `kussMin`–`kussMax` (nicht über die Höchstlebenspunkte), Auslachen nimmt `auslachen` (kann töten:
 *   ausdrücklicher Wunsch des Auftraggebers).
 * - **Gewitter:** `blitzMin`–`blitzMax` Blitze; jeder schlägt in den höchsten von drei gezogenen Punkten ein (Blitze
 *   suchen die Höhe), reißt einen kleinen Krater und trifft Figuren im Umkreis mit `blitzSchadenMin`–`blitzSchadenMax`.
 * - **Erdbeben:** jede lebende Figur nimmt `bebenSchaden` und wird seitlich gestoßen.
 * - **Nie tödlich bei Wetter und Beben** (wie der Hagel, `config/hagel.js`): Ein Naturereignis hat keinen Schützen; es
 *   lässt mindestens 1 Leben übrig. Die Blondine ist eine Figur mit Absicht und darf töten.
 *
 * Reine Daten, kein Zufall, keine Uhr.
 *
 * @module config/ereignisse
 */

export const EREIGNISSE_ALT = 1;
export const EREIGNISSE_START = 2;
export const EREIGNISSE_STANDARD = EREIGNISSE_START;

export const EREIGNISSE = Object.freeze({
  abRunde: 2,
  chance: 0.3,
  gewichte: Object.freeze({ blondine: 1, gewitter: 1, erdbeben: 0.8 }),
  kussZuAuslachen: Object.freeze([8, 1]),
  kussMin: 10,
  kussMax: 50,
  auslachen: 69,
  blitzMin: 1,
  blitzMax: 3,
  blitzRadius: 45,
  blitzKrater: 14,
  blitzSchadenMin: 15,
  blitzSchadenMax: 25,
  bebenSchaden: 5,
  bebenStoss: 2.5,
});

/** Unbekannte Werte fallen auf die alte Fassung (keine Ereignisse), damit eine fremde Angabe nichts einschaltet. */
export function normalisiereEreignisse(fassung) {
  return fassung === EREIGNISSE_START ? fassung : EREIGNISSE_ALT;
}
