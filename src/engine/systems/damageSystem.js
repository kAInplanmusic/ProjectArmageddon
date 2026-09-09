/**
 * ECS-System: DamageSystem
 *
 * Verwaltet Schadensanwendung, Health-Check, Entity-Deaktivierung
 * und Death-Event-Handhabung.
 *
 * @module DamageSystem
 */

import { COMPONENT_SIGNATURES } from '../ecs/world.js';

export class DamageSystem {
  #deathListeners = [];
  #killFeed = [];

  /**
   * Aktualisiert das Damage-System — prüft Health-Status aller Entities.
   * @param {object} world - ECS-World-Instanz
   * @param {number[]} entities - Entities mit Health-Komponente
   * @param {number} dt - Delta-Zeit
   */
  update(world, entities, dt) {
    for (const entityId of entities) {
      const health = world.getComponent(entityId, 'Health', 'current');
      const maxHealth = world.getComponent(entityId, 'Health', 'max');

      if (health <= 0) {
        // Entity deaktivieren
        world.setComponent(entityId, 'Health', 'current', 0);
        this.#handleDeath(world, entityId);
      }
    }
  }

  /**
   * Führt Schaden an einer Entity aus.
   *
   * @param {object} world - ECS-World
   * @param {number} entityId - Ziel-Entity
   * @param {number} amount - Schadensbetrag
   * @param {number} [attackerId] - Quell-Entity (optional)
   */
  applyDamage(world, entityId, amount, attackerId = null) {
    const currentHealth = world.getComponent(entityId, 'Health', 'current');
    const newHealth = Math.max(0, currentHealth - amount);

    world.setComponent(entityId, 'Health', 'current', newHealth);

    // Logge den Schaden
    this.#killFeed.push({
      target: entityId,
      attacker: attackerId,
      damage: amount,
      timestamp: Date.now()
    });

    return newHealth;
  }

  /**
   * Registriert einen Death-Listener.
   * @param {function} callback
   */
  onDeath(callback) {
    this.#deathListeners.push(callback);
  }

  #handleDeath(world, entityId) {
    // Emit death event
    for (const callback of this.#deathListeners) {
      try {
        callback(world, entityId);
      } catch (err) {
        console.error('Death-Listener-Fehler:', err);
      }
    }
  }

  get killFeed() { return this.#killFeed; }

  // DamageSystem arbeitet mit Health-Komponente
  get signature() {
    return COMPONENT_SIGNATURES.HEALTH;
  }
}

export default DamageSystem;
