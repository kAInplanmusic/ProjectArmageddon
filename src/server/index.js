import { World } from '../engine/ecs/world.js';
import { PhysicsSystem } from '../engine/systems/physicsSystem.js';
import { createDefaultTerrain } from '../engine/terrain/terrainEngine.js';
import { ProjectArmageddonWorldAdapter } from '../engine/weapons/projectArmageddonWorldAdapter.js';
import { WeaponEngine } from '../engine/weapons/weaponEngine.js';
import { NETWORK_RULES } from '../shared/config/network.js';
import { loadProjectArmageddonWeaponDatabase } from '../shared/data/index.js';

export function createServerRuntime({
  world: suppliedWorld,
  terrain: suppliedTerrain,
  weaponDatabase = loadProjectArmageddonWeaponDatabase(),
  gravity = 980,
  terrainWidth = 128,
  terrainHeight = 72,
  terrainCellSize = 16
} = {}) {
  const world = suppliedWorld ?? new World();
  world.registerSystem(new PhysicsSystem());
  const terrain = suppliedTerrain ?? createDefaultTerrain(terrainWidth, terrainHeight, terrainCellSize);
  const combatAdapter = new ProjectArmageddonWorldAdapter({ world, terrain, gravity });
  const weaponEngine = new WeaponEngine(weaponDatabase);

  return {
    authoritative: NETWORK_RULES.authoritativeServer,
    protocol: NETWORK_RULES.protocol,
    world,
    terrain,
    combatAdapter,
    weaponEngine,
    spawnCombatant({
      x = 0,
      y = 0,
      vx = 0,
      vy = 0,
      radius = 6,
      team = null,
      health = 100,
      maxHealth = health
    } = {}) {
      const entityId = world.createEntity();
      world.components.setPosition(entityId, x, y);
      world.components.setVelocity(entityId, vx, vy);
      combatAdapter.registerEntity(String(entityId), {
        entityId,
        team,
        radius,
        health,
        maxHealth,
        alive: true
      });
      return entityId;
    },
    fireWeapon({
      entityId,
      weaponId,
      direction,
      origin,
      now = 0
    }) {
      const combatantId = String(entityId);
      const fireOrigin = origin ?? combatAdapter.getEntityPosition(combatantId);
      return weaponEngine.fire(combatAdapter, combatantId, weaponId, fireOrigin, direction, now);
    },
    stepSimulation(deltaSeconds = world.fixedDeltaSeconds) {
      world.step();
      const weaponEvents = weaponEngine.update(combatAdapter, deltaSeconds);
      terrain.step(deltaSeconds);

      return {
        weaponEvents,
        terrainEvents: terrain.consumeEvents(),
        adapterEvents: combatAdapter.consumeEvents()
      };
    }
  };
}
