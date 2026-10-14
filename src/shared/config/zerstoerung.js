/**
 * Zerstörungsfassung: Kraterform und Nachrutschen des Geländes.
 *
 * ## Warum es eine Versionsmarke gibt (AGENTS.md §2)
 *
 * Raue Krater und nachstürzende Geländeinseln ändern die Kollisionsmaske und
 * damit jeden Verlauf, der danach gespielt wird. Eine alte Aufzeichnung muss
 * aber unverändert laufen. Deshalb trägt der Replay-Kopf `config.zerstoerung`
 * (wie `config.kit`):
 *
 *   - `ZERSTOERUNG_ALT` (1): Krater sind perfekte Kreise, nichts stürzt nach.
 *     Das Feld FEHLT in jeder Datei aus der Zeit davor — `ReplayRecorder.fromJSON`
 *     setzt dann diesen Wert.
 *   - `ZERSTOERUNG_GELAENDE` (2): raue Krater mit waffenabhängiger Tiefe und
 *     Nachrutschen freischwebender Geländeinseln (`engine/zerstoerung.js`).
 *
 * Neue Aufzeichnungen tragen IMMER das Feld.
 *
 * @module config/zerstoerung
 */

export const ZERSTOERUNG_ALT = 1;
export const ZERSTOERUNG_GELAENDE = 2;
export const ZERSTOERUNG_STANDARD = ZERSTOERUNG_GELAENDE;

/** Unbekannte Werte fallen auf den Standard (wie `normalisiereKit`). */
export function normalisiereZerstoerung(fassung) {
  return fassung === ZERSTOERUNG_ALT || fassung === ZERSTOERUNG_GELAENDE ? fassung : ZERSTOERUNG_STANDARD;
}

/**
 * Tiefe eines Kraters in Prozent des Radius (unterhalb des Einschlagpunkts).
 *
 * Grabende Waffen (nur `terrainDamage`, kein Flächenradius: Spaten, Bohrer,
 * Schwerschlag) graben tief und schmal wirkend; reine Sprengwaffen (nur
 * `blastRadius`) reißen eine flache, weite Mulde; Mischformen liegen dazwischen.
 * Winzige Löcher (Direkttreffer, Radius ≤ 5) bleiben rund.
 *
 * Ganzzahl in Prozent: Sie reist im Ereignis und im Kraterlog mit, und der
 * Client rechnet damit dieselbe Form wie der Server.
 */
export function kraterTiefeProzent(terrainDamage, blastRadius, radius) {
  if (!(radius > 5)) return 100;
  if (terrainDamage > 0 && !(blastRadius > 0)) return 135;
  if (terrainDamage > 0) return 115;
  return 85;
}

/** Größte Insel (Zellen), die noch nachstürzt; größere Massen gelten als gewachsener Fels. */
export const INSEL_MAX_ZELLEN = 6000;
/** Besuchte Zellen je Tick für die Inselsuche (Kostenbudget; die Suche setzt im nächsten Tick fort). */
export const SUCH_BUDGET_PRO_TICK = 9000;
/** Gesamtbudget einer Krater-Analyse in Vielfachen von `INSEL_MAX_ZELLEN`; der Rest gilt als verankert. */
export const SUCH_BUDGET_FAKTOR = 4;
/** Fallbeschleunigung einer Insel (px/Tick²) und Höchsttempo (px/Tick). */
export const INSEL_GRAVITATION = 0.45;
export const INSEL_TEMPO_MAX = 10;
/** Schaden an Figuren, die eine landende Insel unter sich begräbt. */
export const INSEL_QUETSCH_SCHADEN = 20;
/** Fallbeschleunigung loser Objekte (Kisten, Geschütze) nach Bodenverlust. */
export const OBJEKT_GRAVITATION = 0.5;
