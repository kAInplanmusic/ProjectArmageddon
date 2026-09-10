import assert from 'node:assert/strict';
import test from 'node:test';
import {
  encodeSnapshot,
  decodeSnapshot,
  controlMessage,
  parseControlMessage,
  PROTOCOL_VERSION,
  MAGIC,
  MESSAGE_TYPE,
} from '../src/shared/protocol.js';
import { SnapshotHistory } from '../src/server/lagCompensation.js';
import { LobbyManager, LOBBY_STATUS } from '../src/server/lobby.js';
import { BotController } from '../src/server/bot.js';
import { MatchController } from '../src/engine/match.js';
import { validateCommand, isTickInWindow } from '../src/shared/validation.js';
import { SeededRandom } from '../src/shared/prng.js';

test('Snapshot-Protokoll kodiert und dekodiert verlustarm', () => {
  const state = {
    tick: 12345,
    round: 7,
    wind: -0.03125,
    activePlayerId: 3,
    entities: [
      { entityId: 1, teamId: 0, alive: true, x: 256.5, y: 380.25, health: 96.5, isActiveTurn: false },
      { entityId: 3, teamId: 1, alive: true, x: 1024.75, y: 443.5, health: 62.5, isActiveTurn: true },
      { entityId: 4, teamId: 1, alive: false, x: 0, y: 0, health: 0, isActiveTurn: false },
    ],
    projectiles: [{ entityId: 9, x: 640.5, y: 120.25 }],
  };

  const buffer = encodeSnapshot(state);
  // Portables Binärformat: Uint8Array (Browser) statt Node-only Buffer.
  assert.ok(buffer instanceof Uint8Array);
  assert.equal(buffer[0], MAGIC[0]);
  assert.equal(buffer[1], MAGIC[1]);
  assert.equal(buffer[2], PROTOCOL_VERSION);
  assert.equal(buffer[3], MESSAGE_TYPE.SNAPSHOT);

  const decoded = decodeSnapshot(buffer);
  assert.equal(decoded.tick, 12345);
  assert.equal(decoded.round, 7);
  assert.ok(Math.abs(decoded.wind - (-0.03125)) < 1e-6);
  assert.equal(decoded.activePlayerId, 3);
  assert.equal(decoded.entities.length, 3);
  assert.equal(decoded.entities[0].x, 256.5);
  assert.equal(decoded.entities[0].health, 96.5);
  assert.equal(decoded.entities[1].isActiveTurn, true);
  assert.equal(decoded.entities[2].alive, false);
  assert.equal(decoded.projectiles.length, 1);
  assert.equal(decoded.projectiles[0].y, 120.25);

  // Dieselben Bytes müssen auch als Node-Buffer dekodierbar sein.
  const fromNodeBuffer = decodeSnapshot(Buffer.from(buffer));
  assert.equal(fromNodeBuffer.tick, decoded.tick);
  assert.equal(fromNodeBuffer.entities.length, decoded.entities.length);

  // Binärformat muss deutlich kompakter sein als JSON.
  const jsonSize = Buffer.byteLength(JSON.stringify(state));
  assert.ok(buffer.length < jsonSize / 2, `Binärgrösse ${buffer.length} vs JSON ${jsonSize}`);
});

test('Snapshot-Dekoder lehnt ungültige Puffer ab', () => {
  assert.equal(decodeSnapshot(Buffer.from('nope')), null);
  assert.equal(decodeSnapshot(Buffer.from([0x50, 0x41, 99, 1, 0, 0, 0, 0])), null);
  assert.equal(decodeSnapshot(null), null);
});

test('Steuernachrichten sind versioniert und robust geparst', () => {
  const message = controlMessage('input', { angle: 1, power: 50 });
  const parsed = parseControlMessage(message);
  assert.equal(parsed.v, PROTOCOL_VERSION);
  assert.equal(parsed.t, 'input');
  assert.equal(parsed.power, 50);
  assert.equal(parseControlMessage('kein json'), null);
  assert.equal(parseControlMessage('{"x":1}'), null);
});

test('Lag-Kompensation hält nur das konfigurierte Fenster', () => {
  const history = new SnapshotHistory({ windowMs: 200, tickDurationMs: 1000 / 60 });
  assert.equal(history.windowTicks, 12);

  for (let tick = 0; tick < 60; tick++) {
    history.push(tick, { tick });
  }

  assert.ok(history.size <= history.windowTicks + 1);
  assert.equal(history.latest.tick, 59);
  assert.equal(history.get(59).tick, 59);
  // Zu alte Ticks wurden verworfen: der älteste Eintrag muss nahe am Fenster liegen.
  assert.ok(history.get(0) === null || history.get(0).tick >= 47);
  assert.equal(history.isWithinWindow(55, 59), true);
  assert.equal(history.isWithinWindow(10, 59), false);
  assert.equal(history.isWithinWindow(70, 59), false);
});

