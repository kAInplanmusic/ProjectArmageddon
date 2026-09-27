/**
 * Kleine Helfer für Server-Tests (HTTP + WebSocket gegen einen ECHTEN Server).
 *
 * Warum eine gemeinsame Datei: Die Prüfungen in `tests/server-*.test.js` fragen
 * alle dasselbe — „welche Nachricht kommt bei WEM an?". Eine dritte Kopie des
 * Testclients wäre die nächste Stelle, an der drei Fassungen auseinanderlaufen
 * (die Regel „eine Regel, eine Stelle" gilt auch für Prüfwerkzeug).
 *
 * Der Server läuft IMMER auf Port 0 (freier Port vom Betriebssystem) und wird
 * im `finally` geschlossen — ein Test, der einen festen Port belegt, fällt
 * beim Parallel- oder Wiederholungslauf um.
 *
 * @module tests/helfer/server-testclient
 */
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { GameServer } from '../../src/server/gameServer.js';
import { LobbyManager } from '../../src/server/lobby.js';
import { CONTROL, controlMessage, parseControlMessage, decodeSnapshot } from '../../src/shared/protocol.js';

export class TestClient {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.control = [];
    this.snapshots = [];
    /*
     * Das open/error-Promise wird SYNCHRON erzeugt. Wird der Zuhörer erst in
     * `open()` angehängt (nach einem await), kann das Ereignis schon gefeuert
     * sein und der Aufruf wartet für immer.
     */
    this.opened = new Promise((resolve, reject) => {
      this.socket.once('open', resolve);
      this.socket.once('error', reject);
    });
    this.socket.on('message', (raw, isBinary) => {
      if (isBinary) {
        const takt = decodeSnapshot(raw);
        if (takt) this.snapshots.push(takt);
        return;
      }
      const message = parseControlMessage(raw);
      if (message) this.control.push(message);
    });
  }

  open() {
    return this.opened;
  }

  send(type, payload = {}) {
    this.socket.send(controlMessage(type, payload));
    return this;
  }

  /** Schickt eine rohe Zeichenkette (für kaputte Nachrichten). */
  sendeRoh(text) {
    this.socket.send(text);
    return this;
  }

  /** Wartet auf eine Steuernachricht eines Typs; `null` nach Fristablauf. */
  async warte(type, timeoutMs = 4000) {
    const bis = Date.now() + timeoutMs;
    while (Date.now() < bis) {
      const index = this.control.findIndex(message => message.t === type);
      // Konsumieren: sonst liefert ein zweiter Aufruf dieselbe Nachricht.
      if (index >= 0) return this.control.splice(index, 1)[0];
      await new Promise(resolve => setTimeout(resolve, 15));
    }
    return null;
  }

  /**
   * Was in den nächsten `ms` ankommt — Steuernachrichten getrennt von Zuständen.
   *
   * Bewusst OHNE Filter „Anzeige-Ereignisse weglassen": Welche Ereignisarten
   * reine Anzeige sind, weiß das Prüfwerkzeug nicht besser als der Aufrufer —
   * eine solche Liste hier wäre eine zweite Wahrheit über den Ereigniskanal
   * (und liefe auseinander). Die Prüfungen filtern selbst und benennen dabei,
   * wonach sie suchen.
   */
  async ruhe(ms = 500) {
    const ab = this.control.length;
    const snaps = this.snapshots.length;
    await new Promise(resolve => setTimeout(resolve, ms));
    return {
      control: this.control.slice(ab),
      snapshots: this.snapshots.length - snaps,
    };
  }

  async warteAufSnapshot(timeoutMs = 6000) {
    const bis = Date.now() + timeoutMs;
    while (Date.now() < bis) {
      if (this.snapshots.length > 0) return this.snapshots[this.snapshots.length - 1];
      await new Promise(resolve => setTimeout(resolve, 15));
    }
    return null;
  }

  /**
   * Wartet auf einen Zustand, dessen Takt HÖHER ist als `nachTick`.
   *
   * Nötig, weil `warteAufSnapshot` sonst sofort den ALTEN Zustand aus der
   * Ablage zurückgibt: Ein Test, der „läuft die Simulation weiter?" fragt,
   * wäre damit auch dann grün, wenn nichts mehr käme.
   */
  async warteAufTakt(nachTick, timeoutMs = 6000) {
    const bis = Date.now() + timeoutMs;
    while (Date.now() < bis) {
      const letzter = this.snapshots[this.snapshots.length - 1];
      if (letzter && letzter.tick > nachTick) return letzter;
      await new Promise(resolve => setTimeout(resolve, 15));
    }
    return null;
  }

  close() {
    try { this.socket.close(); } catch { /* schon zu — egal */ }
  }
}

