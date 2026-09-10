import assert from 'node:assert/strict';
import test from 'node:test';
import { WebSocket } from 'ws';
import { GameServer } from '../src/server/gameServer.js';
import { CONTROL, controlMessage, parseControlMessage, PROTOCOL_VERSION } from '../src/shared/protocol.js';

/**
 * Betriebszähler und Zustandsabfrage.
 *
 * Zweck der Zähler ist, im Betrieb ohne Logsuche zu erkennen, ob Verbindungen
 * abbrechen oder Kommandos abgelehnt werden. Die Tests prüfen, dass die Zähler
 * tatsächlich mit dem Geschehen mitlaufen — Zahlen, die immer null bleiben,
 * wären irreführender als gar keine.
 */

/** Minimaler WS-Client, der Nachrichten sammelt. */
class TestClient {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.controls = [];
    this.opened = new Promise((resolve, reject) => {
      this.socket.once('open', resolve);
      this.socket.once('error', reject);
    });
    this.socket.on('message', (raw, isBinary) => {
      if (isBinary) return;
      const message = parseControlMessage(raw);
      if (message) this.controls.push(message);
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

test('Die Zustandsabfrage liefert Zähler und Uptime', { timeout: 30_000 }, async () => {
  const server = new GameServer();
  const info = await server.listen(0);
  try {
    const response = await fetch(`${info.url}/healthz`);
    assert.equal(response.status, 200);
    const health = await response.json();

    assert.equal(health.status, 'ok');
    assert.equal(health.protocol, PROTOCOL_VERSION);
    assert.equal(health.lobbies, 0);
    assert.equal(health.sessions, 0);
    assert.equal(health.healthy, true, 'Ohne Sitzungen gilt der Server als gesund');
    assert.equal(health.orphanedSessions, 0);

    // Uptime und Zähler müssen vorhanden und plausibel sein.
    assert.ok(Number.isFinite(health.uptimeMs) && health.uptimeMs >= 0);
    assert.equal(health.metrics.connections, 0);
    assert.equal(health.metrics.errors, 0);
    assert.equal(health.metrics.commandsRejected, 0);
    assert.ok(Number.isFinite(health.metrics.startedAt));
  } finally {
    await server.close();
  }
});

test('Verbindungen und Lobbys werden gezählt', { timeout: 30_000 }, async () => {
  const server = new GameServer();
  const info = await server.listen(0);
  const clients = [];
  try {
    const created = await fetch(`${info.url}/api/lobby/create`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ teams: 2, playersPerTeam: 1, seed: 4242 }),
    }).then(response => response.json());

    const client = new TestClient(`ws://127.0.0.1:${info.port}/ws`);
    clients.push(client);
    await client.opened;
    client.send(CONTROL.JOIN_LOBBY, { lobbyId: created.lobby.id, name: 'Zähler' });
    await client.waitFor(CONTROL.WELCOME);

    // Kurz laufen lassen, damit Snapshots gezählt werden.
    await new Promise(resolve => setTimeout(resolve, 600));

    const health = await (await fetch(`${info.url}/healthz`)).json();
    assert.equal(health.metrics.connections, 1, 'Eine Verbindung muss gezählt sein');
    assert.equal(health.metrics.lobbiesCreated, 1, 'Eine Lobby muss gezählt sein');
    assert.equal(health.lobbies, 1);
    assert.equal(health.sessions, 1);
    assert.ok(health.metrics.snapshotsSent > 0, 'Gesendete Snapshots müssen gezählt werden');
    assert.equal(health.healthy, true, 'Lobby und Sitzung passen zusammen');

    // Nach dem Schließen muss die Trennung gezählt werden.
    client.close();
    await new Promise(resolve => setTimeout(resolve, 400));

    const danach = await (await fetch(`${info.url}/healthz`)).json();
    assert.equal(danach.metrics.disconnections, 1, 'Die Trennung muss gezählt werden');
    assert.equal(danach.metrics.connections, 1, 'Die Verbindungszahl bleibt als Gesamtzahl stehen');
  } finally {
    for (const client of clients) client.close();
    await server.close();
  }
});

test('Abgelehnte Kommandos werden gezählt', { timeout: 30_000 }, async () => {
  const server = new GameServer();
  const info = await server.listen(0);
  const clients = [];
  try {
    const created = await fetch(`${info.url}/api/lobby/create`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ teams: 2, playersPerTeam: 1, seed: 99 }),
    }).then(response => response.json());

    const client = new TestClient(`ws://127.0.0.1:${info.port}/ws`);
    clients.push(client);
    await client.opened;
    client.send(CONTROL.JOIN_LOBBY, { lobbyId: created.lobby.id, name: 'Prüfer' });
    await client.waitFor(CONTROL.WELCOME);
    await new Promise(resolve => setTimeout(resolve, 300));

    // Ein offensichtlich ungültiges Kommando: Winkel außerhalb des Bereichs.
    client.send(CONTROL.INPUT, { angle: 99, power: 50 });

    const deadline = Date.now() + 5000;
    let health = null;
    while (Date.now() < deadline) {
      health = await (await fetch(`${info.url}/healthz`)).json();
      if (health.metrics.commandsRejected > 0) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    assert.ok(
      health.metrics.commandsRejected > 0,
      `Ein ungültiges Kommando muss gezählt werden: ${JSON.stringify(health.metrics)}`,
    );
  } finally {
    for (const client of clients) client.close();
    await server.close();
  }
});
