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
import { hashState } from '../engine/stateSnapshot.js';

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
  // Aufzeichnung vor dem Auslesen abschließen. Ohne das bleibt `totalTicks`
  // bei 0, und ein gespieltes Match wäre von einer leeren Lobby nicht zu
  // unterscheiden — es käme dann ohne Sitzung zurück. `finalize` arbeitet mit
  // Math.max, ist also bei mehrfachem Aufruf unschädlich.
  const ticks = session?.match?.world?.tickCount ?? 0;
  session?.recorder?.finalize?.(ticks);

  /*
   * Der Seed, der WIRKLICH gespielt wurde.
   *
   * FUND (belegt, Datenfluss-Audit): Hier stand `seed: lobby.seed`. Ohne
   * Eingabe im Menü ist der Wert `undefined` — und `JSON.stringify` lässt einen
   * `undefined`-Schlüssel ersatzlos WEG (gemessen: kein `"seed":` in der
   * Datei). Beim Wiederaufbau stand die Partie danach auf einer ANDEREN Karte:
   * `restoreLobby` reichte `undefined` an den `MatchController`, der daraus
   * einen frischen Zufalls-Seed zieht (`match.js:564`
   * `MatchSeedManager.createRandom()`). Gemessen: baseSeed 3367130477 →
   * 1341271627, Zustandshash `98aad2e2` → `e6da56da`.
   *
   * Der echte Wert lag die ganze Zeit im MOTOR (`seedManager.baseSeed`) und im
   * Replay-Kopf (`replay.seed`). Er wird hier ausdrücklich mitgeschrieben; der
   * Rückfall auf alte Dateien bleibt (`replay.seed`, siehe `restoreLobby`).
   */
  const seed = lobby.seed ?? session?.match?.seedManager?.baseSeed ?? null;

  /*
   * Der ZUSTANDSHASH der gesicherten Partie.
   *
   * FUND (belegt, Datenfluss-Audit): Der Wiederaufbau lief einen Takt zu weit
   * (`#restoreFromReplay`, `limit = … + 1`), während der Kommentar darüber
   * „exakt derselbe Zustand" behauptete. Gemessen: 420 → 421 Takte, alle
   * Figuren 8 px tiefer, Hash `1e199a57` → `d4248776`.
   *
   * Ein solcher Fehler war STILL, weil niemand den wiederhergestellten Zustand
   * gegen den gesicherten hielt. Mit diesem Feld tut es `restoreLobby`: Es
   * vergleicht und schreibt eine Zeile — gleich oder abweichend. Der Hash wird
   * mit `hashState()` gebildet, also mit DEMSELBEN Verfahren, das die
   * Determinismus-Zusage des Replays prüft.
   */
  const hash = session?.match ? hashState(session.match.getState()) : null;

  return {
    id: lobby.id,
    teams: lobby.teams,
    playersPerTeam: lobby.playersPerTeam,
    capacity: lobby.capacity,
    preset: lobby.preset,
    orientation: lobby.orientation ?? 'landscape',
    seed,
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
    /** Zustandshash des gesicherten Takts — Prüfwert für den Wiederaufbau. */
    hash,
  };
}

/**
 * Stellt eine Lobby aus einem gespeicherten Datensatz wieder her.
 *
 * Die Sitzplätze gelten als getrennt — Clients müssen sich per Token neu
 * verbinden, werden dann aber demselben Match zugeordnet.
 *
 * Eine Sitzung (mit Match) wird nur erzeugt, wenn ein Replay-Kern vorliegt.
 * Eine Lobby, in der noch nie jemand gespielt hat, hat keinen und wird rein als
 * Lobby wiederhergestellt; beim ersten Beitritt entsteht die Sitzung dann neu.
 *
 * @param {object} saved
 * @param {object} deps
 * @param {object} deps.lobbyManager
 * @param {function(object):object} deps.createSession - erzeugt eine LobbySession
 * @param {object} [deps.logger] - strukturierter Logger; ohne ihn unterbleibt
 *   die Meldung über den Zustandsvergleich (siehe unten)
 * @returns {{lobby: object, session: object|null, hashPruefung: object|null}}
 *   `hashPruefung` ist `null`, wenn keine Sicherung mit Hash vorlag — sonst
 *   `{gleich, erwartet, gemessen, tick, tickGesichert}`.
 */
