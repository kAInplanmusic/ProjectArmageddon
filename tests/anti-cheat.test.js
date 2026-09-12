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
import { WEAPONS } from '../src/shared/config/weapons.js';

/**
 * Anti-Cheat: Was der Server NICHT vom Client glaubt.
 *
 * Diese Datei prüft die Eigenschaft, auf der die ganze Serverautorität beruht:
 * Der Client darf behaupten, was er will — der Server entscheidet anhand des
 * TOKENS, welcher Spieler handelt.
 *
 * Warum das eigene Tests braucht: `tests/netcode.test.js` prüft
 * `validateCommand` in Isolation, also die Regel. Ob der Server sie auch
 * ANWENDET und ob er die Spielerkennung des Clients überhaupt benutzt, war
 * bisher nirgends festgehalten. Genau dort sitzt der teure Fehler — eine
 * korrekte Validierungsfunktion, die man mit einem Client-Wert aufruft, ist
 * wertlos.
 *
 * Geprüft wird gegen einen ECHTEN Server über echte WebSockets, nicht gegen
 * eine nachgebaute Attrappe: Eine Attrappe würde nur meine Annahmen bestätigen.
 */

/** Kleiner Testclient mit Warteschlangen — wie in server-integration.test.js. */
class TestClient {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.controls = [];
    this.snapshots = [];
    this.errors = [];
    // Das open/error-Promise wird SYNCHRON erzeugt: Wird der Listener erst nach
    // einem await angehängt, kann das Ereignis schon gefeuert sein.
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

  open() { return this.opened; }

  /** Sendet eine Steuernachricht ohne Protokollversion — für Fälschungen. */
  sendRaw(roh) { this.socket.send(roh); }

  send(type, payload = {}) { this.socket.send(controlMessage(type, payload)); }

  /** Wartet auf eine Steuernachricht eines Typs (konsumierend). */
  async waitFor(type, timeoutMs = 4000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const index = this.controls.findIndex(m => m.t === type);
      if (index >= 0) return this.controls.splice(index, 1)[0];
      await new Promise(r => setTimeout(r, 15));
    }
    throw new Error(`Keine ${type}-Nachricht innerhalb ${timeoutMs} ms`);
  }

  /** Alle Fehlermeldungen seit dem letzten Aufruf. */
  drainErrors() { return this.errors.splice(0, this.errors.length); }

  /** Zählt Fehlermeldungen für kurze Zeit. */
  async sammleFehler(ms = 600) {
    const ende = Date.now() + ms;
    while (Date.now() < ende) await new Promise(r => setTimeout(r, 30));
    return this.drainErrors();
  }

  close() { try { this.socket.close(); } catch { /* schon zu */ } }
}

async function starteServer() {
  const server = new GameServer();
  const info = await server.listen(0);
  return { server, ...info };
}

async function lobbyErzeugen(baseUrl, body = {}) {
  const antwort = await fetch(`${baseUrl}/api/lobby/create`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ teams: 2, playersPerTeam: 1, seed: 4242, ...body }),
  });
  assert.equal(antwort.status, 201);
  // Die Antwort ist verschachtelt: { lobby: { id, ... }, player: { token, ... } }.
  return antwort.json();
}

/**
 * Wartet auf den jüngsten Snapshot mit bekanntem Zugrecht.
 *
 * Ohne das würde ein Test auf einen Snapshot zugreifen, der noch von vor dem
 * Matchstart stammt (`activePlayerId === null`) — und dann über den falschen
 * Spieler reden.
 */
async function warteAufSnapshot(client, timeoutMs = 6000) {
  const ende = Date.now() + timeoutMs;
  while (Date.now() < ende) {
    const snap = client.snapshots[client.snapshots.length - 1];
    if (snap && snap.activePlayerId !== null) return snap;
    await new Promise(r => setTimeout(r, 25));
  }
  return client.snapshots[client.snapshots.length - 1] ?? null;
}

/** Zwei verbundene Spieler in einer Lobby. */
async function zweiSpieler(url, baseUrl) {
  const erzeugt = await lobbyErzeugen(baseUrl);
  const lobbyId = erzeugt.lobby.id;

  const a = new TestClient(url);
  await a.open();
  a.send(CONTROL.JOIN_LOBBY, { lobbyId, name: 'Anna', token: erzeugt.player?.token });
  const welcomeA = await a.waitFor(CONTROL.WELCOME);

  const b = new TestClient(url);
  await b.open();
  b.send(CONTROL.JOIN_LOBBY, { lobbyId, name: 'Bert' });
  const welcomeB = await b.waitFor(CONTROL.WELCOME);

  a.send(CONTROL.START_MATCH, {});
  // Kurz warten: Die Sitzung startet und die Figuren stehen.
  await new Promise(r => setTimeout(r, 500));

  return { lobbyId, a, b, entityA: welcomeA.entityId, entityB: welcomeB.entityId };
}

