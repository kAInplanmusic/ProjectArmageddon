/**
 * Kistenfassung: wie oft die Drohne zu Rundenbeginn Kisten abwirft (`config.kisten` im Replay-Kopf).
 *
 * Messung 2026-10-15: Mit 10 % keine, 85 % eine, 5 % zwei Kisten je Runde fiel im Mittel
 * 0,95 Kiste pro Runde; wer nur das Start-Kit hat, fand zu selten neue Waffen. Eine höhere
 * Rate verändert die Zufallsziehungen jeder Runde und damit alte Aufzeichnungen. Deshalb
 * wie bei `kit`, `zerstoerung` und `waffen`:
 *
 *   - `KISTEN_ALT` (1): 10 % keine, 85 % eine, 5 % zwei; keine Obergrenze. Eine
 *     Aufzeichnung OHNE `kisten` im Kopf ist `KISTEN_ALT`.
 *   - `KISTEN_OFT` (2, Standard): 5 % keine, 45 % eine, 35 % zwei, 15 % drei (Mittel 1,6);
 *     dazu liegen höchstens `KISTEN_MAX_AUF_KARTE` unaufgehobene Kisten gleichzeitig auf der
 *     Karte (zählt auch abgeworfene Vorräte), damit sich nichts anhäuft.
 *   - `KISTEN_WAFFEN` (3, Standard): gleiche Raten und Obergrenze wie 2, aber drei Fehler der
 *     Ziehung behoben (Messung 2026-10-20, `scripts/loot-verteilung.mjs`):
 *       1. Der Inhalt `weapons` fand keinen Kistentyp (`CRATE_TYPES` kennt `weapon`): JEDE
 *          Waffenkiste wurde zur leeren Kiste. In Fassung 1 und 2 fiel aus Rundenkisten nie eine Waffe.
 *       2. Die Waffe wurde mit dem Stufengewicht JE WAFFE gezogen (55/25/12/6/2 mal Zahl der Waffen
 *          der Stufe): 72 % common, 1 % epic, 0,2 % legendary statt 55/25/12/6/2. Jetzt erst die
 *          Stufe nach Gewicht, dann gleichverteilt eine Waffe der Stufe.
 *       3. Die Kistenfarbe war immer `epic`; jetzt die Stufe der enthaltenen Waffe.
 *     Dazu `KISTEN_MUNITION_STUFE`: seltene Waffen liegen mit kleinerem Magazin in der Kiste.
 *     Auch Günthers Funde beim Wühlen folgen der Fassung des Matches.
 *   - `KISTEN_MUNITION` (4, Standard): wie 3, aber die Kiste mit dem Inhalt `empty` (10 %) ist eine MUNITIONSKISTE: sie füllt 1 bis 5 Schuss
 *     (gleichverteilt) in EINE zufällige begrenzte Waffe des Aufhebenden. Die Gewichte der Waffenkisten bleiben, Waffenkisten tragen kein
 *     Teilmagazin mehr (die Munitionsklasse der Waffenfassung 11 entscheidet, `config/munition.js`). Es gibt keine leeren Kisten mehr.
 *
 * @module config/kisten
 */

export const KISTEN_ALT = 1;
export const KISTEN_OFT = 2;
export const KISTEN_WAFFEN = 3;
export const KISTEN_MUNITION = 4;
export const KISTEN_STANDARD = KISTEN_MUNITION;

/**
 * Gewicht je Stufe bei der Ziehung der Fassung 3 (Summe 100, Anteil der Waffenkisten). Gegenüber
 * den Gewichten der Fassungen 1 und 2 (`RARITY_WEIGHTS`: 55/25/12/6/2) bekommt `rare` 6 Punkte von
 * `common`: Jede der 42 seltenen Waffen fiel sonst nur halb so oft wie eine der 8 epischen.
 */
export const KISTEN_STUFEN_GEWICHT = Object.freeze({ common: 49, uncommon: 25, rare: 18, epic: 6, legendary: 2 });

/**
 * Magazin einer Waffe in der Kiste, je Stufe (Fassung 3; fehlt die Stufe: volles Magazin).
 * Je höher die Stufe, desto weniger Schuss je Fund — sonst lagen 5 Meteore in einer Kiste.
 */
export const KISTEN_MUNITION_STUFE = Object.freeze({ rare: 3, epic: 2, legendary: 1 });

/** Höchstzahl unaufgehobener Kisten gleichzeitig (nur Fassung 2). */
export const KISTEN_MAX_AUF_KARTE = 6;

/** Unbekannte Werte fallen auf den Standard (wie `normalisiereWaffen`). */
export function normalisiereKisten(fassung) {
  return fassung === KISTEN_ALT || fassung === KISTEN_OFT || fassung === KISTEN_WAFFEN || fassung === KISTEN_MUNITION ? fassung : KISTEN_STANDARD;
}
