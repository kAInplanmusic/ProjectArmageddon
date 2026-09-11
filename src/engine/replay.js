/**
 * Replay: Aufzeichnung und exakte Wiedergabe eines Matches.
 *
 * Statt den kompletten ECS-Zustand zu serialisieren, wird nur der Match-Seed,
 * die Konfiguration und die geordnete Eingabeliste gespeichert. Da die
 * Simulation deterministisch ist, ergibt das Replay aus (Seed + Eingaben) exakt
 * denselben Matchverlauf — bei einem Bruchteil der Datenmenge.
 *
 * Das dient zwei Zwecken:
 *  1. Session-Persistenz: nach einem Serverneustart kann ein Match wiederhergestellt
 *     werden, indem die Eingaben bis zum aktuellen Tick erneut abgespielt werden.
 *  2. Debug/Replay-Tool: ein aufgezeichnetes Match lässt sich tickweise nachfahren.
 *
 * Wichtig: Eingaben werden mit dem Tick gespeichert, an dem sie ANGEWENDET
 * wurden. Das Replay spielt sie am selben Tick wieder ein, sonst verschiebt sich
 * der Zustand und der Vergleichshash weicht ab.
 *
 * @module replay
 */
import { MatchController } from './match.js';

export const REPLAY_FORMAT_VERSION = 1;

export class ReplayRecorder {
  #config;
  #entries = [];
  #rounds = [];
  #startedAt;
  #seed;
  #totalTicks = 0;

  /**
   * @param {object} options
   * @param {number} options.seed
   * @param {number} [options.teams]
   * @param {number} [options.playersPerTeam]
   * @param {string} [options.preset]
   * @param {number} [options.maxRounds]
   * @param {number} [options.turnDurationMs]
   */
  constructor({ seed, teams = 2, playersPerTeam = 2, preset = 'hills', maxRounds = 30, turnDurationMs = null } = {}) {
    if (!Number.isInteger(seed)) {
      throw new TypeError('ReplayRecorder benötigt einen ganzzahligen Seed');
    }
    this.#seed = seed;
    this.#config = { teams, playersPerTeam, preset, maxRounds, turnDurationMs };
    this.#startedAt = Date.now();
  }

