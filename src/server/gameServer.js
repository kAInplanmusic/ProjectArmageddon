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
/*
 * KEIN Bot-Import. Es gibt keine Bot-KI: Teams werden nur von Menschen
 * gespielt. Die speziellen NPCs (Günther, Geschütze) stecken im Motor.
 */
import {
  CONTROL,
  MESSAGE_TYPE,
  MAGIC,
  PROTOCOL_VERSION,
  controlMessage,
  parseControlMessage,
  encodeSnapshot,
  toDeltaBase,
  EreignisSendefilter,
} from '../shared/protocol.js';
import { validateCommand, INPUT_LIMITS } from '../shared/validation.js';
import { SIMULATION_HZ, TICK_MS } from '../shared/config/network.js';
import { ReplayRecorder } from '../engine/replay.js';
import { PersistenceStore, serializeLobby, restoreLobby } from './persistence.js';

/*
 * Der Simulationstakt kommt aus `src/shared/config/network.js` — dort steht er
 * EINMAL, und der Client liest dieselbe Zahl. Hier stand früher ein eigenes
 * `SIMULATION_HZ = 60` (siehe Fund in der Quelldatei).
 *
 * `SIMULATION_HZ` wird weiterhin von hier re-exportiert: `src/server/index.js`
 * gibt den Namen nach außen, und ein entfernter Export wäre eine stille
 * Änderung an der Schnittstelle des Servers.
 */
export { SIMULATION_HZ };

export const SNAPSHOT_HZ = 20;
const SNAPSHOT_INTERVAL_MS = 1000 / SNAPSHOT_HZ;
/**
 * Vermerk für unbegrenzte Munition. Muss mit `getState()` im MatchController
 * übereinstimmen — der Client prüft auf genau diesen Text.
 */
const UNLIMITED_AMMO = 'unbegrenzt';
/** Nach so vielen Snapshots geht wieder ein Vollsnapshot raus (Resync). */
const FULL_SNAPSHOT_INTERVAL = SNAPSHOT_HZ * 2;
/**
 * Wie oft die Lobby-Verwaltung nach ABGELAUFENEN Beitritten sieht.
 *
 * FUND (belegt, 2026-09-27): `LobbyManager#pruneDisconnected` war vollständig
 * gebaut — und hatte **keinen einzigen Aufrufer** (`grep -rn pruneDisconnected
 * src/` fand nur Definition und Kommentar). Der Kommentar an `disconnect`
 * versprach dafür „Nach dem Reconnect-Fenster verfällt sein Team und die Lobby
 * nimmt wieder einen Menschen auf"; gemessen galt das Gegenteil: Der Platz
 * blieb für immer belegt, und der nächste Mensch bekam „Alle 2 Teams sind
 * besetzt — kein Platz frei", auch zehn Minuten nach dem Trennen.
 *
 * Der Wert ist ein Kompromiss: Das Fenster selbst ist 30 s
 * (`LobbyManager`, Vorgabe), und die Sicht wird höchstens um dieses Intervall
 * später richtig. Kleiner wäre feiner, kostete aber einen Weckruf je Sekunde
 * für eine Verwaltungsrunde über wenige Lobbies — deshalb 5 s. Wer den Beitritt
 * nicht abwarten will, ruft `GameServer#pruneLobbies` zusätzlich direkt (das
 * tut der Beitrittspfad selbst, siehe `JOIN_LOBBY`).
 */
