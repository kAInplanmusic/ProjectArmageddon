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

/** Simulations-Ticks je Sekunde (Simulation läuft mit 60 Hz, Snapshots mit 20 Hz). */
export const TICKS_PER_SECOND = 60;

/** Dauer eines Simulations-Ticks in Millisekunden. */
export const TICK_MS = 1000 / TICKS_PER_SECOND;

/**
 * Der Tick, auf den sich eine Eingabe bezieht.
 *
 * ## Warum fortgeschrieben und nicht roh
 *
 * FUND (belegt, gemessen 2026-09-19): Gesendet wurde der Tick des zuletzt
 * EMPFANGENEN Snapshots. Zwischen Empfang und Verarbeitung vergeht auf einem
 * langsamen Rechner viel Zeit — gemessen: Client-Tick 235 gegen Server-Tick 269,
 * also 34 Ticks (≈570 ms) Rückstand bei einem Lag-Kompensationsfenster von 12
 * Ticks (200 ms). Der Server ließ den Schuss daraufhin fallen („Tick liegt
 * ausserhalb des Lag-Kompensationsfensters"), und ein GÜLTIGER Schuss verpuffte.
 * Je langsamer die Maschine, desto sicherer trifft es den Spieler.
 *
 * Deshalb wird der Tick um die seit dem Empfang vergangene Zeit fortgeschrieben.
 * Das ist bewusst KONSERVATIV: Die Empfangszeit liegt immer NACH dem Moment, in
 * dem der Server den Snapshot erzeugt hat (Netzweg + Verarbeitung). Die
 * Schätzung liegt damit nie in der Zukunft — sie holt nur den eigenen Rückstand
 * auf, sie eilt dem Server nicht voraus.
 *
 * ## Grenze der Behebung (gemessen 2026-09-19)
 *
 * Die Fortschreibung ALLEIN genügt nicht: Im freilaufenden Online-Match blieb
 * der Schuss trotzdem `discarded`. Die Messung zeigt warum — der neueste
 * Snapshot trug beim Schuss Tick 231, 1,5 s später trug er 391. Das sind über
 * 160 Ticks in 1,5 s, also mehr als 100 Ticks je Sekunde. Entweder läuft die
 * Server-Simulation schneller als 60 Hz, oder die Seite verarbeitet die
 * Snapshots so langsam, dass sie dauerhaft Sekunden zurückliegt. Beides
 * untergräbt die Annahme, dass ein Tick 1/60 Sekunde ist — und genau darauf
 * beruht das Fenster von 12 Ticks. Der nächste Schritt ist deshalb NICHT hier,
 * sondern eine Messung der Server-Tickrate gegen die Wanduhr.
 *
 * Die Fortschreibung bleibt: Sie ist geprüft (7 Unit-Tests), konservativ und
 * bewegt den Tick in jedem Fall auf die Wahrheit zu. Als „die Behebung" darf sie
 * aber nicht gelesen werden.
 *
 * @param {{snapshotTick?:number, empfangenAt?:number, jetzt?:number, maxVorsprungTicks?:number}} [optionen]
 * @returns {number} Tick für die Eingabe (0, wenn kein Snapshot vorliegt)
 */
export function referenzTick({
  snapshotTick,
  empfangenAt,
  jetzt = Date.now(),
  maxVorsprungTicks = 120,
} = {}) {
  if (!Number.isFinite(snapshotTick)) return 0;
  // Negativ kann die Spanne nicht werden; eine verstellte Uhr soll die Eingabe
  // nicht in die Vergangenheit ziehen.
  const vergangen = Number.isFinite(empfangenAt) && empfangenAt > 0
    ? Math.max(0, jetzt - empfangenAt)
    : 0;
  // Der Deckel ist eine Notbremse, keine Regel: Er greift erst nach ~2 s ohne
  // Snapshot (Verbindungsabbruch), wo ein weit vorausgerechneter Tick ohnehin
  // unglaubwürdig wäre.
  //
  // Gerechnet wird ganzzahlig (`ms * 60 / 1000`) und nicht als Division durch
  // `TICK_MS`: `2000 / (1000/60)` ergibt 119,99998 und damit 119 statt 120 Ticks.
  // An der Fenstergrenze entscheidet genau diese eine Tick-Nummer darüber, ob
  // der Server den Schuss annimmt.
  const vorsprung = Math.min(maxVorsprungTicks, Math.floor((vergangen * TICKS_PER_SECOND) / 1000));
  return snapshotTick + vorsprung;
}

