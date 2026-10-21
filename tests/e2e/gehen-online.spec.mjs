import { test, expect } from '@playwright/test';
import { freierPort } from './helfer/freier-port.mjs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  starteTestserver, stoppeTestserver, starteOnlineMatch, warteAufEigenenZug,
} from './helfer/online-match.mjs';

/**
 * GEHEN IM ONLINE-MATCH (Bewegungsfassung 2): A/D gehalten → `move` an den Server → der Server bewegt die Figur, die
 * Snapshots zeigen es, die Anzeige läuft über die Laufvorhersage sofort mit; Loslassen (Stopp) hält an.
 */
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');
const SERVER_PORT = await freierPort(); // frei vom Betriebssystem (früher fest 3231): parallele Läufe kollidieren nicht
const SERVER_URL = `http://127.0.0.1:${SERVER_PORT}`;
test.setTimeout(120_000);

let server = null;
test.beforeAll(async () => { server = await starteTestserver({ port: SERVER_PORT, repoRoot }); });
test.afterAll(async () => { await stoppeTestserver(server?.process); server = null; });

test('Online: D gehalten bewegt die eigene Figur auf dem Server, Loslassen hält an', async ({ page }) => {
  await starteOnlineMatch(page, { serverUrl: SERVER_URL, port: SERVER_PORT, seed: 5, name: 'Geher' });
  await warteAufEigenenZug(page);
  await page.evaluate(() => {
    const net = window.__PA__.getNetwork();
    window.__SPUR__ = [];
    net.on('snapshot', s => {
      const f = (s.entities ?? []).find(e => e.entityId === net.entityId);
      if (f) window.__SPUR__.push({ tick: s.tick, x: f.x, y: f.y });
    });
  });
  // Ruhe abwarten (Landung beim Matchbeginn).
  await page.waitForFunction(() => {
    const l = (window.__SPUR__ ?? []).slice(-12).map(e => e.y);
    return l.length >= 12 && Math.max(...l) - Math.min(...l) < 8;
  }, null, { timeout: 20_000 });

  const serverX = () => page.evaluate(() => window.__SPUR__[window.__SPUR__.length - 1].x);
  const angezeigtX = () => page.evaluate(() => {
    const s = window.__PA__.getState();
    return s.entities.find(e => e.entityId === window.__PA__.getNetwork().entityId).x;
  });
  const x0 = await serverX();
  await page.keyboard.down('d');
  await page.waitForTimeout(900);
  const unterwegs = { server: await serverX(), anzeige: await angezeigtX() };
  await page.keyboard.up('d');
  expect(unterwegs.server - x0, 'der Server hat die Figur bewegt').toBeGreaterThan(20);
  expect(unterwegs.anzeige, 'die Anzeige läuft mit (Vorhersage ≥ Serverstand − Rundungsspiel)').toBeGreaterThan(unterwegs.server - 6);

  await page.waitForTimeout(600);
  const halt = await serverX();
  await page.waitForTimeout(500);
  expect(await serverX(), 'Stopp hält die Figur an').toBe(halt);
  // Nach dem Stopp gleitet die Anzeige auf den Serverstand zurück.
  await expect.poll(async () => Math.abs((await angezeigtX()) - halt), { timeout: 3000 }).toBeLessThan(1.5);

  // Strenge Prüfung am Server: ungültige Richtung wird abgelehnt (kein stilles Klemmen).
  const antwort = await page.evaluate(() => new Promise(fertig => {
    const net = window.__PA__.getNetwork();
    net.on('server_error', m => fertig(m.errors?.[0] ?? 'fehler'));
    net.sendMove(5);
    setTimeout(() => fertig(null), 3000);
  }));
  expect(antwort).toContain('richtung');
});
