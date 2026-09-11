import { readFileSync } from 'node:fs';

function loadJson(relativePath) {
  return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), 'utf8'));
}

export function loadProjectArmageddonWeaponDatabase() {
  return loadJson('./projectArmageddonWeaponsV1.json');
}

export function loadTerrainMaterialDefinitions() {
  return loadJson('./terrainMaterialsV1.json');
}

export const PROJECT_ARMAGEDDON_WEAPON_DATABASE = loadProjectArmageddonWeaponDatabase();
export const TERRAIN_MATERIAL_DEFINITIONS = loadTerrainMaterialDefinitions();
