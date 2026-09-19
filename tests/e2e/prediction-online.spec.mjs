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
 * `playersPerTeam: 1` und nur ein Client: Die übrigen Plätze übernimmt der Bot,
 * der Test bleibt damit deterministisch und schnell.
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
      ws.onMessage(message => {
        if (!verzoegerungAktiv) { server.send(message); return; }
        // Textframes sind Steuernachrichten (JSON), Binärframes Snapshots.
        const istText = typeof message === 'string'
          || (message instanceof ArrayBuffer ? false : message?.constructor?.name?.includes?.('String'));
        if (istText && !String(message).includes('"pong"')) {
          setTimeout(() => server.send(message), 700);
          return;
        }
        server.send(message);
      });
      server.onMessage(message => ws.send(message));
    });

    const fehler = await starteOnlineMatch(page);
    await warteAufEigenenZug(page);

    // Ab hier die Serverantworten verzögern.
    verzoegerungAktiv = true;

    // Feuern und SOFORT prüfen — die Antwort kommt erst nach ~700 ms.
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);

    const waehrend = await page.evaluate(() => window.__PA__.prediction());
    expect(waehrend.active, 'Die Vorhersage muss stehen, bevor die Antwort da ist').toBe(true);
    expect(waehrend.pending, 'Eine laufende Vorhersage muss eine Bahn haben').not.toBeNull();
    expect(waehrend.pending.points).toBeGreaterThan(2);

    /*
     * Und die Bahn muss vollständig sein: Sie rechnet gegen das rekonstruierte
     * Terrain des Clients. Fehlte das Terrain, endete sie an der Kartengrenze —
     * für eine Hügelkarte wäre das ein Ausschlag nach unten statt eines
     * Einschlags.
     */
    expect(waehrend.pending.impact, 'Die Bahn muss auf dieser Karte einschlagen').not.toBeNull();

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
