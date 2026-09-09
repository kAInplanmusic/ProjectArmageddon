/**
 * World: Zentrale ECS-Orchestrierungs-Klasse.
 *
 * Verwaltet Systeme, Komponenten und Entitys.
 * Stellt eine Fixed-Timestep-`step()`-Methode für deterministische Simulation bereit.
 *
 * @module World
 */

import { ComponentStore, COMPONENT_SIGNATURES } from './componentStore.js';
import { EntityManager } from './entityManager.js';

export class World {
  #componentStore;
  #entityManager;
  #systems = [];
  #systemsByName = new Map();
  #lastDeltaTime = 0;
  #fixedTimestep;
  #accumulator = 0;
  #elapsedTime = 0;
  #tickCount = 0;

  /**
   * @param {object} options
   * @param {number} options.fixedTimestep - Fixed-Timestep in Millisekunden (default: 16.666 → 60 Hz)
   * @param {number} options.maxEntities - Maximale Entity-Anzahl
   */
  constructor({ fixedTimestep = 16.666, maxEntities = 10000 } = {}) {
    this.#componentStore = new ComponentStore(maxEntities);
    this.#entityManager = new EntityManager();
    this.#fixedTimestep = fixedTimestep;
    this.#accumulator = 0;
    this.#elapsedTime = 0;
    this.#tickCount = 0;
  }

  /**
   * Registriert ein System im World.
   * Systeme werden in der Reihenfolge ihrer Registrierung ausgeführt.
   *
   * @param {string} name - Name des Systems
   * @param {object} system - System-Instanz mit update(world, entities, dt)-Methode
   * @param {number} [priority=0] - Priorität (höher = früher ausgeführt)
   */
  registerSystem(name, system, priority = 0) {
    if (this.#systemsByName.has(name)) {
      throw new Error(`System "${name}" bereits registriert`);
    }

    if (!system.update || typeof system.update !== 'function') {
      throw new Error(`System "${name}" hat keine update()-Methode`);
    }

    this.#systemsByName.set(name, system);

    this.#systems.push({
      name,
      system,
      priority,
      signature: system.signature || 0
    });

    // Sortiere nach Priorität (höher = früher)
    this.#systems.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Holt ein registriertes System.
   * @param {string} name
   * @returns {object}
   */
  getSystem(name) {
    return this.#systemsByName.get(name);
  }

  /**
   * Erzeugt eine neue Entity.
   * @returns {number} Entity-ID
   */
  createEntity() {
    return this.#entityManager.createEntity();
  }

  /**
   * Zerstört eine Entity.
   * @param {number} entityId
   */
  removeEntity(entityId) {
    this.#entityManager.removeEntity(entityId);
    this.#componentStore.removeEntity(entityId);
  }

  /**
   * Fügt einer Entity eine Komponente hinzu.
   * @param {number} entityId
   * @param {string} componentName
   * @param {object} values
   */
  addComponent(entityId, componentName, values) {
    this.#entityManager.addComponent(entityId, componentName);
    this.#componentStore.addComponent(entityId, componentName, values);
  }

  /**
   * Holt einen Komponentenwert.
   * @param {number} entityId
   * @param {string} componentName
   * @param {string} fieldName
   * @returns {*}
   */
  getComponent(entityId, componentName, fieldName) {
    return this.#componentStore.getComponent(entityId, componentName, fieldName);
  }

  /**
   * Setzt einen Komponentenwert.
   * @param {number} entityId
   * @param {string} componentName
   * @param {string} fieldName
   * @param {*} value
   */
  setComponent(entityId, componentName, fieldName, value) {
    this.#componentStore.setComponent(entityId, componentName, fieldName, value);
  }

  /**
   * Entfernt eine Komponente von einer Entity.
   * @param {number} entityId
   * @param {string} componentName
   */
  removeComponent(entityId, componentName) {
    this.#entityManager.removeComponent(entityId, componentName);
    this.#componentStore.removeComponent(entityId, componentName);
  }

  /**
   * Prüft, ob eine Entity aktiv ist.
   * @param {number} entityId
   * @returns {boolean}
   */
  isActive(entityId) {
    return this.#entityManager.isActive(entityId);
  }

  /**
   * Holt alle Entities mit einer bestimmten Signatur.
   * @param {number} signature
   * @returns {number[]}
   */
  getEntitiesBySignature(signature) {
    return this.#componentStore.getEntitiesBySignature(signature);
  }

  /**
   * Holt alle Entities mit mehreren Komponenten.
   * @param {...number} signatureFlags
   * @returns {number[]}
   */
  getEntitiesWith(...signatureFlags) {
    return this.#componentStore.getEntitiesWith(...signatureFlags);
  }

  /**
   * Fixed-Timestep-Step: Führt alle Systeme um genau einen Tick aus.
   * Dies ist die Kern-Methode für deterministische Simulation.
   *
   * @param {number} [dt] - Delta-Zeit in ms (wird ignoriert, da Fixed-Timestep)
   */
  step(dt = this.#fixedTimestep) {
    for (const entry of this.#systems) {
      const { system, signature } = entry;

      // Hole Entities, die zur System-Signatur passen
      const entities = signature
        ? this.#componentStore.getEntitiesBySignature(signature)
        : this.#entityManager.getAllEntities();

      // Nur aktive Entities
      const activeEntities = entities.filter(id => this.#entityManager.isActive(id));

      if (activeEntities.length > 0) {
        system.update(this, activeEntities, this.#fixedTimestep);
      }
    }

    this.#tickCount++;
    this.#elapsedTime += this.#fixedTimestep;
    this.#lastDeltaTime = this.#fixedTimestep;
  }

  /**
   * Simuliert mehrere Ticks.
   * @param {number} ticks - Anzahl der Ticks
   */
  stepN(ticks) {
    for (let i = 0; i < ticks; i++) {
      this.step();
    }
  }

  /**
   * Führt eine Variable-Zeit-Update-Phase aus (für nicht-deterministische Systems wie Rendering).
   * @param {number} deltaTime - Elapsed Zeit in Millisekunden
   */
  update(deltaTime) {
    this.#accumulator += deltaTime;

    // Fixed-Timestep-Ticks abspielen
    while (this.#accumulator >= this.#fixedTimestep) {
      this.step();
      this.#accumulator -= this.#fixedTimestep;
    }

    this.#lastDeltaTime = deltaTime;
  }

  /**
   * Serialisiert den World-State für Replay/Checkpoint.
   * @returns {object}
   */
  serialize() {
    return {
      tickCount: this.#tickCount,
      elapsedTime: this.#elapsedTime,
      fixedTimestep: this.#fixedTimestep
    };
  }

  /**
   * Deserialisiert den World-State.
   * @param {object} state
   */
  deserialize(state) {
    this.#tickCount = state.tickCount || 0;
    this.#elapsedTime = state.elapsedTime || 0;
  }

  get tickCount() {
    return this.#tickCount;
  }

  get elapsedTime() {
    return this.#elapsedTime;
  }

  get fixedTimestep() {
    return this.#fixedTimestep;
  }

  get lastDeltaTime() {
    return this.#lastDeltaTime;
  }

  get componentStore() {
    return this.#componentStore;
  }

  get entityManager() {
    return this.#entityManager;
  }
}

export { COMPONENT_SIGNATURES };
export default World;
