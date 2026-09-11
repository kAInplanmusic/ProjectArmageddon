/**
 * In-Memory-Lobby-Verwaltung.
 *
 * Eine Lobby hält Spielerplätze, Wiederbeitritts-Token und die Match-
 * Konfiguration. Zustand liegt bewusst nur im Speicher des autoritativen
 * Servers — es gibt keine Client-Autorität über Slot-Belegung.
 *
 * @module LobbyManager
 */
import { randomUUID } from 'node:crypto';
import { ORIENTATIONS } from '../engine/match.js';

export const LOBBY_STATUS = Object.freeze({
  OPEN: 'open',
  RUNNING: 'running',
  FINISHED: 'finished',
});

export const MAX_LOBBY_PLAYERS = 12;

export class LobbyManager {
  #lobbies = new Map();
  #reconnectWindowMs;

  constructor({ reconnectWindowMs = 30_000 } = {}) {
    this.#reconnectWindowMs = reconnectWindowMs;
  }

  create({ teams = 2, playersPerTeam = 2, preset = 'hills', seed = undefined, hostName = 'Host', orientation = 'landscape' } = {}) {
    if (teams < 2 || teams > 4) throw new Error('teams muss zwischen 2 und 4 liegen');
    if (playersPerTeam < 1 || playersPerTeam > 3) throw new Error('playersPerTeam muss zwischen 1 und 3 liegen');
    const capacity = teams * playersPerTeam;
    if (capacity > MAX_LOBBY_PLAYERS) throw new Error(`Kapazität überschreitet ${MAX_LOBBY_PLAYERS} Spieler`);
    if (!ORIENTATIONS.includes(orientation)) throw new Error(`Unbekannte Ausrichtung: ${orientation}`);

    const id = randomUUID().slice(0, 8);
    const lobby = {
      id,
      teams,
      playersPerTeam,
      capacity,
      preset,
      // Ausrichtung gehört zur Lobby: sie bestimmt die Kartengröße und muss für
      // alle Teilnehmer dieselbe sein.
      orientation,
      seed,
      status: LOBBY_STATUS.OPEN,
      createdAt: Date.now(),
      seats: [],
    };
    this.#lobbies.set(id, lobby);

    const host = this.join(id, { name: hostName });
    return { lobby: this.describe(id), player: host };
  }

  get(id) {
    return this.#lobbies.get(id) ?? null;
  }

  /**
   * Setzt eine bereits aufgebaute Lobby unter ihrer ID ein (Wiederherstellung
   * nach Serverneustart). Erwartet ein vollständiges Lobby-Objekt.
   */
  restoreWithId(lobby) {
    if (!lobby || typeof lobby.id !== 'string') {
      throw new TypeError('Lobby mit gültiger ID erwartet');
    }
    this.#lobbies.set(lobby.id, lobby);
    return lobby;
  }

  describe(id) {
    const lobby = this.get(id);
    if (!lobby) return null;
    return {
      id: lobby.id,
      teams: lobby.teams,
      playersPerTeam: lobby.playersPerTeam,
      capacity: lobby.capacity,
      preset: lobby.preset,
      orientation: lobby.orientation,
      status: lobby.status,
      // Belegt = reservierte Plätze. Die Entity-ID existiert erst, wenn ein
      // Match gestartet und die Welt erzeugt wurde.
      occupied: lobby.seats.length,
      connected: lobby.seats.filter(seat => seat.connected).length,
      seats: lobby.seats.map(seat => ({
        seatIndex: seat.seatIndex,
        name: seat.name,
        entityId: seat.entityId,
        connected: seat.connected,
        teamId: seat.seatIndex % lobby.teams,
      })),
    };
  }

