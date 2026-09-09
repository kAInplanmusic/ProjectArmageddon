/**
 * ECS-System: ProjectilePool
 * Verwaltet Objekt-Pool für Projektile mit Inaktiv-Wiederverwendung.
 */

export class ProjectilePool {
  #pool = [];
  #active = new Set();
  #maxSize;

  constructor(maxSize = 1000) {
    this.#maxSize = maxSize;
  }

  /**
   * Holt oder erzeugt ein Projektil.
   * @param {object} template - Basis-Daten für das Projektil
   * @returns {object} Projektil-Instanz
   */
  acquire(template = {}) {
    let projectile;
    if (this.#pool.length > 0) {
      projectile = this.#pool.pop();
      Object.assign(projectile, template);
    } else {
      projectile = { id: this.#generateId(), ...template };
    }
    this.#active.add(projectile.id);
    return projectile;
  }

  /**
   * Gibt ein Projektil zurück in den Pool.
   * @param {*} id - Projektil-ID
   */
  release(id) {
    if (this.#active.has(id)) {
      this.#active.delete(id);
      const projectile = this.#pooled.get(id);
      if (projectile) {
        if (this.#pool.length < this.#maxSize) {
          this.#pool.push(projectile);
        }
        this.#pooled.delete(id);
      }
    }
  }

  #pooled = new Map();
  #idCounter = 0;

  #generateId() {
    return ++this.#idCounter;
  }

  get activeCount() { return this.#active.size; }
  get poolSize() { return this.#pool.length; }
}

export default ProjectilePool;
