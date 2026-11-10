import { test, expect } from '@playwright/test';
import { freierPort } from './helfer/freier-port.mjs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { starteTestserver, stoppeTestserver, starteOnlineMatch } from './helfer/online-match.mjs';

/**
 * KULISSE-1: Auch ein ONLINE-Match zeigt mit der Menüvorgabe „automatisch" das gemalte Bild.
 *
 * Die Zeile in `docs/TODO.md` meldete, online werde die Kulisse weiter generativ gebaut
 * (`setSceneryFromSeed`). Der Code bindet das gemalte Bild seit 0c0f89c (2026-11-08) auch online
 * an (`main.js`, Aufbau des Geländes aus dem Server-Snapshot) — belegt war das bis hier nur durch
 * Lesen. Dieser Test prüft es im Browser gegen den echten Server, mit Gegenprobe „generativ".
 */
test.setTimeout(120_000);

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');
const SERVER_PORT = await freierPort();
const SERVER_URL = `http://127.0.0.1:${SERVER_PORT}`;

let server = null;
test.beforeAll(async () => { server = await starteTestserver({ port: SERVER_PORT, repoRoot }); });
test.afterAll(async () => { await stoppeTestserver(server?.process); server = null; });

async function kulisse(page) {
  return page.evaluate(() => ({ modus: window.__PA__.getMode(), ...window.__PA__.backdrop() }));
}

test('Online mit „automatisch": gemaltes Bild statt generativer Szene', async ({ page }) => {
  await starteOnlineMatch(page, {
    serverUrl: SERVER_URL, port: SERVER_PORT, seed: 7, name: 'Kulisse', backdropKey: 'automatisch',
  });
  await expect.poll(async () => (await kulisse(page)).file, { timeout: 20_000 }).not.toBeNull();
  const k = await kulisse(page);
  expect(k.modus).toBe('online');
  expect(k.szene, 'mit gemaltem Bild darf keine generative Szene daneben laufen').toBeNull();
  expect(k.key).toBeTruthy();
});

test('Gegenprobe online mit „generativ": generative Szene, kein Bild', async ({ page }) => {
  await starteOnlineMatch(page, {
    serverUrl: SERVER_URL, port: SERVER_PORT, seed: 7, name: 'Kulisse', backdropKey: 'generativ',
  });
  await expect.poll(async () => (await kulisse(page)).szene, { timeout: 20_000 }).not.toBeNull();
  const k = await kulisse(page);
  expect(k.modus).toBe('online');
  expect(k.file).toBeNull();
});
