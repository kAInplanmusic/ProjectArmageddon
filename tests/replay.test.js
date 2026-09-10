import assert from 'node:assert/strict';
import test from 'node:test';
import { MatchController } from '../src/engine/match.js';
import { ReplayRecorder, playReplay, REPLAY_FORMAT_VERSION } from '../src/engine/replay.js';

/**
 * Führt ein Match mit skriptgesteuerten Eingaben aus und zeichnet sie auf.
 * Dient als gemeinsame Grundlage für die Determinismus-Prüfungen.
 */
function runRecordedMatch({ seed = 20260910, teams = 2, playersPerTeam = 2 } = {}) {
  const match = new MatchController({ seed, teams, playersPerTeam, turnDurationMs: 3000, maxRounds: 8 });
  match.start();

  const recorder = new ReplayRecorder({
    seed,
    teams,
    playersPerTeam,
    preset: 'hills',
    maxRounds: match.maxRounds,
    turnDurationMs: match.turnDurationMs });

  const hashes = [];
  let shots = 0;
  let guard = 0;
  // Obergrenze: 8 Runden à 4 Spielern à 3 s Zugzeit ≈ 8*4*180 Ticks, plus Reserve.
  const tickBudget = 30_000;

  while (match.status === 'playing' && guard < tickBudget) {
    const state = match.getState();
    const active = state.activePlayerId;

    // Pro Zug ein Schuss, sobald der Zug frisch ist.
    if (active !== null && state.turnElapsedMs < 20) {
      const angle = Math.PI / 4 + (shots % 7) * 0.06;
      const power = 55 + (shots % 5) * 8;
      const result = match.fire(active, angle, power);
      if (result.ok) {
        recorder.recordInput({
          tick: match.world.tickCount,
          playerId: active,
          angle,
          power });
        shots += 1;
      }
    }

    match.step();
    match.consumeEvents();
    guard += 1;
    if (guard % 200 === 0) hashes.push(match.stateHash());
  }

  // Aufzeichnung abschließen: erst dadurch weiß das Replay, wie weit es läuft.
  recorder.finalize(match.world.tickCount);
  return { match, recorder, shots, hashes };
}

test('Replay reproduziert das Match exakt', () => {
  const live = runRecordedMatch({ seed: 4242 });
  assert.ok(live.shots > 0, 'Testaufbau muss Schüsse produzieren');
  assert.ok(live.recorder.totalTicks > 0, 'Aufzeichnung muss eine Tickzahl haben');

  const { match: replayed, appliedInputs, rejected } = playReplay(live.recorder);

  assert.equal(rejected.length, 0, `Alle Eingaben müssen gültig sein: ${JSON.stringify(rejected.slice(0, 2))}`);
  assert.equal(appliedInputs, live.shots, 'Jede aufgezeichnete Eingabe muss angewendet werden');
  assert.equal(replayed.status, live.match.status, 'Endstatus muss übereinstimmen');
  assert.equal(replayed.round, live.match.round, 'Rundenzahl muss übereinstimmen');
  assert.equal(
    replayed.seedManager.baseSeed,
    live.match.seedManager.baseSeed,
    'Seed muss übereinstimmen',
  );

  // Der Zustandshash ist der härteste Vergleich: er umfasst Positionen,
  // Gesundheit, Tick, Runde, Wind und aktiven Spieler.
  assert.equal(replayed.stateHash(), live.match.stateHash(), 'Zustandshash muss identisch sein');
});

test('Replay ist unabhängig von der Konfiguration reproduzierbar', () => {
  const a = runRecordedMatch({ seed: 777, teams: 3, playersPerTeam: 1 });
  const b = runRecordedMatch({ seed: 777, teams: 3, playersPerTeam: 1 });

  assert.equal(a.match.stateHash(), b.match.stateHash(), 'Zwei Läufe müssen identisch sein');
  assert.deepEqual(a.hashes, b.hashes, 'Zwischenhashes müssen identisch sein');

  const replayedA = playReplay(a.recorder);
  assert.equal(replayedA.match.stateHash(), a.match.stateHash());
});

test('Unterschiedliche Seeds erzeugen unterschiedliche Replays', () => {
  const a = runRecordedMatch({ seed: 1000 });
  const b = runRecordedMatch({ seed: 2000 });
  assert.notEqual(a.match.stateHash(), b.match.stateHash());
});

test('Replay lässt sich serialisieren und wieder einlesen', () => {
  const { recorder, match } = runRecordedMatch({ seed: 31337, playersPerTeam: 1 });

  const text = recorder.serialize();
  assert.ok(text.length > 0);
  const parsed = JSON.parse(text);
  assert.equal(parsed.format, REPLAY_FORMAT_VERSION);
  assert.equal(parsed.seed, 31337);
  assert.equal(parsed.entries.length, recorder.entryCount);
  assert.equal(parsed.config.teams, 2);
  assert.equal(parsed.totalTicks, recorder.totalTicks);

  const restored = ReplayRecorder.deserialize(text);
  assert.equal(restored.seed, recorder.seed);
  assert.equal(restored.entryCount, recorder.entryCount);
  assert.equal(restored.totalTicks, recorder.totalTicks);
  assert.deepEqual(restored.config, recorder.config);

  // Das wiederhergestellte Replay muss ebenfalls exakt reproduzieren.
  const { match: replayed } = playReplay(restored);
  assert.equal(replayed.stateHash(), match.stateHash());
});

