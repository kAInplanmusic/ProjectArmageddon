/**
 * Autoritativer Spielserver (HTTP + WebSocket).
 *
 * Der Server besitzt die Simulation: Clients senden nur Wünsche, der Server
 * validiert sie und verteilt kompakte Binär-Snapshots. Jede Lobby läuft mit
 * fester Zeitschrittweite; die Tick-Schleife ist unabhängig von der
 * Snapshot-Rate, damit Simulation und Netzwerk entkoppelt bleiben.
 *
 * @module gameServer
 */
import { createServer as createHttpServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { WebSocketServer } from 'ws';
import { MatchController } from '../engine/match.js';
import { LobbyManager, LOBBY_STATUS } from './lobby.js';
import { createLogger } from './logger.js';
import { SnapshotHistory } from './lagCompensation.js';
import { BotController } from './bot.js';
import {
  CONTROL,
  MESSAGE_TYPE,
  MAGIC,
  PROTOCOL_VERSION,
  controlMessage,
  parseControlMessage,
  encodeSnapshot,
  toDeltaBase,
} from '../shared/protocol.js';
import { validateCommand } from '../shared/validation.js';
import { MatchSeedManager } from '../shared/seed.js';
import { ReplayRecorder } from '../engine/replay.js';
import { PersistenceStore, serializeLobby, restoreLobby } from './persistence.js';

export const SIMULATION_HZ = 60;
export const SNAPSHOT_HZ = 20;
const TICK_MS = 1000 / SIMULATION_HZ;
const SNAPSHOT_INTERVAL_MS = 1000 / SNAPSHOT_HZ;
/**
 * Vermerk für unbegrenzte Munition. Muss mit `getState()` im MatchController
 * übereinstimmen — der Client prüft auf genau diesen Text.
 */
const UNLIMITED_AMMO = 'unbegrenzt';
/** Nach so vielen Snapshots geht wieder ein Vollsnapshot raus (Resync). */
const FULL_SNAPSHOT_INTERVAL = SNAPSHOT_HZ * 2;

class LobbySession {
  /** Wurde das Match-Ende schon gemeldet? Siehe #finish. */
  #finished = false;

  /**
   * @param {object} lobby
   * @param {object} [options]
   * @param {function(string):void} [options.onEmpty]
   * @param {object} [options.replayEntries] - aufgezeichnete Eingaben (Restore)
   * @param {number} [options.replayTotalTicks] - Tickzahl beim Speichern
   * @param {object} [options.metrics] - Betriebszähler des Servers (optional)
   * @param {object} [options.logger] - strukturierter Logger (optional)
   */
  constructor(lobby, {
    onEmpty, replayEntries = null, replayTotalTicks = 0, metrics = null, logger = null,
  } = {}) {
    this.lobby = lobby;
    // Betriebszähler gehören dem Server, nicht der Sitzung. Die Sitzung erhält
    // nur eine Referenz, damit sie Ereignisse mitzählen kann, ohne sie zu
    // besitzen. Ohne Referenz unterbleibt die Zählung stillschweigend.
    this.metrics = metrics;
    /**
     * Logger mit der Lobby-ID als Feld — dadurch enthalten alle Zeilen dieser
     * Sitzung die Zuordnung, ohne sie bei jedem Aufruf zu wiederholen.
     */
    this.logger = logger ? logger.child({ lobbyId: lobby.id }) : null;
    this.match = new MatchController({
      seed: lobby.seed,
      teams: lobby.teams,
      playersPerTeam: lobby.playersPerTeam,
      preset: lobby.preset,
      orientation: lobby.orientation ?? 'landscape',
    });
    this.match.start();

    /** Aufzeichnung für Persistenz und Replay. */
    this.recorder = new ReplayRecorder({
      seed: this.match.seedManager.baseSeed,
      teams: lobby.teams,
      playersPerTeam: lobby.playersPerTeam,
      preset: lobby.preset,
      maxRounds: this.match.maxRounds,
      turnDurationMs: this.match.turnDurationMs,
    });

    // Wiederherstellung: Eingaben bis zum gespeicherten Tick erneut anwenden.
    // Die Simulation ist deterministisch, deshalb entsteht exakt derselbe Zustand.
    if (Array.isArray(replayEntries) && replayEntries.length > 0) {
      this.#restoreFromReplay(replayEntries, replayTotalTicks);
    }

    this.history = new SnapshotHistory();
    this.bot = new BotController({
      rng: new MatchSeedManager(this.match.seedManager.baseSeed).getSubRng('EFFECTS'),
    });
    this.clients = new Map();      // token -> WebSocket
    this.byEntity = new Map();     // entityId -> token
    this.onEmpty = onEmpty;
    this.accumulator = 0;
    this.snapshotAccumulator = 0;
    /** Letzter an jeden Client gesendeter Zustand (Basis für Delta-Encoding). */
    this.previousByToken = new Map();
    this.snapshotCounter = 0;
    /** Signatur der zuletzt gesendeten Waffenbestände (null = noch nie). */
    this.loadoutSignature = null;
    this.lastTickAt = Date.now();
    this.timer = null;
    this.emptySince = null;

    this.#assignEntityIds();
  }

  /** Spielt gespeicherte Eingaben deterministisch nach. */
  #restoreFromReplay(entries, totalTicks) {
    const byTick = new Map();
    for (const entry of entries) {
      if (!byTick.has(entry.tick)) byTick.set(entry.tick, []);
      byTick.get(entry.tick).push(entry);
    }

    const limit = Math.max(totalTicks, ...entries.map(entry => entry.tick)) + 1;
    let guard = 0;
    while (this.match.status === 'playing' && this.match.world.tickCount < limit && guard < limit + 10) {
      const tick = this.match.world.tickCount;
      for (const entry of byTick.get(tick) ?? []) {
        this.match.fire(entry.playerId, entry.angle, entry.power, entry.weaponId ?? null);
      }
      this.match.step();
      this.match.consumeEvents();
      guard += 1;
    }
    for (const entry of entries) this.recorder.recordInput(entry);
    this.recorder.finalize(this.match.world.tickCount);
  }

  /** Momentaufnahme für die Persistenz. */
  toPersisted() {
    this.recorder.finalize(this.match.world.tickCount);
    return { replay: this.recorder.toJSON(), tick: this.match.world.tickCount };
  }

  /** Ordnet Lobby-Plätze den tatsächlichen Spieler-Entities zu. */
  #assignEntityIds() {
    const players = this.match.players;
    this.lobby.seats.forEach((seat, index) => {
      seat.entityId = players[index]?.entityId ?? null;
      if (seat.entityId !== null) this.byEntity.set(seat.entityId, seat.token);
    });
  }

  /**
   * Bindet neu hinzugekommene Plätze an ihre Spieler-Entity.
   * Muss bei jedem Beitritt laufen: die Entity-IDs entstehen beim Start des
   * Matchs, spätere Plätze haben anfangs keine Zuordnung.
   */
  syncSeats() {
    this.#assignEntityIds();
    return this;
  }

  start() {
    this.timer = setInterval(() => this.tick(), TICK_MS);
    if (typeof this.timer.unref === 'function') this.timer.unref();
    return this;
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Ein Simulationsschritt samt Bot-Zügen. */
  tick() {
    const now = Date.now();
    const elapsed = Math.min(250, now - this.lastTickAt);
    this.lastTickAt = now;
    this.accumulator += elapsed;

    while (this.accumulator >= TICK_MS) {
      this.accumulator -= TICK_MS;
      if (this.match.status !== 'playing') break;
      this.stepSimulation(1);
    }

    for (const event of this.match.consumeEvents()) {
      this.#broadcastControl(event.type, { round: this.match.round, ...event.payload });
    }

    // Netzwerk ist von der Simulation entkoppelt: Snapshots gehen mit fester
    // Rate raus, unabhängig davon, wie viele Ticks pro Aufruf liefen.
    this.snapshotAccumulator += elapsed;
    if (this.snapshotAccumulator >= SNAPSHOT_INTERVAL_MS) {
      this.snapshotAccumulator = 0;
      this.broadcastSnapshot();
    }

    this.match.status === 'gameover' && this.#finish();
  }

  /**
   * Führt Simulationsschritte ohne Zeitbezug aus. Wird von der Tick-Schleife
   * und von Tests/Replays genutzt, damit dieselbe Logik deterministisch
   * vorgespult werden kann.
   */
  stepSimulation(ticks = 1) {
    for (let i = 0; i < ticks; i++) {
      if (this.match.status !== 'playing') break;
      this.#runBotTurn();
      this.match.step();
      this.history.push(this.match.world.tickCount, this.match.getState());
    }
    if (this.match.status === 'gameover') this.#finish();
    return this.match.getState();
  }

  #runBotTurn() {
    const match = this.match;
    if (match.status !== 'playing') return;
    const activeId = match.activePlayerId;
    if (activeId === null) return;

    // Nur Entity-IDs ohne verbundenen Client werden vom Bot gesteuert.
    const token = this.byEntity.get(activeId);
    const seat = token ? this.lobby.seats.find(entry => entry.token === token) : null;
    if (seat && seat.connected) return;

    const shot = this.bot.chooseShot(match, activeId);
    if (!shot) return;
    const result = match.fire(activeId, shot.angle, shot.power);
    // Bot-Züge ebenfalls aufzeichnen: sonst weicht ein Replay vom Match ab.
    if (result.ok) {
      this.recorder.recordInput({
        tick: match.world.tickCount,
        playerId: activeId,
        angle: shot.angle,
        power: shot.power,
      });
    }
    result.ok === false && this.match.endTurn();
  }

  #finish() {
    /*
     * Nur EINMAL melden.
     *
     * Fund (belegt): `tick()` und `stepSimulation()` prüfen beide auf
     * `status === 'gameover'` und rufen beide `#finish()` auf. Da `tick()` den
     * Simulationsschritt aufruft, trafen im selben Durchgang beide zu — das
     * Match-Ende wurde also doppelt gemeldet. Im Log stand jede Zeile zweimal
     * (`match_over` mit derselben Lobby-ID), `match_over` ging zweimal an die
     * Clients, `onEmpty` lief zweimal und der Lobby-Status wurde zweimal gesetzt.
     *
     * Aufgefallen ist es erst durch das strukturierte Log: Vorher war es eine
     * Freitextzeile unter vielen, und doppelte Zeilen sehen dort nach Rauschen
     * aus. Genau dafür sind auswertbare Logs da.
     */
    if (this.#finished) return;
    this.#finished = true;
    this.stop();
    this.lobby && (this.lobby.status = LOBBY_STATUS.FINISHED);
    this.logger?.info('match_over', 'Match entschieden', {
      winnerTeamId: this.match.winnerTeamId,
      rounds: this.match.round,
      ticks: this.match.world.tickCount,
      reason: this.match.winnerTeamId === null ? 'unentschieden' : 'ausscheidung',
    });
    this.#broadcastControl('match_over', {
      winnerTeamId: this.match.winnerTeamId,
      rounds: this.match.round,
    });
    this.onEmpty?.(this.lobby.id);
  }

  /** Fügt einen Client hinzu und schickt ihm den Startzustand. */
  attach(token, socket) {
    this.syncSeats();
    this.clients.set(token, socket);
    // Ein neu verbundener Client braucht die Bestände sofort, nicht erst beim
    // nächsten Wechsel.
    this.syncLoadouts(true);
    socket.send(controlMessage(CONTROL.LOBBY_STATE, {
      lobby: this.lobby.id,
      status: this.lobby.status,
      seed: this.match.seedManager.baseSeed,
      preset: this.lobby.preset,
      orientation: this.lobby.orientation ?? 'landscape',
      entityId: this.lobby.seats.find(seat => seat.token === token)?.entityId ?? null,
      snapshot: this.match.getState(),
    }));
  }

  detach(token) {
    this.clients.delete(token);
    if (this.clients.size === 0) this.emptySince = Date.now();
  }

  /** Verarbeitet einen Feuerbefehl mit vollständiger Validierung. */
  /**
   * Nimmt ein Spielerkommando entgegen und zählt das Ergebnis.
   *
   * Eigene Hülle, damit ALLE Ablehnungspfade gezählt werden. Zuvor stand der
   * Zähler nur am Ende, wodurch frühe Ablehnungen (falscher Platz, ungültiger
   * Winkel, Tick außerhalb des Fensters) ungezählt blieben — der Zähler hätte
   * ein falsches Bild ergeben.
   */
  handleInput(token, message) {
    const result = this.#handleInput(token, message);
    if (this.metrics) {
      if (result.ok) this.metrics.commandsAccepted += 1;
      else this.metrics.commandsRejected += 1;
    }
    return result;
  }

  #handleInput(token, message) {
    const seat = this.lobby.seats.find(entry => entry.token === token);
    if (!seat || seat.entityId === null) {
      return { ok: false, errors: ['Kein Spielerplatz'] };
    }

    const currentTick = this.match.world.tickCount;
    const history = this.history.get(message.tick ?? currentTick);
    const command = validateCommand(
      {
        playerId: seat.entityId,
        angle: message.angle,
        power: message.power,
        weaponId: message.weaponId ?? null,
        tick: currentTick,
        type: 'fire',
      },
      {
        currentTick,
        activePlayerId: this.match.activePlayerId,
        knownPlayerIds: this.match.players.map(player => player.entityId),
      }
    );

    if (!command.valid) return { ok: false, errors: command.errors };
    if (message.tick !== undefined && !this.history.isWithinWindow(message.tick, currentTick)) {
      return { ok: false, errors: ['Tick liegt ausserhalb des Lag-Kompensationsfensters'] };
    }

    const result = this.match.fire(seat.entityId, command.input.angle, command.input.power, command.input.weaponId);
    if (result.ok) {
      this.recorder.recordInput({
        tick: currentTick,
        playerId: seat.entityId,
        angle: command.input.angle,
        power: command.input.power,
        weaponId: command.input.weaponId,
      });
    }
    return { ok: result.ok, errors: result.errors ?? [], interpolatedFrom: history?.tick ?? null };
  }

  handleWeaponSelect(token, weaponId) {
    const seat = this.lobby.seats.find(entry => entry.token === token);
    if (!seat || seat.entityId === null) return { ok: false, errors: ['Kein Spielerplatz'] };
    const ok = this.match.inventory.selectWeapon(seat.entityId, weaponId);
    return { ok, errors: ok ? [] : ['Waffe nicht verfügbar'] };
  }

  /**
   * Bestände je Spieler: Waffen, Munition, aktive Waffe.
   *
   * Der binäre Snapshot führt nur Position, Gesundheit und Zustände — Bestände
   * sind je Spieler unterschiedlich lang und würden das feste Delta-Format
   * sprengen. Sie gehen deshalb als eigene Nachricht raus, und nur wenn sich
   * etwas geändert hat: Ein Schuss kostet Munition, eine Kiste bringt eine Waffe.
   */
  #loadoutTable() {
    const table = {};
    for (const seat of this.lobby.seats) {
      if (seat.entityId === null) continue;
      const entry = this.match.inventory.get(seat.entityId);
      if (!entry) continue;
      const ammo = {};
      for (const weaponId of entry.weapons) {
        const amount = this.match.inventory.getAmmo(seat.entityId, weaponId);
        // Gleiche Darstellung wie im Match-Zustand: unbegrenzte Waffen tragen
        // den Vermerk, nicht eine Zahl. Sonst zeigte der Client online eine
        // Munition an, die es nicht gibt.
        ammo[weaponId] = Number.isFinite(amount) ? amount : UNLIMITED_AMMO;
      }
      // Nachladezeiten gehören mit in die Bestandsnachricht: sie sind je Waffe
      // verschieden und ändern sich pro Zug, also nichts für den binären
      // Snapshot (variable Länge).
      const cooldowns = {};
      for (const weaponId of entry.weapons) {
        const rest = this.match.cooldownFor(seat.entityId, weaponId);
        if (rest > 0) cooldowns[weaponId] = rest;
      }
      table[seat.entityId] = {
        inventory: [...entry.weapons],
        ammo,
        cooldowns,
        activeWeaponId: entry.activeWeaponId ?? null,
      };
    }
    return table;
  }

  /**
   * Sendet die Bestände, sofern sie sich seit dem letzten Mal geändert haben.
   * Wird bei jedem Snapshot geprüft — damit sind Munitionsverbrauch und
   * Kistenfunde ohne Instrumentierung jeder einzelnen Stelle abgedeckt.
   */
  syncLoadouts(force = false) {
    const table = this.#loadoutTable();
    const signature = JSON.stringify(table);
    if (!force && signature === this.loadoutSignature) return false;
    this.loadoutSignature = signature;
    this.#broadcastControl(CONTROL.LOADOUTS, { loadouts: table });
    return true;
  }

  broadcastSnapshot() {
    // Bestände zuerst prüfen: ändert sich etwas, geht die Nachricht raus, bevor
    // die Positionen folgen — so zeigt die Anzeige den passenden Munitionsstand.
    this.syncLoadouts();

    this.snapshotCounter += 1;
    const rohZustand = this.match.getState();
    // Zustände liegen getrennt nach Spieler-ID vor; das Drahtformat führt sie
    // je Spieler. Deshalb hier zusammenführen — sonst müsste der Client zwei
    // getrennte Strukturen synchron halten.
    const statuses = rohZustand.statuses ?? {};
    const state = {
      ...rohZustand,
      entities: rohZustand.entities.map(entity => ({
        ...entity,
        shield: statuses[entity.entityId]?.shield ?? 0,
        frozenTurns: statuses[entity.entityId]?.frozenTurns ?? 0,
      })),
    };
    const turnRemainingMs = Math.max(0, state.turnDurationMs - state.turnElapsedMs);

    // Alle ~2 s (bei 20 Hz) ein Vollsnapshot, damit ein Client nach einem
    // verlorenen Frame nicht dauerhaft mit falschen Werten weiterrechnet.
    const forceFull = this.snapshotCounter % FULL_SNAPSHOT_INTERVAL === 0;

    const sent = [];
    for (const [token, socket] of this.clients.entries()) {
      if (socket.readyState !== 1) continue;
      const previous = forceFull ? null : (this.previousByToken.get(token) ?? null);
      const buffer = encodeSnapshot(state, { turnRemainingMs, previous });
      socket.send(buffer);
      if (this.metrics) this.metrics.snapshotsSent += 1;
      sent.push(buffer);
    }

    // Zustand für den nächsten Vergleich fortschreiben. Der Helfer erzeugt
    // exakt die Rohform, die der Encoder erwartet.
    const nextPrevious = toDeltaBase(state);
    for (const token of this.clients.keys()) this.previousByToken.set(token, nextPrevious);

    return sent[0] ?? null;
  }

  #broadcastControl(type, payload) {
    const message = controlMessage(type, payload);
    for (const socket of this.clients.values()) {
      if (socket.readyState === 1) socket.send(message);
    }
  }
}

