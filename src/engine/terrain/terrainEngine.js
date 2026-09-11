const MATERIALS = Object.freeze({
  grass: { id: 'grass', hardness: 20, terrainHP: 60, flammability: 0.85, waterAbsorption: 0.6, iceResistance: 0.2, blastResistance: 0.15, density: 1.0, friction: 0.75, flowRate: 0, temperature: 20 },
  earth: { id: 'earth', hardness: 35, terrainHP: 90, flammability: 0.05, waterAbsorption: 0.8, iceResistance: 0.3, blastResistance: 0.35, density: 1.7, friction: 0.8, flowRate: 0, temperature: 18 },
  mud: { id: 'mud', hardness: 20, terrainHP: 65, flammability: 0.05, waterAbsorption: 0.95, iceResistance: 0.15, blastResistance: 0.2, density: 1.5, friction: 0.55, flowRate: 0, temperature: 15 },
  snow: { id: 'snow', hardness: 12, terrainHP: 45, flammability: 0, waterAbsorption: 0.2, iceResistance: 0.9, blastResistance: 0.1, density: 0.35, friction: 0.45, flowRate: 0, temperature: -5 },
  water: { id: 'water', hardness: 0, terrainHP: 1, flammability: 0, waterAbsorption: 1, iceResistance: 0, blastResistance: 0, liquid: true, density: 1, friction: 0.05, flowRate: 3, temperature: 8 },
  metal: { id: 'metal', hardness: 95, terrainHP: 220, flammability: 0, waterAbsorption: 0, iceResistance: 0.95, blastResistance: 0.85, density: 7.8, friction: 0.6, flowRate: 0, temperature: 20 },
  stone: { id: 'stone', hardness: 75, terrainHP: 180, flammability: 0, waterAbsorption: 0.1, iceResistance: 0.9, blastResistance: 0.7, density: 2.7, friction: 0.9, flowRate: 0, temperature: 15 },
  sand: { id: 'sand', hardness: 18, terrainHP: 55, flammability: 0, waterAbsorption: 0.9, iceResistance: 0.2, blastResistance: 0.1, density: 1.6, friction: 0.4, flowRate: 0, temperature: 25 },
  wood: { id: 'wood', hardness: 30, terrainHP: 80, flammability: 0.95, waterAbsorption: 0.7, iceResistance: 0.25, blastResistance: 0.25, density: 0.65, friction: 0.7, flowRate: 0, temperature: 20 },
  lava: { id: 'lava', hardness: 10, terrainHP: 40, flammability: 1, waterAbsorption: 0, iceResistance: 0, blastResistance: 0.05, liquid: true, density: 2.5, friction: 0.1, flowRate: 2, temperature: 1100 },
  rock: { id: 'rock', hardness: 85, terrainHP: 200, flammability: 0, waterAbsorption: 0.05, iceResistance: 0.95, blastResistance: 0.8, density: 3.0, friction: 0.92, flowRate: 0, temperature: 12 },
  ice: { id: 'ice', hardness: 25, terrainHP: 70, flammability: 0, waterAbsorption: 0.2, iceResistance: 1, blastResistance: 0.15, density: 0.92, friction: 0.2, flowRate: 0, temperature: -10 }
});

