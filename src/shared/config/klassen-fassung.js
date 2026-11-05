/**
 * Klassenfassung (`config.klassen` im Replay-Kopf).
 *
 * Drei Fassungen, alle lesbar:
 *
 *   - `KLASSEN_ALT` (1): die alten Klassen `scout`/`heavy`/`artillery` mit den
 *     Archetypen `brawler`/`artillerist`/`occultist` — Werte aus
 *     `LEGACY_CLASS_DEFINITIONS` in `classes.js`. Eine Aufzeichnung OHNE
 *     `klassen` im Kopf ist `KLASSEN_ALT`; ebenso ein `MatchController` ohne
 *     Option (Altreplays bleiben so bitgleich).
 *   - `KLASSEN_SCOUT` (2): Fassung 1, aber der Scout mit `power` 0,85 und
 *     `health` 0,95 (Anhebung vom 2026-10-28). Nur für Altreplays.
 *   - `KLASSEN_NEU` (3, Standard neuer Partien): DREI Klassen ohne Unterklassen
 *     — `nahkampf`, `fernkampf`, `okkultist`. Keine Archetypen mehr; der
 *     Archetyp-Faktor ist neutral 1,0. Siehe `classes.js`.
 *
 * `KLASSEN_F2_WERTE` hält nur die Felder, die Fassung 2 gegenüber Fassung 1
 * ändert. Fassung 3 liest die neue Tabelle in `classes.js` und ignoriert diese
 * Änderungen, weil dort keine `scout`-Kennung mehr vorkommt.
 *
 * @module config/klassen-fassung
 */
export const KLASSEN_ALT = 1;
export const KLASSEN_SCOUT = 2;
/** Fassung 3: drei Klassen, keine Archetypen (`docs/anforderungen-2026-11-05.md` §6). */
export const KLASSEN_NEU = 3;
export const KLASSEN_STANDARD = KLASSEN_NEU;

/** Unbekannte Werte fallen auf den Standard (wie `normalisiereWaffen`); das Fehlen im Replay-Kopf löst `fromJSON` auf ALT auf. */
export function normalisiereKlassen(fassung) {
  return fassung === KLASSEN_ALT || fassung === KLASSEN_SCOUT || fassung === KLASSEN_NEU
    ? fassung
    : KLASSEN_STANDARD;
}

/** Ist das eine Fassung mit den drei neuen Klassen (≥ 3)? */
export function istKlassenfassungNeu(fassung = KLASSEN_STANDARD) {
  return normalisiereKlassen(fassung) >= KLASSEN_NEU;
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
