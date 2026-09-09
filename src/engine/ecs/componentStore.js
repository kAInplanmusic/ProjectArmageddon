/**
 * ComponentStore: Hochperformanter, typbasierter Speicher für ECS-Komponenten.
 *
 * Verwendet TypedArrays für maximale Performance und Cache-Locality.
 * Komponenten-Signaturen werden als Flags gespeichert (HEALTH, DAMAGE, CLASS, etc.).
 *
 * @module ComponentStore
 */

// Komponenten-Signature-Flags (16-Bit-Bereich für zukünftige Erweiterung)
export const COMPONENT_SIGNATURES = Object.freeze({
  POSITION: 1 << 0,     // 1
  VELOCITY: 1 << 1,     // 2
  HEALTH: 1 << 2,       // 4
  DAMAGE: 1 << 3,       // 8
  CLASS: 1 << 4,        // 16
  WEAPON: 1 << 5,       // 32
  CRATE: 1 << 6,        // 64
  TEAM: 1 << 7,         // 128
  ROTATION: 1 << 8,     // 256
  INPUT: 1 << 9,        // 512
  PROJECTILE: 1 << 10,  // 1024
  TERRAIN: 1 << 11,     // 2048
  WATER: 1 << 12,       // 4096
  MAHLSTROM: 1 << 13,   // 8192
  TURN: 1 << 14,        // 16384
  ACTIVE: 1 << 15      // 32768
});

// Datentyp-Enum für Komponentenregister
const DataType = Object.freeze({
  FLOAT32: 'Float32Array',
  INT32: 'Int32Array',
  UINT32: 'Uint32Array',
  INT16: 'Int16Array',
  UINT16: 'Uint16Array',
  INT8: 'Int8Array',
  UINT8: 'Uint8Array',
  BOOLEAN: 'Uint8Array'
});

/**
 * ComponentStore — verwaltet Komponentendaten in TypedArrays.
 *
 * Jede Komponente hat:
 * - Ein oder mehrere Daten-Felder (z.B. Health: single, Position: x+y)
 * - Einen Typ (Float32, Int32, etc.)
 * - Eine Signatur-Flag-Kombination
 *
 * @class
 */
export class ComponentStore {
  #components = {};  // Map: componentName -> { data, types, fieldNames, signatures, entities }
  #entitySignatures = new Map();  // entityId -> signature bitmask
  #entityComponents = new Map();  // entityId -> Set(componentNames)
  #pool = [];
  #nextId = 1;

  constructor(maxEntities = 10000) {
    this.maxEntities = maxEntities;
    this.#pool = [];
    this.#nextId = 1;
  }