const key = (x, y) => `${x},${y}`;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export class TerrainEngine {
  constructor(config) {
    this.config = {
      width: config.width,
      height: config.height,
      cellSize: config.cellSize,
      gravity: config.gravity,
      liquidStepsPerTick: config.liquidStepsPerTick ?? 2,
      collapseStepsPerTick: config.collapseStepsPerTick ?? 4,
      supportMinNeighbors: config.supportMinNeighbors ?? 1,
      collapseDepth: config.collapseDepth ?? 3,
      chainReactionLimit: config.chainReactionLimit ?? 256,
      airMaterial: config.airMaterial ?? 'earth'
    };
    this.cells = new Map();
    this.events = [];
    this.changed = new Set();
    this.reactionQueue = [];
    this.tick = 0;

    if (this.config.width < 1 || this.config.height < 1 || this.config.cellSize <= 0) {
      throw new Error('Invalid terrain dimensions');
    }
  }

  static materials() {
    return structuredClone(MATERIALS);
  }

  material(id) {
    return MATERIALS[id];
  }

  inBounds(x, y) {
    return x >= 0 && x < this.config.width && y >= 0 && y < this.config.height;
  }

  get(x, y) {
    return this.cells.get(key(x, y));
  }

  isAir(x, y) {
    return !this.inBounds(x, y) || !this.cells.has(key(x, y));
  }

  setCell(x, y, material, hp, destructible = true) {
    if (!this.inBounds(x, y)) {
      return;
    }

    const definition = MATERIALS[material];
    const cell = {
      x,
      y,
      material,
      hp: hp ?? definition.terrainHP,
      maxHp: definition.terrainHP,
      destructible,
      liquid: Boolean(definition.liquid),
      phase: definition.liquid ? 'liquid' : 'solid',
      temperature: definition.temperature,
      wetness: 0,
      damageVersion: 0
    };
    this.cells.set(key(x, y), cell);
    this.changed.add(key(x, y));
  }

  fill(material, predicate) {
    for (let y = 0; y < this.config.height; y += 1) {
      for (let x = 0; x < this.config.width; x += 1) {
        if (!predicate || predicate(x, y)) {
          this.setCell(x, y, material);
        }
      }
    }
  }

  generateFromHeightmap(heights, layers = ['grass', 'earth', 'stone']) {
    if (heights.length !== this.config.width) {
      throw new Error('heightmap width mismatch');
    }

    for (let x = 0; x < this.config.width; x += 1) {
      const top = clamp(Math.floor(heights[x]), 0, this.config.height);
      for (let y = 0; y < top; y += 1) {
        const depth = top - 1 - y;
        const material = layers[Math.min(depth, layers.length - 1)];
        this.setCell(x, y, material);
      }
    }
  }

  worldToCell(point) {
    return {
      x: Math.floor(point.x / this.config.cellSize),
      y: Math.floor(point.y / this.config.cellSize)
    };
  }

  cellToWorld(x, y) {
    return {
      x: (x + 0.5) * this.config.cellSize,
      y: (y + 0.5) * this.config.cellSize
    };
  }

  queryCircle(center, radius) {
    const cell = this.worldToCell(center);
    const searchRadius = Math.ceil(radius / this.config.cellSize);
    const matches = [];

    for (let y = cell.y - searchRadius; y <= cell.y + searchRadius; y += 1) {
      for (let x = cell.x - searchRadius; x <= cell.x + searchRadius; x += 1) {
        const terrainCell = this.get(x, y);
        if (!terrainCell) {
          continue;
        }

        if (distance(this.cellToWorld(x, y), center) <= radius + this.config.cellSize * 0.71) {
          matches.push(terrainCell);
        }
      }
    }

    return matches;
  }

  applyDamage(center, radius, amount, source, kind = 'generic', falloff = 'linear') {
    if (amount <= 0 || radius <= 0) {
      return 0;
    }

    let changedCells = 0;
    for (const cell of this.queryCircle(center, radius)) {
      if (!cell.destructible) {
        continue;
      }

      const cellDistance = distance(this.cellToWorld(cell.x, cell.y), center);
      const normalizedDistance = clamp(cellDistance / radius, 0, 1);
      const falloffFactor = falloff === 'quadratic'
        ? (1 - normalizedDistance) * (1 - normalizedDistance)
        : 1 - normalizedDistance;
      const material = MATERIALS[cell.material];
      const resistance = kind === 'explosive'
        ? material.blastResistance
        : kind === 'ice'
          ? material.iceResistance
          : 0;
      const effectiveDamage = Math.max(0, amount * falloffFactor * (1 - resistance));

      if (effectiveDamage <= 0) {
        continue;
      }

      this.damageCell(cell, effectiveDamage, source, kind);
      changedCells += 1;
    }

    this.emit({
      type: 'terrain_deformed',
      tick: this.tick,
      center,
      radius,
      source,
      cellsChanged: changedCells
    });
    this.processReactions();
    return changedCells;
  }

  damageCell(cell, amount, source, kind = 'generic') {
    if (!cell.destructible) {
      return;
    }

    cell.hp -= amount;
    cell.damageVersion += 1;
    this.changed.add(key(cell.x, cell.y));
    this.emit({ type: 'terrain_damage', tick: this.tick, x: cell.x, y: cell.y, amount, source, kind });

    const material = MATERIALS[cell.material];
    if (kind === 'fire' && material.flammability > 0) {
      cell.temperature = Math.min(1200, cell.temperature + amount * 3 * material.flammability);
      if (cell.material === 'wood' && cell.temperature > 260) {
        this.reactionQueue.push({ x: cell.x, y: cell.y, source: `fire:${source}`, depth: 0 });
      }
    }

    if (kind === 'water' && material.waterAbsorption > 0.75 && cell.material === 'earth' && cell.hp < material.terrainHP * 0.45) {
      this.transition(cell, 'mud', `water:${source}`);
    }

    if (kind === 'ice' && cell.material === 'water' && amount > 8) {
      this.transition(cell, 'ice', `freeze:${source}`);
    }

    if (cell.hp <= 0) {
      this.destroyCell(cell, source);
    }
  }

  destroyCell(cell, source) {
    if (!this.cells.has(key(cell.x, cell.y))) {
      return;
    }

    const material = cell.material;
    this.cells.delete(key(cell.x, cell.y));
    this.changed.add(key(cell.x, cell.y));
    this.emit({ type: 'cell_destroyed', tick: this.tick, x: cell.x, y: cell.y, material, source });
    this.reactionQueue.push({ x: cell.x, y: cell.y, source, depth: 0 });
  }

  transition(cell, to, cause) {
    if (cell.material === to) {
      return;
    }

    const from = cell.material;
    const nextMaterial = MATERIALS[to];
    cell.material = to;
    cell.maxHp = nextMaterial.terrainHP;
    cell.hp = Math.min(cell.hp, nextMaterial.terrainHP);
    cell.liquid = Boolean(nextMaterial.liquid);
    cell.phase = nextMaterial.liquid ? 'liquid' : 'solid';
    cell.temperature = nextMaterial.temperature;
    cell.damageVersion += 1;
    this.changed.add(key(cell.x, cell.y));
    this.emit({ type: 'material_transition', tick: this.tick, x: cell.x, y: cell.y, from, to, cause });
  }

  deform(center, radius, strength, source, kind = 'explosive') {
    return this.applyDamage(center, radius, strength, source, kind, 'linear');
  }

  step(deltaSeconds) {
    if (deltaSeconds <= 0) {
      return;
    }

    this.tick += 1;
    for (let index = 0; index < this.config.liquidStepsPerTick; index += 1) {
      this.stepLiquids();
    }
    for (let index = 0; index < this.config.collapseStepsPerTick; index += 1) {
      this.stepCollapse();
    }
    this.processReactions();
  }

  stepLiquids() {
    const liquids = [...this.cells.values()]
      .filter((cell) => cell.liquid)
      .sort((left, right) => right.y - left.y);

    for (const cell of liquids) {
      const below = this.get(cell.x, cell.y - 1);
      if (!below && this.inBounds(cell.x, cell.y - 1)) {
        this.moveCell(cell, cell.x, cell.y - 1);
        continue;
      }

      if (below && below.material !== 'water' && cell.material === 'water' && below.material === 'lava') {
        this.transition(cell, 'ice', 'water-lava');
        this.transition(below, 'rock', 'water-lava');
        continue;
      }

      const directions = (this.tick + cell.x + cell.y) % 2 === 0 ? [-1, 1] : [1, -1];
      for (const dx of directions) {
        if (!this.inBounds(cell.x + dx, cell.y)) {
          continue;
        }
        if (this.isAir(cell.x + dx, cell.y)) {
          this.moveCell(cell, cell.x + dx, cell.y);
          break;
        }
      }
    }
  }

  moveCell(cell, nextX, nextY) {
    if (!this.inBounds(nextX, nextY) || !this.isAir(nextX, nextY)) {
      return false;
    }

    const oldX = cell.x;
    const oldY = cell.y;
    this.cells.delete(key(oldX, oldY));
    cell.x = nextX;
    cell.y = nextY;
    this.cells.set(key(nextX, nextY), cell);
    this.changed.add(key(oldX, oldY));
    this.changed.add(key(nextX, nextY));

    if (cell.material === 'water' || cell.material === 'lava') {
      this.emit({
        type: 'liquid_flow',
        tick: this.tick,
        x: oldX,
        y: oldY,
        toX: nextX,
        toY: nextY,
        material: cell.material
      });
    }
    return true;
  }

  stepCollapse() {
    const candidates = [...this.cells.values()]
      .filter((cell) => cell.destructible && !cell.liquid)
      .sort((left, right) => left.y - right.y);

    for (const cell of candidates) {
      if (cell.y === 0) {
        continue;
      }

      const support = this.get(cell.x, cell.y - 1);
      if (support) {
        continue;
      }

      const neighbors = this.neighbors(cell.x, cell.y).filter((neighbor) => !neighbor.liquid).length;
      if (neighbors >= this.config.supportMinNeighbors && cell.y > this.config.collapseDepth) {
        continue;
      }

      this.emit({ type: 'support_update', tick: this.tick, x: cell.x, y: cell.y, stable: false });
      if (['sand', 'mud', 'snow', 'earth'].includes(cell.material)) {
        this.destroyCell(cell, 'support-collapse');
        this.emit({ type: 'collapse', tick: this.tick, x: cell.x, y: cell.y, from: cell.material, to: 'air', cause: 'unsupported' });
      }
    }
  }

  neighbors(x, y) {
    const neighbors = [];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const neighbor = this.get(x + dx, y + dy);
      if (neighbor) {
        neighbors.push(neighbor);
      }
    }
    return neighbors;
  }

  processReactions() {
    let processed = 0;
    while (this.reactionQueue.length > 0 && processed < this.config.chainReactionLimit) {
      const reaction = this.reactionQueue.shift();
      processed += 1;
      if (reaction.depth >= this.config.collapseDepth) {
        continue;
      }

      this.emit({
        type: 'chain_reaction',
        tick: this.tick,
        x: reaction.x,
        y: reaction.y,
        source: reaction.source,
        depth: reaction.depth
      });
      for (const neighbor of this.neighbors(reaction.x, reaction.y)) {
        if (neighbor.material === 'wood' && MATERIALS.wood.flammability > 0.5) {
          neighbor.temperature += 80;
          if (neighbor.temperature > 260) {
            this.destroyCell(neighbor, `chain:${reaction.source}`);
          }
        }

        if (neighbor.material === 'sand' && reaction.source.includes('explosive')) {
          this.damageCell(neighbor, 8, `chain:${reaction.source}`, 'explosive');
        }
      }
    }

    if (processed >= this.config.chainReactionLimit) {
      this.reactionQueue.length = 0;
    }
  }

  emit(event) {
    this.events.push(event);
  }

  consumeEvents() {
    return this.events.splice(0);
  }

  consumeChangedCells() {
    const changedCells = [...this.changed]
      .map((cellKey) => this.cells.get(cellKey))
      .filter(Boolean);
    this.changed.clear();
    return changedCells;
  }

  consumeDirtyCells() {
    const dirtyCells = [...this.changed].map((cellKey) => ({
      key: cellKey,
      cell: this.cells.get(cellKey) ?? null
    }));
    this.changed.clear();
    return dirtyCells;
  }

  queryTerrainCircle(center, radius) {
    return this.queryCircle(center, radius);
  }

  applyTerrainDamage(cell, amount, source) {
    const currentCell = this.get(cell.x, cell.y);
    if (currentCell) {
      this.damageCell(currentCell, amount, source, 'generic');
    }
  }
}

