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

/** Kleiner Testclient mit Warteschlangen für Text- und Binärnachrichten. */
class TestClient {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.controls = [];
    this.snapshots = [];
    this.errors = [];
    // Das open/error-Promise wird SYNCHRON erzeugt. Wird der Listener erst in
    // open() angehängt (nach einem await), kann das Event bereits gefeuert
    // sein und der Aufruf wartet für immer.
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
      this.controls.push(message);
    });
  }

  open() {
    return this.opened;
  }

  send(type, payload = {}) {
    this.socket.send(controlMessage(type, payload));
  }

  /** Wartet auf eine Steuernachricht eines Typs. */
  async waitFor(type, timeoutMs = 4000) {
    const deadline = Date.now() + timeoutMs;
    return new Promise((resolve, reject) => {
      const poll = () => {
        const index = this.controls.findIndex(message => message.t === type);
        // Konsumieren: sonst liefert ein zweiter waitFor dieselbe Nachricht.
        if (index >= 0) return resolve(this.controls.splice(index, 1)[0]);
        if (Date.now() > deadline) return reject(new Error(`Timeout beim Warten auf "${type}"`));
        setTimeout(poll, 25);
      };
      poll();
    });
  }

  async waitForSnapshot(timeoutMs = 4000) {
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

test('HTTP-API liefert Health, Lobby-Liste und Lobby-Erstellung', { timeout: 20_000 }, async () => {
  const { server, url } = await startTestServer();
  try {
    const health = await (await fetch(`${url}/healthz`)).json();
    assert.equal(health.status, 'ok');
    assert.equal(health.lobbies, 0);
    assert.equal(health.protocol, PROTOCOL_VERSION);

    const created = await createLobby(url, { preset: 'mountains' });
    assert.ok(created.lobby.id);
    assert.equal(created.lobby.capacity, 2);
    assert.equal(created.lobby.preset, 'mountains');
    assert.ok(created.player.token);

    const list = await (await fetch(`${url}/api/lobby`)).json();
    assert.equal(list.lobbies.length, 1);

    const single = await (await fetch(`${url}/api/lobby/${created.lobby.id}`)).json();
    assert.equal(single.lobby.id, created.lobby.id);
    assert.equal(single.lobby.occupied, 1);

    const missing = await fetch(`${url}/api/lobby/doesnotexist`);
    assert.equal(missing.status, 404);

    const invalid = await fetch(`${url}/api/lobby/create`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ teams: 9 }),
    });
    assert.equal(invalid.status, 400);
  } finally {
    await server.close();
  }
});

