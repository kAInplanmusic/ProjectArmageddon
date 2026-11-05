import assert from 'node:assert/strict';
import test from 'node:test';
import { WebSocket } from 'ws';
import { GameServer } from '../src/server/gameServer.js';
import {
  CONTROL,
  PROTOCOL_VERSION,
  controlMessage,
  parseControlMessage,
  decodeSnapshot,
} from '../src/shared/protocol.js';
import { RESUME_TOKEN_LAENGE, istResumeToken } from '../src/server/lobby.js';
import { INPUT_LIMITS } from '../src/shared/validation.js';
import { NetworkClient } from '../src/client/networkClient.js';

/**
 * RT-1 — Fortsetzen nach Neuladen.
 *
 * Der Befund (TODO-SSOT): `CONTROL.RESUME` war deklariert, aber nie
 * implementiert; der Sitzplatz-Token lebte nur im Tab, und nach einem Neuladen
 * war der Platz verloren. Der Auftraggeber hat am 2026-11-05 „bauen" entschieden
 * (`docs/plan-produktion.md` Abschnitt 1).
 *
 * Diese Datei prüft den Vertrag am ECHTEN Server (nicht gegen eine nachgebaute
 * Lobby): Token-Vergabe, Fortsetzen mit Zustand, Ablehnungen mit Grund,
 * Entwertung am Match-Ende und — in jeder Richtung — dass kein ZWEITER Platz
 * entsteht.
 *
 * Aufbau wie `tests/server-integration.test.js`: kleiner WebSocket-Client mit
 * Warteschlangen, Lobbys über die HTTP-API.
 */

/** Kleiner Testclient mit Warteschlangen für Text- und Binärnachrichten. */
class TestClient {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.controls = [];
    this.snapshots = [];
    this.errors = [];
    this.abgelehnt = [];
    // open/error-Promise SYNCHRON erzeugen — sonst kann das Ereignis vor dem
    // Listener gefeuert haben und der Aufruf wartet für immer.
    this.opened = new Promise((resolve, reject) => {
      this.socket.once('open', resolve);
      this.socket.once('error', reject);
    });
    this.socket.on('message', (raw, isBinary) => {
      if (isBinary) {
        const decoded = decodeSnapshot(raw);
        if (decoded) this.snapshots.push(decoded);
        return;
      }
      const message = parseControlMessage(raw);
      if (!message) return;
      if (message.t === CONTROL.ERROR) this.errors.push(message);
      if (message.t === CONTROL.RESUME_FAILED) this.abgelehnt.push(message);
      this.controls.push(message);
    });
  }

  open() {
    return this.opened;
  }

  send(type, payload = {}) {
    this.socket.send(controlMessage(type, payload));
  }

  /** Wartet auf eine Steuernachricht eines Typs (konsumiert sie). */
  async waitFor(type, timeoutMs = 6000) {
    const deadline = Date.now() + timeoutMs;
    return new Promise((resolve, reject) => {
      const poll = () => {
        const index = this.controls.findIndex(message => message.t === type);
        if (index >= 0) return resolve(this.controls.splice(index, 1)[0]);
        if (Date.now() > deadline) return reject(new Error(`Timeout beim Warten auf "${type}"`));
        setTimeout(poll, 25);
      };
      poll();
    });
  }

  async waitForSnapshot(timeoutMs = 6000) {
    const deadline = Date.now() + timeoutMs;
    return new Promise((resolve, reject) => {
      const poll = () => {
        if (this.snapshots.length > 0) return resolve(this.snapshots[this.snapshots.length - 1]);
        if (Date.now() > deadline) return reject(new Error('Timeout beim Warten auf Snapshot'));
        setTimeout(poll, 25);
      };
      poll();
    });
  }

  close() {
    this.socket.close();
  }
}

async function startTestServer() {
  const server = new GameServer();
  const info = await server.listen(0);
  return { server, ...info };
}

async function createLobby(baseUrl, body = {}) {
  const response = await fetch(`${baseUrl}/api/lobby/create`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ teams: 2, playersPerTeam: 1, seed: 4242, ...body }),
  });
  assert.equal(response.status, 201);
  return response.json();
}

