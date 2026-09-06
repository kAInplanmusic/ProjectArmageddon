export class EntityManager {
  #nextEntityId = 1;

  createEntity() {
    const entityId = this.#nextEntityId;
    this.#nextEntityId += 1;
    return entityId;
  }
}
