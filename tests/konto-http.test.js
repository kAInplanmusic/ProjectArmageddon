/**
 * Paket C — Konten (Login) über die echten HTTP- und WebSocket-Wege.
 *
 * Aufbau wie `tests/server-technik-2026-11.test.js` und
 * `tests/resume-platz.test.js`: ein echter `GameServer` auf Port 0, echte
 * `fetch`-Aufrufe, echte WebSocket-Verbindungen, ein Speicher in einem
 * temporären Verzeichnis. Kein Teil wird nachgebaut — geprüft wird, was ein
 * Browser auch sieht.
 *
 * Abgedeckt (Pflichtfälle): Registrierung, doppelter Name (auch andere
 * Schreibweise), falsches Passwort, Rate-Limit je Name und je IP,
 * Sitzungstoken im Handshake, Konto löschen entfernt Daten, Abmelden,
 * Persistenz über einen Neustart, Admin-Reset-Skript.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { WebSocket } from 'ws';

import { GameServer } from '../src/server/gameServer.js';
import { KontoDienst, Bremse } from '../src/server/konto.js';
import { oeffneSpeicher } from '../src/server/kontoSpeicher.js';
import { CONTROL, PROTOCOL_VERSION, controlMessage, parseControlMessage } from '../src/shared/protocol.js';

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Sammel-Logger: Die Tests sollen die Konsole nicht mit JSON zuschütten. */
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

/** Ein Testserver mit eigenem Kontospeicher in einem eigenen Verzeichnis. */
async function starteServer({ bremse = null, verzeichnis = null } = {}) {
  const dir = verzeichnis ?? fs.mkdtempSync(path.join(os.tmpdir(), 'pa-konto-'));
  const speicher = oeffneSpeicher({ pfad: path.join(dir, 'konten.db') });
  const dienst = new KontoDienst({ speicher, logger: falscherLogger(), bremse: bremse ?? undefined });
  const server = new GameServer({
    konten: dienst,
    persistence: null,
    serveStatic: () => false,
    logger: falscherLogger(),
  });
  const { url } = await server.listen(0);
  return { dir, speicher, dienst, server, url };
}

/** HTTP-Helfer mit optionalem Sitzungstoken. */
function anfrage(url, pfad, { methode = 'GET', body = null, token = null } = {}) {
  const kopf = {};
  if (body !== null) kopf['content-type'] = 'application/json';
  if (token) kopf.authorization = `Bearer ${token}`;
  return fetch(`${url}${pfad}`, {
    method: methode,
    headers: kopf,
    body: body === null ? undefined : JSON.stringify(body),
  });
}

async function registriere(url, name, passwort = 'wegwerf-passwort-1') {
  const antwort = await anfrage(url, '/api/konto/registrieren', { methode: 'POST', body: { name, passwort } });
  return { status: antwort.status, body: await antwort.json() };
}

/** Kleiner WebSocket-Testclient (nur die Steuernachrichten, die hier zählen). */
class TestClient {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.controls = [];
    this.opened = new Promise((resolve, reject) => {
      this.socket.once('open', resolve);
      this.socket.once('error', reject);
    });
    this.socket.on('message', raw => {
      if (typeof raw !== 'string' && !Buffer.isBuffer(raw)) return;
      const message = parseControlMessage(raw.toString());
      if (message) this.controls.push(message);
    });
  }

  open() { return this.opened; }

  send(type, payload = {}) { this.socket.send(controlMessage(type, payload)); }

  async waitFor(type, timeoutMs = 6000) {
    const ende = Date.now() + timeoutMs;
    return new Promise((resolve, reject) => {
      const poll = () => {
        const index = this.controls.findIndex(message => message.t === type);
        if (index >= 0) return resolve(this.controls.splice(index, 1)[0]);
        if (Date.now() > ende) return reject(new Error(`Timeout beim Warten auf "${type}"`));
        setTimeout(poll, 20);
      };
      poll();
    });
  }

  close() { this.socket.close(); }
}

const wsUrl = (url, token = null) => `${url.replace(/^http/, 'ws')}/ws${token ? `?sitzung=${encodeURIComponent(token)}` : ''}`;

// ---------------------------------------------------------------- Registrierung

