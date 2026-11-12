/**
 * Lobby-Sitzung: Simulation, Snapshots, Eingaben und Persistenz EINER Lobby.
 *
 * Ausgezogen aus `gameServer.js` (2026-11-05), weil dessen Zeilenbudget von
 * 3000 Zeilen gerissen war (§3 AGENTS.md, `tests/zeilenbudget.test.js`). Der
 * Code ist unverändert umgezogen: kein Verhalten, keine Ausgabe, keine Regel
 * wurde angefasst.
 *
 * Drin ist alles, was zu genau EINER Partie gehört — die Tick-Schleife, der
 * Snapshot-Aufbau (Delta und Vollsnapshot), die Eingabeprüfung je Sitz, die
 * Munitions-/Loadout-Tabelle, das Match-Ende und die Sicherung
 * (`toPersisted`) samt Wiederaufbau aus dem Replay. Mit umgezogen sind die
 * Konstanten, die nur hier gelten (Zugpause, Snapshot-Rate und -Intervall,
 * Munitionsvermerk, Dedup-Arten): Sie gehören zur Sitzung, nicht zum Server.
 *
 * `gameServer.js` importiert `LobbySession` und `kartenFelder` von hier und
 * re-exportiert `LobbySession` und `SNAPSHOT_HZ`, damit die Schnittstelle nach
 * außen gleich bleibt. Diese Datei importiert `gameServer.js` NICHT — sonst
 * entstünde ein Zyklus.
 *
 * @module lobbySession
 */
import { MatchController } from '../engine/match.js';
import { kistenInhalt } from '../engine/kistenSicht.js';
import { LOBBY_STATUS } from './lobby.js';
import { SnapshotHistory } from './lagCompensation.js';
import {
  CONTROL,
  controlMessage,
  encodeSnapshot,
  toDeltaBase,
  EreignisSendefilter,
} from '../shared/protocol.js';
import { validateCommand, pruefeSeilEingabe } from '../shared/validation.js';
import { SIMULATION_HZ, TICK_MS } from '../shared/config/network.js';
import { MATCH_RULES } from '../shared/config/match.js';
import { stoffHash } from '../shared/stoffkarte.js';
import { feuerStandNutzlast } from '../shared/feuerStand.js';
import { ReplayRecorder } from '../engine/replay.js';
import { MatchStats } from '../shared/stats.js';
import { TokenBucket } from './rateLimit.js';
import { serializeLobby } from './persistence.js';
import { GUENTHER_FASSUNG_STANDARD } from '../shared/config/guenther.js';
import { COOKIE_STANDARD } from '../shared/config/cookie.js';
import { FEUER_STANDARD } from '../shared/config/feuer.js';
import { BEWEGUNG_STANDARD, BEWEGUNG } from '../shared/config/bewegung.js';
import { KLASSEN_STANDARD } from '../shared/config/klassen-fassung.js';
import { BODENOBJEKTE_STANDARD } from '../shared/config/bodenobjekte.js';
import { SEIL_STANDARD, SEIL } from '../shared/config/seil.js';
import { WIND_STANDARD } from '../shared/config/wind.js';
import { ZUGREGELN_STANDARD, ZUGREGELN } from '../shared/config/zugregeln.js';

/**
 * Kartenfelder einer Lobby für Nachrichten an den Client.
 *
 * `orientation` bleibt für den Altcode (und alte Clients); `mapFormat`/`mapSize`
 * sind die Angaben seit 2026-11-05 und bestimmen Maße UND Zugzeit. Eine
 * gesicherte Lobby von vorher hat die Felder nicht — dann gelten die Vorgaben.
 */
export function kartenFelder(lobby) {
  return {
    orientation: lobby.orientation ?? 'landscape',
    mapFormat: lobby.mapFormat ?? '16:9',
    mapSize: lobby.mapSize ?? 'mittel',
  };
}

/** Zugpause vor jedem Zug (siehe `MATCH_RULES.turnPauseSeconds`). */
// `PA_ZUGPAUSE_SEKUNDEN` überschreibt die Vorgabe (Tests und Lasttests spielen ohne Pause).
const ZUGPAUSE_TICKS = Math.round(
  (Number.isFinite(Number(process.env.PA_ZUGPAUSE_SEKUNDEN)) && process.env.PA_ZUGPAUSE_SEKUNDEN !== undefined && process.env.PA_ZUGPAUSE_SEKUNDEN !== ''
    ? Number(process.env.PA_ZUGPAUSE_SEKUNDEN)
    : MATCH_RULES.turnPauseSeconds) * SIMULATION_HZ,
);

export const SNAPSHOT_HZ = 20;
const SNAPSHOT_INTERVAL_MS = 1000 / SNAPSHOT_HZ;
/**
 * Vermerk für unbegrenzte Munition. Muss mit `getState()` im MatchController
 * übereinstimmen — der Client prüft auf genau diesen Text.
 */
const UNLIMITED_AMMO = 'unbegrenzt';

/** Ereignisarten, die den Takt (`tk`) für den Dedup-Schlüssel des Clients mitbekommen. */
const DEDUP_EREIGNISARTEN = new Set(['explosion', 'terrain_detached', 'terrain_settled']);
/** Nach so vielen Snapshots geht wieder ein Vollsnapshot raus (Resync). */
const FULL_SNAPSHOT_INTERVAL = SNAPSHOT_HZ * 2;

