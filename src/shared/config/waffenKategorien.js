/**
 * Die acht Waffenkategorien des Katalogs (`config/weapons.js`).
 *
 * Klangprofile (`client/klangProfile.js`) und Waffenanimation (`client/waffenAnimation.js`)
 * müssen dieselbe Reihenfolge und dieselben Kennungen kennen; beide lasen die Liste bisher
 * als eigene Kopie. Der Katalog selbst ist auto-generiert und trägt keine exportierte
 * Kategorienliste, deshalb steht sie hier einmal.
 *
 * @module config/waffenKategorien
 */

export const KATEGORIEN = Object.freeze([
  'melee', 'ranged', 'heavy_ranged', 'elemental', 'magic', 'tech', 'utility', 'ultimate',
]);

export default KATEGORIEN;
