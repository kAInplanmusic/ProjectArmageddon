import assert from 'node:assert/strict';
import test from 'node:test';
import { WebSocket } from 'ws';
import { GameServer } from '../src/server/gameServer.js';
import {
  CONTROL,
  MAGIC,
  MESSAGE_TYPE,
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
    assert.equal(welcomeA.protocol, 1);

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
