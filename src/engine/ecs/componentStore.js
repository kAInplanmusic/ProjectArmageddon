export const COMPONENT_FLAGS = Object.freeze({
  // Core component flags
  POSITION: 1 << 0,
  VELOCITY: 1 << 1,
  BALLISTICS: 1 << 2,
  ARTILLERY_STATS: 1 << 3,
  ACTIVE: 1 << 4,
  // Additional gameplay flags
  HEALTH: 1 << 5,
  DAMAGE: 1 << 6,
  CLASS: 1 << 7
});
  POSITION: 1 << 0,
  VELOCITY: 1 << 1,
  BALLISTICS: 1 << 2,
  ARTILLERY_STATS: 1 << 3,
  ACTIVE: 1 << 4
});

export class ComponentStore {
  constructor(capacity = 1024) {
    this.capacity = capacity;
    this.signatures = new Uint32Array(capacity);

    this.positionX = new Float32Array(capacity);
    this.positionY = new Float32Array(capacity);

    this.velocityX = new Float32Array(capacity);
    this.velocityY = new Float32Array(capacity);

    this.dragCoefficient = new Float32Array(capacity);
    this.mass = new Float32Array(capacity);

    this.angle = new Float32Array(capacity);
    this.power = new Float32Array(capacity);
    this.spread = new Float32Array(capacity);
  }

  activate(entityId) {
    this.signatures[entityId] |= COMPONENT_FLAGS.ACTIVE;
  }

  deactivate(entityId) {
    this.signatures[entityId] = 0;
  }

  setPosition(entityId, x, y) {
    this.positionX[entityId] = x;
    this.positionY[entityId] = y;
    this.signatures[entityId] |= COMPONENT_FLAGS.POSITION;
  }

  setVelocity(entityId, vx, vy) {
    this.velocityX[entityId] = vx;
    this.velocityY[entityId] = vy;
    this.signatures[entityId] |= COMPONENT_FLAGS.VELOCITY;
  }

  setBallistics(entityId, dragCoefficient, mass) {
    this.dragCoefficient[entityId] = dragCoefficient;
    this.mass[entityId] = mass;
    this.signatures[entityId] |= COMPONENT_FLAGS.BALLISTICS;
  }

  setArtilleryStats(entityId, angle, power, spread) {
    this.angle[entityId] = angle;
    this.power[entityId] = power;
    this.spread[entityId] = spread;
    this.signatures[entityId] |= COMPONENT_FLAGS.ARTILLERY_STATS;
  }

  matches(entityId, requiredFlags) {
    return (this.signatures[entityId] & requiredFlags) === requiredFlags;
  }
}