  get seed() { return this.#seed; }
  get entries() { return [...this.#entries]; }
  get rounds() { return [...this.#rounds]; }
  get entryCount() { return this.#entries.length; }
  get config() { return { ...this.#config }; }
  /** Tickzahl, bis zu der das Match aufgezeichnet wurde. */
  get totalTicks() { return this.#totalTicks; }

  /**
   * Markiert das Ende der Aufzeichnung. Erst damit weiß ein Replay, wie weit es
   * abspielen muss — ohne diese Grenze würde es bis zum (möglicherweise nie
   * erreichten) Spielende laufen.
   */
  finalize(totalTicks) {
    if (!Number.isInteger(totalTicks) || totalTicks < 0) {
      throw new TypeError('totalTicks muss eine nichtnegative Ganzzahl sein');
    }
    this.#totalTicks = Math.max(this.#totalTicks, totalTicks);
    return this;
  }

  /**
   * Zeichnet eine angewendete Eingabe auf.
   * @param {object} entry
   * @param {number} entry.tick - Tick, bei dem die Eingabe wirkte
   * @param {number} entry.playerId
   * @param {number} entry.angle
   * @param {number} entry.power
   * @param {string|null} [entry.weaponId]
   */
  recordInput({ tick, playerId, angle, power, weaponId = null }) {
    if (!Number.isInteger(tick) || tick < 0) {
      throw new TypeError('tick muss eine nichtnegative Ganzzahl sein');
    }
    this.#entries.push({
      tick,
      playerId,
      angle: Math.round(angle * 1e6) / 1e6,
      power: Math.round(power * 1e6) / 1e6,
      weaponId: weaponId ?? null,
    });
    return this;
  }

  /** Zeichnet einen Rundenwechsel auf (dient der Nachvollziehbarkeit). */
  recordRound(round, tick) {
    this.#rounds.push({ round, tick });
    return this;
  }

  /**
   * Erzeugt ein Replay aus einem laufenden Match: Seed + Konfiguration werden
   * vom Match übernommen, die Eingaben müssen separat erfasst worden sein.
   */
  static forMatch(match, { entries = [], rounds = [] } = {}) {
    const recorder = new ReplayRecorder({
      seed: match.seedManager.baseSeed,
      teams: match.teams,
      playersPerTeam: match.playersPerTeam,
      preset: match.preset,
      maxRounds: match.maxRounds,
      turnDurationMs: match.turnDurationMs,
    });
    for (const entry of entries) recorder.recordInput(entry);
    for (const round of rounds) recorder.recordRound(round.round, round.tick);
    return recorder;
  }

  toJSON() {
    return {
      format: REPLAY_FORMAT_VERSION,
      createdAt: this.#startedAt,
      seed: this.#seed,
      config: this.#config,
      totalTicks: this.#totalTicks,
      entries: this.#entries,
      rounds: this.#rounds,
    };
  }

  serialize() {
    return JSON.stringify(this.toJSON());
  }

  static fromJSON(data) {
    const parsed = typeof data === 'string' ? JSON.parse(data) : data;
    if (!parsed || parsed.format !== REPLAY_FORMAT_VERSION) {
      throw new Error(`Unbekanntes Replay-Format: ${parsed?.format}`);
    }
    const recorder = new ReplayRecorder({ seed: parsed.seed, ...parsed.config });
    if (Number.isInteger(parsed.totalTicks)) recorder.finalize(parsed.totalTicks);
    for (const entry of parsed.entries ?? []) recorder.recordInput(entry);
    for (const round of parsed.rounds ?? []) recorder.recordRound(round.round, round.tick);
    return recorder;
  }

  static deserialize(text) {
    return ReplayRecorder.fromJSON(text);
  }
}

/**
 * Spielt ein Replay ab.
 *
 * @param {ReplayRecorder|object} replay
 * @param {object} [options]
 * @param {number} [options.untilTick] - nur bis zu diesem Tick abspielen.
 *   Standard ist die aufgezeichnete Tickzahl (recorder.totalTicks), sonst der
 *   letzte aufgezeichnete Eingabe-Tick plus ein Tick. Ohne diese Grenze würde
 *   ein Replay bis zum Spielende laufen — das bei fehlenden Eingaben nie
 *   eintritt.
 * @param {function(number, object):void} [options.onTick] - Callback je Tick
 * @param {function(object):void} [options.onEvent] - Callback je Ereignis
 * @returns {{match: object, appliedInputs: number, ticks: number, rejected: object[]}}
 */
export function playReplay(replay, { untilTick = null, onTick = null, onEvent = null } = {}) {
  /*
   * Einmal-Variante des ReplayPlayers: spult bis zum Ende durch.
   *
   * Die Gruppierung der Eingaben und der Aufbau des Matches liegen im
   * ReplayPlayer, damit es nur EINE Umsetzung gibt — die schrittweise Wiedergabe
   * im Client und das Durchlaufen in der Werkzeugkette müssen sich gleich
   * verhalten, sonst zeigt der Client etwas anderes als `replay --verify` prüft.
   */
  const spieler = new ReplayPlayer(replay, { untilTick });
  while (spieler.step()) {
    if (onEvent) for (const event of spieler.lastEvents) onEvent(event);
    if (onTick) onTick(spieler.tick - 1, spieler.match);
  }
  return {
    match: spieler.match,
    appliedInputs: spieler.appliedInputs,
    ticks: spieler.tick,
    rejected: spieler.rejected,
  };
}

/**
 * Schrittweise Wiedergabe einer Aufzeichnung.
 *
 * `playReplay` spult in einem Zug durch — für die Auswertung richtig, für eine
 * Anzeige unbrauchbar: Dort muss der Zustand zwischen zwei Bildern sichtbar
 * sein, und der Betrachter will pausieren, springen und das Tempo ändern können.
 *
 * Der Player hält deshalb einen eigenen MatchController und wendet je Aufruf von
 * `step()` genau einen Simulationstakt an — dieselben Schritte, dieselbe
 * Reihenfolge, dieselbe Determinismus-Zusage. `seek` baut den Zustand neu auf und
 * spult bis zur Zielstelle; ein Replay ist von vorn reproduzierbar, einen
 * Zwischenzustand gibt es nicht.
 */
export class ReplayPlayer {
  /**
   * @param {object|ReplayRecorder} replay
   * @param {object} [optionen]
   * @param {number|null} [optionen.untilTick] - früher aufhören
   * @param {number} [optionen.speed=1] - Wiedergabegeschwindigkeit (1 = Echtzeit)
   */
  constructor(replay, { untilTick = null, speed = 1 } = {}) {
    this.recorder = replay instanceof ReplayRecorder ? replay : ReplayRecorder.fromJSON(replay);
    this.speed = speed;
    this.untilTick = untilTick;
    this.reset();
  }

  /** Setzt die Wiedergabe an den Anfang zurück. */
  reset() {
    const config = this.recorder.config;
    this.match = new MatchController({
      seed: this.recorder.seed,
      teams: config.teams,
      playersPerTeam: config.playersPerTeam,
      preset: config.preset,
      maxRounds: config.maxRounds,
      ...(config.turnDurationMs ? { turnDurationMs: config.turnDurationMs } : {}),
    });
    this.match.start();

    // Eingaben nach Tick gruppieren, Reihenfolge innerhalb eines Ticks erhalten.
    this.byTick = new Map();
    for (const entry of this.recorder.entries) {
      if (!this.byTick.has(entry.tick)) this.byTick.set(entry.tick, []);
      this.byTick.get(entry.tick).push(entry);
    }

    /*
     * Endtick aus der Aufzeichnung ableiten. Ohne Eingaben endet das Match nie,
     * ein Replay mit `Number.MAX_SAFE_INTEGER` liefe endlos — deshalb die
     * aufgezeichnete Gesamtzahl, sonst der letzte Eingabetick plus eins.
     */
    const letzterEingabeTick = this.recorder.entries
      .reduce((max, entry) => Math.max(max, entry.tick), 0);
    this.totalTicks = this.untilTick ?? (this.recorder.totalTicks > 0
      ? this.recorder.totalTicks
      : letzterEingabeTick + 1);

    this.tick = 0;
    this.appliedInputs = 0;
    this.rejected = [];
    /** Ereignisse des letzten Schritts. */
    this.lastEvents = [];
    return this;
  }

  /** Ist die Wiedergabe am Ende (oder das Match entschieden)? */
  get finished() {
    return this.match.status !== 'playing' || this.tick >= this.totalTicks;
  }

  /** Fortschritt 0..1. */
  get progress() {
    if (this.totalTicks <= 0) return 1;
    return Math.min(1, this.tick / this.totalTicks);
  }

  /**
   * Wendet einen Simulationstakt an.
   * @returns {boolean} false, wenn nichts mehr zu tun ist
   */
  step() {
    if (this.finished) {
      this.lastEvents = [];
      return false;
    }

    const tick = this.match.world.tickCount;
    for (const entry of this.byTick.get(tick) ?? []) {
      const result = this.match.fire(entry.playerId, entry.angle, entry.power, entry.weaponId);
      if (result.ok) this.appliedInputs += 1;
      else this.rejected.push({ tick, entry, errors: result.errors });
    }

    this.match.step();
    this.tick = this.match.world.tickCount;
    this.lastEvents = this.match.consumeEvents();
    return true;
  }

  /**
   * Wendet mehrere Takte an (für die Wiedergabe in Echtzeit).
   * @param {number} anzahl
   * @returns {number} tatsächlich angewendete Takte
   */
  stepMany(anzahl) {
    let getan = 0;
    for (let i = 0; i < anzahl; i += 1) {
      if (!this.step()) break;
      getan += 1;
    }
    return getan;
  }

  /**
   * Springt an eine Stelle.
   *
   * Es gibt keinen Zwischenzustand zum Wiederherstellen: Das Match wird neu
   * aufgebaut und bis zur Zielstelle gespult. Das kostet Rechenzeit, ist aber die
   * einzige Variante, die deterministisch bleibt.
   *
   * @param {number} zielTick
   * @returns {number} tatsächlich erreichter Tick
   */
  seek(zielTick) {
    const ziel = Math.max(0, Math.min(this.totalTicks, Math.floor(zielTick)));
    if (ziel < this.tick) this.reset();
    while (this.tick < ziel && this.step());
    return this.tick;
  }

  /** Zustand für die Anzeige (entspricht dem, was der Client sonst zeichnet). */
  getState() {
    return this.match.getState();
  }
}

export default ReplayRecorder;
