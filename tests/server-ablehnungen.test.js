/**
 * BEFUND 4 (A-10): ABGELEHNTER BEITRITT OHNE RÜCKWEG — der SERVER-Teil.
 *
 * Der Client blendet sein Menü vor dem Netzversuch aus und hat keinen Timeout
 * (`src/client/main.js`). Seine einzige Chance auf einen Grund ist die Antwort
 * des Servers. Diese Datei prüft deshalb JEDE Ablehnungsstelle einzeln und
 * festgehalten wird die Eigenschaft, auf die es ankommt:
 *
 *     Der Client kann an JEDER Stelle einen GRUND zeigen.
 *
 * Konkret: jede Ablehnung trägt `error` (Zeichenkette, nicht leer) UND `errors`
 * (Liste, erster Eintrag nicht leer). Genau so liest der Client
 * (`networkClient.js`: `message.errors?.[0] ?? message.error`) — beide Formen
 * werden verlangt, weil ältere Leser nur `error` kennen. Siehe
 * `GameServer#fehlerNutzlast`.
 *
 * Die Liste der geprüften Stellen (Art | Kennung | Text):
 *
 *   HTTP GET  /api/lobby/:id        | 404 | Lobby nicht gefunden
 *   HTTP POST /api/lobby/create     | 400 | Grenzen der Konfiguration (zwei Fälle)
 *   HTTP GET  /api/*                | 404 | Nicht gefunden
 *   HTTP GET  (Auslieferung wirft)  | 500 | Serverfehler: …            ← NEU
 *   WS   JOIN_LOBBY                 | error | Lobby nicht gefunden: <id>
 *   WS   JOIN_LOBBY                 | error | Lobby nimmt keine Spieler mehr auf
 *   WS   JOIN_LOBBY                 | error | Alle N Teams sind besetzt — kein Platz frei
 *   WS   START_MATCH                | error | Warte auf Mitspieler: …
 *   WS   INPUT/SELECT_WEAPON/JUMP/DROP_WEAPON | error | Keine aktive Sitzung
 *   WS   unbekannter Typ            | error | Unbekannter Nachrichtentyp: …
 *   WS   unlesbare Nachricht        | error | Ungültige Nachricht
 *   WS   Nutzlast zu groß           | error | Nachricht zu groß (…)
 *   WS   Binärrahmen                | — (stumm, mit Absicht) | Log-Zeile
 *
 * Ein stiller Abbruch ist genau der Fehler, den dieser Befund meint: In Sonde
 * (2026-09-27) antwortete der Server auf einen Binärrahmen mit GAR NICHTS — und
 * auf eine werfende Auslieferung ebenfalls nicht (stattdessen eine
 * unbehandelte Promise-Ablehnung, die den Prozess beenden kann).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { CONTROL } from '../src/shared/protocol.js';
import {
  starteServer, erstelleLobby, trittBei, TestClient, sammleLogger, assertLesbareAblehnung,
} from './helfer/server-testclient.js';

test('HTTP-Ablehnungen tragen einen lesbaren Grund (404, 400)', async () => {
  const { server, url } = await starteServer();
  try {
    const unbekannt = await fetch(`${url}/api/lobby/gibtsnicht`);
    assert.equal(unbekannt.status, 404);
    const unbekanntKoerper = await unbekannt.json();
    assert.equal(unbekanntKoerper.error, 'Lobby nicht gefunden');
    assert.deepEqual(unbekanntKoerper.errors, ['Lobby nicht gefunden']);

    const teamsAusserhalb = await fetch(`${url}/api/lobby/create`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ teams: 9 }),
    });
    assert.equal(teamsAusserhalb.status, 400);
    const teamsKoerper = await teamsAusserhalb.json();
    assert.match(teamsKoerper.error, /teams muss zwischen 2 und 8 liegen/);
    assert.deepEqual(teamsKoerper.errors, [teamsKoerper.error]);

    const widerspruch = await fetch(`${url}/api/lobby/create`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ teams: 2, playersPerTeam: 3, unitsPerPlayer: 5 }),
    });
    assert.equal(widerspruch.status, 400);
    assert.match((await widerspruch.json()).error, /widersprechen sich/);

    const fremderPfad = await fetch(`${url}/gibtsnicht.json`);
    assert.equal(fremderPfad.status, 404);
    assert.equal((await fremderPfad.json()).error, 'Nicht gefunden');
  } finally {
    await server.close();
  }
});

test('Eine werfende Auslieferung endet als 500 mit Grund — nicht als offene Ablehnung', async () => {
  const offene = [];
  const merker = fehler => offene.push(fehler);
  process.on('unhandledRejection', merker);
  const { server, url } = await starteServer({
    serveStatic: () => { throw new Error('Absicht: Auslieferung kaputt'); },
  });
  try {
    const antwort = await fetch(`${url}/index.html`);
    assert.equal(antwort.status, 500, 'Ohne 500 sieht der Client nur „lädt nicht"');
    const koerper = await antwort.json();
    assert.match(koerper.error, /Auslieferung kaputt/);
    assert.deepEqual(koerper.errors, [koerper.error]);

    // Der eigentliche Befund: Die Ablehnung darf nicht UNBEHANDELT bleiben.
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.deepEqual(offene, [], 'Eine unbehandelte Promise-Ablehnung kann den Prozess beenden');
  } finally {
    process.removeListener('unhandledRejection', merker);
    await server.close();
  }
});

test('WS: unbekannte Lobby und fehlende Kennung sind unterscheidbar', async () => {
  const { server, wsUrl } = await starteServer();
  try {
    const fremd = new TestClient(wsUrl);
    await fremd.open();
    fremd.send(CONTROL.JOIN_LOBBY, { lobbyId: 'gibtsnicht', name: 'Fremd' });
    const fremdGrund = assertLesbareAblehnung(await fremd.warte(CONTROL.ERROR), { wo: 'unbekannte Lobby' });
    assert.match(fremdGrund, /Lobby nicht gefunden/);
    // Die Kennung steht IN der Meldung: Bei einem Fehlerbericht ist „welche
    // Lobby?" die erste Frage — der Client wiederholt den Beitritt mit ihr.
    assert.match(fremdGrund, /gibtsnicht/);

    const ohneKennung = new TestClient(wsUrl);
    await ohneKennung.open();
    ohneKennung.send(CONTROL.JOIN_LOBBY, { name: 'Ohne Kennung' });
    const ohneGrund = assertLesbareAblehnung(await ohneKennung.warte(CONTROL.ERROR), { wo: 'fehlende Kennung' });
    assert.match(ohneGrund, /keine Kennung/);

    fremd.close();
    ohneKennung.close();
  } finally {
    await server.close();
  }
});

test('WS: eine volle Lobby lehnt mit Grund ab', async () => {
  const { server, url, wsUrl } = await starteServer();
  try {
    const erstellt = await erstelleLobby(url, { teams: 2, seed: 2020, name: 'Host' });
    const host = await trittBei(wsUrl, erstellt.lobby.id, { name: 'Host', token: erstellt.player.token });
    const zweiter = await trittBei(wsUrl, erstellt.lobby.id, { name: 'Zweiter' });

    const dritter = new TestClient(wsUrl);
    await dritter.open();
    dritter.send(CONTROL.JOIN_LOBBY, { lobbyId: erstellt.lobby.id, name: 'Dritter' });
    const grund = assertLesbareAblehnung(await dritter.warte(CONTROL.ERROR), { wo: 'volle Lobby' });
    assert.match(grund, /Teams sind besetzt/);

    host.client.close(); zweiter.client.close(); dritter.close();
  } finally {
    await server.close();
  }
});

test('WS: eine laufende oder entschiedene Lobby nennt den Grund', async () => {
  const { server, url, wsUrl, lobbyManager } = await starteServer();
  try {
    const erstellt = await erstelleLobby(url, { teams: 2, seed: 3030, name: 'Host' });
    const lobbyId = erstellt.lobby.id;
    const host = await trittBei(wsUrl, lobbyId, { name: 'Host', token: erstellt.player.token });

    lobbyManager.markRunning(lobbyId);
    const laufend = new TestClient(wsUrl);
    await laufend.open();
    laufend.send(CONTROL.JOIN_LOBBY, { lobbyId, name: 'Zu spät' });
    assert.match(
      assertLesbareAblehnung(await laufend.warte(CONTROL.ERROR), { wo: 'laufende Lobby' }),
      /nimmt keine Spieler mehr auf/,
    );

    lobbyManager.markFinished(lobbyId);
    const entschieden = new TestClient(wsUrl);
    await entschieden.open();
    entschieden.send(CONTROL.JOIN_LOBBY, { lobbyId, name: 'Viel zu spät' });
    assert.match(
      assertLesbareAblehnung(await entschieden.warte(CONTROL.ERROR), { wo: 'entschiedene Lobby' }),
      /nimmt keine Spieler mehr auf/,
    );

    host.client.close(); laufend.close(); entschieden.close();
  } finally {
    await server.close();
  }
});

test('WS: START_MATCH ohne vollständige Teams nennt den Grund', async () => {
  const { server, url, wsUrl } = await starteServer();
  try {
    const erstellt = await erstelleLobby(url, { teams: 3, seed: 4040, name: 'Host' });
    const host = await trittBei(wsUrl, erstellt.lobby.id, { name: 'Host', token: erstellt.player.token });
    host.client.send(CONTROL.START_MATCH);
    const grund = assertLesbareAblehnung(
      await host.client.warte(CONTROL.ERROR), { wo: 'START_MATCH bei 1/3 Teams' },
    );
    assert.match(grund, /Warte auf Mitspieler/);
    assert.equal(server.getSession(erstellt.lobby.id)?.laeuft, false, 'Das Match darf nicht laufen');
    host.client.close();
  } finally {
    await server.close();
  }
});

test('WS: Kommandos ohne Sitzung lehnen an ALLEN vier Wegen mit Grund ab', async () => {
  const { server, wsUrl } = await starteServer();
  try {
    const kommandos = [
      [CONTROL.INPUT, { angle: 1, power: 50 }],
      [CONTROL.SELECT_WEAPON, { weaponId: 'rifle' }],
      [CONTROL.JUMP, { seitlich: 0 }],
      [CONTROL.DROP_WEAPON, { weaponId: 'rifle' }],
    ];
    for (const [typ, nutzlast] of kommandos) {
      const client = new TestClient(wsUrl);
      await client.open();
      client.send(typ, nutzlast);
      const grund = assertLesbareAblehnung(
        await client.warte(CONTROL.ERROR), { wo: `Kommando ohne Sitzung: ${typ}` },
      );
      assert.match(grund, /Keine aktive Sitzung/);
      client.close();
    }
  } finally {
    await server.close();
  }
});

test('WS: unbekannter Typ, unlesbare Nachricht und zu große Nutzlast mit Grund', async () => {
  const { server, wsUrl } = await starteServer();
  try {
    const client = new TestClient(wsUrl);
    await client.open();

    client.send('voelliger_unsinn');
    assert.match(
      assertLesbareAblehnung(await client.warte(CONTROL.ERROR), { wo: 'unbekannter Typ' }),
      /Unbekannter Nachrichtentyp: voelliger_unsinn/,
    );

    client.sendeRoh('{kaputt');
    assert.match(
      assertLesbareAblehnung(await client.warte(CONTROL.ERROR), { wo: 'unlesbare Nachricht (kaputtes JSON)' }),
      /Ungültige Nachricht/,
    );

    // Zweite Eingabeform derselben Stelle: gültiges JSON, aber kein `t`.
    // `parseControlMessage` liefert dann ebenfalls `null` — und der Server muss
    // genauso antworten, statt die Nachricht stillschweigend zu schlucken.
    client.sendeRoh(JSON.stringify({ keinT: 1 }));
    assert.match(
      assertLesbareAblehnung(await client.warte(CONTROL.ERROR), { wo: 'JSON ohne Nachrichtentyp' }),
      /Ungültige Nachricht/,
    );

    client.sendeRoh(JSON.stringify({ t: CONTROL.INPUT, fuellung: 'x'.repeat(20_000) }));
    assert.match(
      assertLesbareAblehnung(await client.warte(CONTROL.ERROR), { wo: 'zu große Nutzlast' }),
      /Nachricht zu groß/,
    );

    client.close();
  } finally {
    await server.close();
  }
});

test('Ein Binärrahmen wird verworfen: sichtbar im Log, ohne Antwort (keine Verstärkung)', async () => {
  const logger = sammleLogger();
  const { server, wsUrl } = await starteServer({ logger });
  try {
    const client = new TestClient(wsUrl);
    await client.open();
    client.socket.send(Buffer.from([0x50, 0x41, 0x01, 0x02]));
    const fenster = await client.ruhe(500);

    /*
     * Die Entscheidung ist: KEINE Fehlermeldung auf die Leitung.
     *
     * Eine Antwort je Binärrahmen wäre eine Verstärkung (wenige Byte hinein,
     * eine vollständige JSON-Zeile hinaus) — mit einem kaputten Client wäre das
     * eine Einladung, den Server zuzustellen. Verlangt wird stattdessen, dass
     * der Vorfall NICHT STILL bleibt: Er steht im Log.
     */
    assert.deepEqual(fenster.control, [], 'Auf einen Binärrahmen darf keine Antwort gehen (Verstärkung)');
    assert.equal(
      logger.finde('binary_message_rejected').length, 1,
      'Der verworfene Binärrahmen muss protokolliert werden — sonst ist es ein stiller Abbruch',
    );
    client.close();
  } finally {
    await server.close();
  }
});
