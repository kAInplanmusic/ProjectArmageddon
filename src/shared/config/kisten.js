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
 *
 * @module config/kisten
 */

export const KISTEN_ALT = 1;
export const KISTEN_OFT = 2;
export const KISTEN_STANDARD = KISTEN_OFT;

/** Höchstzahl unaufgehobener Kisten gleichzeitig (nur Fassung 2). */
export const KISTEN_MAX_AUF_KARTE = 6;

/** Unbekannte Werte fallen auf den Standard (wie `normalisiereWaffen`). */
export function normalisiereKisten(fassung) {
  return fassung === KISTEN_ALT || fassung === KISTEN_OFT ? fassung : KISTEN_STANDARD;
}
