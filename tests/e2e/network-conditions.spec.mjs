import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { MESSAGE_TYPE } from '../../src/shared/protocol.js';

/**
 * Verbindung unter erschwerten Bedingungen: Latenz und Paketverlust.
 *
 * ## Was hier wirklich geprüft wird
 *
 * Der Datenstrom läuft über WebSocket, also über TCP. **Echten Paketverlust
 * gibt es dort nicht** — TCP wiederholt verlorene Segmente. Ein Test, der
 * Pakete verwirft, bildet deshalb keinen Produktionsfall ab. Was er abbildet und
 * belegt, ist die **Wiederherstellung**: Der Server sendet alle zwei Sekunden
 * einen Vollsnapshot (`FULL_SNAPSHOT_INTERVAL`), und genau der holt einen Client
 * zurück, dessen Zustand unbrauchbar geworden ist.
 *
 * Diese Wiederherstellung ist nicht theoretisch. Sie greift bei:
 *  - einem Aussetzer, in dem der Client keine Snapshots bekommt,
 *  - einem Reconnect mit neuem Platz,
 *  - einem Serverneustart, der den Zustand aus dem Replay-Kern rekonstruiert.
 *
 * Ohne den Vollsnapshot würde das Delta-Encoding den Client dauerhaft mit einem
 * veralteten Bezug weiterrechnen lassen — falsche Positionen, falsches Leben,
 * ohne dass es auffiele. Der Test prüft also nicht „hält TCP?", sondern
 * „repariert sich der Client selbst?".
 *
 * ## Wie gestört wird
 *
 * `page.routeWebSocket('/ws')` hängt sich zwischen Seite und Server. Vom Server
 * zur Seite werden Nachrichten wahlweise verzögert oder verworfen; die
 * Gegenrichtung bleibt unangetastet.
 *
 * Jede Störung zählt mit. Die Tests prüfen ausdrücklich, dass die Störung
 * **gewirkt hat** — ein Verlusttest, der nichts verworfen hat, wäre grün, ohne
 * etwas zu beweisen.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');
// Eigener Port: `multiplayer.spec.mjs` belegt 3210.
const SERVER_PORT = 3211;
const SERVER_URL = `http://127.0.0.1:${SERVER_PORT}`;

let serverProcess = null;
let serverLog = '';

test.beforeAll(async () => {
  serverProcess = spawn(process.execPath, ['scripts/server.mjs'], {
    cwd: repoRoot,
    env: { ...process.env, PORT: String(SERVER_PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverProcess.stdout.on('data', chunk => { serverLog += chunk.toString(); });
  serverProcess.stderr.on('data', chunk => { serverLog += chunk.toString(); });

  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${SERVER_URL}/healthz`);
      if (response.ok) return;
    } catch {
      // Server startet noch.
    }
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error(`Server wurde nicht rechtzeitig bereit.\nLog:\n${serverLog}`);
});

test.afterAll(async () => {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    await new Promise(r => setTimeout(r, 300));
    serverProcess = null;
  }
});

// ------------------------------------------------------------ Störer

/** Ist das ein Snapshot? Binärrahmen mit Nachrichtentyp 1. */
function istSnapshot(message) {
  return Buffer.isBuffer(message)
    && message.length >= 4
    && message[3] === MESSAGE_TYPE.SNAPSHOT;
}

/**
 * Legt eine Störung auf den WebSocket der Seite.
 *
 * @param {object} page
 * @param {object} optionen
 * @param {number} [optionen.delayMs] - Verzögerung JE Nachricht (konstant).
 *   Konstante Verzögerung erhält die Reihenfolge: Alle Nachrichten werden um
 *   denselben Betrag später ausgeliefert, die Ordnung bleibt also dieselbe.
 *   Bewusst NICHT über eine Warteschlange: Bei 20 Snapshots/s und 120 ms
 *   Verzögerung wäre die Bedienrate (8,3/s) kleiner als die Ankunftsrate, die
 *   Warteschlange würde endlos wachsen. `setTimeout` je Nachricht hält die Rate.
 * @param {number} [optionen.dropJedenNtenSnapshot] - Jeder n-te Snapshot wird
 *   verworfen. Steuerungsnachrichten bleiben unangetastet — sonst käme der
 *   Handshake nicht zustande und der Test würde nichts prüfen.
 * @param {object} [optionen.steuerung] - Objekt mit Schaltern, das der Test
 *   zur Laufzeit ändern kann (z. B. `{ blackout: true }`).
 * @returns {Promise<object>} Zähler der Störung
 */
