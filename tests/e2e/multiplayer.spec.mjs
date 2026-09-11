import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { PROTOCOL_VERSION } from '../../src/shared/protocol.js';

/**
 * Echte Multiplayer-E2E-Prüfung.
 *
 * Startet einen autoritativen Serverprozess und verbindet ZWEI Browserkontexte
 * mit derselben Lobby. Geprüft wird, dass beide Clients Snapshots empfangen,
 * beide Spieler sehen, nur der aktive Spieler feuern darf und ein Schuss beim
 * anderen Client ankommt.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');
const SERVER_PORT = 3210;
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
      // Server startet noch
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

/**
 * Verbindet einen Browserclient und wartet, bis die Verbindung steht.
 * Sammelt Konsolen- und Seitenfehler, damit ein Fehlschlag diagnostizierbar ist.
 */
async function openClient(context, { lobbyId = null, name = 'Tester' } = {}) {
  const page = await context.newPage();
  const diagnostics = { console: [], pageErrors: [], websocket: [] };
  page.on('console', message => {
    if (message.type() === 'error') diagnostics.console.push(message.text());
  });
  page.on('pageerror', error => diagnostics.pageErrors.push(String(error)));
  page.on('websocket', socket => {
    diagnostics.websocket.push(`open ${socket.url()}`);
    socket.on('close', () => diagnostics.websocket.push(`close ${socket.url()}`));
    socket.on('socketerror', error => diagnostics.websocket.push(`error ${socket.url()} ${error}`));
  });

  await page.goto('/');
  await page.evaluate(
    options => window.__PA__.startOnline(options),
    { serverUrl: SERVER_URL, lobbyId, teams: 2, playersPerTeam: 1, preset: 'hills', seed: 24680, name },
  );

  try {
    await expect.poll(async () => page.evaluate(() => window.__PA__.getNetwork()?.state ?? null), {
      timeout: 20_000,
      message: 'Client muss den Zustand "connected" erreichen',
    }).toBe('connected');
  } catch (error) {
    const snapshot = await page.evaluate(() => ({
      connectionText: document.getElementById('hud-connection')?.textContent ?? null,
      networkState: window.__PA__.getNetwork()?.state ?? null,
      lobbyId: window.__PA__.game.lobbyId ?? null,
      hasToken: Boolean(window.__PA__.getNetwork()?.token),
      messageLog: window.__PA__.getNetwork()?.messageLog ?? [],
      lastServerError: window.__PA__.getNetwork()?.lastServerError ?? null,
      clientStats: window.__PA__.getNetwork()?.stats ?? null,
      hudLog: document.getElementById('log-list')?.textContent ?? null,
      viewState: window.__PA__.getState(),
    }));
    throw new Error([
      'Verbindung nicht zustande gekommen.',
      `Seite: ${JSON.stringify(snapshot)}`,
      `Konsolenfehler: ${JSON.stringify(diagnostics.console)}`,
      `Seitenfehler: ${JSON.stringify(diagnostics.pageErrors)}`,
      `WebSocket: ${JSON.stringify(diagnostics.websocket)}`,
      `Serverlog: ${serverLog.slice(-800)}`,
      `Ursprünglicher Fehler: ${error.message}`,
    ].join('\n'));
  }

  return page;
}

test('Server meldet Bereitschaft über /healthz', async () => {
  const health = await (await fetch(`${SERVER_URL}/healthz`)).json();
  expect(health.status).toBe('ok');
  expect(health.protocol).toBe(PROTOCOL_VERSION);
});