export class LobbySession {
  /** Wurde das Match-Ende schon gemeldet? Siehe #finish. */
  #finished = false;
  /**
   * Läuft gerade ein `stepSimulation` aus der Zeitschleife?
   *
   * Dann dürfen die Ereignisse am Match-Ende NICHT hier ausgewertet werden:
   * `#takt` liefert sie direkt danach an die Clients, und wer sie vorher
   * abholt, verschluckt „aufgegeben" und „death" (die Clients sähen nur noch
   * „match_over").
   */
  #imTakt = false;
  /** Geh-Nachrichtengrenze je Sitz (Entity-Id), siehe `handleMove`. */
  #gehGrenzen = new Map();
  /** Seil-Nachrichtengrenze je Sitz (Entity-Id), siehe `handleSeil`. */
  #seilGrenzen = new Map();
  #zugAktionZeit = new Map();

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
    onEmpty, onMatchEnd = null, replayEntries = null, replayTotalTicks = 0, metrics = null, logger = null,
    turnPauseTicks = null, turnReplayTicks = null, kit = undefined, zerstoerung = undefined, waffen = undefined, kisten = undefined, schaden = undefined, gelaende = undefined, guenther = GUENTHER_FASSUNG_STANDARD, cookie = COOKIE_STANDARD, feuer = FEUER_STANDARD, bewegung = BEWEGUNG_STANDARD, zugregeln = ZUGREGELN_STANDARD, klassen = KLASSEN_STANDARD, bodenobjekte = BODENOBJEKTE_STANDARD, seil = SEIL_STANDARD, wind = WIND_STANDARD,
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
      // Kartenform und -stufe (2026-11-05): Sie bestimmen Maße und Zugzeit.
      format: lobby.mapFormat ?? null,
      groesse: lobby.mapSize ?? 'mittel',
      /*
       * Sidegrades aus der Lobby-Konfiguration. Die Wahl kommt vom Ersteller
       * (`POST /api/lobby/create`) und ist Teil der Match-Konfiguration —
       * derselbe Weg wie `preset`. Der Server validiert sie in `lobby.js`
       * gegen `SIDEGRADE_IDS`; was hier ankommt, ist bereits geprüft.
       */
      sidegrades: Array.isArray(lobby.sidegrades) ? lobby.sidegrades : null,
      // Klassenwahl je Platz — wie die Sidegrades Teil der Konfiguration.
      loadouts: Array.isArray(lobby.loadouts) ? lobby.loadouts : null,
      // Ausrüstung: Standard = Start-Kit; eine alte Sicherung bringt ihre Fassung mit (`undefined` = Standard).
      kit,
      zerstoerung,
      waffen,
      kisten,
      gelaende,
      biom: lobby.biom ?? null,
      kartenart: lobby.kartenart ?? null,
      schaden,
      guenther,
      cookie,
      feuer,
      bewegung,
      zugregeln,
      klassen,
      bodenobjekte,
      seil,
      wind,
      // Aus der Sicherung, wenn vorhanden: Eine wiederhergestellte Partie spielt mit der Pause, mit der
      // sie aufgezeichnet wurde (Audit 2026-10-13: Wechsel der Umgebungsvariable ließ den Hash abweichen).
      turnPauseTicks: turnPauseTicks ?? ZUGPAUSE_TICKS,
      turnReplayTicks: turnReplayTicks ?? (ZUGPAUSE_TICKS > 0 ? Math.round(MATCH_RULES.turnReplaySeconds * SIMULATION_HZ) : 0),
    });
    this.match.start();

    /**
     * Spielerkennzahlen dieser Partie — vom SERVER geführt, nicht vom Client
     * gemeldet (AGENTS.md §6). Sie kommen aus denselben Ereignissen, die auch an
     * die Clients gehen (`MatchStats`, `src/shared/stats.js`), und sind damit
     * nicht fälschbar: Was kein Ereignis erzeugt hat, ist nicht passiert.
     *
     * Sie sind die Grundlage der Rangliste (`#finish` → `onMatchEnd`).
     */
    this.stats = new MatchStats({ teams: this.#teamkarte() });

    /** Aufzeichnung für Persistenz und Replay. */
    this.recorder = new ReplayRecorder({
      // Uhr von außen: `src/engine` liest die Wanduhr nicht selbst (AGENTS.md §2).
      erstelltAm: Date.now(),
      seed: this.match.seedManager.baseSeed,
      teams: lobby.teams,
      playersPerTeam: lobby.playersPerTeam,
      preset: lobby.preset,
      kartentyp: lobby.kartentyp ?? null,
      orientation: lobby.orientation ?? 'landscape',
      // Form und Stufe in den Kopf: Ohne sie spielte die Wiedergabe eine andere
      // Karte — und seit Fassung 2 auch mit einer anderen Zugzeit.
      format: this.match.mapFormat,
      groesse: this.match.groesse,
      maxRounds: this.match.maxRounds,
      turnDurationMs: this.match.turnDurationMs,
      turnPauseTicks: this.match.turnPauseTicks,
      turnReplayTicks: this.match.turnReplayTicks,
      // Ohne diesen Eintrag spielte eine Wiedergabe ein Match OHNE Sidegrades
      // und liefe ab dem ersten Schuss auseinander.
      sidegrades: this.match.sidegrades,
      // Dasselbe gilt für die Klassenwahl: Ohne sie im Kopf spielte die
      // Wiedergabe die Standardzuteilung statt der gewählten Profile.
      loadouts: this.match.loadouts,
      kit: this.match.kit,
      zerstoerung: this.match.zerstoerung,
      waffen: this.match.waffen,
      kisten: this.match.kisten,
      gelaende: this.match.gelaende,
      biom: lobby.biom ?? null,
      kartenart: lobby.kartenart ?? null,
      schaden: this.match.schaden,
      guenther: this.match.guenther,
      cookie: this.match.cookie,
      feuer: this.match.feuer,
      bewegung: this.match.bewegung,
      zugregeln: this.match.zugregeln,
      klassen: this.match.klassen,
      bodenobjekte: this.match.bodenobjekte,
      seil: this.match.seil,
      wind: this.match.windFassung,
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
    this.onMatchEnd = typeof onMatchEnd === 'function' ? onMatchEnd : null;
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
      this.#statistikFuettern(this.match.consumeEvents());
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
      this.match.jump(entry.playerId, entry.seitlich ?? 0, entry.salto === true);
      return;
    }
    if (entry.kind === 'move') {
      this.match.gehen?.setzeRichtung(entry.playerId, entry.richtung ?? 0);
      return;
    }
    if (entry.kind === 'seil') {
      this.match.seilSystem?.eingabe(entry.playerId, entry);
      return;
    }
    if (entry.kind === 'skip_pause') {
      this.match.skipTurnPause();
      return;
    }
    if (entry.kind === 'skip_turn') {
      this.match.zug?.ueberspringen(entry.playerId);
      return;
    }
    if (entry.kind === 'surrender') {
      this.match.zug?.aufgeben(entry.playerId);
      return;
    }
    if (entry.kind === 'drop') {
      this.match.dropWeapon(entry.playerId, entry.weaponId);
      return;
    }
    if (entry.kind === 'select') {
      this.match.inventory.selectWeapon(entry.playerId, entry.weaponId);
      return;
    }
    this.match.fire(entry.playerId, entry.angle, entry.power, entry.weaponId ?? null, entry.zuendzeit ?? null);
  }

  /**
   * Momentaufnahme für die Persistenz.
   *
   * Warteschlange 3.6: Hier stand eine zweite, handgebauten Fassung von
   * `serializeLobby` (`recorder.toJSON()` + `tickCount`). Es gibt jetzt genau
   * EINE Fassung: `serializeLobby` in persistence.js.
   */
  toPersisted() {
    const voll = serializeLobby(this.lobby, this);
    return { replay: voll.replay, tick: voll.tick };
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
   * entityId → teamId für die Auswertung.
   *
   * `MatchStats` braucht die Zuordnung, um Eigen- und Teamschaden von
   * Gegnerschaden zu trennen. Sie wird bei jedem `syncSeats` neu gebaut, weil
   * die Entity-IDs erst mit dem Matchstart entstehen.
   */
  #teamkarte() {
    const karte = new Map();
    for (const seat of this.lobby.seats) {
      if (seat.entityId !== null && seat.entityId !== undefined) karte.set(seat.entityId, seat.teamId);
    }
    return karte;
  }

  /**
   * Bindet neu hinzugekommene Plätze an ihre Spieler-Entity.
   * Muss bei jedem Beitritt laufen: die Entity-IDs entstehen beim Start des
   * Matchs, spätere Plätze haben anfangs keine Zuordnung.
   */
  syncSeats() {
    this.#assignEntityIds();
    // Die Teamzuordnung der Kennzahlen zieht mit: Ohne diesen Schritt fehlten
    // Figuren, die erst nach dem Matchstart dazukamen.
    if (this.stats) this.stats.teams = this.#teamkarte();
    return this;
  }

  /**
   * Füttert die Spielerkennzahlen mit den Ereignissen dieses Takts.
   *
   * Der Takt kommt mit, weil das Trefferfenster (`MatchStats`) ihn braucht und
   * kein Ereignis ihn trägt. Ohne diese Zeile bliebe `stats.tick` bei 0 und
   * jeder Schaden gälte als Treffer.
   */
  #statistikFuettern(ereignisse, takt = this.match.world.tickCount) {
    this.stats.feedAll(ereignisse, takt);
  }

  /** Holt liegengebliebene Ereignisse nach — vor der Auswertung am Match-Ende. */
  #statistikAbschliessen() {
    const takt = this.match.world.tickCount;
    this.#statistikFuettern(this.match.consumeEvents(), takt);
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

  /**
   * Ein Takt der Zeitschleife — mit Fangnetz (SRV-6).
   *
   * `tick()` läuft aus `setInterval`. Eine Ausnahme aus `match.step()` (oder aus
   * dem Senden) verließ den Zeitgeber als `uncaughtException` — Node beendet
   * dann den GANZEN Prozess, also jede Lobby auf dem Server. Jetzt endet nur
   * diese Sitzung: Zeitgeber aus, eine Fehlerzeile im Log, eine Meldung an die
   * Clients, Sitzung abmelden (`onEmpty`).
   */
  tick() {
    try {
      this.#takt();
    } catch (fehler) {
      this.#abbrechen(fehler);
    }
  }

  /**
   * Beendet die Sitzung nach einem Fehler in der Zeitschleife.
   *
   * Kein `match_over`: Das Match ist nicht entschieden, es ist abgebrochen. Die
   * Lobby steht danach auf „finished" — wie nach einem Ende ist sie keine
   * offene Lobby mehr; ein Wiederbeitritt mit Token legt eine neue Sitzung an.
   */
  #abbrechen(fehler) {
    this.stop();
    if (this.#finished) return;
    this.#finished = true;
    this.logger?.error('tick_fehler', 'Simulationsschritt warf — Sitzung abgebrochen', {
      lobbyId: this.lobby?.id ?? null,
      tick: this.match?.world?.tickCount ?? null,
      error: fehler,
    });
    this.lobby && (this.lobby.status = LOBBY_STATUS.FINISHED);
    try {
      const grund = 'Interner Serverfehler — das Match wurde abgebrochen';
      this.#broadcastControl(CONTROL.ERROR, { error: grund, errors: [grund] });
    } catch {
      // Senden darf das Aufräumen nicht verhindern.
    }
    this.onEmpty?.(this.lobby?.id);
  }

  /** Ein Simulationsschritt — ohne Bot. Wer zieht, entscheidet der Mensch. */
  #takt() {
    const now = Date.now();
    const elapsed = Math.min(250, now - this.lastTickAt);
    this.lastTickAt = now;
    this.accumulator += elapsed;

    while (this.accumulator >= TICK_MS) {
      this.accumulator -= TICK_MS;
      if (this.match.status !== 'playing') break;
      /*
       * `#imTakt` sagt `stepSimulation`, dass die Ereignisse dieses Schritts
       * gleich HIER ausgeliefert werden. Ohne die Marke würde sie am
       * Match-Ende dort schon ausgewertet und aus dem Puffer genommen — die
       * Clients sähen „match_over", aber nicht mehr „aufgegeben"/„death".
       */
      this.#imTakt = true;
      try {
        this.stepSimulation(1);
      } finally {
        this.#imTakt = false;
      }
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
    const ereignisse = this.match.consumeEvents();
    this.#statistikFuettern(ereignisse, takt);
    for (const event of ereignisse) {
      if (!this.sendefilter.durchlassen(event.type, event.payload, takt)) {
        if (this.metrics) this.metrics.controlMessagesSuppressed += 1;
        continue;
      }
      if (this.metrics) this.metrics.controlMessagesSent += 1;
      /*
       * `tk` (Takt der Simulation) nur an Ereignissen mit Anzeige und Klang
       * (Einschlag, Insel löst sich/landet): Der Client leitet daraus den
       * Dedup-Schlüssel ab (Takt+Art+Ort), damit ein wiederholt zugestelltes
       * Ereignis nicht doppelt blitzt und klingt. Optional — fehlt es, gilt kein Dedup.
       */
      const mitTakt = DEDUP_EREIGNISARTEN.has(event.type) ? { tk: takt } : null;
      this.#broadcastControl(event.type, { round: this.match.round, ...event.payload, ...mitTakt });
    }

    // Netzwerk ist von der Simulation entkoppelt: Snapshots gehen mit fester
    // Rate raus, unabhängig davon, wie viele Ticks pro Aufruf liefen.
    this.snapshotAccumulator += elapsed;
    if (this.snapshotAccumulator >= SNAPSHOT_INTERVAL_MS) {
      /*
       * Den Rest BEHALTEN statt auf 0 zu setzen.
       *
       * Fund (belegt, Audit 2026-10-09): Hier stand `= 0`. Die Prüfung läuft nur
       * alle 16,7 ms; bei 50 ms Soll griff sie erst im vierten Takt (66,7 ms) und
       * warf den Überschuss weg — gemessen 65 ms Abstand, also 15 Hz statt der
       * ausgewiesenen 20 Hz. Mit dem Rest liegt der Schnitt bei 20 Hz. Ein
       * Rückstau (Server hing) wird gekappt, damit danach kein Stoß folgt.
       */
      this.snapshotAccumulator -= SNAPSHOT_INTERVAL_MS;
      if (this.snapshotAccumulator >= SNAPSHOT_INTERVAL_MS) this.snapshotAccumulator = 0;
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
      /*
       * Nur der TAKT wird vermerkt, nicht der Zustand.
       *
       * Fund (belegt, Audit 2026-10-09): Hier wurde je Tick ein vollständiger
       * Ansichtszustand gebaut und abgelegt — `getState()` ist rund die Hälfte der
       * Tickkosten (0,032 von 0,057 ms). Gelesen wird der Zustand nie: die
       * einzige Abfrage (`#handleInput`) nutzt `history.get(tick)?.tick`, also nur
       * die Taktnummer für `interpolatedFrom`.
       */
      this.history.push(this.match.world.tickCount, null);
    }
    if (this.match.status === 'gameover' && !this.#imTakt) {
      this.#statistikAbschliessen();
      this.#finish();
    }
    /*
     * Kein Rückgabewert mehr (STATE-1/ENG-5): Hier stand `return
     * this.match.getState()` — ein zweiter Zustandsaufbau je Takt (der erste
     * steckte in `match.step()`), den kein Aufrufer las. Gemessen 2026-11-02:
     * `getState()` 0,017 ms, `step()` 0,083 ms je Takt (2 Teams × 2, hills);
     * zwei überflüssige Aufbauten waren rund 30 % der Taktkosten des Servers.
     */
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
    this.#statistikAbschliessen();
    // Vor dem Stoppen auswerten: `stop()` beendet nur den Zeitgeber, der Zustand
    // des Matches bleibt lesbar. Die Auswertung meldet das Ergebnis an den
    // Kontodienst (Rangliste); Fehler dabei dürfen das Match-Ende nicht kippen.
    try {
      this.onMatchEnd?.({
        lobby: this.lobby,
        stats: this.stats,
        winnerTeamId: this.match.winnerTeamId,
        runden: this.match.round,
      });
    } catch (fehler) {
      this.logger?.error('match_end_auswertung', 'Auswertung der Partie fehlgeschlagen', { error: fehler });
    }
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

  /** Geländefassung, aufgelöstes Biom und Zerstörungsfassung: Der Client baut Karte und Stoffkarte damit nach. */
  gelaendeFelder() {
    return { gelaende: this.match.gelaende, biom: this.match.sonderbiom ?? this.match.biomWahl, kartenart: this.match.kartenart, zerstoerung: this.match.zerstoerung, klassen: this.match.klassen, windFassung: this.match.windFassung };
  }

  /** Fügt einen Client hinzu und schickt ihm den Startzustand. */
  attach(token, socket) {
    this.syncSeats();
    this.clients.set(token, socket);
    // Neuer Socket = neuer Empfänger: Er kennt keine Delta-Basis (SRV-9).
    this.previousByToken.delete(token);
    // Ein neu verbundener Client braucht die Bestände sofort, nicht erst beim
    // nächsten Wechsel.
    this.syncLoadouts(true);
    socket.send(controlMessage(CONTROL.LOBBY_STATE, {
      lobby: this.lobby.id,
      status: this.lobby.status,
      seed: this.match.seedManager.baseSeed,
      preset: this.lobby.preset,
      kartentyp: this.lobby.kartentyp ?? null,
      ...kartenFelder(this.lobby),
      ...this.gelaendeFelder(),
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
    this.previousByToken.delete(token);
    if (this.clients.size === 0) this.emptySince = Date.now();
  }

  /**
   * Sende den aktuellen Lobbyzustand an alle verbundenen Clients dieser Sitzung.
   *
   * Wird nach `disconnect` aufgerufen, damit die verbliebenen Spieler sofort
   * sehen, dass ein Team getrennt ist (B-9). Ohne diesen Broadcast würden sie
   * die Änderung erst beim nächsten regulären Tick bemerken — oder gar nicht,
   * wenn die Lobby im Wartezustand bleibt.
   */
  broadcastLobbyState() {
    if (this.clients.size === 0) return;
    const msg = {
      lobby: this.lobby.id,
      status: this.lobby.status,
      seed: this.match?.seedManager?.baseSeed ?? null,
      preset: this.lobby.preset,
      kartentyp: this.lobby.kartentyp ?? null,
      ...kartenFelder(this.lobby),
      ...this.gelaendeFelder(),
      laeuft: this.laeuft,
      teams: this.lobby.teams,
      besetzteTeams: new Set(
        this.lobby.seats.filter(seat => seat.token !== null && seat.connected).map(seat => seat.teamId)
      ).size,
      unitsPerPlayer: this.lobby.playersPerTeam,
      snapshot: this.match?.getState() ?? null,
    };
    for (const socket of this.clients.values()) {
      if (socket.readyState === 1) {
        socket.send(controlMessage(CONTROL.LOBBY_STATE, msg));
      }
    }
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

    if (!command.valid) {
      /*
       * UX-9 (Warteschlange): „Spieler ist nicht am Zug" allein lässt den
       * Spieler raten, wann er wieder darf. Die Restzugzeit steht im Zustand
       * und wird in die Ablehnung geschrieben.
       */
      if (command.errors.includes('Spieler ist nicht am Zug')) {
        const zustand = this.match.getState();
        const restMs = Math.max(0, (zustand.turnDurationMs ?? 0) - (zustand.turnElapsedMs ?? 0));
        return {
          ok: false,
          errors: command.errors.map(fehler => (fehler === 'Spieler ist nicht am Zug'
            ? `${fehler} (noch ${Math.ceil(restMs / 1000)} s Zugzeit)`
            : fehler)),
        };
      }
      return { ok: false, errors: command.errors };
    }

    /*
     * Die Waffe wird VOR dem Schuss aufgelöst und so aufgezeichnet.
     *
     * Fund (belegt, Audit 2026-10-09): Der Client sendet `weaponId:null`; welche
     * Waffe schießt, entschied allein die Auswahl im Inventar
     * (`SELECT_WEAPON`) — und die wurde nicht aufgezeichnet. Replay und
     * Wiederherstellung nach einem Serverneustart feuerten deshalb die
     * Standardwaffe: Live-Hash `fe6e49cc`, Replay-Hash `91bca67c`.
     * Mit der aufgelösten Kennung im Eintrag braucht das Replay die Auswahl nicht.
     */
    const waffe = command.input.weaponId
      ?? this.match.inventory.getActiveWeaponId(seat.entityId);
    const zuendzeit = command.input.zuendzeit ?? null; // Waffenfassung 21; vom Motor gegen 1/3/5 geprüft
    const result = this.match.fire(seat.entityId, command.input.angle, command.input.power, waffe, zuendzeit);
    if (result.ok) {
      this.recorder.recordInput({
        tick: currentTick,
        playerId: seat.entityId,
        angle: command.input.angle,
        power: command.input.power,
        weaponId: waffe,
      });
    }
    return { ok: result.ok, errors: result.errors ?? [], interpolatedFrom: history?.tick ?? null };
  }

        zuendzeit,
  handleWeaponSelect(token, weaponId) {
    // Die Waffe wird für die AKTIVE eigene Figur gewählt — siehe #platzFuer.
    const seat = this.#platzFuer(token);
    if (!seat || seat.entityId === null) return { ok: false, errors: ['Kein Spielerplatz'] };
    const vorher = this.match.inventory.getActiveWeaponId?.(seat.entityId);
    const ok = this.match.inventory.selectWeapon(seat.entityId, weaponId);
    // Nur Wechsel aufzeichnen: Wiederholungen derselben Waffe wuchsen unbegrenzt (Audit 2026-10-13).
    if (ok && vorher !== weaponId) {
      // Die Auswahl ist Simulationszustand (sie entscheidet über spätere
      // Schüsse mit `weaponId:null` und steht im Zustandshash) — ohne diesen
      // Eintrag weicht jedes Replay und jede Wiederherstellung ab.
      this.recorder.recordInput({
        tick: this.match.world.tickCount,
        playerId: seat.entityId,
        weaponId,
        kind: 'select',
      });
    }
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

    const salto = message.salto === true;
    if (message.salto !== undefined && typeof message.salto !== 'boolean') return { ok: false, errors: ['salto muss true oder false sein'] };
    const result = this.match.jump(seat.entityId, seitlich, salto);
    if (result.ok) {
      this.recorder.recordInput({
        tick: this.match.world.tickCount,
        playerId: seat.entityId,
        seitlich, salto,
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

  /**
   * Gehabsicht setzen, erneuern oder löschen (Bewegungsfassung 2).
   *
   * Eigene Steuernachricht `move` mit `richtung` (−1|0|1), streng typgeprüft. Die Identität kommt aus dem
   * TOKEN. Neben der Mengengrenze je Verbindung (`TokenBucket` in `#handleConnection`) hat jeder Sitz eine
   * eigene, engere Grenze (`BEWEGUNG.nachrichtenProSekunde`): Wechsel und Erneuerung genügen, mehr ist Missbrauch.
   * Jede angenommene Nachricht wird aufgezeichnet — die Haltedauer der Absicht hängt an ihrem Takt.
   */
  handleMove(token, message = {}) {
    const result = this.#handleMove(token, message);
    if (this.metrics) {
      if (result.ok) this.metrics.commandsAccepted += 1;
      else this.metrics.commandsRejected += 1;
    }
    return result;
  }

  #handleMove(token, message) {
    const seat = this.#platzFuer(token);
    if (!seat || seat.entityId === null) return { ok: false, errors: ['Kein Spielerplatz'] };
    if (!this.match.gehen) return { ok: false, errors: ['Gehen ist in dieser Partie nicht vorhanden'] };
    const richtung = message.richtung ?? 0;
    if (typeof richtung !== 'number' || !Number.isInteger(richtung) || richtung < -1 || richtung > 1) {
      return { ok: false, errors: ['richtung muss -1, 0 oder 1 sein'] };
    }
    let eimer = this.#gehGrenzen.get(seat.entityId);
    if (!eimer) {
      eimer = new TokenBucket({ rate: BEWEGUNG.nachrichtenProSekunde, stoss: BEWEGUNG.nachrichtenProSekunde });
      this.#gehGrenzen.set(seat.entityId, eimer);
    }
    // „Stopp" (0) wird nie gedrosselt: Eine verlorene Stopp-Nachricht ließe die Figur laufen.
    if (richtung !== 0 && !eimer.erlaube()) return { ok: false, errors: ['Zu viele Geh-Nachrichten'] };
    const result = this.match.gehen.setzeRichtung(seat.entityId, richtung);
    if (result.ok) {
      this.recorder.recordInput({ tick: this.match.world.tickCount, playerId: seat.entityId, richtung, kind: 'move' });
    }
    return { ok: result.ok, errors: result.errors ?? [] };
  }

  /**
   * Seil (Seilfassung 2): Schuss, Lösen, Schwung/Länge. Die Nachricht wird streng geprüft (`pruefeSeilEingabe`:
   * Typen, Bereiche, keine Zusatzfelder), die Identität kommt aus dem TOKEN, der Motor prüft Zug und Lage. Je Sitz
   * höchstens `SEIL.nachrichtenProSekunde` (ein „Stopp" der Absicht und das Lösen werden nie gedrosselt).
   * Jede angenommene Nachricht wird aufgezeichnet (`kind: 'seil'`).
   */
  handleSeil(token, message = {}) {
    const result = this.#handleSeil(token, message);
    if (this.metrics) {
      if (result.ok) this.metrics.commandsAccepted += 1;
      else this.metrics.commandsRejected += 1;
    }
    return result;
  }

  #handleSeil(token, message) {
    const seat = this.#platzFuer(token);
    if (!seat || seat.entityId === null) return { ok: false, errors: ['Kein Spielerplatz'] };
    if (!this.match.seilSystem) return { ok: false, errors: ['Das Seil ist in dieser Partie nicht vorhanden'] };
    const geprueft = pruefeSeilEingabe(message);
    if (!geprueft.valid) return { ok: false, errors: geprueft.errors };
    const eingabe = geprueft.eingabe;
    const stopp = eingabe.aktion === 'loesen' || (eingabe.aktion === 'steuer' && eingabe.sx === 0 && eingabe.sy === 0);
    let eimer = this.#seilGrenzen.get(seat.entityId);
    if (!eimer) {
      eimer = new TokenBucket({ rate: SEIL.nachrichtenProSekunde, stoss: SEIL.nachrichtenProSekunde });
      this.#seilGrenzen.set(seat.entityId, eimer);
    }
    if (!stopp && !eimer.erlaube()) return { ok: false, errors: ['Zu viele Seil-Nachrichten'] };
    const result = this.match.seilSystem.eingabe(seat.entityId, eingabe);
    if (result.ok) this.recorder.recordInput({ tick: this.match.world.tickCount, playerId: seat.entityId, ...eingabe, kind: 'seil' });
    return { ok: result.ok, errors: result.errors ?? [] };
  }

  /**
   * Zug überspringen (Zugregeln 2): nur der aktive Spieler, höchstens zweimal in Folge (Engine), und je Sitz
   * höchstens eine Nachricht je `ZUGREGELN.nachrichtenAbstandMs`. Die Identität kommt aus dem TOKEN.
   */
  handleSkipTurn(token) { return this.#zugAktion(token, 'skip_turn', (zug, seat) => [zug.ueberspringen(seat.entityId)], seat => [seat.entityId]); }

  /** Aufgeben (Zugregeln 2): nur der EIGENE Sitz (Token), jederzeit; die Figur zählt als besiegt. */
  handleSurrender(token) {
    // Im Teammodus gehören einem Token mehrere Figuren: alle eigenen geben auf.
    const eigene = this.lobby.seats.filter(e => e.token === token && e.entityId !== null).map(e => e.entityId);
    return this.#zugAktion(token, 'surrender', zug => eigene.map(id => zug.aufgeben(id)), () => eigene);
  }

  #zugAktion(token, kind, fuehreAus, ids) {
    const result = this.#zugAktionPruefen(token, kind, fuehreAus, ids);
    if (this.metrics) {
      if (result.ok) this.metrics.commandsAccepted += 1;
      else this.metrics.commandsRejected += 1;
    }
    return result;
  }

  #zugAktionPruefen(token, kind, fuehreAus, ids) {
    const seat = this.#platzFuer(token);
    if (!seat || seat.entityId === null) return { ok: false, errors: ['Kein Spielerplatz'] };
    if (!this.match.zug) return { ok: false, errors: ['Diese Partie kennt weder Überspringen noch Aufgeben'] };
    const jetzt = Date.now();
    const letzte = this.#zugAktionZeit.get(seat.entityId) ?? 0;
    if (jetzt - letzte < ZUGREGELN.nachrichtenAbstandMs) return { ok: false, errors: ['Zu schnell hintereinander'] };
    this.#zugAktionZeit.set(seat.entityId, jetzt);
    const ergebnisse = fuehreAus(this.match.zug, seat);
    const betroffen = ids(seat);
    ergebnisse.forEach((r, i) => {
      if (r.ok) this.recorder.recordInput({ tick: this.match.world.tickCount, playerId: betroffen[i], kind });
    });
    const ok = ergebnisse.some(r => r.ok);
    return { ok, errors: ok ? [] : (ergebnisse[0]?.errors ?? ['Abgelehnt']) };
  }

  /** Zugpause vorzeitig beenden: nur der Spieler, der gleich dran ist. */
  handleSkipPause(token) {
    const seat = this.#platzFuer(token);
    if (!seat || seat.entityId === null) return { ok: false, errors: ['Kein Spielerplatz'] };
    // Nur wer gleich dran ist, darf die Pause beenden (der Gegner sieht sonst die Wiederholung nicht zu Ende).
    if (seat.entityId !== this.match.activePlayerId) return { ok: false, errors: ['Pause überspringen nur, wenn du gleich dran bist'] };
    const result = this.match.skipTurnPause();
    if (result.ok) {
      this.recorder.recordInput({ tick: this.match.world.tickCount, playerId: seat.entityId, kind: 'skip_pause' });
    }
    if (this.metrics) {
      if (result.ok) this.metrics.commandsAccepted += 1;
      else this.metrics.commandsRejected += 1;
    }
    return { ok: result.ok, errors: result.errors ?? [] };
  }

  #handleDropWeapon(token, weaponId) {
    const seat = this.#platzFuer(token);
    if (!seat || seat.entityId === null) {
      return { ok: false, errors: ['Kein Spielerplatz'] };
    }
    if (typeof weaponId !== 'string' || weaponId.length === 0) {
      return { ok: false, errors: ['weaponId muss eine Zeichenkette sein'] };
    }

    // Nur am eigenen Zug und nicht in der Zugpause: Der Abwurf zieht Zufallszahlen und änderte sonst den
    // Wind der nächsten Runde (Audit 2026-10-13).
    if (seat.entityId !== this.match.activePlayerId || this.match.turnPauseMs > 0) {
      return { ok: false, errors: ['Abwerfen nur am eigenen Zug, nicht in der Zugpause'] };
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
        // Darstellung: Fraktion des Teams (reine Anzeige, `null` = Anzeige leitet automatisch ab).
        fraktionId: this.lobby.fraktionen?.[seat.teamId ?? 0] ?? null,
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

  /**
   * Allsehendes Auge: schickt den Inhalt aller Kisten nur an die Sitze des Teams, dessen Figur die Wirkung hat. Pro Team
   * wird die Liste der Figuren mit laufender Wirkung vereinigt; gesendet wird nur bei Änderung (auch die leere Liste, die
   * die Anzeige beendet). Der Inhalt steht nicht im öffentlichen Zustand — ein Gegner erfährt ihn nie.
   */
  #syncKistenSicht() {
    const jeTeam = new Map();
    for (const seat of this.lobby.seats) {
      if (seat.entityId === null || seat.entityId === undefined) continue;
      const liste = kistenInhalt(this.match.world, this.match.statuses, seat.entityId);
      if (!jeTeam.has(seat.teamId)) jeTeam.set(seat.teamId, []);
      if (liste.length) jeTeam.get(seat.teamId).push(...liste);
    }
    this.kistenSichtStand ??= new Map();
    for (const [team, roh] of jeTeam) {
      const kisten = [...new Map(roh.map(k => [k.entityId, k])).values()];
      const signatur = JSON.stringify(kisten);
      if (signatur === (this.kistenSichtStand.get(team) ?? '[]') ) continue;
      this.kistenSichtStand.set(team, signatur);
      const nachricht = controlMessage(CONTROL.KISTEN_SICHT, { kisten });
      for (const seat of this.lobby.seats) {
        if (seat.teamId !== team || seat.token === null) continue;
        const socket = this.clients.get(seat.token);
        if (socket && socket.readyState === 1) socket.send(nachricht);
      }
    }
  }

    this.snapshotCounter += 1;
    const rohZustand = this.match.getState();
    // Zustände liegen getrennt nach Spieler-ID vor; das Drahtformat führt sie
    // je Spieler. Deshalb hier zusammenführen — sonst müsste der Client zwei
    this.#syncKistenSicht();
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

    // Terrain-Hash zusammen mit dem Vollsnapshot (siehe CONTROL.TERRAIN_HASH).
    if (forceFull) this.#broadcastControl(CONTROL.TERRAIN_HASH, this.terrainStand(false));

    /*
     * Die Delta-Basis gilt NUR für Empfänger, die diesen Snapshot bekommen haben
     * (SRV-9). Vorher wurde sie für jeden Token fortgeschrieben, auch wenn sein
     * Socket nicht offen war: Der nächste Delta bezog sich dann auf einen Stand,
     * den der Client nie sah, und das Feld blieb bis zum nächsten Vollsnapshot
     * (bis ~2 s) falsch. Wer übersprungen wird, verliert seine Basis und
     * bekommt beim nächsten Mal einen Vollsnapshot.
     */
    const sent = [];
    const empfaenger = [];
    for (const [token, socket] of this.clients.entries()) {
      if (socket.readyState !== 1) {
        this.previousByToken.delete(token);
        continue;
      }
      const previous = forceFull ? null : (this.previousByToken.get(token) ?? null);
      const buffer = encodeSnapshot(state, { turnRemainingMs, previous });
      socket.send(buffer);
      if (this.metrics) this.metrics.snapshotsSent += 1;
      sent.push(buffer);
      empfaenger.push(token);
    }

    // Zustand für den nächsten Vergleich fortschreiben. Der Helfer erzeugt
    // exakt die Rohform, die der Encoder erwartet.
    const nextPrevious = toDeltaBase(state);
    for (const token of empfaenger) this.previousByToken.set(token, nextPrevious);

    return sent[0] ?? null;
  }

  /**
   * Kartenstand für Abgleich und Nachlieferung: Hash der Maske, Kraterzahl und
   * Mahlstrom-Einschnitt; mit `mitKratern` zusätzlich die Kraterliste.
   *
   * Der Hash wird bei jedem Aufruf frisch über die Maske gerechnet, ohne
   * Zwischenspeicher: Gemessen (2560x1440, 115 200 Wörter, Median über 200
   * Läufe) kostet das ca. 0,1 ms — rund 1 % eines 16,7-ms-Ticks und nur alle
   * 2 s. Ein Zwischenspeicher wäre ein zweiter Zustand, der veralten kann.
   */
  terrainStand(mitKratern) {
    const terrain = this.match.terrain;
    const stand = {
      hash: terrain.hash(),
      craters: terrain.craterCount,
      inset: this.match.maelstrom?.inset ?? 0,
      // Inseln im Fall stehen nicht in der Maske: Der Client darf dann nicht vergleichen.
      faellt: this.match.setzung?.faellt ?? 0,
      ...(this.match.stoffkarte ? { stoffe: stoffHash(this.match.stoffkarte) } : {}),
      // Brennende Zellen und ruhende Lava (EREIGNIS-1): Ereignislisten sind gekappt, ein später Beitritt sah sie nie.
      ...(this.match.feuerSystem ? { feuer: feuerStandNutzlast(this.match.feuerSystem.sichtStand()) } : {}),
    };
    if (mitKratern) stand.craters = terrain.craterLog;
    return stand;
  }

  #broadcastControl(type, payload) {
    const message = controlMessage(type, payload);
    for (const socket of this.clients.values()) {
      if (socket.readyState === 1) socket.send(message);
    }
  }
}