const PRUNE_INTERVAL_MS = 5_000;

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
    /*
     * Sendefilter für den Ereigniskanal — EINE Instanz je Sitzung.
     *
     * Das Gedächtnis der Drossel (letzter Takt je Art und Figur) gehört zu
     * genau dieser Partie: Zwei Lobbys haben eigene Taktzähler und dürfen sich
     * keine Fenster teilen. Die Zahlen des Filters (`zahlen()`) machen den
     * Effekt nachprüfbar — ohne sie wäre „der Kanal ist jetzt ruhiger" eine
     * Behauptung. Siehe `src/shared/protocol.js`, Abschnitt „SENDEFILTER".
     */
    this.sendefilter = new EreignisSendefilter();
    this.match = new MatchController({
      seed: lobby.seed,
      teams: lobby.teams,
      playersPerTeam: lobby.playersPerTeam,
      preset: lobby.preset,
      // Der Kartentyp des neuen Generators — wie `preset` Teil der Konfiguration,
      // damit alle Teilnehmer dieselbe Karte bekommen.
      kartentyp: lobby.kartentyp ?? null,
      orientation: lobby.orientation ?? 'landscape',
      /*
       * Sidegrades aus der Lobby-Konfiguration. Die Wahl kommt vom Ersteller
       * (`POST /api/lobby/create`) und ist Teil der Match-Konfiguration —
       * derselbe Weg wie `preset`. Der Server validiert sie in `lobby.js`
       * gegen `SIDEGRADE_IDS`; was hier ankommt, ist bereits geprüft.
       */
      sidegrades: Array.isArray(lobby.sidegrades) ? lobby.sidegrades : null,
      // Klassenwahl je Platz — wie die Sidegrades Teil der Konfiguration.
      loadouts: Array.isArray(lobby.loadouts) ? lobby.loadouts : null,
    });
    this.match.start();

    /** Aufzeichnung für Persistenz und Replay. */
    this.recorder = new ReplayRecorder({
      seed: this.match.seedManager.baseSeed,
      teams: lobby.teams,
      playersPerTeam: lobby.playersPerTeam,
      preset: lobby.preset,
      kartentyp: lobby.kartentyp ?? null,
      maxRounds: this.match.maxRounds,
      turnDurationMs: this.match.turnDurationMs,
      // Ohne diesen Eintrag spielte eine Wiedergabe ein Match OHNE Sidegrades
      // und liefe ab dem ersten Schuss auseinander.
      sidegrades: this.match.sidegrades,
      // Dasselbe gilt für die Klassenwahl: Ohne sie im Kopf spielte die
      // Wiedergabe die Standardzuteilung statt der gewählten Profile.
      loadouts: this.match.loadouts,
    });

    /*
     * Wiederherstellung: bis zum gespeicherten Tick vorspulen — auch OHNE
     * aufgezeichnete Eingaben.
     *
     * FUND (belegt, gemessen 2026-09-27): Hier stand
     *     `if (Array.isArray(replayEntries) && replayEntries.length > 0)`
     * — ohne Einträge wurde gar nicht wiederhergestellt. Eine Partie, in der
     * noch NIEMAND geschossen hatte (oder in der alle Eingaben abgelehnt
     * wurden), kam damit am ANFANG zurück statt am gesicherten Takt: gemessen
     * gesicherter Takt 92, wiederhergestellter Takt 0, Zustandshash `2ee23ca9`
     * → `3260a37`. Figuren standen wieder auf ihren Startplätzen und alles
     * Gelände war unberührt — die gespielten 92 Takte waren still weg.
     *
     * Die Tickzahl allein genügt als Bedingung: Sie sagt, wie weit die
     * Simulation lief, und die Simulation ist aus Seed + Konfiguration
     * deterministisch. Ein leeres Eingabefeld ist kein Grund, nicht
     * vorzuspulen.
     */
    const hatFortschritt = (Array.isArray(replayEntries) && replayEntries.length > 0)
      || Number(replayTotalTicks) > 0;
    if (hatFortschritt) {
      this.#restoreFromReplay(Array.isArray(replayEntries) ? replayEntries : [], replayTotalTicks);
    }

    this.history = new SnapshotHistory();
    // Kein Bot. Die Sitzung führt nur die Simulation; Züge kommen von Menschen.
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

    /*
     * Bis ZUM GESICHERTEN TAKT — nicht einen darüber hinaus.
     *
     * FUND (belegt, Datenfluss-Audit): Hier stand `… + 1` in der Grenze
     * (`limit = Math.max(totalTicks, …) + 1`) bei der Bedingung
     * `tickCount < limit`. Die Schleife lief damit einen Schritt ÜBER den
     * gesicherten Takt hinaus, obwohl der Kommentar daneben „exakt derselbe
     * Zustand" behauptete. Gemessen (Seed 20260910, 420 gesicherte Takte):
     * Takte 420 → 421, alle vier Figuren je 792,82 → 784,0 (8 px tiefer, freier
     * Fall), `turnElapsedMs` 5250,0 → 5266,7, Zustandshash `1e199a57` →
     * `d4248776`.
     *
     * Die Eingaben des GESICHERTEN Takts werden danach noch angewendet: Sie
     * wirkten BEI diesem Takt (`handleInput` wendet sofort an und zeichnet den
     * laufenden Takt auf), ihr unmittelbarer Effekt gehört also zum gesicherten
     * Zustand — ein zusätzlicher Simulationsschritt gehörte nicht dazu.
     *
     * Dass die Grenze jetzt stimmt, ist nicht nur eine Rechnung: `restoreLobby`
     * vergleicht den wiederhergestellten Zustandshash mit dem gesicherten
     * (`saved.hash`) und meldet jede Abweichung. Ein Rückfall in diese Klasse
     * wäre beim nächsten Neustart zu sehen.
     */
    const limit = Math.max(totalTicks, ...entries.map(entry => entry.tick));
    let guard = 0;
    while (this.match.status === 'playing' && this.match.world.tickCount < limit && guard < limit + 10) {
      const tick = this.match.world.tickCount;
      for (const entry of byTick.get(tick) ?? []) {
        this.#applyReplayEntry(entry);
      }
      this.match.step();
      this.match.consumeEvents();
      guard += 1;
    }
    if (this.match.world.tickCount === limit) {
      for (const entry of byTick.get(limit) ?? []) this.#applyReplayEntry(entry);
    }
    for (const entry of entries) this.recorder.recordInput(entry);
    this.recorder.finalize(this.match.world.tickCount);
  }

  /**
   * Wendet EINEN Aufzeichnungseintrag an — je nach Art (wie `ReplayPlayer`).
   *
   * Fund (belegt): Hier stand ausschließlich `match.fire(...)`. Eine
   * Aufzeichnung mit Sprung oder Abwurf wurde bei der Wiederherstellung deshalb
   * STILL unvollständig nachgespielt: Der Sprung fehlte (die Figur stand
   * woanders), der Abwurf fehlte (der Zufallsstrom war verschoben, damit auch
   * der Wind). Ohne diesen Zweig wäre jeder Serverneustart nach einem
   * Online-Sprung ein stiller Zustandsverlust.
   *
   * RÜCKWÄRTSKOMPATIBILITÄT: Ein Eintrag ohne `kind` ist ein Schuss.
   */
  #applyReplayEntry(entry) {
    if (entry.kind === 'jump') {
      this.match.jump(entry.playerId, entry.seitlich ?? 0);
      return;
    }
    if (entry.kind === 'drop') {
      this.match.dropWeapon(entry.playerId, entry.weaponId);
      return;
    }
    this.match.fire(entry.playerId, entry.angle, entry.power, entry.weaponId ?? null);
  }

  /** Momentaufnahme für die Persistenz. */
  toPersisted() {
    this.recorder.finalize(this.match.world.tickCount);
    return { replay: this.recorder.toJSON(), tick: this.match.world.tickCount };
  }

  /**
   * Ordnet Lobby-Plätze den tatsächlichen Spieler-Entities zu.
   *
   * Die Zuordnung geht über `seat.figureIndex` — den SLOT im Motor, nicht über
   * die Position im Sitz-Array.
   *
   * FUND (belegt, 2026-09-20): Vorher stand hier `players[index]` mit der
   * Array-Position. Das stimmt nur, solange die Plätze in der Reihenfolge des
   * Motors entstehen. Der Motor erzeugt die Figuren aber VERSCHRÄNKT
   * (`#spawnPlayers`: `teamId = index % teams`) — bei zwei Teams mit je drei
   * Einheiten ist die Reihenfolge T0E1, T1E1, T0E2, T1E2, T0E3, T1E3. Ein
   * Beitritt, der ein ganzes Team belegt, fügt seine drei Plätze aber
   * hintereinander ein (T0E1, T0E2, T0E3) — und bekäme damit die Figuren von
   * Team 1 und 2. Mit `figureIndex` ist die Zuordnung unabhängig von der
   * Reihenfolge der Beitritte.
   */
  #assignEntityIds() {
    const players = this.match.players;
    this.lobby.seats.forEach((seat, index) => {
      const slot = seat.figureIndex ?? index;
      seat.entityId = players[slot]?.entityId ?? null;
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

  /**
   * Läuft die Simulation schon?
   *
   * Der Unterschied ist wichtig, seit es keine Bot-KI gibt: Die Sitzung entsteht
   * beim ersten Beitritt (damit Plätze und Figuren zugeordnet werden können),
   * aber sie tickt erst, wenn alle Teams von Menschen besetzt sind. Sonst liefe
   * ein Match, in dem auf der einen Seite niemand ist.
   */
  get laeuft() { return this.timer !== null; }

  /** Ein Simulationsschritt — ohne Bot. Wer zieht, entscheidet der Mensch. */
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

    /*
     * Der SENDEFILTER sitzt HINTER `consumeEvents()`.
     *
     * Warum genau hier: Die Ereignisse sind zu diesem Zeitpunkt entstanden, die
     * Simulation ist durchgelaufen, der Zufallsstrom ist verbraucht. Der Filter
     * entscheidet nur noch, was auf die Leitung geht — er kann die Simulation,
     * die Tick-Reihenfolge und die Wiedergabegleichheit damit nicht berühren.
     * (Replays zeichnen EINGABEN auf, nicht Ereignisse, siehe
     * `src/engine/replay.js`.)
     *
     * Warum überhaupt: Ein ungefilterter Kanal schickte gemessen 34,3
     * `landed`-Nachrichten je Sekunde bei vier Figuren — 86,8 % der Steuerlast
     * und der Grund, weshalb das HUD-Protokoll (60 Zeilen) in unter zwei
     * Sekunden durchlief und eine wichtige Servermeldung unsichtbar machte.
     * Einzelheiten, Klassifikation und Messung: `src/shared/protocol.js`
     * (Abschnitt „SENDEFILTER") und `docs/ereigniskanal-filter.md`.
     */
    const takt = this.match.world.tickCount;
    for (const event of this.match.consumeEvents()) {
      if (!this.sendefilter.durchlassen(event.type, event.payload, takt)) {
        if (this.metrics) this.metrics.controlMessagesSuppressed += 1;
        continue;
      }
      if (this.metrics) this.metrics.controlMessagesSent += 1;
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
      /*
       * Keine Bot-Züge: Der Server führt AUSSCHLIESSLICH die Simulation. Wer
       * zieht, entscheidet der Mensch am Client (oder, im Replay, die
       * aufgezeichnete Eingabe). Siehe `#runBotTurn` weiter unten — dort steht,
       * warum das so ist.
       */
      this.match.step();
      this.history.push(this.match.world.tickCount, this.match.getState());
    }
    if (this.match.status === 'gameover') this.#finish();
    return this.match.getState();
  }

  /*
   * HIER STAND `#runBotTurn()` — ein Server-Bot, der jeden Zug einer Figur ohne
   * verbundenen Client selbst schoss.
   *
   * ENTFERNT (2026-09-20, Vorgabe des Auftraggebers): **Es gibt keine Bot-KI.**
   * Teams werden ausschließlich von Menschen gespielt. Ein unbesetztes Team ist
   * kein Bot-Team, sondern ein unbesetztes Team — die Lobby startet erst, wenn
   * alle Teams besetzt sind (`#alleTeamsBesetzt`).
   *
   * Die SPEZIELLEN NPCs bleiben davon unberührt: Sie stecken im Motor
   * (`src/engine/systems/guentherSystem.js` und Geschütze), laufen deterministisch
   * mit der Simulation und besetzen kein Team. Sie sind keine Spieler.
   *
   * Was das für einen Abbruch bedeutet: Verliert ein Mensch die Verbindung,
   * zieht für ihn NIEMAND. Sein Zug läuft über die Zugzeit ab. Das ist die
   * ehrliche Folge eines Spiels ohne KI-Vertretung — und besser als eine
   * Vertretung, die es laut Vorgabe nicht geben darf.
   */

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
    /*
     * Bilanz des Sendefilters — EINE Zeile je Partie, und nur wenn er etwas
     * getan hat.
     *
     * Sie steht hier, weil der Effekt sonst unsichtbar bliebe: Dass der Kanal
     * ruhiger ist, sieht man im Betrieb nicht (fehlende Nachrichten sieht
     * niemand); die Zahlen des Filters sind der einzige Beleg. Die Liste der
     * Arten zeigt zugleich, WORAN gespart wurde — erwartet wird `landed`, also
     * reine Anzeige. Taucht dort eine Zustandsart auf, ist das ein Fehler im
     * Filter und in dieser Zeile sofort zu sehen.
     */
    const kanalBilanz = this.sendefilter.summe();
    if (kanalBilanz.unterdrueckt > 0) {
      this.logger?.info('ereigniskanal', 'Sendefilter: Wiederholungen zusammengefasst', {
        empfangen: kanalBilanz.empfangen,
        gesendet: kanalBilanz.gesendet,
        unterdrueckt: kanalBilanz.unterdrueckt,
        anteilUnterdrueckt: Number(
          ((kanalBilanz.unterdrueckt / Math.max(1, kanalBilanz.empfangen)) * 100).toFixed(2),
        ),
        arten: this.sendefilter.zahlen().filter(eintrag => eintrag.unterdrueckt > 0),
      });
    }
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
      kartentyp: this.lobby.kartentyp ?? null,
      orientation: this.lobby.orientation ?? 'landscape',
      entityId: this.lobby.seats.find(seat => seat.token === token)?.entityId ?? null,
      // Alle Figuren dieses Beitrags (Matcharten: ein ganzes Team).
      entityIds: this.lobby.seats
        .filter(seat => seat.token === token && seat.entityId !== null)
        .map(seat => seat.entityId),
      /*
       * Ist das Match schon im Gang, oder wartet die Lobby auf Menschen?
       *
       * Ohne diese Angabe sähe der Client nur „Status: playing" und einen
       * Standbild-Zustand — er wüsste nicht, dass er auf Mitspieler wartet.
       * Es gibt keine Bot-KI: Bis jedes Team einen verbundenen Menschen hat,
       * läuft nichts.
       */
      laeuft: this.laeuft,
      teams: this.lobby.teams,
      besetzteTeams: new Set(
        this.lobby.seats.filter(seat => seat.token !== null && seat.connected).map(seat => seat.teamId),
      ).size,
      unitsPerPlayer: this.lobby.playersPerTeam,
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

  /**
   * Der Platz eines Tokens für die AKTIVE Figur.
   *
   * Im Modus der Matcharten gehören einem Token mehrere Figuren (ein ganzes
   * Team). Wer nur den ERSTEN Platz nimmt, zielt mit der falschen: Der Server
   * prüft `activePlayerId` gegen `playerId` und lehnt ab — der Mensch könnte
   * seine zweite und dritte Einheit nie ziehen, und die Waffenwahl zeigte auf
   * eine fremde Figur.
   *
   * Ist die aktive Figur NICHT die eigene, bleibt der erste eigene Platz: Die
   * Ablehnung lautet dann „nicht am Zug" statt „kein Spielerplatz".
   */
  #platzFuer(token) {
    const eigene = this.lobby.seats.filter(entry => entry.token === token);
    if (eigene.length === 0) return null;
    return eigene.find(entry => entry.entityId === this.match.activePlayerId) ?? eigene[0];
  }

  #handleInput(token, message) {
    const seat = this.#platzFuer(token);
    if (!seat || seat.entityId === null) {
      return { ok: false, errors: ['Kein Spielerplatz'] };
    }

    const currentTick = this.match.world.tickCount;
    /*
     * Der Tick des Clients geht in die Prüfung — aber gegen die BETRUGSGRENZE
     * (`maxTickDrift` = 400), nicht gegen das 12-Tick-Kompensationsfenster.
     *
     * FUND (belegt, 2026-09-19): Die harte 12-Tick-Prüfung
     * (`this.history.isWithinWindow`) hat gültige Schüsse verworfen, sobald der
     * Client länger als 200 ms brauchte — auf langsamer Hardware (48,8 ms/Bild)
     * der Regelfall. Sie schützte dabei nichts: `MatchController.fire` nimmt
     * KEINEN Tick entgegen, der Treffer wird immer gegen den AKTUELLEN Zustand
     * gerechnet. Der Tick füllt nur `interpolatedFrom` in der Antwort — eine
     * Anzeige-Rückmeldung.
     *
     * Die Rückrechnung bleibt begrenzt: `history.get()` liefert außerhalb des
     * Kompensationsfensters `null`. Das ist die sauberere Degradierung als ein
     * verworfener Schuss. Erfundene Ticks (negativ, ±100 000) bleiben abgelehnt,
     * weil `isTickInWindow` gegen `maxTickDrift` prüft.
     */
    const history = this.history.get(message.tick ?? currentTick);
    const command = validateCommand(
      {
        playerId: seat.entityId,
        angle: message.angle,
        power: message.power,
        weaponId: message.weaponId ?? null,
        tick: message.tick ?? currentTick,
        type: 'fire',
      },
      {
        currentTick,
        activePlayerId: this.match.activePlayerId,
        knownPlayerIds: this.match.players.map(player => player.entityId),
      }
    );

    if (!command.valid) return { ok: false, errors: command.errors };

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
    // Die Waffe wird für die AKTIVE eigene Figur gewählt — siehe #platzFuer.
    const seat = this.#platzFuer(token);
    if (!seat || seat.entityId === null) return { ok: false, errors: ['Kein Spielerplatz'] };
    const ok = this.match.inventory.selectWeapon(seat.entityId, weaponId);
    return { ok, errors: ok ? [] : ['Waffe nicht verfügbar'] };
  }

  /**
   * Führt einen Sprung aus.
   *
   * Eigene Steuernachricht statt eines `kind`-Feldes in `INPUT`: Der Sprung ist
   * kein Schuss mit anderen Zahlen, sondern eine eigene Handlung — genauso, wie
   * `SELECT_WEAPON` trotz `weaponId` in `INPUT` ein eigener Befehl ist. Das
   * `tick`-Feld der Schussnachricht wird hier bewusst NICHT verlangt: Der
   * Impuls ist sofort und autoritativ, es gibt nichts zu interpolieren.
   *
   * Die Identität kommt AUS DEM TOKEN (`#platzFuer`), nie aus der Nachricht. Die
   * Figurenzustands-Prüfungen (am Boden, höchstens zwei je Zug, am Zug) liegen
   * im Motor — hier wird NICHTS doppelt gezählt (Regel „eine Regel, eine
   * Stelle").
   *
   * @param {string} token
   * @param {object} message - Felder `seitlich` (-1|0|1); alles andere wird ignoriert
   * @returns {{ok:boolean, errors?:string[]}}
   */
  handleJump(token, message = {}) {
    const result = this.#handleJump(token, message);
    if (this.metrics) {
      if (result.ok) this.metrics.commandsAccepted += 1;
      else this.metrics.commandsRejected += 1;
    }
    return result;
  }

  #handleJump(token, message) {
    const seat = this.#platzFuer(token);
    if (!seat || seat.entityId === null) {
      return { ok: false, errors: ['Kein Spielerplatz'] };
    }

    /*
     * Die Richtung wird TYPGEprüft, nicht geklemmt.
     *
     * Der Motor klemmt mit `Math.max(-1, Math.min(1, Number(horizontal) || 0))`
     * — das ist Toleranz, keine Prüfung: `Number('1e9')` würde still zu `1`, aus
     * Unsinn ein gültiger Sprung. Die Projektregel „`Number(x)` ist keine
     * Typprüfung" (`validation.js`) gilt hier genauso. Fehlt das Feld, gilt `0`
     * (gerade).
     */
    const seitlich = message.seitlich ?? 0;
    if (typeof seitlich !== 'number' || !Number.isInteger(seitlich) || seitlich < -1 || seitlich > 1) {
      return { ok: false, errors: ['seitlich muss -1, 0 oder 1 sein'] };
    }

    const result = this.match.jump(seat.entityId, seitlich);
    if (result.ok) {
      this.recorder.recordInput({
        tick: this.match.world.tickCount,
        playerId: seat.entityId,
        seitlich,
        kind: 'jump',
      });
    }
    return { ok: result.ok, errors: result.errors ?? [] };
  }

  /**
   * Wirft eine Waffe ab.
   *
   * Wie `handleJump` eine eigene Steuernachricht. Die Zugehörigkeit der Waffe
   * entscheidet der Motor über die `playerId` aus dem TOKEN
   * (`inventory.removeWeapon`), nicht über die Waffe allein — ein Client kann
   * also keine fremde Waffe abwerfen.
   *
   * @param {string} token
   * @param {string} weaponId
   * @returns {{ok:boolean, errors?:string[]}}
   */
  handleDropWeapon(token, weaponId) {
    const result = this.#handleDropWeapon(token, weaponId);
    if (this.metrics) {
      if (result.ok) this.metrics.commandsAccepted += 1;
      else this.metrics.commandsRejected += 1;
    }
    return result;
  }

  #handleDropWeapon(token, weaponId) {
    const seat = this.#platzFuer(token);
    if (!seat || seat.entityId === null) {
      return { ok: false, errors: ['Kein Spielerplatz'] };
    }
    if (typeof weaponId !== 'string' || weaponId.length === 0) {
      return { ok: false, errors: ['weaponId muss eine Zeichenkette sein'] };
    }

    const result = this.match.dropWeapon(seat.entityId, weaponId);
    if (result.ok) {
      this.recorder.recordInput({
        tick: this.match.world.tickCount,
        playerId: seat.entityId,
        weaponId,
        kind: 'drop',
      });
    }
    return { ok: result.ok, errors: result.errors ?? [] };
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
      /*
       * Klasse und Archetyp gehören in die Bestandsnachricht.
       *
       * Fund (belegt): Sie wurden NIRGENDS übertragen. Der Client riet sie aus
       * dem Listenindex (`CLASS_IDS[index % CLASS_IDS.length] === 'scout' ? 0 : 1`)
       * — bei zwei Klassen also abwechselnd, unabhängig davon, wer tatsächlich
       * welche Figur führt. Folge: Die Winkelvorschau und (mit der
       * Schussvorhersage) die angezeigte Flugbahn rechneten mit einem fremden
       * Geschwindigkeitsfaktor — eine Artillery-Figur zeigte die Bahn eines
       * Scouts.
       *
       * Nicht in den binären Snapshot: Der hat ein festes Layout je Spieler
       * (PLAYER_STRIDE). Zwei zusätzliche Bytes änderten das Drahtformat für
       * alle — für Werte, die sich nie während eines Matches ändern. Die
       * Bestandsnachricht geht ohnehin nur bei Änderung raus.
       */
      const spieler = this.match.players.find(entry => entry.entityId === seat.entityId);
      table[seat.entityId] = {
        inventory: [...entry.weapons],
        ammo,
        cooldowns,
        activeWeaponId: entry.activeWeaponId ?? null,
        classId: spieler?.classId ?? null,
        archetypeId: spieler?.archetypeId ?? null,
        /*
         * Der SIDEGRADE gehört in dieselbe Nachricht — als dritter Wert neben
         * Klasse und Archetyp.
         *
         * FUND (belegt, Datenfluss-Audit): Die Online-Schussvorhersage liest
         * `eigene.sidegradeId` (`main.js:1607`), und auf der Leitung gab es das
         * Feld nirgends — weder im binären Snapshot (fester Spielerblock, siehe
         * oben) noch in dieser Nachricht. Der Client rechnete deshalb IMMER ohne
         * Sidegrade. Gemessen an der Bahnlänge (`predictTrajectory`, 45°, Kraft
         * 100, Karte 2560 px): Artillery ohne Sidegrade 1144 px, mit `kompakt`
         * 1479 px (+335), mit `schwerlast` 914 px (−229) — der Spieler wählte
         * einen Sidegrade, und die angezeigte Bahn gehörte zu einem anderen
         * Profil als der Server rechnete.
         *
         * Warum HIER und nicht im binären Snapshot: `sidegradeId` ist eine
         * Zeichenkette (variable Länge) und ändert sich nie während eines
         * Matches — genau die Kategorie, für die es diese Nachricht schon gibt
         * (siehe Klasse/Archetyp oben). Der Wert kommt vom MOTOR
         * (`match.players[].sidegradeId`, dort schon gegen `SIDEGRADE_IDS`
         * aufgelöst), nicht aus der Lobby-Konfiguration: So steht auch hier nur
         * EINE Wahrheit, und eine unbekannte Kennung wirkt überall gleich
         * (wie „kein Sidegrade").
         */
        sidegradeId: spieler?.sidegradeId ?? null,
        /*
         * Höchstleben — ebenfalls ein Wert, der sich nie ändert.
         *
         * FUND (belegt, Datenfluss-Audit): Im Online-Ansichtszustand stand
         * `maxHealth: 100` als Konstante (`main.js:1168`). Die Klassen und
         * Archetypen ergeben aber andere Werte als 100: eigene Messung über alle
         * Kombinationen (BASE_HEALTH × `combatProfile().healthMultiplier`) —
         * **32 verschiedene Werte, Spanne 48 … 195** (scout/späher 96,
         * artillery/scharfschütze 108, heavy/brawler 156, mit Zusatzpanzerung
         * 120 / 135 / 195). `hud.js:365` und `renderer.js:795` rechnen
         * `health / maxHealth` OHNE Obergrenze — ein voller Lebensbalken eines
         * 156-HP-Brawlers war damit 156 % breit, ein unverletzter Späher sah mit
         * 96 % beschädigt aus.
         *
         * Gelesen wird der Wert, den der MOTOR gesetzt hat (`Health.max`) —
         * nicht nachgerechnet. Eine zweite Multiplikation hier wäre die nächste
         * Kopie einer Regel; `match.js:1050` rechnet sie schon.
         */
        maxHealth: this.match.world.getComponent(seat.entityId, 'Health', 'max') ?? null,
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
  /**
   * Weckruf der Verwaltungsrunde für abgelaufene Beitritte (`pruneLobbies`).
   *
   * Eigener Zeitgeber neben der Persistenz: Speichern und Beitritts-Verwaltung
   * sind zwei Aufgaben mit zwei Intervallen. Ein gemeinsamer wäre die nächste
   * doppelte Regel — wer eines der beiden Intervalle ändert, hätte das andere
   * mitgeändert.
   */
  #pruneTimer = null;
  /**
   * Ergebnisse der Zustandsprüfung je wiederhergestellter Lobby.
   *
   * Sie stehen hier und nicht nur im Log, damit ein Neustart PRÜFBAR ist:
   * `{lobbyId, gleich, erwartet, gemessen, tick, tickGesichert}` je Lobby.
   * FUND (belegt, Datenfluss-Audit): Vorher gab es keine Gegenprobe — der
   * Wiederaufbau lief einen Takt zu weit und stand nach dem Seed-Fehler auf
   * einer anderen Karte, ohne dass irgendwo etwas auffiel. Siehe `restoreLobby`.
   */
  #restorePruefungen = [];

  constructor({
    lobbyManager = new LobbyManager(),
    serveStatic = null,
    persistence = null,
    persistenceIntervalMs = 10_000,
    pruneIntervalMs = PRUNE_INTERVAL_MS,
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
      /*
       * Ereigniskanal: gesendete und vom Sendefilter unterdrückte
       * Steuernachrichten. Die beiden Zahlen sind der Betriebsbeleg dafür, dass
       * der Filter wirkt — und der Wächter dafür, dass er nicht mehr
       * unterdrückt als beabsichtigt (unterdrückt wird nur „reine Anzeige").
       */
      controlMessagesSent: 0,
      controlMessagesSuppressed: 0,
    };
    /** Optionale Persistenz: null deaktiviert das Speichern vollständig. */
    this.persistence = persistence;
    this.persistenceIntervalMs = persistenceIntervalMs;
    this.#persistenceTimer = null;
    /** Intervall der Verwaltungsrunde (Tests setzen es klein). */
    this.pruneIntervalMs = pruneIntervalMs;

    /*
     * Der HTTP-Pfad ist ASYNCHRON — und hatte keinen Fehlerweg.
     *
     * FUND (belegt, 2026-09-27): `#handleHttp` ist `async`, sein Rückgabewert
     * wurde aber nirgends abgewartet. Warf die Auslieferung des gebauten
     * Clients (`serveStatic` → `readFileSync`, etwa weil die Datei zwischen
     * `statSync` und dem Lesen verschwand), entstand eine UNBEHANDELTE
     * Promise-Ablehnung. Gemessen mit einem werfenden `serveStatic`: keine
     * Antwort an den Client (fetch lief in den Abbruch), und danach genau eine
     * `unhandledRejection` — in Node die Stelle, die den Prozess beendet.
     * Eine Ablehnung ohne Antwort ist die Fehlerklasse, die der Client NICHT
     * anzeigen kann: Er sieht nur „lädt nicht".
     *
     * Deshalb endet jeder Fehler dieses Pfades als 500 mit lesbarem Grund, und
     * er wird protokolliert. Ist der Kopf schon gesendet (Fehler erst beim
     * Schreiben der Nutzlast), ist keine Antwort mehr möglich — dann wird die
     * Verbindung geschlossen statt still zu hängen.
     */
    this.#httpServer = createHttpServer((request, response) => {
      this.#handleHttp(request, response).catch(fehler => {
        this.metrics.errors += 1;
        this.logger.error('http_failed', 'HTTP-Anfrage fehlgeschlagen', {
          method: request.method,
          url: request.url,
          error: fehler,
        });
        if (response.headersSent || response.writableEnded) {
          response.destroy();
          return;
        }
        try {
          this.#json(response, 500, this.#fehlerNutzlast(`Serverfehler: ${fehler?.message ?? fehler}`));
        } catch {
          response.destroy();
        }
      });
    });
    this.#wsServer = new WebSocketServer({ server: this.#httpServer, path: '/ws' });
    /*
     * Der WebSocket-Server hängt am selben HTTP-Server und bekommt dessen
     * `error`-Ereignisse mit.
     *
     * FUND (belegt, beim Bau von `scripts/server.mjs`): Ohne diesen Zuhörer
     * wirft Node den Fehler als UNBEHANDELTE Ausnahme und beendet den Prozess
     * mit einem Stapelauszug. `listen()` rejected zwar ebenfalls — aber die
     * Ausnahme kommt zuerst und reißt den Prozess ab, bevor `await` greifen
     * kann.
     *
     * Praktische Folge: Ein belegter Port (der häufigste Startfehler überhaupt)
     * meldete sich als roher Auszug mit `EADDRINUSE` statt als Satz, der sagt,
     * was zu tun ist.
     *
     * Der Zuhörer leitet den Fehler an den Logger weiter; `listen()` rejected
     * weiterhin, damit der Aufrufer ihn als Startfehler behandeln kann.
     */
    this.#wsServer.on('error', fehler => {
      this.logger.error('websocket_error', 'WebSocket-Server meldet einen Fehler', {
        code: fehler?.code ?? null,
        message: fehler?.message ?? String(fehler),
      });
    });
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
        const { lobby, hashPruefung } = restoreLobby(entry, {
          lobbyManager: this.#lobbies,
          // Für die Gegenprobe des wiederhergestellten Zustands (siehe
          // `restoreLobby`): gleich oder abweichend, mit beiden Hashes.
          logger: this.logger,
          createSession: (target, options) => {
            /*
             * Wiederhergestellte Sitzung — sie LÄUFT noch nicht.
             *
             * Die Teams stehen in der Sicherung, ihre Menschen sind aber erst
             * wieder da, wenn sie sich verbinden (`alleTeamsBesetzt` verlangt
             * einen verbundenen Menschen je Team). Vorher zu starten hieße,
             * gegen leere Plätze zu spielen — und für leere Plätze springt
             * niemand ein: Es gibt keine Bot-KI.
             */
            const session = new LobbySession(target, {
              onEmpty: id => this.#sessions.delete(id),
              replayEntries: options.replayEntries,
              replayTotalTicks: options.replayTotalTicks,
              metrics: this.metrics,
              logger: this.logger,
            });
            this.#sessions.set(target.id, session);
            return session;
          },
        });
        if (lobby) restored += 1;
        if (hashPruefung) this.#restorePruefungen.push({ lobbyId: entry.id, ...hashPruefung });
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

  /**
   * Startet die Verwaltungsrunde für ABGELAUFENE Beitritte.
   *
   * Ohne sie gilt das Versprechen aus `LobbyManager#disconnect` nicht: Ein
   * getrennter Mensch besetzt sein Team dauerhaft, weil `pruneDisconnected` nie
   * gerufen wird. Gemessen (Sonde 2026-09-27, zwei Teams, `reconnectWindowMs`
   * künstlich auf 10 Minuten überzogen): Nach dem Trennen blieb der Platz
   * belegt, und der nächste Mensch bekam „Alle 2 Teams sind besetzt — kein
   * Platz frei".
   *
   * Wie `startPersistence` idempotent und `unref`t: Ein Zeitgeber darf den
   * Prozess nicht am Beenden hindern (Tests und `npm run server` beenden sich
   * sonst nicht).
   */
  startPruning() {
    if (this.#pruneTimer) return this;
    this.#pruneTimer = setInterval(() => this.pruneLobbies(), this.pruneIntervalMs);
    if (typeof this.#pruneTimer.unref === 'function') this.#pruneTimer.unref();
    return this;
  }

  stopPruning() {
    if (this.#pruneTimer) clearInterval(this.#pruneTimer);
    this.#pruneTimer = null;
    return this;
  }

  /**
   * Lässt abgelaufene Beitritte verfallen — die EINE Stelle, die
   * `LobbyManager#pruneDisconnected` ruft.
   *
   * Sie wird aus zwei Richtungen erreicht:
   *  1. der Verwaltungsrunde (`startPruning`, Vorgabe 5 s), und
   *  2. dem Beitrittspfad (`JOIN_LOBBY` ruft sie VOR `join`), damit die
   *     Entscheidung „Team frei oder nicht" nie auf einem veralteten Stand
   *     beruht: Wer beitritt, soll nicht 5 s warten müssen.
   *
   * Der Zeitpunkt ist ein Parameter und keine versteckte Uhr: Ein Test kann
   * damit das Reconnect-Fenster überziehen, ohne 30 s zu warten.
   *
   * @param {number} [now=Date.now()]
   * @returns {Array<{lobbyId: string, token: string, name: string|null}>}
   */
  pruneLobbies(now = Date.now()) {
    const entfernt = this.#lobbies.pruneDisconnected(now);
    for (const eintrag of entfernt) {
      this.logger.info('lobby_beitritt_verfallen', 'Reconnect-Fenster abgelaufen — Team wieder frei', {
        lobbyId: eintrag.lobbyId,
        name: eintrag.name,
      });
    }
    /*
     * HIER STAND EINE ZUSÄTZLICHE ZEILE, die eine Sitzung stoppt, wenn nach dem
     * Verfall niemand mehr verbunden ist.
     *
     * Sie ist wieder entfernt, weil ihr Fall nicht erreichbar ist: Ein Platz
     * wird nur dann verfallbar, wenn sein `close`-Ereignis ihn getrennt hat —
     * und genau dieser Handler prüft bereits „alle Plätze getrennt?" und stoppt
     * die Sitzung (`session?.stop()`, siehe `#handleConnection`). Beim LETZTEN
     * `close` sind alle übrigen Plätze noch da und ebenfalls getrennt, also
     * greift er. Eine Zeile, deren Wirkung sich nicht vorführen lässt, ist toter
     * Code — auch wenn sie gut gemeint ist.
     *
     * Der verbleibende Fall ist ein anderer und älter als diese Arbeit: Ein über
     * `POST /api/lobby/create` angelegter Host-Platz steht von Anfang an auf
     * `connected: true`, auch wenn sich nie ein Socket anmeldet. Er verfällt
     * nicht und hält das Match am Laufen. Das ist kein Teil dieser Reparatur und
     * steht im Bericht (`docs/server-seite-fixes.md`) als offener Punkt.
     */
    return entfernt;
  }

  get lobbyManager() {
    return this.#lobbies;
  }

  get sessionCount() {
    return this.#sessions.size;
  }

  /**
   * Ergebnisse der Zustandsprüfung aus dem letzten `restoreState()`.
   *
   * Ein Eintrag je wiederhergestellter Lobby mit Zustandshash:
   * `{lobbyId, gleich, erwartet, gemessen, tick, tickGesichert}`. Ein leeres
   * Feld heißt „es gab nichts wiederherzustellen" oder „die Sicherung trug
   * keinen Hash" (alte Fassung) — nicht „alles in Ordnung".
   */
  get restorePruefungen() {
    return [...this.#restorePruefungen];
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
      // Dieselbe Nutzlast wie im WebSocket-Pfad (`#fehlerNutzlast`): Der Grund
      // steht in `error` UND in `errors` — ein Leser muss nicht wissen, auf
      // welchem Weg die Ablehnung kam.
      if (!lobby) return this.#json(response, 404, this.#fehlerNutzlast('Lobby nicht gefunden'));
      return this.#json(response, 200, { lobby });
    }

    if (request.method === 'POST' && url.pathname === '/api/lobby/create') {
      const body = await this.#readBody(request);
      try {
        this.metrics.lobbiesCreated += 1;
        const created = this.#lobbies.create({
          teams: Number(body.teams ?? 2),
          /*
           * Beide Angaben sind FREIWILLIG und werden durchgereicht, nicht
           * vorbelegt.
           *
           * Vorher stand hier `Number(body.playersPerTeam ?? 2)`: Damit war
           * „nicht angegeben" immer eine 2, und `unitsPerPlayer` hätte nie
           * greifen können. `null` bedeutet jetzt „nicht angegeben" — der
           * Lobby-Manager entscheidet dann (Vorgabe 2 bzw. der Modus mit einem
           * Platz je Beitritt).
           */
          playersPerTeam: body.playersPerTeam === undefined || body.playersPerTeam === null
            ? null
            : Number(body.playersPerTeam),
          unitsPerPlayer: body.unitsPerPlayer === undefined || body.unitsPerPlayer === null
            ? null
            : Number(body.unitsPerPlayer),
          preset: body.preset ?? 'hills',
          // Leerstring und fehlend sind gleichbedeutend: „der bewährte Generator".
          kartentyp: body.kartentyp || null,
          orientation: body.orientation ?? 'landscape',
          seed: body.seed === undefined || body.seed === '' ? undefined : Number(body.seed),
          hostName: body.name ?? 'Host',
          // Der Manager prüft jede Kennung und setzt Unbekanntes auf null —
          // eine ungültige Angabe darf das Anlegen nicht verhindern.
          sidegrades: Array.isArray(body.sidegrades) ? body.sidegrades : null,
          loadouts: Array.isArray(body.loadouts) ? body.loadouts : null,
        });
        this.logger.info('lobby_created', 'Lobby angelegt', {
          lobbyId: created.lobby.id,
          teams: created.lobby.teams,
          playersPerTeam: created.lobby.playersPerTeam,
          preset: created.lobby.preset,
          kartentyp: created.lobby.kartentyp,
          orientation: created.lobby.orientation,
          seed: created.lobby.seed,
          // Nur die gesetzten, damit das Log nicht mit null-Werten zugestellt wird.
          sidegrades: created.lobby.sidegrades?.filter(Boolean) ?? [],
        });
        return this.#json(response, 201, created);
      } catch (error) {
        this.logger.warn('lobby_create_failed', 'Lobby konnte nicht angelegt werden', {
          error,
          teams: body.teams,
          playersPerTeam: body.playersPerTeam,
        });
        return this.#json(response, 400, this.#fehlerNutzlast(error.message));
      }
    }

    if (this.serveStatic) {
      const handled = this.serveStatic(request, response, url);
      if (handled) return;
    }

    this.#json(response, 404, this.#fehlerNutzlast('Nicht gefunden'));
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

  /**
   * EINE Nutzlast für jede Ablehnung des Servers.
   *
   * FUND (belegt, 2026-09-27): Für dieselbe Bedeutung wurden ZWEI Formen
   * gesendet — der Kommandopfad `errors: [ … ]` (`START_MATCH`, `INPUT`,
   * `SELECT_WEAPON`, `JUMP`, `DROP_WEAPON`), der Auffangpfad `error: '…'`
   * (unbekannte Lobby, laufende Lobby, volle Lobby, unbekannter
   * Nachrichtentyp, ungültige Nachricht). Am Draht gemessen:
   *
   *     {"v":8,"t":"error","error":"Lobby nicht gefunden"}
   *     {"v":8,"t":"error","errors":["Warte auf Mitspieler: Jedes Team braucht einen Menschen."]}
   *
   * Der eigene Client liest beide (`errors?.[0] ?? message.error`), ein fremder
   * muss es ebenfalls — und jede neue Ablehnungsstelle muss raten, welche Form
   * gerade gilt. Deshalb trägt jede Ablehnung ab hier BEIDE Felder: `error`
   * für Leser der alten Form (und für den Menschen im Log), `errors` als Liste
   * für den Kommandopfad. Die Redundanz ist Absicht; die Prüfung in
   * `tests/server-ablehnungen.test.js` hält fest, dass der Client an JEDER
   * Ablehnungsstelle einen Grund zeigen kann.
   *
   * @param {string|string[]} fehler - Text oder Liste; leere Einträge fallen weg
   */
  #fehlerNutzlast(fehler) {
    const liste = (Array.isArray(fehler) ? fehler : [fehler])
      .filter(eintrag => typeof eintrag === 'string' && eintrag.length > 0);
    return { error: liste[0] ?? 'Unbekannter Fehler', errors: liste };
  }

  /**
   * Schickt eine Ablehnung — und stürzt nicht, wenn der Socket schon weg ist.
   *
   * Dieselbe Rücksicht wie `#broadcastControl`/`broadcastSnapshot` (sie
   * überspringen Sockets mit `readyState !== 1`): Ein `send` auf einen nicht
   * offenen WebSocket ist kein Zustellversuch, sondern ein Fehler. Der Aufruf
   * steht im `catch`-Zweig — eine Ausnahme dort verließe den Nachrichten-
   * Zuhörer. Stattdessen wird der Vorgang sichtbar verworfen (Log-Zeile).
   *
   * @returns {boolean} true, wenn gesendet wurde
   */
  #fehlerSenden(socket, fehler) {
    const nutzlast = this.#fehlerNutzlast(fehler);
    if (!socket || socket.readyState !== 1) {
      this.logger.warn('error_reply_dropped', 'Ablehnung konnte nicht zugestellt werden — Socket nicht offen', {
        readyState: socket?.readyState ?? null,
        grund: nutzlast.error,
      });
      return false;
    }
    socket.send(controlMessage(CONTROL.ERROR, nutzlast));
    return true;
  }

  #handleConnection(socket) {
    let context = { lobbyId: null, token: null };

    socket.on('message', (raw, isBinary) => {
      /*
       * Binärrahmen vom Client werden verworfen — GRUND und Vermerk.
       *
       * Die Richtung Client → Server ist ausschließlich JSON-Kontrolle (siehe
       * `protocol.js`); Snapshots laufen nur Server → Client. Ein Client, der
       * hier binär sendet, hat einen Fehler — und bekam bisher GAR KEINE
       * Antwort: gemessen (Sonde 2026-09-27) blieb der Socket 700 ms lang still,
       * ohne Fehlermeldung, ohne Log-Zeile. Genau die Klasse „Ablehnung ohne
       * Rückweg".
       *
       * Warum trotzdem KEINE Fehlermeldung auf die Leitung geht: Das wäre eine
       * Verstärkung (1 Byte hinein, ~100 Byte hinaus) und damit eine Einladung,
       * den Server mit Müll zuzustellen. Die Sichtbarkeit stellt stattdessen die
       * Log-Zeile her — dieselbe Entscheidung wie bei der Nutzlastgrenze, die
       * ebenfalls protokolliert und abweist.
       */
      if (isBinary) {
        this.logger.warn('binary_message_rejected', 'Binärrahmen vom Client verworfen — diese Richtung ist JSON', {
          bytes: raw?.byteLength ?? raw?.length ?? null,
        });
        return;
      }

      /*
       * Nutzlastgrenze VOR dem Parsen.
       *
       * Fund (belegt): `INPUT_LIMITS.maxPayloadBytes` war definiert, aber
       * nirgends verwendet — `parseControlMessage` rief `JSON.parse` auf
       * beliebig große Eingaben auf. Gemessen: Eine Nachricht mit 1 MB Füllsel
       * wurde angenommen und geparst.
       *
       * Die Prüfung steht hier und nicht im gemeinsamen Parser, weil sie nur für
       * die Richtung CLIENT → SERVER gilt: Die Waffenbestände aller Spieler gehen
       * als EINE Nachricht an den Client und dürfen größer sein.
       *
       * Geprüft wird die BYTES, nicht die Zeichen: Ein Byte kann im JSON als
       * Escape-Sequenz stehen (`\u00e4`), und `raw.length` wäre dann zu klein.
       */
      const nutzlastBytes = typeof raw === 'string'
        ? Buffer.byteLength(raw, 'utf8')
        : (raw?.byteLength ?? 0);
      if (nutzlastBytes > INPUT_LIMITS.maxPayloadBytes) {
        this.logger.warn('payload_rejected', 'Nachricht über der Nutzlastgrenze abgewiesen', {
          bytes: nutzlastBytes,
          limit: INPUT_LIMITS.maxPayloadBytes,
        });
        this.#fehlerSenden(
          socket,
          `Nachricht zu groß (${nutzlastBytes} Byte, erlaubt ${INPUT_LIMITS.maxPayloadBytes})`,
        );
        return;
      }

      const message = parseControlMessage(raw);
      if (!message) {
        this.#fehlerSenden(socket, 'Ungültige Nachricht');
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
            /*
             * VOR der Belegungsprüfung die Verwaltungsrunde nachziehen.
             *
             * Ein Platz, dessen Reconnect-Fenster abgelaufen ist, ist frei —
             * auch wenn die Runde ihn noch nicht weggeräumt hat (Vorgabe: alle
             * 5 s). Ohne diese Zeile hinge die Entscheidung „Team frei oder
             * nicht" davon ab, ob zufällig gerade eine Runde lief: Der nächste
             * Mensch bekäme „Alle Teams sind besetzt — kein Platz frei", obwohl
             * seit Minuten niemand mehr da ist. Sie ist billig (wenige Lobbys,
             * wenige Plätze) und macht das Versprechen aus `disconnect` an der
             * Stelle wahr, an der es zählt.
             */
            this.pruneLobbies();
            const lobby = this.#lobbies.get(lobbyId);
            /*
             * Die Kennung gehört in die Meldung.
             *
             * Der Client wiederholt den Beitritt bei jeder Wiederverbindung mit
             * derselben ID; ohne sie lautet die Frage im Fehlerbericht „Lobby
             * nicht gefunden" — mit ihr „…: 8f3a1c2d" und der Fall ist
             * nachvollziehbar. Fehlt das Feld ganz, wird das eigens gesagt:
             * „keine Kennung" ist eine andere Ursache als „falsche Kennung".
             */
            if (!lobby) {
              throw new Error(`Lobby nicht gefunden: ${lobbyId ?? '(keine Kennung)'}`);
            }
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
              /*
               * Die Sitzung entsteht beim ersten Beitritt — aber sie LÄUFT erst,
               * wenn alle Teams von Menschen besetzt sind.
               *
               * Vorher lief sie sofort, und der Server-Bot spielte die freien
               * Teams. Das war falsch: **Es gibt keine Bot-KI.** Teams werden
               * ausschließlich von Menschen gespielt; ein unbesetztes Team ist
               * kein Bot-Team. Bis der letzte Mensch da ist, wartet die Lobby —
               * die Simulation läuft nicht, damit niemand ins Leere zieht.
               */
              session = new LobbySession(lobby, {
                onEmpty: id => this.#sessions.delete(id),
                metrics: this.metrics,
                logger: this.logger,
              });
              this.#sessions.set(lobbyId, session);
              /*
               * ============ ENTSCHEIDUNG (Fund W5): Status nachziehen ============
               *
               * *Der Befund (gemessen in `tests/server-integration.test.js`):*
               * Beim Match-Ende löscht die Sitzung sich selbst (`#finish` →
               * `onEmpty`); die Lobby und ihre Plätze bleiben stehen. Ein
               * späterer Beitritt mit Token findet keine Sitzung mehr und legt
               * HIER eine neue an — das Match beginnt bei Runde 1. Die Lobby trug
               * dabei weiter „finished" (= entschieden), WÄHREND in ihr gespielt
               * wurde: „es ist vorbei" und „es läuft" zugleich. Wer die Lobby
               * liest, sah eine erledigte Lobby, in der gespielt wird.
               *
               * *Die Entscheidung:* Der Status wird beim Wiederanlauf
               * nachgezogen. Die Lobby ist ein WIEDERSPIEL-Gefäß, kein einmaliges
               * Match. Sie trägt „open", solange kein Match in ihr unterwegs ist,
               * „running", sobald eines unterwegs ist, und „finished", sobald ihr
               * Match entschieden und die Sitzung weg ist. Damit ist der Zustand
               * widerspruchsfrei: „finished" und „es wird gespielt" schließen
               * sich aus.
               *
               * *Warum „running" und nicht „open":* „running" ändert fast
               * nichts — `LobbyManager.join` lehnt ohnehin alles außer „open" ab,
               * also kommt in die wiederbelebte Lobby weiterhin kein fremder
               * Client (beim laufenden Match sind zusätzlich alle Teams besetzt).
               * Genau dieselbe Kennzeichnung trägt eine Lobby, deren Match per
               * `START_MATCH` gestartet wurde. „open" wäre die GRÖSSERE Änderung:
               * Es öffnete die Tür für neue Spieler und stellte die Lobby zurück
               * in den Lobby-Browser (der Client zeigt nur `status === 'open'`) —
               * ein Eintrag, der beim Klick abgelehnt wird, also eine Sackgasse.
               *
               * *„running" meint die MATCHPHASE, nicht die Tick-Schleife:* Auch
               * ein per `START_MATCH` gestartetes Match steht auf „running",
               * während es auf einen Wiederverbinder wartet (`session.laeuft` ist
               * dann `false`, siehe den Socket-`close`-Handler unten). Ein Status,
               * der die Tick-Schleife abbildet, flackerte bei jedem
               * Verbindungsabbruch zwischen „open" und „running" — und ein „open"
               * mitten im Match wäre die nächste Tür, die nicht aufgeht.
               *
               * *Die Gegenprobe steht im selben Test:* „finished" bleibt, wo es
               * hingehört (entschieden, keine Sitzung, niemand da) — und in ein
               * laufendes Match kommt kein fremder Client.
               */
              if (lobby.status === LOBBY_STATUS.FINISHED) this.#lobbies.markRunning(lobbyId);
            }
            /*
             * ============ ENTSCHEIDUNG: erst starten, DANN anmelden ============
             *
             * FUND (belegt, Sonde 2026-09-27): Hier stand `attach` VOR der
             * Startprüfung. `attach` sendet die `lobby_state`-Nachricht MIT
             * `laeuft: this.laeuft` — und in diesem Augenblick lief die Sitzung
             * noch nicht. Gemessen (zwei Teams, je ein Platz, zwei Menschen):
             *
             *     1. Beitritt   → laeuft=false besetzteTeams=1/2
             *     2. Beitritt   → laeuft=false besetzteTeams=2/2   ← DER LETZTE
             *     danach: alleTeamsBesetzt=true, Session läuft=true
             *
             * Genau der letzte Beitretende — der, mit dem das Match beginnt —
             * las damit „Warte auf Mitspieler: 2/2 Teams besetzt", also eine
             * volle Lobby als wartende. Die Anzeige widersprach der Lage.
             *
             * Die Reihenfolge heilt das ohne neue Nachricht: Ist das Match mit
             * diesem Beitritt vollständig, läuft die Sitzung, BEVOR `attach`
             * seinen Zustand meldet — und `laeuft` ist wahr. Der erste
             * Beitretende (Teams noch frei) bekommt weiterhin `false` und damit
             * den ehrlichen Wartehinweis.
             *
             * Die andere Richtung ist ausgeschlossen: Ein Timer kann zwischen
             * `start()` und `attach()` nicht feuern — beide laufen im selben
             * synchronen Durchgang.
             */
            const alleBesetzt = this.#lobbies.alleTeamsBesetzt(lobbyId);
            if (!session.laeuft && alleBesetzt) {
              session.start();
              this.logger.info('lobby_complete', 'Alle Teams besetzt — Match startet', {
                lobbyId,
                teams: lobby.teams,
                unitsPerPlayer: lobby.playersPerTeam,
              });
            }
            session.attach(seat.token, socket);
            if (!session.laeuft) {
              this.logger.info('lobby_waiting', 'Warte auf weitere Spieler', {
                lobbyId,
                teams: lobby.teams,
                besetzt: new Set(lobby.seats.map(entry => entry.teamId)).size,
              });
            }
            // Die Live-Sitzung hat den Plätzen gerade Entity-IDs zugewiesen.
            // Der Rückgabewert von join() ist eine Kopie und daher veraltet —
            // gelesen wird aus `lobby.seats`.
            /*
             * Alle Figuren dieses Beitrags melden — nicht nur die erste.
             *
             * Im Modus der Matcharten gehören demselben Token MEHRERE Figuren
             * (ein ganzes Team). Mit nur einer `entityId` hielte der Client jede
             * andere eigene Figur für fremd: „Du bist nicht am Zug", kein
             * Waffenzugriff, keine Kennzahlen. `entityId` bleibt für ältere
             * Clients erhalten und nennt die erste Figur.
             */
            const eigeneSeats = lobby.seats.filter(entry => entry.token === seat.token);
            socket.send(controlMessage(CONTROL.WELCOME, {
              protocol: PROTOCOL_VERSION,
              lobbyId,
              seed: session.match.seedManager.baseSeed,
              preset: lobby.preset,
              token: seat.token,
              seatIndex: seat.seatIndex,
              entityId: eigeneSeats[0]?.entityId ?? seat.entityId,
              entityIds: eigeneSeats.map(entry => entry.entityId).filter(id => id !== null),
              unitsPerPlayer: lobby.unitsPerPlayer ?? null,
              resumed: seat.resumed,
            }));
            break;
          }

          case CONTROL.START_MATCH: {
            const session = this.#sessions.get(context.lobbyId);
            if (!session) throw new Error('Keine aktive Sitzung');
            /*
             * Starten darf man erst, wenn ALLE Teams besetzt sind.
             *
             * Ohne diese Prüfung ließe sich ein Match starten, in dem auf der
             * gegnerischen Seite niemand ist. Vorher füllte der Bot solche Teams
             * — es gibt aber keine Bot-KI.
             */
            if (!this.#lobbies.alleTeamsBesetzt(context.lobbyId)) {
              this.#fehlerSenden(socket, 'Warte auf Mitspieler: Jedes Team braucht einen Menschen.');
              break;
            }
            this.#lobbies.markRunning(context.lobbyId);
            if (!session.laeuft) session.start();
            session.broadcastSnapshot();
            break;
          }

          case CONTROL.INPUT: {
            const session = this.#sessions.get(context.lobbyId);
            if (!session) throw new Error('Keine aktive Sitzung');
            const result = session.handleInput(context.token, message);
            if (!result.ok) this.#fehlerSenden(socket, result.errors);
            break;
          }

          case CONTROL.SELECT_WEAPON: {
            const session = this.#sessions.get(context.lobbyId);
            if (!session) throw new Error('Keine aktive Sitzung');
            const result = session.handleWeaponSelect(context.token, message.weaponId);
            if (!result.ok) this.#fehlerSenden(socket, result.errors);
            break;
          }

          case CONTROL.JUMP: {
            const session = this.#sessions.get(context.lobbyId);
            if (!session) throw new Error('Keine aktive Sitzung');
            const result = session.handleJump(context.token, message);
            if (!result.ok) this.#fehlerSenden(socket, result.errors);
            break;
          }

          case CONTROL.DROP_WEAPON: {
            const session = this.#sessions.get(context.lobbyId);
            if (!session) throw new Error('Keine aktive Sitzung');
            const result = session.handleDropWeapon(context.token, message.weaponId);
            if (!result.ok) this.#fehlerSenden(socket, result.errors);
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
            this.#fehlerSenden(socket, `Unbekannter Nachrichtentyp: ${String(message.t)}`);
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
        /*
         * Der Grund geht so raus, dass der Client ihn zeigen kann — auch
         * hier: Das Feldpaar `{error, errors}` entsteht in EINER Stelle
         * (`#fehlerNutzlast`), damit eine neue Ablehnung nicht wieder die
         * Form wählt. Siehe die Begründung dort.
         */
        this.#fehlerSenden(socket, error?.message ?? String(error));
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
    // Beide Zeitgeber gehören zu einem laufenden Server; ein stehender soll
    // nicht weiter aufräumen. (Beide sind `unref`t, aber ein offener Zeitgeber
    // nach `close()` wäre ein Leck in Tests.)
    this.stopPruning();
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
function createDistHandler(distDir = 'dist') {
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
  /*
   * ERST den Port binden, DANN den Zustand wiederherstellen.
   *
   * FUND (belegt, gemessen 2026-09-27): Hier stand `restoreState()` VOR
   * `listen()`. Die Wiederherstellung spielt jeden gesicherten Replay-Kern
   * erneut durch — rund 60 ms je gespielter Lobby. Gemessen mit dem Zustand
   * dieses Arbeitsbaums (321 Lobbys, davon 90 mit Replay):
   *
   *     Zeit bis „läuft auf"   5 573 ms   (unbelastet)
   *                            ~9 500 ms  (unter paralleler Last)
   *
   * Ein belegter Port meldete sich deshalb erst NACH der ganzen
   * Wiederherstellung — für den Startenden ein Hänger, keine Fehlermeldung.
   * Gemessen am belegten Port, mit und ohne Zustandsdatei:
   *
   *     ohne PA_STATE_PATH (Repozustand): Exit 1 nach 5 992 ms
   *     mit  PA_STATE_PATH (leer):        Exit 1 nach   301 ms
   *
   * Die Meldung („Port … ist bereits belegt") war die ganze Zeit richtig — sie
   * kam nur zu spät. `listen()` braucht den Zustand nicht: Es bindet den Socket
   * und sonst nichts. Der Test `tests/server-start.test.js:302` wartete 10 s und
   * tötete den Prozess danach mit SIGKILL; sein Exit-Wert war dann die
   * Zeichenkette `timeout` statt der erwarteten 1 — der Befund.
   *
   * Die Umstellung ist gefahrlos, weil `restoreState()` synchron läuft: Zwischen
   * der Zusage von `listen()` und dem Ende der Wiederherstellung gibt es kein
   * `await`, also wird in diesem Fenster keine einzige Anfrage bedient.
   */
  const info = await server.listen(
    options.port ?? Number(process.env.PORT ?? 3000),
    options.host ?? '127.0.0.1',
  );
  const restored = server.restoreState();
  server.startPersistence();
  /*
   * Die Verwaltungsrunde läuft im BETRIEB mit — dort, wo `startServer` benutzt
   * wird (`npm run server`).
   *
   * FUND (belegt, 2026-09-27): `LobbyManager#pruneDisconnected` hatte keinen
   * Aufrufer; ein getrennter Mensch besetzte sein Team dauerhaft, und der
   * nächste bekam „Alle Teams sind besetzt". Wer den Server über `GameServer`
   * selbst startet (Tests, Einbettung), muss `startPruning()` ebenfalls rufen —
   * `tests/server-lobby-verfall.test.js` tut das.
   */
  server.startPruning();
  return { server, restored, ...info };
}

export default GameServer;
