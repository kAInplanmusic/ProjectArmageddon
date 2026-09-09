/**
 * Kampf-Regel-Konfiguration für ProjectArmageddon.
 *
 * Definiert die Reihenfolge von Schadens- und Widerstand-Berechnungen.
 */
export const COMBAT_RULES = Object.freeze({
  damageApplicationOrder: 'flat-then-percent',
  resistanceCap: 0.75,
  criticalMultiplier: 1.5,
  blockThreshold: 0.3
});