/** Verbindet, tritt bei und liefert das WELCOME. */
async function beitreten(wsUrl, lobbyId, { name = 'Spieler', token = null } = {}) {
  const client = new TestClient(wsUrl);
  await client.open();
  client.send(CONTROL.JOIN_LOBBY, token ? { lobbyId, name, token } : { lobbyId, name });
  const welcome = await client.waitFor(CONTROL.WELCOME);
  return { client, welcome };
}

/** Verbindet und sendet nur `RESUME` — ohne vorherigen Beitritt. */
async function fortsetzen(wsUrl, token, lobbyId = null) {
  const client = new TestClient(wsUrl);
  await client.open();
  client.send(CONTROL.RESUME, lobbyId ? { token, lobbyId } : { token });
  return client;
}

/** Spielt ein Match deterministisch bis zum Ende — ohne Bots (Zugzeit kurz). */
async function matchZuEndeSpielen(session) {
  session.stop();
  session.match.setTurnDuration(250);
  let schritte = 0;
  while (session.match.status === 'playing' && schritte < 20_000) {
    session.stepSimulation(1);
    schritte += 1;
  }
  assert.equal(session.match.status, 'gameover', 'Match muss enden');
}

test('RT-1: Das WELCOME vergibt je Sitzplatz einen Fortsetzungs-Token (32 Hex)', { timeout: 20_000 }, async () => {
  const { server, url, port } = await startTestServer();
  const wsUrl = `ws://127.0.0.1:${port}/ws`;

  try {
    const created = await createLobby(url, { seed: 11 });
    const { client: a, welcome: welcomeA } = await beitreten(wsUrl, created.lobby.id, { name: 'A', token: created.player.token });
    const { client: b, welcome: welcomeB } = await beitreten(wsUrl, created.lobby.id, { name: 'B' });

    try {
      for (const [wer, seite] of [[welcomeA, 'A'], [welcomeB, 'B']]) {
        assert.equal(typeof wer.resumeToken, 'string', `WELCOME ${seite} ohne resumeToken`);
        assert.equal(wer.resumeToken.length, RESUME_TOKEN_LAENGE,
          `resumeToken ${seite} muss ${RESUME_TOKEN_LAENGE} Zeichen haben`);
        assert.ok(istResumeToken(wer.resumeToken), `resumeToken ${seite} ist kein Hex-Token`);
        /*
         * ZWEI Schlüssel, zwei Aufgaben: `token` identifiziert den Platz für
         * jedes Spielkommando, `resumeToken` ist der Schlüssel zum Wiedereinstieg.
         * Wären sie gleich, wäre jede Entwertung am Match-Ende eine Entwertung
         * der Platzidentität.
         */
        assert.notEqual(wer.resumeToken, wer.token, 'Fortsetzungs-Token darf nicht der Platz-Token sein');
      }
      assert.notEqual(welcomeA.resumeToken, welcomeB.resumeToken,
        'Zwei Sitzplätze dürfen nicht denselben Fortsetzungs-Token bekommen');

      /*
       * Der Token darf NICHT über die HTTP-Beschreibung nach außen: Dort lesen
       * fremde Clients die Lobby-Liste. Geprüft wird die rohe Antwort, nicht
       * ein nachgebautes Objekt.
       */
      const roh = await (await fetch(`${url}/api/lobby/${created.lobby.id}`)).text();
      assert.ok(!roh.includes(welcomeA.resumeToken), 'resumeToken darf nicht in der Lobby-Beschreibung stehen');
      assert.ok(!roh.includes(welcomeB.resumeToken), 'resumeToken darf nicht in der Lobby-Beschreibung stehen');
      // Und auch nicht in der Antwort auf das Anlegen (dort steht der Host-Platz).
      const createdRoh = JSON.stringify(created);
      assert.ok(!("resumeToken" in (created.player ?? {})),
        'Die Anlege-Antwort darf keinen Fortsetzungs-Token tragen');
      assert.ok(!createdRoh.includes(welcomeA.resumeToken));
    } finally {
      a.close();
      b.close();
    }
  } finally {
    await server.close();
  }
});

