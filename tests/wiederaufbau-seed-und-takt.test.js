/**
 * Ein erneuter Start führt auf DIESELBE Karte — und der Wiederaufbau kommt am
 * selben Takt an.
 *
 * ## Die zwei Funde (beide belegt)
 *
 * **1. Der Seed überlebte den Neustart nicht.** Im Normalfall ist `lobby.seed`
 * `undefined` (das Menüfeld ist leer, dann zieht der Motor einen Zufalls-Seed).
 * `JSON.stringify` lässt einen `undefined`-Schlüssel WEG (`persistence.js:112`),
 * und `restoreLobby` reichte `saved.seed` weiter — also `undefined`. Der
 * `MatchController` zog daraufhin einen NEUEN Zufalls-Seed (`match.js:564`):
 * baseSeed 3367130477 → 1341271627, Zustandshash `98aad2e2` → `e6da56da`. Die
 * Partie stand nach dem Neustart auf einer anderen Karte — und „Revanche" ohne
 * Seed war derselbe Fall.
 *
 * **2. Der Wiederaufbau lief einen Takt zu weit.** `#restoreFromReplay` rechnete
 * `limit = Math.max(totalTicks, …) + 1` bei der Bedingung `tickCount < limit` —
 * ein Simulationsschritt ÜBER den gesicherten Takt hinaus, während der Kommentar
 * daneben „exakt derselbe Zustand" behauptete. Gemessen: 420 → 421 Takte, alle
 * Figuren 8 px tiefer, Hash `1e199a57` → `d4248776`.
 *
 * **3. Ohne aufgezeichnete Eingaben wurde GAR NICHT vorgespult.** Die Bedingung
 * verlangte `replayEntries.length > 0`; eine Partie, in der noch niemand
 * geschossen hatte, kam am Anfang zurück: gesicherter Takt 92,
 * wiederhergestellter Takt 0, Hash `2ee23ca9` → `3260a37`.
 *
 * ## Was dieser Test messbar macht
 *
 * Er fährt den ECHTEN Weg (Server starten, Lobby OHNE Seed, zwei Menschen,
 * spielen, sichern, neu starten) und hält drei Dinge fest: den Seed, den
 * Zustandshash und den Takt. Der Zustandshash-Vergleich liegt jetzt im Produkt
 * (`restoreLobby`) und wird hier abgefragt — damit fällt ein Rückfall in diese
 * Fehlerklasse sofort auf, statt einen dritten Prüfer zu brauchen.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { WebSocket } from 'ws';
import { startServer } from '../src/server/gameServer.js';
import { CONTROL, controlMessage, parseControlMessage } from '../src/shared/protocol.js';
import { MatchController } from '../src/engine/match.js';
import { hashState } from '../src/engine/stateSnapshot.js';

async function createLobby(url, body) {
  const response = await fetch(`${url}/api/lobby/create`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Lobby-Erstellung fehlgeschlagen: ${response.status}`);
  return response.json();
}

/** Verbindet einen WebSocket-Client und sammelt die Steuernachrichten. */
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
        const index = controls.findIndex(m => m.t === type);
        if (index >= 0) return controls.splice(index, 1)[0];
        await new Promise(r => setTimeout(r, 20));
      }
      throw new Error(`Timeout: ${type}. Empfangen: ${JSON.stringify(controls)}`);
    },
    close: () => socket.terminate(),
  };
}

/** Lässt eine Lobby ohne Eingaben laufen, bis mindestens `ticks` Takte durch sind. */
async function spieleOhneEingaben(instanz, lobbyId, token, ticks = 90) {
  const a = openSocket(instanz.port);
  await a.opened;
  a.send(CONTROL.JOIN_LOBBY, { lobbyId, name: 'A', token });
  await a.waitFor(CONTROL.WELCOME);
  const b = openSocket(instanz.port);
  await b.opened;
  b.send(CONTROL.JOIN_LOBBY, { lobbyId, name: 'B' });
  await b.waitFor(CONTROL.WELCOME);

  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const takt = instanz.server.getSession(lobbyId)?.match?.world?.tickCount ?? 0;
    if (takt >= ticks) break;
    await new Promise(r => setTimeout(r, 50));
  }
  return { a, b };
}