test('Der Client kann sich NICHT als der andere Spieler ausgeben', { timeout: 25_000 }, async () => {
  /*
   * DER wichtigste Anti-Cheat-Test. Der Client schickt in der INPUT-Nachricht
   * eine `playerId` mit — die des GEGNERS. Der Server muss sie ignorieren und
   * anhand des Tokens handeln.
   *
   * Wäre das nicht so, könnte jeder für jeden schießen: beliebig viele Schüsse,
   * aus der Ferne ausgelöst, ohne Zugzwang.
   */
  const { server, url } = await starteServer();
  try {
    const { a, b, entityA, entityB } = await zweiSpieler(url.replace('http', 'ws') + '/ws', url);

    // Wer ist am Zug?
    const snapshotA = await (async () => {
      const ende = Date.now() + 4000;
      while (Date.now() < ende) {
        const s = a.snapshots[a.snapshots.length - 1];
        if (s && s.activePlayerId !== null) return s;
        await new Promise(r => setTimeout(r, 25));
      }
      return null;
    })();
    assert.ok(snapshotA, 'Kein Snapshot mit aktivem Spieler');

    const aktiver = snapshotA.activePlayerId;
    const nichtAktiv = aktiver === entityA ? b : a;
    const nichtAktivId = aktiver === entityA ? entityB : entityA;

    nichtAktiv.drainErrors();

    /*
     * Angriff: Der nicht-aktive Client behauptet, der AKTIVE zu sein, und gibt
     * sich zusätzlich die Kennung des Gegners.
     */
    const ziel = aktiver === entityA ? entityA : entityB;
    for (const gefaelscht of [ziel, 0, 9999, -1, '1']) {
      nichtAktiv.sendRaw(JSON.stringify({
        t: CONTROL.INPUT,
        angle: 1.0,
        power: 70,
        playerId: gefaelscht,
        tick: snapshotA.tick,
      }));
    }

    const fehler = await nichtAktiv.sammleFehler(800);
    assert.ok(fehler.length >= 5,
      `Nur ${fehler.length} von 5 gefälschten Befehlen wurden abgelehnt`);

    // Und es darf sich NICHTS bewegt haben: Kein Projektil, kein Zugwechsel.
    const vorher = a.snapshots.length;
    await new Promise(r => setTimeout(r, 400));
    const danach = a.snapshots[a.snapshots.length - 1];
    assert.equal(danach.activePlayerId, aktiver,
      'Der Zug ist gewechselt — ein gefälschter Befehl wurde ausgeführt');
    assert.equal(danach.projectiles.length, 0, 'Ein Projektil entstand aus einem gefälschten Befehl');
    void vorher;
    void nichtAktivId;
  } finally {
    await server.close();
  }
});

test('Der Client kann keine Waffe benutzen, die er nicht hat', { timeout: 25_000 }, async () => {
  /*
   * Der Client schickt eine Waffenkennung mit. Der Server darf sie nur annehmen,
   * wenn sie im Inventar liegt UND Munition hat. Sonst könnte man die stärkste
   * Waffe des Katalogs im ersten Zug führen.
   */
  const { server, url } = await starteServer();
  try {
    const wsUrl = url.replace('http', 'ws') + '/ws';
    const { a, b, entityA } = await zweiSpieler(wsUrl, url);

    const snap = a.snapshots[a.snapshots.length - 1];
    const aktiver = snap.activePlayerId;
    const aktiv = aktiver === entityA ? a : b;

    // Eine gültige, aber sicher nicht besessene Waffe suchen.
    const besessen = new Set(a.controls
      .filter(m => m.t === CONTROL.LOADOUTS)
      .flatMap(m => Object.values(m.loadouts ?? {}))
      .flatMap(l => l?.inventory ?? []));
    const fremde = WEAPONS.find(w => !besessen.has(w.id));
    assert.ok(fremde, 'Keine nicht besessene Waffe gefunden');

    aktiv.drainErrors();
    aktiv.sendRaw(JSON.stringify({
      t: CONTROL.INPUT, angle: 1.0, power: 70, weaponId: fremde.id, tick: snap.tick,
    }));

    const fehler = await aktiv.sammleFehler(700);
    assert.ok(fehler.length >= 1,
      `Der Schuss mit der nicht besessenen Waffe „${fremde.id}“ wurde angenommen`);
    void aktiv;
  } finally {
    await server.close();
  }
});

