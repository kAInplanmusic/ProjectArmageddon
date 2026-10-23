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
export { computeTrajectory, ccdRaycast } from '../engine/physics/ballistics.js';

// Shared-Config, PRNG & Seed — EINE Quelle für Client- und Server-Barrel
// (Warteschlange 2.8: vorher 14 wortgleiche Zeilen in beiden Barrels).
export * from '../shared/index.js';