test('Neustart ohne Seed: dieselbe Karte, derselbe Zustand, derselbe Takt', { timeout: 60_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pa-revanche-'));
  const statePath = join(dir, 'lobbies.json');
  let erste = null;
  let zweite = null;
  let sockets = null;

  try {
    erste = await startServer({ port: 0, statePath, persistenceIntervalMs: 60_000 });
    // KEIN seed — genau der Normalfall aus dem Menü („leer = neue Karte").
    const created = await createLobby(erste.url, { teams: 2, playersPerTeam: 1 });
    const lobbyId = created.lobby.id;
    assert.equal(created.lobby.seed, undefined, 'Ohne Angabe ist der Lobby-Seed undefined — so entstand der Fund');

    sockets = await spieleOhneEingaben(erste, lobbyId, created.player.token, 90);

    const session = erste.server.getSession(lobbyId);
    assert.ok(session, 'Die Sitzung muss laufen');
    const seedVorher = session.match.seedManager.baseSeed;
    const hashVorher = hashState(session.match.getState());
    const taktVorher = session.match.world.tickCount;
    assert.ok(taktVorher >= 90, `Es müssen Takte vergangen sein (waren ${taktVorher})`);

    assert.equal(erste.server.saveState(), true);
    const datei = JSON.parse(readFileSync(statePath, 'utf8'));
    const gesichert = datei.lobbies[0];
    assert.equal(
      gesichert.seed, seedVorher,
      'Der gespielte Seed muss in der Sicherung stehen — vorher fehlte der Schlüssel ganz',
    );
    assert.equal(gesichert.replay.seed, seedVorher, 'Der Replay-Kopf trägt denselben Seed');
    assert.equal(gesichert.hash, hashVorher, 'Die Sicherung trägt den Zustandshash');
    assert.equal(gesichert.tick, taktVorher, 'Die Sicherung trägt den Takt');

    await erste.server.close();
    erste = null;
    sockets.a.close();
    sockets.b.close();
    sockets = null;

    // --- Neustart aus derselben Datei ---
    zweite = await startServer({ port: 0, statePath, persistenceIntervalMs: 60_000 });
    assert.equal(zweite.restored.restored, 1);

    const pruefung = zweite.server.restorePruefungen[0];
    assert.ok(pruefung, 'Jede wiederhergestellte Lobby muss eine Zustandsprüfung haben');
    assert.equal(
      pruefung.gleich, true,
      `Der wiederhergestellte Zustand muss der gesicherte sein: `
      + `erwartet ${pruefung.erwartet} (Takt ${pruefung.tickGesichert}), `
      + `gemessen ${pruefung.gemessen} (Takt ${pruefung.tick})`,
    );
    assert.equal(pruefung.tick, taktVorher, 'Der Takt darf nicht einen Schritt weiterlaufen');
    assert.equal(pruefung.gemessen, hashVorher);

    const wieder = zweite.server.getSession(lobbyId);
    assert.ok(wieder, 'Die Sitzung muss zurückkommen');
    assert.equal(wieder.match.seedManager.baseSeed, seedVorher, 'DERSELBE Seed — dieselbe Karte');
    assert.equal(hashState(wieder.match.getState()), hashVorher);

    // Und der Client sieht die Karte auch: Der Server meldet diesen Seed.
    const c = openSocket(zweite.port);
    try {
      await c.opened;
      c.send(CONTROL.JOIN_LOBBY, { lobbyId, name: 'Wiederkommer', token: created.player.token });
      await c.waitFor(CONTROL.WELCOME);
      const lobbyState = await c.waitFor(CONTROL.LOBBY_STATE);
      assert.equal(
        lobbyState.seed, seedVorher,
        'Der wieder verbundene Client muss den gesicherten Seed bekommen — sonst baut er eine andere Karte',
      );
    } finally {
      c.close();
    }
  } finally {
    if (sockets) { sockets.a.close(); sockets.b.close(); }
    if (erste) await erste.server.close();
    if (zweite) await zweite.server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Ein erneuter Start mit demselben Seed ergibt dieselbe Karte und denselben Verlauf', () => {
  /*
   * Die Zusage, die „Revanche" braucht — hier ohne Server, damit der Kern klar
   * ist: Seed und Eingaben bestimmen alles. Zwei Läufe mit derselben
   * Eingabefolge liefern denselben Zustandshash; die Anzeige hat darauf keinen
   * Einfluss.
   */
  const lauf = () => {
    const match = new MatchController({ seed: 3367130477, teams: 2, playersPerTeam: 1, turnDurationMs: 300 });
    match.start();
    let schutz = 0;
    while (match.status === 'playing' && schutz < 600) {
      const zustand = match.getState();
      if (zustand.activePlayerId !== null && zustand.turnElapsedMs < 20) {
        match.fire(zustand.activePlayerId, Math.PI / 4, 70);
      }
      match.step();
      match.consumeEvents();
      schutz += 1;
    }
    return { hash: hashState(match.getState()), tick: match.world.tickCount };
  };

  const eins = lauf();
  const zwei = lauf();
  assert.equal(eins.hash, zwei.hash, 'Gleicher Seed, gleiche Eingaben → gleicher Hash');
  assert.equal(eins.tick, zwei.tick);

  // Und mit einem anderen Seed ist es eine andere Karte — sonst prüfte der Test nichts.
  const andere = new MatchController({ seed: 3367130478, teams: 2, playersPerTeam: 1, turnDurationMs: 300 });
  andere.start();
  assert.notEqual(
    hashState(andere.getState()), eins.hash,
    'Ein anderer Seed muss eine andere Karte ergeben — sonst wäre der Seed wirkungslos',
  );
});
