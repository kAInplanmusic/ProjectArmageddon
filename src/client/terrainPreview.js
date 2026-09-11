/**
 * Clientseitige Terrain-Vorschau für den Online-Modus.
 *
 * Das Terrain ist eine reine Funktion aus Match-Seed, Preset und Kartengröße. Der
 * Client erzeugt deshalb exakt dieselbe Landschaft wie der Server, ohne die
 * Simulation zu duplizieren. Zerstörung wird anschliessend über die Ereignisse des
 * Servers (terrain_destroyed, maelstrom_contract) auf dieselbe Weise nachgezogen
 * wie lokal.
 *
 * @module terrainPreview
 */
import { CollisionMask } from '../engine/terrain/collisionMask.js';
import { generateTerrain } from '../shared/terrainGen.js';
import { MatchSeedManager } from '../shared/seed.js';
import { MAP_SIZES, mapSizeFor } from '../engine/match.js';

/**
 * @param {number} seed
 * @param {string} [preset='hills']
 * @param {string} [orientation='landscape'] - 'landscape' oder 'portrait'
 */
export function buildTerrainForSeed(seed, preset = 'hills', orientation = 'landscape') {
  const masse = mapSizeFor(orientation);
  const manager = new MatchSeedManager(seed);
  const { bitmap, waterLevel } = generateTerrain({
    rng: manager.getSubRng('TERRAIN'),
    width: masse.width,
    height: masse.height,
    preset,
  });
  return {
    bitmap,
    mask: CollisionMask.fromBitmap(bitmap, masse.width, masse.height),
    waterLevel,
    width: masse.width,
    height: masse.height,
  };
}

export { MAP_SIZES };
export default buildTerrainForSeed;