export function createDefaultTerrain(width, height, cellSize = 16) {
  const terrain = new TerrainEngine({
    width,
    height,
    cellSize,
    gravity: 9.81,
    liquidStepsPerTick: 2,
    collapseStepsPerTick: 4,
    supportMinNeighbors: 1,
    collapseDepth: 3,
    chainReactionLimit: 256
  });
  const surface = Math.floor(height * 0.48);

  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < surface; y += 1) {
      const depth = surface - y;
      const material = depth <= 1
        ? 'grass'
        : depth <= Math.max(3, surface * 0.18)
          ? 'earth'
          : depth <= Math.max(5, surface * 0.45)
            ? 'stone'
            : 'rock';
      terrain.setCell(x, y, material);
    }
  }

  return terrain;
}

export function validateTerrain(terrain) {
  const errors = [];

  if (terrain.config.width < 1 || terrain.config.height < 1) {
    errors.push('invalid dimensions');
  }

  for (const cell of terrain.cells.values()) {
    if (cell.hp < 0) {
      errors.push(`${cell.x},${cell.y}: hp<0`);
    }
    if (cell.maxHp <= 0) {
      errors.push(`${cell.x},${cell.y}: maxHp<=0`);
    }
    if (!MATERIALS[cell.material]) {
      errors.push(`${cell.x},${cell.y}: unknown material`);
    }
  }

  return [...new Set(errors)];
}
