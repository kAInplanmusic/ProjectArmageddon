// DamageSystem – applies projectile‑terrain collisions and reduces health.
import { COMPONENT_FLAGS } from '../ecs/componentStore.js';

export class DamageSystem {
  /**
   * DamageSystem – applies projectile‑terrain collisions and reduces health.
   * It also notifies listeners when an entity dies.
   */
  constructor() {
    /**
     * Optional listener invoked when an entity's health reaches zero.
     * Receives an object { entityId }.
     */
    this.deadListener = null;
    /**
     * Optional handler to spawn death effects (e.g., particles) when an entity dies.
     * Receives an object { entityId }.
     */
    this.deathEffectHandler = null;
  }

  /**
   * Register a listener for death events.
   * @param {function} listener - Callback receiving { entityId }.
   */
  setDeadListener(listener) {
    this.deadListener = listener;
  }

  /**
   * Register a handler for spawning death effects.
   * @param {function} handler - Callback receiving { entityId }.
   */
  setDeathEffectHandler(handler) {
    this.deathEffectHandler = handler;
  }

  /**
   * Scan active projectiles and apply damage to any entity whose position
   * lands on a solid pixel of the CollisionMask.
   * @param {object} world - The World instance (has components and a collisionMask).
   * @param {object} world.collisionMask - The CollisionMask instance.
   */
  update(world) {
    const { components, lastEntityId } = world;
    // Required flags for a projectile that can deal damage
    const REQUIRED =
      COMPONENT_FLAGS.ACTIVE |
      COMPONENT_FLAGS.POSITION |
      COMPONENT_FLAGS.VELOCITY |
      COMPONENT_FLAGS.BALLISTICS |
      COMPONENT_FLAGS.DAMAGE;

    for (let eid = 1; eid <= lastEntityId; eid++) {
      if (!components.matches(eid, REQUIRED)) continue;

      const x = Math.round(components.positionX[eid]);
      const y = Math.round(components.positionY[eid]);
      if (world.collisionMask?.isSolid(x, y)) {
        // Apply damage to any entity that also has a health component.
        // For simplicity we just deduct the projectile's damage value.
        const dmg = components.damage[eid] || 0;
        // Find target entity at this location (could be same projectile or another)
        for (let target = 1; target <= lastEntityId; target++) {
          if (target === eid) continue;
          const healthMask = COMPONENT_FLAGS.HEALTH;
          if ((components.signatures[target] & healthMask) !== healthMask) continue;
          const tx = Math.round(components.positionX[target]);
          const ty = Math.round(components.positionY[target]);
          if (tx === x && ty === y) {
            components.health[target] -= dmg;
            // If health drops to zero or below, deactivate the entity.
            if (components.health[target] <= 0) {
              world.components.deactivate(target);
              if (this.deadListener) {
                this.deadListener({ entityId: target });
              }
              if (this.deathEffectHandler) {
                this.deathEffectHandler({ entityId: target });
              }
            }
          }
        }
        // Deactivate projectile after impact
        world.components.deactivate(eid);
      }
    }
  }
}
