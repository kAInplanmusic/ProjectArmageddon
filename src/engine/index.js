/**
 * Projekt-Armageddon Engine Index
 * Exportiert alle ECS-Komponenten, Systeme und Utilities.
 *
 * Plus AAB-Regeln (Arsenalwert-System):
 * - arsenalwert(), computeArsenalwert(), computeKampfwert(), computeHybridWert()
 * - bewerteFairness(), istUnterversorgt(), aabStatus()
 * - WAFFEN_HISTORIE (Singleton für 3-Züge-Waffenhistorie)
 *
 * @module engine/index
 */

// ECS-Kern
export { ComponentStore, COMPONENT_SIGNATURES } from './ecs/componentStore.js';
export { EntityManager } from './ecs/entityManager.js';
export { World } from './ecs/world.js';

// Systeme
export { TurnSystem, getTurnDurationForPlayerCount, getTurnDurationForSize } from './systems/turnSystem.js';
export { DamageSystem } from './systems/damageSystem.js';
export { PhysicsSystem, computeLinearDragPosition } from './systems/physicsSystem.js';

// Terrain
export { CollisionMask } from './terrain/collisionMask.js';

// Physik/Ballistik
export { computeTrajectory, computeAimAngle, ccdRaycast } from './physics/ballistics.js';

// Engine-Initialisierung
export { createGameWorld } from './init.js';
export { HeadlessRuntime } from './headless.js';
export { terrainMaskFromBitmap, terrainMaskFromRows } from './terrain/terrainLoader.js';

// AAB-Regeln (Arsenalwert-System)
export {
  arsenalwert,
  computeArsenalwert,
  computeKampfwert,
  computeHybridWert,
  bewerteFairness,
  istUnterversorgt,
  aabStatus,
  WAFFEN_HISTORIE,
} from './aab.js';
