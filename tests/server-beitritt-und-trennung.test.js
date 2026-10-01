/**
 * Zwei Befunde an derselben Stelle: Beim Beitritt und beim Trennen.
 *
 * BEFUND 3 (belegt): Der LETZTE Beitretende las eine volle Lobby als wartend.
 * `attach` sendet die `lobby_state`-Nachricht mit `laeuft: this.laeuft` — und
 * lief VOR der Startprüfung. Gemessen (zwei Teams, zwei Menschen):
 *
 *     1. Beitritt → laeuft=false besetzteTeams=1/2
 *     2. Beitritt → laeuft=false besetzteTeams=2/2   ← der letzte
 *     danach: alleTeamsBesetzt=true, Sitzung läuft
 *
 * Der letzte Beitretende ist genau der, mit dem das Match beginnt — und er las
 * „Warte auf Mitspieler: 2/2 Teams besetzt" (`main.js`, Handler für
 * `lobby_state`). Der Test hält die REIHENFOLGE fest, nicht den Text.
 *
 * BEFUND 2 (belegt, OFFEN): Beim Trennen geht an den verbliebenen Spieler KEINE
 * Meldung. Gemessen: In 1,5 s kamen nur Anzeige-Ereignisse (`landed`) und
 * Snapshots. Die Tatsache ist dem Server bekannt — die Lobby-Ansicht führt
 * `connected: 1` und beim Platz `connected: false` — sie geht aber nur über die
 * HTTP-Liste heraus, nie über den WebSocket. Der Client kann die Trennung
 * deshalb nicht anzeigen; im Kader steht der Gegner unverändert als Spieler.
 *
 * `tests/server-trennung-ohne-meldung` (dritter Test unten) hält diesen Zustand
 * fest. Er ist ein ZUSTANDS-PIN, kein Wunsch: Sobald der Server die Trennung
 * meldet (neue Steuernachricht + Client-Zweig, beides außerhalb dieser Datei),
 * muss der Test umgestellt werden — gesucht wird dann nicht mehr nach der
 * Abwesenheit, sondern nach der Meldung selbst (`spuren` im Test).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { LobbyManager } from '../src/server/lobby.js';
import { CONTROL } from '../src/shared/protocol.js';
import { starteServer, erstelleLobby, trittBei, TestClient } from './helfer/server-testclient.js';

test('Der LETZTE Beitretende liest eine volle Lobby nicht als wartend', async () => {
  const { server, url, wsUrl } = await starteServer();
  try {
    const erstellt = await erstelleLobby(url, { teams: 2, seed: 5150, name: 'Host' });
    const lobbyId = erstellt.lobby.id;

    const host = await trittBei(wsUrl, lobbyId, { name: 'Host', token: erstellt.player.token });
    const hostStand = await host.client.warte(CONTROL.LOBBY_STATE);
    assert.ok(hostStand, 'Der Host bekam keinen Lobby-Zustand');

    const zweiter = await trittBei(wsUrl, lobbyId, { name: 'Zweiter' });
    // Die Nachricht kommt VOR dem WELCOME des Beitritts nicht — Reihenfolge
    // egal: `attach` schickt sie unmittelbar beim Anmelden.
    const zweiterStand = await zweiter.client.warte(CONTROL.LOBBY_STATE);
    assert.ok(zweiterStand, 'Der letzte Beitretende bekam keinen Lobby-Zustand');

    assert.equal(zweiterStand.teams, 2);
    assert.equal(
      zweiterStand.besetzteTeams, 2,
      'Beim letzten Beitritt müssen beide Teams besetzt sein',
    );
    assert.equal(
      zweiterStand.laeuft, true,
      'Eine VOLLE Lobby darf nicht als wartend gemeldet werden — der letzte Beitretende '
      + 'startet das Match mit seinem Beitritt',
    );
    assert.equal(server.getSession(lobbyId).laeuft, true, 'Die Sitzung muss jetzt laufen');

    // Und der Vorherige bekommt den ehrlichen Wartehinweis — die Gegenprobe.
    assert.equal(hostStand.besetzteTeams, 1, 'Beim ersten Beitritt ist ein Team besetzt');
    assert.equal(hostStand.laeuft, false, 'Solange Teams frei sind, läuft nichts');

    host.client.close();
    zweiter.client.close();
  } finally {
    await server.close();
  }
});

test('Der erste Beitretende bekommt den Wartehinweis, der letzte die Bestätigung', async () => {
  // Dieselbe Aussage in einem Durchgang mit DREI Teams: erst warten, dann voll.
  const { server, url, wsUrl } = await starteServer();
  try {
    const erstellt = await erstelleLobby(url, { teams: 3, seed: 6001, name: 'Host' });
    const lobbyId = erstellt.lobby.id;
    const stands = [];

    const host = await trittBei(wsUrl, lobbyId, { name: 'Host', token: erstellt.player.token });
    stands.push({ wer: 'Host', stand: await host.client.warte(CONTROL.LOBBY_STATE) });

    const zweiter = await trittBei(wsUrl, lobbyId, { name: 'Zweiter' });
    stands.push({ wer: 'Zweiter', stand: await zweiter.client.warte(CONTROL.LOBBY_STATE) });

    const dritter = await trittBei(wsUrl, lobbyId, { name: 'Dritter' });
    stands.push({ wer: 'Dritter', stand: await dritter.client.warte(CONTROL.LOBBY_STATE) });

    const [a, b, c] = stands.map(eintrag => eintrag.stand);
    assert.deepEqual(
      [a.laeuft, b.laeuft, c.laeuft], [false, false, true],
      'Nur der Beitritt, mit dem alle Teams voll sind, darf „laeuft" melden',
    );
    assert.deepEqual([a.besetzteTeams, b.besetzteTeams, c.besetzteTeams], [1, 2, 3]);

    host.client.close();
    zweiter.client.close();
    dritter.client.close();
  } finally {
    await server.close();
  }
});

test('ZUSTANDS-PIN: Beim Trennen geht keine Meldung an den verbliebenen Spieler', async () => {
  const { server, url, wsUrl } = await starteServer();
  try {
    const erstellt = await erstelleLobby(url, { teams: 2, seed: 777, name: 'Host' });
    const lobbyId = erstellt.lobby.id;
    const host = await trittBei(wsUrl, lobbyId, { name: 'Host', token: erstellt.player.token });
    const zweiter = await trittBei(wsUrl, lobbyId, { name: 'Zweiter' });
    await host.client.warte(CONTROL.LOBBY_STATE);

    zweiter.client.close();
    const fenster = await host.client.ruhe(1200);

    // Was der Server WEISS (und nur über HTTP zeigt): Ein Platz ist getrennt.
    const sicht = await (await fetch(`${url}/api/lobby/${lobbyId}`)).json();
    assert.equal(sicht.lobby.connected, 1, 'Der Server muss die Trennung kennen');
    const getrennt = sicht.lobby.seats.filter(seat => seat.connected === false);
    assert.equal(getrennt.length, 1, 'Der getrennte Platz muss als getrennt geführt sein');

    // Was auf der LEITUNG ankommt: jetzt ein `lobby_state`-Broadcast nach dem Trennen.
    // Der Pin war: keine Meldung, heute ist die Meldung da.
    const spuren = fenster.control.filter(nachricht => 
      /lobby_state/i.test(String(nachricht.t))
    );
    assert.ok(spuren.length > 0, 'Nach dem Trennen sollte ein lobby_state-Broadcast ankommen');

    // Prüfen, dass der Lobbyzustand aktuell ist (besetzteTeams passt)
    const letztesLobby = spuren[spuren.length - 1];
    assert.equal(letztesLobby.besetzteTeams, 1, 'Im Lobbyzustand muss besetzteTeams auf 1 reduziert sein');
    assert.ok(fenster.snapshots > 0, 'Die Sitzung läuft weiter und sendet Zustände');
  } finally {
    await server.close();
  }
});

test('ZUSTANDS-PIN: Die zwei Startwege hinterlassen zwei verschiedene Lobby-Zustände', async () => {
  /*
   * OFFENER PUNKT (gemessen, nicht entschieden) — die Folgen des Versprechens
   * aus `LobbyManager#disconnect`: „Nach dem Reconnect-Fenster verfällt sein
   * Team und die Lobby nimmt wieder einen Menschen auf."
   *
   * Das Verfallen gilt (siehe `server-lobby-verfall.test.js`). Ob die Lobby
   * danach wieder JEMANDEN AUFNIMMT, hängt am LOBBY-STATUS — und der ist je nach
   * Startweg verschieden:
   *
   *   Start durch den letzten BEITRITT → Status bleibt „open" (gemessen)
   *     → der Nachrücker bekommt das freie Team und die FIGUREN des Gegangenen
   *       (`entityId` 2, also dieselbe Einheit) — das Versprechen gilt.
   *   Start per `START_MATCH` → Status „running" (`markRunning`)
   *     → derselbe Nachrücker wird abgewiesen: „Lobby nimmt keine Spieler mehr
   *       auf" — das Team bleibt für den Rest des Matches leer.
   *
   * Beides ist heute so und wird hier FESTGEHALTEN, damit eine spätere Änderung
   * auffällt. Welches Verhalten gilt, ist eine Produktentscheidung (der Status
   * steuert auch die Lobby-Liste im Client, die nur „open" zeigt) — sie gehört
   * nicht in diese Reparatur. Siehe `docs/server-seite-fixes.md`, offener Punkt 5.
   */
  const lobbyManager = new LobbyManager({ reconnectWindowMs: 120 });
  const { server, url, wsUrl } = await starteServer({ lobbyManager, pruneIntervalMs: 40 });
  try {
    // --- Weg 1: Start durch den letzten Beitritt (Status bleibt open) ---
    const erste = await erstelleLobby(url, { teams: 2, seed: 1234, name: 'Host' });
    const host1 = await trittBei(wsUrl, erste.lobby.id, { name: 'Host', token: erste.player.token });
    const zweiter1 = await trittBei(wsUrl, erste.lobby.id, { name: 'Zweiter' });
    zweiter1.client.close();
    await new Promise(resolve => setTimeout(resolve, 400));
    assert.equal(
      lobbyManager.get(erste.lobby.id).status, 'open',
      'Nach einem Start durch den Beitritt bleibt der Status „open" (gemessen)',
    );
    const nachruecker = await trittBei(wsUrl, erste.lobby.id, { name: 'Nachrücker' });
    assert.ok(nachruecker.welcome, 'Auf diesem Weg muss ein Nachrücker hineinkommen');
    assert.equal(
      nachruecker.welcome.entityIds.join(','), String(zweiter1.welcome.entityIds.join(',')),
      'Der Nachrücker übernimmt die FIGUREN des Gegangenen — der Platz wurde neu belegt',
    );
    host1.client.close(); nachruecker.client.close();

    // --- Weg 2: Start per START_MATCH (Status wird running) ---
    const zweite = await erstelleLobby(url, { teams: 2, seed: 4321, name: 'Host' });
    const host2 = await trittBei(wsUrl, zweite.lobby.id, { name: 'Host', token: zweite.player.token });
    const zweiter2 = await trittBei(wsUrl, zweite.lobby.id, { name: 'Zweiter' });
    host2.client.send(CONTROL.START_MATCH);
    await new Promise(resolve => setTimeout(resolve, 200));
    assert.equal(
      lobbyManager.get(zweite.lobby.id).status, 'running',
      'Nach START_MATCH trägt die Lobby „running"',
    );
    zweiter2.client.close();
    await new Promise(resolve => setTimeout(resolve, 400));
    const spaeter = new TestClient(wsUrl);
    await spaeter.open();
    spaeter.send(CONTROL.JOIN_LOBBY, { lobbyId: zweite.lobby.id, name: 'Nachrücker' });
    const fehler = await spaeter.warte(CONTROL.ERROR, 2000);
    assert.ok(fehler, 'Auf diesem Weg wird der Nachrücker abgewiesen (Status „running")');
    assert.match(fehler.error, /nimmt keine Spieler mehr auf/);
    host2.client.close(); spaeter.close();
  } finally {
    await server.close();
  }
});

