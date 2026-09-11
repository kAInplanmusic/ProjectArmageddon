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
  update(world, entities, _dt) {
    for (const entityId of entities) {
      // Projektile und Spielfiguren haben eigene Systeme mit Terrain-Kollision.
      if (world.hasComponent(entityId, 'Projectile') || world.hasComponent(entityId, 'Health')) {
        continue;
      }
      /*
       * Kisten ebenfalls überspringen — sie haben ihr eigenes Flugmodell.
       *
       * Fund (belegt): Ohne diese Zeile zog die generische Physik JEDE Kiste
       * nach unten, weil sie weder Projektil noch Gesundheitskomponente hat.
       * Eine gelandete Kiste bekam damit erneut Schwerkraft, sank durch das
       * Gelände und war nach wenigen Sekunden unerreichbar: bei 720 px
       * Kartenhöhe stand sie nach 480 Schritten auf y ≈ 10 558 — auf trockenem
       * Boden, also unabhängig vom Wasser. Betroffen war jede Kiste: der
       * abgeworfene Vorrat und die Rundenkisten.
       *
       * Zweite Folge: Die Dämpfung „über Wasser nicht untergehen" in
       * `MatchController#stepCrate` (vy wird dort auf 0,4 begrenzt) wurde im
       * nächsten Schritt von dieser Physik überschrieben — die Kiste sank also
       * gerade dort, wo sie schwimmen sollte.
       *
       * Der Flug selbst bleibt unberührt: `#stepFlyingCrates` läuft vor dem
       * Physikschritt und rechnet Schwerkraft, Luftwiderstand und Wind selbst.
       */
      if (world.hasComponent(entityId, 'Crate')) continue;

      let vx = world.getComponent(entityId, 'Velocity', 'x') || 0;
      let vy = world.getComponent(entityId, 'Velocity', 'y') || 0;
      let px = world.getComponent(entityId, 'Position', 'x') || 0;
      let py = world.getComponent(entityId, 'Position', 'y') || 0;

      // Rotation (falls vorhanden)
      const rotation = world.getComponent(entityId, 'Rotation', 'angle') || 0;

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
