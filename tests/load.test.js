import assert from 'node:assert/strict';
import test from 'node:test';
import { WebSocket } from 'ws';
import { GameServer } from '../src/server/gameServer.js';
import {
  CONTROL,
  controlMessage,
  parseControlMessage,
  decodeSnapshot,
} from '../src/shared/protocol.js';

/**
 * Lasttest: mehrere gleichzeitige Clients in getrennten Lobbys.
 *
 * Geprüft wird, dass der Server unter paralleler Last stabil bleibt: alle
 * Clients verbinden sich, erhalten fortlaufend Snapshots, die Simulation
 * schreitet voran und es gehen keine Verbindungen verloren.
 */

class LoadClient {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.controls = [];
    this.snapshotCount = 0;
    this.lastTick = -1;
    this.errors = [];
    this.opened = new Promise((resolve, reject) => {
      this.socket.once('open', resolve);
      this.socket.once('error', reject);
    });
    this.socket.on('message', (raw, isBinary) => {
      if (isBinary) {
        const snapshot = decodeSnapshot(raw);
        if (!snapshot) return;
        this.snapshotCount += 1;
        this.lastTick = Math.max(this.lastTick, snapshot.tick);
        this.lastSnapshot = snapshot;
        return;
      }
      const message = parseControlMessage(raw);
      if (!message) return;
      if (message.t === CONTROL.ERROR) this.errors.push(message);
      this.controls.push(message);
    });
  }

  send(type, payload = {}) {
    this.socket.send(controlMessage(type, payload));
  }

  waitFor(type, timeoutMs = 8000) {
    const deadline = Date.now() + timeoutMs;
    return new Promise((resolve, reject) => {
      const poll = () => {
        const index = this.controls.findIndex(message => message.t === type);
        if (index >= 0) return resolve(this.controls.splice(index, 1)[0]);
        if (Date.now() > deadline) return reject(new Error(`Timeout: ${type}`));
        setTimeout(poll, 20);
      };
      poll();
    });
  }

  close() {
    this.socket.terminate();
  }
}

async function createLobby(url, body) {
  const response = await fetch(`${url}/api/lobby/create`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  assert.equal(response.status, 201, `Lobby-Erstellung fehlgeschlagen: ${response.status}`);
  return response.json();
}

test('Acht gleichzeitige Clients spielen ohne Verbindungsverlust', { timeout: 60_000 }, async () => {
  const server = new GameServer();
  const info = await server.listen(0);
  const wsUrl = `ws://127.0.0.1:${info.port}/ws`;
  const clients = [];

  try {
    // Vier Lobbys à zwei Spieler = acht Clients.
    const lobbies = [];
    for (let i = 0; i < 4; i++) {
      lobbies.push(await createLobby(info.url, {
        teams: 2,
        playersPerTeam: 1,
        seed: 1000 + i,
        preset: 'hills',
      }));
    }

    // Alle acht Clients verbinden.
    for (let i = 0; i < 8; i++) {
      const lobby = lobbies[Math.floor(i / 2)];
      const isHost = i % 2 === 0;
      const client = new LoadClient(wsUrl);
      clients.push(client);
      await client.opened;
      client.send(CONTROL.JOIN_LOBBY, {
        lobbyId: lobby.lobby.id,
        name: `Client${i}`,
        token: isHost ? lobby.player.token : null,
      });
    }

    // Jeder Client muss seinen Platz bestätigt bekommen.
    const joins = await Promise.all(clients.map(client => client.waitFor(CONTROL.WELCOME)));
    const entityIds = joins.map(join => join.entityId);
    assert.ok(entityIds.every(id => id > 0), `Alle Clients brauchen eine Entity-ID: ${entityIds}`);

    // Kurz laufen lassen und Snapshots sammeln.
    await new Promise(resolve => setTimeout(resolve, 2500));

    const counts = clients.map(client => client.snapshotCount);
    assert.ok(
      counts.every(count => count > 10),
      `Jeder Client muss Snapshots erhalten: ${counts}`,
    );

    // Die Simulation muss in jeder Lobby vorangeschritten sein.
    const sessions = lobbies.map(lobby => server.getSession(lobby.lobby.id));
    assert.ok(sessions.every(Boolean), 'Für jede Lobby muss eine Sitzung existieren');
    const ticks = sessions.map(session => session.match.world.tickCount);
    assert.ok(ticks.every(tick => tick > 30), `Simulation muss laufen: ${ticks}`);

    // Acht Clients über vier Sitzungen.
    assert.equal(server.sessionCount, 4);

    // Kein Client darf einen Serverfehler bekommen haben.
    for (const [index, client] of clients.entries()) {
      assert.deepEqual(client.errors, [], `Client ${index} erhielt Fehler`);
    }
  } finally {
    for (const client of clients) client.close();
    await server.close();
  }
});

test('Ein Client, der feuert, wird bei acht parallelen Clients korrekt bedient', { timeout: 60_000 }, async () => {
  const server = new GameServer();
  const info = await server.listen(0);
  const wsUrl = `ws://127.0.0.1:${info.port}/ws`;
  const clients = [];

  try {
    const lobbies = [];
    for (let i = 0; i < 4; i++) {
      lobbies.push(await createLobby(info.url, { teams: 2, playersPerTeam: 1, seed: 500 + i }));
    }

    for (let i = 0; i < 8; i++) {
      const lobby = lobbies[Math.floor(i / 2)];
      const client = new LoadClient(wsUrl);
      clients.push(client);
      await client.opened;
      client.send(CONTROL.JOIN_LOBBY, {
        lobbyId: lobby.lobby.id,
        name: `C${i}`,
        token: i % 2 === 0 ? lobby.player.token : null,
      });
    }
    await Promise.all(clients.map(client => client.waitFor(CONTROL.WELCOME)));
    await new Promise(resolve => setTimeout(resolve, 600));

    // In jeder Lobby feuert der aktive Spieler.
    let shotsAccepted = 0;
    for (const lobby of lobbies) {
      const session = server.getSession(lobby.lobby.id);
      const active = session.match.activePlayerId;
      const seat = session.lobby.seats.find(entry => entry.entityId === active);
      if (!seat) continue;

      // Direkt über die Sitzung feuern: prüft die Serverlogik unter paralleler
      // Last, ohne von der Snapshot-Zustellung eines einzelnen Clients abzuhängen.
      const result = session.handleInput(seat.token, { angle: Math.PI / 4, power: 60, tick: session.match.world.tickCount });
      if (result.ok) shotsAccepted += 1;
    }

    assert.ok(shotsAccepted > 0, 'Mindestens ein Schuss muss unter Last akzeptiert werden');

    // Danach müssen alle Clients weiterhin Snapshots erhalten.
    const before = clients.map(client => client.snapshotCount);
    await new Promise(resolve => setTimeout(resolve, 1200));
    const after = clients.map(client => client.snapshotCount);
    assert.ok(
      after.every((count, index) => count > before[index]),
      `Snapshots müssen weiterlaufen: ${before} → ${after}`,
    );
  } finally {
    for (const client of clients) client.close();
    await server.close();
  }
});
