import assert from 'node:assert/strict';
import test from 'node:test';
import { MatchController } from '../src/engine/match.js';
import { CollisionMask, eachInsetCell } from '../src/engine/terrain/collisionMask.js';
import {
  applyCraterToTerrain,
  applyInsetToTerrain,
  bewerteTerrainHash,
  buildTerrainForSeed,
  terrainHash,
} from '../src/client/terrainPreview.js';
import { verarbeiteOnline } from '../src/client/ereignisse.js';

/**
 * Audit 2026-10-09, Nachtrag: (1) Der Mahlstrom-Einschnitt kam beim Wiedereinstieg
 * und im laufenden Online-Spiel nicht in Bitmap/Maske der Client-Karte an;
 * (2) es gab keine Gegenprobe, ob Client- und Server-Karte gleich sind
 * (Terrain-Hash).
 */
function spieleMitKraternUndMahlstrom(runden = 3) {
  const match = new MatchController({ seed: 4242, teams: 2, playersPerTeam: 1, preset: 'hills' });
  match.start();
  let schuesse = 0;
  for (let tick = 0; tick < 3000; tick++) {
    if (match.activeProjectileCount === 0 && tick % 120 === 0) {
      match.fire(match.activePlayerId, 0.9 + schuesse * 0.1, 70, null);
      schuesse += 1;
    }
    match.step();
    match.consumeEvents();
  }
  match.maelstrom.activate();
  for (let i = 0; i < runden; i++) match.maelstrom.contract(match.world);
  return match;
}

function unterschiede(a, b, breite, hoehe) {
  let anzahl = 0;
  for (let y = 0; y < hoehe; y++) {
    for (let x = 0; x < breite; x++) if (a.isSolid(x, y) !== b.isSolid(x, y)) anzahl += 1;
  }
  return anzahl;
}

function bitmapAbweichung(karte, maske) {
  let anzahl = 0;
  for (let y = 0; y < karte.height; y++) {
    for (let x = 0; x < karte.width; x++) {
      if (Boolean(karte.bitmap[y * karte.width + x]) !== maske.isSolid(x, y)) anzahl += 1;
    }
  }
  return anzahl;
}

function baueClientKarte(match, { krater = true, einschnitt = true } = {}) {
  const karte = buildTerrainForSeed(4242, 'hills', 'landscape', null);
  if (krater) for (const [x, y, radius] of match.terrain.craterLog) applyCraterToTerrain(karte, x, y, radius);
  if (einschnitt) applyInsetToTerrain(karte, match.maelstrom.inset);
  return karte;
}

test('Karte aus Seed ohne Einschnitt weicht ab, mit Einschnitt ist sie zellengleich (Maske und Bitmap)', () => {
  const match = spieleMitKraternUndMahlstrom();
  assert.ok(match.maelstrom.inset >= 64, `Testaufbau: Einschnitt vorhanden (${match.maelstrom.inset})`);

  const ohne = baueClientKarte(match, { einschnitt: false });
  const fehlend = unterschiede(match.terrain, ohne.mask, ohne.width, ohne.height);
  assert.ok(fehlend > 0, 'Ohne Einschnitt weicht die Maske ab (das ist der Fehler)');

  const mit = baueClientKarte(match);
  assert.equal(unterschiede(match.terrain, mit.mask, mit.width, mit.height), 0, 'Maske gleich');
  assert.equal(bitmapAbweichung(mit, match.terrain), 0, 'Bitmap gleich der Server-Maske');
});

test('eachInsetCell: Zellenzahl und Randfall (Einschnitt erreicht die Mitte)', () => {
  const zellen = [];
  eachInsetCell(100, 10, 3, (x, y) => zellen.push([x, y]));
  assert.equal(zellen.length, 3 * 10 * 2);
  let leer = 0;
  eachInsetCell(100, 10, 50, () => { leer += 1; });
  assert.equal(leer, 0, 'Berührt der Einschnitt die Mitte, wird nichts abgetragen');
});

test('maelstrom_contract online zieht Bitmap und Maske der Client-Karte mit', () => {
  const karte = buildTerrainForSeed(4242, 'hills', 'landscape', null);
  const vorher = karte.mask.hash();
  const aufrufe = [];
  const kontext = {
    renderer: { applyContraction: inset => aufrufe.push(inset) },
    hud: { log() {} },
    fernzustand: { setzeEinschnitt() {} },
    karte: { einschnitt: inset => applyInsetToTerrain(karte, inset) },
  };
  verarbeiteOnline(kontext, { t: 'maelstrom_contract', inset: 32, removed: 0 });
  assert.deepEqual(aufrufe, [32], 'Zeichenfläche wurde gezogen');
  assert.notEqual(karte.mask.hash(), vorher, 'Maske verändert');
  for (let y = 0; y < karte.height; y += 97) {
    assert.equal(karte.bitmap[y * karte.width + 5], 0, 'Bitmap links leer');
    assert.equal(karte.bitmap[y * karte.width + karte.width - 6], 0, 'Bitmap rechts leer');
    assert.equal(karte.mask.isSolid(5, y), false);
  }
});