  /**
   * Lobbys für die Auswahlliste im Menü.
   *
   * Entschiedene Lobbys werden ausgelassen: Sie lassen sich nicht mehr
   * betreten (`join` lehnt bei status !== OPEN ab), und ihre Anzeige wäre eine
   * Sackgasse. In der Entwicklungsdatei sammelten sich 258 davon an und
   * verdeckten die spielbaren Einträge vollständig.
   *
   * @param {object} [optionen]
   * @param {boolean} [optionen.mitBeendeten=false] - auch entschiedene zeigen
   */
  list({ mitBeendeten = false } = {}) {
    return [...this.#lobbies.values()]
      .filter(lobby => mitBeendeten || lobby.status !== LOBBY_STATUS.FINISHED)
      .map(lobby => this.describe(lobby.id));
  }

  /** Belegt einen freien Platz. Ohne lobbyId wird eine neue Lobby erstellt. */
  join(lobbyId, { name = 'Spieler', token = null } = {}) {
    const lobby = this.get(lobbyId);
    if (!lobby) throw new Error('Lobby nicht gefunden');

    // Wiederverbindung: bekannter Token darf denselben Platz zurückholen.
    if (token) {
      const existing = lobby.seats.find(seat => seat.token === token);
      if (existing) {
        existing.connected = true;
        existing.disconnectedAt = null;
        return { ...existing, lobbyId, resumed: true };
      }
    }

    if (lobby.status !== LOBBY_STATUS.OPEN) throw new Error('Lobby nimmt keine Spieler mehr auf');
    if (lobby.seats.length >= lobby.capacity) {
      throw new Error(`Lobby ist voll (${lobby.seats.length}/${lobby.capacity} Plätze belegt)`);
    }

    const seatIndex = lobby.seats.length;
    if (seatIndex >= lobby.capacity) {
      throw new Error(`Lobby ist voll (${lobby.seats.length}/${lobby.capacity} Plätze belegt)`);
    }

    const seat = {
      seatIndex,
      name,
      token: randomUUID(),
      connected: true,
      disconnectedAt: null,
      entityId: null,
    };
    lobby.seats.push(seat);
    return { ...seat, lobbyId, resumed: false };
  }

  /** Markiert einen Platz als getrennt und startet das Reconnect-Fenster. */
  disconnect(lobbyId, token) {
    const lobby = this.get(lobbyId);
    if (!lobby) return null;
    const seat = lobby.seats.find(entry => entry.token === token);
    if (!seat) return null;
    seat.connected = false;
    seat.disconnectedAt = Date.now();
    return seat;
  }

  /** Entfernt abgelaufene Plätze. Gibt die betroffenen Token zurück. */
  pruneDisconnected(now = Date.now()) {
    const removed = [];
    for (const lobby of this.#lobbies.values()) {
      lobby.seats = lobby.seats.filter(seat => {
        if (seat.connected || seat.disconnectedAt === null) return true;
        if (now - seat.disconnectedAt < this.#reconnectWindowMs) return true;
        removed.push({ lobbyId: lobby.id, token: seat.token, name: seat.name });
        return false;
      });
      lobby.seats.forEach((seat, index) => { seat.seatIndex = index; });
    }
    return removed;
  }

  markRunning(lobbyId) {
    const lobby = this.get(lobbyId);
    if (!lobby) return null;
    lobby.status = LOBBY_STATUS.RUNNING;
    return lobby;
  }

  markFinished(lobbyId) {
    const lobby = this.get(lobbyId);
    if (!lobby) return null;
    lobby.status = LOBBY_STATUS.FINISHED;
    return lobby;
  }

  close(lobbyId) {
    return this.#lobbies.delete(lobbyId);
  }

  /**
   * Alle Lobbys als Rohobjekte (nicht die beschreibende Ansicht).
   *
   * Nötig für die Persistenz: `list()` liefert nur die nach außen sichtbaren
   * Felder, während zum Speichern auch Sitze und Token gebraucht werden.
   */
  all() {
    return [...this.#lobbies.values()];
  }

  get size() {
    return this.#lobbies.size;
  }
}

export default LobbyManager;