export function restoreLobby(saved, { lobbyManager, createSession, logger = null }) {
  /*
   * Der Seed kommt aus der Sicherung — und wenn dort keiner steht, aus dem
   * REPLAY-KOPF.
   *
   * FUND (belegt, Datenfluss-Audit): Hier stand allein `saved.seed`. Eine Lobby
   * ohne Eingabe im Seed-Feld speicherte `undefined`, und `JSON.stringify`
   * lässt den Schlüssel weg — der Wert fehlte also in der Datei, obwohl der
   * Replay-Kopf denselben Seed trug (gemessen 3367130477). Der Wiederaufbau zog
   * einen NEUEN Zufalls-Seed (`match.js:564`), und die fortgesetzte Partie stand
   * auf einer anderen Karte: baseSeed 3367130477 → 1341271627, Hash `98aad2e2`
   * → `e6da56da`.
   *
   * Der Rückfall liest dieselbe Zahl, die auch die Wiedergabe benutzt — ein
   * zweiter Ort für den Seed ist damit nicht nötig. Alte Sicherungen (ohne
   * `seed`, ohne `hash`) funktionieren unverändert, weil ihr Replay-Kopf den
   * Seed schon immer trug.
   */
  const seed = saved.seed ?? saved.replay?.seed ?? undefined;

  const lobby = lobbyManager.create({
    teams: saved.teams,
    playersPerTeam: saved.playersPerTeam,
    preset: saved.preset,
    orientation: saved.orientation ?? 'landscape',
    seed,
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

  const zielLobby = lobbyManager.get(saved.id) ?? internal;

  // Ohne Replay-Kern gibt es kein Match fortsetzen: Die Lobby bleibt leer und
  // bekommt ihre Sitzung beim ersten Beitritt.
  const hatReplay = Boolean(saved.replay)
    && (saved.replay.entries?.length > 0 || (saved.replay.totalTicks ?? 0) > 0);

  const session = hatReplay
    ? createSession(zielLobby, {
      skipStart: false,
      replayEntries: saved.replay.entries ?? [],
      replayTotalTicks: saved.replay.totalTicks ?? 0,
    })
    : null;

  // Sitzplätze mit ihren alten Tokens wiederherstellen, damit Reconnect greift.
  const target = lobbyManager.get(saved.id);
  if (target) {
    // Der gespeicherte Status muss erhalten bleiben: `create()` legt die Lobby
    // immer als offen an, auch wenn sie beim Speichern bereits lief.
    if (saved.status) target.status = saved.status;
    if (saved.createdAt) target.createdAt = saved.createdAt;
  }
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

  /*
   * Die Gegenprobe: Steht die wiederhergestellte Partie auf dem Zustand, der
   * gesichert wurde?
   *
   * Sie ist der Kern dieser Änderung. Vorher gab es niemanden, der diese Frage
   * stellte — und genau deshalb blieb der Takt-Fehler („ein Schritt zu weit")
   * und der Seed-Fehler („andere Karte") unbemerkt. Jetzt steht bei JEDER
   * Wiederherstellung eine Zeile im Log: gleich oder abweichend, mit beiden
   * Hashes und beiden Taktzahlen. Ein künftiger Fehler dieser Klasse wird damit
   * beim ersten Neustart laut statt still.
   *
   * Fehlt `saved.hash` (Sicherung aus einer älteren Fassung), unterbleibt die
   * Prüfung — sie behauptet nichts, was sie nicht messen kann.
   */
  let hashPruefung = null;
  if (session && typeof saved.hash === 'string') {
    const gemessen = hashState(session.match.getState());
    const takt = session.match.world.tickCount;
    hashPruefung = {
      gleich: gemessen === saved.hash,
      erwartet: saved.hash,
      gemessen,
      tick: takt,
      tickGesichert: saved.tick ?? null,
    };
    if (hashPruefung.gleich) {
      logger?.info('restore_hash', 'Wiederherstellung exakt — Zustandshash stimmt mit der Sicherung überein', {
        lobbyId: saved.id, hash: gemessen, tick: takt,
      });
    } else {
      logger?.warn('restore_hash_abweichung', 'Wiederhergestellter Zustand weicht von der Sicherung ab', {
        lobbyId: saved.id, ...hashPruefung,
      });
    }
  }

  return { lobby: target, session, hashPruefung };
}

export default PersistenceStore;
