import { World } from './ecs/world.js';
import { TurnSystem } from './systems/turnSystem.js';
import { DamageSystem } from './systems/damageSystem.js';
import { applyClassModifiers } from './classes.js';
import { initUI, updateTurnInfo, showEntityDeath } from '../client/ui.js';

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
    updateTurnInfo(currentPlayer, elapsed);
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

  // Helper to apply class modifiers when a projectile is created.
  world.applyClassModifiers = (entityId) => applyClassModifiers(entityId, world.components);

  return world;
}
