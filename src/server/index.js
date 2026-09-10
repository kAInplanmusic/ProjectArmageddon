/**
 * Projekt-Armageddon Server-Index
 * Exportiert Server-spezifische Module (ohne Client-Abhängigkeiten).
 *
 * @module server/index
 */

export { createServerRuntime, createGameWorld, registerDefaultComponents, SYSTEM_PRIORITIES } from '../engine/init.js';
export { HeadlessRuntime } from '../engine/headless.js';
export { terrainMaskFromBitmap, terrainMaskFromRows } from '../engine/terrain/terrainLoader.js';
export { World } from '../engine/ecs/world.js';
export { ComponentStore, COMPONENT_SIGNATURES } from '../engine/ecs/componentStore.js';
export { EntityManager } from '../engine/ecs/entityManager.js';
export { TurnSystem, getTurnDurationForPlayerCount } from '../engine/systems/turnSystem.js';
export { DamageSystem } from '../engine/systems/damageSystem.js';
export { PhysicsSystem } from '../engine/systems/physicsSystem.js';
export { ProjectilePool } from '../engine/pooling/projectilePool.js';
export { CollisionMask } from '../engine/terrain/collisionMask.js';
export { computeTrajectory, ccdRaycast } from '../engine/physics/ballistics.js';

// Shared-Config
export { GAME_RULES } from '../shared/config/rules.js';
export { MATCH_RULES, computeMaelstromDamage } from '../shared/config/match.js';
export { NETWORK_RULES } from '../shared/config/network.js';
export { COMBAT_RULES } from '../shared/config/combat.js';
export { LOOT_DROP_RULES, createPseudoRandomDropState, getRareChanceWithPrd, weightedRarity, rollCrateCount, rollCrateContents, rollGamechanger, createLootSeedManager, getLootRng } from '../shared/config/loot.js';
export { CLASS_DEFINITIONS, CLASS_ARCHETYPES, applyClassModifiers, applyArchetypeModifiers } from '../shared/config/classes.js';

// PRNG & Seed (kritisch für Determinismus)
export { SeededRandom, createRng, generateSeed, hashToSeed } from '../shared/prng.js';
export { MatchSeedManager, SEED_OFFSETS, createMatchRng } from '../shared/seed.js';