test('Registrierung: Name + Passwort genügen, Antwort trägt ein Sitzungstoken und kein Geheimnis', async () => {
  const { server, url, speicher } = await starteServer();
  try {
    const antwort = await anfrage(url, '/api/konto/registrieren', {
      methode: 'POST',
      body: { name: 'Anna', passwort: 'wegwerf-passwort-1' },
    });
    assert.equal(antwort.status, 201);
    const body = await antwort.json();
    assert.equal(body.konto.name, 'Anna');
    assert.equal(body.konto.elo, 1000, 'Startwert der Rangliste');
    assert.ok(typeof body.token === 'string' && body.token.length >= 32, 'Sitzungstoken');
    assert.ok(body.laeuftAb > Date.now(), 'Ablauf in der Zukunft');
    // Kein Klartext, kein Hash, kein E-Mail-Feld — nirgends in der Antwort.
    const roh = JSON.stringify(body);
    assert.ok(!roh.includes('wegwerf-passwort-1'), 'Passwort steht nicht in der Antwort');
    assert.ok(!roh.includes('scrypt'), 'Hash steht nicht in der Antwort');
    assert.ok(!('email' in body.konto) && !('mail' in body.konto), 'kein E-Mail-Feld');

    // Das Konto liegt im Speicher — mit scrypt-Hash und Salz.
    const gespeichert = speicher.kontoNachNameKlein('anna');
    assert.ok(gespeichert, 'Konto gespeichert');
    assert.match(gespeichert.passwortHash, /^scrypt\$16384\$8\$1\$[0-9a-f]{32}\$[0-9a-f]{128}$/,
      'scrypt mit eigenem Salz und 64 Byte Hash');

    // Der Token gilt: Wer bin ich?
    const ich = await anfrage(url, '/api/konto', { token: body.token });
    assert.equal(ich.status, 200);
    const eigenes = await ich.json();
    assert.equal(eigenes.konto.name, 'Anna');

    // Ohne Token: 401.
    const ohne = await anfrage(url, '/api/konto');
    assert.equal(ohne.status, 401);
  } finally {
    await server.close();
  }
});

test('Name ist eindeutig ohne Rücksicht auf Groß/Klein und Leerzeichen', async () => {
  const { server, url } = await starteServer();
  try {
    assert.equal((await registriere(url, 'Anna')).status, 201);
    for (const variante of ['anna', 'ANNA', '  Anna  ', 'aNnA']) {
      const antwort = await registriere(url, variante);
      assert.equal(antwort.status, 409, `„${variante}" muss als vergeben gelten`);
      assert.equal(antwort.body.code, 'name_vergeben');
    }
    // Ungültige Namen werden abgelehnt, nicht still umgebogen.
    for (const variante of ['ab', 'x'.repeat(21), '<script>', '   ']) {
      const antwort = await registriere(url, variante);
      assert.equal(antwort.status, 400, `„${variante}" ist kein gültiger Name`);
      assert.equal(antwort.body.code, 'name_ungueltig');
    }
    // Zu kurzes Passwort wird abgelehnt.
    const kurz = await registriere(url, 'Bea', 'kurz');
    assert.equal(kurz.status, 400);
    assert.equal(kurz.body.code, 'passwort_ungueltig');
  } finally {
    await server.close();
  }
});

test('Anmelden: falsches Passwort und unbekannter Name antworten gleich; richtig gibt einen neuen Token', async () => {
  const { server, url } = await starteServer();
  try {
    assert.equal((await registriere(url, 'Anna')).status, 201);

    const falsch = await anfrage(url, '/api/konto/anmelden', {
      methode: 'POST', body: { name: 'Anna', passwort: 'falsches-passwort' },
    });
    assert.equal(falsch.status, 401);
    const falschBody = await falsch.json();
    assert.equal(falschBody.code, 'zugangsdaten_falsch');

    const unbekannt = await anfrage(url, '/api/konto/anmelden', {
      methode: 'POST', body: { name: 'Niemand', passwort: 'falsches-passwort' },
    });
    assert.equal(unbekannt.status, 401);
    // Dieselbe Aussage: Der Server verrät nicht, ob es den Namen gibt.
    assert.equal((await unbekannt.json()).error, falschBody.error);

    const richtig = await anfrage(url, '/api/konto/anmelden', {
      methode: 'POST', body: { name: 'anna', passwort: 'wegwerf-passwort-1' },
    });
    assert.equal(richtig.status, 200, 'Anmeldung ist unabhängig von der Schreibweise');
    const body = await richtig.json();
    assert.equal(body.konto.name, 'Anna', 'der gespeicherte Anzeigename bleibt erhalten');
    assert.ok(body.token && body.token.length >= 32);
  } finally {
    await server.close();
  }
});

// ---------------------------------------------------------------- Bremse