test('Terrain-Hash: gleich bei Seed + Krater + Einschnitt, verschieden bei jeder Manipulation', () => {
  const match = spieleMitKraternUndMahlstrom();
  const meldung = { hash: match.terrain.hash(), craters: match.terrain.craterCount, inset: match.maelstrom.inset };

  const gut = baueClientKarte(match);
  assert.equal(terrainHash(gut), meldung.hash);
  assert.equal(bewerteTerrainHash(gut, meldung).urteil, 'gleich');

  // Ohne Nachlieferung: andere Kraterzahl und anderer Hash -> erst abwarten, dann Abweichung.
  const ohne = baueClientKarte(match, { krater: false, einschnitt: false });
  assert.equal(bewerteTerrainHash(ohne, meldung).urteil, 'abwarten');
  assert.equal(bewerteTerrainHash(ohne, meldung, true).urteil, 'abweichung');

  // Manipulierte Karte bei gleichem Stand: sofort erkannt, eine einzige Zelle genügt.
  const manipuliert = baueClientKarte(match);
  const spalte = manipuliert.width >> 1;
  let zeile = 0;
  for (let i = 0; i < manipuliert.height; i++) if (manipuliert.mask.isSolid(spalte, i)) { zeile = i; break; }
  manipuliert.mask.setPixel(spalte, zeile, !manipuliert.mask.isSolid(spalte, zeile));
  assert.equal(bewerteTerrainHash(manipuliert, meldung).urteil, 'abweichung');
});

test('Terrain-Hash ist deterministisch und die Kosten liegen weit unter einem Tick', () => {
  const a = buildTerrainForSeed(7, 'hills', 'landscape', null);
  const b = buildTerrainForSeed(7, 'hills', 'landscape', null);
  assert.equal(a.mask.hash(), b.mask.hash());
  assert.notEqual(a.mask.hash(), buildTerrainForSeed(8, 'hills', 'landscape', null).mask.hash());
  assert.equal(new CollisionMask(64, 64).hash(), new CollisionMask(64, 64).hash());

  const dauern = [];
  for (let i = 0; i < 200; i++) {
    const t0 = process.hrtime.bigint();
    a.mask.hash();
    dauern.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  dauern.sort((x, y) => x - y);
  const median = dauern[100];
  console.log(`# Terrain-Hash ${a.width}x${a.height}: Median ${median.toFixed(3)} ms, p99 ${dauern[198].toFixed(3)} ms`);
  assert.ok(median < 2, `Hash kostet ${median} ms (Tick-Budget 16,7 ms)`);
});

test('Server: WELCOME trägt inset, Vollsnapshot bringt terrain_hash, terrain_request liefert Stand', async () => {
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
  const warte = async (f, ms = 10000) => {
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
    const willkommen = await warte(() => a.eingang.find(m => m.t === CONTROL.WELCOME && m.entityId));
    assert.equal(willkommen.inset, 0, 'Vor dem Mahlstrom ist der Einschnitt 0');
    b.socket.send(controlMessage(CONTROL.JOIN_LOBBY, { lobbyId: erstellt.lobby.id, name: 'B' }));
    await warte(() => b.eingang.find(m => m.t === CONTROL.WELCOME && m.entityId));

    const sitzung = server.getSession(erstellt.lobby.id);
    sitzung.match.maelstrom.activate();
    sitzung.match.maelstrom.contract(sitzung.match.world);
    sitzung.match.maelstrom.contract(sitzung.match.world);
    const inset = sitzung.match.maelstrom.inset;
    assert.ok(inset > 0);

    // Der Vollsnapshot (alle 2 s) bringt den Hash der Server-Maske.
    const hashMeldung = await warte(() => a.eingang.find(m => m.t === CONTROL.TERRAIN_HASH && m.inset === inset));
    assert.equal(hashMeldung.hash, sitzung.match.terrain.hash());
    assert.equal(hashMeldung.craters, sitzung.match.terrain.craterCount);

    // Nachlieferung auf Anfrage.
    a.socket.send(controlMessage(CONTROL.TERRAIN_REQUEST));
    const stand = await warte(() => a.eingang.find(m => m.t === CONTROL.TERRAIN_STATE));
    assert.equal(stand.inset, inset);
    assert.deepEqual(stand.craters, sitzung.match.terrain.craterLog);

    // Wiedereinstieg: WELCOME trägt den Einschnitt, und die Karte daraus ist gleich.
    a.socket.close();
    const neu = verbinde();
    await neu.offen;
    neu.socket.send(controlMessage(CONTROL.JOIN_LOBBY, { lobbyId: erstellt.lobby.id, name: 'A', token: erstellt.player.token }));
    const wieder = await warte(() => neu.eingang.find(m => m.t === CONTROL.WELCOME && m.entityId));
    assert.equal(wieder.inset, inset);
    const karte = buildTerrainForSeed(4242, 'hills', 'landscape', null);
    for (const [x, y, r] of wieder.craters) applyCraterToTerrain(karte, x, y, r);
    applyInsetToTerrain(karte, wieder.inset);
    assert.equal(karte.mask.hash(), sitzung.match.terrain.hash());
    neu.socket.close(); b.socket.close();
  } finally {
    await server.close();
  }
});