test('RT-1: RESUME bindet den neuen Socket an denselben Platz und liefert sofort Zustand', { timeout: 25_000 }, async () => {
  const { server, url, port } = await startTestServer();
  const wsUrl = `ws://127.0.0.1:${port}/ws`;

  try {
    const created = await createLobby(url, { seed: 777 });
    const { client: a, welcome: welcomeA } = await beitreten(wsUrl, created.lobby.id, { name: 'A', token: created.player.token });
    const { client: b } = await beitreten(wsUrl, created.lobby.id, { name: 'B' });
    try {
      // Beide Menschen sind da → das Match läuft; erst dann ist „der Zug bleibt
      // unberührt" überhaupt eine messbare Aussage.
      const vorher = await a.waitForSnapshot(8000);
      assert.ok(vorher.tick > 0);

      const platzVorher = server.lobbyManager.get(created.lobby.id);
      const sitzeVorher = platzVorher.seats.length;
      const verbundenVorher = platzVorher.seats.filter(seat => seat.connected).length;

      a.close();
      await new Promise(resolve => setTimeout(resolve, 250));

      const wieder = await fortsetzen(wsUrl, welcomeA.resumeToken, created.lobby.id);
      try {
        const willkommen = await wieder.waitFor(CONTROL.WELCOME);
        assert.equal(willkommen.resumed, true, 'Ein Fortsetzen muss als resumed gemeldet werden');
        assert.equal(willkommen.lobbyId, created.lobby.id);
        assert.equal(willkommen.entityId, welcomeA.entityId,
          'Fortsetzen muss dieselbe Figur zurückgeben');
        assert.equal(willkommen.seatIndex, welcomeA.seatIndex,
          'Fortsetzen muss denselben Platz zurückgeben');
        assert.equal(willkommen.token, welcomeA.token, 'Der Platz-Token bleibt die Identität');
        assert.equal(willkommen.resumeToken, welcomeA.resumeToken,
          'Der Fortsetzungs-Token kommt erneut mit (sonst wäre er nach dem Neuladen weg)');
        assert.ok(willkommen.seed > 0, 'Der Seed für den Kartenaufbau muss mitkommen');
        assert.ok(Array.isArray(willkommen.craters), 'Die bisherigen Krater müssen mitkommen');

        /*
         * SOFORTIGER Zustand, nicht erst der nächste 2-s-Vollsnapshot: Der
         * Client soll nach dem Neuladen weiterrendern. Der Snapshot kommt aus
         * `broadcastSnapshot` direkt nach dem Binden und ist ein VOLLsnapshot
         * (die Delta-Basis des Tokens wurde mit dem neuen Socket verworfen).
         */
        await wieder.waitForSnapshot(3000);
        /*
         * Der ERSTE Takt nach dem Fortsetzen ist der entscheidende: Er kommt
         * direkt aus dem RESUME-Pfad. Spätere sind reguläre Deltas und dürfen
         * sehr wohl Delta sein — hier wird deshalb `snapshots[0]` geprüft, nicht
         * der jeweils jüngste.
         */
        const sofort = wieder.snapshots[0];
        assert.equal(sofort.isFull, true, 'Der erste Snapshot nach dem Fortsetzen muss ein Vollsnapshot sein');
        assert.equal(sofort.version, PROTOCOL_VERSION);
        assert.ok(sofort.entities.length >= 2, 'Der Zustand muss beide Figuren tragen');

        /*
         * DER ZUG BLEIBT UNBERÜHRT: Der aktive Spieler ist derselbe wie vor der
         * Trennung, und die Simulation ist nicht neu gestartet (Tick läuft
         * weiter, Runde bleibt).
         */
        assert.equal(sofort.activePlayerId, vorher.activePlayerId,
          'Fortsetzen darf den Zug nicht wechseln');
        assert.ok(sofort.tick >= vorher.tick,
          `Fortsetzen darf die Simulation nicht zurücksetzen (vorher ${vorher.tick}, jetzt ${sofort.tick})`);
        assert.equal(sofort.round, vorher.round, 'Fortsetzen darf die Runde nicht zurücksetzen');

        const platzNachher = server.lobbyManager.get(created.lobby.id);
        assert.equal(platzNachher.seats.length, sitzeVorher,
          'Fortsetzen darf keinen zweiten Platz belegen');
        assert.equal(platzNachher.seats.filter(seat => seat.connected).length, verbundenVorher,
          'Fortsetzen ändert die Zahl verbundener Plätze nicht');
      } finally {
        wieder.close();
      }
    } finally {
      b.close();
    }
  } finally {
    await server.close();
  }
});

