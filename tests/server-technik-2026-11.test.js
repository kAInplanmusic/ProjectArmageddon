/**
 * Regressionstests zu den Technik-Punkten aus `docs/TODO-SSOT.md` (2026-11-02):
 * SRV-1, SRV-2, SRV-3, SRV-6, SRV-7, SRV-9, HTTP-1, UI-1, ENG-5/STATE-1, REPLAY-1, WERKZEUG-1.
 *
 * Jeder Test hält den Befund fest, wie er vor der Korrektur auftrat; der Kommentar
 * nennt jeweils, was vorher geschah.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { GameServer, LobbySession } from '../src/server/gameServer.js';
import { LobbyManager } from '../src/server/lobby.js';
import { INPUT_LIMITS, isTickInWindow } from '../src/shared/validation.js';
import {
  CONTROL,
  MAGIC,
  SNAPSHOT_FLAG,
  PROTOCOL_VERSION,
  HEADER_SIZE,
  PLAYER_STRIDE,
  PROJECTILE_STRIDE,
  CRATE_STRIDE,
  TURRET_STRIDE,
  GUENTHER_STRIDE,
  COOKIE_STRIDE,
  controlMessage,
  encodeSnapshot,
  decodeSnapshot,
  pruefeProtokollversion,
} from '../src/shared/protocol.js';
import { NetworkClient } from '../src/client/networkClient.js';
import { WebSocket, WebSocketServer } from 'ws';
import { MatchController } from '../src/engine/match.js';
import { ReplayRecorder, REPLAY_FORMAT_VERSION } from '../src/engine/replay.js';
import { MATCH_RULES } from '../src/shared/config/match.js';
import { schreibeBericht, istGetrackt, BERICHT_STANDARDPFAD } from '../tools/audit-mcp/lib/bericht.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Ein Socket-Ersatz: sammelt, was gesendet wird. */
function falscherSocket(readyState = 1) {
  return { readyState, gesendet: [], send(m) { this.gesendet.push(m); } };
}

/** Logger-Ersatz mit `child()` wie `src/server/logger.js`. */
function falscherLogger() {
  const zeilen = [];
  const logger = {
    zeilen,
    child() { return logger; },
    debug() {}, info() {}, warn() {},
    error(ereignis, text, felder) { zeilen.push({ ereignis, text, felder }); },
  };
  return logger;
}

/** Zwei-Team-Lobby mit zwei verbundenen Menschen und laufender Sitzung (ohne Zeitgeber). */
function zweierSitzung(optionen = {}) {
  const manager = new LobbyManager();
  const { lobby, player } = manager.create({ teams: 2, playersPerTeam: 1, seed: 4242, preset: 'hills' });
  manager.join(lobby.id, { token: player.token }); // Host verbindet sich
  const zweiter = manager.join(lobby.id, { name: 'B' });
  const gesamt = manager.get(lobby.id);
  const session = new LobbySession(gesamt, optionen);
  session.syncSeats();
  return { manager, lobby: gesamt, session, tokenA: player.token, tokenB: zweiter.token };
}

const istVoll = buffer => {
  const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return (view.getUint16(20, true) & SNAPSHOT_FLAG.FULL) !== 0;
};
const binaer = socket => socket.gesendet.filter(m => typeof m !== 'string');

// ------------------------------------------------------------------ SRV-1