export class GameServer {
  #httpServer;
  #wsServer;
  #sessions = new Map();
  #lobbies;
  #persistenceTimer = null;

  constructor({
    lobbyManager = new LobbyManager(),
    serveStatic = null,
    persistence = null,
    persistenceIntervalMs = 10_000,
    logger = null,
  } = {}) {
    this.#lobbies = lobbyManager;
    this.serveStatic = serveStatic ?? createDistHandler();
    /**
     * Injizierbarer Logger.
     *
     * Standard ist der strukturierte Logger (eine JSON-Zeile je Ereignis, siehe
     * `logger.js`). Tests übergeben einen Sammel-Logger; wer Freitext mag, setzt
     * LOG_FORMAT=pretty.
     */
    this.logger = logger ?? createLogger({
      level: process.env.LOG_LEVEL ?? 'info',
      format: process.env.LOG_FORMAT === 'pretty' ? 'pretty' : 'json',
    });
    /**
     * Betriebszähler für die Zustandsabfrage.
     *
     * Bewusst schlank: nur Zähler, keine Zeitreihen. Zweck ist, im Betrieb
     * schnell zu sehen, ob Verbindungen abbrechen oder Kommandos abgelehnt
     * werden — ohne dafür Logs durchsuchen zu müssen.
     */
    this.metrics = {
      startedAt: Date.now(),
      connections: 0,
      disconnections: 0,
      snapshotsSent: 0,
      commandsAccepted: 0,
      commandsRejected: 0,
      lobbiesCreated: 0,
      errors: 0,
    };
    /** Optionale Persistenz: null deaktiviert das Speichern vollständig. */
    this.persistence = persistence;
    this.persistenceIntervalMs = persistenceIntervalMs;
    this.#persistenceTimer = null;

    this.#httpServer = createHttpServer((request, response) => this.#handleHttp(request, response));
    this.#wsServer = new WebSocketServer({ server: this.#httpServer, path: '/ws' });
    this.#wsServer.on('connection', socket => {
      this.metrics.connections += 1;
      // debug: im Betrieb ist jeder Verbindungsaufbau Rauschen, bei der Fehlersuche
      // ist die Reihenfolge von Verbinden und Trennen aber entscheidend.
      this.logger.debug('client_connected', 'WebSocket-Verbindung geöffnet', {
        connections: this.metrics.connections,
      });
      socket.once('close', () => {
        this.metrics.disconnections += 1;
        this.logger.debug('client_disconnected', 'WebSocket-Verbindung geschlossen', {
          disconnections: this.metrics.disconnections,
        });
      });
      this.#handleConnection(socket);
    });
  }

  /**
   * Momentaufnahme ALLER Lobbys.
   *
   * Bewusst über den Lobby-Manager und nicht über die Sitzungen: Eine frisch
   * angelegte Lobby hat noch keine Sitzung (die entsteht erst beim Beitritt).
   * Würde nur über die Sitzungen gelaufen, verschwände genau diese Lobby bei
   * einem Neustart — obwohl sie in der Lobby-Liste angezeigt wird.
   */
  snapshotState() {
    const lobbies = [];
    for (const lobby of this.#lobbies.all()) {
      /*
       * Entschiedene Lobbys werden NICHT gespeichert.
       *
       * Fund (belegt): Gespeichert wurde jede Lobby, auch die längst
       * entschiedene. Beim nächsten Start wurden sie alle wiederhergestellt —
       * jede mit einem MatchController und einem Replay-Kern, also mit
       * Geländegenerierung und erneutem Anwenden der Eingaben. In der
       * Entwicklungsdatei standen so **258 Lobbys, alle mit Status „finished"**,
       * und jeder Serverstart baute 258 fertige Matches neu auf, nur um sie
       * sofort wieder zu beenden.
       *
       * Ein entschiedenes Match hat nichts fortzusetzen. Es wegzulassen hält die
       * Datei klein und den Start schnell — und es räumt die Altlast beim
       * nächsten Speichern von selbst auf, weil nur noch die aktuellen Lobbys
       * geschrieben werden.
       */
      if (lobby.status === LOBBY_STATUS.FINISHED) continue;
      lobbies.push(serializeLobby(lobby, this.#sessions.get(lobby.id) ?? null));
    }
    return { lobbies };
  }

  /** Speichert den aktuellen Zustand (atomar). */
  saveState() {
    if (!this.persistence) return false;
    return this.persistence.save(this.snapshotState());
  }

  /**
   * Stellt gespeicherte Lobbys wieder her.
   *
   * Die Matches werden durch erneutes Anwenden der aufgezeichneten Eingaben
   * rekonstruiert. Clients müssen sich mit ihrem Token neu verbinden; sie
   * landen dann wieder auf demselben Platz und im selben Matchzustand.
   *
   * @returns {{restored: number, skipped: number}}
   */
  restoreState() {
    if (!this.persistence) return { restored: 0, skipped: 0 };
    const saved = this.persistence.load();
    if (!saved?.lobbies?.length) return { restored: 0, skipped: 0 };

    let restored = 0;
    let skipped = 0;
    let veraltetFinished = 0;
    for (const entry of saved.lobbies) {
      /*
       * Alte Dateien können entschiedene Lobbys enthalten — vor der Korrektur in
       * `snapshotState` wurden sie mitgespeichert. Sie werden übersprungen statt
       * wiederhergestellt: Ein entschiedenes Match hat keinen fortzusetzenden
       * Zustand, und das Wiederherstellen kostet Geländegenerierung und das
       * erneute Anwenden aller Eingaben.
       */
      if (entry.status === LOBBY_STATUS.FINISHED) {
        veraltetFinished += 1;
        continue;
      }
      try {
        const { lobby } = restoreLobby(entry, {
          lobbyManager: this.#lobbies,
          createSession: (target, options) => {
            const session = new LobbySession(target, {
              onEmpty: id => this.#sessions.delete(id),
              replayEntries: options.replayEntries,
              replayTotalTicks: options.replayTotalTicks,
              metrics: this.metrics,
              logger: this.logger,
            }).start();
            this.#sessions.set(target.id, session);
            return session;
          },
        });
        if (lobby) restored += 1;
      } catch (error) {
        skipped += 1;
        this.logger.warn('lobby_restore_skipped', 'Lobby konnte nicht wiederhergestellt werden', {
          lobbyId: entry.id, error,
        });
      }
    }
    if (veraltetFinished > 0) {
      this.logger.info('lobby_restore_skipped_finished', 'Entschiedene Lobbys aus der Sicherung übersprungen', {
        count: veraltetFinished,
        hinweis: 'Sie werden beim nächsten Speichern aus der Datei entfernt',
      });
    }
    return { restored, skipped, skippedFinished: veraltetFinished };
  }

  /** Startet das periodische Speichern. */
  startPersistence() {
    if (!this.persistence || this.#persistenceTimer) return this;
    this.#persistenceTimer = setInterval(() => this.saveState(), this.persistenceIntervalMs);
    if (typeof this.#persistenceTimer.unref === 'function') this.#persistenceTimer.unref();
    return this;
  }

  stopPersistence() {
    if (this.#persistenceTimer) clearInterval(this.#persistenceTimer);
    this.#persistenceTimer = null;
  }

  get lobbyManager() {
    return this.#lobbies;
  }

  get sessionCount() {
    return this.#sessions.size;
  }

  getSession(lobbyId) {
    return this.#sessions.get(lobbyId) ?? null;
  }

  async #handleHttp(request, response) {
    const url = new URL(request.url, 'http://localhost');

    // Der Client kann von einem anderen Origin laufen (Dev-Server, CDN).
    // Ohne diese Header blockiert der Browser die Lobby-API.
    response.setHeader('Access-Control-Allow-Origin', request.headers.origin ?? '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'content-type');
    response.setHeader('Vary', 'Origin');

    if (request.method === 'OPTIONS') {
      response.writeHead(204);
      return response.end();
    }

    if (request.method === 'GET' && url.pathname === '/healthz') {
      const uptimeMs = Date.now() - this.metrics.startedAt;
      // Sitzungen sind nur dann ein Problem, wenn sie ohne offene Lobby
      // weiterlaufen — das deutet auf einen Aufräumfehler hin.
      const verwaisteSitzungen = [...this.#sessions.keys()]
        .filter(lobbyId => !this.#lobbies.get(lobbyId)).length;

      return this.#json(response, 200, {
        status: 'ok',
        lobbies: this.#lobbies.size,
        sessions: this.#sessions.size,
        protocol: PROTOCOL_VERSION,
        uptimeMs,
        metrics: {
          ...this.metrics,
          uptimeMs,
        },
        healthy: verwaisteSitzungen === 0,
        orphanedSessions: verwaisteSitzungen,
      });
    }

    if (request.method === 'GET' && url.pathname === '/api/lobby') {
      return this.#json(response, 200, { lobbies: this.#lobbies.list() });
    }

    const lobbyMatch = url.pathname.match(/^\/api\/lobby\/([A-Za-z0-9-]+)$/);
    if (request.method === 'GET' && lobbyMatch) {
      const lobby = this.#lobbies.describe(lobbyMatch[1]);
      if (!lobby) return this.#json(response, 404, { error: 'Lobby nicht gefunden' });
      return this.#json(response, 200, { lobby });
    }

    if (request.method === 'POST' && url.pathname === '/api/lobby/create') {
      const body = await this.#readBody(request);
      try {
        this.metrics.lobbiesCreated += 1;
        const created = this.#lobbies.create({
          teams: Number(body.teams ?? 2),
          playersPerTeam: Number(body.playersPerTeam ?? 2),
          preset: body.preset ?? 'hills',
          orientation: body.orientation ?? 'landscape',
          seed: body.seed === undefined || body.seed === '' ? undefined : Number(body.seed),
          hostName: body.name ?? 'Host',
        });
        this.logger.info('lobby_created', 'Lobby angelegt', {
          lobbyId: created.lobby.id,
          teams: created.lobby.teams,
          playersPerTeam: created.lobby.playersPerTeam,
          preset: created.lobby.preset,
          orientation: created.lobby.orientation,
          seed: created.lobby.seed,
        });
        return this.#json(response, 201, created);
      } catch (error) {
        this.logger.warn('lobby_create_failed', 'Lobby konnte nicht angelegt werden', {
          error,
          teams: body.teams,
          playersPerTeam: body.playersPerTeam,
        });
        return this.#json(response, 400, { error: error.message });
      }
    }

    if (this.serveStatic) {
      const handled = this.serveStatic(request, response, url);
      if (handled) return;
    }

    this.#json(response, 404, { error: 'Nicht gefunden' });
  }

  #readBody(request) {
    return new Promise(resolve => {
      let raw = '';
      request.on('data', chunk => {
        raw += chunk;
        if (raw.length > 8192) raw = raw.slice(0, 8192);
      });
      request.on('end', () => {
        try {
          resolve(raw ? JSON.parse(raw) : {});
        } catch {
          resolve({});
        }
      });
      request.on('error', () => resolve({}));
    });
  }

  #json(response, status, payload) {
    const body = JSON.stringify(payload);
    response.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'content-length': Buffer.byteLength(body),
    });
    response.end(body);
  }

  #handleConnection(socket) {
    let context = { lobbyId: null, token: null };

    socket.on('message', (raw, isBinary) => {
      if (isBinary) return; // Client -> Server ist ausschliesslich JSON-Kontrolle.

      const message = parseControlMessage(raw);
      if (!message) {
        socket.send(controlMessage(CONTROL.ERROR, { error: 'Ungültige Nachricht' }));
        return;
      }

      try {
        switch (message.t) {
          case CONTROL.HELLO:
            socket.send(controlMessage(CONTROL.WELCOME, {
              protocol: PROTOCOL_VERSION,
              message: 'Verbunden',
            }));
            break;

          case CONTROL.JOIN_LOBBY: {
            const lobbyId = message.lobbyId;
            const lobby = this.#lobbies.get(lobbyId);
            if (!lobby) throw new Error('Lobby nicht gefunden');
            this.logger.info('lobby_join', 'Spieler tritt einer Lobby bei', {
              lobbyId,
              seats: lobby.seats.length,
              capacity: lobby.capacity,
              // Nur DASS ein Token mitkam, nicht der Token selbst.
              hasToken: Boolean(message.token),
            });
            const seat = this.#lobbies.join(lobbyId, { name: message.name ?? 'Spieler', token: message.token ?? null });
            context = { lobbyId, token: seat.token };
            let session = this.#sessions.get(lobbyId);
            if (!session) {
              session = new LobbySession(lobby, {
                onEmpty: id => this.#sessions.delete(id),
                metrics: this.metrics,
                logger: this.logger,
              }).start();
              this.#sessions.set(lobbyId, session);
            }
            session.attach(seat.token, socket);
            // Die Live-Sitzung hat dem Platz gerade eine Entity-ID zugewiesen.
            // Der Rückgabewert von join() ist eine Kopie und daher veraltet.
            const liveSeat = lobby.seats.find(entry => entry.token === seat.token);
            socket.send(controlMessage(CONTROL.WELCOME, {
              protocol: PROTOCOL_VERSION,
              lobbyId,
              seed: session.match.seedManager.baseSeed,
              preset: lobby.preset,
              token: seat.token,
              seatIndex: seat.seatIndex,
              entityId: liveSeat?.entityId ?? seat.entityId,
              resumed: seat.resumed,
            }));
            break;
          }

          case CONTROL.START_MATCH: {
            const session = this.#sessions.get(context.lobbyId);
            if (!session) throw new Error('Keine aktive Sitzung');
            this.#lobbies.markRunning(context.lobbyId);
            session.broadcastSnapshot();
            break;
          }

          case CONTROL.INPUT: {
            const session = this.#sessions.get(context.lobbyId);
            if (!session) throw new Error('Keine aktive Sitzung');
            const result = session.handleInput(context.token, message);
            if (!result.ok) {
              socket.send(controlMessage(CONTROL.ERROR, { errors: result.errors }));
            }
            break;
          }

          case CONTROL.SELECT_WEAPON: {
            const session = this.#sessions.get(context.lobbyId);
            if (!session) throw new Error('Keine aktive Sitzung');
            const result = session.handleWeaponSelect(context.token, message.weaponId);
            if (!result.ok) socket.send(controlMessage(CONTROL.ERROR, { errors: result.errors }));
            break;
          }

          case CONTROL.PING:
            socket.send(Buffer.from([MAGIC[0], MAGIC[1], PROTOCOL_VERSION, MESSAGE_TYPE.PONG]));
            /*
             * Ist das Match längst entschieden, dem Client das erneut mitteilen.
             *
             * Fund (belegt): Nach dem Ende ruft die Sitzung `stop()` auf und
             * sendet keine Snapshots mehr; die einzige Nachricht über das Ende
             * ist ein einmaliges `match_over`. Verpasst ein Client sie — etwa
             * weil sein Socket im Moment der Aussendung nicht offen war
             * (`broadcastSnapshot` überspringt solche Clients still) —, sitzt er
             * dauerhaft auf einem laufenden Spiel fest: Der Zustand steht auf
             * „playing", es kommt nichts mehr, und die Anzeige behauptet
             * weiter, es laufe.
             *
             * Der Client fragt ohnehin alle zwei Sekunden per PING nach. Diese
             * Antwort ist der natürliche Ort für die Wiederholung: kein neuer
             * Nachrichtentyp, kein neues Feld im Drahtformat, und die
             * Wiederholung ist folgenlos, weil der Client sie erkennt.
             */
            if (context.lobbyId) {
              const fertigeSitzung = this.#sessions.get(context.lobbyId);
              if (fertigeSitzung?.match?.status === 'gameover') {
                socket.send(controlMessage('match_over', {
                  winnerTeamId: fertigeSitzung.match.winnerTeamId,
                  rounds: fertigeSitzung.match.round,
                }));
              }
            }
            break;

          default:
            socket.send(controlMessage(CONTROL.ERROR, { error: `Unbekannter Nachrichtentyp: ${message.t}` }));
        }
      } catch (error) {
        this.metrics.errors += 1;
        this.logger.error('ws_command_failed', 'Kommando über WebSocket fehlgeschlagen', {
          lobbyId: context.lobbyId,
          // Der Token wird NICHT mitgeschrieben (der Logger redigiert ihn ohnehin,
          // aber ein Feld dafür anzulegen wäre die falsche Gewohnheit).
          messageType: parseControlMessage(raw)?.t ?? null,
          error,
        });
        socket.send(controlMessage(CONTROL.ERROR, { error: error.message }));
      }
    });

    socket.on('close', () => {
      if (!context.lobbyId || !context.token) return;
      const session = this.#sessions.get(context.lobbyId);
      session?.detach(context.token);
      this.#lobbies.disconnect(context.lobbyId, context.token);
      const lobby = this.#lobbies.get(context.lobbyId);
      if (lobby && lobby.seats.every(seat => !seat.connected)) {
        session?.stop();
      }
    });
  }

  /** Startet den Server auf dem angegebenen Port. */
  listen(port = 3000, host = '127.0.0.1') {
    return new Promise((resolve, reject) => {
      this.#httpServer.once('error', reject);
      this.#httpServer.listen(port, host, () => {
        const address = this.#httpServer.address();
        this.logger.info('server_listening', 'Server nimmt Verbindungen an', {
          port: address.port,
          host: address.address,
          protocol: PROTOCOL_VERSION,
          persistence: Boolean(this.persistence),
        });
        resolve({ port: address.port, host: address.address, url: `http://${host}:${address.port}` });
      });
    });
  }

  async close() {
    // Vor dem Herunterfahren sichern, damit ein Neustart das Match fortsetzen kann.
    this.stopPersistence();
    this.saveState();
    for (const session of this.#sessions.values()) session.stop();
    this.#sessions.clear();
    // Offene Sockets sofort beenden, sonst blockieren Keep-Alive-Verbindungen
    // (fetch) und laufende WebSockets den Close-Handshake.
    for (const socket of this.#wsServer.clients) socket.terminate();
    const withTimeout = promise => Promise.race([
      promise,
      new Promise(resolve => setTimeout(resolve, 2000)),
    ]);
    await withTimeout(new Promise(resolve => this.#wsServer.close(() => resolve())));
    this.#httpServer.closeIdleConnections?.();
    this.#httpServer.closeAllConnections?.();
    await withTimeout(new Promise(resolve => this.#httpServer.close(() => resolve())));
  }
}

export { LobbySession };

/**
 * Liefert den gebauten Client aus `dist/` aus.
 *
 * Damit läuft die Produktion single-origin: Der Server bedient Spiel und
 * WebSocket-Endpunkt unter derselben Herkunft. Existiert kein Build, wird
 * nichts ausgeliefert und der Aufrufer antwortet mit 404.
 *
 * @param {string} [distDir='dist']
 * @returns {function(object, object, URL): boolean}
 */
export function createDistHandler(distDir = 'dist') {
  const root = resolve(process.cwd(), distDir);
  const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.map': 'application/json; charset=utf-8',
  };

  return (request, response, url) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') return false;

    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const candidate = resolve(root, relative === '' ? 'index.html' : relative);

    // Pfadausbruch verhindern.
    if (!candidate.startsWith(root)) return false;

    let filePath = candidate;
    try {
      if (!statSync(filePath).isFile()) return false;
    } catch {
      // SPA-Fallback: unbekannte Pfade ohne Endung erhalten index.html.
      if (relative.includes('.')) return false;
      filePath = resolve(root, 'index.html');
      try {
        if (!statSync(filePath).isFile()) return false;
      } catch {
        return false;
      }
    }

    const body = readFileSync(filePath);
    response.writeHead(200, {
      'content-type': MIME[extname(filePath)] ?? 'application/octet-stream',
      'content-length': body.length,
      'cache-control': 'no-cache',
    });
    if (request.method === 'HEAD') return response.end(), true;
    response.end(body);
    return true;
  };
}

/** Startet einen eigenständigen Server (siehe npm run server). */
export async function startServer(options = {}) {
  // Persistenz standardmäßig aktiv; mit PA_PERSISTENCE=off abschaltbar.
  const persistenceEnabled = options.persistence !== null
    && process.env.PA_PERSISTENCE !== 'off';
  const persistence = options.persistence
    ?? (persistenceEnabled ? new PersistenceStore({ path: options.statePath ?? '.pa-state/lobbies.json' }) : null);

  const server = new GameServer({ ...options, persistence });
  const restored = server.restoreState();
  server.startPersistence();
  const info = await server.listen(options.port ?? Number(process.env.PORT ?? 3000), options.host ?? '127.0.0.1');
  return { server, restored, ...info };
}

export default GameServer;
