/**
 * Paket C — Elo, Bestwerte und die serverseitige Auswertung einer Partie.
 *
 * Drei Ebenen, absichtlich getrennt:
 *  1. Die Elo-Rechnung als reine Funktion (Sieg gegen Stärkere bringt mehr).
 *  2. Die Verbuchung einer Partie gegen einen echten Speicher (Siege, Kills,
 *     Schaden, Schüsse, K/D, FFA, Gäste zählen nicht).
 *  3. Eine ECHTE Partie über HTTP und WebSocket: Der Server sieht das Match
 *     selbst, ein Client gibt auf, und die Rangliste trägt danach das Ergebnis.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';

import { GameServer } from '../src/server/gameServer.js';
import { KontoDienst } from '../src/server/konto.js';
import { oeffneSpeicher } from '../src/server/kontoSpeicher.js';
import {
  ELO_START, eloAenderung, erwartungswert, verbuchePartie, rangliste, bestwerte,
} from '../src/server/bestenliste.js';
import { MatchStats } from '../src/shared/stats.js';
import { CONTROL, controlMessage, parseControlMessage, decodeSnapshot } from '../src/shared/protocol.js';

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

/** Speicher mit zwei Konten, ohne den ganzen HTTP-Weg. */
function speicherMit(konten) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pa-liste-'));
  const speicher = oeffneSpeicher({ pfad: path.join(dir, 'konten.db') });
  const ids = new Map();
  let nummer = 0;
  for (const name of konten) {
    const id = `konto-${++nummer}`;
    speicher.kontoAnlegen({
      id, name, nameKlein: name.toLowerCase(), passwortHash: 'scrypt$1$1$1$00$00', jetzt: 1,
    });
    ids.set(name, id);
  }
  return { speicher, ids, dir };
}

/** Kennzahlen wie aus einer echten Partie: Team 0 (Figur 1) gewinnt gegen Team 1 (Figur 2). */
function kennzahlenZweikampf({ schuesseSieg = 3, killsSieg = 1 } = {}) {
  const stats = new MatchStats({ teams: new Map([[1, 0], [2, 1]]) });
  for (let i = 0; i < schuesseSieg; i += 1) {
    stats.feed({ type: 'shot', payload: { playerId: 1, weaponId: 'pa_037' } });
  }
  // Jeder Kill braucht einen letzten Gegner — also Schaden, dann Tod.
  for (let k = 0; k < killsSieg; k += 1) {
    const ziel = 2 + k;
    stats.feed({ type: 'damage', payload: { attackerId: 1, entityId: ziel, amount: 120 } });
    stats.feed({ type: 'death', payload: { entityId: ziel } });
  }
  stats.feed({ type: 'match_over', payload: { winnerTeamId: 0, rounds: 3, ticks: 900 } });
  return stats;
}

// ---------------------------------------------------------------- Elo (reine Rechnung)

test('Elo: Sieg gegen einen Stärkeren bringt mehr als gegen einen Gleichstarken', () => {
  assert.equal(ELO_START, 1000);
  const gleich = eloAenderung(1000, [1000], 1);
  const staerker = eloAenderung(1000, [1400], 1);
  const schwaechere = eloAenderung(1000, [600], 1);
  assert.equal(gleich, 16, 'K=32, Erwartung 0,5 → +16');
  assert.ok(staerker > gleich, `gegen 1400: +${staerker} muss mehr sein als +${gleich}`);
  assert.ok(schwaechere < gleich, `gegen 600: +${schwaechere} muss weniger sein als +${gleich}`);
  // Gegenprobe von der anderen Seite: Der Stärkere verliert mehr.
  assert.equal(eloAenderung(1400, [1000], 0), -Math.round(32 * erwartungswert(1400, 1000)));
  assert.ok(eloAenderung(1400, [1000], 0) < eloAenderung(1000, [1400], 0));
  // Mehrere Gegner: gemittelt, nicht summiert.
  assert.equal(eloAenderung(1000, [1000, 1000], 1), 16);
  // Unentschieden ist 0,5.
  assert.equal(eloAenderung(1000, [1000], 0.5), 0);
});

// ---------------------------------------------------------------- Verbuchung

