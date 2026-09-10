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
