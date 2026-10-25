/**
 * Kurzform für eine Bodenvariante der Sonderbiome.
 *
 * `biome-neu.js`, `biome-themen.js` und `biome-planet.js` beschreiben ihre Einträge mit
 * demselben `{ surface, deep }`-Paar. Die Form ist ein gemeinsamer Vertrag der drei
 * Biomtabellen und steht deshalb an einer Stelle.
 *
 * @module config/biome-boden
 */

/** @param {string} surface - Stoff der Oberfläche @param {string} deep - Stoff in der Tiefe */
export const boden = (surface, deep) => ({ surface, deep });

export default boden;