test('RT-1: Fortsetzen in der Wartephase funktioniert und startet nichts von selbst', { timeout: 20_000 }, async () => {
  const { server, url, port } = await startTestServer();
  const wsUrl = `ws://127.0.0.1:${port}/ws`;

  try {
    const created = await createLobby(url, { seed: 5 });
    const { client: a, welcome: welcomeA } = await beitreten(wsUrl, created.lobby.id, { name: 'A', token: created.player.token });
    a.close();
    await new Promise(resolve => setTimeout(resolve, 250));

    const wieder = await fortsetzen(wsUrl, welcomeA.resumeToken, created.lobby.id);
    try {
      const willkommen = await wieder.waitFor(CONTROL.WELCOME);
      assert.equal(willkommen.resumed, true);
      const zustand = await wieder.waitFor(CONTROL.LOBBY_STATE);
      assert.equal(zustand.laeuft, false,
        'Ein einzelner Mensch darf kein Match starten — es gibt keine Bot-KI');
      assert.equal(server.getSession(created.lobby.id)?.laeuft, false);
    } finally {
      wieder.close();
    }
  } finally {
    await server.close();
  }
});

test('RT-1: Unbekanntes Token wird sauber abgelehnt und belegt keinen Platz', { timeout: 20_000 }, async () => {
  const { server, url, port } = await startTestServer();
  const wsUrl = `ws://127.0.0.1:${port}/ws`;

  try {
    const created = await createLobby(url, { seed: 8 });
    const { client: a } = await beitreten(wsUrl, created.lobby.id, { name: 'A', token: created.player.token });
    const sitzeVorher = server.lobbyManager.get(created.lobby.id).seats.length;
    try {
      // Formal gültig, aber nie vergeben.
      const fremd = await fortsetzen(wsUrl, 'a'.repeat(RESUME_TOKEN_LAENGE), created.lobby.id);
      try {
        const abgelehnt = await fremd.waitFor(CONTROL.RESUME_FAILED);
        assert.equal(abgelehnt.grund, 'unbekannt');
        assert.ok(abgelehnt.error, 'Die Ablehnung muss einen lesbaren Grund tragen');
        assert.ok(!fremd.controls.some(message => message.t === CONTROL.WELCOME),
          'Ein unbekanntes Token darf kein WELCOME bekommen');
        assert.equal(server.lobbyManager.get(created.lobby.id).seats.length, sitzeVorher,
          'Eine abgelehnte Fortsetzung darf keinen Platz belegen');
      } finally {
        fremd.close();
      }

      /*
       * Und der Rückfall, den der Client geht: ein NORMALER Beitritt. Er landet
       * auf dem freien Team und belegt genau einen Platz — kein Doppel.
       */
      const { client: b, welcome: welcomeB } = await beitreten(wsUrl, created.lobby.id, { name: 'B' });
      try {
        assert.ok(welcomeB.entityId > 0);
        assert.notEqual(welcomeB.entityId, server.lobbyManager.get(created.lobby.id).seats
          .find(seat => seat.name === 'A')?.entityId);
        assert.equal(server.lobbyManager.get(created.lobby.id).seats.length, sitzeVorher + 1,
          'Der normale Beitritt belegt genau einen zusätzlichen Platz');
      } finally {
        b.close();
      }
    } finally {
      a.close();
    }
  } finally {
    await server.close();
  }
});

test('RT-1: Formfehler im Token wird als „ungueltig" abgelehnt, ohne zu werfen', { timeout: 20_000 }, async () => {
  const { server, url, port } = await startTestServer();
  const wsUrl = `ws://127.0.0.1:${port}/ws`;

  try {
    const created = await createLobby(url, { seed: 9 });
    for (const token of [12345, { boese: true }, 'ZZZ', 'a'.repeat(64)]) {
      const client = await fortsetzen(wsUrl, token, created.lobby.id);
      try {
        const abgelehnt = await client.waitFor(CONTROL.RESUME_FAILED);
        assert.equal(abgelehnt.grund, 'ungueltig', `Token ${JSON.stringify(token)} muss als ungueltig gelten`);
      } finally {
        client.close();
      }
    }
    /*
     * Ein Token, der die Nutzlastgrenze sprengt, wird schon VOR dem Parsen
     * abgewiesen (AGENTS.md §6) — als `ERROR`, nicht als `RESUME_FAILED`. Das
     * ist der richtige Weg: Die Formprüfung darf gar nicht erst laufen.
     */
    const zuLang = await fortsetzen(wsUrl, 'a'.repeat(INPUT_LIMITS.maxPayloadBytes), created.lobby.id);
    try {
      const fehler = await zuLang.waitFor(CONTROL.ERROR);
      assert.match(fehler.error, /zu groß/);
      assert.equal(zuLang.abgelehnt.length, 0, 'Ein zu großer Rahmen ist kein Fortsetzungs-Fall');
    } finally {
      zuLang.close();
    }
    // Der Server lebt weiter und nimmt normale Beitritte an.
    const { client } = await beitreten(wsUrl, created.lobby.id, { name: 'Nachher' });
    client.close();
  } finally {
    await server.close();
  }
});

