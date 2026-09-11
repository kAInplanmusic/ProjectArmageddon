/**
 * ECS-System: ProjectileSystem
 *
 * Bewegt Projektile mit Gravitation, Drag und Wind und prüft Kollisionen per
 * Continuous Collision Detection gegen Terrain-Bitmaske und Spieler-AABBs.
 * Bei einem Treffer wird die Explosion aufgeloest: Krater im Terrain,
 * Schaden mit Distanzabfall und Knockback.
 *
 * Benoetigte Services am World-Objekt:
 *   world.services.terrain  — CollisionMask
 *   world.services.events   — EventBus
 *   world.services.match    — { wind, knockbackMultiplier }
 *
 * @module ProjectileSystem
 */
import { COMPONENT_SIGNATURES } from '../ecs/world.js';

export const PROJECTILE_PRIORITY = 95;
const PLAYER_HALF_WIDTH = 7;
const PLAYER_HALF_HEIGHT = 10;

/** Von Projektilen und Zielvorschau gemeinsam genutzte Physik-Konstanten. */
export const DEFAULT_PROJECTILE_GRAVITY = 0.32;
export const DEFAULT_PROJECTILE_DRAG = 0.995;

export class ProjectileSystem {
  #gravity;
  #baseDrag;

  constructor({ gravity = DEFAULT_PROJECTILE_GRAVITY, baseDrag = DEFAULT_PROJECTILE_DRAG } = {}) {
    this.#gravity = gravity;
    this.#baseDrag = baseDrag;
  }