test('Bremse je Name: nach drei Fehlversuchen ist auch das richtige Passwort gesperrt', async () => {
  const bremse = new Bremse({ name: 3, ip: 1000 });
  const { server, url } = await starteServer({ bremse });
  try {
    assert.equal((await registriere(url, 'Anna')).status, 201);
    for (let i = 0; i < 3; i += 1) {
      const antwort = await anfrage(url, '/api/konto/anmelden', {
        methode: 'POST', body: { name: 'Anna', passwort: `falsch-${i}-passwort` },
      });
      assert.equal(antwort.status, 401, `Versuch ${i + 1} wird geprüft und abgelehnt`);
    }
    const gesperrt = await anfrage(url, '/api/konto/anmelden', {
      methode: 'POST', body: { name: 'Anna', passwort: 'wegwerf-passwort-1' },
    });
    assert.equal(gesperrt.status, 429, 'vorher gab es keine Bremse — Durchprobieren lief unbegrenzt');
    assert.equal((await gesperrt.json()).code, 'zu_viele_versuche');
  } finally {
    await server.close();
  }
});

test('Bremse je IP: viele Namen von einer Adresse werden gemeinsam gebremst', async () => {
  const bremse = new Bremse({ name: 100, ip: 3 });
  const { server, url } = await starteServer({ bremse });
  try {
    assert.equal((await registriere(url, 'Anna')).status, 201);
    for (let i = 0; i < 3; i += 1) {
      const antwort = await anfrage(url, '/api/konto/anmelden', {
        methode: 'POST', body: { name: `Namenlos${i}`, passwort: 'irgendwas-langes' },
      });
      assert.equal(antwort.status, 401);
    }
    const gesperrt = await anfrage(url, '/api/konto/anmelden', {
      methode: 'POST', body: { name: 'Anna', passwort: 'wegwerf-passwort-1' },
    });
    assert.equal(gesperrt.status, 429, 'die IP-Bremse greift auch über verschiedene Namen');
  } finally {
    await server.close();
  }
});

// ---------------------------------------------------------------- Handshake

test('Sitzungstoken im WebSocket-Handshake: Der Platz trägt den Kontonamen, nicht den Wunschnamen', async () => {
  const { server, url } = await starteServer();
  const clients = [];
  try {
    const host = await registriere(url, 'Hostmann');
    const gast = await registriere(url, 'Gastfrau');

    // Lobby über HTTP anlegen — mit Token, damit der Host-Platz ein Konto trägt.
    const erstellt = await anfrage(url, '/api/lobby/create', {
      methode: 'POST',
      token: host.body.token,
      body: { teams: 2, playersPerTeam: 1, name: 'Hostmann' },
    });
    assert.equal(erstellt.status, 201);
    const { lobby, player } = await erstellt.json();
    assert.ok(lobby.id);

    const hostClient = new TestClient(wsUrl(url, host.body.token));
    clients.push(hostClient);
    await hostClient.open();
    hostClient.send(CONTROL.JOIN_LOBBY, { lobbyId: lobby.id, token: player.token });
    await hostClient.waitFor(CONTROL.WELCOME);

    const gastClient = new TestClient(wsUrl(url, gast.body.token));
    clients.push(gastClient);
    await gastClient.open();
    // Absichtlich ein FALSCHER Name: Der Server muss den Kontonamen nehmen.
    gastClient.send(CONTROL.JOIN_LOBBY, { lobbyId: lobby.id, name: 'Fremder Name' });
    await gastClient.waitFor(CONTROL.WELCOME);

    const stand = await (await anfrage(url, `/api/lobby/${lobby.id}`)).json();
    const namen = stand.lobby.seats.map(seat => seat.name);
    assert.ok(namen.includes('Hostmann'));
    assert.ok(namen.includes('Gastfrau'), `vorher stand hier der Name aus der Nachricht — gesehen: ${namen.join(', ')}`);
    assert.ok(!namen.includes('Fremder Name'));

    // Ein unbekannter Token ist kein Fehler: Der Client spielt als Gast.
    const ohneKonto = new TestClient(wsUrl(url, 'voellig-unbekannter-token'));
    clients.push(ohneKonto);
    await ohneKonto.open();
    assert.equal(ohneKonto.socket.readyState, WebSocket.OPEN);
  } finally {
    for (const client of clients) client.close();
    await server.close();
  }
});

