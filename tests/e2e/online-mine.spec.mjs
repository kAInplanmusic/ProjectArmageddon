/**
 * E2E: Mine im Online-Match mit ZWEI echten Browser-Clients (Akzeptanz §6 in `docs/auftraege/minen-faesser.md`,
 * Muster `online-einschlag.spec`).
 *
 * Neue Partien tragen Bodenobjektfassung 4: Beim Kartenaufbau liegen Minen aus dem Seed. Mit Seed 3 (autonome Karte,
 * Biom `klassisch`) löst der erste Schuss (0,95 rad, Kraft 25) eine liegende Mine aus. Das wird vorab mit der Engine
 * nachgerechnet (dieselben Fassungen wie der Server); eine Abweichung ist damit ein klarer Fehler, kein Rätselraten.
 *
 * Belegt:
 *  - beide Clients kennen vorher dieselben Bodenobjekte (aus dem Beitrittszustand);
 *  - die Auslösung kommt bei beiden GENAU EINMAL an (Servernachricht und Protokollmeldung), mit demselben Ausgang
 *    wie in der Engine (normal / super / Blindgänger);
 *  - danach zeigen beide dieselbe Liste: die ausgelöste Mine ist weg (bzw. als Blindgänger markiert).
 *
 * Das LEGEN einer Mine (Waffe `pa_127`) ist am Server in `tests/minen-server.test.js` belegt: Im Startinventar gibt es
 * keine Minen, und ein Browser-Client kann sich keine Munition geben (der Server vertraut ihm nicht).
 */
import { test, expect } from '@playwright/test';
import { freierPort } from './helfer/freier-port.mjs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { MatchController } from '../../src/engine/match.js';
import { KLASSEN_STANDARD } from '../../src/shared/config/klassen-fassung.js';
import { BODENOBJEKTE_STANDARD } from '../../src/shared/config/bodenobjekte.js';
import { GUENTHER_FASSUNG_STANDARD } from '../../src/shared/config/guenther.js';
import { COOKIE_STANDARD } from '../../src/shared/config/cookie.js';
import { FEUER_STANDARD } from '../../src/shared/config/feuer.js';
import { BEWEGUNG_STANDARD } from '../../src/shared/config/bewegung.js';
import { ZUGREGELN_STANDARD } from '../../src/shared/config/zugregeln.js';
import {
  starteTestserver, stoppeTestserver, hakeHudLog, hudMeldungen, schneideServernachrichtenMit,
} from './helfer/online-match.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = await freierPort();
const SERVER_URL = `http://127.0.0.1:${PORT}`;

let server = null;
test.beforeAll(async () => { server = await starteTestserver({ port: PORT, repoRoot }); });
test.afterAll(async () => { await stoppeTestserver(server?.process); });

const FALL = { seed: 3, winkel: 0.95, kraft: 25 };
const LOBBY = { teams: 2, playersPerTeam: 1, preset: 'hills', kartentyp: 'autonom', biom: 'klassisch' };
const MELDUNG = /^(Eine Mine explodiert|Superexplosion!|Blindgänger!)/;

/** Rechnet den ersten Schuss mit der Engine nach (Fassungen wie der Server) und liefert die Auslösung. */
function erwarteteAusloesung({ seed, winkel, kraft }) {
  const m = new MatchController({
    seed, ...LOBBY, klassen: KLASSEN_STANDARD, bodenobjekte: BODENOBJEKTE_STANDARD, guenther: GUENTHER_FASSUNG_STANDARD,
    cookie: COOKIE_STANDARD, feuer: FEUER_STANDARD, bewegung: BEWEGUNG_STANDARD, zugregeln: ZUGREGELN_STANDARD,
  });
  m.start();
  m.consumeEvents();
  const id = m.activePlayerId;
  m.fire(id, winkel, kraft, m.inventory.getActiveWeaponId(id));
  for (let i = 0; i < 1500; i += 1) {
    m.step();
    for (const e of m.consumeEvents()) {
      if (e.type === 'mine_exploded' || e.type === 'mine_dud') return { typ: e.type, mineId: e.payload.mineId, ausgang: e.payload.ausgang ?? null };
    }
  }
  return null;
}