  update(world, entities, _dt) {
    const services = world.services ?? {};
    const terrain = services.terrain ?? null;
    const events = services.events ?? null;
    const match = services.match ?? { wind: 0, knockbackMultiplier: 1 };

    const allTargets = this.#collectTargets(world);

    for (const entityId of entities) {
      if (!world.isActive(entityId)) continue;

      const alive = world.getComponent(entityId, 'Projectile', 'alive');
      if (alive === 0) continue;

      // Der Absender darf sein eigenes Projektil nicht blockieren. Ohne diesen
      // Ausschluss kollidiert das Geschoss im ersten Schritt mit dem Schützen
      // selbst (das Projektil startet in dessen Trefferfeld) und verschwindet,
      // bevor es das Ziel erreichen kann.
      const owner = world.getComponent(entityId, 'Projectile', 'owner');
      const targets = allTargets.filter(target => target.id !== owner);

      let vx = world.getComponent(entityId, 'Velocity', 'x') || 0;
      let vy = world.getComponent(entityId, 'Velocity', 'y') || 0;
      const startX = world.getComponent(entityId, 'Position', 'x') || 0;
      const startY = world.getComponent(entityId, 'Position', 'y') || 0;

      const drag = world.getComponent(entityId, 'Projectile', 'drag') || this.#baseDrag;
      const gravityScale = world.getComponent(entityId, 'Projectile', 'gravityScale');
      const windFactor = world.getComponent(entityId, 'Projectile', 'windFactor');
      let lifetime = world.getComponent(entityId, 'Projectile', 'lifetime');

      // Kräfte
      vy += this.#gravity * (gravityScale || 1);
      vx += (match.wind || 0) * (windFactor === 0 ? 1 : windFactor);
      vx *= drag;
      vy *= drag;

      const nextX = startX + vx;
      const nextY = startY + vy;

      // Zünder: Eine Granate wirkt nicht beim Aufprall, sondern nach Ablauf.
      // Sie prallt ab bzw. bleibt liegen und zündet dann.
      let fuseTicks = world.getComponent(entityId, 'Projectile', 'fuseTicks') || 0;
      if (fuseTicks > 0) {
        fuseTicks -= 1;
        world.setComponent(entityId, 'Projectile', 'fuseTicks', fuseTicks);

        if (fuseTicks <= 0) {
          // Zünder abgelaufen: jetzt wirkt die Ladung — an der aktuellen Stelle.
          const blastRadius = world.getComponent(entityId, 'Projectile', 'blastRadius') || 0;
          const owner = world.getComponent(entityId, 'Projectile', 'owner');
          this.#explode(world, entityId, nextX, nextY, 0, null);
          if (events) {
            events.emit('fuse_expired', { entityId, x: nextX, y: nextY, owner });
          }
          services.onProjectileImpact?.({
            projectileId: entityId, owner, x: nextX, y: nextY,
            target: null, blastRadius,
          });
          continue;
        }
      }

      const hit = this.#raycast(terrain, targets, startX, startY, nextX, nextY);

      if (hit && fuseTicks > 0) {
        // Zünderwaffe: Der Aufprall stoppt sie, zündet sie aber nicht. Sie
        // bleibt an der Auftreffstelle liegen und läuft dort ab — so wirkt eine
        // Granate wie eine Granate und nicht wie eine Patrone.
        world.setComponent(entityId, 'Position', 'x', hit.x);
        world.setComponent(entityId, 'Position', 'y', hit.y);
        world.setComponent(entityId, 'Velocity', 'x', 0);
        world.setComponent(entityId, 'Velocity', 'y', 0);
        if (events) {
          events.emit('fuse_armed', { entityId, x: hit.x, y: hit.y });
        }
        continue;
      }

      if (hit) {
        const owner = world.getComponent(entityId, 'Projectile', 'owner');
        const blastRadius = world.getComponent(entityId, 'Projectile', 'blastRadius') || 0;
        this.#explode(world, entityId, hit.x, hit.y, world.getComponent(entityId, 'Projectile', 'bounces'), hit.target);
        if (events) {
          events.emit('projectile_impact', { entityId, x: hit.x, y: hit.y, target: hit.target ?? null });
        }
        // Hook für Wirkungen, die über Schaden hinausgehen (Einfrieren,
        // Schaden über Zeit). Der Match kennt die Waffe zum Projektil; das
        // Projektil selbst trägt nur deren Index.
        services.onProjectileImpact?.({
          projectileId: entityId,
          owner,
          x: hit.x,
          y: hit.y,
          target: hit.target ?? null,
          blastRadius,
        });
        continue;
      }

      world.setComponent(entityId, 'Velocity', 'x', vx);
      world.setComponent(entityId, 'Velocity', 'y', vy);
      world.setComponent(entityId, 'Position', 'x', nextX);
      world.setComponent(entityId, 'Position', 'y', nextY);

      lifetime -= 1;
      world.setComponent(entityId, 'Projectile', 'lifetime', lifetime);

      const outOfBounds = nextX < -64 || nextX > (terrain?.width ?? 4096) + 64 || nextY > (terrain?.height ?? 4096) + 64;
      if (lifetime <= 0 || outOfBounds) {
        world.setComponent(entityId, 'Projectile', 'alive', 0);
        world.removeEntity(entityId);
        if (events) events.emit('projectile_expired', { entityId, x: nextX, y: nextY });
      }
    }
  }

