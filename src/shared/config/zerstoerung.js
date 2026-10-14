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
 *     Nachrutschen freischwebender Geländeinseln (`engine/zerstoerung.js`);
 *     Massen über 6000 Zellen gelten als gewachsener Fels.
 *   - `ZERSTOERUNG_SCHOLLEN` (3): wie 2, aber auch große Schollen (bis 60 000
 *     Zellen) stürzen nach; die Suche läuft dafür auch MITTEN in einer Masse über
 *     mehrere Ticks weiter statt eine Masse am Stück abzuarbeiten. Aufzeichnungen
 *     mit Fassung 2 laufen mit den alten Grenzen unverändert.
 *
 * Neue Aufzeichnungen tragen IMMER das Feld.
 *
 * @module config/zerstoerung
 */

export const ZERSTOERUNG_ALT = 1;
export const ZERSTOERUNG_GELAENDE = 2;
export const ZERSTOERUNG_SCHOLLEN = 3;
export const ZERSTOERUNG_STANDARD = ZERSTOERUNG_SCHOLLEN;

/** Unbekannte Werte fallen auf den Standard (wie `normalisiereKit`). */
export function normalisiereZerstoerung(fassung) {
  return fassung === ZERSTOERUNG_ALT || fassung === ZERSTOERUNG_GELAENDE || fassung === ZERSTOERUNG_SCHOLLEN
    ? fassung : ZERSTOERUNG_STANDARD;
}

/**
 * Suchgrenzen einer Fassung (ab `ZERSTOERUNG_GELAENDE`).
 *
 * Fassung 2: Massen über 6000 Zellen gelten als Fels, eine Masse wird in EINEM Tick
 * zu Ende gefüllt. Fassung 3: Schollen bis 60 000 Zellen fallen, und auch die Füllung
 * einer einzelnen Masse ist auf `SUCH_BUDGET_PRO_TICK` je Tick begrenzt (sie setzt im
 * nächsten Tick fort), damit ein Tick nie mehr als das Budget kostet.
 *
 * @returns {{maxZellen:number, faktor:number, fortsetzen:boolean}}
 */
export function suchGrenzen(fassung) {
  if (fassung >= ZERSTOERUNG_SCHOLLEN) return { maxZellen: INSEL_MAX_ZELLEN_SCHOLLEN, faktor: SUCH_BUDGET_FAKTOR, fortsetzen: true };
  return { maxZellen: INSEL_MAX_ZELLEN, faktor: SUCH_BUDGET_FAKTOR, fortsetzen: false };
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
/** Fassung 3: größte Scholle (Zellen), die noch nachstürzt (rund 245 × 245 px). */
export const INSEL_MAX_ZELLEN_SCHOLLEN = 60000;
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