async function oeffne(context, { lobbyId = null, name }) {
  const page = await context.newPage();
  const nachrichten = await schneideServernachrichtenMit(page);
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__PA__));
  await hakeHudLog(page);
  await page.evaluate(o => window.__PA__.startOnline(o), { serverUrl: SERVER_URL, lobbyId, ...LOBBY, seed: FALL.seed, name });
  await page.waitForFunction(() => window.__PA__.getNetwork()?.state === 'connected', null, { timeout: 20_000 });
  return { page, nachrichten };
}

const bodenobjekte = page => page.evaluate(() => (window.__PA__.getState()?.bodenobjekte ?? [])
  .map(o => ({ id: o.id, typ: o.typ, x: o.x, y: o.y, blindgaenger: Boolean(o.blindgaenger) }))
  .sort((a, b) => a.id - b.id));

test('Liegende Mine online: der Schuss löst sie aus, beide Clients sehen es genau einmal und gleich', async ({ browser }) => {
  test.setTimeout(150_000);
  const erwartet = erwarteteAusloesung(FALL);
  expect(erwartet, 'Messwert der Engine: der erste Schuss löst eine Mine aus').not.toBeNull();

  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  try {
    const a = await oeffne(ctxA, { name: 'Anna' });
    const lobbyId = await a.page.evaluate(() => window.__PA__.game.lobbyId);
    const b = await oeffne(ctxB, { lobbyId, name: 'Ben' });
    for (const { page } of [a, b]) {
      await expect.poll(() => page.evaluate(() => window.__PA__.getState()?.entities.length ?? 0), { timeout: 20_000 }).toBe(2);
      await expect.poll(() => page.evaluate(() => window.__PA__.getState()?.activePlayerId ?? null), { timeout: 20_000 }).not.toBeNull();
    }
    // Vorher: dieselben Bodenobjekte bei beiden, die erwartete Mine liegt darin.
    await expect.poll(async () => (await bodenobjekte(a.page)).some(o => o.id === erwartet.mineId), { timeout: 20_000 }).toBe(true);
    const vorher = await bodenobjekte(a.page);
    expect(await bodenobjekte(b.page), 'gleiche Bodenobjekte aus dem Beitrittszustand').toEqual(vorher);

    const entityA = await a.page.evaluate(() => window.__PA__.getNetwork().entityId);
    const aktiv = await a.page.evaluate(() => window.__PA__.getState().activePlayerId);
    const schuetze = aktiv === entityA ? a : b;
    expect((await schuetze.page.evaluate(([w, k]) => window.__PA__.fire(w, k), [FALL.winkel, FALL.kraft])).ok).toBe(true);

    for (const { page } of [a, b]) {
      await expect.poll(async () => (await hudMeldungen(page)).filter(m => MELDUNG.test(m.text)).length, {
        timeout: 30_000, message: 'die Auslösung muss ankommen',
      }).toBeGreaterThan(0);
    }
    await new Promise(r => setTimeout(r, 2500)); // Platz für ein mögliches zweites Ankommen

    const zaehle = (nachrichten, t, id) => nachrichten.filter(n => n.t === t && n.mineId === id).length;
    for (const { page, nachrichten } of [a, b]) {
      expect(zaehle(nachrichten, erwartet.typ, erwartet.mineId), `genau eine ${erwartet.typ}-Nachricht`).toBe(1);
      expect((await hudMeldungen(page)).filter(m => MELDUNG.test(m.text)).length, 'genau eine Meldung').toBe(1);
      if (erwartet.typ === 'mine_exploded') {
        expect(nachrichten.find(n => n.t === 'mine_exploded').ausgang, 'Ausgang wie in der Engine').toBe(erwartet.ausgang);
      }
    }
    const nachA = await bodenobjekte(a.page);
    expect(await bodenobjekte(b.page), 'danach dieselben Bodenobjekte').toEqual(nachA);
    const mine = nachA.find(o => o.id === erwartet.mineId);
    if (erwartet.typ === 'mine_exploded') expect(mine, 'die ausgelöste Mine ist weg').toBeUndefined();
    else expect(mine?.blindgaenger, 'der Blindgänger bleibt liegen').toBe(true);
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});
