import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * E2E-Prüfung des Lobby-Browsers.
 *
 * Startet einen echten Server, legt dort Lobbys an und prüft im Browser, dass
 * die Liste geladen, korrekt dargestellt und ein Klick auf "Beitreten" die
 * Lobby-ID ins Formular übernommen wird. Es wird bewusst gegen einen echten
 * Server geprüft — ein Attrappen-Server würde die API-Form nicht absichern.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');
const SERVER_PORT = 3211;
const SERVER_URL = `http://127.0.0.1:${SERVER_PORT}`;

let serverProcess = null;
let serverLog = '';

test.beforeAll(async () => {
  serverProcess = spawn(process.execPath, ['scripts/server.mjs'], {
    cwd: repoRoot,
    env: { ...process.env, PORT: String(SERVER_PORT), PA_PERSISTENCE: 'off' },
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

/** Legt eine Lobby über die HTTP-API an. */
async function createLobby({ preset = 'hills', teams = 2, playersPerTeam = 2 } = {}) {
  const response = await fetch(`${SERVER_URL}/api/lobby/create`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ preset, teams, playersPerTeam }),
  });
  if (!response.ok) throw new Error(`Lobby-Erstellung fehlgeschlagen: ${response.status}`);
  return response.json();
}

test('Lobby-Browser listet offene Lobbys und übernimmt die Auswahl', async ({ page }) => {
  // Zwei Lobbys mit unterschiedlicher Karte anlegen, damit die Anzeige
  // nachweislich echte Serverdaten zeigt und nicht einen festen Text.
  const erste = await createLobby({ preset: 'mountains', playersPerTeam: 1 });
  const zweite = await createLobby({ preset: 'islands', playersPerTeam: 2 });

  const diagnostics = { console: [], pageErrors: [] };
  page.on('console', message => {
    if (message.type() === 'error') diagnostics.console.push(message.text());
  });
  page.on('pageerror', error => diagnostics.pageErrors.push(error.message));

  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__PA__));

  // Server-URL eintragen und den Browser aufklappen — das Laden passiert
  // automatisch beim Öffnen.
  await page.fill('#cfg-server', SERVER_URL);
  await page.click('#lobby-browser > summary');

  const list = page.locator('#lobby-list li');
  await expect(list).toHaveCount(2, { timeout: 10_000 });

  // Beide Lobby-IDs und die Karten müssen sichtbar sein.
  const text = await page.locator('#lobby-list').innerText();
  expect(text).toContain(erste.lobby.id);
  expect(text).toContain(zweite.lobby.id);
  expect(text).toContain('mountains');
  expect(text).toContain('islands');

  // Statuszeile muss die Anzahl melden.
  await expect(page.locator('#lobby-status')).toContainText('2 offene Lobby');

  // Beitreten übernimmt die ID ins Formular, startet aber noch kein Match.
  const beitreten = list.first().locator('button');
  await expect(beitreten).toBeEnabled();
  await beitreten.click();
  await expect(page.locator('#cfg-lobby')).toHaveValue(erste.lobby.id);
  await expect(page.locator('#lobby-status')).toContainText('ausgewählt');

  // Das Menü ist weiterhin sichtbar — es wurde nichts gestartet.
  await expect(page.locator('#menu-overlay')).toBeVisible();

  expect(diagnostics.pageErrors, `Seitenfehler: ${diagnostics.pageErrors.join(' | ')}`).toEqual([]);
  expect(diagnostics.console, `Konsolenfehler: ${diagnostics.console.join(' | ')}`).toEqual([]);
});

test('Lobby-Browser behandelt einen nicht erreichbaren Server sauber', async ({ page }) => {
  const diagnostics = { pageErrors: [] };
  page.on('pageerror', error => diagnostics.pageErrors.push(error.message));

  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__PA__));

  // Port ohne Listener: die Anzeige muss eine Meldung zeigen, nicht abstürzen.
  await page.fill('#cfg-server', 'http://127.0.0.1:9');
  const result = await page.evaluate(() => window.__PA__.refreshLobbies());

  expect(result.ok).toBe(false);
  await expect(page.locator('#lobby-status')).toContainText('nicht erreichbar');
  await expect(page.locator('#lobby-list li')).toHaveCount(0);

  // Das Menü muss weiter benutzbar sein.
  await expect(page.locator('#start-button')).toBeEnabled();
  expect(diagnostics.pageErrors).toEqual([]);
});

test('Lobby-Browser meldet fehlende Server-URL statt zu laden', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__PA__));

  // Ohne Server-URL wird lokal gespielt; der Browser darf nicht versuchen,
  // eine relative Adresse abzufragen.
  await page.fill('#cfg-server', '');
  const result = await page.evaluate(() => window.__PA__.refreshLobbies());

  expect(result.ok).toBe(false);
  await expect(page.locator('#lobby-status')).toContainText('Server-URL');
});

test('Lobby-Browser zeigt keine Tokens oder Sitzdaten an', async ({ page }) => {
  const lobby = await createLobby({ preset: 'caverns' });

  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__PA__));
  await page.fill('#cfg-server', SERVER_URL);
  await page.evaluate(() => window.__PA__.refreshLobbies());
  await expect(page.locator('#lobby-list li')).not.toHaveCount(0);

  // Der Wiederbeitritts-Token ist ein Geheimnis: er darf weder im sichtbaren
  // Text noch im DOM-Attribut auftauchen.
  const html = await page.locator('#lobby-list').innerHTML();
  const token = lobby.player?.token;
  if (token) {
    expect(html).not.toContain(token);
    const visible = await page.locator('#lobby-list').innerText();
    expect(visible).not.toContain(token);
  }
});
