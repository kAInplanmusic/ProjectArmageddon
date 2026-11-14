/**
 * Autoritativer Spielserver (HTTP + WebSocket).
 *
 * Der Server besitzt die Simulation: Clients senden nur Wünsche, der Server
 * validiert sie und verteilt kompakte Binär-Snapshots. Jede Lobby läuft mit
 * fester Zeitschrittweite; die Tick-Schleife ist unabhängig von der
 * Snapshot-Rate, damit Simulation und Netzwerk entkoppelt bleiben.
 *
 * Hier steht nur noch die SERVER-Seite: HTTP/WebSocket, Lobby-Verwaltung und
 * Konten. Die Sitzung einer einzelnen Lobby (Simulation, Snapshots, Eingaben,
 * Sicherung) liegt seit 2026-11-05 in `./lobbySession.js` — ausgezogen, weil
 * diese Datei das Zeilenbudget von 3000 Zeilen riss (§3 AGENTS.md,
 * `tests/zeilenbudget.test.js`). Reine Verschiebung, kein anderes Verhalten.
 *
 * @module gameServer
 */
import { createServer as createHttpServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { leseBauinfo } from './bauinfo.js';
import { clientAdresse, leseVertrauteProxys } from './clientAdresse.js';
import { extname, resolve, sep } from 'node:path';
import { WebSocketServer } from 'ws';
import { LobbyManager, LOBBY_STATUS, istResumeToken } from './lobby.js';
import { createLogger } from './logger.js';
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
  pruefeProtokollversion,
} from '../shared/protocol.js';
import { INPUT_LIMITS } from '../shared/validation.js';
import { SIMULATION_HZ } from '../shared/config/network.js';
import { TokenBucket, RATE_TRENNEN_NACH } from './rateLimit.js';
import { PersistenceStore, serializeLobby, restoreLobby } from './persistence.js';
import { KontoDienst } from './konto.js';
import { baueExternPruefer, baueMeldung, leseSpielGeheimnis, sendeMeldung } from './webAnbindung.js';
import { oeffneSpeicher } from './kontoSpeicher.js';
import { verbuchePartie, rangliste, bestwerte, ranglistenStand, siegquote, kdVerhaeltnis } from './bestenliste.js';
/*
 * Die Sitzungslogik kommt aus dem eigenen Modul. `LobbySession` wird hier nur
 * benutzt; die Re-Exporte darunter halten die Schnittstelle nach außen gleich
 * (`src/server/index.js` und die Tests lesen beide Namen weiter von hier).
 */
import { LobbySession, kartenFelder } from './lobbySession.js';

export { LobbySession, SNAPSHOT_HZ } from './lobbySession.js';

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


export class GameServer {
  /** Obergrenze der Adressen im Verlauf der Lobby-Anlegungen (siehe `#createVerlaufBeschneiden`). */
  static MAX_CREATE_ADRESSEN = 5000;

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
  /** Kontodienst (Rangliste, Login) — erst beim ersten Zugriff geöffnet. */
  #kontenDienst = null;
  #kontenAus = false;
  #kontenPfad = '.pa-state/konten.db';
  #kontenArt = 'auto';
  /** Meldet eine abgeschlossene Partie an die Rangliste. */
  #partieAuswerten = null;