async function stoerungLegen(page, {
  delayMs = 0,
  dropJedenNtenSnapshot = 0,
  steuerung = {},
  nurSnapshotsVerzoegern = false,
} = {}) {
  const zaehler = {
    vomServer: 0,
    weitergereicht: 0,
    verworfen: 0,
    verzoegert: 0,
    snapshots: 0,
  };

  /*
   * Muster als PRÄDIKAT, nicht als Zeichenkette: Ein String wird als Glob gegen
   * die VOLLE URL geprüft, und `'/ws'` passt nicht auf
   * `ws://127.0.0.1:3211/ws`. Mit einem String lief die Verbindung deshalb
   * ungefiltert durch, und alle Zähler blieben 0 — die Tests wären grün
   * geworden, ohne irgendetwas zu stören.
   */
  await page.routeWebSocket(url => url.pathname === '/ws', ws => {
    const server = ws.connectToServer();

    // Gegenrichtung (Seite → Server) bleibt unverändert: kein `onMessage`,
    // damit Playwright weiterleitet.
    server.onMessage(message => {
      zaehler.vomServer += 1;
      const snapshot = istSnapshot(message);
      if (snapshot) zaehler.snapshots += 1;

      if (steuerung.blackout) {
        zaehler.verworfen += 1;
        return;
      }

      if (dropJedenNtenSnapshot > 0 && snapshot) {
        // Genau jeder n-te Snapshot fällt aus. Steuerung läuft durch.
        if (zaehler.snapshots % dropJedenNtenSnapshot === 0) {
          zaehler.verworfen += 1;
          return;
        }
      }

      const verzoegern = delayMs > 0 && (nurSnapshotsVerzoegern ? snapshot : true);
      if (verzoegern) {
        zaehler.verzoegert += 1;
        setTimeout(() => {
          zaehler.weitergereicht += 1;
          try {
            ws.send(message);
          } catch {
            // Verbindung kann inzwischen zu sein — kein Grund, den Test zu werfen.
          }
        }, delayMs);
        return;
      }

      zaehler.weitergereicht += 1;
      ws.send(message);
    });
  });

  return zaehler;
}

/** Verbindet einen Client und wartet auf die stehende Verbindung. */
async function openClient(page, { name = 'Tester', lobbyId = null } = {}) {
  const fehler = [];
  page.on('pageerror', error => fehler.push(String(error)));
  page.on('console', message => {
    if (message.type() === 'error') fehler.push(`console: ${message.text()}`);
  });

  await page.goto('/');

  /*
   * Erst warten, bis die Anwendung geladen ist.
   *
   * Ein `page.evaluate` direkt nach `goto` hat sporadisch geworfen („Bundling
   * durch den Dev-Server braucht manchmal länger"). Ohne diese Zeile ist der
   * Fehlschlag schwer zu deuten, weil er aus der Seite kommt und nur einen
   * nackten Stacktrace hinterlässt.
   */
  await page.waitForFunction(() => Boolean(window.__PA__), null, { timeout: 20_000 });

  // Den Startfehler zurückgeben statt werfen — dann steht die Ursache im
  // Fehlerbericht des Tests und nicht nur ein Stacktrace aus dem Browser.
  const start = await page.evaluate(
    optionen => window.__PA__.startOnline(optionen)
      .then(ergebnis => ({ ergebnis }))
      .catch(error => ({ fehler: String(error?.stack ?? error) })),
    { serverUrl: SERVER_URL, lobbyId, teams: 2, playersPerTeam: 1, preset: 'hills', seed: 24680, name },
  );
  expect(start.fehler, `startOnline ist gescheitert: ${start.fehler}`).toBeUndefined();

  await expect.poll(
    () => page.evaluate(() => window.__PA__.getNetwork()?.state ?? null),
    { timeout: 25_000, message: 'Client muss "connected" erreichen' },
  ).toBe('connected');

  return fehler;
}

