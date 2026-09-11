import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createLogger,
  createCaptureLogger,
  serialize,
  LOG_LEVELS,
} from '../src/server/logger.js';

/**
 * Strukturierte Logs.
 *
 * Zweck der Übung: Logs sollen auswertbar sein. Dafür muss jede Zeile gültiges
 * JSON mit festem Schema sein, ein Datensatz muss eine Zeile bleiben, und
 * Geheimnisse dürfen nicht in Logdateien landen. Alle drei Eigenschaften sind
 * hier festgehalten — die dritte, weil sie am leichtesten verloren geht und am
 * teuersten ist.
 */

const FESTE_ZEIT = () => new Date('2026-09-11T12:00:00.000Z');

test('Jede Zeile ist gültiges JSON mit festem Schema', () => {
  const { logger, zeilen, datensaetze } = createCaptureLogger({ jetzt: FESTE_ZEIT });

  logger.info('lobby_join', 'Spieler tritt bei', { lobbyId: 'abc', seats: 2 });

  assert.equal(zeilen.length, 1);
  const satz = datensaetze()[0];
  assert.deepEqual(Object.keys(satz).sort(), ['event', 'level', 'lobbyId', 'msg', 'seats', 'ts']);
  assert.equal(satz.ts, '2026-09-11T12:00:00.000Z');
  assert.equal(satz.level, 'info');
  assert.equal(satz.event, 'lobby_join');
  assert.equal(satz.msg, 'Spieler tritt bei');
  assert.equal(satz.lobbyId, 'abc');
  assert.equal(satz.seats, 2);
});

test('Ein Datensatz bleibt EINE Zeile — auch mit Stacktrace', () => {
  /*
   * Log-Sammler (journald, Docker, Loki) trennen am Zeilenumbruch. Ein
   * mehrzeiliger Stacktrace würde einen Datensatz in zwanzig zerlegen und die
   * Auswertung unmöglich machen.
   */
  const { logger, zeilen, datensaetze } = createCaptureLogger({ jetzt: FESTE_ZEIT });
  const fehler = new Error('erste Zeile\nzweite Zeile');
  fehler.stack = 'Error: kaputt\n    at eineFunktion (datei.js:1:1)\n    at andere (datei.js:2:2)';

  logger.error('ws_command_failed', 'Kommando fehlgeschlagen', { error: fehler });

  assert.equal(zeilen.length, 1, 'Die Ausgabe enthält mehr als eine Zeile');
  assert.ok(!zeilen[0].includes('\n'), 'Die Zeile enthält einen Umbruch');
  const satz = datensaetze()[0];
  assert.equal(satz.error.name, 'Error');
  assert.equal(satz.error.message, 'erste Zeile\\nzweite Zeile');
  assert.ok(satz.error.stack.includes('at eineFunktion'));
});

test('Die Stufen filtern, und nur die Stufen werden unterstützt', () => {
  assert.deepEqual(LOG_LEVELS, ['debug', 'info', 'warn', 'error']);

  const still = createCaptureLogger({ level: 'warn', jetzt: FESTE_ZEIT });
  still.logger.debug('a', 'zu fein');
  still.logger.info('b', 'zu fein');
  still.logger.warn('c', 'sichtbar');
  still.logger.error('d', 'sichtbar');
  assert.deepEqual(still.datensaetze().map(s => s.event), ['c', 'd']);

  const laut = createCaptureLogger({ level: 'debug', jetzt: FESTE_ZEIT });
  for (const stufe of LOG_LEVELS) laut.logger[stufe](stufe, 'meldung');
  assert.deepEqual(laut.datensaetze().map(s => s.level), LOG_LEVELS);
});

