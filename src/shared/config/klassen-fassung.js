/**
 * Klassenfassung (`config.klassen` im Replay-Kopf).
 *
 * `balance:classes` (2026-10-28) zeigte den Scout mit allen Archetypen gut ein Viertel hinter
 * Artillery und Heavy (Mittel 3,42 gegen 4,29 und 4,11): Leben, Wucht und Schusstempo lagen
 * zugleich unten. Die Anhebung ändert Werte, die jede Aufzeichnung mit Scout verändern würden.
 * Deshalb gilt wie bei `waffen` und `gelaende`:
 *
 *   - `KLASSEN_ALT` (1): die Werte aus `CLASS_DEFINITIONS` in `classes.js`. Eine Aufzeichnung
 *     OHNE `klassen` im Kopf ist `KLASSEN_ALT`; ebenso ein `MatchController` ohne Option.
 *   - `KLASSEN_SCOUT` (2, Standard neuer Partien): Scout mit `power` 0,85 und `health` 0,95;
 *     `speed` bleibt 1,2, er bleibt der Beweglichste, mit der kleinsten Wucht.
 *
 * `KLASSEN_F2_WERTE` hält nur die Felder, die Fassung 2 gegenüber Fassung 1 ändert.
 *
 * @module config/klassen-fassung
 */
export const KLASSEN_ALT = 1;
export const KLASSEN_SCOUT = 2;
export const KLASSEN_STANDARD = KLASSEN_SCOUT;

/** Unbekannte Werte fallen auf den Standard (wie `normalisiereWaffen`); das Fehlen im Replay-Kopf löst `fromJSON` auf ALT auf. */
export function normalisiereKlassen(fassung) {
  return fassung === KLASSEN_ALT || fassung === KLASSEN_SCOUT ? fassung : KLASSEN_STANDARD;
}

/** Felder, die Fassung 2 je Klasse über die Tabelle von Fassung 1 legt. */
export const KLASSEN_F2_WERTE = Object.freeze({
  scout: Object.freeze({ power: 0.85, health: 0.95 }),
});

/** Klassenrohdaten unter einer Fassung: Tabelle + (ab Fassung 2) die Änderungen. */
export function klassenWerte(tabelle, classId, fassung = KLASSEN_ALT) {
  const basis = tabelle[classId];
  if (!basis || normalisiereKlassen(fassung) < KLASSEN_SCOUT) return basis;
  const zusatz = KLASSEN_F2_WERTE[classId];
  return zusatz ? Object.freeze({ ...basis, ...zusatz }) : basis;
}
