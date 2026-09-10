/**
 * EntityManager: Verwaltet Entity-Lebenszyklen und Generierung.
 *
 * @module EntityManager
 */

export class EntityManager {
  #nextId = 1;
  #freeIds = [];
  #entityActive = new Map();
  #entityComponents = new Map();

  constructor() {
    this.#nextId = 1;
    this.#freeIds = [];
    this.#entityActive = new Map();
    this.#entityComponents = new Map();
  }

  /**
   * Erzeugt eine neue Entity-ID.
   * @returns {number} Entity-ID
   */
  createEntity() {
    if (this.#freeIds.length > 0) {
      const id = this.#freeIds.pop();
      this.#entityActive.set(id, true);
      this.#entityComponents.set(id, new Set());
      return id;
    }
    const id = this.#nextId++;
    this.#entityActive.set(id, true);
    this.#entityComponents.set(id, new Set());
    return id;
  }

  /**
   * Deaktiviert und zerstört eine Entity.
   * @param {number} entityId
   */
  removeEntity(entityId) {
    if (this.#entityActive.has(entityId)) {
      this.#entityActive.set(entityId, false);
      this.#entityComponents.delete(entityId);
      this.#freeIds.push(entityId);
    }
  }

  /**
   * Prüft, ob eine Entity aktiv ist.
   * @param {number} entityId
   * @returns {boolean}
   */
  isActive(entityId) {
    return this.#entityActive.get(entityId) || false;
  }

  /**
   * Markiert eine Komponente als gehörig einer Entity.
   * @param {number} entityId
   * @param {string} componentName
   */
  addComponent(entityId, componentName) {
    if (this.#entityComponents.has(entityId)) {
      this.#entityComponents.get(entityId).add(componentName);
    }
  }

  /**
   * Entfernt eine Komponenten-Markierung von einer Entity.
   * @param {number} entityId
   * @param {string} componentName
   */
  removeComponent(entityId, componentName) {
    this.#entityComponents.get(entityId)?.delete(componentName);
  }

  /**
   * Holt alle aktiven Entity-IDs.
   * @returns {number[]}
   */
  getAllEntities() {
    const result = [];
    for (const [id, active] of this.#entityActive) {
      if (active) result.push(id);
    }
    return result;
  }

  /**
   * Holt alle Entities, die eine bestimmte Komponente haben.
   * @param {string} componentName
   * @returns {number[]}
   */
  getEntitiesWithComponent(componentName) {
    const result = [];
    for (const [id, components] of this.#entityComponents) {
      if (this.#entityActive.get(id) && components.has(componentName)) {
        result.push(id);
      }
    }
    return result;
  }

  /**
   * Stellt eine gespeicherte Entity-Menge wieder her (Replay/Restore).
   * @param {number[]} ids
   */
  restore(ids = []) {
    this.#entityActive.clear();
    this.#entityComponents.clear();
    this.#freeIds = [];
    let maxId = 0;
    for (const id of [...ids].sort((a, b) => a - b)) {
      this.#entityActive.set(id, true);
      this.#entityComponents.set(id, new Set());
      if (id > maxId) maxId = id;
    }
    this.#nextId = maxId + 1;
  }
}

export default EntityManager;