test('SRV-1: GET /api/<unbekannt> gibt 404 JSON statt SPA-Fallback, andere Pfade behalten den Fallback', async () => {
  const altesCwd = process.cwd();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pa-srv1-'));
  fs.mkdirSync(path.join(tmp, 'dist'));
  fs.writeFileSync(path.join(tmp, 'dist', 'index.html'), '<p>spa</p>');
  process.chdir(tmp);
  const server = new GameServer();
  try {
    const { url } = await server.listen(0);
    for (const pfad of ['/api/gibtsnicht', '/api/lobby/x/y', '/api']) {
      const antwort = await fetch(`${url}${pfad}`);
      assert.equal(antwort.status, 404, `${pfad}: vorher 200 + index.html`);
      assert.match(antwort.headers.get('content-type') ?? '', /json/, `${pfad}: Antwort ist JSON`);
      const body = await antwort.json();
      assert.equal(typeof body.error, 'string');
    }
    const spa = await fetch(`${url}/lobby/irgendwas`);
    assert.equal(spa.status, 200, 'Client-Routen ohne /api bekommen weiter index.html');
    assert.match(await spa.text(), /spa/);
  } finally {
    await server.close();
    process.chdir(altesCwd);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// ------------------------------------------------------------------ SRV-2

test('SRV-2: Ein über HTTP angelegter Host-Platz gilt erst mit Socket als verbunden und verfällt ohne', () => {
  const manager = new LobbyManager({ reconnectWindowMs: 30_000 });
  const vorher = Date.now();
  const { lobby, player } = manager.create({ teams: 2, playersPerTeam: 1, seed: 7, preset: 'hills' });
  assert.equal(lobby.connected, 0, 'vorher 1: der Host galt ohne Socket als verbunden');
  assert.equal(player.connected, false);
  assert.ok(player.seats.every(seat => seat.connected === false));
  assert.equal(lobby.occupied, 1, 'der Platz bleibt reserviert');

  // Ein zweiter Mensch verbindet sich — der Host nie. Vorher startete das Match damit.
  manager.join(lobby.id, { name: 'B' });
  assert.equal(manager.alleTeamsBesetzt(lobby.id), false, 'ohne den Host ist die Lobby nicht vollständig');

  // Nach dem Reconnect-Fenster verfällt das Team des Hosts.
  assert.equal(manager.pruneDisconnected(vorher + 1_000).length, 0, 'im Fenster verfällt nichts');
  const verfallen = manager.pruneDisconnected(Date.now() + 60_000);
  assert.deepEqual(verfallen.map(e => e.token), [player.token], 'vorher: der Host verfiel nie');
});

test('SRV-2: Verbindet sich der Host mit seinem Token, ist er verbunden und die Lobby startklar', () => {
  const manager = new LobbyManager();
  const { lobby, player } = manager.create({ teams: 2, playersPerTeam: 2, seed: 8, preset: 'hills' });
  const wieder = manager.join(lobby.id, { token: player.token });
  assert.equal(wieder.resumed, true);
  assert.ok(wieder.seats.every(seat => seat.connected === true));
  manager.join(lobby.id, { name: 'B' });
  assert.equal(manager.describe(lobby.id).connected, 2);
  assert.equal(manager.alleTeamsBesetzt(lobby.id), true);
  assert.equal(manager.pruneDisconnected(Date.now() + 60_000).length, 0, 'ein verbundener Host verfällt nicht');
});

// ------------------------------------------------------------------ SRV-6

test('SRV-6: Eine Ausnahme in match.step() beendet nur die Sitzung, nicht den Prozess', () => {
  const logger = falscherLogger();
  const beendet = [];
  const { session, lobby, tokenA } = zweierSitzung({ logger, onEmpty: id => beendet.push(id) });
  const socket = falscherSocket();
  session.clients.set(tokenA, socket);
  session.match.step = () => { throw new Error('Testfehler im Motor'); };
  session.lastTickAt = Date.now() - 100; // genug Zeit für mindestens einen Takt

  assert.doesNotThrow(() => session.tick(), 'vorher flog die Ausnahme aus dem Zeitgeber (uncaughtException)');
  assert.equal(session.laeuft, false, 'der Zeitgeber ist aus');
  assert.deepEqual(beendet, [lobby.id], 'die Sitzung meldet sich ab');
  assert.equal(lobby.status, 'finished');
  assert.equal(logger.zeilen.length, 1);
  assert.equal(logger.zeilen[0].ereignis, 'tick_fehler');
  const meldungen = socket.gesendet.filter(m => typeof m === 'string').map(m => JSON.parse(m));
  assert.ok(meldungen.some(m => m.t === CONTROL.ERROR && /abgebrochen/.test(m.error)), 'die Clients erfahren den Abbruch');

  // Ein zweiter Takt (etwa ein schon eingereihter Zeitgeber) meldet nichts doppelt.
  session.tick();
  assert.equal(beendet.length, 1);
  assert.equal(logger.zeilen.length, 1);
});

test('SRV-6: Auch aus dem echten Zeitgeber entkommt keine Ausnahme', async () => {
  const { session } = zweierSitzung({ logger: falscherLogger(), onEmpty: () => {} });
  session.match.step = () => { throw new Error('Testfehler im Motor'); };
  let entkommen = null;
  const fang = fehler => { entkommen = fehler; };
  process.once('uncaughtException', fang);
  try {
    session.start();
    await new Promise(r => setTimeout(r, 120));
  } finally {
    process.removeListener('uncaughtException', fang);
    session.stop();
  }
  assert.equal(entkommen, null, `Ausnahme entkam dem Zeitgeber: ${entkommen?.message}`);
  assert.equal(session.laeuft, false);
});

// ------------------------------------------------------------------ SRV-7

test('SRV-7: maxTickDrift ist eine Tickzahl und hängt an keiner ms-Konstante', () => {
  assert.equal(INPUT_LIMITS.maxTickDrift, 400, 'Betrugsgrenze 400 Ticks (≈ 6,7 s bei 60 Hz)');
  assert.equal(isTickInWindow(1000 - 400, 1000), true);
  assert.equal(isTickInWindow(1000 - 401, 1000), false);
  const quelle = fs.readFileSync(path.join(ROOT, 'src/shared/validation.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(quelle, /lagCompensationBufferMs/, 'vorher: maxTickDrift = lagCompensationBufferMs * 2 (ms als Ticks)');
});

// ------------------------------------------------------------------ SRV-9

test('SRV-9: Ein übersprungener Socket bekommt danach einen Vollsnapshot, keinen Delta auf ungesehene Basis', () => {
  const { session, tokenA, tokenB } = zweierSitzung({});
  const a = falscherSocket(1);
  const b = falscherSocket(0); // CONNECTING
  session.clients.set(tokenA, a);
  session.clients.set(tokenB, b);
  session.snapshotCounter = 1; // weit weg vom erzwungenen Vollsnapshot

  session.broadcastSnapshot();
  assert.equal(binaer(b).length, 0, 'Testaufbau: b war nicht offen');
  assert.equal(session.previousByToken.has(tokenB), false, 'vorher: Basis für b fortgeschrieben, obwohl nichts ankam');

  b.readyState = 1;
  session.stepSimulation(3);
  session.broadcastSnapshot();
  assert.equal(istVoll(binaer(b).at(-1)), true, 'b bekommt einen Vollsnapshot');
  assert.equal(istVoll(binaer(a).at(-1)), false, 'Gegenprobe: a bekommt weiter Deltas');
});

test('SRV-9: Nach attach (Wiederverbindung) ist der erste Snapshot voll', () => {
  const { session, tokenA } = zweierSitzung({});
  const alt = falscherSocket(1);
  session.clients.set(tokenA, alt);
  session.snapshotCounter = 1;
  session.broadcastSnapshot();
  session.broadcastSnapshot();
  assert.equal(istVoll(binaer(alt).at(-1)), false, 'Testaufbau: der alte Socket bekam Deltas');

  const neu = falscherSocket(1);
  session.attach(tokenA, neu);
  session.broadcastSnapshot();
  assert.equal(istVoll(binaer(neu).at(-1)), true, 'vorher: Delta auf die Basis des alten Sockets');
});

// ------------------------------------------------------------------ UI-1

test('UI-1: startOnline setzt Mahlstrom-Einschnitt und Zugdauer der vorigen Partie zurück', () => {
  const quelle = fs.readFileSync(path.join(ROOT, 'src/client/main.js'), 'utf8');
  const start = quelle.indexOf('  async startOnline(');
  assert.ok(start > 0);
  const verbinden = quelle.indexOf('new NetworkClient(', start);
  const rumpf = quelle.slice(start, verbinden);
  assert.match(rumpf, /this\.remoteInset = 0;/, 'vorher: remoteInset wurde nie zurückgesetzt');
  assert.match(rumpf, /this\.remoteTurnDurationMs = 0;/, 'vorher: remoteTurnDurationMs wurde nie zurückgesetzt');
});

// ------------------------------------------------------------------ ENG-5 / STATE-1

function spieleMitSchuessen(mitZustandsabruf) {
  const match = new MatchController({ seed: 31337, teams: 2, playersPerTeam: 2, preset: 'hills', turnDurationMs: 3000 });
  match.start();
  let schuesse = 0;
  for (let i = 0; i < 4000 && match.status === 'playing'; i += 1) {
    const zustand = match.getState();
    if (zustand.activePlayerId !== null && zustand.turnElapsedMs === 0 && schuesse < 12) {
      match.fire(zustand.activePlayerId, 0.6 + (schuesse % 5) * 0.4, 55 + (schuesse % 4) * 10);
      schuesse += 1;
    }
    match.step();
    if (mitZustandsabruf) { match.getState(); match.getState(); }
  }
  return { hash: match.stateHash(), tick: match.world.tickCount, schuesse };
}

test('ENG-5/STATE-1: step() baut keinen Zustand mehr; getState() wirkt nicht auf die Simulation', () => {
  const match = new MatchController({ seed: 5, teams: 2, playersPerTeam: 1, preset: 'hills' });
  match.start();
  assert.equal(match.step(), undefined, 'vorher: jeder Takt baute einen ungelesenen Zustand');

  const ohne = spieleMitSchuessen(false);
  const mit = spieleMitSchuessen(true);
  assert.ok(ohne.schuesse > 0, 'Testaufbau: es wurde geschossen');
  assert.equal(mit.tick, ohne.tick);
  assert.equal(mit.hash, ohne.hash, 'zusätzliche Zustandsabrufe ändern den Verlauf nicht — das Weglassen ist verhaltensgleich');
});

test('ENG-5/STATE-1: LobbySession.stepSimulation baut keinen zweiten Zustand', () => {
  const { session } = zweierSitzung({});
  let aufrufe = 0;
  const original = session.match.getState.bind(session.match);
  session.match.getState = () => { aufrufe += 1; return original(); };
  assert.equal(session.stepSimulation(10), undefined);
  assert.equal(aufrufe, 0, 'vorher: zwei Zustandsaufbauten je Takt (step + stepSimulation)');
});

// ------------------------------------------------------------------ REPLAY-1

test('REPLAY-1: Recorder-Vorgabe für maxRounds folgt dem Motor, Altdateien ohne Feld spielen mit 30', () => {
  assert.equal(new ReplayRecorder({ seed: 1 }).config.maxRounds, MATCH_RULES.roundLimitBackstop,
    'vorher 30, der Motor 300');
  assert.equal(new MatchController({ seed: 1 }).maxRounds, MATCH_RULES.roundLimitBackstop, 'Gegenprobe: Motorvorgabe');

  const neu = new ReplayRecorder({ seed: 2, maxRounds: 12 }).toJSON();
  assert.equal(ReplayRecorder.fromJSON(neu).config.maxRounds, 12, 'ein gesetzter Wert bleibt');

  const alt = new ReplayRecorder({ seed: 3 }).toJSON();
  delete alt.config.maxRounds;
  assert.equal(alt.format, REPLAY_FORMAT_VERSION);
  assert.equal(ReplayRecorder.fromJSON(alt).config.maxRounds, 30, 'Altdatei ohne Feld: alte Vorgabe (AGENTS.md §2)');
});

// ------------------------------------------------------------------ WERKZEUG-1

test('WERKZEUG-1: audit_bericht überschreibt keine getrackte Datei ohne ausdrückliche Freigabe', () => {
  // Zeuge ist `package.json`: sie ist getrackt und wird von keinem Aufräumen oder
  // Umbenennen von Doku-Dateien berührt (frühere Zeugen unter docs/ verschwanden).
  const ziel = path.join(ROOT, 'package.json');
  assert.equal(istGetrackt(ziel), true, 'Testaufbau: package.json ist getrackt');
  const vorher = fs.readFileSync(ziel, 'utf8');
  assert.throws(() => schreibeBericht('package.json', {}), /getrackte Datei/);
  assert.equal(fs.readFileSync(ziel, 'utf8'), vorher, 'die Datei ist unverändert');

  assert.equal(BERICHT_STANDARDPFAD.startsWith('artifacts/'), true, 'Vorgabe liegt unter artifacts/ (gitignored)');
  assert.equal(istGetrackt(path.join(ROOT, BERICHT_STANDARDPFAD)), false);
  const paket = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  // Der Standardaufruf darf auf keine getrackte Datei zeigen (allgemein statt einer einzelnen Doku-Datei).
  assert.doesNotMatch(paket.scripts['audit:bericht'], /(^|\s)(docs|src|tests|scripts)\//);
});

// ------------------------------------------------------------------ HTTP-1

test('HTTP-1: Fehlerhafte Bodys an POST /api/lobby/create geben 400 mit kurzem Grund', async () => {
  const server = new GameServer({ serveStatic: () => false });
  try {
    const { url } = await server.listen(0);
    const sende = body => fetch(`${url}/api/lobby/create`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body,
    });
    const faelle = [
      ['{kaputt', /Ungültiges JSON/],
      ['{"teams":2', /Ungültiges JSON/], // unvollständig
      ['[1,2]', /JSON-Objekt/],
      ['42', /JSON-Objekt/],
      [JSON.stringify({ name: 'x'.repeat(9000) }), /zu groß/],
    ];
    for (const [body, grund] of faelle) {
      const antwort = await sende(body);
      assert.equal(antwort.status, 400, `${body.slice(0, 20)}: Status`);
      const nutzlast = await antwort.json();
      assert.match(nutzlast.error, grund);
      assert.ok(nutzlast.error.length <= 60, 'die Meldung ist kurz');
      assert.deepEqual(nutzlast.errors, [nutzlast.error]);
    }
    assert.equal(server.lobbyManager.size, 0, 'kein fehlerhafter Body legt eine Lobby an');
    assert.equal((await sende('')).status, 201, 'Gegenprobe: leerer Body = alle Vorgaben');
  } finally {
    await server.close();
  }
});

// ------------------------------------------------------------------ SRV-3

test('SRV-3: Der Auto-Start beim letzten Beitritt setzt die Lobby auf „running" wie START_MATCH', async () => {
  const server = new GameServer({ serveStatic: () => false });
  const sockets = [];
  try {
    const { url, port } = await server.listen(0);
    const erstellt = await (await fetch(`${url}/api/lobby/create`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ teams: 2, playersPerTeam: 1, seed: 99 }),
    })).json();
    const lobbyId = erstellt.lobby.id;
    const beitreten = token => new Promise((resolve, reject) => {
      const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      sockets.push(socket);
      socket.on('error', reject);
      socket.on('message', (daten, binaer) => {
        if (binaer) return;
        const nachricht = JSON.parse(String(daten));
        if (nachricht.t === CONTROL.WELCOME) resolve(nachricht);
      });
      socket.on('open', () => socket.send(controlMessage(CONTROL.JOIN_LOBBY, { lobbyId, name: 'X', ...(token ? { token } : {}) })));
    });
    await beitreten(erstellt.player.token);
    assert.equal(server.lobbyManager.get(lobbyId).status, 'open', 'mit einem Team wartet die Lobby offen');
    await beitreten(null);
    assert.equal(server.getSession(lobbyId).laeuft, true, 'Testaufbau: der letzte Beitritt startet');
    assert.equal(server.lobbyManager.get(lobbyId).status, 'running', 'vorher: „open" nach dem Auto-Start');
  } finally {
    for (const socket of sockets) socket.close();
    await server.close();
  }
});

// ------------------------------------------------------------------ SRV-10

/** Vollständiger Beispielzustand mit je einem Eintrag pro Snapshot-Abschnitt. */
function protokollZustand() {
  return {
    tick: 4711,
    round: 2,
    wind: 0.5,
    activePlayerId: 7,
    entities: [
      { entityId: 7, teamId: 0, alive: true, x: 12.25, y: 34.5, health: 88.5, isActiveTurn: true },
      { entityId: 8, teamId: 1, alive: true, x: 56, y: 78, health: 100, isActiveTurn: false },
    ],
    projectiles: [
      { entityId: 31, x: 1.25, y: 2.5, fuseSeconds: 1.4 },
      { entityId: 32, x: 3.75, y: 4, fuseSeconds: 0.2 },
    ],
    crates: [{ entityId: 41, x: 5.5, y: 6.25, crateType: 2, rarity: 3 }],
    turrets: [{ entityId: 51, x: 7, y: 8, teamId: 1, roundsLeft: 4 }],
    guenther: { aktiv: true, x: 9, y: 10, richtung: -1, haufen: [] },
  };
}

test('SRV-10: isActiveTurn, Projektil-entityId, crateType und Geschützfelder kommen beim Leser an', () => {
  /*
   * Vorher (Datenfluss-Audit B1/B3/B4): Die Bytes wurden gesendet, aber
   * `isActiveTurn` und die Projektilkennung tauchten im Ergebnis nicht auf —
   * der Client konnte sie nicht nutzen. `crateType` wird inzwischen im Renderer
   * gelesen; hier steht der Draht-Gegenbeweis für alle vier Felder.
   */
  const gelesen = decodeSnapshot(encodeSnapshot(protokollZustand()));
  assert.ok(gelesen);

  assert.equal(gelesen.activePlayerId, 7);
  assert.equal(gelesen.entities[0].isActiveTurn, true, 'Byte [10] je Spieler wird gelesen');
  assert.equal(gelesen.entities[1].isActiveTurn, false);

  assert.deepEqual(gelesen.projectiles.map(p => p.entityId), [31, 32],
    'Projektilkennungen sind eindeutig und kommen an');
  assert.equal(gelesen.crates[0].crateType, 2);
  assert.equal(gelesen.crates[0].rarity, 3);
  assert.equal(gelesen.turrets[0].teamId, 1);
  assert.equal(gelesen.turrets[0].roundsLeft, 4);
  assert.equal(gelesen.guenther.aktiv, true);
  assert.equal(gelesen.truncated, false, 'ein vollständiger Takt ist nicht als abgeschnitten markiert');
});

test('SRV-10: Ein Delta spart keine Bytes — der Gewinn ist Feldgenauigkeit, nicht Größe', () => {
  /*
   * Vorher: Die Doku behauptete „spart bei ruhigen Ticks einen Großteil der
   * Nutzlast". Tatsächlich belegt jeder Spieler immer PLAYER_STRIDE Bytes. Der
   * Test hält beides fest: gleiche Größe UND dass die Feldübernahme (nicht
   * übertragene Felder behalten ihren Wert) funktioniert. Ein echtes
   * Byte-Sparen bräuchte ein neues Zählfeld und damit eine neue
   * Protokollversion — v9-Aufzeichnungen dürfen nicht brechen.
   */
  const zustand = protokollZustand();
  const voll = encodeSnapshot(zustand);
  const erst = decodeSnapshot(voll);
  const delta = encodeSnapshot(zustand, { previous: erst.previous });

  assert.equal(delta.length, voll.length, 'Delta und Vollsnapshot sind gleich groß');
  const zweit = decodeSnapshot(delta, erst.previous);
  assert.equal(zweit.isFull, false, 'ohne Voll-Flag');
  assert.deepEqual(zweit.entities.map(e => [e.x, e.y, e.health]),
    erst.entities.map(e => [e.x, e.y, e.health]), 'unveränderte Felder bleiben erhalten');
  assert.equal(zweit.projectiles.length, 2, 'Projektile stehen in jedem Takt vollständig im Puffer');
  assert.equal(zweit.truncated, false);
});

// ------------------------------------------------------------------ SRV-11

test('SRV-11: Ein abgeschnittener Projektilabschnitt wird gezählt, nicht als Kiste gedeutet', () => {
  /*
   * Vorher: `break` ohne Vermerk. Die Restbytes eines halben Projektils konnten
   * anschließend als Anfang der Kisten gelesen werden — Kisten an falschen
   * Stellen, ohne dass irgendwo stand, dass der Takt unvollständig war.
   */
  const voll = encodeSnapshot(protokollZustand());
  const bis = HEADER_SIZE + 2 * PLAYER_STRIDE + PROJECTILE_STRIDE + 3;
  const teil = decodeSnapshot(voll.subarray(0, bis));

  assert.ok(teil, 'die Figuren sind vollständig — der Takt bleibt brauchbar');
  assert.equal(teil.truncated, true);
  assert.deepEqual(teil.truncatedSections,
    [{ section: 'projectiles', expected: 2, read: 1 }]);
  assert.equal(teil.projectiles.length, 1);
  assert.deepEqual(teil.crates, [], 'Restbytes werden NICHT als Kisten gelesen');
  assert.deepEqual(teil.turrets, []);
  assert.equal(teil.guenther.aktiv, false, 'ohne verlässliche Grenze kein Günther-Block');
});

test('SRV-11: Abgeschnittene Kisten, Geschütze, Günther-Haufen und Cookie werden benannt', () => {
  const basis = protokollZustand();
  const ohne = (zustand, abschnitt) => ({ ...zustand, [abschnitt]: [] });

  const kistenVoll = encodeSnapshot(ohne(basis, 'projectiles'));
  const kistenTeil = decodeSnapshot(kistenVoll.subarray(
    0, HEADER_SIZE + 2 * PLAYER_STRIDE + Math.floor(CRATE_STRIDE / 2),
  ));
  assert.ok(kistenTeil);
  assert.deepEqual(kistenTeil.truncatedSections,
    [{ section: 'crates', expected: 1, read: 0 }]);
  assert.deepEqual(kistenTeil.turrets, [], 'hinter einem abgeschnittenen Abschnitt wird nicht weitergelesen');

  const turmVoll = encodeSnapshot(ohne(ohne(basis, 'projectiles'), 'crates'));
  const turmTeil = decodeSnapshot(turmVoll.subarray(
    0, HEADER_SIZE + 2 * PLAYER_STRIDE + Math.floor(TURRET_STRIDE / 2),
  ));
  assert.ok(turmTeil);
  assert.deepEqual(turmTeil.truncatedSections,
    [{ section: 'turrets', expected: 1, read: 0 }]);

  const guentherVoll = encodeSnapshot(ohne(ohne(basis, 'projectiles'), 'crates'));
  const guentherTeil = decodeSnapshot(guentherVoll.subarray(0, guentherVoll.length - 3));
  assert.ok(guentherTeil);
  assert.deepEqual(guentherTeil.truncatedSections,
    [{ section: 'guenther', expected: GUENTHER_STRIDE, read: GUENTHER_STRIDE - 3 }]);

  const mitCookie = { ...basis, cookie: { x: 1, y: 2, richtung: 1, aktiv: true, pose: 'schlafen', hunger: 42 } };
  const cookieVoll = encodeSnapshot(mitCookie);
  const cookieTeil = decodeSnapshot(cookieVoll.subarray(0, cookieVoll.length - 2));
  assert.ok(cookieTeil);
  assert.deepEqual(cookieTeil.truncatedSections,
    [{ section: 'cookie', expected: COOKIE_STRIDE, read: COOKIE_STRIDE - 2 }]);
  assert.equal(cookieTeil.cookie, undefined, 'ein halber Cookie wird nicht als ganzer ausgegeben');
});

test('SRV-11: Ein abgeschnittener Spielerabschnitt bleibt ein unbrauchbarer Takt (null)', () => {
  /* Ohne vollständige Figurenliste wären Positionen und Teams falsch zuzuordnen. */
  const voll = encodeSnapshot(protokollZustand());
  const teil = decodeSnapshot(voll.subarray(0, HEADER_SIZE + PLAYER_STRIDE + 5));
  assert.equal(teil, null);
  /* Die volle Länge dagegen ist gültig. */
  assert.ok(decodeSnapshot(voll));
});

test('SRV-11: decodeSnapshot wirft bei keiner Pufferlänge und markiert jede Kürzung', () => {
  const voll = encodeSnapshot(protokollZustand());
  for (let bis = 0; bis < voll.length; bis++) {
    const teil = decodeSnapshot(voll.subarray(0, bis));
    if (teil === null) continue; // Spielerabschnitt unvollständig — bewusst null
    assert.equal(teil.truncated, true, `${bis} von ${voll.length} Byte: Kürzung muss markiert sein`);
    assert.ok(Array.isArray(teil.truncatedSections) && teil.truncatedSections.length > 0);
  }
  for (const muell of [new Uint8Array(0), new Uint8Array([MAGIC[0], MAGIC[1]]), new Uint8Array(300)]) {
    assert.doesNotThrow(() => decodeSnapshot(muell));
  }
  assert.equal(decodeSnapshot(voll).truncated, false);
});

test('SRV-11: pruefeProtokollversion akzeptiert fehlende Angabe und nennt beide Zahlen', () => {
  assert.equal(pruefeProtokollversion(undefined), null, 'ältere Sender ohne v bleiben gültig');
  assert.equal(pruefeProtokollversion(null), null);
  assert.equal(pruefeProtokollversion(PROTOCOL_VERSION), null);
  const abweichung = pruefeProtokollversion(PROTOCOL_VERSION - 1);
  assert.equal(abweichung.erwartet, PROTOCOL_VERSION);
  assert.equal(abweichung.gemeldet, PROTOCOL_VERSION - 1);
  assert.match(abweichung.text, new RegExp(`${PROTOCOL_VERSION - 1}.*${PROTOCOL_VERSION}`));
  assert.match(pruefeProtokollversion('alt').text, /Ungültige Protokollversion/);
});

test('SRV-11: Der Server weist Steuernachrichten mit fremder Protokollversion ab und zählt sie', async () => {
  /*
   * Vorher: `v` wurde gelesen, aber nie geprüft. Ein Client mit anderer Fassung
   * bekam widersprüchliche Antworten — Snapshots abgelehnt, JSON-Befehle
   * ausgeführt. Fehlendes `v` muss weiter gültig bleiben (Werkzeuge,
   * Aufzeichnungen).
   */
  const server = new GameServer({ serveStatic: () => false });
  const sockets = [];
  try {
    const { port } = await server.listen(0);
    const gesehen = await new Promise((resolve, reject) => {
      const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      sockets.push(socket);
      const frist = setTimeout(() => reject(new Error('keine Antwort auf den Handshake')), 3000);
      const liste = [];
      socket.on('error', reject);
      socket.on('open', () => {
        socket.send(JSON.stringify({ v: PROTOCOL_VERSION - 1, t: CONTROL.HELLO }));
        socket.send(JSON.stringify({ t: CONTROL.HELLO })); // ohne v: muss ankommen
      });
      socket.on('message', (daten, binaer) => {
        if (binaer) return;
        liste.push(JSON.parse(String(daten)));
        if (liste.some(m => m.t === CONTROL.ERROR) && liste.some(m => m.t === CONTROL.WELCOME)) {
          clearTimeout(frist);
          resolve(liste);
        }
      });
    });
    const fehler = gesehen.find(m => m.t === CONTROL.ERROR);
    assert.match(fehler.error, new RegExp(`Protokollversion ${PROTOCOL_VERSION - 1} statt ${PROTOCOL_VERSION}`));
    const willkommen = gesehen.find(m => m.t === CONTROL.WELCOME);
    assert.equal(willkommen.protocol, PROTOCOL_VERSION, 'ohne v bleibt der Handshake gültig');
    assert.equal(server.metrics.protocolMismatches, 1);
  } finally {
    for (const socket of sockets) socket.close();
    await server.close();
  }
});

test('SRV-11: Der Client meldet WELCOME.protocol-Abweichung und zählt sie', async () => {
  /*
   * Vorher: `WELCOME.protocol` wurde nur im `hello`-Ereignis durchgereicht. Ein
   * neuer Client gegen einen alten Server sah ein stehendes Bild ohne Ursache,
   * weil nur der Binärkanal die Version ablehnte.
   */
  const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  await new Promise(resolve => wss.once('listening', resolve));
  const { port } = wss.address();
  wss.on('connection', socket => {
    socket.on('message', () => {
      socket.send(JSON.stringify({
        v: PROTOCOL_VERSION - 1,
        t: CONTROL.WELCOME,
        protocol: PROTOCOL_VERSION - 1,
        message: 'alter Server',
      }));
    });
  });
  const client = new NetworkClient({ url: `ws://127.0.0.1:${port}/ws`, lobbyId: 'TEST' });
  try {
    const meldung = new Promise((resolve, reject) => {
      const frist = setTimeout(() => reject(new Error('keine protocol_mismatch-Meldung')), 3000);
      client.on('protocol_mismatch', info => { clearTimeout(frist); resolve(info); });
    });
    await client.connect();
    const info = await meldung;
    assert.equal(info.gemeldet, PROTOCOL_VERSION - 1);
    assert.equal(info.erwartet, PROTOCOL_VERSION);
    assert.equal(info.feld, 'protocol');
    assert.equal(client.stats.protocolMismatch?.gemeldet, PROTOCOL_VERSION - 1);
  } finally {
    client.disconnect();
    await new Promise(resolve => wss.close(resolve));
  }
});

test('SRV-11: Der Client nimmt einen abgeschnittenen, aber lesbaren Takt an und zählt ihn', async () => {
  const voll = encodeSnapshot(protokollZustand());
  const gekuerzt = voll.subarray(0, HEADER_SIZE + 2 * PLAYER_STRIDE + PROJECTILE_STRIDE + 3);
  const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  await new Promise(resolve => wss.once('listening', resolve));
  const { port } = wss.address();
  wss.on('connection', socket => {
    let gesendet = false;
    socket.on('message', () => {
      // Nur auf den ersten Rahmen antworten: Der Client schickt `hello` und
      // direkt danach `join_lobby`; zwei WELCOME wären hier nur Rauschen.
      if (gesendet) return;
      gesendet = true;
      socket.send(JSON.stringify({ v: PROTOCOL_VERSION, t: CONTROL.WELCOME, protocol: PROTOCOL_VERSION }));
      socket.send(gekuerzt);
    });
  });
  const client = new NetworkClient({ url: `ws://127.0.0.1:${port}/ws`, lobbyId: 'TEST' });
  try {
    // ZUHÖRER VOR connect(): Die erste Nachricht kann im selben Takt eintreffen.
    const ersteMeldung = new Promise((resolve, reject) => {
      const frist = setTimeout(() => reject(new Error('kein snapshot_truncated')), 3000);
      client.on('snapshot_truncated', meldung => { clearTimeout(frist); resolve(meldung); });
    });
    await client.connect();
    const info = await ersteMeldung;
    assert.deepEqual(info.sections, [{ section: 'projectiles', expected: 2, read: 1 }]);
    assert.equal(client.stats.truncatedSnapshots, 1);
    assert.equal(client.latestSnapshot.projectiles.length, 1, 'der lesbare Teil wird angezeigt');
  } finally {
    client.disconnect();
    await new Promise(resolve => wss.close(resolve));
  }
});