  #collectTargets(world) {
    const ids = world.getEntitiesBySignature(COMPONENT_SIGNATURES.POSITION | COMPONENT_SIGNATURES.HEALTH);
    return ids.filter(id => world.isActive(id)).map(id => ({
      id,
      x: world.getComponent(id, 'Position', 'x') || 0,
      y: world.getComponent(id, 'Position', 'y') || 0,
    }));
  }

  /**
   * Prueft die Strecke in Teilschritten gegen Terrain und Spieler-AABBs.
   * @returns {{x:number,y:number,target:number|null}|null}
   */
  #raycast(terrain, targets, startX, startY, endX, endY) {
    const distance = Math.max(Math.abs(endX - startX), Math.abs(endY - startY));
    const steps = Math.max(1, Math.ceil(distance));
    let previousX = startX;
    let previousY = startY;

    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = startX + (endX - startX) * t;
      const y = startY + (endY - startY) * t;

      for (const target of targets) {
        if (Math.abs(x - target.x) <= PLAYER_HALF_WIDTH && Math.abs(y - target.y) <= PLAYER_HALF_HEIGHT) {
          return { x, y, target: target.id };
        }
      }

      if (terrain && terrain.isSolid(Math.floor(x), Math.floor(y))) {
        return { x, y, target: null };
      }

      previousX = x;
      previousY = y;
    }

    // Segmentfallback fuer den unwahrscheinlichen Fall eines Sprungs.
    if (terrain && terrain.isSolid(Math.floor(endX), Math.floor(endY))) {
      return { x: previousX, y: previousY, target: null };
    }
    return null;
  }

  #explode(world, entityId, x, y, bounces, hitTarget = null) {
    const services = world.services ?? {};
    const events = services.events ?? null;
    const match = services.match ?? { knockbackMultiplier: 1 };
    const terrain = services.terrain ?? null;

    const damage = world.getComponent(entityId, 'Projectile', 'damage') || 0;
    const blastRadius = world.getComponent(entityId, 'Projectile', 'blastRadius') || 0;
    const knockback = world.getComponent(entityId, 'Projectile', 'knockback') || 0;
    const terrainDamage = world.getComponent(entityId, 'Projectile', 'terrainDamage') || 0;
    const owner = world.getComponent(entityId, 'Projectile', 'owner');

    // Krater: expliziter Terrain-Schaden hat Vorrang, sonst leitet sich der
    // Radius aus der Flaechenwirkung ab. Reine Direktschusswaffen graben nur
    // ein minimales Loch, damit Einschlaege sichtbar bleiben.
    const craterRadius = terrainDamage > 0
      ? terrainDamage
      : blastRadius > 0 ? blastRadius * 0.6 : 4;

    if (terrain && craterRadius > 0) {
      const radius = Math.max(2, Math.round(craterRadius));
      terrain.punchCrater(x, y, radius);
      if (events) events.emit('terrain_destroyed', { x, y, radius });
    }

    // Wasser verdrängen: Explosionen drücken das Wasser im Radius nach außen.
    const water = services.water ?? null;
    if (water && typeof water.displace === 'function' && craterRadius > 0) {
      water.displace(x, y, craterRadius, 0.65);
    }

    if (damage > 0 && blastRadius <= 0 && hitTarget !== null && world.isActive(hitTarget)) {
      // Waffe ohne Flaechenwirkung: voller Schaden nur auf das getroffene Ziel.
      world.getSystem('damage')?.applyDamage(world, hitTarget, damage, owner);
    }

    if (blastRadius > 0 && damage > 0) {
      const victimIds = world.getEntitiesBySignature(
        COMPONENT_SIGNATURES.POSITION | COMPONENT_SIGNATURES.HEALTH
      );
      for (const victimId of victimIds) {
        if (!world.isActive(victimId)) continue;
        const vx = world.getComponent(victimId, 'Position', 'x') || 0;
        const vy = world.getComponent(victimId, 'Position', 'y') || 0;
        const dx = vx - x;
        const dy = vy - y;
        const dist = Math.hypot(dx, dy);
        if (dist > blastRadius) continue;

        const falloff = Math.max(0.25, 1 - dist / blastRadius);
        const applied = damage * falloff;
        const damageSystem = world.getSystem('damage');
        if (damageSystem) {
          damageSystem.applyDamage(world, victimId, applied, owner);
        }

        if (knockback > 0 && dist > 0.0001) {
          const impulse = knockback * falloff * (match.knockbackMultiplier || 1) * 0.02;
          const currentVx = world.getComponent(victimId, 'Velocity', 'x') || 0;
          const currentVy = world.getComponent(victimId, 'Velocity', 'y') || 0;
          world.setComponent(victimId, 'Velocity', 'x', currentVx + (dx / dist) * impulse);
          world.setComponent(victimId, 'Velocity', 'y', currentVy + (dy / dist) * impulse);
        }
      }
    }

    if (events) {
      events.emit('explosion', { x, y, radius: blastRadius, damage, owner, projectile: entityId });
    }

    world.setComponent(entityId, 'Projectile', 'alive', 0);
    world.setComponent(entityId, 'Projectile', 'bounces', (bounces || 0) + 1);
    world.removeEntity(entityId);
  }

  get gravity() { return this.#gravity; }
  get baseDrag() { return this.#baseDrag; }

  get signature() {
    return COMPONENT_SIGNATURES.POSITION | COMPONENT_SIGNATURES.VELOCITY | COMPONENT_SIGNATURES.PROJECTILE;
  }
}

export default ProjectileSystem;
