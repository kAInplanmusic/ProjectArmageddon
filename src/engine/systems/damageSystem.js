/**
 * ECS-System: DamageSystem
 *
 * Wendet Schaden an, emittiert typisierte Ereignisse und raeumt tote Entities
 * einmalig auf. Alle Zeitangaben stammen aus dem Simulations-Tick, damit
 * Replays deterministisch bleiben.
 *
 * @module DamageSystem
 */
import { COMPONENT_SIGNATURES } from '../ecs/world.js';
import { COMBAT_RULES } from '../../shared/config/combat.js';

export const DAMAGE_PRIORITY = 80;

export class DamageSystem {
  #deathListeners = [];
  #killFeed = [];
  #handledDeaths = new Set();

  update(world, entities, _dt) {
    for (const entityId of entities) {
      if (!world.isActive(entityId)) continue;
      const health = world.getComponent(entityId, 'Health', 'current');

      if (health <= 0 && !this.#handledDeaths.has(entityId)) {
        world.setComponent(entityId, 'Health', 'current', 0);
        this.#handledDeaths.add(entityId);
        this.#handleDeath(world, entityId);
        world.removeEntity(entityId);
      }
    }
  }

  /**
   * Wendet Schaden an. Flat-Reduktion vor Prozent-Reduktion
   * (siehe COMBAT_RULES.damageApplicationOrder).
   *
   * @param {object} world
   * @param {number} entityId
   * @param {number} amount
   * @param {number|null} attackerId
   * @param {object} [options]
   * @param {number} [options.flatResistance=0]
   * @param {number} [options.percentResistance=0] 0..1
   * @returns {number} verbleibende Gesundheit
   */
  applyDamage(world, entityId, amount, attackerId = null, options = {}) {
    if (!world.isActive(entityId) || !world.hasComponent(entityId, 'Health')) return 0;

    const flatResistance = Math.max(0, options.flatResistance ?? 0);
    const percentResistance = Math.min(
      COMBAT_RULES.resistanceCap,
      Math.max(0, options.percentResistance ?? 0)
    );

    // 1. Flat 2. Percent — Reihenfolge ist verbindlich.
    let finalDamage = Math.max(0, amount - flatResistance);
    finalDamage = finalDamage * (1 - percentResistance);

    const currentHealth = world.getComponent(entityId, 'Health', 'current');
    const newHealth = Math.max(0, Math.round((currentHealth - finalDamage) * 1000) / 1000);

    world.setComponent(entityId, 'Health', 'current', newHealth);

    this.#killFeed.push({
      target: entityId,
      attacker: attackerId,
      damage: finalDamage,
      tick: world.tickCount,
    });
    if (this.#killFeed.length > 200) this.#killFeed.shift();

    world.services?.events?.emit('damage', {
      entityId,
      attackerId,
      amount: finalDamage,
      remaining: newHealth,
    });

    return newHealth;
  }

  /** Heilung, gedeckelt auf das Maximum. */
  heal(world, entityId, amount) {
    if (!world.isActive(entityId) || !world.hasComponent(entityId, 'Health')) return 0;
    const max = world.getComponent(entityId, 'Health', 'max') || 0;
    const current = world.getComponent(entityId, 'Health', 'current') || 0;
    const healed = Math.min(max, current + Math.max(0, amount));
    world.setComponent(entityId, 'Health', 'current', healed);
    world.services?.events?.emit('heal', { entityId, amount: healed - current });
    return healed;
  }

  onDeath(callback) {
    if (typeof callback !== 'function') {
      throw new TypeError('Death-Listener muss eine Funktion sein');
    }
    this.#deathListeners.push(callback);
  }

  #handleDeath(world, entityId) {
    world.services?.events?.emit('death', { entityId });
    for (const callback of this.#deathListeners) {
      try {
        callback(world, entityId);
      } catch (error) {
        console.error('Death-Listener-Fehler:', error);
      }
    }
  }

  get killFeed() { return [...this.#killFeed]; }

  get signature() {
    return COMPONENT_SIGNATURES.HEALTH;
  }
}

export default DamageSystem;
