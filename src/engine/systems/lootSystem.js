/**
 * ECS-System: LootSystem
 *
 * Spawnt Rundenkisten deterministisch aus dem Match-PRNG und behandelt das
 * Aufsammeln durch Figuren. Kisteninhalte und Seltenheit folgen den Regeln in
 * shared/config/loot.js.
 *
 * @module LootSystem
 */
import { COMPONENT_SIGNATURES } from '../ecs/world.js';
import { weightedRarity, rollCrateCount, rollCrateContents } from '../../shared/config/loot.js';
import { pickWeaponForRarity, WEAPONS_BY_ID } from '../../shared/config/weapons.js';

export const LOOT_PRIORITY = 70;
const PICKUP_RADIUS = 18;

export const CRATE_TYPES = Object.freeze({ weapon: 0, sustain: 1, empty: 2, trap: 3 });
export const RARITY_IDS = Object.freeze(['standard', 'enhanced', 'premium', 'epic']);
export const RARITY_WEIGHTS = Object.freeze({ common: 55, uncommon: 25, rare: 12, epic: 6, legendary: 2 });

/** Waffen-IDs nach Index (1-basiert) fuer die projektion in Int32-Felder. */
const WEAPON_ID_BY_INDEX = new Map();
const WEAPON_INDEX_BY_ID = new Map();
for (const weapon of Object.values(WEAPONS_BY_ID)) {
  WEAPON_ID_BY_INDEX.set(weapon.index, weapon.id);
  WEAPON_INDEX_BY_ID.set(weapon.id, weapon.index);
}

export function weaponIdFromIndex(index) {
  return WEAPON_ID_BY_INDEX.get(index) ?? null;
}

export function weaponIndexFromId(id) {
  return WEAPON_INDEX_BY_ID.get(id) ?? 0;
}

export class LootSystem {
  constructor({ rng } = {}) {
    this.rng = rng ?? null;
  }

  /**
   * Spawnt die Kisten fuer einen Rundenstart an deterministischen Positionen.
   *
   * @param {object} world
   * @param {object} options
   * @param {object} options.rng
   * @param {number} options.width
   * @param {number} options.height
   * @param {function(number):number} options.surfaceYFor
   * @returns {number[]} Entity-IDs der Kisten
   */
  spawnRoundCrates(world, { rng, width, height, surfaceYFor }) {
    const activeRng = rng ?? this.rng;
    if (!activeRng) throw new Error('LootSystem benoetigt einen RNG');

    const count = rollCrateCount(activeRng);
    const amount = count === 'none' ? 0 : count === 'one' ? 1 : 2;
    const spawned = [];

    for (let i = 0; i < amount; i++) {
      const x = Math.round(activeRng.nextFloat(width * 0.08, width * 0.92));
      const groundY = surfaceYFor(x);
      const y = (groundY > 0 ? groundY : height * 0.5) - 14;

      const contents = rollCrateContents(activeRng);
      const crateType = CRATE_TYPES[contents] ?? CRATE_TYPES.empty;
      const rarityName = weightedRarity(activeRng, RARITY_WEIGHTS, RARITY_IDS);
      const rarityId = Math.max(0, RARITY_IDS.indexOf(rarityName));

      const weapon = crateType === CRATE_TYPES.weapon ? pickWeaponForRarity(activeRng, RARITY_WEIGHTS) : null;

      const entityId = world.createEntity();
      world.addComponent(entityId, 'Position', { x, y });
      world.addComponent(entityId, 'Velocity', { x: 0, y: 0 });
      world.addComponent(entityId, 'Crate', {
        crateType,
        crateX: x,
        crateY: y,
        rarity: rarityId,
        weaponId: weapon ? weapon.index : 0,
        picked: 0,
        // 0 bedeutet "kein Vorrat hinterlegt" — beim Aufheben gilt das volle Magazin.
        ammo: 0,
        // Rundenkisten liegen bereits; nur abgeworfene Waffen fliegen.
        inFlight: 0,
        flightTicks: 0,
      });
      spawned.push(entityId);
    }

    world.services?.events?.emit('round_crates', { count, spawned });
    return spawned;
  }

