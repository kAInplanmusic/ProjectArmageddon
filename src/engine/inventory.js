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

/**
 * Obergrenze gleichzeitig geführter Waffen.
 *
 * Sie ist der Anlass für die Abwurfmechanik: Ohne Grenze würde man einfach alles
 * behalten und nie abwägen. Sechs Waffen sind genug für Abwechslung und knapp
 * genug, dass eine Entscheidung nötig wird.
 */
export const MAX_WEAPONS = 6;

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
    // Als aktive Waffe die erste ABWERFBARE wählen, nicht die Reserve.
    // Die Reserve hat unbegrenzte Munition und lässt sich nicht abwerfen; stünde
    // sie am Anfang aktiv, schlüge der erste Abwurfversuch mit einer Meldung
    // fehl, die für den Spieler keinen Sinn ergibt. Sie bleibt verfügbar und
    // rückt nur dann nach, wenn sonst nichts mehr da ist.
    const waehlbar = [...ammo.keys()].filter(id => !unlimited.has(id));
    const aktiv = waehlbar[0] ?? [...ammo.keys()][0] ?? null;
    // Die gewählte Waffe nach vorne, damit die Reihenfolge zur Anzeige passt.
    const reihenfolge = aktiv === null
      ? [...ammo.keys()]
      : [aktiv, ...[...ammo.keys()].filter(id => id !== aktiv)];

    this.#players.set(playerId, {
      weapons: reihenfolge,
      ammo,
      activeWeaponId: aktiv,
      credits: 0,
      unlimited,
    });
    return this.#players.get(playerId);
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
  grantWeapon(playerId, weaponId, { ammo = null } = {}) {
    const weapon = WEAPONS_BY_ID[weaponId];
    if (!weapon) return false;
    const entry = this.#players.get(playerId);
    if (!entry) return false;

    // `ammo` erlaubt das Aufheben einer abgeworfenen Waffe mit genau dem Vorrat,
    // den sie beim Abwerfen hatte. Ohne Angabe gilt das volle Magazin.
    const menge = ammo === null || ammo === undefined
      ? Math.max(1, weapon.maxAmmo || 1)
      : (ammo < 0 ? Infinity : Math.max(0, ammo));

    if (entry.ammo.has(weaponId)) {
      entry.ammo.set(weaponId, entry.ammo.get(weaponId) + (Number.isFinite(menge) ? menge : 0));
    } else {
      entry.ammo.set(weaponId, menge);
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

  /**
   * Führt der Spieler diese Waffe schon?
   * Zwei Formen: ohne Waffe prüft die Anmeldung, mit Waffe den Bestand.
   */
  has(playerId, weaponId) {
    if (weaponId === undefined) return this.#players.has(playerId);
    return this.#players.get(playerId)?.ammo.has(weaponId) ?? false;
  }

  /** Anzahl geführter Waffen, einschließlich der Reserve. */
  count(playerId) {
    return this.#players.get(playerId)?.weapons.length ?? 0;
  }

  /**
   * Anzahl ABWERFBARER Waffen.
   *
   * Die Reservewaffe ist ausgenommen: Sie lässt sich nicht abwerfen und darf
   * deshalb auch keinen Platz verbrauchen — sonst könnte ein Spieler am Limit
   * festsitzen, ohne etwas ablegen zu können.
   */
  droppableCount(playerId) {
    const entry = this.#players.get(playerId);
    if (!entry) return 0;
    return entry.weapons.filter(id => !entry.unlimited.has(id)).length;
  }

  /**
   * Ist der Vorrat an abwerfbaren Waffen voll?
   * Die Reserve zählt nicht mit (siehe droppableCount).
   */
  isFull(playerId) {
    return this.droppableCount(playerId) >= MAX_WEAPONS;
  }

  /**
   * Entfernt eine Waffe samt Munition und meldet den verbleibenden Vorrat.
   *
   * Die Reservewaffe (`FALLBACK_WEAPON_ID`) ist geschützt: Ohne sie bliebe ein
   * Match stehen, sobald alle Ladungen verbraucht sind. Ein Abwerfen der
   * Reserve wird deshalb abgelehnt statt still zugelassen.
   *
   * @returns {{ok:boolean, ammo:number, reason?:string}}
   */
  removeWeapon(playerId, weaponId) {
    const entry = this.#players.get(playerId);
    if (!entry) return { ok: false, ammo: 0, reason: 'Spieler unbekannt' };
    if (!entry.ammo.has(weaponId)) return { ok: false, ammo: 0, reason: 'Waffe nicht geführt' };
    if (entry.unlimited.has(weaponId)) {
      return { ok: false, ammo: 0, reason: 'Reservewaffe lässt sich nicht abwerfen' };
    }

    const rest = entry.ammo.get(weaponId);
    entry.ammo.delete(weaponId);
    entry.weapons = entry.weapons.filter(id => id !== weaponId);
    // Die aktive Waffe darf nicht ins Leere zeigen.
    if (entry.activeWeaponId === weaponId) {
      entry.activeWeaponId = entry.weapons[0] ?? null;
    }
    return { ok: true, ammo: Number.isFinite(rest) ? rest : -1 };
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