test('RT-1: Am Match-Ende wird der Fortsetzungs-Token entwertet', { timeout: 60_000 }, async () => {
  const { server, url, port } = await startTestServer();
  const wsUrl = `ws://127.0.0.1:${port}/ws`;

  try {
    const created = await createLobby(url, { seed: 99 });
    const { client: a, welcome: welcomeA } = await beitreten(wsUrl, created.lobby.id, { name: 'A', token: created.player.token });
    const { client: b } = await beitreten(wsUrl, created.lobby.id, { name: 'B' });
    try {
      const session = server.getSession(created.lobby.id);
      assert.ok(session, 'Sitzung muss existieren');
      await matchZuEndeSpielen(session);

      const wieder = await fortsetzen(wsUrl, welcomeA.resumeToken, created.lobby.id);
      try {
        const abgelehnt = await wieder.waitFor(CONTROL.RESUME_FAILED);
        assert.equal(abgelehnt.grund, 'beendet',
          'Nach dem Ende muss der Grund „beendet" sein — nicht „unbekannt", sonst startet der Client blind eine Revanche');
        assert.ok(!wieder.controls.some(message => message.t === CONTROL.WELCOME),
          'Ein entschiedenes Match darf nicht fortgesetzt werden');
      } finally {
        wieder.close();
      }
      assert.equal(server.lobbyManager.get(created.lobby.id).seats[0].resumeToken, null,
        'Der Token muss am Sitz entwertet sein');
    } finally {
      a.close();
      b.close();
    }
  } finally {
    await server.close();
  }
});

test('RT-1: Zweimaliges Fortsetzen hält den Platz einfach (kein Doppel, letzter Socket gewinnt)', { timeout: 20_000 }, async () => {
  const { server, url, port } = await startTestServer();
  const wsUrl = `ws://127.0.0.1:${port}/ws`;

  try {
    const created = await createLobby(url, { seed: 12 });
    const { client: a, welcome: welcomeA } = await beitreten(wsUrl, created.lobby.id, { name: 'A', token: created.player.token });
    a.close();
    await new Promise(resolve => setTimeout(resolve, 250));

    const erste = await fortsetzen(wsUrl, welcomeA.resumeToken);
    const zweite = await fortsetzen(wsUrl, welcomeA.resumeToken);
    try {
      const w1 = await erste.waitFor(CONTROL.WELCOME);
      const w2 = await zweite.waitFor(CONTROL.WELCOME);
      assert.equal(w1.entityId, w2.entityId, 'Beide Fortsetzungen müssen denselben Platz treffen');
      assert.equal(server.lobbyManager.get(created.lobby.id).seats.length, 1,
        'Zwei Fortsetzungen dürfen keinen zweiten Platz erzeugen');

      // Der alte Socket schließt: Das darf die NEUE Bindung nicht lösen.
      erste.close();
      await new Promise(resolve => setTimeout(resolve, 300));
      const platz = server.lobbyManager.get(created.lobby.id);
      assert.equal(platz.seats[0].connected, true,
        'Das Schließen des veralteten Sockets darf den fortgesetzten Platz nicht trennen');
    } finally {
      zweite.close();
    }
  } finally {
    await server.close();
  }
});

/*
 * ---------------------------------------------------------------- Client-Seite
 *
 * Diese zwei Fälle fahren den ECHTEN `NetworkClient` gegen den echten Server.
 * Der Server-Test oben belegt das Protokoll; hier wird geprüft, dass der Client
 * es auch so benutzt: `RESUME` statt `JOIN_LOBBY`, Übernahme des Tokens und der
 * Rückfall bei Ablehnung. Ohne sie wäre „der Client sendet RESUME" eine
 * Behauptung über Quelltext statt über Verhalten.
 */

