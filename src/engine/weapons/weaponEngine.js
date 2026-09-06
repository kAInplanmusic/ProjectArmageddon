const EPSILON = 1e-8;
const add = (left, right) => ({ x: left.x + right.x, y: left.y + right.y });
const subtract = (left, right) => ({ x: left.x - right.x, y: left.y - right.y });
const multiply = (vector, scalar) => ({ x: vector.x * scalar, y: vector.y * scalar });
const length = (vector) => Math.hypot(vector.x, vector.y);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (start, end, t) => start + (end - start) * t;
const dot = (left, right) => left.x * right.x + left.y * right.y;

function normalize(vector) {
  const magnitude = length(vector);
  return magnitude < EPSILON ? { x: 1, y: 0 } : { x: vector.x / magnitude, y: vector.y / magnitude };
}

function rotate(vector, radians) {
  return {
    x: vector.x * Math.cos(radians) - vector.y * Math.sin(radians),
    y: vector.x * Math.sin(radians) + vector.y * Math.cos(radians)
  };
}

function turnToward(vector, target, maxRadians) {
  const sourceAngle = Math.atan2(vector.y, vector.x);
  const targetAngle = Math.atan2(target.y, target.x);
  let delta = ((targetAngle - sourceAngle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  delta = clamp(delta, -maxRadians, maxRadians);
  return normalize(rotate(vector, delta));
}

const SPECIAL_STATUS = Object.freeze({
  burn: (weapon) => ({ id: 'burn', magnitude: Math.max(1, weapon.stats.fireDamage || 8), duration: 3.5, sourceWeaponId: weapon.id, stacks: 1 }),
  freeze: (weapon) => ({ id: 'freeze', magnitude: 1, duration: 1.5, sourceWeaponId: weapon.id }),
  stun: (weapon) => ({ id: 'stun', magnitude: 1, duration: 1.25, sourceWeaponId: weapon.id }),
  sleep: (weapon) => ({ id: 'sleep', magnitude: 1, duration: 2.5, sourceWeaponId: weapon.id }),
  poison_cloud: (weapon) => ({ id: 'poison', magnitude: Math.max(1, weapon.stats.poisonDamage || 8), duration: 5, sourceWeaponId: weapon.id }),
  poison_zone: (weapon) => ({ id: 'poison', magnitude: Math.max(1, weapon.stats.poisonDamage || 8), duration: 5, sourceWeaponId: weapon.id }),
  acid_dot: (weapon) => ({ id: 'acid', magnitude: Math.max(1, weapon.stats.poisonDamage || 10), duration: 4, sourceWeaponId: weapon.id }),
  world_poison: (weapon) => ({ id: 'poison', magnitude: 14, duration: 7, sourceWeaponId: weapon.id }),
  shield_freeze: (weapon) => ({ id: 'freeze_aura', magnitude: 1, duration: 2, sourceWeaponId: weapon.id }),
  curse: (weapon) => ({ id: 'curse', magnitude: 1, duration: 5, sourceWeaponId: weapon.id }),
  corruption: (weapon) => ({ id: 'corruption', magnitude: 1, duration: 6, sourceWeaponId: weapon.id }),
  mind_pull: (weapon) => ({ id: 'disorient', magnitude: 1, duration: 2, sourceWeaponId: weapon.id })
});

export class WeaponEngine {
  constructor(database) {
    this.db = new Map(database.weapons.map((weapon) => [weapon.id, this.normalize(weapon)]));
    this.projectiles = new Map();
    this.cooldowns = new Map();
    this.ammo = new Map();
    this.seq = 0;
  }

  normalize(weapon) {
    const stats = weapon.stats || {};
    const pick = (snakeCase, camelCase, defaultValue = 0) => (
      stats[snakeCase] !== undefined && stats[snakeCase] !== null
        ? stats[snakeCase]
        : stats[camelCase] ?? defaultValue
    );

    return {
      ...weapon,
      stats: {
        ...stats,
        baseDamage: pick('base_damage', 'baseDamage'),
        blastRadius: pick('blast_radius', 'blastRadius'),
        terrainDamage: pick('terrain_damage', 'terrainDamage'),
        fireDamage: pick('fire_damage', 'fireDamage'),
        iceDamage: pick('ice_damage', 'iceDamage'),
        poisonDamage: pick('poison_damage', 'poisonDamage'),
        special: stats.special ?? weapon.mechanic?.specialEffect ?? 'direct_hit',
        damage_type: stats.damage_type ?? 'physical'
      }
    };
  }

  getWeapon(id) {
    const weapon = this.db.get(id);
    if (!weapon) {
      throw new Error(`Unknown weapon: ${id}`);
    }
    return weapon;
  }

  setAmmo(entityId, weaponId, value) {
    this.ammo.set(`${entityId}:${weaponId}`, Math.max(0, value));
  }

  getAmmo(entityId, weaponId) {
    return this.ammo.get(`${entityId}:${weaponId}`) ?? this.getWeapon(weaponId).balance.maxAmmo;
  }

  canFire(entityId, weaponId) {
    return (this.cooldowns.get(`${entityId}:${weaponId}`) ?? 0) <= 0 && this.getAmmo(entityId, weaponId) > 0;
  }

  fire(world, entityId, weaponId, origin, direction, now = 0) {
    const weapon = this.getWeapon(weaponId);
    if (!this.canFire(entityId, weaponId)) {
      return [];
    }

    const key = `${entityId}:${weaponId}`;
    this.ammo.set(key, this.getAmmo(entityId, weaponId) - 1);
    this.cooldowns.set(key, weapon.balance.cooldown || 0);

    const events = [];
    const normalizedDirection = normalize(direction);
    const special = weapon.stats.special || 'direct_hit';

    if (weapon.stats.projectileSpeed <= 0) {
      this.resolveImpact(world, weapon, entityId, origin, origin, normalizedDirection, events);
      this.specialOnFire(world, weapon, entityId, origin, normalizedDirection, events, now);
      return events;
    }

    const kind = special === 'returning_projectile'
      ? 'boomerang'
      : special === 'rocket'
        ? 'rocket'
        : special.includes('drill')
          ? 'drill'
          : special === 'sticky'
            ? 'sticky'
            : weapon.stats.homing > 0
              ? 'guided'
              : 'standard';

    const projectile = {
      id: `p_${++this.seq}`,
      weaponId,
      ownerId: entityId,
      position: { ...origin },
      velocity: multiply(normalizedDirection, weapon.stats.projectileSpeed),
      radius: 4,
      age: 0,
      alive: true,
      bouncesLeft: weapon.stats.bounces,
      piercesLeft: weapon.stats.piercing,
      kind,
      payload: { origin, direction: normalizedDirection, createdAt: now }
    };
    this.projectiles.set(projectile.id, projectile);
    events.push({ type: 'projectile_spawned', projectile: { ...projectile } });
    this.specialOnFire(world, weapon, entityId, origin, normalizedDirection, events, now);
    return events;
  }

  update(world, deltaSeconds) {
    const events = [];

    for (const [key, value] of this.cooldowns) {
      this.cooldowns.set(key, Math.max(0, value - deltaSeconds));
    }

    for (const [projectileId, projectile] of [...this.projectiles]) {
      if (!projectile.alive) {
        this.projectiles.delete(projectileId);
        continue;
      }

      const weapon = this.getWeapon(projectile.weaponId);
      projectile.age += deltaSeconds;

      if (weapon.stats.fuseTime > 0 && projectile.age >= weapon.stats.fuseTime) {
        this.explode(world, weapon, projectile.ownerId, projectile.position, events);
        this.kill(projectile, 'fuse', events);
        continue;
      }

      if (projectile.kind === 'boomerang' && projectile.age > 0.35) {
        const returnDirection = normalize(subtract(projectile.payload.origin, projectile.position));
        projectile.velocity = multiply(returnDirection, weapon.stats.projectileSpeed);
      }

      if (weapon.stats.homing > 0) {
        const target = this.findHomingTarget(world, projectile);
        if (target) {
          const desiredDirection = normalize(subtract(target.position, projectile.position));
          const turnedDirection = turnToward(projectile.velocity, desiredDirection, (weapon.stats.homing / 100) * 8 * deltaSeconds);
          projectile.velocity = multiply(turnedDirection, length(projectile.velocity));
        }
      }

      if (weapon.stats.gravity > 0) {
        projectile.velocity.y += world.gravity * (weapon.stats.gravity / 100) * deltaSeconds;
      }

      const nextPosition = add(projectile.position, multiply(projectile.velocity, deltaSeconds));
      const terrainHit = world.raycastTerrain(projectile.position, nextPosition);
      if (terrainHit) {
        projectile.position = terrainHit.point;
        const special = weapon.stats.special || 'direct_hit';

        if (weapon.stats.blastRadius === 0 && (projectile.kind === 'drill' || weapon.stats.terrainDamage > 0)) {
          this.damageTerrain(world, weapon, projectile.position, events);
        }

        if (weapon.stats.blastRadius > 0 || ['rocket', 'mortar', 'artillery', 'meteor_impact', 'launcher', 'hell_cannon', 'quantum_ultimate', 'cosmic_ultimate'].includes(special)) {
          this.explode(world, weapon, projectile.ownerId, projectile.position, events);
        }

        if (projectile.bouncesLeft > 0) {
          projectile.bouncesLeft -= 1;
          projectile.velocity = multiply(
            subtract(projectile.velocity, multiply(terrainHit.normal, 2 * dot(projectile.velocity, terrainHit.normal))),
            0.78
          );
          projectile.position = add(projectile.position, multiply(terrainHit.normal, 2));
          continue;
        }

        if (projectile.kind === 'boomerang' && length(subtract(projectile.payload.origin, projectile.position)) > 12) {
          continue;
        }

        this.kill(projectile, 'terrain', events);
        continue;
      }

      projectile.position = nextPosition;
      const targets = world
        .getEntities()
        .filter((entity) => entity.alive && entity.id !== projectile.ownerId && length(subtract(entity.position, projectile.position)) <= entity.radius + projectile.radius);

      if (targets.length > 0) {
        for (const target of targets) {
          this.resolveImpact(world, weapon, projectile.ownerId, projectile.position, target.position, normalize(projectile.velocity), events, target.id);
          if (projectile.piercesLeft > 0) {
            projectile.piercesLeft -= 1;
          } else {
            this.kill(projectile, 'entity', events);
            break;
          }
        }
      }

      if (projectile.kind === 'boomerang' && projectile.age > 0.5 && length(subtract(projectile.payload.origin, projectile.position)) < 16) {
        this.kill(projectile, 'return', events);
      }

      if (projectile.age > 30) {
        this.kill(projectile, 'timeout', events);
      }
    }

    return events;
  }

  findHomingTarget(world, projectile) {
    const candidates = world.getEntities().filter((entity) => entity.alive && entity.id !== projectile.ownerId);
    let bestMatch;
    let bestDistance = Infinity;

    for (const entity of candidates) {
      const currentDistance = length(subtract(entity.position, projectile.position));
      if (currentDistance < bestDistance && currentDistance < 600) {
        bestDistance = currentDistance;
        bestMatch = entity;
      }
    }

    return bestMatch;
  }

  resolveImpact(world, weapon, ownerId, impact, entityPosition, direction, events, targetId) {
    const special = weapon.stats.special || 'direct_hit';

    if (targetId) {
      let damage = weapon.stats.baseDamage;
      if (special === 'precision') {
        damage *= 1.5;
      }
      if (special === 'heavy_impact') {
        damage *= 1.15;
      }

      world.applyEntityDamage(targetId, {
        amount: damage,
        type: weapon.stats.damage_type || 'physical',
        sourceWeaponId: weapon.id,
        sourceEntityId: ownerId,
        critical: special === 'precision'
      });
      this.applyKnockback(world, weapon, targetId, direction);

      const statusEffect = SPECIAL_STATUS[special]?.(weapon);
      if (statusEffect) {
        world.addStatus(targetId, statusEffect);
        events.push({ type: 'status', entityId: targetId, status: statusEffect });
      }

      if (special === 'hook_pull' || special === 'mind_pull') {
        world.applyImpulse(targetId, multiply(normalize(subtract(impact, entityPosition)), weapon.stats.knockback / 6));
      }

      if (special === 'linked_damage') {
        world.emit({ type: 'special', effect: special, position: entityPosition, weaponId: weapon.id, data: { ownerId, targetId } });
      }
    }

    if (weapon.stats.blastRadius > 0) {
      this.explode(world, weapon, ownerId, impact, events);
    } else if (weapon.stats.terrainDamage > 0) {
      this.damageTerrain(world, weapon, impact, events);
    }

    this.specialOnImpact(world, weapon, ownerId, impact, direction, events, targetId);
  }

  applyKnockback(world, weapon, targetId, direction) {
    if (weapon.stats.knockback > 0) {
      world.applyImpulse(targetId, multiply(direction, weapon.stats.knockback * 0.12));
    }
  }

  damageTerrain(world, weapon, center, events) {
    const radius = Math.max(8, weapon.stats.blastRadius || 18);
    const cells = world.queryTerrainCircle(center, radius);

    for (const cell of cells) {
      if (!cell.destructible) {
        continue;
      }

      const currentDistance = length({ x: cell.x - center.x, y: cell.y - center.y });
      const falloff = 1 - clamp(currentDistance / radius, 0, 1);
      const amount = Math.max(weapon.stats.terrainDamage, weapon.stats.baseDamage * 0.35) * falloff;
      world.applyTerrainDamage(cell, amount, weapon.id);
    }

    events.push({
      type: 'terrain_deformed',
      center,
      radius,
      strength: Math.max(weapon.stats.terrainDamage, weapon.stats.baseDamage * 0.35),
      weaponId: weapon.id
    });
  }

  explode(world, weapon, ownerId, position, events) {
    const radius = Math.max(1, weapon.stats.blastRadius);

    for (const entity of world.getEntities()) {
      if (!entity.alive || entity.id === ownerId) {
        continue;
      }

      const currentDistance = length(subtract(entity.position, position));
      if (currentDistance > radius + entity.radius) {
        continue;
      }

      const falloff = 1 - clamp(currentDistance / radius, 0, 1);
      const damagePacket = {
        amount: weapon.stats.baseDamage * lerp(0.25, 1, falloff),
        type: weapon.stats.damage_type || 'explosive',
        sourceWeaponId: weapon.id,
        sourceEntityId: ownerId
      };
      world.applyEntityDamage(entity.id, damagePacket);
      this.applyKnockback(world, weapon, entity.id, normalize(subtract(entity.position, position)));

      const statusEffect = SPECIAL_STATUS[weapon.stats.special || '']?.(weapon);
      if (statusEffect) {
        world.addStatus(entity.id, statusEffect);
        events.push({ type: 'status', entityId: entity.id, status: statusEffect });
      }
    }

    if (weapon.stats.terrainDamage > 0 || weapon.mechanic.destructibleTerrain !== false) {
      this.damageTerrain(world, weapon, position, events);
    }

    events.push({ type: 'explosion', position, radius, damage: weapon.stats.baseDamage, weaponId: weapon.id });
  }

  specialOnFire(world, weapon, ownerId, position, direction, events, now = 0) {
    const special = weapon.stats.special || 'direct_hit';
    const data = { ownerId, firedAt: now };

    if (['teleport', 'portal', 'portal_field', 'teleport_platform', 'hologram_portal', 'mobility'].includes(special)) {
      world.emit({ type: 'special', effect: special, position, weaponId: weapon.id, data: { ...data, direction } });
    }

    if (['auto_target', 'guardian', 'supply_drop', 'ammo_drop', 'summon_warrior', 'summon_mount', 'fire_entity', 'fire_minion', 'delayed_bot', 'bunker', 'camouflage', 'water_mobility'].includes(special)) {
      world.emit({ type: 'special', effect: special, position, weaponId: weapon.id, data });
    }

    if (['random_spell', 'random_buff', 'random_effect', 'mutation'].includes(special)) {
      world.emit({ type: 'special', effect: special, position, weaponId: weapon.id, data: { ...data, seed: this.seq } });
    }
  }

  specialOnImpact(world, weapon, ownerId, position, direction, events, targetId) {
    const special = weapon.stats.special || 'direct_hit';

    if ([
      'fire_pool',
      'poison_cloud',
      'poison_zone',
      'tentacle_zone',
      'lava',
      'corruption',
      'curse',
      'astral_burst',
      'mind_aoe',
      'gravity_well',
      'suction',
      'energy_explosion',
      'emp_blast',
      'spike_blast',
      'fragmentation',
      'banana_split',
      'phoenix_strike',
      'meteor_impact',
      'meteor_rain',
      'air_strike',
      'earth_splitter',
      'world_poison',
      'dragon_ultimate',
      'guardian_ultimate',
      'cosmic_ultimate',
      'hell_cannon',
      'rocket_punch'
    ].includes(special)) {
      world.emit({ type: 'special', effect: special, position, weaponId: weapon.id, data: { ownerId, targetId, direction } });
    }

    if (special === 'water_push' && targetId) {
      world.applyImpulse(targetId, multiply(direction, -weapon.stats.knockback / 8 || -3));
    }

    if (special === 'teleport' && targetId) {
      world.moveEntity(targetId, add(position, multiply(direction, 80)));
    }

    if (special === 'bat_knockback' && targetId) {
      this.applyKnockback(world, {
        ...weapon,
        stats: {
          ...weapon.stats,
          knockback: Math.max(82, weapon.stats.knockback)
        }
      }, targetId, direction);
    }
  }

  kill(projectile, reason, events) {
    projectile.alive = false;
    this.projectiles.delete(projectile.id);
    events.push({ type: 'projectile_destroyed', projectileId: projectile.id, reason });
  }
}

export function validateDatabase(database) {
  const errors = [];

  if (database.iconCount !== database.weapons.length) {
    errors.push(`iconCount=${database.iconCount} but weapons=${database.weapons.length}`);
  }

  const ids = new Set();
  for (const weapon of database.weapons) {
    if (ids.has(weapon.id)) {
      errors.push(`duplicate id ${weapon.id}`);
    }
    ids.add(weapon.id);

    for (const fieldName of ['baseDamage', 'blastRadius', 'knockback', 'projectileSpeed', 'gravity', 'bounces', 'fuseTime', 'terrainDamage', 'fireDamage', 'iceDamage', 'poisonDamage', 'homing', 'piercing']) {
      const value = weapon.stats[fieldName];
      if (value !== undefined && value < 0) {
        errors.push(`${weapon.id}.${fieldName}<0`);
      }
    }
  }

  return errors;
}
