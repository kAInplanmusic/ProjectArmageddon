/**
 * Der Ablauf einer Revanche (UI-4) — als reine Funktion, ohne `Game`.
 *
 * ## Der Befund
 *
 * Der Knopf öffnete nur das Menü; die alte Partie lief weiter. `match` und
 * `mode` blieben stehen, und die Taste R fragte danach „Match verlassen?".
 *
 * ## Der Ablauf (docs/plan-produktion.md §1: echter Neustart)
 *
 *  1. Seed der eben gespielten Partie lesen — NACH dem Aufräumen ist `match`
 *     weg und der Seed unbekannt.
 *  2. Zustand aufräumen (`#verlasseMatch`: `match = null`, `mode = 'local'`,
 *     Menü zeigen).
 *  3. Lokal sofort neu starten, mit der gemerkten Konfiguration und dem Seed.
 *     Online entscheidet der Server über die neue Partie: dort führt der Weg
 *     ins Menü — aber ebenfalls erst nach dem Aufräumen.
 *
 * Die Reihenfolge ist der Kern; sie steht hier an EINER Stelle und wird in
 * `tests/revanche.test.js` mit Platzhaltern nachgewiesen.
 *
 * @module revanche
 */

/**
 * @param {object} optionen
 * @param {() => (number|null)} optionen.seedLesen - liest den Seed der Vorpartie
 * @param {() => void} optionen.aufraeumen - leert Match-Zustand und zeigt das Menü
 * @param {(konfig: object) => object} optionen.starten - startet ein lokales Match
 * @param {object|null} optionen.konfiguration - Konfiguration der Vorpartie
 * @param {boolean} [optionen.nurMenue] - kein lokaler Neustart (online/Replay):
 *   der Server entscheidet bzw. es gibt keine Partie, die neu beginnen könnte
 * @param {(text: string, art?: string) => void} [optionen.log]
 * @returns {{ok: boolean, mode?: string, errors?: string[]}}
 */
export function revancheAblauf({
  seedLesen, aufraeumen, starten, konfiguration = null, nurMenue = false, log = () => {},
} = {}) {
  const seed = seedLesen?.() ?? null;
  aufraeumen?.();

  if (nurMenue) {
    log('Revanche: neue Partie über das Menü — Seed bleibt eingetragen', 'notice');
    return { ok: true, mode: 'menu' };
  }
  if (!konfiguration) {
    log('Revanche ohne bekannte Match-Konfiguration — bitte im Menü starten', 'notice');
    return { ok: false, errors: ['Keine Match-Konfiguration'] };
  }
  // Frischer Lauf: neuer `MatchController`, neuer Zugzustand, dieselbe Karte.
  return starten?.({ ...konfiguration, seed: seed ?? undefined })
    ?? { ok: false, errors: ['Kein Start'] };
}

export default revancheAblauf;