test('Lobby verwaltet Plätze, Kapazität und Wiederverbindung', () => {
  const lobbies = new LobbyManager();
  const { lobby, player } = lobbies.create({ teams: 2, playersPerTeam: 2, preset: 'islands', hostName: 'Anna' });

  assert.equal(lobby.capacity, 4);
  assert.equal(lobby.occupied, 1);
  assert.equal(lobby.connected, 1);
  assert.equal(lobby.preset, 'islands');
  assert.equal(player.resumed, false);
  assert.ok(player.token);

  const second = lobbies.join(lobby.id, { name: 'Ben' });
  assert.equal(lobbies.describe(lobby.id).occupied, 2);
  assert.equal(second.seatIndex, 1);
  assert.equal(lobbies.describe(lobby.id).seats[1].teamId, 1);

  // Wiederverbindung mit Token belegt keinen neuen Platz.
  const resumed = lobbies.join(lobby.id, { token: player.token });
  assert.equal(resumed.resumed, true);
  assert.equal(lobbies.describe(lobby.id).occupied, 2);

  lobbies.join(lobby.id, { name: 'Cara' });
  lobbies.join(lobby.id, { name: 'Dan' });
  assert.throws(() => lobbies.join(lobby.id, { name: 'Eve' }), /voll/);

  // Disconnect + Reconnect-Fenster
  lobbies.disconnect(lobby.id, second.token);
  assert.equal(lobbies.describe(lobby.id).seats[1].connected, false);
  assert.equal(lobbies.describe(lobby.id).connected, 3);
  assert.equal(lobbies.pruneDisconnected(Date.now()).length, 0);
  assert.equal(lobbies.pruneDisconnected(Date.now() + 60_000).length, 1);

  lobbies.markRunning(lobby.id);
  assert.equal(lobbies.get(lobby.id).status, LOBBY_STATUS.RUNNING);
  assert.throws(() => lobbies.join(lobby.id, { name: 'Eve' }), /auf/);
});

test('Lag-Kompensation und Bot-Auswahl funktionieren im Match', () => {
  const match = new MatchController({ seed: 1234, teams: 2, playersPerTeam: 2 });
  match.start();

  const bot = new BotController({ rng: new SeededRandom(42), skill: 0.7 });
  const active = match.activePlayerId;
  const shot = bot.chooseShot(match, active);

  assert.ok(shot);
  assert.ok(shot.angle >= 0 && shot.angle <= Math.PI);
  assert.ok(shot.power >= 20 && shot.power <= 100);

  const result = match.fire(active, shot.angle, shot.power);
  assert.equal(result.ok, true);
});

test('Servervalidierung blockiert fremde, ungültige und veraltete Befehle', () => {
  const known = [1, 2, 3, 4];

  // Nicht am Zug
  assert.equal(validateCommand(
    { playerId: 2, angle: 1, power: 50, tick: 10 },
    { currentTick: 10, activePlayerId: 1, knownPlayerIds: known }
  ).valid, false);

  // Unbekannter Spieler
  assert.equal(validateCommand(
    { playerId: 99, angle: 1, power: 50, tick: 10 },
    { currentTick: 10, activePlayerId: 99, knownPlayerIds: known }
  ).valid, false);

  // Kraft ausserhalb der Grenzen
  assert.equal(validateCommand(
    { playerId: 1, angle: 1, power: 500, tick: 10 },
    { currentTick: 10, activePlayerId: 1, knownPlayerIds: known }
  ).valid, false);

  // Winkel ausserhalb der Grenzen
  assert.equal(validateCommand(
    { playerId: 1, angle: 9, power: 50, tick: 10 },
    { currentTick: 10, activePlayerId: 1, knownPlayerIds: known }
  ).valid, false);

  // Unbekannte Waffe
  assert.equal(validateCommand(
    { playerId: 1, angle: 1, power: 50, weaponId: 'cheat_gun', tick: 10 },
    { currentTick: 10, activePlayerId: 1, knownPlayerIds: known }
  ).valid, false);

  // Gültiger Befehl geht durch
  const valid = validateCommand(
    { playerId: 1, angle: 1, power: 50, tick: 10 },
    { currentTick: 10, activePlayerId: 1, knownPlayerIds: known }
  );
  assert.equal(valid.valid, true);
  assert.equal(valid.input.power, 50);

  assert.equal(isTickInWindow(10, 10), true);
  assert.equal(isTickInWindow(400, 500), true);
  // Drift von 490 Ticks liegt ausserhalb des 400-Tick-Fensters.
  assert.equal(isTickInWindow(10, 500), false);
  assert.equal(isTickInWindow(10, 5000), false);
});