  update(world, entities, _dt) {
    const services = world.services ?? {};
    const events = services.events ?? null;
    const inventory = services.inventory ?? null;
    const damageSystem = world.getSystem('damage');

    for (const crateId of entities) {
      if (!world.isActive(crateId)) continue;
      if (world.getComponent(crateId, 'Crate', 'picked') === 1) continue;
      // Eine fliegende Kiste lässt sich nicht aufheben — sie ist noch in der
      // Luft. Sonst könnte man sie im Vorbeifliegen aufschnappen.
      if (world.getComponent(crateId, 'Crate', 'inFlight') === 1) continue;

      const crateX = world.getComponent(crateId, 'Position', 'x') || 0;
      const crateY = world.getComponent(crateId, 'Position', 'y') || 0;
      const crateType = world.getComponent(crateId, 'Crate', 'crateType');
      const weaponIndex = world.getComponent(crateId, 'Crate', 'weaponId');

      const players = world.getEntitiesBySignature(
        COMPONENT_SIGNATURES.POSITION | COMPONENT_SIGNATURES.HEALTH
      );

      for (const playerId of players) {
        if (!world.isActive(playerId)) continue;
        const px = world.getComponent(playerId, 'Position', 'x') || 0;
        const py = world.getComponent(playerId, 'Position', 'y') || 0;
        if (Math.hypot(px - crateX, py - crateY) > PICKUP_RADIUS) continue;

        // Ist der Vorrat voll und enthält die Kiste eine Waffe, wird sie NICHT
        // aufgenommen. Stattdessen meldet ein Ereignis den Grund — der Spieler
        // muss erst abwerfen. Automatisches Überschreiben wäre ein Datenverlust
        // ohne Rückfrage.
        if (crateType === CRATE_TYPES.weapon
          && inventory?.isFull?.(playerId)
          && !inventory.has(playerId, weaponIdFromIndex(weaponIndex))) {
          events?.emit('crate_pickup_blocked', {
            crateId, playerId,
            weaponId: weaponIdFromIndex(weaponIndex),
            reason: 'voll',
          });
          // Nicht als aufgenommen markieren: die Kiste bleibt liegen.
          break;
        }

        world.setComponent(crateId, 'Crate', 'picked', 1);
        const reward = this.#applyPickup(world, playerId, crateType, weaponIndex, damageSystem, inventory, crateId);
        events?.emit('crate_pickup', { crateId, playerId, crateType, reward });
        world.removeEntity(crateId);
        break;
      }
    }
  }

  #applyPickup(world, playerId, crateType, weaponIndex, damageSystem, inventory, crateId) {
    switch (crateType) {
      case CRATE_TYPES.weapon: {
        const weaponId = weaponIdFromIndex(weaponIndex);
        // Munition aus der Kiste übernehmen, falls gesetzt (abgeworfene Waffe).
        // Eine Kiste aus dem Rundenablauf hat hier 0 und vergibt ein volles Magazin.
        const kistenMunition = world.getComponent(crateId, 'Crate', 'ammo') || 0;
        if (weaponId && inventory) {
          const uebergeben = kistenMunition !== 0 ? { ammo: kistenMunition } : {};
          inventory.grantWeapon(playerId, weaponId, uebergeben);
        }
        return { kind: 'weapon', weaponId, ammo: kistenMunition };
      }
      case CRATE_TYPES.sustain: {
        const amount = 25;
        damageSystem?.heal(world, playerId, amount);
        return { kind: 'heal', amount };
      }
      case CRATE_TYPES.trap: {
        const damage = 18;
        damageSystem?.applyDamage(world, playerId, damage, null);
        return { kind: 'trap', damage };
      }
      default:
        return { kind: 'empty' };
    }
  }

  get signature() {
    return COMPONENT_SIGNATURES.CRATE | COMPONENT_SIGNATURES.POSITION;
  }
}

export default LootSystem;
