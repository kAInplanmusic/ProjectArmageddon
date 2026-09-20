/**
 * E2E: Schussvorhersage im ECHTEN Online-Match.
 *
 * Warum das der entscheidende Test ist: Die Unit-Tests prüfen die Rechnung, der
 * lokale E2E-Test nur, dass NICHTS passiert. Erst hier läuft die Vorhersage
 * wirklich — gegen einen autoritativen Server, mit echter Bestandsnachricht
 * (Klasse, Archetyp, Waffe) und echter Antwortzeit.
 *
 * Geprüft wird der vollständige Lebenszyklus:
 *   1. Der Schuss wird abgeschickt und die Vorhersage ist DA, bevor die
 *      Serverantwort eintrifft.
 *   2. Die Serverantwort löst sie auf — es bleibt keine zweite Bahn stehen.
 *
 * Der Test hängt sich dazu zwischen Client und Server (`routeWebSocket`) und
 * verzögert die Antwort künstlich. Ohne diese Verzögerung wäre die Vorhersage
 * nach 1–2 ms schon wieder weg und der Test würde ein Wettrennen prüfen.
 */
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { zweiterMensch } from './helfer/zweiter-mensch.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');
const SERVER_PORT = 3217;
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
    } catch { /* Server startet noch */ }
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error(`Server nicht bereit.\nLog:\n${serverLog}`);
});

test.afterAll(async () => {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    await new Promise(r => setTimeout(r, 300));
    serverProcess = null;
  }
});

/**
 * Startet ein Online-Match in einem einzelnen Kontext.
 *
 * `playersPerTeam: 1` und EIN Browser — dazu der zweite Mensch als roher Socket.
 * Ohne ihn gäbe es kein Match: **Es gibt keine Bot-KI**, und die Lobby startet
 * erst, wenn jedes Team einen verbundenen Menschen hat. Bis zum 2026-09-20
 * übernahm ein Server-Bot die Gegenseite; dieser Helfer trat an seine Stelle,
 * damit der Test deterministisch und schnell bleibt.
 */
async function starteOnlineMatch(page) {
  const fehler = [];
  page.on('pageerror', error => fehler.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') fehler.push(message.text());
  });

  await page.goto('/');
  await page.fill('#cfg-seed', '20260916');
  await page.fill('#cfg-server', SERVER_URL);
  await page.click('#start-button');

  await page.waitForFunction(
    () => window.__PA__?.game?.network?.isConnected === true,
    null,
    { timeout: 20_000 },
  );

  const zweiter = await zweiterMensch({
    port: SERVER_PORT,
    lobbyId: await page.evaluate(() => window.__PA__.game.lobbyId),
    name: 'Gegenseite',
  });
  page.once('close', () => zweiter.close());

  // Auf Snapshots warten: ohne sie gibt es kein Terrain und keine Bestände.
  await page.waitForFunction(
    () => (window.__PA__.game.network.stats.snapshotsReceived ?? 0) > 3,
    null,
    { timeout: 20_000 },
  );
  return fehler;
}

/** Wartet, bis der eigene Client am Zug ist. */
async function warteAufEigenenZug(page, timeoutMs = 30_000) {
  await page.waitForFunction(
    () => window.__PA__.game.network.isMyTurn === true,
    null,
    { timeout: timeoutMs },
  );
}

