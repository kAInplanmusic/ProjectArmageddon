export * from './config/classes.js';
export * from './config/combat.js';
export * from './config/loot.js';
export * from './config/match.js';
export * from './config/network.js';
export * from './config/player.js';
export * from './config/rules.js';
export * from './config/water.js';
export * from './prng.js';
export * from './seed.js';

/*
 * Dieser Balken wird von Client UND Server gemeinsam genutzt. Alles, was hier
 * re-exportiert wird, muss im Browser laufen — deshalb steht hier KEIN Modul
 * mit Node-Builtins (`node:fs` gibt es dort nicht).
 *
 * HISTORIE: Genau deshalb war `src/shared/data/` nie re-exportiert. Der Ordner
 * enthielt zuletzt nur noch einen code-leeren Platzhalter; er ist am 2026-10-01
 * entfernt (Belege: `ARCHIVED.md`, `tests/source-boundaries.test.js`). Die Regel
 * gilt weiter: Wer eine serverseitige Datei unter `src/shared/` braucht, trägt
 * sie in die Ausnahmeliste des Grenztests ein — nicht in diesen Balken.
 */
