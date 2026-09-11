function normalize(vector) {
  const magnitude = Math.hypot(vector.x, vector.y);
  if (magnitude === 0) {
    return { x: 0, y: -1 };
  }

  return {
    x: vector.x / magnitude,
    y: vector.y / magnitude
  };
}

export class ProjectArmageddonWorldAdapter {
  constructor({ world, terrain, gravity = 980 }) {
    this.world = world;
    this.terrain = terrain;
    this.gravity = gravity;
    this.combatants = new Map();
    this.events = [];
  }

  registerEntity(entityId, options = {}) {
    const existing = this.combatants.get(entityId);
    const health = options.health ?? existing?.health ?? 100;
    this.combatants.set(entityId, {
      entityId: options.entityId ?? existing?.entityId ?? Number(entityId),
      team: options.team ?? existing?.team ?? null,
      radius: options.radius ?? existing?.radius ?? 6,
      alive: options.alive ?? existing?.alive ?? true,
      health,
      maxHealth: options.maxHealth ?? existing?.maxHealth ?? health,
      statuses: [...(existing?.statuses ?? [])]
    });
    return this.combatants.get(entityId);
  }

  getEntityState(entityId) {
    return this.combatants.get(entityId);
  }

  getEntityPosition(entityId) {
    const state = this.combatants.get(entityId);
    if (!state) {
      throw new Error(`Unknown combatant: ${entityId}`);
    }

    return {
      x: this.world.components.positionX[state.entityId] ?? 0,
      y: this.world.components.positionY[state.entityId] ?? 0
    };
  }

  getEntities() {
    return [...this.combatants.values()].map((state) => ({
      id: String(state.entityId),
      position: {
        x: this.world.components.positionX[state.entityId] ?? 0,
        y: this.world.components.positionY[state.entityId] ?? 0
      },
      velocity: {
        x: this.world.components.velocityX[state.entityId] ?? 0,
        y: this.world.components.velocityY[state.entityId] ?? 0
      },
      team: state.team,
      alive: state.alive,
      radius: state.radius
    }));
  }

  raycastTerrain(from, to) {
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const stepSize = Math.max(1, this.terrain.config.cellSize * 0.5);
    const steps = Math.max(1, Math.ceil(distance / stepSize));

    for (let index = 0; index <= steps; index += 1) {
      const t = index / steps;
      const point = {
        x: from.x + (to.x - from.x) * t,
        y: from.y + (to.y - from.y) * t
      };
      const cell = this.terrain.worldToCell(point);
      const terrainCell = this.terrain.get(cell.x, cell.y);
      if (!terrainCell) {
        continue;
      }

      return {
        point,
        normal: this.estimateSurfaceNormal(cell.x, cell.y),
        cell: { ...terrainCell }
      };
    }

    return null;
  }

  estimateSurfaceNormal(x, y) {
    const leftSolid = !this.terrain.isAir(x - 1, y);
    const rightSolid = !this.terrain.isAir(x + 1, y);
    const downSolid = !this.terrain.isAir(x, y - 1);
    const upSolid = !this.terrain.isAir(x, y + 1);
    const normal = normalize({
      x: (leftSolid ? 1 : 0) - (rightSolid ? 1 : 0),
      y: (downSolid ? 1 : 0) - (upSolid ? 1 : 0)
    });

    if (normal.x === 0 && normal.y === 0) {
      return { x: 0, y: -1 };
    }

    return normal;
  }

  queryTerrainCircle(center, radius) {
    return this.terrain.queryTerrainCircle(center, radius).map((cell) => ({ ...cell }));
  }

  applyTerrainDamage(cell, amount, source) {
    this.terrain.applyTerrainDamage(cell, amount, source);
  }

  applyEntityDamage(entityId, packet) {
    const state = this.combatants.get(entityId);
    if (!state || !state.alive) {
      return;
    }

    state.health = Math.max(0, state.health - packet.amount);
    if (state.health === 0) {
      state.alive = false;
      this.world.components.deactivate(state.entityId);
    }
    this.events.push({ type: 'entity_damage', entityId, packet, remainingHealth: state.health });
  }

  applyImpulse(entityId, impulse) {
    const state = this.combatants.get(entityId);
    if (!state) {
      return;
    }

    this.world.components.velocityX[state.entityId] += impulse.x;
    this.world.components.velocityY[state.entityId] += impulse.y;
    this.events.push({ type: 'entity_impulse', entityId, impulse });
  }

  addStatus(entityId, status) {
    const state = this.combatants.get(entityId);
    if (!state) {
      return;
    }

    state.statuses.push(status);
    this.events.push({ type: 'entity_status', entityId, status });
  }

  moveEntity(entityId, position) {
    const state = this.combatants.get(entityId);
    if (!state) {
      return;
    }

    this.world.components.positionX[state.entityId] = position.x;
    this.world.components.positionY[state.entityId] = position.y;
    this.events.push({ type: 'entity_moved', entityId, position });
  }

  emit(event) {
    this.events.push(event);
  }

  consumeEvents() {
    return this.events.splice(0);
  }
}
