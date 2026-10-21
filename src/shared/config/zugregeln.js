/**
 * Zugregelfassung: Rückzugszeit, Zug überspringen, Aufgeben (`config.zugregeln` im Replay-Kopf).
 *
 * ## Warum es eine Versionsmarke gibt (AGENTS.md §2)
 *
 * Alle drei Regeln verändern den Ablauf einer Partie (wann der nächste Zug beginnt, wer noch lebt) und damit den
 * Zustandshash. Eine alte Aufzeichnung muss dieselbe Partie ergeben wie damals:
 *
 *   - `ZUGREGELN_ALT` (1): Der Zug endet, sobald nach dem Schuss nichts mehr fliegt. Kein Überspringen, kein Aufgeben.
 *     Das Feld FEHLT in jeder Datei aus der Zeit davor.
 *   - `ZUGREGELN_RUECKZUG` (2): `systems/zugSystem.js` — Rückzugszeit nach dem Schuss, Zug überspringen (begrenzt),
 *     Aufgeben.
 *
 * Audit-Befund (`MASTERDOTO.md`, „Standardmechaniken"): Eine Worms-artige Runde kennt diese drei Dinge; sie fehlten.
 *
 * Reine Daten, kein Zufall, keine Uhr. Einheiten: Sekunden (Anzeige) und Takte (60 Hz, Simulation).
 *
 * @module config/zugregeln
 */

export const ZUGREGELN_ALT = 1;
export const ZUGREGELN_RUECKZUG = 2;
export const ZUGREGELN_STANDARD = ZUGREGELN_RUECKZUG;

/** Unbekannte Werte fallen auf den Standard (wie `normalisiereBewegung`); das Fehlen im Replay-Kopf löst `fromJSON` auf ALT auf. */
export function normalisiereZugregeln(fassung) {
  return fassung === ZUGREGELN_ALT || fassung === ZUGREGELN_RUECKZUG ? fassung : ZUGREGELN_STANDARD;
}

export const ZUGREGELN = Object.freeze({
  /** Rückzugszeit nach dem Schuss (Worms „Retreat"): nur Gehen und Springen, kein weiterer Schuss. */
  rueckzugSekunden: 5,
  /** Höchstens so oft hintereinander darf derselbe Spieler seinen Zug überspringen; ein Schuss setzt den Zähler zurück. */
  maxUeberspringenInFolge: 2,
  /** Server: Mindestabstand zwischen zwei Überspringen-/Aufgeben-Nachrichten je Sitz (ms), gegen Dauerfeuer. */
  nachrichtenAbstandMs: 500,
});
