/**
 * Regressionstests zum Audit vom 2026-10-29 (zehn Befunde, `src/server`, `src/shared`, `src/engine`).
 *
 * Jeder Test beschreibt den Fehlerfall so, wie er gemeldet wurde, und schlug VOR der Reparatur
 * fehl. Die Nummern entsprechen der Befundliste.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';

import { GameServer } from '../src/server/gameServer.js';
import { TokenBucket, RATE_TRENNEN_NACH } from '../src/server/rateLimit.js';
import { LobbyManager, NAME_MAX_ZEICHEN } from '../src/server/lobby.js';
import { validateCommand } from '../src/shared/validation.js';
import { WEAPONS_BY_ID, getWeapon } from '../src/shared/config/weapons.js';
import { generateSeed } from '../src/shared/prng.js';
import { CONTROL, controlMessage, parseControlMessage } from '../src/shared/protocol.js';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HIER, '..');

/** Kleiner Testclient: sammelt Steuernachrichten. */
class Client {
  constructor(port) {
    this.socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    this.controls = [];
    this.opened = new Promise((resolve, reject) => {
      this.socket.once('open', resolve);
      this.socket.once('error', reject);
    });
    this.socket.on('message', (raw, binaer) => {
      if (binaer) return;
      const nachricht = parseControlMessage(raw);
      if (nachricht) this.controls.push(nachricht);
    });
  }

  send(type, payload = {}) { this.socket.send(controlMessage(type, payload)); }

  async waitFor(type, timeoutMs = 4000) {
    const frist = Date.now() + timeoutMs;
    for (;;) {
      const index = this.controls.findIndex(m => m.t === type);
      if (index >= 0) return this.controls.splice(index, 1)[0];
      if (Date.now() > frist) throw new Error(`Timeout beim Warten auf "${type}"`);
      await new Promise(r => setTimeout(r, 20));
    }
  }

  close() { this.socket.close(); }
}

async function erstelleLobby(url, body = {}) {
  const antwort = await fetch(`${url}/api/lobby/create`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ teams: 2, playersPerTeam: 1, seed: 4242, ...body }),
  });
  assert.equal(antwort.status, 201);
  return antwort.json();
}

const warte = ms => new Promise(r => setTimeout(r, ms));

// ------------------------------------------------------------------ 1: Pfadausbruch

