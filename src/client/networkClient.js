/**
 * Clientseitiger Multiplayer-Anschluss.
 *
 * Der Server bleibt autoritativ: Dieser Client sendet nur Wünsche und rendert
 * empfangene Snapshots. Zwischen zwei Snapshots werden Positionen interpoliert,
 * damit die Darstellung bei 20 Hz Netzwerkrate flüssig bleibt. Verbindungsabbrüche
 * werden mit exponentiellem Backoff und Sitzungs-Token automatisch geheilt.
 *
 * @module networkClient
 */
import {
  CONTROL,
  MESSAGE_TYPE,
  MAGIC,
  controlMessage,
  parseControlMessage,
  decodeSnapshot,
} from '../shared/protocol.js';

export const CONNECTION_STATE = Object.freeze({
  IDLE: 'idle',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  RECONNECTING: 'reconnecting',
  CLOSED: 'closed',
});

const MAX_BACKOFF_MS = 8000;

export class NetworkClient {
  #url;
  #socket = null;
  #state = CONNECTION_STATE.IDLE;
  #token = null;
  #lobbyId = null;
  #entityId = null;
  #seed = null;
  #teamId = null;
  #snapshots = [];
  #listeners = new Map();
  #attempt = 0;
  #reconnectTimer = null;
  #shouldReconnect = true;
  #latencyMs = 0;
  #lastPingAt = 0;
  #messageLog = [];
  #lastServerError = null;
  #connectCalls = 0;
  #joinsSent = 0;
  /** Empfangene Snapshots insgesamt bzw. davon Vollsnapshots. */
  #snapshotsReceived = 0;
  #fullSnapshots = 0;
  /** Letzter dekodierter Snapshot — Basis für das Delta-Encoding. */
  #lastDecoded = null;
  #pingTimer = null;
  #pingIntervalMs;

  constructor({ url, lobbyId, token = null, playerName = 'Spieler', seed = null, preset = 'hills', teams = 2, playersPerTeam = 2 } = {}) {
    this.#url = url;
    this.#lobbyId = lobbyId ?? null;
    // Ein bereits reservierter Platz (z. B. aus der Lobby-Erstellung) wird per
    // Token fortgesetzt, statt einen zusätzlichen Platz zu belegen.
    this.#token = token ?? null;
    this.playerName = playerName;
    this.seed = seed;
    this.preset = preset;
    this.teams = teams;
    this.playersPerTeam = playersPerTeam;
  }

  on(type, handler) {
    if (!this.#listeners.has(type)) this.#listeners.set(type, []);
    this.#listeners.get(type).push(handler);
    return () => this.off(type, handler);
  }

  off(type, handler) {
    const list = this.#listeners.get(type);
    if (!list) return;
    const index = list.indexOf(handler);
    if (index >= 0) list.splice(index, 1);
  }

  #emit(type, payload) {
    for (const handler of this.#listeners.get(type) ?? []) {
      handler(payload);
    }
  }

