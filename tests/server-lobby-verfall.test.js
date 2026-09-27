/**
 * BEFUND 1 (belegt): `LobbyManager#pruneDisconnected` hatte KEINEN Aufrufer.
 *
 * Gemessen vor der Reparatur (`grep -rn pruneDisconnected src/`): nur die
 * Definition (`lobby.js`) und der Kommentar darüber, der dafür verspricht:
 * „Nach dem Reconnect-Fenster verfällt sein Team und die Lobby nimmt wieder
 * einen Menschen auf." Geprüft wurde das nur in `tests/netcode.test.js` — durch
 * einen DIREKTEN Aufruf. Damit war belegt, dass die Methode funktioniert, und
 * nicht, dass sie je gerufen wird. Ein Mechanismus ohne Aufrufer ist eine
 * Absicht ohne Wirkung.
 *
 * Diese Datei prüft deshalb die VERDRAHTUNG, nicht die Methode:
 *   1. die Verwaltungsrunde (`startServer` → `startPruning`) lässt verfallen,
 *   2. der Beitrittspfad räumt abgelaufene Plätze vor der Belegungsprüfung weg,
 *   3. und die Gegenprobe: solange das Fenster läuft, bleibt die Ablehnung
 *      „Alle Teams sind besetzt" richtig.
 *
 * Die Gegenprobe ist der eigentliche Beleg. Ohne sie wäre ein grüner Test auch
 * dann grün, wenn gar keiner den Platz belegt hätte.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { startServer } from '../src/server/gameServer.js';
import { LobbyManager } from '../src/server/lobby.js';
import { CONTROL } from '../src/shared/protocol.js';
import { starteServer, erstelleLobby, trittBei, TestClient } from './helfer/server-testclient.js';

const WINDOW_MS = 150;    // Reconnect-Fenster der Prüfung (Vorgabe im Betrieb: 30 s)
const RUHE_MS = 60;       // Intervall der Verwaltungsrunde in der Prüfung

/** Lobby mit zwei Teams; Host ist der über HTTP angelegte Platz. */
const zweiTeams = url => erstelleLobby(url, { seed: 90210, name: 'Host' });

/** Füllt eine Zwei-Team-Lobby mit zwei MENSCHEN und gibt beide zurück. */
async function zweiMenschen(url, wsUrl) {
  const erstellt = await zweiTeams(url);
  const host = await trittBei(wsUrl, erstellt.lobby.id, { name: 'Host', token: erstellt.player.token });
  const zweiter = await trittBei(wsUrl, erstellt.lobby.id, { name: 'Zweiter' });
  return { lobbyId: erstellt.lobby.id, host, zweiter };
}

