/**
 * Regressionstest für gameServer #readBody: ungültiges JSON wird gemeldet,
 * leerer Body bleibt still (siehe W2 in docs/bgworker-todo-2026-10-02.json).
 *
 * Der Test nutzt die bestehenden Helfer (`starteServer`, `sammleLogger`) aus
 * `tests/helfer/server-testclient.js` — dieselbe Infrastruktur wie
 * `tests/server-ablehnungen.test.js`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  starteServer, sammleLogger,
} from './helfer/server-testclient.js';

test('POST /api/lobby/create mit leerem Body: still, 201, Standardwerte', async () => {
  const logger = sammleLogger();
  const { server, url } = await starteServer({ logger });
  try {
    const antwort = await fetch(`${url}/api/lobby/create`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '', // KEIN Body — legitim
    });
    assert.equal(antwort.status, 201, 'Ein leerer Body darf kein Fehler sein');
    const { lobby } = await antwort.json();
    assert.equal(lobby.teams, 2, 'Standardwert teams=2');

    // Leerer Body darf KEINE Log-Zeile erzeugen.
    const fehler = logger.finde('http_body_invalid');
    assert.equal(fehler.length, 0, 'Ein leerer Body darf nicht protokolliert werden');
  } finally {
    await server.close();
  }
});

test('POST /api/lobby/create mit ungültigem JSON: Fehler im Log', async () => {
  const logger = sammleLogger();
  const { server, url } = await starteServer({ logger });
  try {
    const antwort = await fetch(`${url}/api/lobby/create`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{kaputt', // ungültiges JSON
    });
    // Die Antwort bleibt 201 (Standardwerte), aber der Fehler ist gemeldet.
    assert.equal(antwort.status, 201, 'ungültiger Body führt nicht zu einem 500');

    // Der entscheidende Teil: der Fehler darf NICHT still verschwinden.
    const fehler = logger.finde('http_body_invalid');
    assert.equal(fehler.length, 1, 'Ungültiges JSON muss protokolliert werden');
    assert.match(fehler[0].msg, /Ungültiger JSON/);
    assert.equal(fehler[0].felder.method, 'POST');
    assert.equal(fehler[0].felder.path, '/api/lobby/create');
    assert.ok(fehler[0].felder.error.length > 0, 'Fehlermeldung des Parsers muss dabei sein');
  } finally {
    await server.close();
  }
});