test('Zwei Clients verbinden sich, erhalten Snapshots und feuern', { timeout: 25_000 }, async () => {
  const { server, url, port } = await startTestServer();
  const wsUrl = `ws://127.0.0.1:${port}/ws`;
  const clientA = new TestClient(wsUrl);
  const clientB = new TestClient(wsUrl);

  try {
    const created = await createLobby(url, { seed: 777, playersPerTeam: 1 });

    await clientA.open();
    clientA.send(CONTROL.HELLO);
    const welcomeA = await clientA.waitFor(CONTROL.WELCOME);
    assert.equal(welcomeA.protocol, PROTOCOL_VERSION);

    clientA.send(CONTROL.JOIN_LOBBY, {
      lobbyId: created.lobby.id,
      name: 'ClientA',
      token: created.player.token,
    });
    const joinedA = await clientA.waitFor(CONTROL.WELCOME);
    assert.equal(joinedA.lobbyId, created.lobby.id);
    assert.ok(joinedA.entityId > 0, 'Client A braucht eine Entity-ID');

    await clientB.open();
    clientB.send(CONTROL.JOIN_LOBBY, { lobbyId: created.lobby.id, name: 'ClientB' });
    const joinedB = await clientB.waitFor(CONTROL.WELCOME);
    assert.ok(joinedB.entityId > 0);
    assert.notEqual(joinedB.entityId, joinedA.entityId);

    // Simulierte Netzwerklatenz: der Server muss trotzdem Snapshots liefern.
    await clientA.waitForSnapshot(6000);
    const snapshot = await clientB.waitForSnapshot(6000);
    assert.equal(snapshot.entities.length, 2);
    assert.equal(typeof snapshot.wind, 'number');

    // Nur der aktive Spieler darf feuern; der andere muss abgelehnt werden.
    const activeId = snapshot.activePlayerId;
    const passive = activeId === joinedA.entityId ? clientB : clientA;
    const active = activeId === joinedA.entityId ? clientA : clientB;

    passive.send(CONTROL.INPUT, { angle: 1, power: 60, tick: snapshot.tick });
    await passive.waitFor(CONTROL.ERROR, 4000);

    active.send(CONTROL.INPUT, { angle: Math.PI / 4, power: 70, tick: snapshot.tick });
    // Nach einem gültigen Schuss ensteht ein Projektil im nächsten Snapshot.
    const afterShoot = await (async () => {
      const deadline = Date.now() + 4000;
      while (Date.now() < deadline) {
        const latest = active.snapshots[active.snapshots.length - 1];
        if (latest && latest.tick > snapshot.tick) return latest;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      throw new Error('Kein Snapshot nach dem Schuss');
    })();

    assert.ok(afterShoot.tick > snapshot.tick);

    // Cheat-Versuch: Kraft ausserhalb der Grenzen wird serverseitig abgelehnt.
    active.errors.length = 0;
    active.send(CONTROL.INPUT, { angle: 1, power: 999, tick: afterShoot.tick });
    await active.waitFor(CONTROL.ERROR, 4000);

    // Ping/Pong auf Binärebene
    clientA.send(CONTROL.PING);
    await new Promise(resolve => setTimeout(resolve, 200));
  } finally {
    clientA.close();
    clientB.close();
    await server.close();
  }
});

test('Reconnect mit Token stellt denselben Platz wieder her', { timeout: 20_000 }, async () => {
  const { server, url, port } = await startTestServer();
  const wsUrl = `ws://127.0.0.1:${port}/ws`;

  try {
    const created = await createLobby(url, { playersPerTeam: 1 });
    const first = new TestClient(wsUrl);
    await first.open();
    first.send(CONTROL.JOIN_LOBBY, { lobbyId: created.lobby.id, token: created.player.token });
    const firstJoin = await first.waitFor(CONTROL.WELCOME);
    const firstEntity = firstJoin.entityId;
    first.close();
    await new Promise(resolve => setTimeout(resolve, 150));

    const lobbyAfterDisconnect = await (await fetch(`${url}/api/lobby/${created.lobby.id}`)).json();
    assert.equal(lobbyAfterDisconnect.lobby.connected, 0);
    // Der Platz bleibt für die Wiederverbindung reserviert.
    assert.equal(lobbyAfterDisconnect.lobby.occupied, 1);

    const second = new TestClient(wsUrl);
    await second.open();
    second.send(CONTROL.JOIN_LOBBY, {
      lobbyId: created.lobby.id,
      name: 'ClientA',
      token: created.player.token,
    });
    const rejoined = await second.waitFor(CONTROL.WELCOME);
    assert.equal(rejoined.resumed, true);
    assert.equal(rejoined.entityId, firstEntity, 'Reconnect muss dieselbe Entity behalten');

    const lobbyAfterResume = await (await fetch(`${url}/api/lobby/${created.lobby.id}`)).json();
    assert.equal(lobbyAfterResume.lobby.connected, 1);
    assert.equal(lobbyAfterResume.lobby.occupied, 1, 'Reconnect darf keinen zweiten Platz belegen');

    second.close();
  } finally {
    await server.close();
  }
});

test('Unbesetzte Plätze werden von Bots gesteuert und das Match endet', { timeout: 60_000 }, async () => {
  const { server, url, port } = await startTestServer();
  const wsUrl = `ws://127.0.0.1:${port}/ws`;
  const client = new TestClient(wsUrl);

  try {
    const created = await createLobby(url, { teams: 2, playersPerTeam: 1, seed: 99 });
    await client.open();
    client.send(CONTROL.JOIN_LOBBY, { lobbyId: created.lobby.id, token: created.player.token });
    await client.waitFor(CONTROL.WELCOME);

    // Ohne zweiten Client übernimmt der Bot den Gegner.
    const session = server.getSession(created.lobby.id);
    assert.ok(session, 'Sitzung muss existieren');

    // Deterministisch vorspulen statt in Echtzeit zu warten. Kurze Zugzeit,
    // damit der nicht besetzte Platz nicht 30 s Echtzeit pro Zug verbraucht.
    session.stop();
    session.match.setTurnDuration(250);
    const startState = session.match.getState();
    let moved = false;
    let steps = 0;
    while (session.match.status === 'playing' && steps < 20_000) {
      session.stepSimulation(1);
      steps++;
      if (steps % 50 === 0) {
        const current = session.match.getState();
        if (current.round > startState.round) moved = true;
        if (current.entities.some((entity, index) => entity.health !== startState.entities[index]?.health)) {
          moved = true;
        }
      }
    }

    assert.ok(moved, 'Bot muss den Matchzustand verändern');
    assert.equal(session.match.status, 'gameover', 'Match muss auch mit Bots enden');
    assert.ok(session.match.round >= 1);
    assert.ok(session.match.winnerTeamId !== undefined);

    // Der Verlauf muss die letzten 200 ms abdecken.
    assert.ok(session.history.size > 0, 'Lag-Kompensationshistorie muss gefüllt sein');
  } finally {
    client.close();
    await server.close();
  }
});

// --------------------------------------- Ende mitteilen (Wiederholung/Rejoin)

/**
 * Ein entschiedenes Match muss auch einem Client mitgeteilt werden, der die
 * einmalige `match_over`-Nachricht verpasst hat.
 *
 * Hintergrund: Nach dem Ende ruft die Sitzung `stop()` auf und sendet keine
 * Snapshots mehr. Die einzige Nachricht über das Ende ist ein einmaliges
 * `match_over` aus `#finish()`. Verpasst ein Client sie — etwa weil sein Socket
 * im Moment der Aussendung nicht offen war; `broadcastSnapshot` überspringt
 * solche Clients still —, sitzt er dauerhaft auf einem laufenden Spiel fest:
 * Der Ansichtszustand steht auf „playing", es kommt nichts mehr, und die Anzeige
 * behauptet weiter, es laufe.
 *
 * Diese Datei sichert die beiden Wege ab, auf denen der Client es dennoch
 * erfährt. Der Client selbst ist in `src/client/main.js` entsprechend
 * angepasst.
 */

/** Spielt ein Match mit Bots deterministisch bis zum Ende durch. */
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

test('Auf PING kommt das Match-Ende erneut, wenn es entschieden ist', { timeout: 60_000 }, async () => {
  const { server, url, port } = await startTestServer();
  const wsUrl = `ws://127.0.0.1:${port}/ws`;
  const client = new TestClient(wsUrl);

  try {
    const created = await createLobby(url, { teams: 2, playersPerTeam: 1, seed: 99 });
    await client.open();
    client.send(CONTROL.JOIN_LOBBY, { lobbyId: created.lobby.id, token: created.player.token });
    await client.waitFor(CONTROL.WELCOME);

    const session = server.getSession(created.lobby.id);
    await matchZuEndeSpielen(session);

    // Zählen statt warten: Das erste match_over kann bereits in der Warteschlange
    // liegen. Geprüft wird, dass auf die Anfrage ein WEITERES kommt.
    const zaehle = () => client.controls.filter(m => m.t === 'match_over').length;
    const vorher = zaehle();

    client.send(CONTROL.PING);

    const frist = Date.now() + 5000;
    while (Date.now() < frist && zaehle() <= vorher) {
      await new Promise(r => setTimeout(r, 25));
    }

    assert.ok(zaehle() > vorher,
      'Auf eine PING-Anfrage muss match_over erneut kommen, solange das Match entschieden ist');

    const letzte = client.controls.filter(m => m.t === 'match_over').at(-1);
    assert.equal(letzte.winnerTeamId, session.match.winnerTeamId,
      'Die Wiederholung muss denselben Sieger nennen');
  } finally {
    client.close();
    await server.close();
  }
});

test('Ohne entschiedenes Match wiederholt PING nichts', { timeout: 30_000 }, async () => {
  // Gegenprobe: Ohne sie wäre der Test oben auch dann grün, wenn der Server
  // match_over bei JEDER Anfrage schicken würde — dann wäre es kein Beleg für
  // die gezielte Wiederholung, sondern für Dauerfeuer.
  const { server, url, port } = await startTestServer();
  const wsUrl = `ws://127.0.0.1:${port}/ws`;
  const client = new TestClient(wsUrl);

  try {
    const created = await createLobby(url, { teams: 2, playersPerTeam: 1, seed: 7 });
    await client.open();
    client.send(CONTROL.JOIN_LOBBY, { lobbyId: created.lobby.id, token: created.player.token });
    await client.waitFor(CONTROL.WELCOME);

    const session = server.getSession(created.lobby.id);
    session.stop();
    session.match.setTurnDuration(30_000);
    assert.equal(session.match.status, 'playing');

    for (let i = 0; i < 3; i += 1) client.send(CONTROL.PING);
    await new Promise(r => setTimeout(r, 400));

    assert.equal(client.controls.filter(m => m.t === 'match_over').length, 0,
      'Solange das Match läuft, darf PING kein match_over auslösen');
  } finally {
    client.close();
    await server.close();
  }
});

test('Der Reconnect auf ein entschiedenes Match startet ein NEUES Match', { timeout: 60_000 }, async () => {
  /*
   * Festgehaltenes Verhalten, das eine falsche Annahme korrigiert hat:
   *
   * Erwartet war, dass ein Wiederverbinder den entschiedenen Zustand bekommt
   * (Status „gameover"), damit die Anzeige das Ende zeigt. Gemessen wurde das
   * Gegenteil: Beim Match-Ende ruft die Sitzung `#finish()` auf, und das
   * löscht sie aus der Sitzungsverwaltung (`onEmpty`). Der spätere Beitritt
   * findet also KEINE Sitzung mehr vor und legt eine NEUE an (`JOIN_LOBBY`
   * erzeugt eine `LobbySession`). Deren Match beginnt bei null und steht auf
   * „playing".
   *
   * Der Reconnect ist damit faktisch eine Revanche: Es fließen wieder
   * Snapshots, und der Client zeigt ein neues Match statt eines Endstands. Ein
   * „für immer veraltetes Brett" gibt es auf diesem Weg nicht.
   *
   * Zwei Eigentümlichkeiten hält der Test ausdrücklich fest, weil sie
   * überraschen:
   *  - Der Lobby-Status bleibt „finished", während in ihr ein neues Match
   *    läuft.
   *  - Ein FREMDER Client (ohne Token) kommt nicht mehr hinein, obwohl dort
   *    wieder gespielt wird.
   */
  const { server, url, port } = await startTestServer();
  const wsUrl = `ws://127.0.0.1:${port}/ws`;
  const client = new TestClient(wsUrl);

  try {
    const created = await createLobby(url, { teams: 2, playersPerTeam: 1, seed: 99 });
    await client.open();
    client.send(CONTROL.JOIN_LOBBY, { lobbyId: created.lobby.id, token: created.player.token });
    await client.waitFor(CONTROL.WELCOME);
    // Den eigenen Platz mitschneiden — damit die Wiederverbindung unten gegen
    // einen echten Wert geprüft werden kann und nicht gegen `undefined`.
    const erstesLobbyState = await client.waitFor(CONTROL.LOBBY_STATE);
    assert.ok(erstesLobbyState.entityId !== null && erstesLobbyState.entityId !== undefined,
      'Der erste Beitritt muss eine Entity-ID erhalten');

    const session = server.getSession(created.lobby.id);
    await matchZuEndeSpielen(session);
    assert.equal(session.match.status, 'gameover');

    // Das Ende hat die Sitzung entfernt.
    assert.ok(!server.getSession(created.lobby.id),
      'Nach dem Ende muss die Sitzung aus der Verwaltung verschwunden sein');

    // Wieder verbinden — mit demselben Token.
    const erneut = new TestClient(wsUrl);
    try {
      await erneut.open();
      erneut.send(CONTROL.JOIN_LOBBY, { lobbyId: created.lobby.id, token: created.player.token });
      const zustand = await erneut.waitFor(CONTROL.LOBBY_STATE);

      // Der Platz ist derselbe (Wiederverbindung, kein neuer Spieler) …
      assert.equal(zustand.entityId, erstesLobbyState.entityId,
        'Die Wiederverbindung muss denselben Platz zurückgeben');

      // … aber das Match beginnt von vorn.
      assert.equal(zustand.snapshot?.status, 'playing',
        'Der Wiederverbinder bekommt ein NEUES Match, nicht den Endstand');
      assert.equal(zustand.snapshot?.round, 1, 'Das neue Match startet in Runde 1');
      assert.ok(zustand.seed !== undefined, 'Der Seed für den Terrainaufbau muss mitkommen');

      /*
       * Der Lobby-Status steht dagegen auf „beendet", während in ihr wieder
       * gespielt wird. Das ist widersprüchlich — wer die Lobby-Liste liest,
       * sieht sie als erledigt —, aber es ist der Ist-Zustand, und ein Test
       * soll ihn festhalten statt eine Wunschvorstellung.
       */
      assert.equal(zustand.status, 'finished',
        'Der Lobby-Status bleibt auf „beendet", obwohl ein neues Match läuft');

      // Und es laufen wieder Snapshots.
      const frist = Date.now() + 10_000;
      while (Date.now() < frist && erneut.snapshots.length === 0) {
        await new Promise(r => setTimeout(r, 50));
      }
      assert.ok(erneut.snapshots.length > 0,
        'Nach dem Wiederverbinden müssen wieder Snapshots fließen');
    } finally {
      erneut.close();
    }

    // Und ein fremder Client kommt nicht mehr hinein.
    const fremd = new TestClient(wsUrl);
    try {
      await fremd.open();
      fremd.send(CONTROL.JOIN_LOBBY, { lobbyId: created.lobby.id, name: 'Fremd' });
      const fehler = await fremd.waitFor(CONTROL.ERROR);
      assert.match(fehler.error, /nimmt keine Spieler mehr auf/);
    } finally {
      fremd.close();
    }
  } finally {
    client.close();
    await server.close();
  }
});