test('Replay kann bis zu einem bestimmten Tick vorgespult werden', () => {
  const { recorder, match } = runRecordedMatch({ seed: 5555, playersPerTeam: 1 });

  const halfway = Math.floor(match.world.tickCount / 2);
  const { match: partial, ticks } = playReplay(recorder, { untilTick: halfway });

  assert.equal(ticks, halfway, 'Es müssen genau die angeforderten Ticks laufen');
  assert.equal(partial.world.tickCount, halfway);
  assert.equal(partial.status, 'playing');
  // Der Teilzustand darf noch nicht dem Endzustand entsprechen.
  assert.notEqual(partial.stateHash(), match.stateHash());
});

test('Replay meldet ungültige Eingaben statt still zu scheitern', () => {
  const match = new MatchController({ seed: 606, teams: 2, playersPerTeam: 1 });
  match.start();

  const recorder = new ReplayRecorder({ seed: 606, teams: 2, playersPerTeam: 1, preset: 'hills' });
  // Ein Spieler, der nicht am Zug ist.
  const wrongPlayer = match.players.find(player => player.entityId !== match.activePlayerId).entityId;
  recorder.recordInput({ tick: 0, playerId: wrongPlayer, angle: 1, power: 50 });

  const { rejected, appliedInputs } = playReplay(recorder);
  assert.equal(appliedInputs, 0);
  assert.equal(rejected.length, 1);
  assert.ok(rejected[0].errors.length > 0);
});

test('Replay deckt Mahlstrom und Rundenwechsel ab', () => {
  // Bewusst OHNE Schüsse: tödliche Treffer würden das Match vor Runde 15
  // beenden. Kurze Zugzeit, damit die Runden ohne Echtzeit-Wartezeit laufen.
  const match = new MatchController({
    seed: 12321, teams: 2, playersPerTeam: 1, turnDurationMs: 100, maxRounds: 20 });
  match.start();

  const recorder = new ReplayRecorder({
    seed: 12321, teams: 2, playersPerTeam: 1, preset: 'hills',
    maxRounds: match.maxRounds, turnDurationMs: match.turnDurationMs });

  const roundMarks = [];
  let guard = 0;
  let lastRound = match.round;
  while (match.status === 'playing' && match.round < 18 && guard < 60_000) {
    match.step();
    for (const event of match.consumeEvents()) {
      if (event.type === 'round_start') {
        recorder.recordRound(event.payload.round, match.world.tickCount);
      }
    }
    if (match.round !== lastRound) {
      roundMarks.push(match.round);
      lastRound = match.round;
    }
    guard += 1;
  }

  assert.ok(match.round >= 15, `Testaufbau muss Runde 15 erreichen, war ${match.round}`);
  assert.equal(match.world.services.maelstrom.isActive, true, 'Mahlstrom muss aktiv sein');
  assert.ok(roundMarks.length >= 13, `Es müssen mehrere Runden durchlaufen worden sein: ${roundMarks.length}`);
  recorder.finalize(match.world.tickCount);

  const { match: replayed, rejected } = playReplay(recorder);
  assert.equal(rejected.length, 0);
  assert.equal(replayed.world.tickCount, match.world.tickCount, 'Tickzahl muss übereinstimmen');
  assert.equal(replayed.round, match.round, 'Runde muss übereinstimmen');
  assert.equal(
    replayed.world.services.maelstrom.inset,
    match.world.services.maelstrom.inset,
    'Mahlstrom-Kontraktion muss identisch verlaufen',
  );
  assert.equal(replayed.stateHash(), match.stateHash());
});

test('Rundengrenze beendet ein Match ohne tödliche Treffer', () => {
  // Ohne Rundengrenze würde ein Match bei fehlenden Treffern unbegrenzt laufen.
  const match = new MatchController({
    seed: 909, teams: 2, playersPerTeam: 1, turnDurationMs: 80, maxRounds: 5 });
  match.start();

  let guard = 0;
  while (match.status === 'playing' && guard < 40_000) {
    match.step();
    match.consumeEvents();
    guard += 1;
  }

  assert.equal(match.status, 'gameover', 'Match muss durch die Rundengrenze enden');
  assert.ok(match.round > 5, `Runde muss die Grenze überschritten haben: ${match.round}`);
  assert.equal(typeof match.winnerTeamId, 'number', 'Es muss ein Sieger ermittelt werden');
  assert.equal(match.players.every(player => player.entityId > 0), true);
});

test('Rundengrenze kürt das Team mit mehr verbleibender Gesundheit', () => {
  const match = new MatchController({
    seed: 4321, teams: 2, playersPerTeam: 2, turnDurationMs: 80, maxRounds: 4 });
  match.start();

  // Team 1 deutlich schwächen, Team 0 bleibt gesund.
  const teamOne = match.players.filter(player => player.teamId === 1);
  for (const player of teamOne) {
    match.world.setComponent(player.entityId, 'Health', 'current', 7);
  }

  let guard = 0;
  while (match.status === 'playing' && guard < 60_000) {
    match.step();
    match.consumeEvents();
    guard += 1;
  }

  assert.equal(match.status, 'gameover');
  assert.equal(match.winnerTeamId, 0, 'Das gesündere Team muss gewinnen');
});
