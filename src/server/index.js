/**
 * Projekt-Armageddon Server-Index
 * Exportiert Server-spezifische Module (ohne Client-Abhängigkeiten).
 *
 * @module server/index
 */

export { createServerRuntime, createGameWorld, registerDefaultComponents, SYSTEM_PRIORITIES } from '../engine/init.js';
export { HeadlessRuntime } from '../engine/headless.js';
export { terrainMaskFromBitmap, terrainMaskFromRows } from '../engine/terrain/terrainLoader.js';
export { MatchController, MAP_WIDTH, MAP_HEIGHT } from '../engine/match.js';
export { World } from '../engine/ecs/world.js';
export { ComponentStore, COMPONENT_SIGNATURES } from '../engine/ecs/componentStore.js';
export { EntityManager } from '../engine/ecs/entityManager.js';
export { TurnSystem, getTurnDurationForPlayerCount } from '../engine/systems/turnSystem.js';
export { DamageSystem } from '../engine/systems/damageSystem.js';
export { PhysicsSystem } from '../engine/systems/physicsSystem.js';
export { ProjectileSystem } from '../engine/systems/projectileSystem.js';
export { CharacterSystem } from '../engine/systems/characterSystem.js';
export { MaelstromSystem } from '../engine/systems/maelstromSystem.js';
export { LootSystem } from '../engine/systems/lootSystem.js';
export { WaterField } from '../engine/waterField.js';
export { EventBus } from '../engine/events.js';
export { PlayerInventory } from '../engine/inventory.js';
export { ProjectilePool } from '../engine/pooling/projectilePool.js';
export { CollisionMask } from '../engine/terrain/collisionMask.js';
export { computeTrajectory, ccdRaycast } from '../engine/physics/ballistics.js';

// Multiplayer
export { GameServer, LobbySession, startServer, SIMULATION_HZ, SNAPSHOT_HZ } from './gameServer.js';
export { LobbyManager, LOBBY_STATUS, MAX_LOBBY_PLAYERS } from './lobby.js';
export { SnapshotHistory, DEFAULT_HISTORY_MS } from './lagCompensation.js';
export { BotController } from './bot.js';

// Netzwerkprotokoll & Validierung
export {
  PROTOCOL_VERSION,
  MESSAGE_TYPE,
  CONTROL,
  encodeSnapshot,
  decodeSnapshot,
  controlMessage,
  parseControlMessage,
} from '../shared/protocol.js';
export { validateCommand, normalizeInput, isTickInWindow, INPUT_LIMITS } from '../shared/validation.js';

// Shared-Config
export { GAME_RULES } from '../shared/config/rules.js';
export { MATCH_RULES, computeMaelstromDamage } from '../shared/config/match.js';
export { NETWORK_RULES } from '../shared/config/network.js';
export { COMBAT_RULES } from '../shared/config/combat.js';
export { LOOT_DROP_RULES, createPseudoRandomDropState, getRareChanceWithPrd, weightedRarity, rollCrateCount, rollCrateContents, rollGamechanger, createLootSeedManager, getLootRng } from '../shared/config/loot.js';
export { CLASS_DEFINITIONS, CLASS_ARCHETYPES, CLASS_IDS, ARCHETYPE_IDS, combatProfile, allCombatProfiles } from '../shared/config/classes.js';
export { WEAPONS, WEAPONS_BY_ID, getWeapon, getDefaultLoadout, FALLBACK_WEAPON_ID } from '../shared/config/weapons.js';
export { generateTerrain, TERRAIN_PRESETS } from '../shared/terrainGen.js';

// PRNG & Seed (kritisch für Determinismus)
export { SeededRandom, createRng, generateSeed, hashToSeed } from '../shared/prng.js';
export { MatchSeedManager, SEED_OFFSETS, createMatchRng } from '../shared/seed.js';
