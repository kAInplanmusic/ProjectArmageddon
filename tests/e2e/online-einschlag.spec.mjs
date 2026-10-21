/**
 * E2E: Einschlag im Online-Match mit ZWEI echten Browser-Clients.
 *
 * Belegt je Einschlag (Wasser und Land):
 *  - beide Clients ordnen ihn gleich ein (Klangzähler `window.__PA__.sound()`: Wasser bzw. Explosion
 *    mit demselben Profil), und zwar GENAU EINMAL;
 *  - nach Trennung, Wiedereinstieg und Vollsnapshot kommt der Einschlag nicht ein zweites Mal an
 *    (kein neuer Klang, keine neue `explosion`-/`terrain_destroyed`-Nachricht) und die Karte gleicht dem Server.
 *
 * Wasser entsteht über die Karte `autonom` mit Seed 24683: Schuss (0,5 rad, Kraft 90) trifft den See.
 * Das Biom ist fest `klassisch`: Ohne diese Wahl zieht der Seed seit den Sonderbiomen oft ein anderes Gelände,
 * und der Schuss träfe nicht mehr den See. Die Messwerte werden vorab mit der Engine nachgerechnet (Abweichung = klarer Fehler, kein Rätselraten).
 */
import { test, expect } from '@playwright/test';
import { freierPort } from './helfer/freier-port.mjs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { MatchController } from '../../src/engine/match.js';
import {
  starteTestserver, stoppeTestserver, hakeHudLog, hudMeldungen, schneideServernachrichtenMit,
} from './helfer/online-match.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = await freierPort(); // frei vom Betriebssystem (früher fest 3231): parallele Läufe kollidieren nicht
const SERVER_URL = `http://127.0.0.1:${PORT}`;

let server = null;
test.beforeAll(async () => { server = await starteTestserver({ port: PORT, repoRoot }); });
test.afterAll(async () => { await stoppeTestserver(server?.process); });

const FAELLE = [
  { name: 'Wasser', seed: 24683, winkel: 0.5, kraft: 90, material: 'wasser', zaehler: 'wasser' },
  { name: 'Land', seed: 24680, winkel: 0.5, kraft: 30, material: 'erde', zaehler: 'explosion' },
];

/** Rechnet den Schuss mit der Engine nach (dieselben Optionen wie die Lobby) und liefert das Material. */
function erwartetesMaterial({ seed, winkel, kraft }) {
  const m = new MatchController({ seed, teams: 2, playersPerTeam: 1, preset: 'hills', kartentyp: 'autonom', biom: 'klassisch' });
  m.start();
  const id = m.activePlayerId;
  m.fire(id, winkel, kraft, m.inventory.getActiveWeaponId(id));
  for (let i = 0; i < 1500 && m.activeProjectileCount > 0; i += 1) {
    m.step();
    for (const e of m.consumeEvents()) if (e.type === 'explosion') return e.payload.material;
  }
  return null;
}

const sound = page => page.evaluate(() => window.__PA__.sound());
const summe = z => z.gespielt.explosion + z.gespielt.einschlag + z.gespielt.wasser;
const clientHash = page => page.evaluate(() => window.__PA__.game.remoteTerrain?.mask?.hash() ?? null);

async function oeffne(context, { lobbyId = null, name, seed }) {
  const page = await context.newPage();
  const nachrichten = await schneideServernachrichtenMit(page);
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__PA__));
  await hakeHudLog(page);
  await page.evaluate(
    o => window.__PA__.startOnline(o),
    { serverUrl: SERVER_URL, lobbyId, teams: 2, playersPerTeam: 1, preset: 'hills', kartentyp: 'autonom', biom: 'klassisch', seed, name },
  );
  await page.waitForFunction(() => window.__PA__.getNetwork()?.state === 'connected', null, { timeout: 20_000 });
  return { page, nachrichten };
}

