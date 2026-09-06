export class ProjectilePool {
  constructor(world, initialSize = 128) {
    this.world = world;
    this.inactiveEntities = [];

    for (let index = 0; index < initialSize; index += 1) {
      const entityId = world.createEntity();
      world.components.deactivate(entityId);
      this.inactiveEntities.push(entityId);
    }
  }

  acquire() {
    const entityId = this.inactiveEntities.pop() ?? this.world.createEntity();
    this.world.components.activate(entityId);
    return entityId;
  }

  release(entityId) {
    this.world.components.deactivate(entityId);
    this.inactiveEntities.push(entityId);
  }
}
