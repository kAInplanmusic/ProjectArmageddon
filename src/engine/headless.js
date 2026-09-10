/**
 * Deterministische, rendering-freie Match-Runtime.
 *
 * Inputs werden nach Tick und Sequenznummer sortiert und genau einmal vor dem
 * jeweiligen Fixed-Timestep-Schritt angewendet. Dadurch bleibt die Runtime
 * unabhängig davon, wann Netzwerk- oder Replay-Code die Inputs einliefert.
 */
import { createServerRuntime } from './init.js';
import { MatchSeedManager } from '../shared/seed.js';

function assertFiniteInteger(value, name) {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`${name} muss eine nichtnegative Ganzzahl sein`);
  }
}

export class HeadlessRuntime {
  #runtime;
  #seedManager;
  #tick = 0;
  #sequence = 0;
  #inputs = new Map();
  #players = new Map();
  #status = 'lobby';

  constructor({ matchSeed, playerCount = 2, turnDuration = null, maxEntities = 10000 } = {}) {
    this.#seedManager = matchSeed === undefined
      ? MatchSeedManager.createRandom()
      : new MatchSeedManager(matchSeed);
    this.#runtime = createServerRuntime({ playerCount, turnDuration, maxEntities });
  }

  addPlayer(playerId, entityId = null) {
    if (this.#status !== 'lobby') throw new Error('Spieler können nur in der Lobby hinzugefügt werden');
    if (this.#players.has(playerId)) throw new Error(`Spieler "${playerId}" ist bereits registriert`);
    this.#players.set(playerId, { playerId, entityId });
    return this.#players.get(playerId);
  }

  start() {
    if (this.#players.size === 0) throw new Error('Mindestens ein Spieler ist erforderlich');
    this.#status = 'running';
    this.#runtime.world.getSystem('turn')?.startTurn();
  }

  enqueueInput({ playerId, tick = this.#tick, angle, power, type = 'fire', payload = null } = {}) {
    if (!this.#players.has(playerId)) throw new Error(`Unbekannter Spieler: ${playerId}`);
    assertFiniteInteger(tick, 'tick');
    if (!Number.isFinite(angle) || !Number.isFinite(power)) {
      throw new TypeError('angle und power müssen endliche Zahlen sein');
    }
    const input = Object.freeze({ playerId, tick, angle, power, type, payload, sequence: this.#sequence++ });
    const bucket = this.#inputs.get(tick) || [];
    bucket.push(input);
    this.#inputs.set(tick, bucket);
    return input;
  }

  step() {
    if (this.#status !== 'running') throw new Error('Match ist nicht gestartet');
    const inputs = (this.#inputs.get(this.#tick) || []).sort((a, b) => a.sequence - b.sequence);
    this.#inputs.delete(this.#tick);
    for (const input of inputs) this.#applyInput(input);
    this.#runtime.step();
    this.#tick++;
    return this.serialize();
  }

  run(ticks) {
    assertFiniteInteger(ticks, 'ticks');
    for (let i = 0; i < ticks; i++) this.step();
    return this.serialize();
  }

  #applyInput(input) {
    const player = this.#players.get(input.playerId);
    if (player.entityId == null) return;
    const world = this.#runtime.world;
    if (!world.isActive(player.entityId) || !world.hasComponent(player.entityId, 'Input')) return;
    world.setComponent(player.entityId, 'Input', 'angle', input.angle);
    world.setComponent(player.entityId, 'Input', 'power', input.power);
  }

  serialize() {
    return {
      status: this.#status,
      tick: this.#tick,
      seed: this.#seedManager.serialize(),
      players: [...this.#players.values()].map(player => ({ ...player })),
      world: this.#runtime.serialize()
    };
  }

  get world() { return this.#runtime.world; }
  get tick() { return this.#tick; }
  get seedManager() { return this.#seedManager; }
  get status() { return this.#status; }
}

export default HeadlessRuntime;