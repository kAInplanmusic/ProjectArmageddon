import assert from 'node:assert/strict';
import test from 'node:test';
import { MatchController } from '../src/engine/match.js';
import { ReplayRecorder, ReplayPlayer } from '../src/engine/replay.js';
import { LobbyManager } from '../src/server/lobby.js';
import { serializeLobby, restoreLobby } from '../src/server/persistence.js';
import { hashState } from '../src/engine/stateSnapshot.js';

/* Befunde des Audits vom 2026-10-13 (siehe MASTERDOTO.md). */

test('Spawn: keine zwei Figuren auf demselben Platz (Kartentyp autonom, viele Teams)', () => {
  for (const [teams, spieler] of [[3, 5], [4, 4], [2, 5]]) {
    for (let seed = 1; seed <= 25; seed += 1) {
      const m = new MatchController({ seed, teams, playersPerTeam: spieler, preset: 'hills', kartentyp: 'autonom' });
      m.start();
      const xs = m.getState().entities.map(e => e.x).sort((a, b) => a - b);
      for (let i = 1; i < xs.length; i += 1) {
        assert.ok(xs[i] - xs[i - 1] >= 14, `Seed ${seed}, ${teams}×${spieler}: Abstand ${xs[i] - xs[i - 1]} px`);
      }
    }
  }
});

test('Replay-Kopf trägt Kartentyp und Ausrichtung: dieselbe Karte, derselber Hash', () => {
  const live = new MatchController({ seed: 5, teams: 2, playersPerTeam: 2, preset: 'hills', kartentyp: 'autonom', turnDurationMs: 20_000 });
  live.start();
  const rec = new ReplayRecorder({ seed: 5, teams: 2, playersPerTeam: 2, preset: 'hills', kartentyp: 'autonom', turnDurationMs: 20_000 });
  for (let i = 0; i < 300; i += 1) { live.step(); live.consumeEvents(); }
  rec.setTotalTicks?.(300);
  const json = JSON.parse(JSON.stringify(rec.toJSON()));
  assert.equal(json.config.kartentyp, 'autonom');
  const player = new ReplayPlayer(json, { untilTick: 300 });
  for (let i = 0; i < 300; i += 1) { player.match.step(); player.match.consumeEvents(); }
  assert.equal(hashState(player.match.getState()), hashState(live.getState()));
});

test('Sicherung und Wiederherstellung behalten Kartentyp, Sidegrades, Loadouts und die Teams der Plätze', () => {
  const manager = new LobbyManager();
  const { lobby } = manager.create({
    teams: 2, playersPerTeam: 2, preset: 'hills', kartentyp: 'autonom', seed: 77, hostName: 'A',
  });
  manager.join(lobby.id, { name: 'B' });
  const gespeichert = JSON.parse(JSON.stringify(serializeLobby(manager.get(lobby.id), null)));
  assert.equal(gespeichert.kartentyp, 'autonom');
  for (const sitz of gespeichert.seats) {
    assert.ok(Number.isInteger(sitz.teamId) && Number.isInteger(sitz.figureIndex), 'Team und Figurplatz fehlen');
  }

  const frisch = new LobbyManager();
  const { lobby: wieder } = restoreLobby(gespeichert, { lobbyManager: frisch, createSession: () => null });
  assert.equal(wieder.kartentyp, 'autonom');
  assert.deepEqual(wieder.seats.map(s => [s.teamId, s.figureIndex]), gespeichert.seats.map(s => [s.teamId, s.figureIndex]));

  // Ein Fremder bekommt keinen Platz mehr, der schon einem Team gehört.
  assert.throws(() => frisch.join(wieder.id, { name: 'Fremder' }), /besetzt/);
});
