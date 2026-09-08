import { World } from './ecs/world.js';
import { TurnSystem } from './systems/turnSystem.js';
import { DamageSystem } from './systems/damageSystem.js';
import { applyClassModifiers } from './classes.js';

/**
 * Initialise the game world, register core systems and wire event listeners.
 * Returns the fully‑configured World instance.
 */
export function createGameWorld(players = [], turnDuration = 5) {
  const world = new World();

  const turnSystem = new TurnSystem(turnDuration, players);
  const damageSystem = new DamageSystem();

  // Wire listeners – for now we simply log events. UI code can replace these.
  turnSystem.setTurnChangeListener(({ currentPlayer, elapsed }) => {
    console.log('Turn changed – active player:', currentPlayer);
  });

  damageSystem.setDeadListener(({ entityId }) => {
    console.log('Entity died:', entityId);
  });

  damageSystem.setDeathEffectHandler(({ entityId }) => {
    console.log('Spawn death effect for entity:', entityId);
  });

  // Register systems in execution order
  world.registerSystem(turnSystem);
  world.registerSystem(damageSystem);

  // Helper to apply class modifiers when a projectile is created.
  world.applyClassModifiers = (entityId) => applyClassModifiers(entityId, world.components);

  return world;
}
