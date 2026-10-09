/**
 * Terrain-Abgleich im ECHTEN Browser gegen einen echten Server.
 *
 * Audit 2026-10-09: Der Client baut die Karte aus dem Seed; Krater, Mahlstrom-
 * Einschnitt und ein Hash der Kollisionsmaske halten sie mit dem Server gleich.
 * Die Unit-Tests prüfen die Rechnung und die Entscheidungsfunktion — dass der
 * Browser eine absichtlich verfälschte Karte tatsächlich erkennt und
 * wiederherstellt, und dass ein Wiedereinstieg nach Einschlägen die Krater sieht,
 * zeigt erst dieser Lauf.
 */
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  starteTestserver, stoppeTestserver, starteOnlineMatch, warteAufEigenenZug,
  hudMeldungen, schneideServernachrichtenMit,
} from './helfer/online-match.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = 3230;
const SERVER_URL = `http://127.0.0.1:${PORT}`;

let server = null;
test.beforeAll(async () => { server = await starteTestserver({ port: PORT, repoRoot }); });
test.afterAll(async () => { await stoppeTestserver(server?.process); });

const clientHash = page => page.evaluate(() => window.__PA__.game.remoteTerrain?.mask?.hash() ?? null);
const letzterServerHash = nachrichten => {
  const alle = nachrichten.filter(n => n.t === 'terrain_hash');
  return alle.length ? alle[alle.length - 1] : null;
};

test('Eine verfälschte Client-Karte wird erkannt und neu aufgebaut', async ({ page }) => {
  test.setTimeout(90_000);
  const nachrichten = await schneideServernachrichtenMit(page);
  await starteOnlineMatch(page, { serverUrl: SERVER_URL, port: PORT, seed: 5150 });

  // Der Server schickt den Hash mit jedem Vollsnapshot (alle ~2 s).
  await expect.poll(() => letzterServerHash(nachrichten), { timeout: 15_000 }).not.toBeNull();
  // Ausgangslage: Client und Server sind gleich.
  await expect.poll(async () => (await clientHash(page)) === letzterServerHash(nachrichten)?.hash, { timeout: 10_000 }).toBe(true);

  // Karte des Clients absichtlich beschädigen (ein Loch, das der Server nicht kennt).
  const vorher = await clientHash(page);
  await page.evaluate(() => {
    const t = window.__PA__.game.remoteTerrain;
    t.mask.punchCrater(Math.floor(t.width / 2), Math.floor(t.height * 0.7), 35);
  });
  expect(await clientHash(page)).not.toBe(vorher);

  // Der Client meldet die Abweichung, fordert die Karte an und baut sie neu auf.
  await expect.poll(async () => {
    const meldungen = await hudMeldungen(page);
    return meldungen.some(m => m.text.includes('Terrain-Hash weicht ab'));
  }, { timeout: 20_000, message: 'Abweichung muss im HUD-Protokoll stehen' }).toBe(true);

  await expect.poll(async () => (await clientHash(page)) === letzterServerHash(nachrichten)?.hash, {
    timeout: 20_000, message: 'nach dem Neuaufbau muss die Karte wieder dem Server gleichen',
  }).toBe(true);
});

test('Nach Einschlägen und Wiedereinstieg sieht der Client dieselben Krater wie der Server', async ({ page }) => {
  test.setTimeout(150_000);
  const nachrichten = await schneideServernachrichtenMit(page);
  await starteOnlineMatch(page, { serverUrl: SERVER_URL, port: PORT, seed: 5151 });

  // Einen Schuss abgeben, der etwas abträgt.
  await warteAufEigenenZug(page);
  await page.evaluate(() => window.__PA__.fire(0.9, 70));
  await expect.poll(() => nachrichten.some(n => n.t === 'terrain_destroyed'), {
    timeout: 20_000, message: 'der Schuss muss Gelände zerstören',
  }).toBe(true);
  const kraterVorher = nachrichten.filter(n => n.t === 'terrain_destroyed').length;
  expect(kraterVorher).toBeGreaterThan(0);

  // Verbindung kappen, der Client verbindet sich mit seinem Token wieder:
  // Er baut die Karte aus dem Seed neu und muss die Krater nachgeliefert bekommen.
  const rekonstruktionenVorher = (await hudMeldungen(page)).filter(m => m.text.startsWith('Terrain aus Seed')).length;
  await page.evaluate(() => window.__PA__.getNetwork().disconnect({ permanent: false }));
  await expect.poll(async () => (await hudMeldungen(page)).filter(m => m.text.startsWith('Terrain aus Seed')).length, {
    timeout: 30_000, message: 'der Client muss die Karte nach dem Wiedereinstieg neu aufbauen',
  }).toBeGreaterThan(rekonstruktionenVorher);

  // Ohne Nachlieferung der Krater wäre die Karte jetzt unzerstört und der Hash verschieden.
  await expect.poll(async () => (await clientHash(page)) === letzterServerHash(nachrichten)?.hash, {
    timeout: 20_000, message: 'die Karte nach dem Wiedereinstieg muss dem Server gleichen',
  }).toBe(true);
  const hud = await hudMeldungen(page);
  expect(hud.some(m => m.text.includes('Terrain-Hash weicht ab'))).toBe(false);
});