test('Geheimnisse werden redigiert', () => {
  /*
   * Der wichtigste Test dieser Datei. Logdateien werden aufbewahrt und
   * weitergereicht; ein Token darin ist ein dauerhaftes Leck. Der Logger
   * redigiert deshalb nach FELDNAMEN — der naheliegende Fall, dass jemand
   * `token` mitprotokolliert, ist damit abgedeckt.
   */
  const { logger, datensaetze, zeilen } = createCaptureLogger({ jetzt: FESTE_ZEIT });
  const FAKE_TOKEN = 'a1b2c3d4e5f6';

  logger.info('join', 'beitritt', {
    token: FAKE_TOKEN,
    playerToken: FAKE_TOKEN,
    apiKey: FAKE_TOKEN,
    authorization: `Bearer ${FAKE_TOKEN}`,
    password: 'geheim',
    secret: 'geheim',
    credential: 'geheim',
    cookie: 'geheim',
    lobbyId: 'sichtbar',
  });

  const satz = datensaetze()[0];
  // Der Wert selbst darf nirgends auftauchen — auch nicht gekürzt.
  assert.ok(!zeilen[0].includes(FAKE_TOKEN), 'Ein Token steht im Log');
  assert.ok(!zeilen[0].includes('geheim'), 'Ein Geheimnis steht im Log');

  // Die Länge bleibt erkennbar, damit man sieht, DASS etwas da war.
  assert.equal(satz.token, `[redigiert:${FAKE_TOKEN.length}]`);
  assert.equal(satz.apiKey, `[redigiert:${FAKE_TOKEN.length}]`);
  assert.equal(satz.password, '[redigiert:6]');
  // Unverdächtige Felder bleiben lesbar.
  assert.equal(satz.lobbyId, 'sichtbar');
});

test('Geheimnisse werden auch in verschachtelten Feldern redigiert', () => {
  const { logger, datensaetze, zeilen } = createCaptureLogger({ jetzt: FESTE_ZEIT });
  const GEHEIM = 'streng-geheim-123';

  logger.info('verschachtelt', 'test', {
    verbindung: { token: GEHEIM, host: 'lokal' },
    liste: [{ apiKey: GEHEIM }, { name: 'harmlos' }],
  });

  assert.ok(!zeilen[0].includes(GEHEIM), 'Ein Geheimnis im Unterobjekt steht im Log');
  const satz = datensaetze()[0];
  assert.equal(satz.verbindung.token, `[redigiert:${GEHEIM.length}]`);
  assert.equal(satz.verbindung.host, 'lokal');
  assert.equal(satz.liste[0].apiKey, `[redigiert:${GEHEIM.length}]`);
  assert.equal(satz.liste[1].name, 'harmlos');
});

test('Ein Kind-Logger trägt seine Felder in jeder Zeile', () => {
  // Damit jede Zeile einer Sitzung die Lobby-ID trägt, ohne sie zu wiederholen.
  const { logger, datensaetze } = createCaptureLogger({ jetzt: FESTE_ZEIT });
  const sitzung = logger.child({ lobbyId: 'L1' });

  sitzung.info('a', 'erste');
  sitzung.warn('b', 'zweite', { extra: 1 });

  const [erste, zweite] = datensaetze();
  assert.equal(erste.lobbyId, 'L1');
  assert.equal(zweite.lobbyId, 'L1');
  assert.equal(zweite.extra, 1);

  // Der Eltern-Logger bleibt unberührt.
  logger.info('c', 'dritte');
  assert.equal(datensaetze()[2].lobbyId, undefined);
});

test('Lange Werte werden gekürzt, damit eine Zeile nicht unbegrenzt wächst', () => {
  const { logger, datensaetze } = createCaptureLogger({ jetzt: FESTE_ZEIT });
  const lang = 'x'.repeat(5000);
  logger.info('gross', 'test', { text: lang });

  const satz = datensaetze()[0];
  assert.ok(satz.text.length < 600, `Wert nicht gekürzt: ${satz.text.length}`);
  assert.ok(satz.text.endsWith('[5000]'), 'Die Originallänge fehlt');
});