/**
 * Startet einen echten Server auf einem freien Port.
 *
 * `pruneIntervalMs` ist absichtlich groß, solange ein Test die Verwaltungsrunde
 * nicht ausdrücklich prüft: Sonst liefe sie in jeden anderen Test hinein und
 * wäre eine zweite Ursache für einen Zustandswechsel.
 */
export async function starteServer({
  lobbyManager = new LobbyManager(),
  pruneIntervalMs = 3_600_000,
  serveStatic = null,
  logger = null,
} = {}) {
  const server = new GameServer({ lobbyManager, pruneIntervalMs, serveStatic, logger });
  const info = await server.listen(0);
  return {
    server,
    lobbyManager,
    url: `http://127.0.0.1:${info.port}`,
    wsUrl: `ws://127.0.0.1:${info.port}/ws`,
  };
}

/** Legt eine Lobby über die HTTP-API an (Rückgabe: `{lobby, player}`). */
export async function erstelleLobby(url, body = {}) {
  const response = await fetch(`${url}/api/lobby/create`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ teams: 2, playersPerTeam: 1, seed: 4242, ...body }),
  });
  assert.equal(response.status, 201, 'Lobby konnte nicht angelegt werden');
  return response.json();
}

/** Verbindet einen Client und tritt der Lobby bei (Rückgabe: WELCOME-Nachricht). */
export async function trittBei(wsUrl, lobbyId, { name = 'Spieler', token = null } = {}) {
  const client = new TestClient(wsUrl);
  await client.open();
  client.send(CONTROL.JOIN_LOBBY, { lobbyId, name, ...(token ? { token } : {}) });
  const welcome = await client.warte(CONTROL.WELCOME);
  return { client, welcome };
}

/**
 * Sammel-Logger: nichts wird geschrieben, alles ist prüfbar.
 *
 * Die Alternative wäre, Log-Zeilen aus dem echten JSON-Log zu fischen — dann
 * hinge die Prüfung am Format des Loggers statt an der Sache.
 */
export function sammleLogger() {
  const zeilen = [];
  const bau = () => ({
    debug: (event, msg, felder) => zeilen.push({ level: 'debug', event, msg, felder }),
    info: (event, msg, felder) => zeilen.push({ level: 'info', event, msg, felder }),
    warn: (event, msg, felder) => zeilen.push({ level: 'warn', event, msg, felder }),
    error: (event, msg, felder) => zeilen.push({ level: 'error', event, msg, felder }),
    /*
     * `child()` muss DIESELBE Ablage benutzen.
     *
     * Der Server gibt der Sitzung `logger.child({lobbyId})`; ein Kind mit
     * eigener Liste hätte die Zeilen der Sitzung verschluckt — und die Prüfung
     * hätte nur zufällig die richtige Liste gesehen.
     */
    child: () => bau(),
    zeilen,
    finde: event => zeilen.filter(zeile => zeile.event === event),
  });
  return bau();
}

/**
 * Prüft EINE Server-Ablehnung auf die Eigenschaft, die zählt:
 * Der Client kann einen GRUND zeigen.
 *
 * Beide Feldnamen werden verlangt, weil der Client genau so liest
 * (`message.errors?.[0] ?? message.error`) und ältere Leser nur `error` kennen.
 * Siehe `GameServer#fehlerNutzlast`.
 */
export function assertLesbareAblehnung(nachricht, { wo }) {
  assert.ok(nachricht, `${wo}: es kam GAR KEINE Ablehnung an (stiller Abbruch)`);
  assert.equal(nachricht.t, CONTROL.ERROR, `${wo}: erwartet wurde eine Fehlernachricht`);
  assert.equal(typeof nachricht.error, 'string', `${wo}: \`error\` fehlt oder ist keine Zeichenkette`);
  assert.ok(nachricht.error.length > 0, `${wo}: \`error\` ist leer — der Client hätte nichts anzuzeigen`);
  assert.ok(Array.isArray(nachricht.errors), `${wo}: \`errors\` fehlt`);
  assert.equal(typeof nachricht.errors[0], 'string', `${wo}: \`errors[0]\` fehlt`);
  assert.ok(nachricht.errors[0].length > 0, `${wo}: \`errors[0]\` ist leer`);
  return nachricht.error;
}
