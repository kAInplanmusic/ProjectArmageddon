import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';
import { startServer } from '../src/server/gameServer.js';
import { CONTROL, controlMessage, parseControlMessage } from '../src/shared/protocol.js';

/**
 * Neustart mit Persistenz — der volle Weg.
 *
 * Deckt einen Fehler ab, der beim reinen Unit-Test unsichtbar bleibt: Der
 * Zustandsdump lief nur über die Sitzungen. Eine frisch angelegte Lobby hat
 * aber noch keine Sitzung (die entsteht erst beim Beitritt), und verschwand
 * deshalb bei einem Neustart, obwohl sie in der Lobby-Liste angezeigt wurde.
 */

async function createLobby(url, body) {
  const response = await fetch(`${url}/api/lobby/create`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Lobby-Erstellung fehlgeschlagen: ${response.status}`);
  return response.json();
}

/** Verbindet einen WebSocket-Client und wartet auf die erste Steuernachricht. */
function openSocket(port) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const controls = [];
  socket.on('message', (raw, isBinary) => {
    if (isBinary) return;
    const message = parseControlMessage(raw);
    if (message) controls.push(message);
  });
  return {
    socket,
    controls,
    opened: new Promise((resolve, reject) => {
      socket.once('open', resolve);
      socket.once('error', reject);
    }),
    send: (type, payload = {}) => socket.send(controlMessage(type, payload)),
    async waitFor(type, timeoutMs = 8000) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const index = controls.findIndex(message => message.t === type);
        if (index >= 0) return controls.splice(index, 1)[0];
        await new Promise(r => setTimeout(r, 20));
      }
      throw new Error(`Timeout: ${type}. Empfangen: ${JSON.stringify(controls)}`);
    },
    close: () => socket.terminate(),
  };
}

test('Eine Lobby ohne Sitzung überlebt den Neustart und bleibt beitretbar', { timeout: 60_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pa-restart-'));
  const statePath = join(dir, 'lobbies.json');
  let ersteInstanz = null;
  let zweiteInstanz = null;

  try {
    // --- Erster Serverlauf: Lobby anlegen, sonst nichts tun ---
    ersteInstanz = await startServer({ port: 0, statePath, persistenceIntervalMs: 60_000 });
    const created = await createLobby(ersteInstanz.url, {
      teams: 2, playersPerTeam: 1, seed: 4711, preset: 'islands',
    });
    const lobbyId = created.lobby.id;
    assert.ok(lobbyId);

    // Ohne Sitzung: es ist noch niemand über WebSocket beigetreten.
    const vorher = await (await fetch(`${ersteInstanz.url}/healthz`)).json();
    assert.equal(vorher.lobbies, 1);
    assert.equal(vorher.sessions, 0, 'Eine frische Lobby hat noch keine Sitzung');

    // Speichern und herunterfahren.
    assert.equal(ersteInstanz.server.saveState(), true);
    await ersteInstanz.server.close();
    ersteInstanz = null;

    // --- Zweiter Serverlauf: aus derselben Datei wiederherstellen ---
    zweiteInstanz = await startServer({ port: 0, statePath, persistenceIntervalMs: 60_000 });

    assert.equal(
      zweiteInstanz.restored.restored, 1,
      `Es muss genau eine Lobby wiederhergestellt werden: ${JSON.stringify(zweiteInstanz.restored)}`,
    );

    const nachher = await (await fetch(`${zweiteInstanz.url}/healthz`)).json();
    assert.equal(nachher.lobbies, 1, 'Die Lobby muss nach dem Neustart vorhanden sein');
    assert.equal(nachher.sessions, 0, 'Ohne Spielbetrieb entsteht keine Sitzung');
    assert.equal(nachher.healthy, true);

    // Der Lobby-Browser muss sie weiterhin anzeigen — mit unveränderter Karte.
    const liste = await (await fetch(`${zweiteInstanz.url}/api/lobby`)).json();
    assert.equal(liste.lobbies.length, 1);
    assert.equal(liste.lobbies[0].id, lobbyId, 'Die Lobby-ID muss erhalten bleiben');
    assert.equal(liste.lobbies[0].preset, 'islands', 'Die Karte muss erhalten bleiben');
    assert.equal(liste.lobbies[0].status, 'open', 'Die Lobby muss weiterhin offen sein');

    // --- Beitritt: jetzt muss die Sitzung entstehen ---
    const client = openSocket(zweiteInstanz.port);
    try {
      await client.opened;
      client.send(CONTROL.JOIN_LOBBY, { lobbyId, name: 'Wiederkommer', token: created.player.token });
      const welcome = await client.waitFor(CONTROL.WELCOME);
      assert.ok(welcome.entityId > 0, `Beitritt muss eine Entity liefern: ${JSON.stringify(welcome)}`);

      const nachBeitritt = await (await fetch(`${zweiteInstanz.url}/healthz`)).json();
      assert.equal(nachBeitritt.sessions, 1, 'Der Beitritt muss eine Sitzung erzeugen');
      assert.equal(nachBeitritt.healthy, true);
    } finally {
      client.close();
    }
  } finally {
    if (ersteInstanz) await ersteInstanz.server.close();
    if (zweiteInstanz) await zweiteInstanz.server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Ein laufendes Match wird mit Sitzung wiederhergestellt', { timeout: 60_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pa-restart-play-'));
  const statePath = join(dir, 'lobbies.json');
  let ersteInstanz = null;
  let zweiteInstanz = null;

  try {
    ersteInstanz = await startServer({ port: 0, statePath, persistenceIntervalMs: 60_000 });
    const created = await createLobby(ersteInstanz.url, {
      teams: 2, playersPerTeam: 1, seed: 2024, preset: 'hills',
    });
    const lobbyId = created.lobby.id;

    // Beitreten und feuern, damit ein Replay-Kern entsteht.
    const client = openSocket(ersteInstanz.port);
    await client.opened;
    client.send(CONTROL.JOIN_LOBBY, { lobbyId, name: 'Spieler', token: created.player.token });
    const welcome = await client.waitFor(CONTROL.WELCOME);
    assert.ok(welcome.entityId > 0);

    // Etwas Spielzeit vergehen lassen, damit Ticks aufgezeichnet werden.
    await new Promise(r => setTimeout(r, 1200));

    const vorher = await (await fetch(`${ersteInstanz.url}/healthz`)).json();
    assert.equal(vorher.sessions, 1);

    ersteInstanz.server.saveState();
    await ersteInstanz.server.close();
    ersteInstanz = null;
    client.close();

    // --- Wiederherstellen: jetzt MIT Sitzung ---
    zweiteInstanz = await startServer({ port: 0, statePath, persistenceIntervalMs: 60_000 });
    assert.equal(zweiteInstanz.restored.restored, 1);

    const nachher = await (await fetch(`${zweiteInstanz.url}/healthz`)).json();
    assert.equal(nachher.lobbies, 1);
    assert.equal(nachher.sessions, 1, 'Ein gespieltes Match muss mit Sitzung zurückkommen');
    assert.equal(nachher.healthy, true);
    assert.equal(nachher.orphanedSessions, 0);
  } finally {
    if (ersteInstanz) await ersteInstanz.server.close();
    if (zweiteInstanz) await zweiteInstanz.server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