/** Liest den Netzwerkzustand aus der Seite. */
function netzZustand(page) {
  return page.evaluate(() => {
    const netz = window.__PA__.getNetwork();
    const snapshot = netz?.latestSnapshot ?? null;
    return {
      state: netz?.state ?? null,
      tick: snapshot?.tick ?? null,
      isFull: snapshot?.isFull ?? null,
      round: snapshot?.round ?? null,
      entityCount: snapshot?.entities?.length ?? 0,
      latencyMs: netz?.latencyMs ?? null,
      /*
       * Zähler statt Momentwert: `latestSnapshot.isFull` ist nur rund 50 ms lang
       * wahr (der Server sendet alle 2 s einen Vollsnapshot, dazwischen alle
       * 50 ms ein Delta). Eine Prüfung darauf trifft diesen Moment zufällig —
       * sie ist ein Wettrennen und war in der Praxis auch eines: Der Test fiel
       * um, sobald sich das Timing um ein Byte verschob (Kistenfeld in v5).
       * Der Zähler ist deterministisch.
       */
      fullSnapshots: netz?.stats?.fullSnapshots ?? null,
      snapshotsReceived: netz?.stats?.snapshotsReceived ?? null,
      connectionText: document.getElementById('hud-connection')?.textContent ?? null,
      // Der Ansichtszustand verrät, ob das Ende angekommen ist.
      viewStatus: window.__PA__.getState()?.status ?? null,
      endOverlaySichtbar: document.getElementById('end-overlay')?.hidden === false,
    };
  });
}

// ------------------------------------------------------------ Latenz

test('Bei 120 ms Latenz bleibt der Client verbunden, bedienbar und misst ehrlich', async ({ page }) => {
  /*
   * Die Verzögerung liegt auf ALLEN Nachrichten des Servers — auch auf dem
   * PONG. Sonst misst die Latenzanzeige des Clients nur die ungestörte
   * Gegenrichtung und der Test wäre eine Selbstbestätigung.
   */
  const zaehler = await stoerungLegen(page, { delayMs: 120, steuerung: {} });
  const fehler = await openClient(page);

  // Der Handshake läuft trotz Verzögerung durch.
  await expect.poll(async () => (await netzZustand(page)).tick, {
    timeout: 25_000,
    message: 'Snapshots müssen trotz Latenz ankommen',
  }).toBeGreaterThan(0);

  // Die Störung hat gewirkt: Es wurde tatsächlich verzögert.
  await expect.poll(() => zaehler.verzoegert, { timeout: 10_000 })
    .toBeGreaterThan(5);

  const zustand = await netzZustand(page);
  // Der Client rechnet den Zustand mit.
  expect(zustand.state).toBe('connected');
  expect(zustand.entityCount).toBeGreaterThan(0);

  // Die eigene Latenzmessung ist ehrlich: Der Ping läuft hin und zurück, eine
  // Richtung ist um 120 ms verzögert. Gemessen werden muss also mindestens das.
  await expect.poll(async () => (await netzZustand(page)).latencyMs, {
    timeout: 15_000,
    message: 'Die Latenz muss gemessen werden',
  }).toBeGreaterThan(100);

  // Und die Anzeige verschweigt sie nicht.
  const sichtbar = await netzZustand(page);
  expect(sichtbar.connectionText).toContain('online');
  expect(sichtbar.connectionText).toMatch(/\d+\s*ms/);

  /*
   * Bedienbarkeit: Der aktive Spieler feuert, und der Schuss kommt an. Bei
   * 120 ms ist der eigene Schuss verzögert — „fühlt sich träge an" ist eine
   * bekannte Grenze (keine Client-Prädiktion), aber er darf nicht verloren
   * gehen.
   */
  const vorher = await netzZustand(page);
  const geschossen = await page.evaluate(async () => {
    const api = window.__PA__;
    // Warten, bis dieser Client am Zug ist.
    for (let i = 0; i < 400; i += 1) {
      if (api.getNetwork()?.isMyTurn) return { zug: true };
      await new Promise(fertig => setTimeout(fertig, 50));
    }
    return { zug: false };
  });
  expect(geschossen.zug, 'Der Client kam nie an die Reihe').toBe(true);

  await page.evaluate(() => window.__PA__.fire(Math.PI / 4, 60));
  // Der Schuss braucht einen Tick, bis er im Zustand sichtbar ist.
  await expect.poll(async () => (await netzZustand(page)).tick, { timeout: 15_000 })
    .toBeGreaterThan(vorher.tick);

  // Während der ganzen Zeit kein Absturz.
  expect(fehler, `Seitenfehler: ${fehler.join(' | ')}`).toEqual([]);
});

// ------------------------------------------------------------ Paketverlust

