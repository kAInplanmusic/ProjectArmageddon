/**
 * Engine-Initialisierung für ProjectArmageddon.
 * Erstellt die ECS-Welt mit allen Systemen.
 */

import { World } from './ecs/world.js';
import { COMPONENT_SIGNATURES } from './ecs/componentStore.js';
import { TurnSystem, getTurnDurationForPlayerCount } from './systems/turnSystem.js';
import { DamageSystem } from './systems/damageSystem.js';
import { PhysicsSystem } from './systems/physicsSystem.js';

export const SYSTEM_PRIORITIES = Object.freeze({
  TURN: 100,
  PROJECTILE: 95,
  PHYSICS: 90,
  CHARACTER: 85,
  DAMAGE: 80,
  MAELSTROM: 75,
  LOOT: 70,
  WEAPON: 65,
  TERRAIN: 60,
  EFFECTS: 50,
});

export function registerDefaultComponents(componentStore) {
  componentStore.registerComponent('Position', { x: 'Float32Array', y: 'Float32Array' }, COMPONENT_SIGNATURES.POSITION);
  componentStore.registerComponent('Velocity', { x: 'Float32Array', y: 'Float32Array' }, COMPONENT_SIGNATURES.VELOCITY);
  // Float32 für Gesundheit: Schadensabfall erzeugt Bruchteile, Int32 würde
  // stillschweigend abschneiden und Balancing verfälschen.
  componentStore.registerComponent('Health', { current: 'Float32Array', max: 'Float32Array' }, COMPONENT_SIGNATURES.HEALTH);
  componentStore.registerComponent('Damage', { amount: 'Float32Array', type: 'Int32Array' }, COMPONENT_SIGNATURES.DAMAGE);
  componentStore.registerComponent('Class', { classId: 'Int32Array', archetypeId: 'Int32Array' }, COMPONENT_SIGNATURES.CLASS);
  componentStore.registerComponent('Weapon', { angle: 'Float32Array', power: 'Float32Array' }, COMPONENT_SIGNATURES.WEAPON);
  componentStore.registerComponent('Crate', {
    crateType: 'Int32Array',
    crateX: 'Float32Array',
    crateY: 'Float32Array',
    rarity: 'Int32Array',
    weaponId: 'Int32Array',
    picked: 'Int32Array',
    /**
     * Munition einer abgeworfenen Waffe (-1 = unbegrenzt, 0 = nicht gesetzt).
     * Nur so bleibt beim Aufheben der Vorrat erhalten: eine frisch geworfene
     * Waffe darf nicht mit vollem Magazin zurückkommen, sonst wäre Abwerfen und
     * Aufheben ein Munitionstrick.
     */
    ammo: 'Int32Array',
  }, COMPONENT_SIGNATURES.CRATE);
  componentStore.registerComponent('Team', { teamId: 'Int32Array' }, COMPONENT_SIGNATURES.TEAM);
  componentStore.registerComponent('Rotation', { angle: 'Float32Array' }, COMPONENT_SIGNATURES.ROTATION);
  componentStore.registerComponent('Input', { angle: 'Float32Array', power: 'Float32Array' }, COMPONENT_SIGNATURES.INPUT);
  componentStore.registerComponent('Projectile', {
    owner: 'Int32Array',
    weaponId: 'Int32Array',
    damage: 'Float32Array',
    blastRadius: 'Float32Array',
    knockback: 'Float32Array',
    drag: 'Float32Array',
    gravityScale: 'Float32Array',
    windFactor: 'Float32Array',
    terrainDamage: 'Float32Array',
    bounces: 'Int32Array',
    lifetime: 'Int32Array',
    alive: 'Int32Array',
  }, COMPONENT_SIGNATURES.PROJECTILE);
}

export function createGameWorld(options = {}) {
  const { playerCount = 2, turnDuration = null, maxEntities = 10000 } = options;
  const world = new World({ maxEntities });
  registerDefaultComponents(world.componentStore);
  const turnDurationMs = turnDuration || getTurnDurationForPlayerCount(playerCount);
  world.registerSystem('turn', new TurnSystem({ playerCount, turnDuration: turnDurationMs }), SYSTEM_PRIORITIES.TURN);
  world.registerSystem('physics', new PhysicsSystem(), SYSTEM_PRIORITIES.PHYSICS);
  world.registerSystem('damage', new DamageSystem(), SYSTEM_PRIORITIES.DAMAGE);
  return world;
}

export function createClientRuntime(options = {}) {
  const world = createGameWorld(options);
  return {
    world,
    render: () => {},
    update: (dt) => world.update(dt),
    step: () => world.step()
  };
}

export function createServerRuntime(options = {}) {
  const world = createGameWorld(options);
  return {
    world,
    update: (dt) => world.update(dt),
    step: () => world.step(),
    serialize: () => world.serialize(),
    deserialize: (state) => world.deserialize(state)
  };
}