test('PROTOCOL_VERSION bleibt 9 — alte Clients ohne jedes Kontowissen laufen weiter', async () => {
  const { server, url } = await starteServer();
  const clients = [];
  try {
    const health = await (await fetch(`${url}/healthz`)).json();
    assert.equal(health.protocol, PROTOCOL_VERSION);
    assert.equal(PROTOCOL_VERSION, 9);

    // Ein Client ohne `sitzung` und ohne Konto legt eine Lobby an und tritt bei.
    const erstellt = await anfrage(url, '/api/lobby/create', {
      methode: 'POST', body: { teams: 2, playersPerTeam: 1, name: 'Alter Client' },
    });
    assert.equal(erstellt.status, 201);
    const { lobby, player } = await erstellt.json();

    const client = new TestClient(wsUrl(url));
    clients.push(client);
    await client.open();
    client.send(CONTROL.HELLO);
    const willkommen = await client.waitFor(CONTROL.WELCOME);
    assert.equal(willkommen.protocol, 9);
    client.send(CONTROL.JOIN_LOBBY, { lobbyId: lobby.id, token: player.token, name: 'Alter Client' });
    const beitritt = await client.waitFor(CONTROL.WELCOME);
    assert.equal(beitritt.protocol, 9);
    assert.equal(beitritt.resumed, true);

    // Die Rangliste bleibt für ihn lesbar (nur getippt, nicht gespielt).
    const liste = await (await anfrage(url, '/api/bestenliste')).json();
    assert.deepEqual(liste.eintraege, [], 'Gäste erzeugen keine Ranglisteneinträge');
  } finally {
    for (const client of clients) client.close();
    await server.close();
  }
});

test('Ein Konto besetzt je Lobby nur einen Platz — kein Spiel gegen sich selbst', async () => {
  const { server, url } = await starteServer();
  const clients = [];
  try {
    const anna = await registriere(url, 'Anna');
    const erstellt = await anfrage(url, '/api/lobby/create', {
      methode: 'POST', token: anna.body.token, body: { teams: 2, playersPerTeam: 1, name: 'Anna' },
    });
    assert.equal(erstellt.status, 201);
    const { lobby, player } = await erstellt.json();

    const erster = new TestClient(wsUrl(url, anna.body.token));
    clients.push(erster);
    await erster.open();
    erster.send(CONTROL.JOIN_LOBBY, { lobbyId: lobby.id, token: player.token });
    await erster.waitFor(CONTROL.WELCOME);

    // Zweiter Tab, dasselbe Konto, freies Team: abgelehnt.
    const zweiter = new TestClient(wsUrl(url, anna.body.token));
    clients.push(zweiter);
    await zweiter.open();
    zweiter.send(CONTROL.JOIN_LOBBY, { lobbyId: lobby.id });
    const fehler = await zweiter.waitFor(CONTROL.ERROR);
    assert.match(fehler.error, /bereits/);
    assert.equal(fehler.errors.length, 1, 'der Client kann den Grund anzeigen');

    const stand = await (await anfrage(url, `/api/lobby/${lobby.id}`)).json();
    assert.equal(stand.lobby.seats.length, 1, 'kein zweiter Platz für dasselbe Konto');
  } finally {
    for (const client of clients) client.close();
    await server.close();
  }
});

// ---------------------------------------------------------------- Abmelden / Löschen

test('Abmelden entwertet nur diesen Token', async () => {
  const { server, url } = await starteServer();
  try {
    const konto = await registriere(url, 'Anna');
    const zweiter = await anfrage(url, '/api/konto/anmelden', {
      methode: 'POST', body: { name: 'Anna', passwort: 'wegwerf-passwort-1' },
    });
    const zweiterToken = (await zweiter.json()).token;

    const abmelden = await anfrage(url, '/api/konto/abmelden', { methode: 'POST', token: konto.body.token, body: {} });
    assert.equal(abmelden.status, 200);
    assert.equal((await anfrage(url, '/api/konto', { token: konto.body.token })).status, 401, 'abgemeldeter Token gilt nicht mehr');
    assert.equal((await anfrage(url, '/api/konto', { token: zweiterToken })).status, 200, 'andere Sitzung bleibt gültig');
  } finally {
    await server.close();
  }
});

