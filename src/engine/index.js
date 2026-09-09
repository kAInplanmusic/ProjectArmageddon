/**
 * Projekt-Armageddon Engine Index
 * Exportiert alle ECS-Komponenten, Systeme und Utilities.
 *
 * @module engine/index
 */

// ECS-Kern
export { ComponentStore, COMPONENT_SIGNATURES } from './ecs/componentStore.js';
export { EntityManager } from './ecs/entityManager.js';
export { World } from './ecs/world.js';

// Systeme
export { TurnSystem, getTurnDurationForPlayerCount } from './systems/turnSystem.js';
export { DamageSystem } from './systems/damageSystem.js';
export { PhysicsSystem, computeLinearDragPosition } from './systems/physicsSystem.js';

// Pooling
export { ProjectilePool } from './pooling/projectilePool.js';

// Terrain
export { CollisionMask } from './terrain/collisionMask.js';
export { TerrainSync } from './terrain/terrainSync.js';

// Physik/Ballistik
export { computeTrajectory, computeAimAngle, ccdRaycast } from './physics/ballistics.js';
export { isWasmSupported } from './physics/ballisticsWasm.js';

// Engine-Initialisierung
export { createGameWorld } from './init.js';
