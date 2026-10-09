import assert from 'node:assert/strict';
import test from 'node:test';
import { MatchController } from '../src/engine/match.js';
import { applyCraterToTerrain, buildTerrainForSeed } from '../src/client/terrainPreview.js';

/**
 * Regression (Audit 2026-10-09): Ein Client, der nach Kratern beitritt oder die
 * Verbindung wieder aufnimmt, baute die Karte aus dem Seed und sah die
 * UNZERSTÖRTE Landschaft (nach 9 Kratern wichen 3 082 Zellen vom Server ab).
 */
function spieleMitKratern() {
  const match = new MatchController({ seed: 4242, teams: 2, playersPerTeam: 1, preset: 'hills' });
  match.start();
  let schuesse = 0;
  for (let tick = 0; tick < 6000; tick++) {
    if (match.activeProjectileCount === 0 && tick % 120 === 0) {
      match.fire(match.activePlayerId, 0.9 + schuesse * 0.1, 70, null);
      schuesse += 1;
    }
    match.step();
    match.consumeEvents();
  }
  return match;
}

function unterschiede(a, b, breite, hoehe) {
  let anzahl = 0;
  for (let y = 0; y < hoehe; y++) {
    for (let x = 0; x < breite; x++) if (a.isSolid(x, y) !== b.isSolid(x, y)) anzahl += 1;
  }
  return anzahl;
}

test('Karte aus Seed + Krater-Log ist zellengleich zur Server-Maske', () => {
  const match = spieleMitKratern();
  const log = match.terrain.craterLog;
  assert.ok(log.length >= 5, `Testaufbau: es müssen Krater entstanden sein (${log.length})`);

  const frisch = buildTerrainForSeed(4242, 'hills', 'landscape', null);
  const ohne = unterschiede(match.terrain, frisch.mask, frisch.width, frisch.height);
  assert.ok(ohne > 0, 'Ohne Nachlieferung weicht die Karte ab (das ist der Fehler)');

  for (const [x, y, radius] of log) applyCraterToTerrain(frisch, x, y, radius);
  assert.equal(unterschiede(match.terrain, frisch.mask, frisch.width, frisch.height), 0, 'Maske gleich');

  // Auch die Bitmap, gegen die die Zielvorschau rechnet.
  let bitmapAbweichung = 0;
  for (let y = 0; y < frisch.height; y++) {
    for (let x = 0; x < frisch.width; x++) {
      if (Boolean(frisch.bitmap[y * frisch.width + x]) !== match.terrain.isSolid(x, y)) bitmapAbweichung += 1;
    }
  }
  assert.equal(bitmapAbweichung, 0, 'Bitmap gleich');
});

test('craterLog gibt eine Kopie heraus', () => {
  const match = spieleMitKratern();
  const log = match.terrain.craterLog;
  log.length = 0;
  assert.ok(match.terrain.craterLog.length > 0);
});

test('WELCOME beim Reconnect enthält die bisherigen Krater', async () => {
  const { WebSocket } = await import('ws');
  const { GameServer } = await import('../src/server/gameServer.js');
  const { CONTROL, controlMessage, parseControlMessage } = await import('../src/shared/protocol.js');

  const server = new GameServer();
  const { port, url } = await server.listen(0);
  const verbinde = () => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const eingang = [];
    socket.on('message', (raw, binaer) => {
      if (!binaer) { const m = parseControlMessage(raw); if (m) eingang.push(m); }
    });
    return { socket, eingang, offen: new Promise(r => socket.once('open', r)) };
  };
  const warte = async (f, ms = 8000) => {
    const ende = Date.now() + ms;
    while (Date.now() < ende) { const v = f(); if (v) return v; await new Promise(r => setTimeout(r, 20)); }
    throw new Error('Zeitüberschreitung');
  };
  try {
    const antwort = await fetch(`${url}/api/lobby/create`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ teams: 2, playersPerTeam: 1, seed: 4242 }),
    });
    const erstellt = await antwort.json();
    const a = verbinde();
    const b = verbinde();
    await a.offen; await b.offen;
    a.socket.send(controlMessage(CONTROL.JOIN_LOBBY, { lobbyId: erstellt.lobby.id, name: 'A', token: erstellt.player.token }));
    const willkommenA = await warte(() => a.eingang.find(m => m.t === CONTROL.WELCOME && m.entityId));
    b.socket.send(controlMessage(CONTROL.JOIN_LOBBY, { lobbyId: erstellt.lobby.id, name: 'B' }));
    await warte(() => b.eingang.find(m => m.t === CONTROL.WELCOME && m.entityId));
    assert.deepEqual(willkommenA.craters, [], 'vor dem ersten Schuss gibt es keine Krater');

    // Server-Sitzung direkt vorspulen: bis zu fünf Schüsse mit Kratern.
    const sitzung = server.getSession(erstellt.lobby.id);
    assert.ok(sitzung, 'Testaufbau: Sitzung erreichbar');
    let schuesse = 0;
    for (let tick = 0; tick < 6000 && sitzung.match.terrain.craterLog.length < 3; tick++) {
      if (sitzung.match.activeProjectileCount === 0 && tick % 120 === 0) {
        sitzung.match.fire(sitzung.match.activePlayerId, 0.9 + schuesse * 0.1, 70, null);
        schuesse += 1;
      }
      sitzung.stepSimulation(1);
    }
    const erwartet = sitzung.match.terrain.craterLog;
    assert.ok(erwartet.length >= 3, 'Testaufbau: Krater entstanden');

    a.socket.close();
    const neu = verbinde();
    await neu.offen;
    neu.socket.send(controlMessage(CONTROL.JOIN_LOBBY, { lobbyId: erstellt.lobby.id, name: 'A', token: erstellt.player.token }));
    const wieder = await warte(() => neu.eingang.find(m => m.t === CONTROL.WELCOME && m.entityId));
    assert.deepEqual(wieder.craters, erwartet, 'Reconnect liefert die Krater nach');
    neu.socket.close(); b.socket.close();
  } finally {
    await server.close();
  }
});
