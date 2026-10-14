import assert from 'node:assert/strict';
import test from 'node:test';
import { GameServer } from '../src/server/gameServer.js';

/* Server-Befunde des Audits vom 2026-10-13: Validierung, Begrenzung, Aufräumen. */

async function start(opts = {}) {
  const server = new GameServer(opts);
  const info = await server.listen(0);
  return { server, url: info.url };
}
const post = (url, body) => fetch(`${url}/api/lobby/create`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});

test('Ungültige Lobby-Parameter ergeben 400 und legen KEINE Lobby an', async () => {
  const { server, url } = await start({ maxLobbyAnlegenProMinute: 1000 });
  try {
    for (const body of [
      { teams: 2.5 }, { teams: 'abc' }, { seed: -1 }, { seed: 1.5 }, { seed: 2 ** 33 },
      { preset: { x: 1 } }, { name: 'x'.repeat(5000) }, { playersPerTeam: 2.5 }, '{kaputt', 'null',
    ]) {
      const antwort = await post(url, body);
      assert.equal(antwort.status, 400, `Body ${JSON.stringify(body).slice(0, 40)} wurde nicht abgelehnt`);
    }
    assert.equal(server.lobbyManager.size, 0, 'abgelehnte Anfragen dürfen keine Karteileichen hinterlassen');
    assert.equal((await post(url, { teams: 2, seed: 5 })).status, 201);
  } finally { await server.close(); }
});

test('Zu viele Lobbys (503) und zu schnelles Anlegen je Adresse (429)', async () => {
  const a = await start({ maxLobbies: 1 });
  try {
    assert.equal((await post(a.url, {})).status, 201);
    assert.equal((await post(a.url, {})).status, 503);
  } finally { await a.server.close(); }

  const b = await start({ maxLobbyAnlegenProMinute: 2 });
  try {
    assert.equal((await post(b.url, {})).status, 201);
    assert.equal((await post(b.url, {})).status, 201);
    assert.equal((await post(b.url, {})).status, 429);
  } finally { await b.server.close(); }
});

test('Eine Lobby ohne jede Verbindung wird nach der Frist samt Sitzung entfernt', async () => {
  const { server, url } = await start({ lobbyLeerTtlMs: 1000 });
  try {
    const antwort = await post(url, { teams: 2, seed: 9 });
    assert.equal(antwort.status, 201);
    const t0 = Date.now();
    server.pruneLobbies(t0);
    assert.equal(server.lobbyManager.size, 1, 'beim ersten Sehen bleibt sie');
    server.pruneLobbies(t0 + 500);
    assert.equal(server.lobbyManager.size, 1, 'vor Ablauf der Frist bleibt sie');
    server.pruneLobbies(t0 + 1500);
    assert.equal(server.lobbyManager.size, 0, 'nach der Frist ist sie weg');
  } finally { await server.close(); }
});

test('Verwaiste Lobby: mit verbundenem Socket bleibt sie, ohne ihn werden Lobby UND Sitzung entfernt', async () => {
  const { WebSocket } = await import('ws');
  const { CONTROL, controlMessage } = await import('../src/shared/protocol.js');
  const { server, url } = await start({ lobbyLeerTtlMs: 1000 });
  try {
    const erzeugt = await (await post(url, { teams: 2, playersPerTeam: 1, seed: 9 })).json();
    const ws = new WebSocket(url.replace('http', 'ws') + '/ws');
    await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
    ws.send(controlMessage(CONTROL.JOIN_LOBBY, { lobbyId: erzeugt.lobby.id, name: 'A', token: erzeugt.player?.token }));
    for (let i = 0; i < 100 && server.sessionCount === 0; i += 1) await new Promise(r => setTimeout(r, 20));
    assert.equal(server.sessionCount, 1, 'Sitzung entstand');

    const t0 = Date.now();
    server.pruneLobbies(t0);
    server.pruneLobbies(t0 + 60_000);
    assert.equal(server.lobbyManager.size, 1, 'mit verbundenem Socket wird nichts entfernt');
    assert.equal(server.sessionCount, 1);

    ws.close();
    for (let i = 0; i < 100 && server.getSession(erzeugt.lobby.id)?.clients.size > 0; i += 1) await new Promise(r => setTimeout(r, 20));
    const t1 = t0 + 120_000;
    server.pruneLobbies(t1);
    server.pruneLobbies(t1 + 1500);
    assert.equal(server.lobbyManager.size, 0, 'Lobby weg');
    assert.equal(server.sessionCount, 0, 'Sitzung weg (Speicher frei)');
  } finally { await server.close(); }
});
