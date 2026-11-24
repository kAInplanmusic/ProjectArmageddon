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
 *   - `ZUGREGELN_FLOTT` (3, TODO 2.8): wie 2, Rückzugszeit 3 statt 5 Sekunden (`ZUGREGELN.rueckzugSekundenFlott`). Messung
 *     (Bot-Partien, Median je Zug): Flug 1 s, danach 5 s Rückzug und 3 s Zugpause, also rund 8 s Warten je Zug.
 *
 * Audit-Befund (`MASTERDOTO.md`, „Standardmechaniken"): Eine Worms-artige Runde kennt diese drei Dinge; sie fehlten.
 *
 * Reine Daten, kein Zufall, keine Uhr. Einheiten: Sekunden (Anzeige) und Takte (60 Hz, Simulation).
 *
 * @module config/zugregeln
 */

export const ZUGREGELN_ALT = 1;
export const ZUGREGELN_RUECKZUG = 2;
export const ZUGREGELN_FLOTT = 3;
export const ZUGREGELN_STANDARD = ZUGREGELN_FLOTT;

/** Unbekannte Werte fallen auf den Standard (wie `normalisiereBewegung`); das Fehlen im Replay-Kopf löst `fromJSON` auf ALT auf. */
export function normalisiereZugregeln(fassung) {
  return fassung === ZUGREGELN_ALT || fassung === ZUGREGELN_RUECKZUG || fassung === ZUGREGELN_FLOTT ? fassung : ZUGREGELN_STANDARD;
}

export const ZUGREGELN = Object.freeze({
  /** Rückzugszeit nach dem Schuss (Worms „Retreat"), Fassung 2: nur Gehen und Springen, kein weiterer Schuss. */
  rueckzugSekunden: 5,
  /** Fassung 3: dieselbe Frist, kürzer (wie die übliche Vorgabe des Genres). */
  rueckzugSekundenFlott: 3,
  /** Höchstens so oft hintereinander darf derselbe Spieler seinen Zug überspringen; ein Schuss setzt den Zähler zurück. */
  maxUeberspringenInFolge: 2,
  /** Server: Mindestabstand zwischen zwei Überspringen-/Aufgeben-Nachrichten je Sitz (ms), gegen Dauerfeuer. */
  nachrichtenAbstandMs: 500,
});

/** Rückzugszeit (Sekunden) einer Fassung: 5 in Fassung 2, 3 ab Fassung 3. */
export function rueckzugSekundenFuer(fassung) {
  return fassung >= ZUGREGELN_FLOTT ? ZUGREGELN.rueckzugSekundenFlott : ZUGREGELN.rueckzugSekunden;
}