for (const fall of FAELLE) {
  test(`Einschlag auf ${fall.name}: beide Clients klassifizieren gleich, genau einmal, auch nach Wiedereinstieg`, async ({ browser }) => {
    test.setTimeout(150_000);
    expect(erwartetesMaterial(fall), 'Messwert der Engine').toBe(fall.material);
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    try {
      const a = await oeffne(ctxA, { name: 'Anna', seed: fall.seed });
      const lobbyId = await a.page.evaluate(() => window.__PA__.game.lobbyId);
      const b = await oeffne(ctxB, { lobbyId, name: 'Ben', seed: fall.seed });
      for (const { page } of [a, b]) {
        await expect.poll(() => page.evaluate(() => window.__PA__.getState()?.entities.length ?? 0), { timeout: 20_000 }).toBe(2);
        await expect.poll(() => page.evaluate(() => window.__PA__.getState()?.activePlayerId ?? null), { timeout: 20_000 }).not.toBeNull();
        expect(await page.evaluate(() => window.__PA__.game.sound.starte())).toBe(true);
      }
      const entityA = await a.page.evaluate(() => window.__PA__.getNetwork().entityId);
      const aktiv = await a.page.evaluate(() => window.__PA__.getState().activePlayerId);
      const schuetze = aktiv === entityA ? a : b;

      const vorher = [await sound(a.page), await sound(b.page)];
      expect((await schuetze.page.evaluate(([w, k]) => window.__PA__.fire(w, k), [fall.winkel, fall.kraft])).ok).toBe(true);

      for (const { page } of [a, b]) {
        await expect.poll(async () => summe(await sound(page)), { timeout: 30_000, message: 'Einschlag muss ankommen' }).toBeGreaterThan(summe(vorher[0]));
      }
      await new Promise(r => setTimeout(r, 2500)); // Platz für ein mögliches zweites Ankommen
      const nach = [await sound(a.page), await sound(b.page)];
      // Profile des Einschlags: nur die Einschlag-/Platscherprofile vergleichen.
      const einschlagProfile = (z, v) => Object.fromEntries(
        Object.entries(z.profile).filter(([p]) => /^(explosion_|platscher_|einschlag_)/.test(p)).map(([p, n]) => [p, n - (v.profile[p] ?? 0)]).filter(([, n]) => n !== 0),
      );
      for (let i = 0; i < 2; i += 1) {
        expect(summe(nach[i]) - summe(vorher[i]), `Client ${i}: genau ein Einschlagklang`).toBe(1);
        expect(nach[i].gespielt[fall.zaehler] - vorher[i].gespielt[fall.zaehler], `Client ${i}: Klasse ${fall.zaehler}`).toBe(1);
      }
      expect(einschlagProfile(nach[0], vorher[0])).toEqual(einschlagProfile(nach[1], vorher[1]));
      const zaehlen = (nachrichten, t) => nachrichten.filter(n => n.t === t).length;
      expect(zaehlen(a.nachrichten, 'explosion')).toBe(1);
      expect(zaehlen(b.nachrichten, 'explosion')).toBe(1);
      expect(zaehlen(b.nachrichten, 'terrain_destroyed')).toBe(zaehlen(a.nachrichten, 'terrain_destroyed'));

      // Wiedereinstieg von Client B: Vollsnapshot und Nachlieferung dürfen nichts doppelt auslösen.
      const kraterVorher = zaehlen(b.nachrichten, 'terrain_destroyed');
      const neuVorher = (await hudMeldungen(b.page)).filter(m => m.text.startsWith('Terrain aus Seed')).length;
      await b.page.evaluate(() => window.__PA__.getNetwork().disconnect({ permanent: false }));
      await expect.poll(async () => (await hudMeldungen(b.page)).filter(m => m.text.startsWith('Terrain aus Seed')).length, {
        timeout: 30_000, message: 'B baut die Karte nach dem Wiedereinstieg neu auf',
      }).toBeGreaterThan(neuVorher);
      const serverHash = () => [...b.nachrichten].reverse().find(n => n.t === 'terrain_hash')?.hash;
      await expect.poll(async () => (await clientHash(b.page)) === serverHash(), { timeout: 20_000 }).toBe(true);
      await new Promise(r => setTimeout(r, 2500));
      const spaeter = await sound(b.page);
      expect(summe(spaeter), 'kein zweiter Einschlagklang nach dem Wiedereinstieg').toBe(summe(nach[1]));
      expect(zaehlen(b.nachrichten, 'terrain_destroyed'), 'kein zweites terrain_destroyed').toBe(kraterVorher);
      expect(zaehlen(b.nachrichten, 'explosion')).toBe(1);
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });
}
