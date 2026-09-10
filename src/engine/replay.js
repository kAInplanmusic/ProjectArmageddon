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
  const recorder = replay instanceof ReplayRecorder ? replay : ReplayRecorder.fromJSON(replay);
  const config = recorder.config;

  const match = new MatchController({
    seed: recorder.seed,
    teams: config.teams,
    playersPerTeam: config.playersPerTeam,
    preset: config.preset,
    maxRounds: config.maxRounds,
    ...(config.turnDurationMs ? { turnDurationMs: config.turnDurationMs } : {}),
  });
  match.start();

  // Eingaben nach Tick gruppieren, Reihenfolge innerhalb eines Ticks erhalten.
  const byTick = new Map();
  for (const entry of recorder.entries) {
    if (!byTick.has(entry.tick)) byTick.set(entry.tick, []);
    byTick.get(entry.tick).push(entry);
  }

  // Standardgrenze aus der Aufzeichnung ableiten. Number.MAX_SAFE_INTEGER wäre
  // falsch: ohne Eingaben endet das Match nie und das Replay liefe endlos.
  const lastRecordedTick = recorder.entries.reduce((max, entry) => Math.max(max, entry.tick), 0);
  const lastTick = untilTick === null
    ? (recorder.totalTicks > 0 ? recorder.totalTicks : lastRecordedTick + 1)
    : untilTick;

  let appliedInputs = 0;
  const rejected = [];
  let ticks = 0;

  while (match.world.tickCount < lastTick && match.status === 'playing') {
    const tick = match.world.tickCount;

    for (const entry of byTick.get(tick) ?? []) {
      const result = match.fire(entry.playerId, entry.angle, entry.power, entry.weaponId);
      if (result.ok) {
        appliedInputs += 1;
      } else {
        rejected.push({ tick, entry, errors: result.errors });
      }
    }

    match.step();
    ticks += 1;

    const events = match.consumeEvents();
    if (onEvent) for (const event of events) onEvent(event);
    if (onTick) onTick(tick, match);

    // Sicherheitsnetz gegen eine Endlosschleife bei fehlerhaften Replays.
    if (ticks > 200_000) break;
  }

  return { match, appliedInputs, ticks, rejected };
}

export default ReplayRecorder;
