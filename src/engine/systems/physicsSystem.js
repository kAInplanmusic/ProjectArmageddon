/**
 * ECS-System: PhysicsSystem
 *
 * Verwaltet Position, Geschwindigkeit und linearen Drag für Entities.
 * Verwendet ballistische Berechnungen aus ballistics.js.
 *
 * @module PhysicsSystem
 */

import { COMPONENT_SIGNATURES } from '../ecs/world.js';

export class PhysicsSystem {
  #dragCoefficient = 0.98;
  #gravity = 0.5;

  constructor({ dragCoefficient = 0.98, gravity = 0.5 } = {}) {
    this.#dragCoefficient = dragCoefficient;
    this.#gravity = gravity;
  }

  /**
   * Aktualisiert Physik für alle Entities mit Position + Velocity.
   * @param {object} world
   * @param {number[]} entities
   * @param {number} dt
   */
  update(world, entities, dt) {
    for (const entityId of entities) {
      let vx = world.getComponent(entityId, 'Velocity', 'x') || 0;
      let vy = world.getComponent(entityId, 'Velocity', 'y') || 0;
      let px = world.getComponent(entityId, 'Position', 'x') || 0;
      let py = world.getComponent(entityId, 'Position', 'y') || 0;

      // Rotation (falls vorhanden)
      let rotation = world.getComponent(entityId, 'Rotation', 'angle') || 0;

      // Anwenden der Gravitation (wenn nicht vom Terrain/Hit affected)
      vy += this.#gravity;

      // Linearer Drag
      vx *= this.#dragCoefficient;
      vy *= this.#dragCoefficient;

      // Position aktualisieren
      px += vx;
      py += vy;

      // Werte zurückschreiben
      if (world.hasComponent(entityId, 'Velocity')) {
        world.setComponent(entityId, 'Velocity', 'x', vx);
        world.setComponent(entityId, 'Velocity', 'y', vy);
      }
      if (world.hasComponent(entityId, 'Position')) {
        world.setComponent(entityId, 'Position', 'x', px);
        world.setComponent(entityId, 'Position', 'y', py);
      }
      if (world.hasComponent(entityId, 'Rotation')) {
        world.setComponent(entityId, 'Rotation', 'angle', rotation);
      }
    }
  }

  get dragCoefficient() { return this.#dragCoefficient; }
  get gravity() { return this.#gravity; }

  get signature() {
    return COMPONENT_SIGNATURES.POSITION | COMPONENT_SIGNATURES.VELOCITY;
  }
}

export default PhysicsSystem;

/**
 * Berechnet lineare Drag-Position (hilfsfunktion für deterministic tests).
 *
 * @param {number} startPosition
 * @param {number} velocity
 * @param {number} drag
 * @param {number} steps
 * @returns {number} Neue Position
 */
export function computeLinearDragPosition(startPosition, velocity, drag, steps) {
  let pos = startPosition;
  let vel = velocity;
  for (let i = 0; i < steps; i++) {
    vel *= drag;
    pos += vel;
  }
  return pos;
}