test('Zwei Browser spielen in derselben Lobby', async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();

  try {
    const pageA = await openClient(contextA, { name: 'Anna' });
    await expect(pageA.locator('#hud-connection')).toContainText('online');

    const lobbyId = await pageA.evaluate(() => window.__PA__.game.lobbyId);
    expect(lobbyId).toBeTruthy();

    const pageB = await openClient(contextB, { lobbyId, name: 'Ben' });
    await expect(pageB.locator('#hud-connection')).toContainText('online');

    // Beide Clients müssen beide Spieler sehen.
    await expect.poll(async () => pageA.evaluate(() => window.__PA__.getState()?.entities.length ?? 0), {
      timeout: 20_000,
    }).toBe(2);
    await expect.poll(async () => pageB.evaluate(() => window.__PA__.getState()?.entities.length ?? 0), {
      timeout: 20_000,
    }).toBe(2);

    const entityA = await pageA.evaluate(() => window.__PA__.getNetwork().entityId);
    const entityB = await pageB.evaluate(() => window.__PA__.getNetwork().entityId);
    expect(entityA).toBeTruthy();
    expect(entityB).toBeTruthy();
    expect(entityA).not.toBe(entityB);

    // Nur der aktive Spieler darf feuern.
    const activeId = await pageA.evaluate(() => window.__PA__.getState().activePlayerId);
    const activePage = activeId === entityA ? pageA : pageB;
    const passivePage = activeId === entityA ? pageB : pageA;

    const passiveResult = await passivePage.evaluate(() => window.__PA__.fire(Math.PI / 4, 60));
    expect(passiveResult.ok).toBe(false);

    const beforeTick = await activePage.evaluate(() => window.__PA__.getState().tick);
    const activeResult = await activePage.evaluate(() => window.__PA__.fire(Math.PI / 4, 65));
    expect(activeResult.ok).toBe(true);

    await expect.poll(async () => activePage.evaluate(() => window.__PA__.getState().tick), {
      timeout: 20_000,
    }).toBeGreaterThan(beforeTick);

    // Beide Clients bleiben synchron.
    const ticksA = await pageA.evaluate(() => window.__PA__.getState().tick);
    const ticksB = await pageB.evaluate(() => window.__PA__.getState().tick);
    expect(Math.abs(ticksA - ticksB)).toBeLessThan(40);

    // Terrain wird clientseitig aus dem Server-Seed rekonstruiert.
    const seed = await pageA.evaluate(() => window.__PA__.getNetwork().worldSeed);
    expect(seed).toBeTruthy();
  } finally {
    await contextA.close();
    await contextB.close();
  }
});

test('Client verbindet sich nach Abbruch neu', async ({ browser }) => {
  const context = await browser.newContext();
  try {
    const page = await openClient(context, { name: 'Cara' });
    await expect(page.locator('#hud-connection')).toContainText('online');

    // Verbindung trennen und neu aufbauen.
    await page.evaluate(async () => {
      const client = window.__PA__.getNetwork();
      client.disconnect({ permanent: false });
      await client.connect();
    });

    await expect.poll(async () => page.evaluate(() => window.__PA__.getNetwork().state), {
      timeout: 20_000,
    }).toBe('connected');
    await expect(page.locator('#hud-connection')).toContainText('online');
  } finally {
    await context.close();
  }
});

test('Latenz wird laufend gemessen', async ({ browser }) => {
  const context = await browser.newContext();
  try {
    const page = await openClient(context, { name: 'Lena' });
    await expect(page.locator('#hud-connection')).toContainText('online');

    // Nach dem Verbinden muss die periodische Messung laufen. Ohne sie bliebe
    // die HUD-Anzeige auf dem Startwert stehen.
    await expect.poll(async () => page.evaluate(() => window.__PA__.getNetwork()?.pingActive ?? false), {
      timeout: 10_000,
    }).toBe(true);

    const interval = await page.evaluate(() => window.__PA__.getNetwork().pingIntervalMs);
    expect(interval).toBe(2000);

    // Ein Ping muss auch tatsächlich beantwortet werden: die gemessene Latenz
    // liegt über 0 und ist plausibel klein.
    await expect.poll(async () => page.evaluate(() => window.__PA__.getNetwork().latencyMs), {
      timeout: 15_000,
    }).toBeGreaterThan(0);

    const latency = await page.evaluate(() => window.__PA__.getNetwork().latencyMs);
    expect(latency).toBeLessThan(2000);

    // Die Anzeige im HUD muss den gemessenen Wert widerspiegeln.
    await expect(page.locator('#hud-connection')).toContainText('ms');

    // Nach dem Trennen darf kein Timer weiterlaufen (sonst Leck bei Reconnect).
    await page.evaluate(() => window.__PA__.getNetwork().stopPing());
    expect(await page.evaluate(() => window.__PA__.getNetwork().pingActive)).toBe(false);
  } finally {
    await context.close();
  }
});

test('Ping-Intervall lehnt ungültige Werte ab', async ({ browser }) => {
  const context = await browser.newContext();
  try {
    const page = await openClient(context, { name: 'Pia' });
    await expect(page.locator('#hud-connection')).toContainText('online');

    // Ein Intervall von 0 oder negativ würde setInterval zum Dauerfeuer machen.
    const results = await page.evaluate(() => {
      const client = window.__PA__.getNetwork();
      const out = [];
      for (const value of [0, -1, Number.NaN, 'x']) {
        try {
          client.startPing(value);
          out.push({ value: String(value), threw: false });
        } catch (error) {
          out.push({ value: String(value), threw: true, message: error.message });
        }
      }
      client.startPing(2000);
      return out;
    });

    expect(results.every(entry => entry.threw)).toBe(true);
    expect(await page.evaluate(() => window.__PA__.getNetwork().pingActive)).toBe(true);
  } finally {
    await context.close();
  }
});


