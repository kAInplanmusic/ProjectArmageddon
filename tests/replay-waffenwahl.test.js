import assert from 'node:assert/strict';
import test from 'node:test';
import { LobbyManager } from '../src/server/lobby.js';
import { LobbySession } from '../src/server/gameServer.js';
import { playReplay } from '../src/engine/replay.js';

/**
 * Regression (Audit 2026-10-09): Die Waffenwahl wurde nicht aufgezeichnet, der
 * Client schickt `weaponId:null` — das Replay feuerte die Standardwaffe.
 */
test('Replay gibt einen Schuss mit gewählter Nicht-Standardwaffe exakt wieder', () => {
  const manager = new LobbyManager();
  const { lobby } = manager.create({ teams: 2, playersPerTeam: 1, seed: 4242, preset: 'hills' });
  manager.join(lobby.id, { name: 'B' });
  const gesamt = manager.get(lobby.id);
  const session = new LobbySession(gesamt, {});
  session.syncSeats();

  const match = session.match;
  const aktiv = match.activePlayerId;
  const platz = gesamt.seats.find(seat => seat.entityId === aktiv);
  const standard = match.inventory.getActiveWeaponId(aktiv);
  const andere = [...match.inventory.getWeapons(aktiv)].find(id => id !== standard);
  assert.ok(andere, 'Testaufbau: es braucht eine zweite Waffe');

  assert.equal(session.handleWeaponSelect(platz.token, andere).ok, true);
  const schuss = session.handleInput(platz.token, {
    angle: 1.0, power: 60, weaponId: null, tick: match.world.tickCount,
  });
  assert.equal(schuss.ok, true);

  for (let i = 0; i < 600; i++) session.stepSimulation(1);

  const aufnahme = session.toPersisted().replay;
  assert.equal(aufnahme.entries[0].weaponId, andere, 'aufgezeichnet wird die aufgelöste Waffe');
  const wiedergabe = playReplay(aufnahme);
  assert.equal(wiedergabe.match.stateHash(), match.stateHash(), 'Replay muss den Live-Zustand treffen');
});
