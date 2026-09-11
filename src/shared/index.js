export * from './config/classes.js';
export * from './config/combat.js';
export * from './config/loot.js';
export * from './config/match.js';
export * from './config/network.js';
export * from './config/rules.js';
export * from './config/water.js';
export * from './prng.js';
export * from './seed.js';

// Hinweis: src/shared/data/ wird hier BEWUSST nicht re-exportiert. Jenes Modul
// liest seine JSON-Dateien beim Laden über `node:fs` — im Browser gibt es das
// nicht, und dieser Balken wird von Client und Server gemeinsam genutzt. Wer die
// Daten im Server braucht, importiert direkt aus './data/index.js'.
