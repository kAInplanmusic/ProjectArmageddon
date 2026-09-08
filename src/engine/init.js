import { World } from './ecs/world.js';
import { TurnSystem } from './systems/turnSystem.js';
import { DamageSystem } from './systems/damageSystem.js';
import { applyClassModifiers } from './classes.js';
import { initUI, updateTurnInfo, showEntityDeath } from '../client/ui.js';
import { WeaponEngine } from './weaponEngine/index.js';
import { TerrainEngine } from './terrainEngine/index.js';

/**
 * Initialise the game world, register core systems and wire event listeners.
 * Returns the fully‑configured World instance.
 */
export function createGameWorld(players = [], turnDuration = 5) {
  const world = new World();

  const turnSystem = new TurnSystem(turnDuration, players);
  const damageSystem = new DamageSystem();

  // Initialise UI
  initUI();

  // Wire listeners – UI functions will be called.
  turnSystem.setTurnChangeListener(({ currentPlayer, elapsed }) => {
    updateTurnInfo(currentPlayer, elapsed, turnSystem.turnDuration);
  });

  damageSystem.setDeadListener(({ entityId }) => {
    showEntityDeath(entityId);
  });

  damageSystem.setDeathEffectHandler(({ entityId }) => {
    // For now just log – UI could display an effect.
    console.log('Spawn death effect for entity:', entityId);
  });

  // Register systems in execution order
  world.registerSystem(turnSystem);
  world.registerSystem(damageSystem);

  // Instantiate external engines
  const weaponEngine = new WeaponEngine({
    project: 'ProjectArmageddon',
    system: 'WeaponEngine',
    version: '1.0',
    iconCount: 0,
    weapons: []
  });
  const terrainEngine = new TerrainEngine({
    width: 64,
    height: 64,
    cellSize: 1,
    gravity: 0
  });

  // Simple wrapper system to tick the external engines each frame
  const externalEngineSystem = {
    update(world, dt) {
      // Minimal adapter for WeaponEngine – extend as needed
      const adapter = {
        gravity: 0,
        getEntities: () => [],
        raycastTerrain: () => null,
        queryTerrainCircle: (center, radius) => terrainEngine.queryCircle(center, radius),
        applyTerrainDamage: (cell, amount, source) => terrainEngine.applyDamage(cell, amount, source),
        applyEntityDamage: () => {},
        applyImpulse: () => {},
        addStatus: () => {},
        moveEntity: () => {},
        emit: () => {}
      };
      weaponEngine.update(adapter, dt);
      terrainEngine.step(dt);
    }
  };

  // Register the wrapper system
  world.registerSystem(externalEngineSystem);

  // Expose engines on the world for external use
  world.weaponEngine = weaponEngine;
  world.terrainEngine = terrainEngine;


  // Helper to apply class modifiers when a projectile is created.
  world.applyClassModifiers = (entityId) => applyClassModifiers(entityId, world.components);

  return world;
}
