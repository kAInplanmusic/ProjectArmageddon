import assert from 'node:assert/strict';
import test from 'node:test';
import { request as httpAnfrage } from 'node:http';
import WebSocket from 'ws';
import { GameServer, leseErlaubteOrigins } from '../src/server/gameServer.js';

/*
 * SRV-4: Origin-Prüfung an Lobby-API (CORS) und WebSocket — nur mit Schalter (`erlaubteOrigins` bzw.
 * `PA_ERLAUBTE_ORIGINS`). Ohne Schalter bleibt alles wie bisher (jeder Origin).
 */

async function start(opts = {}) {
  const server = new GameServer({ erlaubteOrigins: null, ...opts });
  const info = await server.listen(0);
  return { server, url: info.url, port: info.port };
}

const wsVersuch = (port, origin) => new Promise(resolve => {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`, origin ? { origin } : {});
  socket.on('open', () => { socket.close(); resolve('offen'); });
  socket.on('unexpected-response', (_req, res) => { resolve(res.statusCode); });
  socket.on('error', () => resolve('fehler'));
});

test('leseErlaubteOrigins: leer = keine Prüfung, sonst bereinigte Liste', () => {
  assert.equal(leseErlaubteOrigins(undefined), null);
  assert.equal(leseErlaubteOrigins(''), null);
  assert.equal(leseErlaubteOrigins(' , '), null);
  assert.deepEqual(leseErlaubteOrigins('https://a.example/, http://127.0.0.1:5173'), ['https://a.example', 'http://127.0.0.1:5173']);
  // Review 2026-11-04: Browser schicken den Origin klein geschrieben.
  assert.deepEqual(leseErlaubteOrigins('https://Spiel.EXAMPLE'), ['https://spiel.example']);
});

test('Standard (ohne Liste): CORS spiegelt jeden Origin, WebSocket nimmt jeden an', async () => {
  const { server, url, port } = await start();
  try {
    const antwort = await fetch(`${url}/healthz`, { headers: { origin: 'https://fremd.example' } });
    assert.equal(antwort.headers.get('access-control-allow-origin'), 'https://fremd.example');
    const vorab = await fetch(`${url}/api/lobby/create`, { method: 'OPTIONS', headers: { origin: 'https://fremd.example' } });
    assert.equal(vorab.status, 204);
    assert.equal(await wsVersuch(port, 'https://fremd.example'), 'offen');
  } finally { await server.close(); }
});

test('Mit Liste: erlaubter, eigener und fehlender Origin gehen, fremder wird abgelehnt', async () => {
  const { server, url, port } = await start({ erlaubteOrigins: ['https://spiel.example'] });
  try {
    const erlaubt = await fetch(`${url}/healthz`, { headers: { origin: 'https://spiel.example' } });
    assert.equal(erlaubt.headers.get('access-control-allow-origin'), 'https://spiel.example');

    const fremdGet = await fetch(`${url}/healthz`, { headers: { origin: 'https://fremd.example' } });
    assert.equal(fremdGet.headers.get('access-control-allow-origin'), null, 'keine CORS-Freigabe für Fremde');
    const fremdVorab = await fetch(`${url}/api/lobby/create`, { method: 'OPTIONS', headers: { origin: 'https://fremd.example' } });
    assert.equal(fremdVorab.status, 403);
    const fremdPost = await fetch(`${url}/api/lobby/create`, {
      method: 'POST', headers: { origin: 'https://fremd.example', 'content-type': 'application/json' }, body: '{}',
    });
    assert.equal(fremdPost.status, 403);
    assert.equal(server.lobbyManager.size, 0, 'abgelehnter Origin legt keine Lobby an');

    assert.equal(await wsVersuch(port, 'https://fremd.example'), 403);
    assert.equal(await wsVersuch(port, 'https://spiel.example'), 'offen');
    assert.equal(await wsVersuch(port, `http://127.0.0.1:${port}`), 'offen', 'gleicher Origin');
    assert.equal(await wsVersuch(port, null), 'offen', 'ohne Origin (kein Browser)');
  } finally { await server.close(); }
});

/*
 * Review 2026-11-04: Mit `eigenerOrigin` (`PA_EIGENER_ORIGIN`) wird dem `Host`-Header nicht mehr vertraut.
 * DNS-Rebinding: Eine fremde Domain zeigt auf die Server-IP und schickt `Origin` und `Host` passend
 * zueinander — ohne Schalter ginge sie als „gleicher Origin“ durch, mit Schalter nicht.
 */
test('Eigener Origin gesetzt: zueinander passende fremde Origin- und Host-Header werden abgelehnt', async () => {
  const offen = await start({ erlaubteOrigins: ['https://andere.example'] });
  const streng = await start({ erlaubteOrigins: ['https://andere.example'], eigenerOrigin: 'https://Spiel.example/' });
  const rebind = { origin: 'http://boese.example', host: 'boese.example' };
  try {
    // `fetch` setzt `Host` selbst; der Angriff braucht einen frei gewählten, darum node:http.
    const cors = port => new Promise((resolve, reject) => {
      const anfrage = httpAnfrage({ host: '127.0.0.1', port, path: '/healthz', headers: rebind }, res => {
        res.resume(); resolve(res.headers['access-control-allow-origin'] ?? null);
      });
      anfrage.on('error', reject);
      anfrage.end();
    });
    assert.equal(await cors(offen.port), 'http://boese.example', 'ohne Schalter: Host-Abgleich wie bisher');
    assert.equal(await cors(streng.port), null, 'mit Schalter: keine Freigabe');
    assert.equal(await wsVersuch(streng.port, 'https://spiel.example'), 'offen', 'eigener Origin (bereinigt)');
    assert.equal(await wsVersuch(streng.port, `http://127.0.0.1:${streng.port}`), 403, 'Host-Abgleich aus');
    assert.equal(await wsVersuch(streng.port, 'https://andere.example'), 'offen', 'Liste gilt weiter');
  } finally { await offen.server.close(); await streng.server.close(); }
});

test('WebSocket nur unter /ws: anderer Pfad wird mit 400 abgelehnt', async () => {
  const { server, port } = await start();
  try {
    const status = await new Promise(resolve => {
      const socket = new WebSocket(`ws://127.0.0.1:${port}/anders`);
      socket.on('open', () => { socket.close(); resolve('offen'); });
      socket.on('unexpected-response', (_req, res) => resolve(res.statusCode));
      socket.on('error', () => resolve('fehler'));
    });
    assert.equal(status, 400);
    assert.equal(await wsVersuch(port, null), 'offen');
  } finally { await server.close(); }
});
