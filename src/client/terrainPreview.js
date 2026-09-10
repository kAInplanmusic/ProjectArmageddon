/**
 * Clientseitige Terrain-Vorschau für den Online-Modus.
 *
 * Das Terrain ist eine reine Funktion aus Match-Seed und Preset. Der Client
 * erzeugt deshalb exakt dieselbe Landschaft wie der Server, ohne die Simulation
 * zu duplizieren. Zerstörung wird anschliessend über die Ereignisse des Servers
 * (terrain_destroyed, maelstrom_contract) auf dieselbe Weise nachgezogen wie lokal.
 *
 * @module terrainPreview
 */
import { CollisionMask } from '../engine/terrain/collisionMask.js';
import { generateTerrain } from '../shared/terrainGen.js';
import { MatchSeedManager } from '../shared/seed.js';
import { MAP_WIDTH, MAP_HEIGHT } from '../engine/match.js';

export function buildTerrainForSeed(seed, preset = 'hills') {
  const manager = new MatchSeedManager(seed);
  const { bitmap, waterLevel } = generateTerrain({
    rng: manager.getSubRng('TERRAIN'),
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    preset,
  });
  return {
    bitmap,
    mask: CollisionMask.fromBitmap(bitmap, MAP_WIDTH, MAP_HEIGHT),
    waterLevel,
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
  };
}

export default buildTerrainForSeed;