  get state() { return this.#state; }
  get token() { return this.#token; }
  get entityId() { return this.#entityId; }
  get teamId() { return this.#teamId; }
  get lobbyId() { return this.#lobbyId; }
  get worldSeed() { return this.#seed; }
  get latencyMs() { return this.#latencyMs; }
  get messageLog() { return [...this.#messageLog]; }
  get lastServerError() { return this.#lastServerError; }
  /**
   * Diagnose: Verbindungsaufbau und Snapshots.
   *
   * `fullSnapshots` zählt die empfangenen Vollsnapshots. Ein Zähler und kein
   * Momentwert, weil der Vollsnapshot nur rund 50 ms lang der jüngste ist (der
   * Server sendet alle 2 s einen, dazwischen alle 50 ms ein Delta). Wer
   * `latestSnapshot.isFull` abfragt, muss diesen Moment zufällig treffen — ein
   * Test darauf ist ein Wettrennen. Der Zähler ist deterministisch, und für die
   * Diagnose („holt mich der Vollsnapshot zurück?") ist er ohnehin das, was man
   * wissen will.
   */
  get stats() {
    return {
      connectCalls: this.#connectCalls,
      joinsSent: this.#joinsSent,
      snapshotsReceived: this.#snapshotsReceived,
      fullSnapshots: this.#fullSnapshots,
    };
  }
  get isConnected() { return this.#state === CONNECTION_STATE.CONNECTED; }
  get isMyTurn() {
    const latest = this.latestSnapshot;
    return Boolean(latest && latest.activePlayerId === this.#entityId);
  }

  get latestSnapshot() {
    return this.#snapshots[this.#snapshots.length - 1] ?? null;
  }

  /** Restzugzeit aus dem jüngsten Snapshot (0, wenn keine läuft). */
  get turnRemainingMs() {
    return this.latestSnapshot?.turnRemainingMs ?? 0;
  }

  /** Öffnet die Verbindung und führt den Handshake aus. */
  async connect() {
    if (this.#socket && this.#state === CONNECTION_STATE.CONNECTED) return this;
    // Zweite parallele Verbindung verhindern: sie würde einen zweiten Platz
    // belegen und die Lobby fälschlich als voll markieren.
    if (this.#socket && !this.#reconnectTimer) {
      const readyState = this.#socket.readyState;
      if (readyState === 0 || readyState === 1) return this;
    }
    this.#connectCalls += 1;
    this.#shouldReconnect = true;
    this.#state = this.#attempt === 0 ? CONNECTION_STATE.CONNECTING : CONNECTION_STATE.RECONNECTING;
    this.#emit('state', this.#state);

    const socket = new WebSocket(this.#url);
    this.#socket = socket;
    socket.binaryType = 'arraybuffer';

    socket.addEventListener('open', () => {
      this.#attempt = 0;
      socket.send(controlMessage(CONTROL.HELLO));
      this.#joinsSent += 1;
      socket.send(controlMessage(CONTROL.JOIN_LOBBY, {
        lobbyId: this.#lobbyId,
        name: this.playerName,
        token: this.#token,
      }));
    });

    socket.addEventListener('message', event => this.#handleMessage(event.data));

    socket.addEventListener('close', () => {
      this.#state = CONNECTION_STATE.CLOSED;
      this.#emit('state', this.#state);
      if (this.#shouldReconnect) this.#scheduleReconnect();
    });

    socket.addEventListener('error', () => {
      this.#emit('error', { message: 'Verbindungsfehler' });
    });

    return this;
  }

  #scheduleReconnect() {
    if (this.#reconnectTimer) return;
    this.#attempt += 1;
    const delay = Math.min(MAX_BACKOFF_MS, 250 * 2 ** Math.min(this.#attempt, 5));
    this.#state = CONNECTION_STATE.RECONNECTING;
    this.#emit('state', this.#state);
    this.#emit('reconnect_scheduled', { attempt: this.#attempt, delay });

    this.#reconnectTimer = setTimeout(async () => {
      this.#reconnectTimer = null;
      try {
        await this.connect();
      } catch {
        this.#scheduleReconnect();
      }
    }, delay);
  }

  #handleMessage(data) {
    if (data instanceof ArrayBuffer) {
      const view = new Uint8Array(data);
      if (view[0] === MAGIC[0] && view[1] === MAGIC[1] && view[3] === MESSAGE_TYPE.PONG) {
        this.#latencyMs = Math.max(0, Math.round(performance.now() - this.#lastPingAt));
        this.#emit('latency', this.#latencyMs);
        return;
      }
      // `previous` übergeben, damit nicht übertragene Felder aus dem letzten
      // Snapshot übernommen werden (Delta-Encoding).
      const snapshot = decodeSnapshot(data, this.#lastDecoded?.previous ?? null);
      if (!snapshot) return;
      this.#lastDecoded = snapshot;
      this.#snapshots.push(snapshot);
      if (this.#snapshots.length > 30) this.#snapshots.shift();
      this.#snapshotsReceived += 1;
      if (snapshot.isFull) this.#fullSnapshots += 1;
      this.#emit('snapshot', snapshot);
      return;
    }

    const message = parseControlMessage(typeof data === 'string' ? data : new TextDecoder().decode(data));
    if (!message) return;

    // Kleines Diagnoseprotokoll: hilft bei Verbindungsproblemen und im Debug-UI.
    this.#messageLog.push(message.t);
    if (this.#messageLog.length > 40) this.#messageLog.shift();

    switch (message.t) {
      case CONTROL.WELCOME:
        if (message.token) {
          this.#token = message.token;
          this.#lobbyId = message.lobbyId ?? this.#lobbyId;
          this.#entityId = message.entityId ?? null;
          if (message.seed !== undefined) this.#seed = message.seed;
          this.#state = CONNECTION_STATE.CONNECTED;
          this.#emit('joined', {
            token: this.#token,
            entityId: this.#entityId,
            seatIndex: message.seatIndex,
            resumed: message.resumed,
            seed: this.#seed,
          });
          this.#emit('state', this.#state);
        } else {
          this.#emit('hello', { protocol: message.protocol });
        }
        break;

      case CONTROL.LOBBY_STATE: {
        this.#lobbyId = message.lobby ?? this.#lobbyId;
        if (message.seed !== undefined) this.#seed = message.seed;
        this.#emit('lobby_state', message);
        break;
      }

      case CONTROL.LOADOUTS:
        // Waffenbestände je Spieler. Eigener Fall statt Durchreichen an
        // 'game_event', weil sie den Ansichtszustand ergänzen und nicht als
        // Spielereignis protokolliert werden sollen.
        this.#emit('loadouts', message.loadouts ?? {});
        break;

      case CONTROL.ERROR:
        this.#lastServerError = message.errors?.[0] ?? message.error ?? 'Unbekannter Serverfehler';
        this.#emit('server_error', message);
        break;

      default:
        // Simulierte Spielereignisse (turn_start, explosion, terrain_destroyed, ...)
        this.#emit('game_event', message);
        break;
    }
  }

  /**
   * Interpoliert die Positionen zwischen den letzten beiden Snapshots.
   * Ohne zweiten Snapshot werden die Rohwerte durchgereicht.
   */
  interpolatedEntities() {
    const latest = this.#snapshots[this.#snapshots.length - 1];
    if (!latest) return [];
    const previous = this.#snapshots[this.#snapshots.length - 2];
    if (!previous || previous.tick === latest.tick) return latest.entities;

    const tickDelta = latest.tick - previous.tick;
    const alpha = tickDelta <= 0 ? 1 : 0.5;

    return latest.entities.map(entity => {
      const before = previous.entities.find(entry => entry.entityId === entity.entityId);
      if (!before || !entity.alive) return entity;
      return {
        ...entity,
        x: before.x + (entity.x - before.x) * alpha,
        y: before.y + (entity.y - before.y) * alpha,
      };
    });
  }

  sendInput(angle, power, weaponId = null) {
    if (!this.isConnected || !this.#socket) return false;
    const snapshot = this.latestSnapshot;
    this.#socket.send(controlMessage(CONTROL.INPUT, {
      angle,
      power,
      weaponId,
      tick: snapshot?.tick ?? 0,
    }));
    return true;
  }

  selectWeapon(weaponId) {
    if (!this.isConnected || !this.#socket) return false;
    this.#socket.send(controlMessage(CONTROL.SELECT_WEAPON, { weaponId }));
    return true;
  }

  ping() {
    if (!this.isConnected || !this.#socket) return;
    this.#lastPingAt = performance.now();
    this.#socket.send(controlMessage(CONTROL.PING));
  }

  /**
   * Startet die regelmäßige Latenzmessung.
   *
   * Ohne Intervall wurde die Latenz nur bei einem manuellen Ping gemessen und
   * blieb im HUD praktisch konstant. Das Intervall ist bewusst größer als die
   * Snapshot-Rate, damit die Messung die Verbindung nicht zusätzlich belastet.
   */
  startPing(intervalMs = 2000) {
    this.stopPing();
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
      throw new TypeError('Ping-Intervall muss eine positive Zahl in Millisekunden sein');
    }
    this.#pingIntervalMs = intervalMs;
    this.#pingTimer = setInterval(() => this.ping(), intervalMs);
    // Erste Messung sofort, damit die Anzeige nicht zwei Sekunden leer bleibt.
    this.ping();
    return this;
  }

  stopPing() {
    if (this.#pingTimer) clearInterval(this.#pingTimer);
    this.#pingTimer = null;
  }

  get pingActive() { return this.#pingTimer !== null; }
  get pingIntervalMs() { return this.#pingIntervalMs ?? null; }

  disconnect({ permanent = true } = {}) {
    this.stopPing();
    this.#shouldReconnect = !permanent;
    if (this.#reconnectTimer) {
      clearTimeout(this.#reconnectTimer);
      this.#reconnectTimer = null;
    }
    this.#socket?.close();
    this.#socket = null;
    this.#state = CONNECTION_STATE.CLOSED;
    this.#emit('state', this.#state);
  }
}

export default NetworkClient;