test('Schemafelder lassen sich nicht überschreiben', () => {
  /*
   * Wenn ein Aufrufer `level` oder `ts` mitgibt, darf das den Datensatz nicht
   * verfälschen — sonst könnte eine Auswertung nach Stufe falsch zählen.
   */
  const { logger, datensaetze } = createCaptureLogger({ jetzt: FESTE_ZEIT });
  logger.info('echtes_event', 'echte Meldung', { level: 'error', event: 'gefälscht', msg: 'nein' });

  const satz = datensaetze()[0];
  assert.equal(satz.level, 'info', 'Die Stufe wurde überschrieben');
  assert.equal(satz.event, 'echtes_event', 'Das Ereignis wurde überschrieben');
  assert.equal(satz.msg, 'echte Meldung');
  // Die Versuche landen umbenannt daneben, gehen also nicht verloren.
  assert.equal(satz.feld_level, 'error');
  assert.equal(satz.feld_event, 'gefälscht');
});

test('serialize ist ohne console prüfbar', () => {
  // Damit ein Test das Schema prüfen kann, ohne Ausgaben abzufangen.
  const zeile = serialize('warn', 'e', 'm', { a: 1 }, FESTE_ZEIT);
  assert.equal(typeof zeile, 'string');
  assert.ok(!zeile.includes('\n'));
  assert.deepEqual(JSON.parse(zeile), {
    ts: '2026-09-11T12:00:00.000Z', level: 'warn', event: 'e', msg: 'm', a: 1,
  });
});

test('Der Standardlogger schreibt JSON, „pretty" nur auf Wunsch', () => {
  const gesammelt = [];
  const json = createLogger({ senke: z => gesammelt.push(z), jetzt: FESTE_ZEIT });
  json.info('e', 'meldung', { a: 1 });
  assert.doesNotThrow(() => JSON.parse(gesammelt[0]), 'Standard ist nicht JSON');

  const menschen = createLogger({
    format: 'pretty', senke: z => gesammelt.push(z), jetzt: FESTE_ZEIT,
  });
  menschen.info('e', 'meldung');
  assert.ok(menschen.format === 'pretty');
  assert.ok(gesammelt[1].includes('meldung'));
});

test('Signalfelder werden nicht redigiert, obwohl ihr Name verdächtig ist', () => {
  /*
   * Fund (belegt): Der Namensfilter ist bewusst grob, damit ein unachtsam
   * benanntes Feld geschützt ist. Dadurch traf er aber auch Signalfelder wie
   * `hasToken` und ersetzte ein harmloses `false` durch `[redigiert:5]`. Das
   * macht Diagnosen kaputt, ohne etwas zu schützen: Ein Wahrheitswert oder eine
   * Zahl kann kein Geheimnis tragen.
   */
  const { logger, datensaetze } = createCaptureLogger({ jetzt: FESTE_ZEIT });
  logger.info('join', 'beitritt', {
    hasToken: false,
    tokenCount: 0,
    tokenLength: 32,
    token: 'echtes-geheimnis',
  });

  const satz = datensaetze()[0];
  assert.equal(satz.hasToken, false, 'Ein Wahrheitswert wurde redigiert');
  assert.equal(satz.tokenCount, 0);
  assert.equal(satz.tokenLength, 32);
  // Die Zeichenkette bleibt geschützt.
  assert.equal(satz.token, '[redigiert:16]');
});

// --------------------------------------------------- Integration in den Server

/**
 * Erzeugt einen Server mit Sammel-Logger und legt eine Lobby an.
 * Gibt alles zurück, was die Tests brauchen.
 */
async function serverMitLobby({ logger, persistence = null, lobby = {} } = {}) {
  const { GameServer } = await import('../src/server/gameServer.js');
  const server = new GameServer({ logger, persistence });
  const info = await server.listen(0);
  const antwort = await fetch(`http://127.0.0.1:${info.port}/api/lobby/create`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ teams: 2, playersPerTeam: 1, seed: 99, ...lobby }),
  });
  assert.equal(antwort.status, 201, `Lobby konnte nicht angelegt werden: ${antwort.status}`);
  const { lobby: erstellt } = await antwort.json();
  return { server, port: info.port, lobby: erstellt };
}