/** Wartet auf das erste Ereignis eines Typs. */
function einmal(client, typ, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const frist = setTimeout(() => reject(new Error(`Timeout beim Warten auf "${typ}"`)), timeoutMs);
    client.on(typ, payload => {
      clearTimeout(frist);
      resolve(payload);
    });
  });
}

test('RT-1 Client: Verbindet mit Fortsetzungs-Token über RESUME und bekommt denselben Platz', { timeout: 25_000 }, async () => {
  const { server, url, port } = await startTestServer();
  const wsUrl = `ws://127.0.0.1:${port}/ws`;

  try {
    const created = await createLobby(url, { seed: 31 });
    const erster = new NetworkClient({
      url: wsUrl,
      lobbyId: created.lobby.id,
      token: created.player.token,
      playerName: 'Client',
    });
    let ersteSitzung;
    try {
      const beigetreten = einmal(erster, 'joined');
      await erster.connect();
      ersteSitzung = await beigetreten;
      /*
       * `resumed` ist hier WAHR, weil der Platz aus der Lobby-Erstellung
       * (Host-Seat) mit dem Platz-Token übernommen wird — das ist die
       * bestehende Wiederverbindungs-Semantik und nicht der RT-1-Weg.
       */
      assert.equal(ersteSitzung.resumed, true, 'Der Host-Platz wird über seinen Platz-Token übernommen');
      assert.ok(istResumeToken(ersteSitzung.resumeToken),
        'Der Client muss den Fortsetzungs-Token aus dem WELCOME übernehmen');
      assert.equal(erster.resumeToken, ersteSitzung.resumeToken);
      assert.ok(ersteSitzung.entityId > 0);
    } finally {
      erster.disconnect();
    }
    await new Promise(resolve => setTimeout(resolve, 250));

    const zweiter = new NetworkClient({
      url: wsUrl,
      lobbyId: created.lobby.id,
      token: ersteSitzung.token,
      resumeToken: ersteSitzung.resumeToken,
      playerName: 'Client',
    });
    try {
      const fortgesetzt = einmal(zweiter, 'joined');
      await zweiter.connect();
      const sitzung = await fortgesetzt;
      assert.equal(sitzung.resumed, true, 'Der Client muss RESUME gesendet haben, nicht JOIN_LOBBY');
      assert.equal(sitzung.entityId, ersteSitzung.entityId, 'Derselbe Platz, dieselbe Figur');
      assert.equal(sitzung.seatIndex, ersteSitzung.seatIndex);
      assert.equal(zweiter.stats.resumesSent, 1, 'Genau ein Fortsetzungs-Versuch');
      assert.equal(zweiter.stats.joinsSent, 0, 'Kein zusätzlicher Beitritt daneben');
    } finally {
      zweiter.disconnect();
    }
  } finally {
    await server.close();
  }
});

test('RT-1 Client: Bei unbekanntem Token fällt er auf den normalen Beitritt zurück', { timeout: 25_000 }, async () => {
  const { server, url, port } = await startTestServer();
  const wsUrl = `ws://127.0.0.1:${port}/ws`;

  try {
    const created = await createLobby(url, { seed: 32 });
    const client = new NetworkClient({
      url: wsUrl,
      lobbyId: created.lobby.id,
      token: created.player.token,
      // Formal gültig, aber nie vergeben — der Fall „Token abgelaufen".
      resumeToken: 'b'.repeat(RESUME_TOKEN_LAENGE),
      playerName: 'Client',
    });
    try {
      const abgelehnt = einmal(client, 'resume_failed');
      const beigetreten = einmal(client, 'joined');
      await client.connect();
      const grund = await abgelehnt;
      assert.equal(grund.grund, 'unbekannt');
      const sitzung = await beigetreten;
      assert.equal(sitzung.resumed, true,
        'Der Rückfall muss der normale Beitritt MIT dem Platz-Token sein — sonst wäre der Platz weg');
      assert.ok(sitzung.entityId > 0);
      assert.equal(client.stats.resumesSent, 1);
      assert.equal(client.stats.joinsSent, 1, 'Genau EIN Rückfall-Beitritt');
      assert.equal(server.lobbyManager.get(created.lobby.id).seats.length, 1,
        'Der Rückfall darf keinen zweiten Platz belegen');
    } finally {
      client.disconnect();
    }
  } finally {
    await server.close();
  }
});