test('Bei Paketverlust bleibt die Verbindung, und der Zustand läuft weiter', async ({ page }) => {
  // Jeder dritte Snapshot fällt aus; Steuerungsnachrichten laufen durch.
  const zaehler = await stoerungLegen(page, { dropJedenNtenSnapshot: 3 });
  const fehler = await openClient(page);

  await expect.poll(async () => (await netzZustand(page)).tick, { timeout: 25_000 })
    .toBeGreaterThan(0);

  // Gegenprobe: Es wurde wirklich verworfen.
  await expect.poll(() => zaehler.verworfen, {
    timeout: 15_000,
    message: 'Der Test hat nichts verworfen und würde nichts beweisen',
  }).toBeGreaterThan(2);

  const vorher = await netzZustand(page);

  // Trotz Ausfällen läuft der Zustand weiter — der Vollsnapshot alle 2 s
  // setzt den Client immer wieder auf den Serverzustand.
  await expect.poll(async () => (await netzZustand(page)).tick, {
    timeout: 15_000,
    message: 'Der Tick muss trotz Verlust weiterlaufen',
  }).toBeGreaterThan(vorher.tick);

  const nachher = await netzZustand(page);
  // Die Verbindung hat nie gewechselt: verworfen ≠ getrennt.
  expect(nachher.state).toBe('connected');
  expect(nachher.connectionText).not.toContain('getrennt');

  /*
   * Und es kommt ein Vollsnapshot nach — das ist der Beleg, dass die
   * Wiederherstellung greift und nicht nur „irgendetwas" ankommt.
   *
   * Bewusst NICHT auf dem zuletzt gesehenen Snapshot geprüft: Der kann ein
   * Delta sein, je nachdem, wann gerade gemessen wird. Geprüft wird, dass
   * innerhalb weniger Sekunden ein Vollsnapshot eintrifft (der Server sendet
   * ihn alle 2 s).
   */
  /*
   * Auf einen VOLLSNAPSHOT warten — über den Zähler, nicht über den Momentwert.
   *
   * `waitForFunction` mit `polling: 100` prüfte `latestSnapshot.isFull`. Der
   * Vollsnapshot ist aber nur rund 50 ms lang der jüngste (alle 2 s einer, sonst
   * alle 50 ms Deltas). Bei 100 ms Abtastung wurde er zufällig getroffen — je
   * nach Timing des Rechners. Der Zähler kann nicht verpasst werden.
   */
  await page.waitForFunction(
    vorher => (window.__PA__.getNetwork()?.stats?.fullSnapshots ?? 0) > vorher,
    vorher.fullSnapshots ?? 0,
    { timeout: 10_000, polling: 100 },
  );

  // Zwischen den Vollsnapshots darf der Zustand kurz vom Server abweichen:
  // Das Delta bezieht sich auf einen Stand, den dieser Client nicht bekam.
  // Der Vollsnapshot korrigiert das — deshalb wird hier NICHT auf dauerhafte
  // Gleichheit geprüft, sondern auf Erholung.
  expect(fehler, `Seitenfehler: ${fehler.join(' | ')}`).toEqual([]);
});

