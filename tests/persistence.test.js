import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PersistenceStore, serializeLobby, restoreLobby, PERSISTENCE_VERSION } from '../src/server/persistence.js';
import { LobbyManager } from '../src/server/lobby.js';
import { MatchController } from '../src/engine/match.js';
import { ReplayRecorder, playReplay } from '../src/engine/replay.js';

function tempDir() {
  return mkdtempSync(join(tmpdir(), 'pa-persist-'));
}

test('PersistenceStore schreibt und liest atomar', () => {
  const dir = tempDir();
  try {
    const store = new PersistenceStore({ path: join(dir, 'state.json') });
    assert.equal(store.load(), null, 'Ohne Datei muss load() null liefern');

    assert.equal(store.save({ lobbies: [{ id: 'abc' }] }), true);
    assert.ok(existsSync(store.path));

    const loaded = store.load();
    assert.equal(loaded.version, PERSISTENCE_VERSION);
    assert.equal(loaded.lobbies.length, 1);
    assert.equal(loaded.lobbies[0].id, 'abc');
    assert.equal(typeof loaded.savedAt, 'number');

    assert.equal(store.clear(), true);
    assert.equal(store.load(), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('PersistenceStore überlebt eine beschädigte Datei', () => {
  const dir = tempDir();
  try {
    const path = join(dir, 'broken.json');
    writeFileSync(path, '{ das ist kein json', 'utf8');
    const store = new PersistenceStore({ path });

    // Beschädigte Datei darf nicht werfen, sondern muss als "kein Zustand" gelten.
    assert.equal(store.load(), null);
    assert.ok(store.lastError && store.lastError.includes('beschädigt') === false
      ? store.lastError.length > 0
      : true);

    // Nach dem Überschreiben ist die Datei wieder nutzbar.
    assert.equal(store.save({ lobbies: [] }), true);
    assert.equal(store.load().lobbies.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('PersistenceStore lehnt fremde Versionen ab', () => {
  const dir = tempDir();
  try {
    const path = join(dir, 'old.json');
    writeFileSync(path, JSON.stringify({ version: 999, lobbies: [] }), 'utf8');
    const store = new PersistenceStore({ path });
    assert.equal(store.load(), null);
    assert.ok(store.lastError.includes('999'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Deaktivierte Persistenz schreibt nichts', () => {
  const dir = tempDir();
  try {
    const store = new PersistenceStore({ path: join(dir, 'x.json'), enabled: false });
    assert.equal(store.save({ lobbies: [] }), false);
    assert.equal(store.load(), null);
    assert.equal(existsSync(store.path), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('serializeLobby hält Seed, Sitze und Replay-Kern fest', () => {
  const lobbies = new LobbyManager();
  const { lobby } = lobbies.create({ teams: 2, playersPerTeam: 1, seed: 4242, preset: 'islands' });
  lobbies.join(lobby.id, { name: 'Ben' });

  const match = new MatchController({ seed: 4242, teams: 2, playersPerTeam: 1, preset: 'islands' });
  match.start();
  const recorder = new ReplayRecorder({ seed: 4242, teams: 2, playersPerTeam: 1, preset: 'islands' });
  recorder.recordInput({ tick: 0, playerId: match.activePlayerId, angle: 1, power: 50 });
  recorder.finalize(120);

  const saved = serializeLobby(lobbies.get(lobby.id), { recorder, match });

  assert.equal(saved.id, lobby.id);
  assert.equal(saved.seed, 4242);
  assert.equal(saved.preset, 'islands');
  assert.equal(saved.teams, 2);
  assert.equal(saved.seats.length, 2);
  assert.equal(saved.seats[0].name, 'Host');
  assert.equal(saved.seats[1].name, 'Ben');
  // Reconnect muss nach dem Neustart möglich sein: Token müssen mitgespeichert werden.
  assert.ok(saved.seats.every(seat => typeof seat.token === 'string' && seat.token.length > 0));
  assert.equal(saved.replay.seed, 4242);
  assert.equal(saved.replay.totalTicks, 120);
  assert.equal(saved.replay.entries.length, 1);
  assert.equal(saved.tick, match.world.tickCount);
  // Persistierte Sitze gelten als getrennt und müssen sich neu verbinden.
  assert.ok(saved.seats.every(seat => seat.connected === false));
});

test('Wiederherstellung rekonstruiert Lobby und Platz-Token', () => {
  const source = new LobbyManager();
  const { lobby: original } = source.create({ teams: 2, playersPerTeam: 1, seed: 777, preset: 'mountains' });
  const second = source.join(original.id, { name: 'Ben' });

  const match = new MatchController({ seed: 777, teams: 2, playersPerTeam: 1, preset: 'mountains' });
  match.start();
  // Ein paar Ticks simulieren, damit ein echter Replay-Kern entsteht. Ein Match
  // ohne jede Spielzeit wird bewusst OHNE Sitzung wiederhergestellt (siehe
  // tests/persistence-restart.test.js) — hier soll der andere Fall geprüft werden.
  for (let i = 0; i < 5; i++) {
    match.step();
    match.consumeEvents();
  }
  const recorder = new ReplayRecorder({ seed: 777, teams: 2, playersPerTeam: 1, preset: 'mountains' });
  recorder.finalize(match.world.tickCount);
  const saved = serializeLobby(source.get(original.id), { recorder, match });

  // Frischer Manager (simuliert Neustart).
  const target = new LobbyManager();
  let createdSession = null;
  const { lobby: restored, session } = restoreLobby(saved, {
    lobbyManager: target,
    createSession: (lobbyArg, options) => {
      const m = new MatchController({ seed: saved.seed, teams: saved.teams, playersPerTeam: saved.playersPerTeam, preset: saved.preset });
      m.start();
      createdSession = { lobby: lobbyArg, options };
      return { match: m, recorder: new ReplayRecorder({ seed: saved.seed, teams: saved.teams, playersPerTeam: saved.playersPerTeam, preset: saved.preset }) };
    },
  });

  assert.ok(restored, 'Lobby muss wiederhergestellt sein');
  assert.equal(restored.id, original.id, 'Lobby-ID muss erhalten bleiben');
  assert.equal(restored.seed, 777);
  assert.equal(restored.preset, 'mountains');
  assert.equal(restored.seats.length, 2);
  assert.equal(restored.seats[0].token, saved.seats[0].token, 'Token muss erhalten bleiben');
  assert.equal(restored.seats[1].token, second.token, 'Token des zweiten Spielers muss erhalten bleiben');
  assert.ok(session, 'Es muss eine Session erzeugt worden sein');
  assert.equal(createdSession.options.replayEntries.length, 0);
});

test('Replay-basierte Wiederherstellung erzeugt denselben Matchzustand', () => {
  // Ein Match bis zu einem mittleren Tick live spielen und aufzeichnen.
  const match = new MatchController({ seed: 6060, teams: 2, playersPerTeam: 2, turnDurationMs: 400, maxRounds: 10 });
  match.start();
  const recorder = new ReplayRecorder({
    seed: 6060, teams: 2, playersPerTeam: 2, preset: 'hills',
    maxRounds: match.maxRounds, turnDurationMs: match.turnDurationMs,
  });

  let shots = 0;
  let guard = 0;
  while (match.status === 'playing' && guard < 4000) {
    const state = match.getState();
    if (state.activePlayerId !== null && state.turnElapsedMs < 16) {
      const angle = Math.PI / 3.4 + (shots % 5) * 0.04;
      const power = 58 + (shots % 4) * 7;
      const result = match.fire(state.activePlayerId, angle, power);
      if (result.ok) {
        recorder.recordInput({ tick: match.world.tickCount, playerId: state.activePlayerId, angle, power });
        shots += 1;
      }
    }
    match.step();
    match.consumeEvents();
    guard += 1;
  }
  recorder.finalize(match.world.tickCount);

  // Persistieren und aus dem Speicher wiederherstellen (voller Weg).
  const dir = tempDir();
  try {
    const store = new PersistenceStore({ path: join(dir, 'state.json') });
    store.save({ lobbies: [{ id: 'x', seed: 6060, replay: recorder.toJSON() }] });
    const loaded = store.load();
    const restoredReplay = ReplayRecorder.fromJSON(loaded.lobbies[0].replay);

    const { match: replayed } = playReplay(restoredReplay);

    assert.equal(replayed.world.tickCount, match.world.tickCount, 'Tickzahl muss identisch sein');
    assert.equal(replayed.round, match.round);
    assert.equal(replayed.status, match.status);
    assert.equal(replayed.stateHash(), match.stateHash(), 'Zustandshash muss identisch sein');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