test('Der Client kann keine Waffe auswählen, die er nicht hat', { timeout: 25_000 }, async () => {
  const { server, url } = await starteServer();
  try {
    const wsUrl = url.replace('http', 'ws') + '/ws';
    const { a, entityA } = await zweiSpieler(wsUrl, url);

    const fremde = WEAPONS[0].id;
    a.drainErrors();
    /*
     * Der Name ist `SELECT_WEAPON`, nicht `WEAPON_SELECT`. Mit dem falschen Namen
     * war `t` undefined, JSON ließ das Feld weg, und der Server antwortete
     * „Ungültige Nachricht" — die Prüfung sah so aus, als würde die Waffe
     * stillschweigend akzeptiert, obwohl die Nachricht nie ankam.
     */
    a.send(CONTROL.SELECT_WEAPON, { weaponId: fremde });

    const fehler = await a.sammleFehler(700);
    // Wichtig: Es gibt eine ANTWORT. Eine stille Ablehnung wäre im Betrieb nicht
    // von einem Fehler zu unterscheiden.
    const abgelehnt = fehler.some(m => (m.errors ?? []).some(e => /verfügbar/i.test(e)));
    assert.ok(abgelehnt,
      `Die Auswahl einer fremden Waffe wurde nicht mit Begründung abgelehnt: ${JSON.stringify(fehler)}`);
    void entityA;
  } finally {
    await server.close();
  }
});

test('Der Client kann nicht mit absurden Werten schießen', { timeout: 25_000 }, async () => {
  /*
   * Winkel und Kraft werden serverseitig begrenzt. Ohne das könnte man mit
   * Kraft 1e9 oder NaN schießen — NaN ist der gefährlichere Fall, weil es durch
   * Vergleiche rutscht (`NaN >= 0` ist false, aber `NaN * x` bleibt NaN und
   * verseucht Positionen).
   */
  const { server, url } = await starteServer();
  try {
    const wsUrl = url.replace('http', 'ws') + '/ws';
    const { a, b, entityA, entityB } = await zweiSpieler(wsUrl, url);

    const snap = a.snapshots[a.snapshots.length - 1];
    const aktiver = snap.activePlayerId;
    const aktiv = aktiver === entityA ? a : b;

    /*
     * Die Liste deckt zwei Arten ab:
     *  - Werte außerhalb der Grenzen (1e9, -5),
     *  - Werte, die KEINE Zahlen sind. Der zweite Fall war der eigentliche Fund:
     *    `normalizeInput` wandelte mit `Number(...)` um, und damit galt
     *    `Number(null) === 0`, `Number(true) === 1`, `Number([]) === 0`,
     *    `Number('1.5') === 1.5` — alle wurden akzeptiert.
     *
     * `Infinity` steht bewusst in der Liste: `JSON.stringify` macht daraus
     * `null`, und der Wert prüft damit genau den `null`-Fall auf dem echten Draht.
     */
    const angriffe = [
      { angle: 1e9, power: 70 },
      { angle: -5, power: 70 },
      { angle: 1, power: 1e9 },
      { angle: 1, power: -50 },
      { angle: 'NaN', power: 70 },
      { angle: 1, power: 'NaN' },
      { angle: '1.5', power: 70 },
      { angle: 1, power: '70' },
      { angle: null, power: 70 },
      { angle: 1, power: null },
      { angle: true, power: 70 },
      { angle: [], power: 70 },
      { angle: {}, power: 70 },
      { angle: Infinity, power: 70 },
    ];

    aktiv.drainErrors();
    for (const a1 of angriffe) {
      aktiv.sendRaw(JSON.stringify({ t: CONTROL.INPUT, ...a1, tick: snap.tick }));
    }

    const fehler = await aktiv.sammleFehler(1400);
    assert.ok(fehler.length >= angriffe.length,
      `Nur ${fehler.length} von ${angriffe.length} ungültigen Schüssen wurden abgelehnt: `
      + JSON.stringify(fehler.slice(0, 4)));

    // Und nichts darf entstanden sein.
    await new Promise(r => setTimeout(r, 300));
    const s = a.snapshots[a.snapshots.length - 1];
    assert.equal(s.projectiles.length, 0, 'Ein Projektil entstand aus einem ungültigen Wert');
    for (const p of s.entities) {
      assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y),
        `Position ist keine Zahl: x=${p.x} y=${p.y} — NaN hat die Simulation erreicht`);
    }
    void entityB;
  } finally {
    await server.close();
  }
});

