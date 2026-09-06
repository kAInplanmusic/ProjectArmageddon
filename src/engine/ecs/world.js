import { EntityManager } from './entityManager.js';
import { ComponentStore } from './componentStore.js';

export class World {
  constructor({ capacity = 1024, fixedDeltaSeconds = 1 / 60 } = {}) {
    this.fixedDeltaSeconds = fixedDeltaSeconds;
    this.entityManager = new EntityManager();
    this.components = new ComponentStore(capacity);
    this.systems = [];
    this.lastEntityId = 0;
  }

  createEntity() {
    const entityId = this.entityManager.createEntity();
    this.components.activate(entityId);
    this.lastEntityId = entityId;
    return entityId;
  }

  registerSystem(system) {
    this.systems.push(system);
    return system;
  }

  step() {
    for (const system of this.systems) {
      system.update(this, this.fixedDeltaSeconds);
    }
  }
}