test('Konto löschen: Passwort nötig, danach sind Konto, Sitzungen und Partien weg', async () => {
  const { server, url, speicher } = await starteServer();
  try {
    const konto = await registriere(url, 'Anna');
    const id = konto.body.konto.id;

    // Ohne Passwort: 400. Mit falschem: 403. Das Konto bleibt.
    const ohne = await anfrage(url, '/api/konto', { methode: 'DELETE', token: konto.body.token, body: {} });
    assert.equal(ohne.status, 400);
    const falsch = await anfrage(url, '/api/konto', {
      methode: 'DELETE', token: konto.body.token, body: { passwort: 'falsch-falsch' },
    });
    assert.equal(falsch.status, 403);
    assert.ok(speicher.kontoNachId(id), 'nach abgelehnter Löschung steht das Konto noch');

    const geloescht = await anfrage(url, '/api/konto', {
      methode: 'DELETE', token: konto.body.token, body: { passwort: 'wegwerf-passwort-1' },
    });
    assert.equal(geloescht.status, 200);
    assert.equal((await geloescht.json()).geloescht, true);

    assert.equal(speicher.kontoNachId(id), null, 'Konto ist aus dem Speicher entfernt');
    assert.equal(speicher.kontoNachNameKlein('anna'), null);
    assert.deepEqual(speicher.partienVon(id), [], 'Partien des Kontos sind mitgelöscht');
    assert.equal((await anfrage(url, '/api/konto', { token: konto.body.token })).status, 401, 'Sitzung ist mitgelöscht');

    const wieder = await anfrage(url, '/api/konto/anmelden', {
      methode: 'POST', body: { name: 'Anna', passwort: 'wegwerf-passwort-1' },
    });
    assert.equal(wieder.status, 401, 'der Name ist wieder frei, das alte Passwort gilt nicht');

    // Und der Name lässt sich neu vergeben.
    assert.equal((await registriere(url, 'Anna')).status, 201);
  } finally {
    await server.close();
  }
});

// ---------------------------------------------------------------- Persistenz

test('Persistenz über Neustart: Konto und Rangliste liegen in der Datei, nicht im Prozess', async () => {
  const erst = await starteServer();
  const konto = await registriere(erst.url, 'Anna');
  assert.equal(konto.status, 201);
  await erst.server.close();
  erst.speicher.schliessen();

  // „Neustart": neuer Prozess-Zustand, dieselbe Datei, neuer Server.
  const zweit = await starteServer({ verzeichnis: erst.dir });
  try {
    const anmeldung = await anfrage(zweit.url, '/api/konto/anmelden', {
      methode: 'POST', body: { name: 'anna', passwort: 'wegwerf-passwort-1' },
    });
    assert.equal(anmeldung.status, 200, 'nach dem Neustart gilt das Passwort weiter');
    const body = await anmeldung.json();
    assert.equal(body.konto.name, 'Anna');

    const liste = await (await anfrage(zweit.url, '/api/bestenliste')).json();
    assert.equal(liste.eintraege.length, 1);
    assert.equal(liste.eintraege[0].name, 'Anna');
    assert.equal(liste.eintraege[0].elo, 1000);
  } finally {
    await zweit.server.close();
    zweit.speicher.schliessen();
    fs.rmSync(erst.dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------- Admin-Reset

test('Admin-Skript setzt das Passwort neu und entwertet alle Sitzungen', async () => {
  const { server, url, speicher, dir } = await starteServer();
  try {
    const konto = await registriere(url, 'Anna');
    const datenbank = path.join(dir, 'konten.db');

    const { stdout } = await execFileAsync(process.execPath, [
      path.join(ROOT, 'scripts', 'betrieb', 'passwort-zuruecksetzen.mjs'),
      '--datenbank', datenbank,
      '--name', 'anna',
      '--passwort', 'frisches-passwort-2',
    ], { cwd: ROOT });

    assert.match(stdout, /neu gesetzt/);
    assert.ok(!stdout.includes('scrypt'), 'das Skript gibt keinen Hash aus');

    // Der Server hält seine eigene Verbindung — der Hash muss trotzdem ankommen:
    // SQLite liest bei jeder Abfrage die Datei, nicht einen Zwischenspeicher.
    const alt = await anfrage(url, '/api/konto/anmelden', {
      methode: 'POST', body: { name: 'Anna', passwort: 'wegwerf-passwort-1' },
    });
    assert.equal(alt.status, 401, 'das alte Passwort gilt nicht mehr');

    const neu = await anfrage(url, '/api/konto/anmelden', {
      methode: 'POST', body: { name: 'Anna', passwort: 'frisches-passwort-2' },
    });
    assert.equal(neu.status, 200, 'das neue Passwort gilt');

    // Alle vorher ausgestellten Sitzungen sind entwertet.
    assert.equal((await anfrage(url, '/api/konto', { token: konto.body.token })).status, 401);

    // Unbekannter Name: Exit-Code 2, keine Änderung.
    await assert.rejects(
      execFileAsync(process.execPath, [
        path.join(ROOT, 'scripts', 'betrieb', 'passwort-zuruecksetzen.mjs'),
        '--datenbank', datenbank, '--name', 'Niemand', '--passwort', 'egal-egal-1',
      ], { cwd: ROOT }),
      fehler => fehler.code === 2,
    );
    assert.ok(speicher.kontoNachNameKlein('anna'), 'das bestehende Konto bleibt unberührt');
  } finally {
    await server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