test('Der Client kann keinen Tick aus der Vergangenheit einschleusen', { timeout: 25_000 }, async () => {
  /*
   * Die Lag-Kompensation erlaubt einen Tick innerhalb eines Fensters. Ein Client
   * könnte einen weit zurückliegenden Tick senden, um auf einem alten Zustand
   * zu schießen („ich war schon dran"). Der Server muss das begrenzen.
   */
  const { server, url } = await starteServer();
  try {
    const wsUrl = url.replace('http', 'ws') + '/ws';
    const { a, b, entityA, entityB } = await zweiSpieler(wsUrl, url);

    const snap = a.snapshots[a.snapshots.length - 1];
    const aktiver = snap.activePlayerId;
    const aktiv = aktiver === entityA ? a : b;

    aktiv.drainErrors();
    // Weit außerhalb des Fensters (maxTickDrift = 400 laut validation.js).
    for (const tick of [0, 1, snap.tick - 100_000, snap.tick + 100_000, -1]) {
      aktiv.sendRaw(JSON.stringify({ t: CONTROL.INPUT, angle: 1, power: 70, tick }));
    }

    const fehler = await aktiv.sammleFehler(900);
    assert.ok(fehler.length >= 5,
      `Nur ${fehler.length} von 5 Befehlen mit unzulässigem Tick wurden abgelehnt`);
    void entityB;
  } finally {
    await server.close();
  }
});

test('Kaputte und bösartige Nachrichten beenden den Server nicht', { timeout: 25_000 }, async () => {
  /*
   * Ein Server, den ein Client mit einer kaputten Nachricht aus dem Tritt
   * bringen kann, ist ein Verfügbarkeitsproblem — und ein Angriff, der keine
   * Kenntnis des Spiels braucht.
   *
   * Geprüft wird NICHT die Wiederherstellung (dafür gibt es den Neustart),
   * sondern dass der Server weiterarbeitet: Der Mitspieler muss weiterhin
   * Snapshots bekommen.
   */
  const { server, url } = await starteServer();
  try {
    const wsUrl = url.replace('http', 'ws') + '/ws';
    const { a, b } = await zweiSpieler(wsUrl, url);

    const boese = [
      'nicht json',
      '{}',
      'null',
      '[]',
      '"nur ein string"',
      JSON.stringify({ t: 42 }),
      JSON.stringify({ t: 'UNBEKANNTER_TYP' }),
      JSON.stringify({ t: CONTROL.INPUT }),
      JSON.stringify({ t: CONTROL.WEAPON_SELECT }),
      // Tief verschachtelt — ein Parser ohne Grenze kann daran ersticken.
      JSON.stringify({ t: CONTROL.INPUT, angle: 1, power: 1, extra: '['.repeat(200) }),
      '{"t":"INPUT","angle":1e400}',
    ];

    const vorherA = a.snapshots.length;
    for (const roh of boese) a.sendRaw(roh);

    await new Promise(r => setTimeout(r, 1200));

    // Der Mitspieler bekommt weiterhin Snapshots — der Server lebt.
    const nachherB = b.snapshots.length;
    assert.ok(nachherB > 0, 'Der Server sendet keine Snapshots mehr');
    await new Promise(r => setTimeout(r, 500));
    assert.ok(b.snapshots.length > nachherB,
      'Der Server hat nach den kaputten Nachrichten aufgehört zu senden');
    void vorherA;
  } finally {
    await server.close();
  }
});

test('Die Nutzlast ist begrenzt — eine Riesennachricht wird abgewiesen', { timeout: 25_000 }, async () => {
  /*
   * Fund (belegt): `INPUT_LIMITS.maxPayloadBytes` (512) ist definiert, wird aber
   * NIRGENDS verwendet (`grep -rn maxPayloadBytes src/` findet nur die
   * Definition). `parseControlMessage` ruft `JSON.parse` auf beliebig große
   * Eingaben auf. Die Grenze war also eine Absicht ohne Wirkung.
   *
   * Der Test hält fest, was gelten MUSS: Eine weit überhöhte Nutzlast wird
   * abgewiesen, ohne den Server zu belasten.
   */
  const { server, url } = await starteServer();
  try {
    const wsUrl = url.replace('http', 'ws') + '/ws';
    const { a, b } = await zweiSpieler(wsUrl, url);

    const riesig = JSON.stringify({
      t: CONTROL.INPUT,
      angle: 1,
      power: 70,
      // Rund 1 MB Füllsel.
      muell: 'x'.repeat(1024 * 1024),
    });
    assert.ok(riesig.length > 1_000_000);

    a.drainErrors();
    a.sendRaw(riesig);

    const fehler = await a.sammleFehler(1200);
    assert.ok(fehler.length >= 1,
      'Eine Nachricht mit 1 MB Nutzlast wurde nicht abgewiesen');

    // Der Server läuft weiter.
    const vorher = b.snapshots.length;
    await new Promise(r => setTimeout(r, 800));
    assert.ok(b.snapshots.length > vorher, 'Der Server sendet nach der Riesennachricht nicht mehr');
  } finally {
    await server.close();
  }
});

