/**
 * Server: neue Lobbys nur im Querformat (Entscheidung des Auftraggebers 2026-11-04).
 *
 * „Nimm Hochformat ganz raus, nur quer und fertig." Der Server vertraut dem Client nie (AGENTS.md §6):
 * Auch wenn Menü und Lobby kein Hochformat mehr anbieten, könnte ein alter oder fremder Client
 * `orientation: 'portrait'` schicken. Das wird mit lesbarem Grund abgelehnt (400), nicht still
 * umgedeutet. Eine gesicherte Lobby von vor der Entscheidung wird beim Neustart weiter
 * wiederhergestellt (`persistence.js`), und die Engine spielt alte Hochformat-Aufzeichnungen
 * (siehe `replay-hochformat.test.js`).
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { LobbyManager } from '../src/server/lobby.js';
import { restoreLobby } from '../src/server/persistence.js';
import { MatchController } from '../src/engine/match.js';
import { starteServer } from './helfer/server-testclient.js';

test('LobbyManager: neue Lobby im Hochformat wird abgelehnt, Querformat und Vorgabe gehen', () => {
  const lobbies = new LobbyManager();
  assert.throws(() => lobbies.create({ orientation: 'portrait' }), /nur im Querformat/);
  assert.throws(() => lobbies.create({ orientation: 'schraeg' }), /Unbekannte Ausrichtung/);
  assert.equal(lobbies.create({ orientation: 'landscape' }).lobby.orientation, 'landscape');
  assert.equal(lobbies.create({}).lobby.orientation, 'landscape');
});

test('HTTP: POST /api/lobby/create mit orientation portrait endet als 400 mit Grund', async () => {
  const { server, url } = await starteServer();
  try {
    const antwort = await fetch(`${url}/api/lobby/create`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ teams: 2, orientation: 'portrait' }),
    });
    assert.equal(antwort.status, 400);
    assert.match((await antwort.json()).error, /Hochformat wird nicht mehr angeboten/);

    const quer = await fetch(`${url}/api/lobby/create`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ teams: 2 }),
    });
    assert.equal(quer.status, 201);
    assert.equal((await quer.json()).lobby.orientation, 'landscape');
  } finally {
    await server.close();
  }
});

test('Wiederherstellung: eine gesicherte Hochformat-Lobby von vor der Entscheidung läuft weiter', () => {
  const lobbyManager = new LobbyManager();
  const gesichert = {
    id: 'alt-hoch', teams: 2, playersPerTeam: 1, preset: 'hills', orientation: 'portrait', seed: 77, seats: [],
  };
  assert.doesNotThrow(() => restoreLobby(gesichert, {
    lobbyManager,
    createSession: l => ({ match: new MatchController({ seed: l.seed, orientation: l.orientation }) }),
  }));
  assert.equal(lobbyManager.get('alt-hoch')?.orientation, 'portrait');
});