test('Nach einem Aussetzer holt der Vollsnapshot den Client zurück', async ({ page }) => {
  /*
   * Der harte Fall: Für einige Sekunden kommt GAR nichts mehr durch, ohne dass
   * die Verbindung abreißt (der Socket bleibt offen, es fehlen nur die Daten).
   * So sieht eine echte Störung aus, bei der der Client weiterläuft, aber blind
   * ist — etwa ein hängender Proxy oder ein überlasteter Server.
   *
   * Erholung ist nur über den Vollsnapshot möglich: Ihn braucht der Client als
   * neuen Bezug. Ein Delta allein würde auf einen Stand aufsetzen, den er nie
   * hatte.
   */
  const steuerung = { blackout: false };
  const zaehler = await stoerungLegen(page, { steuerung });
  const fehler = await openClient(page);

  await expect.poll(async () => (await netzZustand(page)).tick, { timeout: 25_000 })
    .toBeGreaterThan(0);

  const vorAussetzer = await netzZustand(page);
  expect(vorAussetzer.state).toBe('connected');

  // Aussetzer: alles verwerfen.
  const verworfenVorher = zaehler.verworfen;
  steuerung.blackout = true;

  /*
   * Erst kurz warten, dann den eingefrorenen Stand messen.
   *
   * Zwischen dem Lesen von `vorAussetzer` und dem Wirksamwerden des Schalters
   * vergehen einige Millisekunden, in denen noch Snapshots ankommen — der
   * gemessene Wert wäre also nicht der Ruhezustand. (Genau daran scheiterte der
   * erste Anlauf: Der Tick war „trotz" Aussetzer von 56 auf 69 gestiegen.)
   */
  await new Promise(fertig => setTimeout(fertig, 500));
  const eingefroren = await netzZustand(page);
  await new Promise(fertig => setTimeout(fertig, 2500));

  // Während des Aussetzers kommt nichts Neues an.
  const waehrend = await netzZustand(page);
  expect(zaehler.verworfen - verworfenVorher, 'Es muss wirklich verworfen worden sein')
    .toBeGreaterThan(10);
  expect(waehrend.tick).toBe(eingefroren.tick);
  expect(eingefroren.tick).toBeGreaterThanOrEqual(vorAussetzer.tick);
  // Die Verbindung ist NICHT abgerissen — nur die Daten fehlen. Genau dieser
  // Fall ist die Begründung für den periodischen Vollsnapshot.
  expect(waehrend.state).toBe('connected');

  // Ende des Aussetzers.
  steuerung.blackout = false;

  /*
   * Erholung — und zwar auf dem Weg, der in dieser Lage greift.
   *
   * Der Aussetzer ist lang genug, dass das Match in ihm ZU ENDE GEHEN kann: Der
   * Server lässt Bots spielen, und eine Partie ist je nach Seed in wenigen
   * Sekunden entschieden. Genau das ist beim ersten Anlauf passiert — verworfen
   * wurden dabei auch `death` und `match_over`.
   *
   * Das ist kein Ausnahmefall des Tests, sondern der interessante: Nach dem Ende
   * sendet der Server keine Snapshots mehr. Ein Client, der das Ende verpasst
   * hat, darf deshalb NICHT auf einen Vollsnapshot warten — er muss es auf
   * anderem Weg erfahren (Wiederholung auf die PING-Anfrage).
   *
   * Geprüft wird deshalb das, was in beiden Fällen gelten muss: Der Client darf
   * nicht still auf einem laufenden Spiel sitzen bleiben. Entweder läuft der
   * Zustand weiter (Match noch offen, Vollsnapshot setzt den Bezug neu) oder das
   * Ende kommt an. Beides wird abgewartet — und geprüft, dass überhaupt eines
   * davon eintritt.
   */
  await expect.poll(async () => {
    const z = await netzZustand(page);
    // Der Vollsnapshot wird über den ZÄHLER festgestellt, nicht über den
    // Momentwert (siehe netzZustand): Er ist nur ~50 ms lang der jüngste, eine
    // Abfrage darauf wäre ein Wettrennen.
    const laeuftWeiter = z.fullSnapshots > (eingefroren.fullSnapshots ?? 0)
      && z.tick > eingefroren.tick;
    const endeAngekommen = z.viewStatus === 'gameover' && z.endOverlaySichtbar;
    return laeuftWeiter || endeAngekommen;
  }, {
    timeout: 25_000,
    message: 'Der Client blieb nach dem Aussetzer auf einem laufenden Spiel stehen '
      + '— weder ein neuer Vollsnapshot noch das Match-Ende kamen an',
  }).toBe(true);

  const erholt = await netzZustand(page);
  expect(erholt.state, 'Die Verbindung darf dabei nicht abreißen').toBe('connected');
  if (erholt.viewStatus === 'gameover') {
    // Der Weg über die Wiederholung: Das Ende ist angekommen.
    expect(erholt.endOverlaySichtbar).toBe(true);
  } else {
    // Der Weg über den Vollsnapshot: Der Zustand läuft weiter.
    expect(erholt.tick).toBeGreaterThan(eingefroren.tick);
    expect(erholt.entityCount).toBeGreaterThan(0);
  }
  expect(fehler, `Seitenfehler: ${fehler.join(' | ')}`).toEqual([]);
});

test('Der Störer verwirft nur Spielrahmen, keine Steuerung', async ({ page }) => {
  /*
   * Gegenprobe zur Störung selbst: Steuerungsnachrichten (Handshake, Lobby,
   * Spielende) müssen durchlaufen, sonst prüfen die Tests oben etwas anderes
   * als beabsichtigt. Der Verlusttest wäre sonst grün, weil der Client gar
   * nicht erst verbunden wäre — oder er würde am Handshake scheitern und
   * niemand wüsste, dass die Störung zu grob war.
   */
  const zaehler = await stoerungLegen(page, { dropJedenNtenSnapshot: 2 });
  await openClient(page);

  await expect.poll(async () => (await netzZustand(page)).tick, { timeout: 25_000 })
    .toBeGreaterThan(0);

  // Es kamen deutlich mehr Nachrichten vom Server als Snapshots — also lief
  // Steuerung mit durch.
  expect(zaehler.vomServer).toBeGreaterThan(zaehler.snapshots);
  expect(zaehler.weitergereicht).toBeGreaterThan(0);
  // Und die Verbindung steht, obwohl jeder zweite Snapshot fehlt.
  expect((await netzZustand(page)).state).toBe('connected');
});