test('Die Verwaltungsrunde von startServer lässt einen abgelaufenen Beitritt verfallen', async () => {
  const lobbyManager = new LobbyManager({ reconnectWindowMs: WINDOW_MS });
  // `startServer` ist der Weg des BETRIEBS (`npm run server`) — hier muss die
  // Runde hängen. `persistence: null` schaltet nur das Speichern ab.
  const { server, port } = await startServer({ port: 0, persistence: null, lobbyManager, pruneIntervalMs: RUHE_MS });
  const url = `http://127.0.0.1:${port}`;
  const wsUrl = `ws://127.0.0.1:${port}/ws`;
  try {
    const { lobbyId, host, zweiter } = await zweiMenschen(url, wsUrl);
    zweiter.client.close();

    // Ohne Handaufruf: nur die Runde kann den Platz wegräumen.
    const bis = Date.now() + 3000;
    while (Date.now() < bis && lobbyManager.get(lobbyId).seats.length > 1) {
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    assert.equal(
      lobbyManager.get(lobbyId).seats.length, 1,
      'Der abgelaufene Platz steht noch — die Verwaltungsrunde hat ihn nicht geräumt',
    );

    // Und die Wirkung, um die es geht: das Team ist wieder frei.
    const nachrueckend = await trittBei(wsUrl, lobbyId, { name: 'Nachrücker' });
    assert.ok(nachrueckend.welcome, 'Der Nachrücker wurde nicht aufgenommen — das Team war nicht frei');
    const teams = lobbyManager.get(lobbyId).seats.map(seat => seat.teamId);
    assert.equal(new Set(teams).size, 2, 'Der Nachrücker muss das freie Team bekommen');
    host.client.close();
    nachrueckend.client.close();
  } finally {
    await server.close();
  }
});

test('Ein getrennter Mensch besetzt sein Team nach Ablauf des Fensters nicht weiter', async () => {
  const lobbyManager = new LobbyManager({ reconnectWindowMs: WINDOW_MS });
  // Verwaltungsrunde praktisch abgeschaltet: Es darf NUR der Beitrittspfad räumen.
  const { server, url, wsUrl } = await starteServer({ lobbyManager, pruneIntervalMs: 3_600_000 });
  const clients = [];
  try {
    const { lobbyId, host, zweiter } = await zweiMenschen(url, wsUrl);
    clients.push(host.client, zweiter.client);
    zweiter.client.close();

    // Fenster ablaufen lassen, ohne dass eine Runde läuft.
    await new Promise(resolve => setTimeout(resolve, WINDOW_MS + 150));

    const nachrueckend = await trittBei(wsUrl, lobbyId, { name: 'Nachrücker' });
    clients.push(nachrueckend.client);
    assert.ok(
      nachrueckend.welcome?.token,
      'Der Beitritt wurde abgelehnt, obwohl das Reconnect-Fenster abgelaufen war',
    );
  } finally {
    for (const client of clients) client.close();
    await server.close();
  }
});

test('Gegenprobe: solange das Fenster läuft, ist „Alle Teams sind besetzt" richtig', async () => {
  const lobbyManager = new LobbyManager({ reconnectWindowMs: 60_000 });
  const { server, url, wsUrl } = await starteServer({ lobbyManager });
  const clients = [];
  try {
    const { lobbyId, host, zweiter } = await zweiMenschen(url, wsUrl);
    clients.push(host.client, zweiter.client);
    // Der Platz fällt weg, bleibt aber BELEGT: Das Fenster ist noch nicht um.
    zweiter.client.close();
    await new Promise(resolve => setTimeout(resolve, 250));

    const dritter = new TestClient(wsUrl);
    clients.push(dritter);
    await dritter.open();
    dritter.send(CONTROL.JOIN_LOBBY, { lobbyId, name: 'Dritter' });
    const fehler = await dritter.warte(CONTROL.ERROR);
    assert.ok(fehler, 'Der dritte Mensch kam in eine volle Lobby hinein');
    assert.match(fehler.error ?? '', /Teams sind besetzt/);
    assert.equal(lobbyManager.get(lobbyId).seats.length, 2, 'Innerhalb des Fensters darf nichts verfallen');
  } finally {
    for (const client of clients) client.close();
    await server.close();
  }
});

test('Ein verfallener BEITRITT wird einmal gemeldet, nicht je Einheit', async () => {
  const lobbyManager = new LobbyManager({ reconnectWindowMs: 50 });
  const { server, url, wsUrl } = await starteServer({ lobbyManager });
  try {
    // Drei Einheiten je Mensch: ein Team, drei Plätze.
    const erstellt = await erstelleLobby(url, { teams: 2, playersPerTeam: 3, seed: 4711 });
    const host = await trittBei(wsUrl, erstellt.lobby.id, { name: 'Host', token: erstellt.player.token });
    const zweiter = await trittBei(wsUrl, erstellt.lobby.id, { name: 'Zweiter' });
    assert.equal(lobbyManager.get(erstellt.lobby.id).seats.length, 6, 'Zwei Menschen × drei Einheiten');
    zweiter.client.close();
    await new Promise(resolve => setTimeout(resolve, 250));

    const entfernt = server.pruneLobbies();
    assert.equal(entfernt.length, 1, 'Der Beitritt muss EINMAL gemeldet werden');
    assert.equal(entfernt[0].name, 'Zweiter');
    assert.equal(
      lobbyManager.get(erstellt.lobby.id).seats.length, 3,
      'Alle drei Plätze desselben Menschen müssen zusammen fallen',
    );
    host.client.close();
  } finally {
    await server.close();
  }
});

test('stopPruning beendet die Runde (Zeitgeber ohne Haltegriff)', async () => {
  const lobbyManager = new LobbyManager({ reconnectWindowMs: 50 });
  const { server, url, wsUrl } = await starteServer({ lobbyManager, pruneIntervalMs: 40 });
  try {
    server.startPruning();
    const { lobbyId, host, zweiter } = await zweiMenschen(url, wsUrl);
    zweiter.client.close();
    await new Promise(resolve => setTimeout(resolve, 250));
    assert.equal(lobbyManager.get(lobbyId).seats.length, 1, 'Die Runde muss geräumt haben');

    // Ein zweiter Platz fällt weg — aber jetzt läuft keine Runde mehr.
    const dritter = await trittBei(wsUrl, lobbyId, { name: 'Nachrücker' });
    server.stopPruning();
    dritter.client.close();
    const stand = lobbyManager.get(lobbyId).seats.length;
    await new Promise(resolve => setTimeout(resolve, 300));
    assert.equal(
      lobbyManager.get(lobbyId).seats.length, stand,
      'Nach stopPruning darf nichts mehr verfallen',
    );
    host.client.close();
  } finally {
    await server.close();
  }
});