  /**
   * Registriert eine neue Komponente.
   * @param {string} name - Name der Komponente
   * @param {object} fields - Felder: { fieldName: 'Float32Array', ... }
   * @param {number} signature - Signatur-Flag (aus COMPONENT_SIGNATURES)
   */
  registerComponent(name, fields, signature = 0) {
    if (this.#components[name]) {
      throw new Error(`Komponente "${name}" bereits registriert`);
    }

    const fieldNames = Object.keys(fields);
    const types = Object.values(fields);
    const data = {};

    for (let i = 0; i < fieldNames.length; i++) {
      const fieldName = fieldNames[i];
      const typeName = types[i];
      if (!DataType[typeName.toUpperCase()] && typeName !== 'Boolean') {
        throw new Error(`Unbekannter Datentyp: ${typeName}`);
      }
      const arrayType = typeName === 'Boolean' ? 'Uint8Array' : typeName;
      data[fieldName] = new globalThis[arrayType](this.maxEntities);
    }

    this.#components[name] = {
      data,
      fieldNames,
      types,
      signature,
      entities: new Set()
    };
  }

  /**
   * Erzeugt eine neue Entity-ID.
   * @returns {number} Entity-ID
   */
  createEntity() {
    if (this.#pool.length > 0) {
      const id = this.#pool.pop();
      return id;
    }
    return this.#nextId++;
  }

  /**
   * Fügt einer Entity eine Komponente hinzu.
   * @param {number} entityId
   * @param {string} componentName
   * @param {object} values - { fieldName: value, ... }
   */
  addComponent(entityId, componentName, values) {
    const comp = this.#components[componentName];
    if (!comp) {
      throw new Error(`Komponente "${componentName}" nicht registriert`);
    }

    const fieldNames = comp.fieldNames;
    for (const fieldName of fieldNames) {
      if (values[fieldName] !== undefined) {
        comp.data[fieldName][entityId] = values[fieldName];
      }
    }

    // Signatur aktualisieren
    let sig = this.#entitySignatures.get(entityId) || 0;
    sig |= comp.signature;
    this.#entitySignatures.set(entityId, sig);

    // Entity-Komponenten-Set aktualisieren
    if (!this.#entityComponents.has(entityId)) {
      this.#entityComponents.set(entityId, new Set());
    }
    this.#entityComponents.get(entityId).add(componentName);

    comp.entities.add(entityId);
  }

  /**
   * Entfernt eine Komponente von einer Entity.
   * @param {number} entityId
   * @param {string} componentName
   */
  removeComponent(entityId, componentName) {
    const comp = this.#components[componentName];
    if (!comp) {
      throw new Error(`Komponente "${componentName}" nicht registriert`);
    }

    // Daten nullen
    for (const fieldName of comp.fieldNames) {
      comp.data[fieldName][entityId] = 0;
    }

    // Signatur aktualisieren
    let sig = this.#entitySignatures.get(entityId) || 0;
    sig &= ~comp.signature;
    this.#entitySignatures.set(entityId, sig);

    this.#entityComponents.get(entityId)?.delete(componentName);
    comp.entities.delete(entityId);
  }

  /**
   * Holt einen Feldwert einer Komponente für eine Entity.
   * @param {number} entityId
   * @param {string} componentName
   * @param {string} fieldName
   * @returns {*}
   */
  getComponent(entityId, componentName, fieldName) {
    const comp = this.#components[componentName];
    if (!comp) {
      throw new Error(`Komponente "${componentName}" nicht registriert`);
    }
    return comp.data[fieldName][entityId];
  }

  /**
   * Setzt einen Feldwert einer Komponente für eine Entity.
   * @param {number} entityId
   * @param {string} componentName
   * @param {string} fieldName
   * @param {*} value
   */
  setComponent(entityId, componentName, fieldName, value) {
    const comp = this.#components[componentName];
    if (!comp) {
      throw new Error(`Komponente "${componentName}" nicht registriert`);
    }
    comp.data[fieldName][entityId] = value;
  }

  /**
   * Holt alle Entities mit einer bestimmten Signatur.
   * @param {number} signature - Geforderte Signatur-Flags
   * @returns {number[]} Entity-IDs
   */
  getEntitiesBySignature(signature) {
    const result = [];
    for (const [entityId, sig] of this.#entitySignatures) {
      if ((sig & signature) === signature) {
        result.push(entityId);
      }
    }
    return result;
  }

  /**
   * Holt alle Entities mit alle Komponenten einer Signatur-Kombination.
   * @param {...number} signatureFlags
   * @returns {number[]} Entity-IDs
   */
  getEntitiesWith(...signatureFlags) {
    const combined = signatureFlags.reduce((a, b) => a | b, 0);
    return this.getEntitiesBySignature(combined);
  }

  /**
   * Prüft, ob eine Entity eine bestimmte Komponente hat.
   * @param {number} entityId
   * @param {string} componentName
   * @returns {boolean}
   */
  hasComponent(entityId, componentName) {
    const comp = this.#components[componentName];
    if (!comp) return false;
    return comp.entities.has(entityId);
  }

  /**
   * Holt die Signatur einer Entity.
   * @param {number} entityId
   * @returns {number}
   */
  getSignature(entityId) {
    return this.#entitySignatures.get(entityId) || 0;
  }

  /**
   * Zerstört eine Entity (setzt alle Komponenten zurück).
   * @param {number} entityId
   */
  removeEntity(entityId) {
    for (const [name, comp] of Object.entries(this.#components)) {
      if (comp.entities.has(entityId)) {
        for (const fieldName of comp.fieldNames) {
          comp.data[fieldName][entityId] = 0;
        }
        comp.entities.delete(entityId);
      }
    }

    let sig = this.#entitySignatures.get(entityId) || 0;
    this.#entitySignatures.delete(entityId);
    this.#entityComponents.delete(entityId);
    this.#pool.push(entityId);
  }

  /**
   * Zählt Entities mit einer bestimmten Signatur.
   * @param {number} signature
   * @returns {number}
   */
  countEntitiesBySignature(signature) {
    let count = 0;
    for (const sig of this.#entitySignatures.values()) {
      if ((sig & signature) === signature) {
        count++;
      }
    }
    return count;
  }
}

export default ComponentStore;
