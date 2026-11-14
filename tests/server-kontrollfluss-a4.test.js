/**
 * A4 — der TATSÄCHLICHE Kontrollfluss für `CONTROL.START_MATCH` und die
 * Wiederverbindung. Kein Wunschbild: Jeder Fall hält fest, was der Server heute
 * tut, damit die drei offenen Punkte (RT-2, B-9a, NET-1) eine belastbare
 * Grundlage haben.
 *
 * Die Anker sind Namen, keine Zeilennummern (die wandern):
 *
 *  - Start-Gate: `GameServer#starteMatchFallsVoll` (die EINZIGE Stelle, die
 *    `LobbySession#start()` ruft).
 *  - Beitritt/Wiederverbindung: `case CONTROL.JOIN_LOBBY` und
 *    `case CONTROL.RESUME` in `GameServer#nachrichtBehandeln`.
 *  - Platzverwaltung: `LobbyManager#join`, `#resume`, `#disconnect`,
 *    `#pruneDisconnected`.
 *
 * Zwei Fälle sind ausdrücklich ZUSTANDS-PINS für OFFENE Punkte (Titel sagt es):
 *  - RT-2: Nach dem Reconnect-Fenster ist der Platz frei, die laufende Lobby
 *    nimmt aber niemanden mehr auf.
 *  - Wiederverbindung nach Match-Ende: Der weiterhin verbundene Gegner wird
 *    nicht an die neue Sitzung gebunden (er bekommt keine Snapshots mehr).
 *    Eine Reparatur braucht Client-Verhalten (Karte/Startanzeige) oder eine
 *    Produktentscheidung — deshalb in A4 nicht geändert, sondern festgehalten.
 *
 * NET-1 wird ebenfalls gepinnt: `match_over` wird NUR auf PING wiederholt
 * (Client-Intervall 2 s), es gibt keine serverseitige Wiederholung von selbst.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { LobbyManager } from '../src/server/lobby.js';
import { CONTROL } from '../src/shared/protocol.js';
import { starteServer, erstelleLobby, trittBei, TestClient } from './helfer/server-testclient.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const warte = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Spielt ein Match ohne Schützen bis zum Ende (Rundengrenze). */
function matchZuEndeSpielen(session) {
  session.stop();
  session.match.setTurnDuration(250);
  for (let i = 0; i < 20_000 && session.match.status === 'playing'; i += 1) {
    session.stepSimulation(1);
  }
  assert.equal(session.match.status, 'gameover', 'Testaufbau: Match muss enden');
}

/** Der letzte `lobby_state` mit einer bestimmten Zahl besetzter Teams. */
async function warteAufLobbyStand(client, pruefung, timeoutMs = 3000) {
  const bis = Date.now() + timeoutMs;
  let letzter = null;
  while (Date.now() < bis) {
    const staende = client.control.filter(m => m.t === CONTROL.LOBBY_STATE);
    letzter = staende[staende.length - 1] ?? null;
    if (letzter && pruefung(letzter)) return letzter;
    await warte(20);
  }
  return letzter;
}

// ---------------------------------------------------------------- START_MATCH

test('A4 START_MATCH ohne Beitritt: „Keine aktive Sitzung", kein Zustand', async () => {
  const { server, wsUrl } = await starteServer();
  const client = new TestClient(wsUrl);
  try {
    await client.open();
    client.send(CONTROL.START_MATCH);
    const fehler = await client.warte(CONTROL.ERROR);
    assert.ok(fehler, 'Ohne Lobby/Sitzung muss eine Ablehnung kommen');
    assert.match(fehler.error, /Keine aktive Sitzung/);
    assert.equal(client.snapshots.length, 0, 'Es darf kein Matchzustand entstehen');
  } finally {
    client.close();
    await server.close();
  }
});

