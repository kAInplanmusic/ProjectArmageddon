/**
 * ECS-System: CharacterSystem
 *
 * Physik fuer Spielfiguren: Gravitation, Reibung, Terrain-Kollision,
 * Landeschaden und Wasserinteraktion (Auftrieb + Strömungswiderstand).
 * Uebernimmt die Bewegung von Entities mit Gesundheitskomponente; generische
 * Projektile werden vom ProjectileSystem behandelt.
 *
 * @module CharacterSystem
 */
import { COMPONENT_SIGNATURES } from '../ecs/world.js';

export const CHARACTER_PRIORITY = 85;
const HALF_WIDTH = 7;
const HALF_HEIGHT = 10;

export class CharacterSystem {
  #gravity;
  #groundFriction;
  #fallDamageThreshold;
  #fallDamageScale;
  #maxHorizontalSpeed;
  #drownDamagePerSecond;
  #submergedLevel;

  constructor({
    gravity = 0.42,
    groundFriction = 0.86,
    fallDamageThreshold = 11,
    fallDamageScale = 2.2,
    maxHorizontalSpeed = 6,
    drownDamagePerSecond = 9,
    submergedLevel = 0.72,
  } = {}) {
    this.#gravity = gravity;
    this.#groundFriction = groundFriction;
    this.#fallDamageThreshold = fallDamageThreshold;
    this.#fallDamageScale = fallDamageScale;
    this.#maxHorizontalSpeed = maxHorizontalSpeed;
    this.#drownDamagePerSecond = drownDamagePerSecond;
    this.#submergedLevel = submergedLevel;
  }

  update(world, entities, dt) {
    const services = world.services ?? {};
    const terrain = services.terrain ?? null;
    const events = services.events ?? null;
    const water = services.water ?? null;
    const damageSystem = world.getSystem('damage');

    for (const entityId of entities) {
      if (!world.isActive(entityId)) continue;

      const x = world.getComponent(entityId, 'Position', 'x') || 0;
      const y = world.getComponent(entityId, 'Position', 'y') || 0;
      let vx = world.getComponent(entityId, 'Velocity', 'x') || 0;
      let vy = world.getComponent(entityId, 'Velocity', 'y') || 0;

      // Wasserabfrage in Weltkoordinaten: das Feld rechnet intern in Zellen.
      const waterLevel = water
        ? (typeof water.levelAtWorld === 'function' ? water.levelAtWorld(x, y) : water.getLevel(Math.floor(x), Math.floor(y)))
        : 0;
      const inWater = waterLevel > 0.35;

      vy += this.#gravity * (inWater ? 0.25 : 1);
      if (inWater) {
        vy *= 0.72;
        vx *= 0.8;
        vx += (services.match?.currentStrength ?? 0) * 0.02;
      } else {
        vx *= 0.995;
      }

      vx = Math.max(-this.#maxHorizontalSpeed, Math.min(this.#maxHorizontalSpeed, vx));

      const nextX = x + vx;
      const nextY = y + vy;

      let resolvedX = nextX;
      let resolvedY = nextY;
      let landed = false;

      if (terrain) {
        if (this.#isSolid(terrain, nextX, nextY)) {
          // Von oben aufgesetzt: auf Oberflaeche einrasten.
          if (this.#isSolid(terrain, nextX, nextY - HALF_HEIGHT - 1) === false) {
            if (vy >= 0) {
              resolvedY = this.#surfaceY(terrain, nextX, nextY) - HALF_HEIGHT;
              landed = true;
            } else {
              resolvedY = y;
            }
          } else {
            resolvedY = y;
          }
        }

        if (this.#isSolid(terrain, resolvedX, resolvedY)) {
          // Seitliche Blockade: Richtungsumkehr daempfen.
          resolvedX = x;
          vx *= -0.2;
        }
      }

      if (landed) {
        if (!inWater && vy > this.#fallDamageThreshold && damageSystem) {
          const damage = (vy - this.#fallDamageThreshold) * this.#fallDamageScale;
          damageSystem.applyDamage(world, entityId, damage, null);
          events?.emit('fall_damage', { entityId, damage, velocity: vy });
        }
        vy = 0;
        if (Math.abs(vx) < 0.05) vx = 0;
        vx *= this.#groundFriction;
      }

      resolvedX = Math.max(HALF_WIDTH, Math.min((terrain?.width ?? 4096) - HALF_WIDTH, resolvedX));
      resolvedY = Math.max(HALF_HEIGHT, Math.min((terrain?.height ?? 4096) - HALF_HEIGHT, resolvedY));

      world.setComponent(entityId, 'Position', 'x', resolvedX);
      world.setComponent(entityId, 'Position', 'y', resolvedY);
      world.setComponent(entityId, 'Velocity', 'x', vx);
      world.setComponent(entityId, 'Velocity', 'y', vy);

      if (inWater && events) {
        events.emit('entity_in_water', { entityId, level: waterLevel });
      }

      // Ertrinken: tief untergetauchte Figuren verlieren kontinuierlich Leben.
      if (waterLevel >= this.#submergedLevel && damageSystem) {
        const damage = (this.#drownDamagePerSecond / 60) * (dt / (1000 / 60));
        damageSystem.applyDamage(world, entityId, damage, null);
        events?.emit('drowning', { entityId, level: waterLevel });
      }
    }
  }

  #isSolid(terrain, x, y) {
    return terrain.isSolid(Math.floor(x), Math.floor(y));
  }

  get drownDamagePerSecond() { return this.#drownDamagePerSecond; }
  get submergedLevel() { return this.#submergedLevel; }

  #surfaceY(terrain, x, fromY) {
    let y = Math.floor(fromY);
    while (y > 0 && !this.#isSolid(terrain, x, y - 1)) y--;
    return y;
  }

  get gravity() { return this.#gravity; }

  get signature() {
    return COMPONENT_SIGNATURES.POSITION | COMPONENT_SIGNATURES.VELOCITY | COMPONENT_SIGNATURES.HEALTH;
  }
}

export default CharacterSystem;
