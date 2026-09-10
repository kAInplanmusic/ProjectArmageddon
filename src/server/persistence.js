/**
 * Persistenz für Lobbys und laufende Matches.
 *
 * Gespeichert wird nicht der ECS-Zustand, sondern der Replay-Kern: Seed,
 * Konfiguration, Sitzplätze und die geordnete Eingabeliste. Da die Simulation
 * deterministisch ist, wird ein Match beim Wiederherstellen exakt rekonstruiert
 * — bei einem Bruchteil der Datenmenge eines Zustandsdumps.
 *
 * Ablage: eine einzelne JSON-Datei, atomar geschrieben (temp + rename), damit
 * ein Absturz mitten im Schreiben keine halbe Datei hinterlässt.
 *
 * @module persistence
 */
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync, unlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

export const PERSISTENCE_VERSION = 1;

export class PersistenceStore {
  #path;
  #enabled;
  #lastError = null;

  /**
   * @param {object} [options]
   * @param {string} [options.path='.pa-state/lobbies.json']
   * @param {boolean} [options.enabled=true]
   */
  constructor({ path = '.pa-state/lobbies.json', enabled = true } = {}) {
    this.#path = resolve(process.cwd(), path);
    this.#enabled = enabled;
  }

  get path() { return this.#path; }
  get enabled() { return this.#enabled; }
  get lastError() { return this.#lastError; }

  /** Schreibt den Zustand atomar. Fehler werden protokolliert, nicht geworfen. */
  save(payload) {
    if (!this.#enabled) return false;
    try {
      mkdirSync(dirname(this.#path), { recursive: true });
      const document = {
        version: PERSISTENCE_VERSION,
        savedAt: Date.now(),
        ...payload,
      };
      const temp = `${this.#path}.${randomUUID().slice(0, 8)}.tmp`;
      writeFileSync(temp, JSON.stringify(document), 'utf8');
      renameSync(temp, this.#path);
      this.#lastError = null;
      return true;
    } catch (error) {
      this.#lastError = error.message;
      return false;
    }
  }

  /** Liest den Zustand. Gibt null zurück, wenn keine gültige Datei vorliegt. */
  load() {
    if (!this.#enabled) return null;
    if (!existsSync(this.#path)) return null;
    try {
      const parsed = JSON.parse(readFileSync(this.#path, 'utf8'));
      if (!parsed || parsed.version !== PERSISTENCE_VERSION) {
        this.#lastError = `Unbekannte Persistenz-Version: ${parsed?.version}`;
        return null;
      }
      this.#lastError = null;
      return parsed;
    } catch (error) {
      // Beschädigte Datei nicht als Absturz behandeln: ignorieren und weiterlaufen.
      this.#lastError = `Beschädigte Zustandsdatei: ${error.message}`;
      return null;
    }
  }

  clear() {
    try {
      if (existsSync(this.#path)) unlinkSync(this.#path);
      return true;
    } catch (error) {
      this.#lastError = error.message;
      return false;
    }
  }
}

/**
 * Baut den persistierbaren Ausschnitt einer Lobby zusammen.
 *
 * @param {object} lobby - Lobby aus dem LobbyManager
 * @param {object} session - LobbySession (enthält Match + aufgezeichnete Eingaben)
 * @returns {object}
 */
export function serializeLobby(lobby, session) {
  return {
    id: lobby.id,
    teams: lobby.teams,
    playersPerTeam: lobby.playersPerTeam,
    capacity: lobby.capacity,
    preset: lobby.preset,
    seed: lobby.seed,
    status: lobby.status,
    createdAt: lobby.createdAt,
    seats: lobby.seats.map(seat => ({
      seatIndex: seat.seatIndex,
      name: seat.name,
      token: seat.token,
      entityId: seat.entityId,
      connected: false,
    })),
    // Replay-Kern: Seed + Konfiguration + Eingaben genügen zur Rekonstruktion.
    replay: session?.recorder?.toJSON() ?? null,
    tick: session?.match?.world?.tickCount ?? 0,
  };
}

/**
 * Stellt eine Lobby aus einem gespeicherten Datensatz wieder her.
 * Die Sitzplätze gelten als getrennt — Clients müssen sich per Token neu
 * verbinden, werden dann aber demselben Match zugeordnet.
 *
 * @param {object} saved
 * @param {object} deps
 * @param {object} deps.lobbyManager
 * @param {function(object):object} deps.createSession - erzeugt eine LobbySession
 * @returns {{lobby: object, session: object}}
 */
export function restoreLobby(saved, { lobbyManager, createSession }) {
  const lobby = lobbyManager.create({
    teams: saved.teams,
    playersPerTeam: saved.playersPerTeam,
    preset: saved.preset,
    seed: saved.seed,
    hostName: saved.seats?.[0]?.name ?? 'Host',
  }).lobby;

  // Die generierte ID ersetzen, damit alte Join-Links weiter funktionieren.
  const internal = lobbyManager.get(lobby.id);
  if (internal && saved.id) {
    lobbyManager.close(lobby.id);
    internal.id = saved.id;
    // Direkt in die interne Map einsetzen.
    lobbyManager.restoreWithId(internal);
  }

  const session = createSession(lobbyManager.get(saved.id) ?? internal, {
    skipStart: false,
    replayEntries: saved.replay?.entries ?? [],
    replayTotalTicks: saved.replay?.totalTicks ?? 0,
  });

  // Sitzplätze mit ihren alten Tokens wiederherstellen, damit Reconnect greift.
  const target = lobbyManager.get(saved.id);
  if (target && Array.isArray(saved.seats)) {
    target.seats = saved.seats.map((seat, index) => ({
      seatIndex: index,
      name: seat.name,
      token: seat.token,
      connected: false,
      disconnectedAt: Date.now(),
      entityId: seat.entityId ?? null,
    }));
  }

  return { lobby: target, session };
}

export default PersistenceStore;