test('A4 START_MATCH bei unvollständigen Teams: Ablehnung, kein Start, Status bleibt „open"', async () => {
  const { server, url, wsUrl } = await starteServer();
  const a = { client: null };
  const b = { client: null };
  try {
    // Drei Teams, nur zwei Menschen: `alleTeamsBesetzt` ist falsch.
    const erstellt = await erstelleLobby(url, { teams: 3, seed: 5150 });
    const lobbyId = erstellt.lobby.id;
    Object.assign(a, await trittBei(wsUrl, lobbyId, { name: 'A', token: erstellt.player.token }));
    Object.assign(b, await trittBei(wsUrl, lobbyId, { name: 'B' }));

    const session = server.getSession(lobbyId);
    const takteVorher = a.client.snapshots.length;
    a.client.send(CONTROL.START_MATCH);
    const fehler = await a.client.warte(CONTROL.ERROR);

    assert.ok(fehler, 'START_MATCH vor voller Besetzung muss abgelehnt werden');
    assert.match(fehler.error, /Warte auf Mitspieler/);
    assert.equal(server.lobbyManager.get(lobbyId).status, 'open',
      'Eine abgelehnte Anfrage darf den Lobby-Status nicht auf „running" ziehen');
    assert.equal(session.laeuft, false, 'Die Simulation darf nicht ticken');
    await warte(300);
    assert.equal(a.client.snapshots.length, takteVorher,
      'Ohne vollständige Teams darf kein Snapshot fließen');
  } finally {
    a.client?.close();
    b.client?.close();
    await server.close();
  }
});

test('A4 START_MATCH nach dem Auto-Start: folgenlos, KEIN Neustart (jeder Teilnehmer darf ihn senden)', async () => {
  const { server, url, wsUrl } = await starteServer();
  const a = { client: null };
  const b = { client: null };
  try {
    const erstellt = await erstelleLobby(url, { teams: 2, seed: 6001 });
    const lobbyId = erstellt.lobby.id;
    Object.assign(a, await trittBei(wsUrl, lobbyId, { name: 'A', token: erstellt.player.token }));
    // Der letzte Beitritt startet das Match bereits (Gate `#starteMatchFallsVoll`).
    Object.assign(b, await trittBei(wsUrl, lobbyId, { name: 'B' }));

    const sessionVorher = server.getSession(lobbyId);
    const takt = await b.client.warteAufSnapshot(6000);
    assert.ok(takt, 'Testaufbau: das laufende Match muss Zustände senden');
    assert.equal(sessionVorher.laeuft, true);

    // Der ZWEITE Teilnehmer sendet — es gibt keine Host-Prüfung im Server.
    b.client.send(CONTROL.START_MATCH);
    await warte(150);

    assert.equal(
      b.client.control.filter(m => m.t === CONTROL.ERROR).length, 0,
      'Ein START_MATCH auf ein bereits laufendes Match ist kein Fehler',
    );
    assert.equal(server.getSession(lobbyId), sessionVorher,
      'START_MATCH darf keine zweite Sitzung anlegen');
    assert.equal(server.lobbyManager.get(lobbyId).status, 'running');
    assert.equal(sessionVorher.match.round, server.getSession(lobbyId).match.round,
      'START_MATCH darf das Match nicht in Runde 1 zurückwerfen');

    const danach = await b.client.warteAufTakt(takt.tick, 4000);
    assert.ok(danach && danach.tick > takt.tick,
      'Die Simulation muss ununterbrochen weiterlaufen');
  } finally {
    a.client?.close();
    b.client?.close();
    await server.close();
  }
});