/** Tötet alle Figuren eines Teams — so endet das Match sofort und deterministisch. */
function teamToeten(session, teamId) {
  const zustand = session.match.getState();
  const figuren = zustand.entities.filter(e => e.teamId === teamId && e.alive);
  assert.ok(figuren.length > 0, `Keine Figuren in Team ${teamId}`);
  for (const figur of figuren) {
    session.match.world.getSystem('damage').applyDamage(session.match.world, figur.entityId, 10_000, null);
  }
  return figuren.length;
}

/**
 * Tritt einer Lobby über WebSocket bei.
 *
 * Nötig, weil die Sitzung nicht beim Anlegen der Lobby entsteht, sondern beim
 * ersten Beitritt — ohne Beitritt gibt es kein Match und keinen Zeitgeber.
 */
async function beitreten(port, lobbyId, { name = 'Prüfer' } = {}) {
  const { WebSocket } = await import('ws');
  const { CONTROL, controlMessage } = await import('../src/shared/protocol.js');
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  await new Promise((fertig, fehler) => {
    socket.once('open', fertig);
    socket.once('error', fehler);
  });
  socket.send(controlMessage(CONTROL.JOIN_LOBBY, { lobbyId, name }));
  // Auf den Startzustand warten, damit der Beitritt serverseitig durch ist.
  await new Promise((fertig, fehler) => {
    const frist = setTimeout(() => fehler(new Error('Kein Lobby-Zustand nach dem Beitritt')), 4000);
    socket.on('message', (raw, isBinary) => {
      if (isBinary) return;
      const nachricht = JSON.parse(raw.toString());
      if (nachricht.t === CONTROL.LOBBY_STATE) {
        clearTimeout(frist);
        fertig();
      }
    });
  });
  return socket;
}

test('Der Server protokolliert strukturiert und meldet das Match-Ende EINMAL', async () => {
  /*
   * Fund (belegt): `tick()` (Zeile 203) und `stepSimulation()` (Zeile 218) rufen
   * beide `#finish()` auf. Da `tick()` den Simulationsschritt aufruft, trafen im
   * selben Durchgang beide zu — das Match-Ende wurde doppelt gemeldet: doppeltes
   * `match_over` an die Clients, zweimal `onEmpty`, zweimal der Lobby-Status.
   *
   * Aufgefallen ist das erst durch das strukturierte Log. Als Freitextzeile sah
   * eine Verdopplung nach Rauschen aus; als JSON-Datensatz mit gleicher Lobby-ID
   * ist sie offensichtlich — genau dafür sind auswertbare Logs da.
   *
   * Der Test geht den Doppelpfad bewusst: `tick()` ruft intern `stepSimulation`
   * auf, beide Stellen prüfen danach auf `gameover`.
   */
  const aufzeichnung = createCaptureLogger({ level: 'info' });
  const { server, port, lobby } = await serverMitLobby({ logger: aufzeichnung.logger });

  try {
    // Die Sitzung entsteht erst beim Beitritt.
    const socket = await beitreten(port, lobby.id);
    const session = server.getSession(lobby.id);
    assert.ok(session, 'Sitzung muss nach dem Beitritt existieren');
    session.stop(); // Zeitgeber aus, wir treiben die Simulation von Hand

    teamToeten(session, 0);
    /*
     * Erst ein Simulationsschritt (entscheidet das Match und meldet das Ende
     * über `stepSimulation`, Zeile 218), dann `tick()` — dessen Zeile 203 prüft
     * erneut auf `gameover` und meldete früher ein ZWEITES Mal.
     */
    session.stepSimulation(1);
    session.tick();

    assert.equal(session.match.status, 'gameover', 'Match muss entschieden sein');

    const saetze = aufzeichnung.datensaetze();
    const enden = saetze.filter(s => s.event === 'match_over');
    assert.equal(enden.length, 1,
      `Das Match-Ende wurde ${enden.length}× gemeldet (erwartet: 1)`);
    assert.equal(enden[0].lobbyId, lobby.id);
    assert.equal(enden[0].winnerTeamId, session.match.winnerTeamId);
    assert.equal(enden[0].reason, 'ausscheidung');

    // Und jede Zeile hält das Schema ein.
    for (const satz of saetze) {
      assert.equal(typeof satz.ts, 'string');
      assert.ok(LOG_LEVELS.includes(satz.level), `Unbekannte Stufe: ${satz.level}`);
      assert.equal(typeof satz.event, 'string');
      assert.equal(typeof satz.msg, 'string');
      assert.ok(!satz.msg.includes('\n'), 'Eine Meldung enthält einen Zeilenumbruch');
    }
    assert.ok(saetze.some(s => s.event === 'server_listening'));
    assert.ok(saetze.some(s => s.event === 'lobby_created'));
    assert.ok(saetze.some(s => s.event === 'lobby_join'));
    socket.close();
  } finally {
    await server.close();
  }
});