  constructor({
    lobbyManager = new LobbyManager(),
    serveStatic = null,
    persistence = null,
    persistenceIntervalMs = 10_000,
    pruneIntervalMs = PRUNE_INTERVAL_MS,
    logger = null,
    /* Konten: `undefined` = beim ersten Aufruf öffnen, `null` = abgeschaltet, Objekt = fertiger Dienst (Tests). */
    konten = undefined,
    kontenPfad = process.env.PA_KONTEN_PFAD ?? '.pa-state/konten.db',
    kontenArt = process.env.PA_KONTEN_SPEICHER ?? 'auto',
    maxLobbies = Number(process.env.PA_MAX_LOBBYS) || 500,
    maxLobbyAnlegenProMinute = Number(process.env.PA_LOBBYS_PRO_MINUTE) || 30,
    lobbyLeerTtlMs = Number(process.env.PA_LOBBY_LEER_MS) || 15 * 60_000,
    zugPauseTicks = null,
    erlaubteOrigins = leseErlaubteOrigins(process.env.PA_ERLAUBTE_ORIGINS),
    eigenerOrigin = leseErlaubteOrigins(process.env.PA_EIGENER_ORIGIN)?.[0] ?? null,
    bauinfo = leseBauinfo(),
    vertrauteProxys = leseVertrauteProxys(process.env.PA_VERTRAUTE_PROXYS),
  } = {}) {
    /** Versionskennung des ausgelieferten Builds (DEP-1), gemeldet in `/healthz`. */
    this.bauinfo = bauinfo;
    /** Proxys, deren `X-Forwarded-For` für das Lobby-Limit je Adresse zählt (`clientAdresse.js`). */
    this.vertrauteProxys = vertrauteProxys instanceof Set ? vertrauteProxys : leseVertrauteProxys(vertrauteProxys?.join?.(','));
    /**
     * SRV-4: Origin-Prüfung (Lobby-API und WebSocket). `null` (Standard, ohne `PA_ERLAUBTE_ORIGINS`) = wie bisher:
     * CORS spiegelt jeden Origin, der WebSocket nimmt jeden an. Mit Liste: nur diese Origins plus der eigene
     * (Origin = `Host` der Anfrage) bekommen CORS-Freigabe und WebSocket; Anfragen OHNE Origin (Werkzeuge,
     * Server-zu-Server) bleiben erlaubt, denn ein Browser schickt ihn immer mit.
     */
    // Origins vergleicht der Browser klein geschrieben; Einträge wie `https://Spiel.example` passen sonst nie.
    this.erlaubteOrigins = erlaubteOrigins ? new Set(erlaubteOrigins.map(o => String(o).toLowerCase())) : null;
    /**
     * Review 2026-11-04 (DNS-Rebinding): Ohne `PA_EIGENER_ORIGIN` gilt als eigener Origin, was zum `Host`-Header
     * passt — eine fremde Domain, die auf die Server-IP zeigt, schickt aber zueinander passende Header. Mit
     * gesetztem eigenen Origin (z. B. `https://spiel.example`) zählt nur noch er, dem `Host`-Header wird nicht
     * vertraut. Ohne Liste (`PA_ERLAUBTE_ORIGINS`) bleibt der Schalter wirkungslos.
     */
    this.eigenerOrigin = eigenerOrigin ? String(eigenerOrigin).toLowerCase().replace(/\/+$/, '') : null;
    /** Zugpause neuer Sitzungen in Takten (`null` = Vorgabe aus Regel/Umgebung; Tests setzen sie gezielt). */
    this.zugPauseTicks = zugPauseTicks;
    this.maxLobbies = maxLobbies;
    this.maxLobbyAnlegenProMinute = maxLobbyAnlegenProMinute;
    this.lobbyLeerTtlMs = lobbyLeerTtlMs;
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
      // Nachrichten, die die Mengenbegrenzung je Verbindung verworfen hat.
      messagesRateLimited: 0,
      /*
       * Steuernachrichten mit abweichender Protokollversion (SRV-11). Ohne
       * diese Zahl wäre „Client und Server passen nicht zusammen" im Betrieb
       * nicht von einem Netzproblem zu unterscheiden: Die Snapshots werden
       * verworfen, die JSON-Befehle kämen aber weiter an.
       */
      protocolMismatches: 0,
    };
    /** Optionale Persistenz: null deaktiviert das Speichern vollständig. */
    this.persistence = persistence;
    this.persistenceIntervalMs = persistenceIntervalMs;
    this.#persistenceTimer = null;
    /*
     * Konten: Der Dienst wird erst beim ersten Aufruf geöffnet. Ein Server, den
     * niemand nach Konten fragt (Tests, Werkzeuge), legt damit keine Datei an —
     * und ein fehlendes `node:sqlite` stürzt nicht den Spielbetrieb ab, sondern
     * nur die Kontorouten (mit klarer Meldung).
     */
    this.#kontenDienst = typeof konten === 'object' && konten !== null ? konten : null;
    this.#kontenAus = konten === null;
    this.#kontenPfad = kontenPfad;
    this.#kontenArt = kontenArt;
    /** Intervall der Verwaltungsrunde (Tests setzen es klein). */
    this.pruneIntervalMs = pruneIntervalMs;
    this.#createVerlauf = new Map();
    this.#leerBeobachtet = new Map();

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
    /*
     * FUND (belegt, Audit 2026-10-09, A-1/C-1a): Hier stand
     * `new WebSocketServer({ server, path: '/ws' })`. Der ws-Standard puffert
     * bis 100 MiB, BEVOR die 512-Byte-Prüfung aus `validation.js` greift —
     * die Anwendungsgrenze war also eine Absicht ohne Wirkung.
     *
     * 64 KiB deckeln den Puffer um Faktor ~1500 und lassen der App-Prüfung
     * trotzdem den Vortritt: Nachrichten bis 64 KiB bekommen die LESBARE
     * Ablehnung „Nachricht zu groß" (512-Byte-Regel), erst echter Missbrauch
     * darüber wird auf Protokollebene gekappt.
     */
        // Review 2026-11-04: Handshake selbst annehmen statt über das veraltete `verifyClient` (siehe `#nimmUpgrade`).
        this.#wsServer = new WebSocketServer({ noServer: true, maxPayload: 65_536 });
        this.#httpServer.on('upgrade', (anfrage, sock, kopf) => this.#nimmUpgrade(anfrage, sock, kopf));
        // Mit `server:` hing der WebSocket-Server selbst an den HTTP-Fehlern; das bleibt so (Zuhörer unten).
        this.#httpServer.on('error', fehler => this.#wsServer.emit('error', fehler));
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
    this.#wsServer.on('connection', (socket, anfrage) => {
      this.metrics.connections += 1;
      // debug: im Betrieb ist jeder Verbindungsaufbau Rauschen, bei der Fehlersuche
      // ist die Reihenfolge von Verbinden und Trennen aber entscheidend.
      this.logger.debug('client_connected', 'WebSocket-Verbindung geöffnet', {
        connections: this.metrics.connections,
      });
      /*
       * FUND (belegt, Audit 2026-10-09, A-1): Dieser Listener fehlte. Die
       * Bibliothek `ws` emittiert `error` bei Protokollfehlern (z. B. ungültiges
       * UTF-8 in einem Textrahmen). Ohne Listener ist das eine unbehandelte
       * Ausnahme — 4 Bytes beendeten den GESAMTEN Spielserver. Die kaputte
       * Verbindung wird kontrolliert beendet; der Rest läuft weiter.
       */
      socket.on('error', fehler => {
        this.logger.warn('socket_error', 'WebSocket-Verbindung meldet einen Fehler und wird beendet', {
          code: fehler?.code ?? null,
          message: fehler?.message ?? String(fehler),
        });
        socket.terminate();
      });
      socket.once('close', () => {
        this.metrics.disconnections += 1;
        this.logger.debug('client_disconnected', 'WebSocket-Verbindung geschlossen', {
          disconnections: this.metrics.disconnections,
        });
      });
      this.#handleConnection(socket, anfrage?.paKonto ?? null);
    });
  }

  /**
   * Startet die Sitzung, sobald alle Teams besetzt sind.
   *
   * Warteschlange 3.8: Diese Prüfung stand zweimal im Server (JOIN-Pfad und
   * START_MATCH), nur der JOIN-Pfad lief im Livebetrieb. Es gibt jetzt genau
   * EINE Stelle für die Prüfung und den Start.
   *
   * Auch `markRunning` steht HIER (SRV-3, Entscheidung des Auftraggebers
   * 2026-11-02): Vorher setzte nur `START_MATCH` die Lobby auf „running"; ein
   * Start durch den letzten Beitritt ließ sie „open". Zwei Startwege endeten
   * in zwei Zuständen (ein Nachrücker kam nur auf dem einen Weg hinein, die
   * Lobby-Liste zeigte nur die eine). Jetzt enden beide gleich: „running".
   *
   * @returns {boolean} true, wenn das Match GERADE gestartet wurde
   */
  #starteMatchFallsVoll(lobbyId, session) {
    if (!this.#lobbies.alleTeamsBesetzt(lobbyId)) return false;
    if (session.laeuft) return false;
    session.start();
    this.#lobbies.markRunning(lobbyId);
    return true;
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
              onEmpty: id => this.#sitzungBeendet(id),
              replayEntries: options.replayEntries,
              replayTotalTicks: options.replayTotalTicks,
              turnPauseTicks: options.turnPauseTicks,
              turnReplayTicks: options.turnReplayTicks,
              kit: options.kit,
              zerstoerung: options.zerstoerung,
              waffen: options.waffen,
              kisten: options.kisten,
              gelaende: options.gelaende,
              schaden: options.schaden,
              guenther: options.guenther,
              cookie: options.cookie,
              feuer: options.feuer,
              bewegung: options.bewegung,
              zugregeln: options.zugregeln,
              klassen: options.klassen,
              bodenobjekte: options.bodenobjekte,
              seil: options.seil,
              wind: options.wind,
              hagel: options.hagel,
              metrics: this.metrics,
              logger: this.logger,
            });
            this.#sitzungRegistrieren(target.id, session);
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
     * Der früher verbleibende Fall (SRV-2): Ein über `POST /api/lobby/create`
     * angelegter Host-Platz stand von Anfang an auf `connected: true`, auch wenn
     * sich nie ein Socket anmeldete, und verfiel nie. Behoben in
     * `LobbyManager#create`: Der Platz ist bis zum Beitritt mit Token getrennt
     * und verfällt hier nach dem Reconnect-Fenster.
     */
    // Verwaiste Lobbys und Sitzungen räumen (Audit 2026-10-13): Eine Lobby, an der länger als
    // `lobbyLeerTtlMs` kein einziger Socket hing — auch eine nur per HTTP angelegte —, wird samt Sitzung
    // entfernt. Gemessen wurde sonst: 40 Lobbys liefen ewig, ~4,5 MB je Sitzung.
    const sichtbar = new Set();
    for (const lobby of this.#lobbies.all()) {
      sichtbar.add(lobby.id);
      const session = this.#sessions.get(lobby.id);
      if (session && session.clients.size > 0) { this.#leerBeobachtet.delete(lobby.id); continue; }
      const seit = this.#leerBeobachtet.get(lobby.id);
      if (seit === undefined) { this.#leerBeobachtet.set(lobby.id, now); continue; }
      if (now - seit < this.lobbyLeerTtlMs) continue;
      session?.stop();
      this.#sessions.delete(lobby.id);
      this.#beendeteMatches.delete(lobby.id);
      // NET-1: Match-Over-Wiederholung stoppen
      const timerEintrag = this.#matchOverTimer.get(lobby.id);
      if (timerEintrag) { clearInterval(timerEintrag.timer); this.#matchOverTimer.delete(lobby.id); }
      this.#lobbies.close(lobby.id);
      this.#leerBeobachtet.delete(lobby.id);
      this.logger.info('lobby_verwaist_entfernt', 'Lobby ohne Verbindung entfernt', { lobbyId: lobby.id });
    }
    for (const id of this.#leerBeobachtet.keys()) if (!sichtbar.has(id)) this.#leerBeobachtet.delete(id);
    for (const id of this.#beendeteMatches.keys()) if (!sichtbar.has(id)) this.#beendeteMatches.delete(id);
    return entfernt;
  }

  /**
   * Die Sitzung für ein SPIELKOMMANDO — nur wenn die Simulation läuft.
   *
   * Fund (Audit 2026-10-29): Die Kommandos prüften nur, DASS eine Sitzung existiert. Sie entsteht aber
   * schon beim ersten Beitritt und tickt erst, wenn alle Teams besetzt sind (nach einem Neustart: wenn
   * alle wieder verbunden sind). Davor wurden Schüsse, Züge und Aufgaben angenommen und aufgezeichnet,
   * während die Zeit stand — der Gegner sah nichts, das Replay enthielt sie trotzdem.
   *
   * @returns {LobbySession|null} `null`, wenn die Ablehnung schon gesendet wurde
   * @throws {Error} wenn es gar keine Sitzung gibt
   */
  #laufendeSitzung(socket, context) {
    const session = this.#sessions.get(context.lobbyId);
    if (!session) throw new Error('Keine aktive Sitzung');
    if (!session.laeuft) {
      this.#fehlerSenden(socket, ['Das Match läuft noch nicht — es fehlen verbundene Mitspieler']);
      return null;
    }
    return session;
  }

  /** Gehört der Token inzwischen einem ANDEREN Socket als `socket`? Dann ist `socket` veraltet. */
  #neuerSocketBesitztToken(session, token, socket) {
    return Boolean(session) && session.clients.has(token) && session.clients.get(token) !== socket;
  }

  /**
   * Löst die bisherige Platzbindung eines Sockets — EINE Stelle für JOIN und RESUME.
   *
   * Ein zweiter Beitritt oder ein Fortsetzen auf demselben Socket darf nicht
   * zwei Plätze halten (Audit 2026-10-13: der alte Platz blieb „verbunden" und
   * hielt sein Match am Laufen). Der Aufruf steht deshalb vor jedem neuen Binden.
   *
   * FUND (Audit 2026-10-29): `disconnect` lief bedingungslos. Hat der Token
   * inzwischen einen NEUEREN Socket (Wiederverbindung), trennte der veraltete
   * Socket mit seinem zweiten JOIN den Platz des aktiven Spielers. Wie im
   * `close`-Zuhörer darf nur trennen, wem der Token noch gehört.
   *
   * Felder setzen statt das Objekt ersetzen: `context` gehört dem Aufrufer
   * (`#handleConnection`) und wird dort vom `close`-Zuhörer gelesen. Ein
   * `context = {...}` würde nur den Parameter umbiegen (AU-9a/C-8).
   */
  #bisherigenPlatzLoesen(socket, context) {
    if (!context.lobbyId || !context.token) return;
    const alt = this.#sessions.get(context.lobbyId);
    if (!this.#neuerSocketBesitztToken(alt, context.token, socket)) {
      if (alt?.clients.get(context.token) === socket) alt.detach(context.token);
      this.#lobbies.disconnect(context.lobbyId, context.token);
    }
    context.lobbyId = null;
    context.token = null;
  }

  /**
   * Die Sitzung einer Lobby, notfalls neu — gemeinsame Stelle für JOIN und RESUME.
   *
   * Sie entsteht beim ersten Beitritt — aber sie LÄUFT erst, wenn alle Teams von
   * Menschen besetzt sind. Vorher lief sie sofort, und der Server-Bot spielte die
   * freien Teams. Das war falsch: **Es gibt keine Bot-KI.** Teams werden
   * ausschließlich von Menschen gespielt; ein unbesetztes Team ist kein
   * Bot-Team. Bis der letzte Mensch da ist, wartet die Lobby — die Simulation
   * läuft nicht, damit niemand ins Leere zieht.
   *
   * ============ ENTSCHEIDUNG (Fund W5): Status nachziehen ============
   *
   * *Der Befund (gemessen in `tests/server-integration.test.js`):*
   * Beim Match-Ende löscht die Sitzung sich selbst (`#finish` → `onEmpty`); die
   * Lobby und ihre Plätze bleiben stehen. Ein späterer Beitritt mit Token findet
   * keine Sitzung mehr und legt HIER eine neue an — das Match beginnt bei
   * Runde 1. Die Lobby trug dabei weiter „finished" (= entschieden), WÄHREND in
   * ihr gespielt wurde: „es ist vorbei" und „es läuft" zugleich. Wer die Lobby
   * liest, sah eine erledigte Lobby, in der gespielt wird.
   *
   * *Die Entscheidung:* Der Status wird beim Wiederanlauf nachgezogen. Die Lobby
   * ist ein WIEDERSPIEL-Gefäß, kein einmaliges Match. Sie trägt „open", solange
   * kein Match in ihr unterwegs ist, „running", sobald eines unterwegs ist, und
   * „finished", sobald ihr Match entschieden und die Sitzung weg ist. Damit ist
   * der Zustand widerspruchsfrei: „finished" und „es wird gespielt" schließen
   * sich aus.
   *
   * *Warum „running" und nicht „open":* „running" ändert fast nichts —
   * `LobbyManager.join` lehnt ohnehin alles außer „open" ab, also kommt in die
   * wiederbelebte Lobby weiterhin kein fremder Client (beim laufenden Match sind
   * zusätzlich alle Teams besetzt). Genau dieselbe Kennzeichnung trägt eine
   * Lobby, deren Match per `START_MATCH` gestartet wurde. „open" wäre die
   * GRÖSSERE Änderung: Es öffnete die Tür für neue Spieler und stellte die Lobby
   * zurück in den Lobby-Browser (der Client zeigt nur `status === 'open'`) — ein
   * Eintrag, der beim Klick abgelehnt wird, also eine Sackgasse.
   *
   * *„running" meint die MATCHPHASE, nicht die Tick-Schleife:* Auch ein per
   * `START_MATCH` gestartetes Match steht auf „running", während es auf einen
   * Wiederverbinder wartet (`session.laeuft` ist dann `false`, siehe den
   * Socket-`close`-Handler). Ein Status, der die Tick-Schleife abbildet,
   * flackerte bei jedem Verbindungsabbruch zwischen „open" und „running" — und
   * ein „open" mitten im Match wäre die nächste Tür, die nicht aufgeht.
   *
   * *Die Gegenprobe steht im selben Test:* „finished" bleibt, wo es hingehört
   * (entschieden, keine Sitzung, niemand da) — und in ein laufendes Match kommt
   * kein fremder Client.
   */
  #sitzungSicherstellen(lobby) {
    const lobbyId = lobby.id;
    const vorhanden = this.#sessions.get(lobbyId);
    if (vorhanden) return vorhanden;
    const session = new LobbySession(lobby, {
      onEmpty: id => this.#sitzungBeendet(id),
      // Die Auswertung der Partie (Rangliste) läuft beim Match-Ende im Server —
      // nicht über eine Meldung des Clients.
      onMatchEnd: daten => this.#partieVerbuchen(daten),
      ...(this.zugPauseTicks !== null ? { turnPauseTicks: this.zugPauseTicks, turnReplayTicks: 0 } : {}),
      metrics: this.metrics,
      logger: this.logger,
    });
    this.#sitzungRegistrieren(lobbyId, session);
    if (lobby.status === LOBBY_STATUS.FINISHED) this.#lobbies.markRunning(lobbyId);
    return session;
  }

  /**
   * Das `WELCOME` eines Beitrags — EINE Stelle für JOIN und RESUME.
   *
   * Es trägt alles, was der Client zum Aufbau braucht: Seed und Geländefassung
   * (sonst fiele er auf Fassung 1 zurück und die Karte wiche ab), die Krater vor
   * dem Beitritt, den Mahlstrom-Einschnitt, alle eigenen Figuren (Matcharten: ein
   * ganzes Team) — und seit RT-1 den Fortsetzungs-Token.
   *
   * Der Token wird aus dem LIVE-Platz gelesen (`lobby.seats`), nicht aus der
   * Kopie des Beitritts: `#antwort` zieht ihn absichtlich ab, damit er nicht in
   * der HTTP-Antwort landet; hier ist der einzige Weg nach draußen.
   */
  #sendeWillkommen(socket, lobby, session, seat, { resumed }) {
    const eigeneSeats = lobby.seats.filter(entry => entry.token === seat.token);
    const liveSeat = eigeneSeats[0] ?? seat;
    socket.send(controlMessage(CONTROL.WELCOME, {
      protocol: PROTOCOL_VERSION,
      lobbyId: lobby.id,
      seed: session.match.seedManager.baseSeed,
      preset: lobby.preset,
      // Der Client baut die Karte aus Seed UND Fassung: ohne diese Felder fiele er auf Fassung 1 zurück (Hash-Abweichung).
      kartentyp: lobby.kartentyp ?? null,
      ...kartenFelder(lobby),
      ...session.gelaendeFelder(),
      token: seat.token,
      /*
       * RT-1: Der Schlüssel zum Wiedereinstieg. Er kommt bei JEDEM WELCOME mit
       * (auch beim Fortsetzen selbst), damit der Client ihn nach einem
       * Neuladen erneut in `sessionStorage` legen kann.
       */
      resumeToken: liveSeat.resumeToken ?? null,
      seatIndex: liveSeat.seatIndex,
      entityId: eigeneSeats[0]?.entityId ?? seat.entityId,
      entityIds: eigeneSeats.map(entry => entry.entityId).filter(id => id !== null),
      unitsPerPlayer: lobby.unitsPerPlayer ?? null,
      resumed,
      // Bisherige Krater: Wer später beitritt oder wieder verbindet,
      // baut das Gelände aus dem Seed und braucht die Löcher dazu.
      craters: session.match.terrain?.craterLog ?? [],
      // Mahlstrom-Einschnitt (Spalten je Seite), gleiche Begründung.
      inset: session.match.maelstrom?.inset ?? 0,
    }));
  }

  /**
   * Die Sitzung hat sich beendet (`onEmpty`): Ergebnis merken, Sitzung entfernen.
   * @param {string} id - Lobby-ID
   */
  #sitzungBeendet(id) {
    const session = this.#sessions.get(id);
    if (session?.match?.status === 'gameover') {
      this.#beendeteMatches.set(id, { winnerTeamId: session.match.winnerTeamId, rounds: session.match.round });
      // NET-1: Starte periodische Wiederholung von match_over (alle 2 s, max 3×),
      // damit Clients die Meldung auch ohne PING zuverlässig erhalten.
      // WICHTIG: Die Clients der Session holen wir uns JETZT, bevor die Session gelöscht wird.
      const clientsZumSenden = new Map(session.clients);
      this.#starteMatchOverWiederholung(id, clientsZumSenden);
    }
    this.#sessions.delete(id);
    /*
     * RT-1: Mit dem Ende ist der Fortsetzungs-Token dieser Lobby wertlos —
     * es gibt nichts fortzusetzen. Er wird hier entwertet, an der EINEN Stelle,
     * an der eine Sitzung endet (entschieden oder abgebrochen). Der Platz und
     * sein Kommando-Token bleiben stehen; eine Revanche über `JOIN_LOBBY` ist
     * weiter möglich, ein `CONTROL.RESUME` auf das alte Match nicht.
     *
     * Ohne diese Zeile bekäme ein Client, der nach dem Ende neu lädt, über
     * seinen gespeicherten Token ein „fortgesetztes" Match gemeldet, das es
     * nicht mehr gibt — oder schlimmer: die Sitzung würde hier neu angelegt und
     * das entschiedene Spiel begänne von vorn, ohne dass jemand das wollte.
     */
    this.#lobbies.entwerteResumeToken(id);
  }

  /**
   * Startet die periodische Wiederholung von `match_over` für eine Lobby (NET-1).
   * Sendet die Meldung alle 2 s an alle verbundenen Clients, maximal 3-mal.
   * @param {string} lobbyId
   * @param {Map<string, WebSocket>} clientsZumSenden - Clients, die die Meldung erhalten sollen
   */
  #starteMatchOverWiederholung(lobbyId, clientsZumSenden) {
    const ergebnis = this.#beendeteMatches.get(lobbyId);
    if (!ergebnis) return;
    const session = this.#sessions.get(lobbyId);
    // Wenn schon eine neue Sitzung läuft (Revanche), keine Wiederholung für das alte Match.
    if (session?.laeuft) return;

    let count = 0;
    const maxCount = 3;
    const timer = setInterval(() => {
      count += 1;
      const lobby = this.#lobbies.get(lobbyId);
      const ergebnisAktuell = this.#beendeteMatches.get(lobbyId);
      const sessionAktuell = this.#sessions.get(lobbyId);
      // Abbruch: keine Lobby mehr, neues Match läuft, oder Ergebnis gelöscht
      if (!lobby || !ergebnisAktuell || (sessionAktuell && sessionAktuell.laeuft)) {
        clearInterval(timer);
        this.#matchOverTimer.delete(lobbyId);
        return;
      }
      // Sende an alle verbundenen Clients, die zum Match-Ende da waren
      for (const [_token, socket] of clientsZumSenden) {
        if (socket.readyState === 1) {
          socket.send(controlMessage('match_over', {
            winnerTeamId: ergebnisAktuell.winnerTeamId,
            rounds: ergebnisAktuell.rounds,
          }));
        }
      }

      if (count >= maxCount) {
        clearInterval(timer);
        this.#matchOverTimer.delete(lobbyId);
      }
    }, 2000);
    this.#matchOverTimer.set(lobbyId, { timer, count: 0, maxCount });
  }

  /** Neue Sitzung für diese Lobby: ein früheres Ergebnis gilt nicht mehr. */
  #sitzungRegistrieren(id, session) {
    this.#beendeteMatches.delete(id);
    // NET-1: Laufende match_over-Wiederholung für die alte Partie stoppen
    const timerEintrag = this.#matchOverTimer.get(id);
    if (timerEintrag) { clearInterval(timerEintrag.timer); this.#matchOverTimer.delete(id); }
    this.#sessions.set(id, session);
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

  #createVerlauf;
  #leerBeobachtet;
  /**
   * Ergebnis entschiedener Matches je Lobby-ID (`{ winnerTeamId, rounds }`).
   *
   * Beim Match-Ende löscht die Sitzung sich selbst (`#finish` → `onEmpty`). Ohne diese Ablage
   * wüsste der Server danach nicht mehr, wie das Match ausging, und könnte einem Client, der
   * `match_over` verpasst hat, das Ende nicht erneut melden (siehe `CONTROL.PING`).
   * Aufgeräumt wird zusammen mit der Lobby (`pruneLobbies`).
   */
  #beendeteMatches = new Map();

  /**
   * Timer für die periodische Wiederholung von `match_over` (NET-1).
   * Schlüssel: lobbyId, Wert: { timer, count, maxCount }.
   * Die Wiederholung läuft alle 2 s, maximal 3-mal (gesamt ~6 s), damit ein
   * Client, der die erste Meldung verpasst hat, sie zuverlässig erhält.
   */
  #matchOverTimer = new Map();

  /**
   * WebSocket-Handshake (Ersatz für `path` und `verifyClient`): anderer Pfad als `/ws` → 400, fremder Origin
   * (SRV-4, nur mit `PA_ERLAUBTE_ORIGINS`) → 403, sonst Übergabe an den WebSocket-Server.
   */
  #nimmUpgrade(anfrage, sock, kopf) {
    sock.on('error', () => sock.destroy());
    const ablehnen = (code, text) => sock.end(`HTTP/1.1 ${code} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    let pfad = null;
    let url = null;
    try {
      url = new URL(anfrage.url ?? '/', 'http://localhost');
      pfad = url.pathname;
    } catch { /* kaputte URL */ }
    if (pfad !== '/ws') return ablehnen(400, 'Bad Request');
    if (!this.#originErlaubt(anfrage)) return ablehnen(403, 'Forbidden');
    /*
     * Das Sitzungstoken reist im Handshake (`/ws?sitzung=…`), nicht als
     * Kopfzeile: Ein Browser kann bei `new WebSocket()` keine eigenen Header
     * setzen. Der Token ist die Kontokennung, NICHT der Platz-Token aus
     * `JOIN_LOBBY` — beide heißen nur zufällig gleich. Ein unbekannter oder
     * abgelaufener Token ist kein Fehler: Der Client spielt dann als Gast.
     */
    const sitzungToken = url?.searchParams?.get('sitzung') ?? null;
    const konto = sitzungToken ? this.#holeKonten()?.kontoFuerToken(sitzungToken) ?? null : null;
    if (konto) anfrage.paKonto = konto;
    this.#wsServer.handleUpgrade(anfrage, sock, kopf, ws => this.#wsServer.emit('connection', ws, anfrage));
  }

  /** SRV-4: Darf diese Anfrage (HTTP oder WebSocket-Handshake) nach ihrem Origin bedient werden? */
  #originErlaubt(request) {
    if (!this.erlaubteOrigins) return true;
    const origin = request.headers.origin;
    if (!origin) return true;
    const klein = String(origin).toLowerCase();
    if (this.erlaubteOrigins.has(klein)) return true;
    if (this.eigenerOrigin) return klein === this.eigenerOrigin;
    // Gleicher Origin: Der Server liefert das Spiel selbst aus (Produktion single-origin).
    try { return new URL(origin).host === request.headers.host; } catch { return false; }
  }

  /**
   * Der Kontodienst — beim ersten Zugriff geöffnet.
   *
   * Die späte Öffnung hat zwei Gründe: Ein Server, den niemand nach Konten
   * fragt (Tests, Werkzeuge, reine Spielinstanz), legt keine Datei an; und ein
   * fehlendes `node:sqlite` nimmt nur die Kontorouten mit, nicht den
   * Spielbetrieb.
   */
  #holeKonten() {
    if (this.#kontenAus) return null;
    if (this.#kontenDienst) return this.#kontenDienst;
    try {
      const speicher = oeffneSpeicher({ pfad: this.#kontenPfad, art: this.#kontenArt });
      this.#kontenDienst = new KontoDienst({ speicher, logger: this.logger, externPruefer: baueExternPruefer(leseSpielGeheimnis()) });
      this.logger.info('konten_offen', 'Kontospeicher geöffnet', {
        art: speicher.art,
        pfad: speicher.pfad,
      });
    } catch (fehler) {
      this.#kontenAus = true;
      this.logger.error('konten_fehler', 'Kontospeicher konnte nicht geöffnet werden', {
        error: fehler?.message ?? String(fehler),
      });
      return null;
    }
    return this.#kontenDienst;
  }

  /**
   * Kontokennung aus dem `Authorization`-Kopf — nur wenn wirklich ein Token
   * mitkam. Ohne diese Bedingung würde jeder Lobby-Aufruf den Kontospeicher
   * öffnen, auch wenn niemand angemeldet ist.
   */
  #kontoIdAusAnfrage(request) {
    const token = KontoDienst.tokenAusKopfzeilen(request.headers);
    if (!token) return null;
    return this.#holeKonten()?.kontoFuerToken(token)?.id ?? null;
  }

  /** Öffentliche Sicht auf ein Konto (nie der Passworthash, nie der Token). */
  #kontoOeffentlich(konto) {
    return {
      id: konto.id,
      name: konto.name,
      elo: konto.elo,
      partien: konto.partien,
      siege: konto.siege,
      niederlagen: konto.niederlagen,
      siegquote: siegquote(konto),
      kills: konto.kills,
      tode: konto.tode,
      kd: kdVerhaeltnis(konto),
      schaden: konto.schaden,
      schuesse: konto.schuesse,
    };
  }

  /**
   * Verbucht eine abgeschlossene Partie in der Rangliste.
   *
   * Der Server sieht das Match selbst; nichts davon kommt vom Client. Ohne
   * mindestens zwei ANGEMELDETE Menschen verbucht `verbuchePartie` nichts —
   * Gäste und lokale Partien zählen nicht.
   */
  #partieVerbuchen({ lobby, stats }) {
    this.#meldeAnWeb({ lobby, stats });
    const seats = lobby?.seats ?? [];
    if (!seats.some(seat => seat.kontoId)) return;
    const dienst = this.#holeKonten();
    if (!dienst) return;
    const modus = lobby.modus ?? `${lobby.teams}x${lobby.playersPerTeam}`;
    const ergebnis = verbuchePartie({
      speicher: dienst.speicher,
      seats,
      stats,
      lobbyId: lobby.id,
      modus,
      jetzt: Date.now(),
    });
    if (ergebnis.verbucht) {
      this.logger.info('rangliste_verbucht', 'Partie in die Rangliste eingetragen', {
        lobbyId: lobby.id,
        modus,
        teilnehmer: ergebnis.ergebnisse.length,
        ergebnisse: ergebnis.ergebnisse.map(eintrag => ({
          name: eintrag.name, ergebnis: eintrag.ergebnis, elo: eintrag.eloNachher,
        })),
      });
    } else {
      this.logger.info('rangliste_uebersprungen', 'Partie zählt nicht für die Rangliste', {
        lobbyId: lobby.id,
        grund: ergebnis.grund,
      });
    }
  }

  /** Meldet die Partie signiert an die Nutzerdatenbank der Webseite (nur mit Geheimnis und `PA_STATISTIK_URL`). */
  #meldeAnWeb({ lobby, stats }) {
    const url = process.env.PA_STATISTIK_URL;
    const geheimnis = leseSpielGeheimnis();
    if (!url || !geheimnis) return;
    const jetztMs = Date.now();
    const nutzlast = baueMeldung({ lobby, stats, jetztMs });
    if (!nutzlast) return;
    void sendeMeldung({ url, geheimnis, nutzlast, jetztMs }).then(r => {
      this.logger.info('web_statistik', r.ok ? 'Partie an die Webseite gemeldet' : 'Meldung an die Webseite fehlgeschlagen', { lobbyId: lobby.id, status: r.status });
    });
  }

  /**
   * Die Kontorouten.
   *
   * Gibt `null` zurück, wenn der Pfad nicht hierher gehört; sonst
   * `{status, body}`. Die Antwortformen sind absichtlich schlicht (JSON), damit
   * der Client ohne Rahmenwerk auskommt.
   */
  async #kontoRoute(request, url) {
    const pfad = url.pathname;
    const istKonto = pfad === '/api/bestenliste' || pfad === '/api/konto' || pfad.startsWith('/api/konto/');
    if (!istKonto) return null;

    const dienst = this.#holeKonten();
    if (!dienst) return { status: 503, body: this.#fehlerNutzlast('Konten sind auf diesem Server nicht verfügbar') };

    /*
     * Dieselbe Adresse wie beim Lobby-Limit (DEP-3): Hinter einem vertrauten Proxy zählt der
     * letzte `X-Forwarded-For`-Eintrag. Vorher stand hier `request.socket.remoteAddress` —
     * hinter Caddy war das für JEDEN Spieler 127.0.0.1, und die IP-Bremse (40 Anmeldeversuche
     * je 15 min, 20 Registrierungen je 15 min) traf alle gemeinsam statt den einzelnen Absender.
     */
    const ip = clientAdresse(request, this.vertrauteProxys);
    const kopfToken = KontoDienst.tokenAusKopfzeilen(request.headers);

    if (request.method === 'GET' && pfad === '/api/bestenliste') {
      return {
        status: 200,
        body: {
          eintraege: rangliste(dienst.speicher),
          bestwerte: bestwerte(dienst.speicher),
          stand: ranglistenStand(dienst.speicher),
        },
      };
    }

    if (request.method === 'GET' && pfad === '/api/konto') {
      const konto = dienst.kontoFuerToken(kopfToken);
      if (!konto) return { status: 401, body: this.#fehlerNutzlast('Nicht angemeldet') };
      return { status: 200, body: { konto: this.#kontoOeffentlich(konto) } };
    }

    // Ab hier braucht jede Route einen Body (Registrieren, Anmelden, Löschen).
    if (!['POST', 'DELETE'].includes(request.method ?? '')) {
      return { status: 405, body: this.#fehlerNutzlast('Methode nicht erlaubt') };
    }
    const gelesen = await this.#readBody(request);
    if (gelesen.fehler) return { status: 400, body: this.#fehlerNutzlast(gelesen.fehler) };
    const body = gelesen.wert;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return { status: 400, body: this.#fehlerNutzlast('Request-Body muss ein JSON-Objekt sein') };
    }

    if (request.method === 'POST' && pfad === '/api/konto/registrieren') {
      const antwort = await dienst.registrieren({ name: body.name, passwort: body.passwort, ip });
      return this.#kontoAntwort(antwort, 201);
    }

    if (request.method === 'POST' && pfad === '/api/konto/anmelden') {
      const antwort = await dienst.anmelden({ name: body.name, passwort: body.passwort, ip });
      return this.#kontoAntwort(antwort);
    }

    if (request.method === 'POST' && pfad === '/api/konto/abmelden') {
      dienst.abmelden(kopfToken ?? body.token);
      return { status: 200, body: { ok: true } };
    }

    if (request.method === 'DELETE' && pfad === '/api/konto') {
      const antwort = await dienst.loeschen({ token: kopfToken ?? body.token, passwort: body.passwort });
      if (!antwort.ok) return this.#kontoAntwort(antwort);
      return { status: 200, body: { ok: true, geloescht: true } };
    }

    return { status: 404, body: this.#fehlerNutzlast('Nicht gefunden') };
  }

  /** Übersetzt eine Dienstantwort in `{status, body}`. */
  #kontoAntwort(antwort, statusErfolg = 200) {
    if (!antwort.ok) {
      return {
        status: antwort.status ?? 400,
        body: { ...this.#fehlerNutzlast(antwort.fehler ?? 'Unbekannter Fehler'), code: antwort.code ?? null },
      };
    }
    return {
      status: statusErfolg,
      body: { konto: antwort.konto ?? null, token: antwort.token ?? null, laeuftAb: antwort.laeuftAb ?? null },
    };
  }

  async #handleHttp(request, response) {
    const url = new URL(request.url, 'http://localhost');

    // Der Client kann von einem anderen Origin laufen (Dev-Server, CDN).
    // Ohne diese Header blockiert der Browser die Lobby-API.
    // SRV-4: Mit gesetzter Liste bekommt ein fremder Origin keine Freigabe (der Browser sperrt dann die Antwort).
    if (this.#originErlaubt(request)) {
      response.setHeader('Access-Control-Allow-Origin', request.headers.origin ?? '*');
    } else if (request.method === 'OPTIONS' || request.method === 'POST') {
      response.setHeader('Vary', 'Origin');
      return this.#json(response, 403, this.#fehlerNutzlast('Origin nicht erlaubt'));
    }
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');
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
        version: this.bauinfo.version,
        build: { gitSha: this.bauinfo.gitSha, bauzeit: this.bauinfo.bauzeit, quelle: this.bauinfo.quelle },
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
      /*
       * HTTP-1 (Entscheidung des Auftraggebers 2026-11-02): Jeder fehlerhafte Body gibt 400 mit
       * einem KURZEN Grund — ungültiges oder unvollständiges JSON, zu groß, abgebrochen, kein Objekt.
       */
      const gelesen = await this.#readBody(request);
      if (gelesen.fehler) return this.#json(response, 400, this.#fehlerNutzlast(gelesen.fehler));
      const body = gelesen.wert;
      if (body === null || typeof body !== 'object' || Array.isArray(body)) {
        return this.#json(response, 400, this.#fehlerNutzlast('Request-Body muss ein JSON-Objekt sein'));
      }
      // Begrenzung (Audit 2026-10-13): Anzahl offener Lobbys und Anlegen je Adresse und Minute.
      if (this.#lobbies.size >= this.maxLobbies) {
        return this.#json(response, 503, this.#fehlerNutzlast('Zu viele Lobbys — bitte später erneut versuchen'));
      }
      if (!this.#createErlaubt(clientAdresse(request, this.vertrauteProxys))) {
        return this.#json(response, 429, this.#fehlerNutzlast('Zu viele neue Lobbys von dieser Adresse'));
      }
      try {
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
          biom: typeof body.biom === 'string' ? body.biom : null,
          kartenart: typeof body.kartenart === 'string' ? body.kartenart : null,
          orientation: body.orientation ?? 'landscape',
          // Form und Stufe (2026-11-05). Der Lobby-Manager prüft beide tolerant
          // und setzt Unbekanntes auf die Vorgabe 16:9/mittel.
          mapFormat: typeof body.mapFormat === 'string' ? body.mapFormat : null,
          mapSize: typeof body.mapSize === 'string' ? body.mapSize : 'mittel',
          seed: body.seed === undefined || body.seed === '' ? undefined : Number(body.seed),
          hostName: body.name ?? 'Host',
          // Ist der Ersteller angemeldet, trägt sein Platz die Kontokennung —
          // sonst zählte die Partie nicht, obwohl er eingeloggt ist.
          hostKontoId: this.#kontoIdAusAnfrage(request),
          // Der Manager prüft jede Kennung und setzt Unbekanntes auf null —
          // eine ungültige Angabe darf das Anlegen nicht verhindern.
          sidegrades: Array.isArray(body.sidegrades) ? body.sidegrades : null,
          loadouts: Array.isArray(body.loadouts) ? body.loadouts : null,
          fraktionen: Array.isArray(body.fraktionen) ? body.fraktionen : null,
        });
        this.metrics.lobbiesCreated += 1;
        this.logger.info('lobby_created', 'Lobby angelegt', {
          lobbyId: created.lobby.id,
          teams: created.lobby.teams,
          playersPerTeam: created.lobby.playersPerTeam,
          preset: created.lobby.preset,
          kartentyp: created.lobby.kartentyp,
          orientation: created.lobby.orientation,
          mapFormat: created.lobby.mapFormat,
          mapSize: created.lobby.mapSize,
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

    /*
     * Konten und Rangliste. Die Routen liegen in `#kontoRoute`, damit der
     * HTTP-Pfad hier nicht um 150 Zeilen wächst; sie antworten nur auf
     * `/api/konto*` und `/api/bestenliste`.
     */
    const kontoAntwort = await this.#kontoRoute(request, url);
    if (kontoAntwort) return this.#json(response, kontoAntwort.status, kontoAntwort.body);

    if (this.serveStatic) {
      const handled = this.serveStatic(request, response, url);
      if (handled) return;
    }

    this.#json(response, 404, this.#fehlerNutzlast('Nicht gefunden'));
  }

  /** Höchstens `maxLobbyAnlegenProMinute` neue Lobbys je Adresse und Minute. */
  #createErlaubt(adresse, now = Date.now()) {
    const fenster = (this.#createVerlauf.get(adresse) ?? []).filter(t => now - t < 60_000);
    if (fenster.length >= this.maxLobbyAnlegenProMinute) { this.#createVerlauf.delete(adresse); this.#createVerlauf.set(adresse, fenster); return false; }
    fenster.push(now);
    // Löschen + Setzen hält die Map nach „zuletzt benutzt" geordnet (älteste Adresse zuerst).
    this.#createVerlauf.delete(adresse);
    this.#createVerlauf.set(adresse, fenster);
    if (this.#createVerlauf.size > GameServer.MAX_CREATE_ADRESSEN) this.#createVerlaufBeschneiden(now);
    return true;
  }

  /**
   * Hält den Verlauf der Lobby-Anlegungen klein, OHNE Kontingente zu verschenken.
   *
   * Fund (Audit 2026-10-29): `clear()` bei mehr als 5000 Adressen gab JEDER Adresse — auch der
   * des Angreifers, der die Grenze erst ausgelöst hatte — sofort ein frisches Kontingent. Jetzt
   * fallen zuerst Adressen ohne Eintrag im Minutenfenster weg (sie haben ohnehin kein Kontingent
   * verbraucht), danach nur die am längsten unbenutzten.
   */
  #createVerlaufBeschneiden(now) {
    for (const [adresse, zeiten] of this.#createVerlauf) {
      if (!zeiten.some(t => now - t < 60_000)) this.#createVerlauf.delete(adresse);
    }
    for (const adresse of this.#createVerlauf.keys()) {
      if (this.#createVerlauf.size <= GameServer.MAX_CREATE_ADRESSEN) break;
      this.#createVerlauf.delete(adresse);
    }
  }

  /** Liest den Body: `{ wert }` bei Erfolg, `{ fehler }` mit kurzem Grund sonst (HTTP-1). */
  #readBody(request) {
    return new Promise(resolve => {
      let raw = '';
      let zuGross = false;
      request.on('data', chunk => {
        if (zuGross) return;
        raw += chunk;
        if (raw.length > 8192) { zuGross = true; raw = ''; }
      });
      request.on('end', () => {
        /*
         * Leerer Body ist eine gültige Eingabe (der Client sendet keine
         * Felder — alle treffen auf ihre Standardwerte). Ungültiges JSON
         * hingegen ist ein Protokollverletzungsversuch und darf nicht still
         * als {} untergehen: Die Nachbarschaft meldet jeden anderen
         * `catch`-Zweig (siehe §6 in docs/abnahme-bugs-2026-10-01.md).
         */
        // Zu groß oder ungültig: `null` (der Aufrufer lehnt ab), nicht still ein Standard-Body.
        if (zuGross) { resolve({ fehler: 'Request-Body zu groß' }); return; }
        if (!raw) {
          resolve({ wert: {} });
          return;
        }
        try {
          resolve({ wert: JSON.parse(raw) });
        } catch (error) {
          this.logger.warn('http_body_invalid', 'Ungültiger JSON-Request-Body', {
            path: request.url,
            method: request.method,
            error: error.message,
          });
          resolve({ fehler: 'Ungültiges JSON im Request-Body' });
        }
      });
      request.on('error', error => {
        this.logger.warn('http_body_error', 'Fehler beim Lesen des Request-Bodys', {
          path: request.url,
          method: request.method,
          error: error.message,
        });
        // Unvollständig gelesen: ablehnen, nicht still durch einen Standard-Body ersetzen.
        resolve({ fehler: 'Request-Body unvollständig' });
      });
      // Abgebrochene Anfrage ohne `end`: sonst bliebe das Versprechen offen.
      request.on('close', () => {
        if (!request.complete) resolve({ fehler: 'Request-Body unvollständig' });
      });
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

  #handleConnection(socket, konto = null) {
    // Der Aufrufer haelt dieses Objekt; die Nachrichtenstrecke setzt nur seine
    // Felder (`context.lobbyId` / `context.token`), sie ersetzt es nicht.
    // `konto` ist die Kontokennung aus dem Handshake (oder null = Gast).
    const context = { lobbyId: null, token: null, konto };
    // Ohne diesen Zuhörer beendet ein Socket-Fehler (z. B. zu große Nachricht, `maxPayload`) als UNBEHANDELTE
    // Ausnahme den ganzen Prozess. `ws` schließt die Verbindung danach selbst (1009).
    socket.on('error', error => {
      this.logger.warn('ws_socket_fehler', 'Socket-Fehler — Verbindung wird geschlossen', { error: error.message });
    });

    const mengenGrenze = new TokenBucket();
    socket.on('message', (raw, isBinary) => {
      this.#nachrichtBehandeln(socket, raw, isBinary, context, mengenGrenze);
    });

    socket.on('close', () => {
      if (!context.lobbyId || !context.token) return;
      const session = this.#sessions.get(context.lobbyId);
      // Hat dieser Token inzwischen einen NEUEREN Socket, ist dies ein veraltetes close (Audit 2026-10-13).
      if (this.#neuerSocketBesitztToken(session, context.token, socket)) return;
      session?.detach(context.token);
      this.#lobbies.disconnect(context.lobbyId, context.token);
      // B-9: Verbliebene Spieler müssen erfahren, dass ein Mitspieler getrennt ist.
      // Nach dem `disconnect` senden wir den aktualisierten Lobbyzustand an alle
      // noch verbundenen Clients, damit die Anzeige (z. B. „Warte auf Mitspieler")
      // sofort stimmt und nicht erst beim nächsten Tick aktualisiert wird.
      session?.broadcastLobbyState();
      const lobby = this.#lobbies.get(context.lobbyId);
      if (lobby && lobby.seats.every(seat => !seat.connected)) {
        session?.stop();
      }
    });
  }

  /**
   * Die Nachrichtenstrecke EINER Verbindung — Waechter, Auswertung, Weiterreichen.
   *
   * Aus `#handleConnection` herausgezogen (AU-9a/C-8): der Zuhoerer war 410 der 440
   * Zeilen jener Methode, und `#handleConnection` vermischte drei Aufgaben —
   * Verbindung verdrahten, Nachrichten pruefen, Befehle ausfuehren.
   *
   * Die Reihenfolge der Waechter ist Absicht und bleibt: Mengengrenze VOR dem
   * Parsen, Nutzlastgrenze VOR dem Parsen, dann erst `parseControlMessage`.
   *
   * @param {object} socket - Die WebSocket-Verbindung
   * @param {Buffer|string} raw - Der rohe Rahmen
   * @param {boolean} isBinary - Ob der Rahmen binaer kam
   * @param {{lobbyId: string|null, token: string|null}} context - Wird hier GEFUELLT
   * @param {TokenBucket} mengenGrenze - Eimer dieser Verbindung
   */
  #nachrichtBehandeln(socket, raw, isBinary, context, mengenGrenze) {
    /*
     * Mengenbegrenzung VOR allem anderen — auch vor dem Parsen. Verworfene
     * Nachrichten bekommen KEINE Antwort (sonst wäre die Fehlermeldung die
     * Verstärkung); sichtbar wird es über Zähler und Log. Wer dauerhaft
     * überzieht, wird getrennt.
     */
    if (!mengenGrenze.erlaube()) {
      if (this.metrics) this.metrics.messagesRateLimited += 1;
      // Nur beim Eintritt in die Überlast melden (Überhang 0 → 1), nicht bei jedem Verwurf der Flut.
      if (mengenGrenze.ueberhang === 1) {
        this.logger.warn('rate_limited', 'Nachrichten über der Mengengrenze verworfen', {
          lobbyId: context.lobbyId,
        });
      }
      if (mengenGrenze.ueberhang >= RATE_TRENNEN_NACH) {
        this.logger.warn('rate_limit_disconnect', 'Verbindung wegen Dauerüberlast getrennt', {
          lobbyId: context.lobbyId,
        });
        socket.close(1008, 'Zu viele Nachrichten');
      }
      return;
    }
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

    /*
     * Version der Steuernachricht prüfen (SRV-11).
     *
     * Das `v`-Feld war bisher nur Beiwerk: Der Server las es nie. Ein Client
     * mit anderer Fassung bekam damit widersprüchliches Verhalten — seine
     * Binär-Snapshots wurden wegen der Version abgelehnt, seine JSON-Befehle
     * aber ausgeführt. Die Prüfung steht VOR dem `switch`, weil sie für jeden
     * Typ gilt. Fehlt `v` (ältere Werkzeuge, Aufzeichnungen), bleibt die
     * Nachricht gültig; nur eine ausdrücklich ANDERE Zahl wird abgewiesen.
     */
    const version = pruefeProtokollversion(message.v);
    if (version) {
      this.metrics.protocolMismatches += 1;
      this.logger.warn('protocol_mismatch', 'Steuernachricht mit abweichender Protokollversion abgewiesen', {
        messageType: message.t,
        gemeldet: version.gemeldet,
        erwartet: version.erwartet,
        lobbyId: context.lobbyId,
      });
      this.#fehlerSenden(socket, version.text);
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
          // Ein zweiter Beitritt auf demselben Socket löst die alte Zuordnung.
          this.#bisherigenPlatzLoesen(socket, context);
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
          const seat = this.#lobbies.join(lobbyId, {
            /*
             * Angemeldet: Der Name kommt aus dem KONTO, nicht aus der
             * Nachricht. Sonst könnte ein angemeldeter Spieler unter fremdem
             * Namen in der Lobby stehen — und die Rangliste würde einen Namen
             * führen, den er nicht besitzt.
             */
            name: context.konto?.name ?? message.name ?? 'Spieler',
            token: message.token ?? null,
            kontoId: context.konto?.id ?? null,
          });
          // Felder setzen statt Objekt ersetzen — siehe die Anmerkung beim
          // Verlassen der Lobby oben. Der Aufrufer haelt dasselbe Objekt.
          context.lobbyId = lobbyId;
          context.token = seat.token;
          const session = this.#sitzungSicherstellen(lobby);
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
          const gestartet = this.#starteMatchFallsVoll(lobbyId, session);
          if (gestartet) {
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
          // das WELCOME liest die Figuren deshalb aus `lobby.seats`
          // (`#sendeWillkommen`), inklusive aller Figuren dieses Beitrags.
          this.#sendeWillkommen(socket, lobby, session, seat, { resumed: seat.resumed });
          break;
        }

        case CONTROL.RESUME: {
          /*
           * ============ RT-1: Fortsetzen nach Neuladen ============
           *
           * Der Token ist ein Schlüssel, keine Identität: Er zeigt auf einen
           * bestehenden Platz, und dieser Platz behält seinen `token`. Der neue
           * Socket wird nur an ihn gebunden — dieselbe Bindung, die eine
           * Wiederverbindung über `JOIN_LOBBY` herstellt. Deshalb ist der Zug
           * danach unberührt: Kein Platz entsteht, keiner fällt weg, und die
           * Simulation bekommt von diesem Vorgang nichts mit.
           *
           * Die Reihenfolge ist dieselbe wie beim Beitritt (Fund Sonde
           * 2026-09-27): erst die Verwaltungsrunde (damit ein ABGELAUFENES
           * Reconnect-Fenster den Token wirklich ungültig macht), dann binden,
           * dann melden. `attach` setzt `lobby_state` ab und verwirft die
           * Delta-Basis des Tokens (SRV-9); der Vollsnapshot darunter kommt aus
           * `broadcastSnapshot`, das für einen Empfänger ohne Basis ohnehin
           * einen Vollsnapshot encoded. Damit rendert der Client sofort weiter,
           * statt bis zum nächsten 2-s-Vollsnapshot auf einem alten Bild zu
           * stehen.
           */
          this.#bisherigenPlatzLoesen(socket, context);
          this.pruneLobbies();
          const treffer = this.#lobbies.resume(message.token);
          if (!treffer) {
            /*
             * Ablehnung mit GRUND — der Client entscheidet danach:
             * `unbekannt` → normaler Beitritt (mit dem bekannten Platz-Token,
             * falls vorhanden), `beendet` → Menü, `ungueltig` → Menü.
             *
             * Die Unterscheidung „beendet" braucht die Lobby: Der Token selbst
             * ist nach dem Entwerten nicht mehr zuzuordnen. Deshalb darf der
             * Client seine `lobbyId` mitschicken; fehlt sie, bleibt es bei
             * `unbekannt` — die sichere Annahme, denn sie führt nur zum
             * normalen Beitritt, nicht zu einem neuen Match.
             */
            const genannt = typeof message.lobbyId === 'string' ? this.#lobbies.get(message.lobbyId) : null;
            const beendet = genannt?.status === LOBBY_STATUS.FINISHED
              || (typeof message.lobbyId === 'string' && this.#beendeteMatches.has(message.lobbyId));
            const grund = !istResumeToken(message.token)
              ? 'ungueltig'
              : (beendet ? 'beendet' : 'unbekannt');
            const text = grund === 'beendet'
              ? 'Diese Partie ist beendet — Fortsetzen ist nicht mehr möglich'
              : (grund === 'ungueltig'
                ? 'Ungültiger Fortsetzungs-Token'
                : 'Fortsetzungs-Token unbekannt oder abgelaufen');
            this.logger.info('resume_abgelehnt', 'Fortsetzen abgelehnt', {
              grund,
              lobbyId: message.lobbyId ?? null,
              // Nur die FORM des Tokens, nie sein Wert.
              tokenForm: typeof message.token === 'string' ? message.token.length : typeof message.token,
            });
            if (socket.readyState === 1) {
              socket.send(controlMessage(CONTROL.RESUME_FAILED, {
                grund,
                ...this.#fehlerNutzlast(text),
              }));
            }
            break;
          }

          const { lobby, seat } = treffer;
          context.lobbyId = lobby.id;
          context.token = seat.token;
          const session = this.#sitzungSicherstellen(lobby);
          /*
           * `#starteMatchFallsVoll` auch hier: Kommt der letzte fehlende Mensch
           * über RESUME zurück (etwa nach einem Neuladen), muss das Match
           * starten — genau wie beim Beitritt. Es startet nichts, was nicht
           * schon vollständig besetzt ist.
           */
          const gestartet = this.#starteMatchFallsVoll(lobby.id, session);
          if (gestartet) {
            this.logger.info('lobby_complete', 'Alle Teams besetzt — Match startet', {
              lobbyId: lobby.id,
              teams: lobby.teams,
              unitsPerPlayer: lobby.playersPerTeam,
            });
          }
          session.attach(seat.token, socket);
          this.#sendeWillkommen(socket, lobby, session, seat, { resumed: true });
          // Sofort ein Zustandstakt: Der Client soll weiterrendern, nicht auf
          // den nächsten regulären Snapshot warten. `attach` hat die Delta-Basis
          // dieses Tokens verworfen, also geht ein VOLLsnapshot raus.
          session.broadcastSnapshot();
          this.logger.info('resume', 'Sitzung fortgesetzt', {
            lobbyId: lobby.id,
            seatIndex: seat.seatIndex,
            laeuft: session.laeuft,
          });
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
           * — es gibt aber keine Bot-KI. Die Prüfung selbst lebt in
           * `#starteMatchFallsVoll` (Warteschlange 3.8: eine Stelle).
           */
          const gestartet = this.#starteMatchFallsVoll(context.lobbyId, session);
          if (!gestartet && !session.laeuft) {
            this.#fehlerSenden(socket, 'Warte auf Mitspieler: Jedes Team braucht einen Menschen.');
            break;
          }
          this.#lobbies.markRunning(context.lobbyId);
          session.broadcastSnapshot();
          break;
        }

        case CONTROL.INPUT: {
          const session = this.#laufendeSitzung(socket, context);
          if (!session) break;
          const result = session.handleInput(context.token, message);
          if (!result.ok) this.#fehlerSenden(socket, result.errors);
          break;
        }

        case CONTROL.SELECT_WEAPON: {
          const session = this.#laufendeSitzung(socket, context);
          if (!session) break;
          const result = session.handleWeaponSelect(context.token, message.weaponId);
          if (!result.ok) this.#fehlerSenden(socket, result.errors);
          break;
        }

        case CONTROL.JUMP: {
          const session = this.#laufendeSitzung(socket, context);
          if (!session) break;
          const result = session.handleJump(context.token, message);
          if (!result.ok) this.#fehlerSenden(socket, result.errors);
          break;
        }

        case CONTROL.MOVE: {
          const session = this.#laufendeSitzung(socket, context);
          if (!session) break;
          const result = session.handleMove(context.token, message);
          if (!result.ok) this.#fehlerSenden(socket, result.errors);
          break;
        }

        case CONTROL.SEIL: {
          const session = this.#laufendeSitzung(socket, context);
          if (!session) break;
          const result = session.handleSeil(context.token, message);
          if (!result.ok) this.#fehlerSenden(socket, result.errors);
          break;
        }

        case CONTROL.SKIP_PAUSE: {
          const session = this.#laufendeSitzung(socket, context);
          if (!session) break;
          const result = session.handleSkipPause(context.token);
          if (!result.ok) this.#fehlerSenden(socket, result.errors);
          break;
        }

        case CONTROL.SKIP_TURN:
        case CONTROL.SURRENDER: {
          const session = this.#laufendeSitzung(socket, context);
          if (!session) break;
          const result = message.t === CONTROL.SURRENDER ? session.handleSurrender(context.token) : session.handleSkipTurn(context.token);
          if (!result.ok) this.#fehlerSenden(socket, result.errors);
          break;
        }

        case CONTROL.DROP_WEAPON: {
          const session = this.#laufendeSitzung(socket, context);
          if (!session) break;
          const result = session.handleDropWeapon(context.token, message.weaponId);
          if (!result.ok) this.#fehlerSenden(socket, result.errors);
          break;
        }

        case CONTROL.TERRAIN_REQUEST: {
          // Der Client hat eine Abweichung gemessen und baut die Karte neu.
          const session = this.#sessions.get(context.lobbyId);
          if (!session) throw new Error('Keine aktive Sitzung');
          socket.send(controlMessage(CONTROL.TERRAIN_STATE, session.terrainStand(true)));
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
            /*
             * Fund (Audit 2026-10-29): `#finish` löscht die Sitzung über `onEmpty` im selben Schritt;
             * die Abfrage auf `#sessions` fand nach dem Ende nie etwas, die Wiederholung lief nie.
             * Das Ergebnis liegt deshalb in `#beendeteMatches`. Gibt es eine NEUE Sitzung
             * (Wiederspiel), gilt ihr Zustand, nicht das alte Ergebnis.
             */
            const live = this.#sessions.get(context.lobbyId);
            const ergebnis = live
              ? (live.match?.status === 'gameover' ? { winnerTeamId: live.match.winnerTeamId, rounds: live.match.round } : null)
              : (this.#beendeteMatches.get(context.lobbyId) ?? null);
            if (ergebnis) {
              socket.send(controlMessage('match_over', {
                winnerTeamId: ergebnis.winnerTeamId,
                rounds: ergebnis.rounds,
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
  }

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
    // NET-1: Alle laufenden match_over-Wiederholungen stoppen
    for (const eintrag of this.#matchOverTimer.values()) clearInterval(eintrag.timer);
    this.#matchOverTimer.clear();
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
    // Deploy-Plan 2026-11-04: Der Build enthält WebP, MP3, Webfonts und das Manifest; als
    // `application/octet-stream` (bisher) blockt ein Proxy mit `nosniff` je nach Browser Schrift/Ton.
    '.webp': 'image/webp',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.webmanifest': 'application/manifest+json',
    '.txt': 'text/plain; charset=utf-8',
  };

  return (request, response, url) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') return false;

    let relative;
    try {
      relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    } catch {
      return false; // fehlerhafte Prozentkodierung (URIError) ist keine Datei
    }
    if (relative.includes('\0')) return false;
    const candidate = resolve(root, relative === '' ? 'index.html' : relative);

    /*
     * Pfadausbruch verhindern.
     *
     * Fund (Audit 2026-10-29): `candidate.startsWith(root)` ohne Trenner ließ
     * `<cwd>/dist-old/…` durch, weil `<cwd>/dist` ein Präfix davon ist; ein
     * kodiertes `..%2Fdist-old%2Fgeheim.json` wird erst NACH dem Parsen der URL zu `../`.
     * Erlaubt ist nur das Wurzelverzeichnis selbst oder ein Pfad darunter.
     */
    if (candidate !== root && !candidate.startsWith(root + sep)) return false;

    let filePath = candidate;
    try {
      if (!statSync(filePath).isFile()) return false;
    } catch {
      // SPA-Fallback: unbekannte Pfade ohne Endung erhalten index.html.
      if (relative.includes('.')) return false;
      /*
       * Nicht für die API (SRV-1): `GET /api/<unbekannt>` lieferte bei gebautem
       * `dist/` 200 + index.html. Ein API-Aufrufer liest dann HTML als JSON und
       * sieht „Erfolg" statt „gibt es nicht". Unter `/api` antwortet der Aufrufer
       * mit 404 und der JSON-Fehlernutzlast.
       */
      if (relative === 'api' || relative.startsWith('api/')) return false;
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

/**
 * SRV-4: `PA_ERLAUBTE_ORIGINS` (kommagetrennt, z. B. `https://spiel.example,http://127.0.0.1:5173`) als Liste;
 * leer oder nicht gesetzt = `null` (keine Prüfung, Verhalten wie bisher).
 *
 * @param {string|undefined} roh
 * @returns {string[]|null}
 */
export function leseErlaubteOrigins(roh) {
  const liste = String(roh ?? '').split(',').map(s => s.trim().replace(/\/+$/, '').toLowerCase()).filter(Boolean);
  return liste.length ? liste : null;
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