/**
 * Ist die aktive Figur eine EIGENE?
 *
 * Im Modus der Matcharten gehören einem Menschen MEHRERE Figuren (ein ganzes
 * Team, 3–5 Einheiten). Ein Vergleich gegen eine einzelne Kennung — wie vorher
 * (`latest.activePlayerId === this.#entityId`) — meldete für alle weiteren
 * eigenen Einheiten „nicht am Zug": kein Feuerbefehl, kein Waffenzugriff.
 *
 * Bewusst eine reine Funktion: Sie ist damit ohne Socket prüfbar.
 */
export function istEigenerZug(activePlayerId, eigeneEntityIds) {
  if (activePlayerId === null || activePlayerId === undefined) return false;
  if (!eigeneEntityIds) return false;
  if (eigeneEntityIds instanceof Set) return eigeneEntityIds.has(activePlayerId);
  if (Array.isArray(eigeneEntityIds)) return eigeneEntityIds.includes(activePlayerId);
  return false;
}

export class NetworkClient {
  #url;
  #socket = null;
  #state = CONNECTION_STATE.IDLE;
  #token = null;
  #lobbyId = null;
  #entityId = null;
  /** Alle eigenen Figuren. Leer, bis der Server sie meldet. */
  #entityIds = new Set();
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
  /** Empfangszeitpunkt des jüngsten Snapshots (für `referenzTick`). */
  #letzterSnapshotAt = 0;
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

  /**
   * Übernimmt die gemeldeten eigenen Figuren.
   *
   * Additiv statt ersetzend: Eine spätere Nachricht kann eine Teilmenge nennen
   * (z. B. nur die gerade beigetretene Figur), und ein Verwerfen würde bereits
   * bekannte eigene Einheiten wieder zu fremden machen — der Client hielte sich
   * mitten im Match für nicht am Zug.
   */
  #merkeEigeneFiguren(ids) {
    for (const id of ids ?? []) {
      if (id !== null && id !== undefined) this.#entityIds.add(id);
    }
    // `entityId` bleibt die erste gemeldete Figur.
    if (this.#entityId === null && this.#entityIds.size > 0) {
      this.#entityId = [...this.#entityIds][0];
    }
  }

  get state() { return this.#state; }
  get token() { return this.#token; }
  get entityId() { return this.#entityId; }
  /**
   * Alle eigenen Figuren.
   *
   * Im Modus der Matcharten sind das mehrere (ein Team). `entityId` bleibt die
   * ERSTE Figur — für Anzeigen, die nur eine nennen können.
   */
  get entityIds() { return [...this.#entityIds]; }
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
    return istEigenerZug(this.latestSnapshot?.activePlayerId ?? null, this.#entityIds);
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
      // Zeitpunkt merken: Der Tick einer Eingabe wird daraus fortgeschrieben.
      this.#letzterSnapshotAt = Date.now();
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
          /*
           * ALLE eigenen Figuren übernehmen.
           *
           * Ohne diesen Schritt bliebe `#entityIds` leer und `isMyTurn` immer
           * falsch: Der Client hielte sich dauerhaft für einen Zuschauer. Der
           * Rückfall auf die einzelne `entityId` hält einen älteren Server
           * bedienbar.
           */
          this.#merkeEigeneFiguren(message.entityIds ?? (message.entityId ? [message.entityId] : []));
          if (message.seed !== undefined) this.#seed = message.seed;
          this.#state = CONNECTION_STATE.CONNECTED;
          this.#emit('joined', {
            token: this.#token,
            entityId: this.#entityId,
            entityIds: this.entityIds,
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
        // Die Platzmitteilung nach einem Beitritt nennt alle eigenen Figuren.
        if (Array.isArray(message.entityIds)) this.#merkeEigeneFiguren(message.entityIds);
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
      // Nicht der rohe Snapshot-Tick, sondern der fortgeschriebene: siehe
      // `referenzTick` oben. Ein zu alter Tick lässt der Server als
      // „ausserhalb des Lag-Kompensationsfensters" fallen, und dann verpufft ein
      // gueltiger Schuss.
      tick: referenzTick({
        snapshotTick: snapshot?.tick,
        empfangenAt: this.#letzterSnapshotAt,
        jetzt: Date.now(),
      }),
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
