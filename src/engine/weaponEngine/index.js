/**
 * Wrapper für Weapon-Engine (externes Paket).
 * Re-exportiert aus dist/.
 *
 * @module weaponEngine
 */

export class WeaponEngine {
  constructor() {
    this.weapons = new Map();
  }

  /**
   * Registriert eine Waffe.
   * @param {string} id
   * @param {object} config
   */
  registerWeapon(id, config) {
    this.weapons.set(id, config);
  }

  /**
   * Holt eine Waffe nach ID.
   * @param {string} id
   * @returns {object|null}
   */
  getWeapon(id) {
    return this.weapons.get(id) || null;
  }

  /**
   * Holt alle Waffen.
   * @returns {Map}
   */
  getAllWeapons() {
    return this.weapons;
  }
}

export default WeaponEngine;
