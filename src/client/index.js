/**
 * Projekt-Armageddon Client-Index
 * Exportiert Client-spezifische Module (inkl. Rendering).
 *
 * @module client/index
 */

export { createClientRuntime, createGameWorld } from '../engine/init.js';
export { World } from '../engine/ecs/world.js';
export { ComponentStore, COMPONENT_SIGNATURES } from '../engine/ecs/componentStore.js';
export { TurnSystem } from '../engine/systems/turnSystem.js';
export { DamageSystem } from '../engine/systems/damageSystem.js';
export { PhysicsSystem } from '../engine/systems/physicsSystem.js';
export { CollisionMask } from '../engine/terrain/collisionMask.js';
export { TerrainSync } from '../engine/terrain/terrainSync.js';
export { computeTrajectory, ccdRaycast } from '../engine/physics/ballistics.js';

// Shared-Config (wie Server)
export { GAME_RULES } from '../shared/config/rules.js';
export { MATCH_RULES, computeMaelstromDamage } from '../shared/config/match.js';
export { NETWORK_RULES } from '../shared/config/network.js';
export { COMBAT_RULES } from '../shared/config/combat.js';
export { LOOT_DROP_RULES, createPseudoRandomDropState, getRareChanceWithPrd, weightedRarity, rollCrateCount, rollCrateContents, rollGamechanger, createLootSeedManager, getLootRng } from '../shared/config/loot.js';
export { CLASS_DEFINITIONS, CLASS_ARCHETYPES, CLASS_IDS, ARCHETYPE_IDS, combatProfile, allCombatProfiles } from '../shared/config/classes.js';

// PRNG & Seed
export { SeededRandom, createRng, generateSeed, hashToSeed } from '../shared/prng.js';
export { MatchSeedManager, SEED_OFFSETS, createMatchRng } from '../shared/seed.js';
