/**
 * DOM-HUD: Runden-, Wind- und Zugzeitanzeige, Spielerliste, Waffenliste
 * und Ereignisprotokoll.
 *
 * Das HUD liest ausschließlich aus dem Match-State und schreibt nie in die
 * Simulation — die Trennung hält Replays und Netzwerk-Sync sauber.
 *
 * @module hud
 */
import { TEAM_COLORS } from '../engine/match.js';
import { getWeapon } from '../shared/config/weapons.js';

const LOG_LIMIT = 6;

export class Hud {
  #elements;
  #logEntries = [];
  #selectedWeaponIndex = 0;
  #rosterSignature = '';
  #weaponSignature = '';

  constructor(documentRef = document) {
    this.#elements = {
      round: documentRef.getElementById('hud-round'),
      wind: documentRef.getElementById('hud-wind'),
      timer: documentRef.getElementById('hud-timer'),
      status: documentRef.getElementById('hud-status'),
      roster: documentRef.getElementById('roster'),
      weapons: documentRef.getElementById('weapon-list'),
      angle: documentRef.getElementById('hud-angle'),
      power: documentRef.getElementById('hud-power'),
      active: documentRef.getElementById('hud-active'),
      log: documentRef.getElementById('log-list'),
      connection: documentRef.getElementById('hud-connection'),
    };
  }

  /**
   * Zeigt den Verbindungszustand im Online-Modus.
   * @param {string} state
   * @param {number} latencyMs
   */
  setConnection(state, latencyMs = 0) {
    const element = this.#elements.connection;
    if (!element) return;
    const labels = {
      idle: 'offline',
      connecting: 'verbindet …',
      connected: `online · ${latencyMs} ms`,
      reconnecting: 'neu verbinden …',
      closed: 'getrennt',
    };
    element.textContent = labels[state] ?? state;
    element.style.color = state === 'connected' ? '#90be6d'
      : state === 'reconnecting' || state === 'closed' ? '#ef476f'
      : '#8ba0b4';
  }

  get elements() {
    return this.#elements;
  }

  /** Aktualisiert alle HUD-Felder aus einem Match-State. */
  update(state, { aim = null, onWeaponSelect = null } = {}) {
    const el = this.#elements;
    if (el.round) el.round.textContent = String(state.round);
    if (el.wind) {
      const wind = state.wind ?? 0;
      el.wind.textContent = `${wind >= 0 ? '→' : '←'} ${Math.abs(wind).toFixed(3)}`;
      el.wind.style.color = Math.abs(wind) > 0.03 ? '#ef476f' : '#e8eef5';
    }
    if (el.timer) {
      const remaining = Math.max(0, (state.turnDurationMs - state.turnElapsedMs) / 1000);
      el.timer.textContent = remaining.toFixed(0);
      el.timer.style.color = remaining < 6 ? '#ef476f' : '#e8eef5';
    }
    if (el.status) {
      el.status.textContent = state.status === 'gameover'
        ? 'Ende'
        : state.maelstrom?.active ? 'Mahlstrom' : 'Läuft';
      el.status.style.color = state.maelstrom?.active ? '#ef476f' : '#90be6d';
    }

    this.#renderRoster(state);
    this.#renderWeapons(state, onWeaponSelect);

    const active = state.entities.find(entity => entity.entityId === state.activePlayerId);
    if (el.active) {
      el.active.textContent = active ? `${active.label} am Zug` : '—';
      el.active.style.color = active ? TEAM_COLORS[active.teamId % TEAM_COLORS.length] : '#8ba0b4';
    }
    if (el.angle) el.angle.textContent = `${Math.round((((aim?.angle ?? active?.angle ?? 0)) * 180) / Math.PI)}°`;
    if (el.power) el.power.textContent = String(Math.round(aim?.power ?? active?.power ?? 0));
  }

  #renderRoster(state) {
    const list = this.#elements.roster;
    if (!list) return;

    const signature = state.entities
      .map(entity => `${entity.entityId}:${entity.alive ? 1 : 0}:${Math.round(entity.health)}:${entity.entityId === state.activePlayerId ? 1 : 0}`)
      .join('|');
    if (this.#rosterSignature === signature) return;
    this.#rosterSignature = signature;

    list.replaceChildren(...state.entities.map(entity => {
      const item = document.createElement('li');
      item.className = 'roster-item';
      item.dataset.entityId = String(entity.entityId);
      if (entity.entityId === state.activePlayerId) item.classList.add('is-active');
      if (!entity.alive) item.classList.add('is-dead');

      const name = document.createElement('span');
      name.textContent = entity.label;
      name.style.color = TEAM_COLORS[entity.teamId % TEAM_COLORS.length];

      const track = document.createElement('span');
      track.className = 'hp-track';
      const fill = document.createElement('span');
      fill.className = 'hp-fill';
      const ratio = entity.maxHealth > 0 ? Math.max(0, entity.health / entity.maxHealth) : 0;
      fill.style.width = `${Math.round(ratio * 100)}%`;
      fill.style.background = ratio > 0.6 ? '#90be6d' : ratio > 0.3 ? '#fbbf24' : '#ef476f';
      track.append(fill);

      const hp = document.createElement('span');
      hp.textContent = String(Math.max(0, Math.round(entity.health)));
      hp.style.fontVariantNumeric = 'tabular-nums';

      item.append(name, track, hp);
      return item;
    }));
  }

  #renderWeapons(state, onWeaponSelect) {
    const list = this.#elements.weapons;
    if (!list) return;

    const active = state.entities.find(entity => entity.entityId === state.activePlayerId);
    const weapons = active?.inventory ?? [];
    const signature = `${state.activePlayerId}:${weapons.join(',')}:${active?.activeWeaponId ?? ''}`;
    if (this.#weaponSignature === signature) return;
    this.#weaponSignature = signature;

    list.replaceChildren(...weapons.map((weaponId, index) => {
      const weapon = getWeapon(weaponId);
      const item = document.createElement('li');
      item.className = 'weapon-item';
      item.dataset.weaponId = weaponId;
      if (weaponId === active?.activeWeaponId) item.classList.add('is-active');

      const label = document.createElement('span');
      label.textContent = `${index + 1}. ${weapon?.displayName ?? weaponId}`;

      const meta = document.createElement('span');
      const ammo = active?.ammo?.[weaponId];
      meta.textContent = ammo === 'unbegrenzt'
        ? `${weapon?.damage ?? 0} DMG · ∞`
        : `${weapon?.damage ?? 0} DMG · ${ammo ?? 0}`;
      meta.style.color = '#8ba0b4';

      item.append(label, meta);
      item.addEventListener('click', () => onWeaponSelect?.(index));
      return item;
    }));
  }

  /** Fügt eine Zeile zum Ereignisprotokoll hinzu. */
  log(message, tone = 'neutral') {
    this.#logEntries.unshift({ message, tone });
    if (this.#logEntries.length > LOG_LIMIT) this.#logEntries.pop();

    const list = this.#elements.log;
    if (!list) return;

    list.replaceChildren(...this.#logEntries.map(entry => {
      const item = document.createElement('li');
      item.textContent = entry.message;
      item.style.color = entry.tone === 'danger' ? '#ef476f'
        : entry.tone === 'good' ? '#90be6d'
        : entry.tone === 'accent' ? '#f4a261'
        : '#8ba0b4';
      return item;
    }));
  }

  clearLog() {
    this.#logEntries = [];
    this.#elements.log?.replaceChildren();
  }
}

export default Hud;
