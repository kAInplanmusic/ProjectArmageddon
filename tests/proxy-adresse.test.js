/**
 * Client-Adresse hinter dem Reverse-Proxy (DEP-3): Das Lobby-Limit je Adresse zählt hinter
 * einem VERTRAUTEN Proxy den letzten `X-Forwarded-For`-Eintrag, sonst nie den Header.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { clientAdresse, leseVertrauteProxys } from '../src/server/clientAdresse.js';
import { GameServer } from '../src/server/gameServer.js';

const anfrage = (remoteAddress, xff) => ({ socket: { remoteAddress }, headers: xff === undefined ? {} : { 'x-forwarded-for': xff } });

test('leseVertrauteProxys: Liste, normalisiert; leer = aus', () => {
  assert.equal(leseVertrauteProxys(undefined), null);
  assert.equal(leseVertrauteProxys(' , '), null);
  assert.deepEqual([...leseVertrauteProxys('127.0.0.1, ::1,::ffff:10.0.0.1')], ['127.0.0.1', '::1', '10.0.0.1']);
});

test('clientAdresse: ohne Vertrauen zählt nur der Socket', () => {
  assert.equal(clientAdresse(anfrage('::ffff:127.0.0.1', '203.0.113.9'), null), '127.0.0.1');
  assert.equal(clientAdresse(anfrage('198.51.100.7', '203.0.113.9'), leseVertrauteProxys('127.0.0.1')), '198.51.100.7',
    'ein nicht vertrauter Absender kann sich keine Adresse ausdenken');
  assert.equal(clientAdresse({}, null), '?');
});

test('clientAdresse: vertrauter Proxy → letzter X-Forwarded-For-Eintrag', () => {
  const v = leseVertrauteProxys('127.0.0.1');
  assert.equal(clientAdresse(anfrage('127.0.0.1', '203.0.113.9'), v), '203.0.113.9');
  assert.equal(clientAdresse(anfrage('127.0.0.1', '1.2.3.4, 203.0.113.9'), v), '203.0.113.9', 'vordere Einträge sind fälschbar');
  assert.equal(clientAdresse(anfrage('::ffff:127.0.0.1', '2001:db8::1'), v), '2001:db8::1');
  assert.equal(clientAdresse(anfrage('127.0.0.1'), v), '127.0.0.1', 'ohne Kopf: der Proxy selbst');
  assert.equal(clientAdresse(anfrage('127.0.0.1', 'kein-ip<script>'), v), '127.0.0.1', 'Unsinn wird verworfen');
  assert.equal(clientAdresse(anfrage('127.0.0.1', 'x'.repeat(5000)), v), '127.0.0.1');
});

async function lege(info, xff) {
  const antwort = await fetch(`${info.url}/api/lobby/create`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': xff }, body: '{}',
  });
  await antwort.arrayBuffer();
  return antwort.status;
}

test('Lobby-Limit je Adresse hinter vertrautem Proxy: Spieler getrennt gezählt', async () => {
  const server = new GameServer({ maxLobbyAnlegenProMinute: 2, vertrauteProxys: leseVertrauteProxys('127.0.0.1,::1') });
  const info = await server.listen(0);
  try {
    assert.equal(await lege(info, '203.0.113.1'), 201);
    assert.equal(await lege(info, '203.0.113.1'), 201);
    assert.equal(await lege(info, '203.0.113.1'), 429);
    assert.equal(await lege(info, '203.0.113.2'), 201, 'ein anderer Spieler ist nicht betroffen');
  } finally {
    await server.close();
  }
});

test('Ohne vertrauten Proxy hilft ein gefälschter Kopf nicht gegen das Limit', async () => {
  const server = new GameServer({ maxLobbyAnlegenProMinute: 2, vertrauteProxys: null });
  const info = await server.listen(0);
  try {
    assert.equal(await lege(info, '203.0.113.1'), 201);
    assert.equal(await lege(info, '203.0.113.2'), 201);
    assert.equal(await lege(info, '203.0.113.3'), 429);
  } finally {
    await server.close();
  }
});