test('Ein Client kann nicht mehrfach im selben Zug schießen', { timeout: 30_000 }, async () => {
  /*
   * Ein Schuss beendet den Zug. Ein Client, der schnell mehrfach sendet, darf
   * nicht mehrfach schießen — sonst wäre die Zugordnung aufgehoben und ein
   * Angreifer könnte in einem Zug das ganze gegnerische Team ausschalten.
   *
   * ## Warum dieser Aufbau
   *
   * Der erste Anlauf sendete zehn Schüsse in einer Lobby mit EINEM verbundenen
   * Spieler. Das war kein gültiger Test: Der zweite Platz gehört einem BOT, der
   * sofort feuert und den Zug zurückgibt. Gemessen kamen so **5 von 10 Schüssen
   * durch** — nicht weil die Prüfung versagt, sondern weil das Spiel in der
   * Zwischenzeit wirklich wieder an der Reihe war. Der Test hätte eine korrekte
   * Zugordnung als Fehler gemeldet.
   *
   * Deshalb: Beide Plätze sind mit VERBUNDENEN Clients besetzt. Nach dem Schuss
   * von A ist B am Zug — und B tut nichts. Damit bleibt der Zug stehen, und
   * weitere Schüsse von A müssen abgelehnt werden.
   *
   * Die Zugzeit wird großzügig gesetzt, damit der Server den Zug nicht wegen
   * Zeitablauf weiterreicht.
   */
  const { server, url } = await starteServer();
  try {
    const wsUrl = url.replace('http', 'ws') + '/ws';
    const erzeugt = await lobbyErzeugen(url, { turnDurationMs: 600_000 });
    const lobbyId = erzeugt.lobby.id;

    const a = new TestClient(wsUrl);
    await a.open();
    a.send(CONTROL.JOIN_LOBBY, { lobbyId, name: 'Anna', token: erzeugt.player?.token });
    const welcomeA = await a.waitFor(CONTROL.WELCOME);

    const b = new TestClient(wsUrl);
    await b.open();
    b.send(CONTROL.JOIN_LOBBY, { lobbyId, name: 'Bert' });
    const welcomeB = await b.waitFor(CONTROL.WELCOME);

    a.send(CONTROL.START_MATCH, {});
    await new Promise(r => setTimeout(r, 700));

    const snap = await warteAufSnapshot(a);
    assert.ok(snap, 'Kein Snapshot');
    assert.equal(snap.activePlayerId, welcomeA.entityId,
      'Der erste Zug muss bei Spieler A liegen');

    // A feuert EINMAL — das ist der reguläre Zug.
    a.drainErrors();
    a.sendRaw(JSON.stringify({ t: CONTROL.INPUT, angle: 0.4, power: 70, tick: snap.tick }));
    await new Promise(r => setTimeout(r, 900));
    const nachErstem = await warteAufSnapshot(a);
    assert.equal(nachErstem.activePlayerId, welcomeB.entityId,
      'Nach dem Schuss muss der Zug bei Spieler B liegen — B ist verbunden und tut nichts');

    // Jetzt neun weitere Schüsse von A: Alle müssen abgelehnt werden.
    a.drainErrors();
    for (let i = 0; i < 9; i += 1) {
      a.sendRaw(JSON.stringify({
        t: CONTROL.INPUT, angle: 0.5 + i * 0.02, power: 70, tick: nachErstem.tick,
      }));
      await new Promise(r => setTimeout(r, 30));
    }

    const fehler = await a.sammleFehler(1200);
    assert.ok(fehler.length >= 9,
      `Nur ${fehler.length} von 9 Schüssen außerhalb des eigenen Zugs wurden abgelehnt`);
    const grund = fehler.map(m => (m.errors ?? []).join(' ')).join(' | ');
    assert.match(grund, /nicht am Zug/i,
      `Ablehnung aus dem falschen Grund: ${grund}`);

    // Und der Zug liegt weiterhin bei B.
    const danach = await warteAufSnapshot(a);
    assert.equal(danach.activePlayerId, welcomeB.entityId,
      'Der Zug wurde durch die zusätzlichen Schüsse weitergereicht');
    assert.ok(welcomeB.entityId > 0);
  } finally {
    await server.close();
  }
});
