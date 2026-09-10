/**
 * Inventar- und Munitionsverwaltung pro Spieler.
 *
 * Bewusst ausserhalb des ECS: Inventar ist kleine, selten gelesene Daten und
 * wuerde im TypedArray-Store nur Komplexitaet erzeugen. Die Klasse ist
 * deterministisch, weil sie ausschliesslich aus expliziten Aufrufen entsteht.
 *
 * @module PlayerInventory
 */
import { getWeapon, WEAPONS_BY_ID } from '../shared/config/weapons.js';
import { FALLBACK_WEAPON_ID } from '../shared/config/weapons.js';

export class PlayerInventory {
  #players = new Map();

  /** Legt einen Spieler mit Startlastout an. */
  register(playerId, weaponIds = [], { ammoPerWeapon = null } = {}) {
    const ammo = new Map();
    // Reservewaffe mit unbegrenzter Munition: verhindert, dass ein Match
    // stehenbleibt, sobald alle Ladungen verbraucht sind.
    const unlimited = new Set([FALLBACK_WEAPON_ID]);
    for (const id of weaponIds) {
      const weapon = getWeapon(id);
      if (!weapon) continue;
      ammo.set(id, ammoPerWeapon ?? Math.max(1, weapon.maxAmmo || 1));
    }
    if (!ammo.has(FALLBACK_WEAPON_ID)) {
      const fallback = getWeapon(FALLBACK_WEAPON_ID);
      if (fallback) ammo.set(fallback.id, Infinity);
    } else {
      ammo.set(FALLBACK_WEAPON_ID, Infinity);
    }
    this.#players.set(playerId, {
      weapons: [...ammo.keys()],
      ammo,
      activeWeaponId: [...ammo.keys()][0] ?? null,
      credits: 0,
      unlimited,
    });
    return this.#players.get(playerId);
  }

  has(playerId) {
    return this.#players.has(playerId);
  }

  get(playerId) {
    return this.#players.get(playerId) ?? null;
  }

  getWeapons(playerId) {
    return this.#players.get(playerId)?.weapons ?? [];
  }

  getAmmo(playerId, weaponId) {
    return this.#players.get(playerId)?.ammo.get(weaponId) ?? 0;
  }

  isUnlimited(playerId, weaponId) {
    return this.#players.get(playerId)?.unlimited.has(weaponId) ?? false;
  }

  getActiveWeaponId(playerId) {
    const entry = this.#players.get(playerId);
    if (!entry) return null;
    if (entry.activeWeaponId && entry.ammo.get(entry.activeWeaponId) > 0) {
      return entry.activeWeaponId;
    }
    const fallback = entry.weapons.find(id => entry.ammo.get(id) > 0) ?? null;
    if (entry) entry.activeWeaponId = fallback;
    return fallback;
  }

  selectWeapon(playerId, weaponId) {
    const entry = this.#players.get(playerId);
    if (!entry) return false;
    if (!entry.ammo.has(weaponId) || entry.ammo.get(weaponId) <= 0) return false;
    entry.activeWeaponId = weaponId;
    return true;
  }

  /** Fuegt eine Waffe hinzu bzw. fuellt Munition nach. */
  grantWeapon(playerId, weaponId) {
    const weapon = WEAPONS_BY_ID[weaponId];
    if (!weapon) return false;
    const entry = this.#players.get(playerId);
    if (!entry) return false;

    const refill = Math.max(1, weapon.maxAmmo || 1);
    if (entry.ammo.has(weaponId)) {
      entry.ammo.set(weaponId, entry.ammo.get(weaponId) + refill);
    } else {
      entry.ammo.set(weaponId, refill);
      entry.weapons.push(weaponId);
    }
    entry.activeWeaponId ??= weaponId;
    return true;
  }

  /**
   * Füllt Munition einer bereits vorhandenen Waffe auf, begrenzt auf deren
   * Kapazität. Wird von Nachschub-Waffen benutzt.
   *
   * Anders als `grantWeapon` fügt es KEINE neue Waffe hinzu und überschreitet
   * nie `maxAmmo` — sonst könnte eine Nachschubwaffe Munition ins Unbegrenzte
   * stapeln.
   *
   * @returns {number} tatsächlich aufgefüllte Ladungen
   */
  grantAmmo(playerId, weaponId, amount = 1) {
    const weapon = WEAPONS_BY_ID[weaponId];
    const entry = this.#players.get(playerId);
    if (!weapon || !entry || !entry.ammo.has(weaponId)) return 0;

    const capacity = Math.max(1, weapon.maxAmmo || 1);
    const current = entry.ammo.get(weaponId);
    // Unbegrenzte Waffen haben nichts aufzufüllen.
    if (!Number.isFinite(current)) return 0;

    const give = Math.min(Math.max(0, Math.floor(amount)), Math.max(0, capacity - current));
    if (give <= 0) return 0;
    entry.ammo.set(weaponId, current + give);
    return give;
  }

  /** Verbraucht eine Einheit Munition. */
  consume(playerId, weaponId, amount = 1) {
    const entry = this.#players.get(playerId);
    if (!entry) return false;
    if (entry.unlimited.has(weaponId)) return true;
    const current = entry.ammo.get(weaponId) ?? 0;
    if (current < amount) return false;
    entry.ammo.set(weaponId, current - amount);
    return true;
  }

  /** Entfernt einen Spieler (bei Tod). */
  remove(playerId) {
    return this.#players.delete(playerId);
  }

  serialize() {
    return [...this.#players.entries()].map(([playerId, entry]) => ({
      playerId,
      weapons: [...entry.weapons],
      ammo: Object.fromEntries(entry.ammo),
      activeWeaponId: entry.activeWeaponId,
    }));
  }

  get playerIds() {
    return [...this.#players.keys()];
  }
}

export default PlayerInventory;
