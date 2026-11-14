/**
 * Match-Konstanten, die vom Client-Menü und Renderer gebraucht werden, ohne den
 * gesamten Motor (`engine/match.js` mit MatchController) zu laden.
 *
 * Dies ermöglicht Code-Splitting: `main.js` importiert `MatchController` nur
 * dynamisch beim Matchstart, während Menü, Renderer & HUD die Konstanten
 * statisch aus diesem Modul beziehen.
 *
 * @module match-konstanten
 */
import { CLASS_IDS, ARCHETYPE_IDS } from './classes.js';

/** Skalierung Wasser-Textur (1 Wasser-Pixel = 4 Karten-Pixel). */
export const WATER_SCALE = 4;

/** Teamfarben — 8 Farben, paarweise deutlich unterscheidbar (hell/dunkel). */
export const TEAM_COLORS = Object.freeze([
  '#4cc9f0', // 1 türkis
  '#f4a261', // 2 orange
  '#e63946', // 3 rot
  '#9d4edd', // 4 violett
  '#f72585', // 5 magenta
  '#90be6d', // 6 grün
  '#4d7cfe', // 7 blau
  '#e9c46a', // 8 sand
]);

/** Klassen-IDs in der Reihenfolge der Konfiguration (`classes.js`). */
export { CLASS_IDS, ARCHETYPE_IDS };