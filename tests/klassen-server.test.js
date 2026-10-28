/**
 * Klassenfassung online: Neue Partien laufen mit Fassung 2, und der Server reicht sie wie `waffen`/`gelaende`
 * über welcome an den Client (Anzeige, Schussvorhersage).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { KLASSEN_STANDARD } from '../src/shared/config/klassen-fassung.js';
import { starteServer, erstelleLobby, trittBei } from './helfer/server-testclient.js';

test('welcome trägt die Klassenfassung des Servers (Standard)', async () => {
  const { server, url, wsUrl } = await starteServer();
  const lobby = await erstelleLobby(url, { teams: 2, playersPerTeam: 1, seed: 31 });
  const a = await trittBei(wsUrl, lobby.lobby.id, { name: 'A', token: lobby.player.token });
  try {
    assert.equal(a.welcome.klassen, KLASSEN_STANDARD);
  } finally { a.client.close(); await server.close?.(); }
});
