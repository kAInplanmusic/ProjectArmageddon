import assert from 'node:assert/strict';
import test from 'node:test';
import { WebSocket } from 'ws';
import { GameServer, SNAPSHOT_HZ } from '../src/server/gameServer.js';
import { TokenBucket, RATE_STOSS, RATE_PRO_SEKUNDE } from '../src/server/rateLimit.js';
import { CONTROL, controlMessage, parseControlMessage } from '../src/shared/protocol.js';

/** Audit 2026-10-09: keine Mengenbegrenzung, jede Ablehnung eine Antwort. */
test('TokenBucket: Stoß erlaubt, danach Dauerrate, Auffüllen mit der Zeit', () => {
  let zeit = 0;
  const eimer = new TokenBucket({ rate: 10, stoss: 5, jetzt: () => zeit });
  for (let i = 0; i < 5; i++) assert.equal(eimer.erlaube(), true, `Stoß ${i}`);
  assert.equal(eimer.erlaube(), false, 'Stoß erschöpft');
  assert.equal(eimer.verworfeneInFolge, 1);
  zeit += 100; // 10/s -> ein Token
  assert.equal(eimer.erlaube(), true);
  assert.equal(eimer.verworfeneInFolge, 0);
  assert.equal(eimer.erlaube(), false);
  zeit += 10_000; // läuft über, aber nie über den Stoß hinaus
  let angenommen = 0;
  for (let i = 0; i < 20; i++) if (eimer.erlaube()) angenommen += 1;
  assert.equal(angenommen, 5);
  assert.ok(RATE_PRO_SEKUNDE >= 20 && RATE_STOSS >= 30, 'Standardgrenze lässt normales Spiel unberührt');
});

test('Eine Nachrichtenflut erzeugt höchstens einen Stoß an Antworten', { timeout: 30_000 }, async () => {
  const server = new GameServer();
  const { port, url } = await server.listen(0);
  try {
    const erstellt = await (await fetch(`${url}/api/lobby/create`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ teams: 2, playersPerTeam: 1, seed: 1 }),
    })).json();
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    let fehler = 0;
    socket.on('message', (raw, binaer) => {
      if (binaer) return;
      if (parseControlMessage(raw)?.t === CONTROL.ERROR) fehler += 1;
    });
    await new Promise(r => socket.once('open', r));
    socket.send(controlMessage(CONTROL.JOIN_LOBBY, { lobbyId: erstellt.lobby.id, name: 'A', token: erstellt.player.token }));
    await new Promise(r => setTimeout(r, 300));
    const vorher = fehler;
    const nachricht = controlMessage(CONTROL.INPUT, { angle: 1, power: 50, tick: 0 });
    for (let i = 0; i < 3000; i++) socket.send(nachricht);
    await new Promise(r => setTimeout(r, 1500));
    assert.ok(fehler - vorher <= RATE_STOSS, `Antworten ${fehler - vorher} <= Stoß ${RATE_STOSS}`);
    assert.ok(server.metrics.messagesRateLimited > 1000, 'verworfene Nachrichten werden gezählt');
    socket.close();
  } finally {
    await server.close();
  }
});

test('Die Snapshot-Rate des echten Servers liegt bei der ausgewiesenen Rate', { timeout: 30_000 }, async () => {
  // Die Schleife prüft nur alle 16,7 ms. Mit `= 0` kamen 15 Hz heraus (65 ms Abstand).
  const { decodeSnapshot } = await import('../src/shared/protocol.js');
  const server = new GameServer();
  const { port, url } = await server.listen(0);
  try {
    const erstellt = await (await fetch(`${url}/api/lobby/create`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ teams: 2, playersPerTeam: 1, seed: 7 }),
    })).json();
    const ankuenfte = [];
    const a = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const b = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    a.on('message', (raw, binaer) => { if (binaer && decodeSnapshot(raw)) ankuenfte.push(performance.now()); });
    await Promise.all([new Promise(r => a.once('open', r)), new Promise(r => b.once('open', r))]);
    a.send(controlMessage(CONTROL.JOIN_LOBBY, { lobbyId: erstellt.lobby.id, name: 'A', token: erstellt.player.token }));
    b.send(controlMessage(CONTROL.JOIN_LOBBY, { lobbyId: erstellt.lobby.id, name: 'B' }));
    await new Promise(r => setTimeout(r, 3000));
    assert.ok(ankuenfte.length > 30, `genug Snapshots (${ankuenfte.length})`);
    const dauer = ankuenfte.at(-1) - ankuenfte[0];
    const hz = ((ankuenfte.length - 1) / dauer) * 1000;
    assert.ok(hz > SNAPSHOT_HZ - 2 && hz < SNAPSHOT_HZ + 2, `${hz.toFixed(1)} Hz statt ${SNAPSHOT_HZ}`);
    a.close(); b.close();
  } finally {
    await server.close();
  }
});