test('Der Server schreibt keine Geheimnisse ins Log', async () => {
  /*
   * Der Token reist beim Beitritt mit. Er darf nicht in der Logdatei landen —
   * Logdateien werden aufbewahrt und weitergereicht, ein Token darin ist ein
   * dauerhaftes Leck.
   */
  const aufzeichnung = createCaptureLogger({ level: 'debug' });
  const { server, port, lobby } = await serverMitLobby({ logger: aufzeichnung.logger });

  try {
    // Über WebSocket beitreten, damit ein Token entsteht und protokolliert wird.
    const socket = await beitreten(port, lobby.id);
    socket.close();

    const alle = aufzeichnung.zeilen.join('\n');
    // Jeder vergebene Token darf nirgends auftauchen.
    const tokens = server.lobbyManager.get(lobby.id).seats.map(s => s.token).filter(Boolean);
    assert.ok(tokens.length > 0, 'Es muss mindestens einen Token geben');
    for (const token of tokens) {
      assert.ok(!alle.includes(token), `Ein Token (${token.length} Zeichen) steht im Log`);
    }

    // Und die Zeilen sind trotzdem auswertbar.
    const beitritte = aufzeichnung.datensaetze().filter(s => s.event === 'lobby_join');
    assert.ok(beitritte.length >= 1, 'Der Beitritt muss protokolliert werden');
    // Nur DASS ein Token kam, nicht welcher.
    assert.equal(typeof beitritte[0].hasToken, 'boolean');
    assert.equal(beitritte[0].lobbyId, lobby.id);
  } finally {
    await server.close();
  }
});