test('1: Ein kodiertes `..%2F` erreicht keine Geschwisterverzeichnisse von dist/', async () => {
  const altesCwd = process.cwd();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pa-static-'));
  fs.mkdirSync(path.join(tmp, 'dist'));
  fs.mkdirSync(path.join(tmp, 'dist-old'));
  fs.writeFileSync(path.join(tmp, 'dist', 'index.html'), '<p>ok</p>');
  fs.writeFileSync(path.join(tmp, 'dist-old', 'secret.json'), '{"geheim":true}');
  process.chdir(tmp);
  const server = new GameServer();
  try {
    const { port } = await server.listen(0);
    const hole = pfad => new Promise((resolve, reject) => {
      // `http.request` normalisiert den Pfad nicht; `%2F` bleibt bis zum Server erhalten.
      http.get({ host: '127.0.0.1', port, path: pfad }, res => {
        let body = '';
        res.on('data', c => { body += c; });
        res.on('end', () => resolve({ status: res.statusCode, body }));
      }).on('error', reject);
    });

    const angriff = await hole('/..%2Fdist-old%2Fsecret.json');
    assert.notEqual(angriff.status, 200, 'Datei aus dist-old darf nicht ausgeliefert werden');
    assert.ok(!angriff.body.includes('geheim'), 'Inhalt aus dist-old ist durchgesickert');

    const kaputt = await hole('/%E0%A4%A');
    assert.ok(kaputt.status >= 400 && kaputt.status < 500, `fehlerhafte Kodierung gibt 4xx, war ${kaputt.status}`);

    const gut = await hole('/index.html');
    assert.equal(gut.status, 200, 'normale Dateien aus dist/ werden weiter ausgeliefert');
    assert.match(gut.body, /ok/);
    const wurzel = await hole('/');
    assert.equal(wurzel.status, 200, 'die Wurzel liefert index.html');
  } finally {
    await server.close();
    process.chdir(altesCwd);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// ------------------------------------------------------------------ 2: PING wiederholt match_over

test('2: Nach dem Match-Ende wiederholt PING match_over, obwohl die Sitzung weg ist', { timeout: 30_000 }, async () => {
  const server = new GameServer();
  const { port, url } = await server.listen(0);
  const client = new Client(port);
  try {
    const erstellt = await erstelleLobby(url, { seed: 99 });
    await client.opened;
    client.send(CONTROL.JOIN_LOBBY, { lobbyId: erstellt.lobby.id, token: erstellt.player.token });
    await client.waitFor(CONTROL.WELCOME);

    const session = server.getSession(erstellt.lobby.id);
    session.stop();
    session.match.setTurnDuration(250);
    for (let i = 0; i < 20_000 && session.match.status === 'playing'; i += 1) session.stepSimulation(1);
    assert.equal(session.match.status, 'gameover', 'Testaufbau: Match muss enden');
    assert.equal(server.getSession(erstellt.lobby.id), null, 'Testaufbau: die Sitzung löscht sich beim Ende');

    // Die erste (einmalige) Meldung abholen: Ab hier hat der Client sie "verpasst".
    const erste = await client.waitFor('match_over');
    assert.equal(client.controls.filter(m => m.t === 'match_over').length, 0);

    client.send(CONTROL.PING);
    const wieder = await client.waitFor('match_over', 3000);
    assert.equal(wieder.winnerTeamId, erste.winnerTeamId, 'dasselbe Ergebnis');
    assert.equal(wieder.rounds, erste.rounds);
  } finally {
    client.close();
    await server.close();
  }
});

// ------------------------------------------------------------------ 3: Dauerflut wird getrennt

test('3: Eine Dauerflut erreicht die Trennschwelle, obwohl der Eimer laufend Token auffüllt', () => {
  let zeit = 0;
  const eimer = new TokenBucket({ jetzt: () => zeit });
  let hoechsteFolge = 0;
  let getrenntNach = null;
  // 1000 Nachrichten pro Sekunde, 5 Sekunden lang.
  for (let i = 0; i < 5000; i += 1) {
    zeit = i; // ms
    eimer.erlaube();
    hoechsteFolge = Math.max(hoechsteFolge, eimer.verworfeneInFolge);
    if (getrenntNach === null && eimer.ueberhang >= RATE_TRENNEN_NACH) getrenntNach = i;
  }
  assert.ok(hoechsteFolge < RATE_TRENNEN_NACH,
    'Belegt den alten Fehler: Die Folge verworfener Nachrichten erreicht die Schwelle nie');
  assert.notEqual(getrenntNach, null, 'Der Überhang muss die Trennschwelle erreichen');
  assert.ok(getrenntNach < 2000, `getrennt nach ${getrenntNach} Nachrichten — zu spät`);
});

test('3: Kurzes Überziehen (hängende Taste) trennt nicht', () => {
  let zeit = 0;
  const eimer = new TokenBucket({ jetzt: () => zeit });
  // 40 Nachrichten pro Sekunde (über der Dauerrate 30), eine Minute lang.
  for (let i = 0; i < 40 * 60; i += 1) {
    zeit = (i * 1000) / 40;
    eimer.erlaube();
    assert.ok(eimer.ueberhang < RATE_TRENNEN_NACH, `Überhang ${eimer.ueberhang} nach ${i} Nachrichten`);
  }
});

test('3: Der Server schließt einen Socket, der dauerhaft flutet', { timeout: 30_000 }, async () => {
  const server = new GameServer();
  const { port } = await server.listen(0);
  const client = new Client(port);
  try {
    await client.opened;
    const geschlossen = new Promise(resolve => client.socket.once('close', code => resolve(code)));
    const nachricht = controlMessage(CONTROL.PING);
    // In Wellen, damit der Eimer zwischendurch Token auffüllt (wie die gemeldete Flut).
    for (let welle = 0; welle < 30 && client.socket.readyState === WebSocket.OPEN; welle += 1) {
      for (let i = 0; i < 400; i += 1) client.socket.send(nachricht);
      await warte(15);
    }
    assert.equal(await Promise.race([geschlossen, warte(5000).then(() => 'offen')]), 1008);
  } finally {
    await server.close();
  }
});

// ------------------------------------------------------------------ 4: veralteter Socket trennt nicht

test('4: Ein zweiter JOIN eines veralteten Sockets trennt den Platz des aktiven Sockets nicht', { timeout: 30_000 }, async () => {
  const server = new GameServer();
  const { port, url } = await server.listen(0);
  const a = new Client(port);
  const b = new Client(port);
  try {
    const erstellt = await erstelleLobby(url);
    const { token } = erstellt.player;
    await a.opened;
    a.send(CONTROL.JOIN_LOBBY, { lobbyId: erstellt.lobby.id, token });
    await a.waitFor(CONTROL.WELCOME);
    // Wiederverbindung: Token gehört jetzt Socket B.
    await b.opened;
    b.send(CONTROL.JOIN_LOBBY, { lobbyId: erstellt.lobby.id, token });
    await b.waitFor(CONTROL.WELCOME);
    await warte(100);

    // Der veraltete Socket A sendet einen weiteren JOIN (hier ins Leere).
    a.send(CONTROL.JOIN_LOBBY, { lobbyId: 'gibt-es-nicht', token });
    await warte(300);

    const sitze = server.lobbyManager.get(erstellt.lobby.id).seats.filter(s => s.token === token);
    assert.ok(sitze.length > 0);
    for (const sitz of sitze) {
      assert.equal(sitz.connected, true, 'Der Platz des aktiven Sockets B darf nicht als getrennt gelten');
      assert.equal(sitz.disconnectedAt, null);
    }
  } finally {
    a.close();
    b.close();
    await server.close();
  }
});

// ------------------------------------------------------------------ 5: Namensprüfung

test('5: JOIN_LOBBY lehnt Namen ab, die kein kurzer Text sind', { timeout: 30_000 }, async () => {
  const server = new GameServer();
  const { port, url } = await server.listen(0);
  const client = new Client(port);
  try {
    const erstellt = await erstelleLobby(url, { teams: 3 });
    await client.opened;

    client.send(CONTROL.JOIN_LOBBY, { lobbyId: erstellt.lobby.id, name: { x: [1, 2, 3] } });
    const fehler1 = await client.waitFor(CONTROL.ERROR);
    assert.match(JSON.stringify(fehler1), /name/i);

    client.send(CONTROL.JOIN_LOBBY, { lobbyId: erstellt.lobby.id, name: 'x'.repeat(NAME_MAX_ZEICHEN + 1) });
    await client.waitFor(CONTROL.ERROR);

    client.send(CONTROL.JOIN_LOBBY, { lobbyId: erstellt.lobby.id, token: { boese: true } });
    await client.waitFor(CONTROL.ERROR);

    const namen = server.lobbyManager.get(erstellt.lobby.id).seats.map(s => s.name);
    assert.deepEqual(namen, ['Host'], 'Nur der Host-Platz darf existieren; kein Platz mit fremdem Namen');

    client.send(CONTROL.JOIN_LOBBY, { lobbyId: erstellt.lobby.id, name: 'Anna' });
    await client.waitFor(CONTROL.WELCOME);
    assert.ok(server.lobbyManager.get(erstellt.lobby.id).seats.some(s => s.name === 'Anna'));
  } finally {
    client.close();
    await server.close();
  }
});

test('5: LobbyManager.join prüft Name und Token selbst; null-Name wird zu „Spieler"', () => {
  const lobbys = new LobbyManager();
  const { lobby, player } = lobbys.create({ teams: 3, playersPerTeam: 1, seed: 1, hostName: null });
  assert.equal(player.name, 'Spieler', 'hostName: null bleibt erlaubt');
  assert.throws(() => lobbys.join(lobby.id, { name: 42 }), /name/);
  assert.throws(() => lobbys.join(lobby.id, { name: 'y'.repeat(400) }), /name/);
  assert.throws(() => lobbys.join(lobby.id, { name: 'ok', token: 7 }), /token/);
  assert.equal(lobbys.join(lobby.id, { name: 'a'.repeat(NAME_MAX_ZEICHEN) }).name.length, NAME_MAX_ZEICHEN);
});

// ------------------------------------------------------------------ 6: geerbte Eigenschaftsnamen

test('6: Kennungen wie „constructor" sind keine Waffen', () => {
  for (const id of ['constructor', 'toString', 'hasOwnProperty', '__proto__', 'valueOf']) {
    const ergebnis = validateCommand({ playerId: 1, angle: 0.5, power: 50, tick: 0, weaponId: id });
    assert.equal(ergebnis.valid, false, `${id} wurde als Waffe akzeptiert`);
    assert.match(ergebnis.errors.join(' '), /Unbekannte Waffe/);
    assert.equal(getWeapon(id), null, `getWeapon(${id})`);
    assert.equal(WEAPONS_BY_ID[id], undefined, `WEAPONS_BY_ID[${id}] (Lookups in Inventar und Client)`);
  }
  const echteId = Object.keys(WEAPONS_BY_ID)[0];
  assert.ok(getWeapon(echteId), 'echte Waffen werden weiter gefunden');
  assert.equal(validateCommand({ playerId: 1, angle: 0.5, power: 50, tick: 0, weaponId: echteId }).valid, true);
});

// ------------------------------------------------------------------ 7: Kommandos vor dem Start

test('7: Spielkommandos werden abgelehnt und nicht aufgezeichnet, solange die Simulation steht', { timeout: 30_000 }, async () => {
  const server = new GameServer();
  const { port, url } = await server.listen(0);
  const client = new Client(port);
  try {
    const erstellt = await erstelleLobby(url);
    await client.opened;
    client.send(CONTROL.JOIN_LOBBY, { lobbyId: erstellt.lobby.id, token: erstellt.player.token });
    await client.waitFor(CONTROL.WELCOME);
    const session = server.getSession(erstellt.lobby.id);
    assert.equal(session.laeuft, false, 'Testaufbau: Team 2 fehlt, die Simulation steht');
    const eintraege = session.recorder.entryCount;
    const tick = session.match.world.tickCount;

    const kommandos = [
      [CONTROL.INPUT, { angle: 1, power: 50, tick }],
      [CONTROL.MOVE, { richtung: 1 }],
      [CONTROL.JUMP, {}],
      [CONTROL.SELECT_WEAPON, { weaponId: Object.keys(WEAPONS_BY_ID)[0] }],
      [CONTROL.SKIP_TURN, {}],
      [CONTROL.SURRENDER, {}],
      [CONTROL.SKIP_PAUSE, {}],
      [CONTROL.DROP_WEAPON, { weaponId: Object.keys(WEAPONS_BY_ID)[0] }],
    ];
    for (const [typ, nutzlast] of kommandos) {
      client.send(typ, nutzlast);
      const fehler = await client.waitFor(CONTROL.ERROR);
      assert.match(JSON.stringify(fehler), /läuft noch nicht/, `${typ} wurde nicht wegen des Wartezustands abgelehnt`);
    }
    assert.equal(session.recorder.entryCount, eintraege, 'Es darf nichts aufgezeichnet worden sein');
    assert.equal(session.match.world.tickCount, tick, 'Die Zeit steht');
    assert.equal(session.match.surrendered?.size ?? 0, 0);
  } finally {
    client.close();
    await server.close();
  }
});

test('7: Sobald alle Teams da sind, laufen Kommandos wieder durch', { timeout: 30_000 }, async () => {
  const server = new GameServer();
  const { port, url } = await server.listen(0);
  const a = new Client(port);
  const b = new Client(port);
  try {
    const erstellt = await erstelleLobby(url);
    await a.opened;
    await b.opened;
    a.send(CONTROL.JOIN_LOBBY, { lobbyId: erstellt.lobby.id, token: erstellt.player.token });
    await a.waitFor(CONTROL.WELCOME);
    b.send(CONTROL.JOIN_LOBBY, { lobbyId: erstellt.lobby.id, name: 'Zweiter' });
    await b.waitFor(CONTROL.WELCOME);
    const session = server.getSession(erstellt.lobby.id);
    assert.equal(session.laeuft, true);

    a.send(CONTROL.SKIP_PAUSE, {});
    b.send(CONTROL.SKIP_PAUSE, {});
    await warte(300);
    const meldungen = [...a.controls, ...b.controls].filter(m => m.t === CONTROL.ERROR);
    assert.ok(!meldungen.some(m => /läuft noch nicht/.test(JSON.stringify(m))),
      'Bei laufender Simulation darf keine Wartezustand-Ablehnung kommen');
  } finally {
    a.close();
    b.close();
    await server.close();
  }
});

// ------------------------------------------------------------------ 8: Anlege-Verlauf

test('8: Läuft der Anlege-Verlauf über, bleibt das Kontingent einer aktiven Adresse erhalten', { timeout: 30_000 }, async () => {
  const alt = GameServer.MAX_CREATE_ADRESSEN;
  GameServer.MAX_CREATE_ADRESSEN = 3;
  const server = new GameServer({ maxLobbyAnlegenProMinute: 1 });
  try {
    const { port } = await server.listen(0, '0.0.0.0');
    const anlegen = adresse => new Promise((resolve, reject) => {
      const req = http.request({
        host: '127.0.0.1', port, path: '/api/lobby/create', method: 'POST', localAddress: adresse,
        headers: { 'content-type': 'application/json' },
      }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
      req.on('error', reject);
      req.end('{}');
    });

    assert.equal(await anlegen('127.0.0.2'), 201, 'erste Lobby der Hauptadresse');
    assert.equal(await anlegen('127.0.0.2'), 429, 'zweite Lobby: Grenze erreicht');
    assert.equal(await anlegen('127.0.0.3'), 201);
    assert.equal(await anlegen('127.0.0.4'), 201);
    assert.equal(await anlegen('127.0.0.2'), 429, 'Hauptadresse bleibt aktiv (und wird weiter begrenzt)');
    // Vierte Adresse: Der Verlauf läuft über (3) — vorher wurde ALLES gelöscht.
    assert.equal(await anlegen('127.0.0.5'), 201);
    assert.equal(await anlegen('127.0.0.2'), 429,
      'Das Überlaufen darf der aktiven Hauptadresse kein frisches Kontingent geben');
  } finally {
    GameServer.MAX_CREATE_ADRESSEN = alt;
    await server.close();
  }
});

// ------------------------------------------------------------------ 9: abgebrochene Anfrage

test('9: Eine mitten im Body abgebrochene Anfrage legt keine Lobby mit Standardwerten an', { timeout: 30_000 }, async () => {
  const server = new GameServer();
  const { port } = await server.listen(0);
  try {
    const vorher = server.lobbyManager.size;
    await new Promise((resolve, reject) => {
      const socket = net.connect(port, '127.0.0.1', () => {
        socket.write(
          'POST /api/lobby/create HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\n'
          + 'Content-Length: 200\r\n\r\n{"teams":',
        );
        setTimeout(() => { socket.destroy(); resolve(); }, 100);
      });
      socket.on('error', reject);
    });
    await warte(300);
    assert.equal(server.lobbyManager.size, vorher, 'Es darf keine Lobby entstanden sein');
  } finally {
    await server.close();
  }
});

// ------------------------------------------------------------------ 10: Determinismusregel

/** Code-Zeilen (ohne Kommentare) einer Datei, die gegen AGENTS.md §2 verstoßen. */
function wanduhrTreffer(datei) {
  return fs.readFileSync(datei, 'utf8').split('\n')
    .map((text, index) => ({ text: text.trim(), zeile: index + 1 }))
    .filter(e => !/^(\/\/|\*|\/\*)/.test(e.text) && /Date\.now\s*\(|Math\.random\s*\(|performance\.now\s*\(|new Date\s*\(/.test(e.text))
    .map(e => `${path.relative(ROOT, datei)}:${e.zeile}: ${e.text}`);
}

function jsDateien(ordner) {
  return fs.readdirSync(ordner, { withFileTypes: true }).flatMap(e => {
    const voll = path.join(ordner, e.name);
    if (e.isDirectory()) return jsDateien(voll);
    return e.name.endsWith('.js') ? [voll] : [];
  });
}

test('10: src/engine und src/shared lesen weder Wanduhr noch Math.random (AGENTS.md §2)', () => {
  const treffer = ['src/engine', 'src/shared'].flatMap(o => jsDateien(path.join(ROOT, o))).flatMap(wanduhrTreffer);
  assert.deepEqual(treffer, []);
});

test('10: Der Wächter erkennt einen Verstoß (Selbstprüfung)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pa-waechter-'));
  const datei = path.join(tmp, 'schlecht.js');
  fs.writeFileSync(datei, '// Date.now() im Kommentar ist erlaubt\nconst x = Date.now();\nconst y = Math.random();\n');
  try {
    assert.equal(wanduhrTreffer(datei).length, 2);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('10: generateSeed nutzt crypto; ohne crypto gibt es keinen stillen Rückfall', () => {
  assert.ok(Number.isInteger(generateSeed()));

  const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true, writable: true });
  try {
    assert.throws(() => generateSeed(), /crypto/);
    assert.equal(generateSeed({ ersatzquelle: () => 0x1_0000_0007 }), 7, 'untere 32 Bit der Ersatzquelle');
  } finally {
    if (original) Object.defineProperty(globalThis, 'crypto', original);
    else delete globalThis.crypto;
  }
  assert.ok(Number.isInteger(generateSeed()), 'crypto ist wiederhergestellt');
});