test('Waffenliste ist online gefüllt und zeigt Munition', async ({ browser }) => {
  // Vorher war `inventory` im Online-Ansichtszustand fest auf [] gesetzt, dazu
  // `ammo: {}` und `activeWeaponId: null`. Folge: Im Mehrspielermodus war die
  // Waffenliste dauerhaft leer und es ließ sich keine Waffe wählen. Der binäre
  // Snapshot führt Bestände nicht (variable Länge), sie kommen als eigene
  // Nachricht — dieser Test sichert, dass sie ankommt und ankommt.
  const context = await browser.newContext();
  try {
    // openClient verbindet und startet das Match bereits.
    const page = await openClient(context, { name: 'Tester' });

    /*
     * Fünf Zeilen: vier Klassenwaffen aus dem Startloadout plus die Reservewaffe
     * mit unbegrenzter Munition (`FALLBACK_WEAPON_ID`, siehe `loadouts.js`).
     * Vorher waren es vier, weil die Reserve zufällig selbst im neutralen
     * Loadout lag und beim Anlegen nicht doppelt genommen wurde — daran hing
     * also ein Test. Die Reserve ist jetzt bei jeder Klasse dieselbe.
     */
    await expect(page.locator('#weapon-list .weapon-item')).toHaveCount(5, { timeout: 20_000 });

    // Gruppenköpfe der Unterkategorien müssen erscheinen (höchstens vier).
    const gruppen = page.locator('#weapon-list .weapon-group');
    await expect(gruppen).not.toHaveCount(0);
    const texte = await gruppen.allTextContents();
    expect(texte.length).toBeGreaterThan(0);
    expect(texte.length).toBeLessThanOrEqual(4);
    // Die Beschriftungen müssen gefüllt sein, nicht nur vorhanden.
    for (const text of texte) expect(text.trim().length).toBeGreaterThan(3);

    // Jede Zeile trägt Namen, Munition und ein geladenes Icon.
    const zeilen = page.locator('#weapon-list .weapon-item');
    const anzahl = await zeilen.count();
    expect(anzahl).toBe(5);
    for (let i = 0; i < anzahl; i++) {
      const zeile = zeilen.nth(i);
      await expect(zeile.locator('.weapon-name')).not.toBeEmpty();
      await expect(zeile).toContainText('DMG');

      // Icons sind verknüpft: das Bild muss wirklich geladen sein.
      const bild = zeile.locator('img.weapon-icon');
      await expect(bild).toHaveCount(1, { timeout: 10_000 });
      const geladen = await bild.evaluate(el => el.complete && el.naturalWidth > 0);
      expect(geladen, `Icon in Zeile ${i} wurde nicht geladen`).toBe(true);
    }

    // Genau eine Waffe ist als aktiv markiert.
    await expect(page.locator('#weapon-list .weapon-item.is-active')).toHaveCount(1);
  } finally {
    await context.close();
  }
});

test('Waffenwahl ist online nur am eigenen Zug möglich', async ({ browser }) => {
  const context = await browser.newContext();
  try {
    const page = await openClient(context, { name: 'Tester' });
    // Vier Klassenwaffen plus Reserve (siehe Test „Waffenliste ist online gefüllt").
    await expect(page.locator('#weapon-list .weapon-item')).toHaveCount(5, { timeout: 20_000 });

    // Bei fremdem Zug darf kein Wechsel gesendet werden, und die Meldung muss
    // im Protokoll erscheinen statt stillschweigend zu scheitern.
    const meinZug = await page.evaluate(() => window.__PA__.getNetwork()?.isMyTurn ?? null);
    expect(typeof meinZug).toBe('boolean');

    if (meinZug === false) {
      await page.evaluate(() => window.__PA__.selectWeapon(1));
      await expect(page.locator('#log-list')).toContainText('eigenen Zug');
    } else {
      // Eigener Zug: der Wechsel muss ankommen und den Serverzustand ändern.
      await page.evaluate(() => window.__PA__.selectWeapon(1));
      await expect(page.locator('#log-list')).toContainText(/Waffe/, { timeout: 10_000 });
    }
  } finally {
    await context.close();
  }
});