test('Eine entschiedene Lobby wird weder gespeichert noch gelistet', async () => {
  /*
   * Fund (belegt): Gespeichert wurde jede Lobby, auch die entschiedene. In der
   * Entwicklungsdatei standen 258 Lobbys, alle „finished"; jeder Serverstart
   * baute sie alle neu auf — mit Geländegenerierung und erneutem Anwenden der
   * Eingaben —, nur um sie sofort wieder zu beenden. In der Auswahlliste
   * verdeckten sie außerdem die spielbaren Einträge.
   *
   * Geprüft wird die ganze Kette: nicht speichern, nicht wiederherstellen,
   * nicht listen.
   */
  const { PersistenceStore } = await import('../src/server/persistence.js');
  const { LOBBY_STATUS } = await import('../src/server/lobby.js');
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');

  const ordner = mkdtempSync(join(tmpdir(), 'pa-finished-'));
  try {
    const aufzeichnung = createCaptureLogger({ level: 'info' });
    const { server, port, lobby } = await serverMitLobby({
      logger: aufzeichnung.logger,
      persistence: new PersistenceStore({ path: join(ordner, 'lobbies.json') }),
    });

    const socket = await beitreten(port, lobby.id);
    const session = server.getSession(lobby.id);
    session.stop();
    teamToeten(session, 0);
    // Erst entscheiden lassen, dann über `tick()` den zweiten Meldepfad anlaufen.
    session.stepSimulation(1);
    session.tick();
    assert.equal(server.lobbyManager.get(lobby.id).status, LOBBY_STATUS.FINISHED);

    // 1) Nicht gespeichert.
    server.saveState();
    const gespeichert = server.persistence.load();
    assert.equal(gespeichert.lobbies.filter(e => e.id === lobby.id).length, 0,
      'Die entschiedene Lobby wurde gespeichert');

    // 2) Nicht gelistet — aber auf Wunsch auffindbar.
    const liste = await (await fetch(`http://127.0.0.1:${port}/api/lobby`)).json();
    assert.equal(liste.lobbies.filter(l => l.id === lobby.id).length, 0,
      'Die entschiedene Lobby steht in der Auswahlliste');
    assert.equal(server.lobbyManager.list({ mitBeendeten: true }).length, 1,
      'Mit `mitBeendeten` muss sie auffindbar bleiben');
    assert.equal(server.lobbyManager.list().length, 0);

    socket.close();
    await server.close();

    // 3) Nicht wiederhergestellt — die Datei war ohnehin leer.
    const zweite = new (await import('../src/server/gameServer.js')).GameServer({
      logger: aufzeichnung.logger,
      persistence: new PersistenceStore({ path: join(ordner, 'lobbies.json') }),
    });
    const wieder = zweite.restoreState();
    assert.equal(wieder.restored, 0, 'Eine entschiedene Lobby wurde wiederhergestellt');
    assert.equal(zweite.getSession(lobby.id), null, 'Es wurde eine Sitzung gebaut');
    assert.equal(zweite.sessionCount, 0);
    await zweite.close();
  } finally {
    rmSync(ordner, { recursive: true, force: true });
  }
});

test('Rückwärtsverträglich: entschiedene Lobbys in einer alten Datei werden übersprungen', async () => {
  /*
   * Die Korrektur in `snapshotState` verhindert NEUE Einträge. Bereits
   * geschriebene Dateien enthalten sie aber — und eine Sicherung, die den Start
   * mit hunderten fertigen Matches belastet, darf nicht stehen bleiben. Solche
   * Einträge werden übersprungen, gezählt und beim nächsten Speichern entfernt.
   */
  const { GameServer } = await import('../src/server/gameServer.js');
  const { PersistenceStore } = await import('../src/server/persistence.js');
  const { mkdtempSync, rmSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');

  const ordner = mkdtempSync(join(tmpdir(), 'pa-alt-'));
  const pfad = join(ordner, 'lobbies.json');
  try {
    const basis = { teams: 2, playersPerTeam: 1, preset: 'hills', seats: [] };
    writeFileSync(pfad, JSON.stringify({
      version: 1,
      lobbies: [
        { ...basis, id: 'aaa', seed: 1, status: 'finished' },
        { ...basis, id: 'bbb', seed: 2, status: 'finished' },
        { ...basis, id: 'ccc', seed: 3, status: 'open' },
      ],
    }), 'utf8');

    const aufzeichnung = createCaptureLogger({ level: 'info' });
    const server = new GameServer({
      logger: aufzeichnung.logger,
      persistence: new PersistenceStore({ path: pfad }),
    });

    const ergebnis = server.restoreState();
    assert.equal(ergebnis.restored, 1, 'Nur die offene Lobby darf wiederhergestellt werden');
    assert.equal(ergebnis.skippedFinished, 2, 'Die entschiedenen Lobbys wurden nicht gezählt');

    const hinweis = aufzeichnung.datensaetze().find(s => s.event === 'lobby_restore_skipped_finished');
    assert.ok(hinweis, 'Das Überspringen muss protokolliert werden');
    assert.equal(hinweis.count, 2);

    // Nach dem Speichern ist die Datei bereinigt — die Altlast räumt sich selbst.
    server.saveState();
    const bereinigt = server.persistence.load();
    assert.deepEqual(bereinigt.lobbies.map(e => e.id), ['ccc'],
      'Die entschiedenen Lobbys stehen noch in der Datei');

    await server.close();
  } finally {
    rmSync(ordner, { recursive: true, force: true });
  }
});