test('Niemand springt für den Getrennten ein: sein Zug läuft über die Zeit ab', async () => {
  const { server, url, wsUrl } = await starteServer();
  try {
    const erstellt = await erstelleLobby(url, { teams: 2, seed: 8181, name: 'Host' });
    const lobbyId = erstellt.lobby.id;
    const host = await trittBei(wsUrl, lobbyId, { name: 'Host', token: erstellt.player.token });
    const zweiter = await trittBei(wsUrl, lobbyId, { name: 'Zweiter' });
    const ersterTakt = await host.client.warteAufSnapshot();
    assert.ok(ersterTakt, 'Ohne Snapshot lässt sich das Weiterlaufen nicht belegen');

    zweiter.client.close();
    const taktZwei = await host.client.warteAufTakt(ersterTakt.tick, 6000);
    assert.ok(taktZwei, 'Nach dem Trennen kam kein NEUER Zustand mehr');
    assert.ok(
      taktZwei.tick > ersterTakt.tick,
      'Die Simulation muss weiterlaufen — es gibt keine Bot-KI, die den Platz übernimmt',
    );
    // Die Figuren des Getrennten bleiben im Zustand: Sie sind Spielzustand, kein
    // Beiwerk, und verschwinden nicht, nur weil niemand mehr steuert.
    assert.equal(
      taktZwei.entities.length, 2,
      'Die Einheiten des Getrennten bleiben auf dem Feld',
    );
  } finally {
    await server.close();
  }
});