test('A4 Befund RT-2: kein Client sendet CONTROL.START_MATCH — der Livebetrieb startet nur über den Beitritt', () => {
  /*
   * Der START_MATCH-Zweig ist im Server geprüft und funktioniert (Tests oben),
   * wird aber von keiner Clientdatei gesendet. Das ist der Befund RT-2:
   * „im Livebetrieb unerreichbar". Der Test ist ein Quelltext-Wächter — sobald
   * ein Client den Typ doch sendet, fällt er auf und RT-2 muss neu bewertet
   * werden (dann ist auch die Start/Beitritt-Reihenfolge zu prüfen).
   */
  const clientDateien = readdirSync(join(ROOT, 'src', 'client'), { recursive: true })
    .filter(datei => String(datei).endsWith('.js'));
  const treffer = [];
  for (const datei of clientDateien) {
    const text = readFileSync(join(ROOT, 'src', 'client', String(datei)), 'utf8');
    if (/CONTROL\.START_MATCH|['"]start_match['"]/.test(text)) treffer.push(String(datei));
  }
  assert.deepEqual(treffer, [],
    'Kein Client darf START_MATCH senden, solange RT-2 offen ist');
});

// ------------------------------------------------------------- Wiederverbindung

test('A4 Trennung im laufenden Match: Gegner bekommt lobby_state, Platz bleibt reserviert, Match läuft weiter', async () => {
  const { server, url, wsUrl } = await starteServer();
  const a = { client: null };
  const b = { client: null };
  try {
    const erstellt = await erstelleLobby(url, { teams: 2, seed: 777 });
    const lobbyId = erstellt.lobby.id;
    Object.assign(a, await trittBei(wsUrl, lobbyId, { name: 'A', token: erstellt.player.token }));
    Object.assign(b, await trittBei(wsUrl, lobbyId, { name: 'B' }));
    const takt = await b.client.warteAufSnapshot(6000);
    assert.ok(takt, 'Testaufbau: Match läuft');

    a.client.close();
    // B-9 (erledigt): Der Verbliebene erfährt die Trennung sofort über den
    // weiterhin vorhandenen `lobby_state`-Kanal — kein neuer Nachrichtentyp.
    const stand = await warteAufLobbyStand(b.client, m => m.besetzteTeams === 1);
    assert.ok(stand, 'Nach dem Trennen muss ein lobby_state beim Gegner ankommen');
    assert.equal(stand.laeuft, true, 'Das Match läuft mit dem verbliebenen Menschen weiter');
    assert.equal(stand.besetzteTeams, 1);

    // B-9a (ERLEDIGT): lobby_state trägt jetzt ein `seats`-Array mit
    // Verbindungsstatus je Platz (seatIndex, teamId, name, connected, entityId).
    // Hinweis: A tritt mit dem Host-Token bei, daher heißt der Platz 'Host', nicht 'A'.
    assert.ok(Array.isArray(stand.seats), 'B-9a: lobby_state nennt seats-Array');
    assert.equal(stand.seats.length, 2, 'B-9a: seats enthält beide Plätze');
    const sitzGetrennt = stand.seats.find(s => s.connected === false);
    const sitzVerbunden = stand.seats.find(s => s.connected === true);
    assert.ok(sitzGetrennt, 'B-9a: Ein Platz ist disconnected');
    assert.ok(sitzVerbunden, 'B-9a: Ein Platz ist connected');
    assert.equal(sitzGetrennt.name, 'Host', 'B-9a: Der getrennte Platz ist der Host-Platz');
    assert.equal(sitzVerbunden.name, 'B', 'B-9a: Der verbundene Platz ist B');
    assert.equal(stand.besetzteTeams, 1);

    const lobby = server.lobbyManager.get(lobbyId);
    assert.equal(lobby.seats.length, 2, 'Der Platz bleibt für das Reconnect-Fenster reserviert');
    assert.equal(lobby.seats.find(seat => seat.token === a.welcome.token).connected, false);
    assert.equal(lobby.status, 'running');
    assert.equal(server.getSession(lobbyId).laeuft, true);

    const weiter = await b.client.warteAufTakt(takt.tick, 4000);
    assert.ok(weiter && weiter.tick > takt.tick, 'Die Simulation muss weiterlaufen');
  } finally {
    a.client?.close();
    b.client?.close();
    await server.close();
  }
});

test('A4 Wiederverbindung per RESUME im laufenden Match: derselbe Platz, sofort Vollsnapshot, Zug läuft weiter', async () => {
  const { server, url, wsUrl } = await starteServer();
  let a = null;
  let b = null;
  let wieder = null;
  try {
    const erstellt = await erstelleLobby(url, { teams: 2, seed: 4321 });
    const lobbyId = erstellt.lobby.id;
    const beitrittA = await trittBei(wsUrl, lobbyId, { name: 'A', token: erstellt.player.token });
    a = beitrittA.client;
    const welcomeA = beitrittA.welcome;
    ({ client: b } = await trittBei(wsUrl, lobbyId, { name: 'B' }));
    const vorher = await b.warteAufSnapshot(6000);
    assert.ok(vorher, 'Testaufbau: Match läuft');

    const platzVorher = server.lobbyManager.get(lobbyId).seats.length;
    a.close();
    await warte(250);
    assert.equal(server.getSession(lobbyId).clients.size, 1, 'Nur B ist noch gebunden');

    wieder = new TestClient(wsUrl);
    await wieder.open();
    wieder.send(CONTROL.RESUME, { token: welcomeA.resumeToken, lobbyId });
    const willkommen = await wieder.warte(CONTROL.WELCOME);
    assert.ok(willkommen, 'RESUME muss ein WELCOME liefern');
    assert.equal(willkommen.resumed, true);
    assert.equal(willkommen.entityId, welcomeA.entityId, 'Derselbe Platz, dieselbe Figur');
    assert.equal(willkommen.token, welcomeA.token, 'Der Platz-Token bleibt die Identität');

    const snapshot = await wieder.warteAufSnapshot(3000);
    assert.ok(snapshot, 'Sofortiger Zustand nach dem Fortsetzen');
    assert.equal(wieder.snapshots[0].isFull, true, 'Der erste Takt ist ein Vollsnapshot');
    assert.ok(snapshot.tick >= vorher.tick, 'Kein Rücksetzen der Simulation');
    assert.equal(server.lobbyManager.get(lobbyId).seats.length, platzVorher,
      'RESUME belegt keinen zweiten Platz');
    assert.equal(server.getSession(lobbyId).clients.size, 2, 'Beide Token sind wieder gebunden');
  } finally {
    a?.close();
    b?.close();
    wieder?.close();
    await server.close();
  }
});

test('A4 Altweg JOIN_LOBBY + token im laufenden Match: derselbe Platz, kein zweiter', async () => {
  const { server, url, wsUrl } = await starteServer();
  let a = null;
  let b = null;
  let wieder = null;
  try {
    const erstellt = await erstelleLobby(url, { teams: 2, seed: 8181 });
    const lobbyId = erstellt.lobby.id;
    const beitrittA = await trittBei(wsUrl, lobbyId, { name: 'A', token: erstellt.player.token });
    a = beitrittA.client;
    const entityId = beitrittA.welcome.entityId;
    ({ client: b } = await trittBei(wsUrl, lobbyId, { name: 'B' }));
    const vorher = await b.warteAufSnapshot(6000);
    assert.ok(vorher, 'Testaufbau: Match läuft');

    const token = erstellt.player.token;
    a.close();
    await warte(250);

    wieder = new TestClient(wsUrl);
    await wieder.open();
    wieder.send(CONTROL.JOIN_LOBBY, { lobbyId, name: 'A', token });
    const willkommen = await wieder.warte(CONTROL.WELCOME);
    assert.ok(willkommen);
    assert.equal(willkommen.resumed, true, 'Der Token-Beitritt setzt den Platz fort');
    assert.equal(willkommen.entityId, entityId, 'Dieselbe Figur wie vor der Trennung');
    assert.equal(server.lobbyManager.get(lobbyId).seats.length, 2,
      'Der Altweg darf keinen dritten Platz belegen');
    assert.ok((await wieder.warteAufSnapshot(3000)).tick >= vorher.tick);
  } finally {
    a?.close();
    b?.close();
    wieder?.close();
    await server.close();
  }
});

test('ZUSTANDS-PIN RT-2: nach Ablauf des Fensters bleibt der Platz in RUNNING-Lobby reserviert, Original-Spieler kann wiederkommen', async () => {
  /*
   * RT-2 REPARATUR: In einer laufenden Lobby (Status RUNNING) werden Plätze
   * nach Ablauf des Reconnect-Fensters NICHT entfernt (pruneDisconnected
   * überspringt RUNNING-Lobbys). Der Platz bleibt reserviert, damit der
   * ursprüngliche Mensch auch später noch wiederkommen kann.
   *
   * Ein fremder Client (ohne passenden Token) wird aber weiterhin abgewiesen,
   * weil die Lobby RUNNING ist und join() nur OPEN-Lobbys akzeptiert.
   */
  const lobbyManager = new LobbyManager({ reconnectWindowMs: 150 });
  const { server, url, wsUrl } = await starteServer({ lobbyManager, pruneIntervalMs: 30 });
  server.startPruning();
  const a = { client: null };
  const b = { client: null };
  const fremd = new TestClient(wsUrl);
  const alt = new TestClient(wsUrl);
  try {
    const erstellt = await erstelleLobby(url, { teams: 2, seed: 1234 });
    const lobbyId = erstellt.lobby.id;
    Object.assign(a, await trittBei(wsUrl, lobbyId, { name: 'A', token: erstellt.player.token }));
    Object.assign(b, await trittBei(wsUrl, lobbyId, { name: 'B' }));
    const takt = await b.client.warteAufSnapshot(6000);
    assert.ok(takt, 'Testaufbau: Match läuft');

    const resumeToken = a.welcome.resumeToken;
    const platzToken = erstellt.player.token;
    a.client.close();
    // Fenster 150 ms, Verwaltungsrunde 30 ms: nach 500 ms wäre der Platz in
    // OPEN-Lobby verfallen, aber in RUNNING-Lobby bleibt er reserviert.
    await warte(500);

    const lobby = server.lobbyManager.get(lobbyId);
    // RT-2 Fix: Platz bleibt in RUNNING-Lobby reserviert (connected: false, aber nicht entfernt)
    assert.equal(lobby.seats.length, 2, 'RT-2: Platz bleibt in RUNNING-Lobby reserviert');
    const platzA = lobby.seats.find(seat => seat.token === platzToken);
    assert.ok(platzA, 'RT-2: Platz A existiert noch');
    assert.equal(platzA.connected, false, 'RT-2: Platz A ist disconnected');
    assert.equal(lobby.status, 'running');
    assert.equal(server.getSession(lobbyId).laeuft, true,
      'Der verbliebene Mensch hält das Match am Laufen');

    // 1) Der alte Fortsetzungs-Token funktioniert NOCH (Platz wurde nicht entfernt)
    await alt.open();
    alt.send(CONTROL.RESUME, { token: resumeToken, lobbyId });
    const willkommen = await alt.warte(CONTROL.WELCOME);
    assert.ok(willkommen, 'RT-2: RESUME nach dem Fenster funktioniert noch');
    assert.equal(willkommen.resumed, true);
    assert.equal(willkommen.token, platzToken, 'Derselbe Platz-Token');
    alt.close();

    // 2) Der alte Platz-Token funktioniert auch über JOIN_LOBBY (Wiederverbindung)
    await fremd.open();
    fremd.send(CONTROL.JOIN_LOBBY, { lobbyId, name: 'A', token: platzToken });
    const willkommen2 = await fremd.warte(CONTROL.WELCOME);
    assert.ok(willkommen2, 'RT-2: JOIN_LOBBY mit Token nach dem Fenster funktioniert noch');
    assert.equal(willkommen2.resumed, true);
    assert.equal(willkommen2.token, platzToken, 'Derselbe Platz-Token');

    // 3) Ein NEUER Client OHNE Token wird abgewiesen (Lobby ist RUNNING)
    const neu = new TestClient(wsUrl);
    await neu.open();
    neu.send(CONTROL.JOIN_LOBBY, { lobbyId, name: 'C' });
    const fehler = await neu.warte(CONTROL.ERROR);
    assert.ok(fehler, 'RT-2: Neuer Client ohne Token wird in RUNNING-Lobby abgewiesen');
    assert.match(fehler.error, /nimmt keine Spieler mehr auf/,
      'RT-2: Fremde Clients kommen in laufendem Match nicht hinein');
    neu.close();
  } finally {
    a.client?.close();
    b.client?.close();
    fremd.close();
    alt.close();
    await server.close();
  }
});

test('ZUSTANDS-PIN (offen): Wiederverbindung nach Match-Ende bindet den weiter verbundenen Gegner NICHT an die neue Sitzung', async () => {
  /*
   * GEMESSEN, nicht gewünscht: Nach dem Match-Ende löscht `#finish` die Sitzung
   * (`onEmpty`). Beide Plätze bleiben aber `connected` (die Sockets leben).
   * Verbindet sich EINER mit seinem Platz-Token neu, legt
   * `#sitzungSicherstellen` eine neue Sitzung an und `#starteMatchFallsVoll`
   * startet sie sofort — denn aus Sicht der Lobby sind beide Teams besetzt.
   * Der andere Socket wird jedoch nirgends an die NEUE Sitzung gebunden: Er
   * bekommt keine Snapshots mehr, während das Match für den Wiederverbinder
   * läuft.
   *
   * Warum A4 das nicht repariert: Eine automatische Übernahme des alten Sockets
   * müsste dem Client einen Match-Neustart mit neuer Karte/neuem Seed erklären
   * (Client-Änderung, in A4 gesperrt); ein Verzicht auf den Auto-Start wäre eine
   * Produktentscheidung. Der Fall bleibt als offener Befund stehen.
   */
  const { server, url, wsUrl } = await starteServer();
  let a = null;
  let b = null;
  let wieder = null;
  try {
    const erstellt = await erstelleLobby(url, { teams: 2, seed: 99 });
    const lobbyId = erstellt.lobby.id;
    ({ client: a } = await trittBei(wsUrl, lobbyId, { name: 'A', token: erstellt.player.token }));
    ({ client: b } = await trittBei(wsUrl, lobbyId, { name: 'B' }));
    const ersteSitzung = server.getSession(lobbyId);
    matchZuEndeSpielen(ersteSitzung);
    await a.warte('match_over');

    a.close();
    await warte(250);
    const bTakteVorher = b.snapshots.length;

    wieder = new TestClient(wsUrl);
    await wieder.open();
    wieder.send(CONTROL.JOIN_LOBBY, { lobbyId, name: 'A', token: erstellt.player.token });
    await wieder.warte(CONTROL.WELCOME);

    const neueSitzung = server.getSession(lobbyId);
    assert.ok(neueSitzung, 'Der Wiederverbinder legt eine neue Sitzung an');
    assert.notEqual(neueSitzung, ersteSitzung);
    assert.equal(neueSitzung.match.round, 1, 'Das neue Match beginnt in Runde 1');
    assert.equal(neueSitzung.laeuft, true, 'Es startet sofort — die Lobby gilt als voll');
    assert.equal(neueSitzung.clients.size, 1,
      'OFFEN: nur der Wiederverbinder ist gebunden, nicht der weiter verbundene Gegner');

    const lobby = server.lobbyManager.get(lobbyId);
    assert.equal(lobby.seats.filter(seat => seat.connected).length, 2,
      'Die Lobby hält beide Plätze für verbunden — deshalb startet sie überhaupt');

    await warte(700);
    assert.equal(b.snapshots.length, bTakteVorher,
      'OFFEN: Der Gegner bekommt vom neuen Match keine Zustände mehr');
  } finally {
    a?.close();
    b?.close();
    wieder?.close();
    await server.close();
  }
});

// --------------------------------------------------------------------- NET-1

test('ZUSTANDS-PIN NET-1: match_over wird periodisch wiederholt (alle 2 s, max 3×), nicht nur auf PING', async () => {
  const { server, url, wsUrl } = await starteServer();
  let a = null;
  try {
    const erstellt = await erstelleLobby(url, { teams: 2, seed: 99 });
    const lobbyId = erstellt.lobby.id;
    ({ client: a } = await trittBei(wsUrl, lobbyId, { name: 'A', token: erstellt.player.token }));
    const b = await trittBei(wsUrl, lobbyId, { name: 'B' });
    const session = server.getSession(lobbyId);
    matchZuEndeSpielen(session);

    const erste = await a.warte('match_over');
    assert.ok(erste, 'Die erste Meldung muss ankommen');
    const zaehle = () => a.control.filter(m => m.t === 'match_over').length;
    assert.equal(zaehle(), 0, 'Die Meldung wurde oben konsumiert');

    // NET-1 Fix: Server wiederholt match_over automatisch alle 2 s (max 3×).
    // Nach 2200 ms sollte mindestens eine Wiederholung angekommen sein.
    await warte(2200);
    assert.ok(zaehle() >= 1, 'NET-1: match_over wird von selbst wiederholt (ohne PING)');

    // Die Wiederholung hat denselben Inhalt
    const wiederholungen = a.control.filter(m => m.t === 'match_over');
    for (const w of wiederholungen) {
      assert.equal(w.winnerTeamId, erste.winnerTeamId);
      assert.equal(w.rounds, erste.rounds);
    }

    // Ein PING liefert dieselbe Antwort (idempotent)
    a.send(CONTROL.PING);
    const pingAntwort = await a.warte('match_over', 3000);
    assert.ok(pingAntwort, 'NET-1: PING liefert auch match_over');
    assert.equal(pingAntwort.winnerTeamId, erste.winnerTeamId);
    assert.equal(pingAntwort.rounds, erste.rounds);

    b.client.close();
  } finally {
    a?.close();
    await server.close();
  }
});