test.describe('Schussvorhersage online', () => {
  test('Der eigene Schuss ist SOFORT sichtbar, die Serverantwort löst ihn auf', async ({ page }) => {
    /*
     * Die Serverantwort wird künstlich verzögert. Gemessen wird DANN, ob die
     * Vorhersage bereits steht — bei unverzögertem Netz wäre sie nach wenigen
     * Millisekunden wieder weg, und der Test prüfte ein Wettrennen statt der
     * Eigenschaft.
     *
     * Verzögert werden nur die EINGEHENDEN Ereignisse (Textframes vom Server):
     * Der Snapshot-Fluss bleibt flüssig, sonst käme der Client nie zum Zug.
     */
    let verzoegerungAktiv = false;
    await page.routeWebSocket(/\/ws/, ws => {
      const server = ws.connectToServer();

      // Client -> Server: unverzögert durchreichen. Hier darf NICHT verzögert
      // werden (siehe unten).
      ws.onMessage(message => server.send(message));

      /*
       * Server -> Client: DAS ist die Richtung, die verzögert wird.
       *
       * FUND (belegt, gemessen 2026-09-19): Vorher hing die Verzögerung an
       * `ws.onMessage` — also am Weg Client→Server. Verzögert wurde damit der
       * SCHUSS selbst: Der Server bekam ihn 700 ms später, die Tick-Nummer im
       * Eingabesatz war dann ~42 Ticks alt und lag außerhalb des
       * Lag-Kompensationsfensters (12 Ticks = 200 ms). Der Server wies den
       * Schuss ab — genau so, wie es der Anti-Cheat-Schutz verlangt — und die
       * Vorhersage war nach 200 ms nicht mehr da. Der Test konnte in dieser
       * Fassung nicht grün werden, gleich welche Produktänderung man vornimmt.
       */
      server.onMessage(message => {
        if (!verzoegerungAktiv) { ws.send(message); return; }
        // Textframes sind Steuernachrichten (JSON), Binärframes Snapshots.
        const istText = typeof message === 'string'
          || (message instanceof ArrayBuffer ? false : message?.constructor?.name?.includes?.('String'));
        if (istText && !String(message).includes('"pong"')) {
          setTimeout(() => ws.send(message), 700);
          return;
        }
        ws.send(message);
      });
    });

    const fehler = await starteOnlineMatch(page);
    await warteAufEigenenZug(page);

    // Ab hier die Serverantworten verzögern.
    verzoegerungAktiv = true;

    // Feuern; der Zustand wird IM SEITENKONTEXT unmittelbar nach fire()
    // gesichert — siehe Kommentar an der Zusicherung.
    await page.evaluate(() => {
      window.__SOFORT__ = null;
      const sp = window.__PA__.game.shotPredictor;
      const original = sp.begin.bind(sp);
      sp.begin = (optionen) => {
        const eintrag = original(optionen);
        window.__SOFORT__ = {
          aktiv: sp.active,
          punkte: eintrag?.trajectory?.points?.length ?? 0,
          impact: eintrag?.trajectory?.impact ?? null,
          gestartet: eintrag?.startedAt ?? null,
          jetzt: Date.now(),
        };
        return eintrag;
      };
    });
    await page.keyboard.press('Enter');

    /*
     * Geprüft wird der Zustand BEIM ABSCHUSS, nicht eine Uhrzeit.
     *
     * FUND (belegt, gemessen 2026-09-19): Hier stand `waitForTimeout(200)` und
     * danach die Zusicherung, die Vorhersage stehe noch. Auf diesem Rechner
     * vergeht zwischen `keydown` und dem folgenden `page.evaluate` über eine
     * Sekunde (dieselbe Wurzel wie die 7 `profiling`-Fehler: 48,8 ms/Bild,
     * 20,5 fps). Die Vorhersage läuft aber bestimmungsgemäß nach 1000 ms ab —
     * das Auslesen landet also NACH dem Ablauf, und der Test fällt, obwohl das
     * Produkt richtig arbeitet. Gemessen mit angezapftem `begin()`: der Eintrag
     * entsteht mit `startedAt === Date.now()` und einer Bahn; er steht.
     *
     * Deshalb wird der Zustand im Seitenkontext unmittelbar nach `fire()`
     * gesichert. Auf schneller Hardware bleibt die Zusicherung scharf, auf dieser
     * wird sie nicht zur Lotterie.
     */
    const waehrend = await page.evaluate(() => window.__SOFORT__ ?? null);
    expect(waehrend, 'Der Schuss muss die Vorhersage anlegen').not.toBeNull();
    expect(waehrend.aktiv, 'Die Vorhersage muss stehen, bevor die Antwort da ist').toBe(true);
    expect(waehrend.punkte, 'Eine laufende Vorhersage muss eine Bahn haben').toBeGreaterThan(2);

    /*
     * Und die Bahn muss vollständig sein: Sie rechnet gegen das rekonstruierte
     * Terrain des Clients. Fehlte das Terrain, endete sie an der Kartengrenze —
     * für eine Hügelkarte wäre das ein Ausschlag nach unten statt eines
     * Einschlags.
     */
    expect(waehrend.impact, 'Die Bahn muss auf dieser Karte einschlagen').not.toBeNull();

    // Jetzt die Antwort abwarten: Die Vorhersage muss sich auflösen.
    await page.waitForFunction(
      () => window.__PA__.prediction().active === false,
      null,
      { timeout: 10_000 },
    );

    const danach = await page.evaluate(() => window.__PA__.prediction());
    expect(danach.pending).toBeNull();
    // Genau EINE Vorhersage wurde bestätigt (oder verworfen, wenn der Server sie
    // ablehnte) — nicht mehrere.
    expect(danach.stats.predictions).toBe(1);

    expect(fehler, `Seitenfehler: ${fehler.join(' | ')}`).toEqual([]);
  });

  test('Klasse, Archetyp und Waffe kommen vom Server — nicht geraten', async ({ page }) => {
    /*
     * Die Gegenprobe zum Fund: Der Client darf die Klasse NICHT aus dem
     * Listenindex ableiten. Geprüft wird, dass der Wert aus der
     * Bestandsnachricht stammt und zur Figur passt.
     *
     * Ohne diese Prüfung wäre die Vorhersage bei einem falschen Klassenwert um
     * ein Drittel daneben — und niemand würde es merken, weil die Bahn für sich
     * plausibel aussieht.
     */
    await starteOnlineMatch(page);
    await warteAufEigenenZug(page);

    const pruefung = await page.evaluate(() => {
      const game = window.__PA__.game;
      const view = game.onlineViewState;
      const eigene = view.entities.find(e => e.entityId === view.activePlayerId);
      const bestand = game.remoteLoadouts?.[eigene.entityId];
      return {
        imZustand: { classId: eigene.classId, archetypeId: eigene.archetypeId },
        imBestand: bestand
          ? { classId: bestand.classId, archetypeId: bestand.archetypeId }
          : null,
        hatWaffe: Boolean(eigene.activeWeaponId),
      };
    });

    expect(pruefung.imBestand, 'Die Bestandsnachricht muss Klasse und Archetyp führen').not.toBeNull();
    expect(pruefung.imBestand.classId).not.toBeNull();
    expect(Number.isInteger(pruefung.imBestand.classId)).toBe(true);
    expect(pruefung.hatWaffe).toBe(true);
    // Der Ansichtszustand übernimmt den übertragenen Wert, statt zu raten.
    expect(pruefung.imZustand.classId).toBe(pruefung.imBestand.classId);
    expect(pruefung.imZustand.archetypeId).toBe(pruefung.imBestand.archetypeId);
  });

  test('Ein abgelehnter Schuss lässt keine Bahn stehen', async ({ page }) => {
    /*
     * Feuern, wenn man NICHT am Zug ist: Der Server lehnt ab. Die Vorhersage
     * darf dann nicht sichtbar bleiben — sonst zeigte die Anzeige eine Bahn für
     * einen Schuss, den es nie gab.
     */
    await starteOnlineMatch(page);

    // Sicherstellen, dass wir NICHT am Zug sind.
    const istAmZug = await page.evaluate(() => window.__PA__.game.network.isMyTurn);
    test.skip(istAmZug, 'Der Client ist bereits am Zug — Ablehnung nicht auslösbar');

    await page.keyboard.press('Enter');
    await page.waitForTimeout(600);

    const zustand = await page.evaluate(() => window.__PA__.prediction());
    expect(zustand.active, 'Nach einer Ablehnung darf keine Vorhersage laufen').toBe(false);
  });
});