test('Verbuchung: Sieg, Kills, Schaden, Schüsse, Tode, K/D landen im Konto', () => {
  const { speicher, ids, dir } = speicherMit(['Anna', 'Bert']);
  try {
    const stats = kennzahlenZweikampf({ schuesseSieg: 4 });
    const seats = [
      { kontoId: ids.get('Anna'), teamId: 0, entityId: 1 },
      { kontoId: ids.get('Bert'), teamId: 1, entityId: 2 },
    ];
    const ergebnis = verbuchePartie({ speicher, seats, stats, lobbyId: 'L1', modus: '1x1', jetzt: 5000 });
    assert.equal(ergebnis.verbucht, true);
    assert.equal(ergebnis.ergebnisse.length, 2);

    const anna = speicher.kontoNachId(ids.get('Anna'));
    const bert = speicher.kontoNachId(ids.get('Bert'));
    assert.equal(anna.siege, 1);
    assert.equal(anna.partien, 1);
    assert.equal(anna.kills, 1);
    assert.equal(anna.schaden, 120);
    assert.equal(anna.schuesse, 4);
    assert.equal(anna.besteSchuesse, 4, 'Bestwert „meiste Schüsse" ist das Maximum EINER Partie');
    assert.equal(anna.tode, 0);
    assert.ok(anna.elo > 1000, `Sieger steigt (${anna.elo})`);

    assert.equal(bert.siege, 0);
    assert.equal(bert.niederlagen, 1);
    assert.equal(bert.tode, 1);
    assert.equal(bert.kills, 0);
    assert.ok(bert.elo < 1000, `Verlierer fällt (${bert.elo})`);
    assert.equal(anna.elo + bert.elo, 2000, 'Elo ist ein Nullsummenspiel bei gleicher Startwertung');

    const liste = rangliste(speicher);
    assert.deepEqual(liste.map(zeile => zeile.name), ['Anna', 'Bert']);
    assert.equal(liste[0].platz, 1);
    assert.equal(liste[0].siegquote, 1);
    assert.equal(liste[1].siegquote, 0);

    // Die Partie steht als Zeile im Speicher (nachvollziehbar, nicht nur Summe).
    const partien = speicher.partienVon(ids.get('Anna'));
    assert.equal(partien.length, 1);
    assert.equal(partien[0].ergebnis, 'sieg');
  } finally {
    speicher.schliessen();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Verbuchung: nur Partien mit mindestens zwei ANGEMELDETEN Menschen zählen', () => {
  const { speicher, ids, dir } = speicherMit(['Anna']);
  try {
    const stats = kennzahlenZweikampf();
    // Ein Konto und ein Gast: Der Gast hat keine Kennung über die Partie hinaus.
    const ergebnis = verbuchePartie({
      speicher,
      seats: [
        { kontoId: ids.get('Anna'), teamId: 0, entityId: 1 },
        { kontoId: null, teamId: 1, entityId: 2 },
      ],
      stats,
      jetzt: 1,
    });
    assert.equal(ergebnis.verbucht, false);
    assert.equal(ergebnis.grund, 'zu-wenig-konten');
    const anna = speicher.kontoNachId(ids.get('Anna'));
    assert.equal(anna.partien, 0, 'ein Sieg gegen einen Gast darf sich nicht selbst erzeugen');
    assert.equal(anna.elo, 1000);
    assert.equal(speicher.partienVon(ids.get('Anna')).length, 0);
  } finally {
    speicher.schliessen();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Verbuchung „jeder gegen jeden": letzter Überlebender siegt, alle anderen verlieren', () => {
  const { speicher, ids, dir } = speicherMit(['Anna', 'Bert', 'Clara']);
  try {
    const stats = new MatchStats({ teams: new Map([[1, 0], [2, 1], [3, 2]]) });
    stats.feed({ type: 'shot', payload: { playerId: 3 } });
    stats.feed({ type: 'damage', payload: { attackerId: 3, entityId: 2, amount: 99 } });
    stats.feed({ type: 'death', payload: { entityId: 1 } });
    stats.feed({ type: 'death', payload: { entityId: 2 } });
    stats.feed({ type: 'match_over', payload: { winnerTeamId: 2, rounds: 5, ticks: 1800 } });

    const seats = [
      { kontoId: ids.get('Anna'), teamId: 0, entityId: 1 },
      { kontoId: ids.get('Bert'), teamId: 1, entityId: 2 },
      { kontoId: ids.get('Clara'), teamId: 2, entityId: 3 },
    ];
    const ergebnis = verbuchePartie({ speicher, seats, stats, modus: 'ffa', jetzt: 7 });
    assert.equal(ergebnis.verbucht, true);
    const nachName = new Map(ergebnis.ergebnisse.map(eintrag => [eintrag.name, eintrag.ergebnis]));
    assert.equal(nachName.get('Clara'), 'sieg');
    assert.equal(nachName.get('Anna'), 'niederlage');
    assert.equal(nachName.get('Bert'), 'niederlage');

    const clara = speicher.kontoNachId(ids.get('Clara'));
    const anna = speicher.kontoNachId(ids.get('Anna'));
    assert.equal(clara.siege, 1);
    assert.equal(clara.partien, 1);
    assert.equal(clara.kills, 1, 'der letzte Treffer gehört dem Sieger');
    assert.ok(clara.elo > anna.elo);
    assert.equal(anna.partien, 1, 'auch der Verlierer hat eine Partie gespielt');
    assert.equal(anna.siege, 0);
  } finally {
    speicher.schliessen();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Bestwerte über alle Zeiten: Schüsse, beste/schlechteste K/D, meiste Siege', () => {
  const { speicher, ids, dir } = speicherMit(['Anna', 'Bert', 'Clara']);
  try {
    // Anna: 5 Schüsse, 2 Kills, 1 Tod → K/D 2. Bert: kein Kill, 1 Tod → K/D 0.
    const stats = kennzahlenZweikampf({ schuesseSieg: 5, killsSieg: 2 });
    verbuchePartie({
      speicher,
      seats: [
        { kontoId: ids.get('Anna'), teamId: 0, entityId: 1 },
        { kontoId: ids.get('Bert'), teamId: 1, entityId: 2 },
      ],
      stats,
      jetzt: 1,
    });
    // Zweite Partie: Anna gewinnt wieder (meiste Siege), Clara verliert.
    const zweite = kennzahlenZweikampf({ schuesseSieg: 2 });
    verbuchePartie({
      speicher,
      seats: [
        { kontoId: ids.get('Anna'), teamId: 0, entityId: 1 },
        { kontoId: ids.get('Clara'), teamId: 1, entityId: 2 },
      ],
      stats: zweite,
      jetzt: 2,
    });

    const rekorde = bestwerte(speicher);
    assert.equal(rekorde.meisteSchuesse.name, 'Anna');
    assert.equal(rekorde.meisteSchuesse.wert, 5);
    assert.equal(rekorde.besteKd.name, 'Anna');
    assert.equal(rekorde.besteKd.wert, 3, 'K/D = Kills / Tode — Anna: 3 Kills, nie gestorben');
    assert.ok(['Bert', 'Clara'].includes(rekorde.schlechtesteKd.name), 'wer nie trifft und stirbt, hat die schlechteste K/D');
    assert.equal(rekorde.schlechtesteKd.wert, 0);
    assert.equal(rekorde.meisteSiege.name, 'Anna');
    assert.equal(rekorde.meisteSiege.wert, 2);

    // Leerer Speicher: keine Rekorde, aber auch keine erfundene 0.
    const leer = speicherMit([]);
    try {
      const ohne = bestwerte(leer.speicher);
      assert.equal(ohne.meisteSchuesse, null);
      assert.equal(ohne.besteKd, null);
      assert.equal(ohne.schlechtesteKd, null);
      assert.equal(ohne.meisteSiege, null);
    } finally {
      leer.speicher.schliessen();
      fs.rmSync(leer.dir, { recursive: true, force: true });
    }
  } finally {
    speicher.schliessen();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------- Echte Partie

/** Kleiner WebSocket-Client für die Echtpartie. */
class TestClient {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.controls = [];
    this.snapshots = [];
    this.opened = new Promise((resolve, reject) => {
      this.socket.once('open', resolve);
      this.socket.once('error', reject);
    });
    this.socket.on('message', (raw, isBinary) => {
      if (isBinary) {
        const snapshot = decodeSnapshot(raw);
        if (snapshot) this.snapshots.push(snapshot);
        return;
      }
      const message = parseControlMessage(raw.toString());
      if (message) this.controls.push(message);
    });
  }

  open() { return this.opened; }
  send(type, payload = {}) { this.socket.send(controlMessage(type, payload)); }

  async waitForSnapshot(timeoutMs = 15_000) {
    const ende = Date.now() + timeoutMs;
    return new Promise((resolve, reject) => {
      const poll = () => {
        if (this.snapshots.length > 0) return resolve(this.snapshots[this.snapshots.length - 1]);
        if (Date.now() > ende) return reject(new Error('Timeout beim Warten auf einen Snapshot'));
        setTimeout(poll, 20);
      };
      poll();
    });
  }

  async waitFor(type, timeoutMs = 15_000) {
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

test('Echte Partie: Der Server wertet selbst aus — Aufgeben, Ergebnis, Rangliste', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pa-match-'));
  const speicher = oeffneSpeicher({ pfad: path.join(dir, 'konten.db') });
  const dienst = new KontoDienst({ speicher, logger: falscherLogger() });
  const server = new GameServer({
    konten: dienst, persistence: null, serveStatic: () => false, logger: falscherLogger(),
  });
  const clients = [];
  try {
    const { url } = await server.listen(0);
    const registriere = async name => (await (await fetch(`${url}/api/konto/registrieren`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, passwort: `wegwerf-${name}-1` }),
    })).json());

    const sieger = await registriere('Siegerin');
    const verlierer = await registriere('Verlierer');

    const erstellt = await fetch(`${url}/api/lobby/create`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${sieger.token}` },
      body: JSON.stringify({ teams: 2, playersPerTeam: 1, name: 'Siegerin' }),
    });
    assert.equal(erstellt.status, 201);
    const { lobby, player } = await erstellt.json();

    const siegerClient = new TestClient(`${url.replace(/^http/, 'ws')}/ws?sitzung=${encodeURIComponent(sieger.token)}`);
    clients.push(siegerClient);
    await siegerClient.open();
    siegerClient.send(CONTROL.JOIN_LOBBY, { lobbyId: lobby.id, token: player.token });
    await siegerClient.waitFor(CONTROL.WELCOME);

    const verliererClient = new TestClient(`${url.replace(/^http/, 'ws')}/ws?sitzung=${encodeURIComponent(verlierer.token)}`);
    clients.push(verliererClient);
    await verliererClient.open();
    verliererClient.send(CONTROL.JOIN_LOBBY, { lobbyId: lobby.id });
    await verliererClient.waitFor(CONTROL.WELCOME);

    // Die Partie läuft — der Verlierer gibt auf. Das ist ein Ereignis IM Match,
    // keine Meldung „ich habe verloren": Der Server stellt es selbst fest.
    await verliererClient.waitForSnapshot();
    verliererClient.send(CONTROL.SURRENDER);
    await siegerClient.waitFor('match_over');

    // Kurz warten, bis die Verbuchung geschrieben ist (sie läuft im Match-Ende).
    const ende = Date.now() + 5000;
    let liste = null;
    for (;;) {
      liste = await (await fetch(`${url}/api/bestenliste`)).json();
      if (liste.eintraege.some(zeile => zeile.partien > 0) || Date.now() > ende) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    assert.equal(liste.eintraege.length, 2, 'beide Konten stehen in der Rangliste');
    const nachName = new Map(liste.eintraege.map(zeile => [zeile.name, zeile]));
    const gewinner = nachName.get('Siegerin');
    const gebeugter = nachName.get('Verlierer');
    assert.equal(gewinner.siege, 1);
    assert.equal(gewinner.partien, 1);
    assert.ok(gewinner.elo > 1000, `Siegerin steigt: ${gewinner.elo}`);
    assert.equal(gebeugter.siege, 0);
    assert.equal(gebeugter.niederlagen, 1);
    assert.equal(gebeugter.partien, 1);
    assert.equal(gebeugter.tode, 1, 'der Tod kommt aus dem Ereignis der Simulation');
    assert.ok(gebeugter.elo < 1000, `Verlierer fällt: ${gebeugter.elo}`);

    // Ein Gast in einer weiteren Lobby verändert die Rangliste nicht.
    const gastLobby = await (await fetch(`${url}/api/lobby/create`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ teams: 2, playersPerTeam: 1 }),
    })).json();
    assert.ok(gastLobby.lobby.id);
    const vorher = (await (await fetch(`${url}/api/bestenliste`)).json()).stand;
    assert.equal((await (await fetch(`${url}/api/bestenliste`)).json()).stand, vorher);
  } finally {
    for (const client of clients) client.close();
    await server.close();
    speicher.schliessen();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
