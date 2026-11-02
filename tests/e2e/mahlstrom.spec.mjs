import { test, expect } from '@playwright/test';
import { hakeHudLog, hudMeldungen } from './helfer/online-match.mjs';

/**
 * MAHLSTROM (Valhalla) im Browser — TESTLUECKE-1: bis 2026-11 gab es dafür keine einzige E2E-Spezifikation,
 * nur Motortests (`tests/*maelstrom*`) und das Werkzeug `check:maelstrom`.
 *
 * Der Sturm beginnt mit der Runde `valhallaRound` (aus dem Seed, Runde 8–14 bei kleinen Partien). Statt Minuten
 * echter Zugzeit abzuwarten, beendet der Test die Züge über den Motor im Browser (`match.endTurn()`, derselbe Weg wie
 * der Ablauf der Zugzeit) und lässt danach die Spielschleife des Clients laufen. Geprüft wird, was der SPIELER sieht:
 *
 *  - die Statusanzeige wechselt auf „Mahlstrom“,
 *  - das Protokoll meldet „Mahlstrom zieht sich zusammen“ — je Sturmrunde genau einmal,
 *  - die Zeichnung übernimmt die Einschnürung (`renderer` kennt den Rand des Motors),
 *  - keine Seitenfehler.
 */
test('Mahlstrom: ab der Valhalla-Runde zeigt das HUD den Sturm, meldet jede Einschnürung und zeichnet sie', async ({ page }) => {
  test.setTimeout(90_000);
  const fehler = [];
  page.on('pageerror', e => fehler.push(String(e)));
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__PA__));
  await page.evaluate(() => {
    window.__PA__.setAutoLoop(false);
    window.__PA__.startMatch({ seed: 4711, teams: 2, playersPerTeam: 1, preset: 'hills' });
  });
  await expect(page.locator('#menu-overlay')).toBeHidden();
  await hakeHudLog(page);
  await page.evaluate(() => window.__PA__.setAutoLoop(true));

  const start = await page.evaluate(() => {
    const m = window.__PA__.getMatch();
    return { valhallaRunde: m.valhallaRound, runde: m.getState().round, aktiv: m.getState().maelstrom.active };
  });
  expect(start.aktiv, 'zu Beginn kein Sturm').toBe(false);
  expect(start.valhallaRunde).toBeGreaterThan(start.runde);
  await expect(page.locator('#hud-status')).not.toHaveText('Mahlstrom');

  // Züge beenden, bis die Valhalla-Runde begonnen hat (und eine Runde weiter: zweite Einschnürung).
  const ziel = start.valhallaRunde + 1;
  await page.evaluate(async (bisRunde) => {
    const m = window.__PA__.getMatch();
    for (let i = 0; i < 200 && m.getState().round < bisRunde && m.getState().status === 'playing'; i += 1) {
      m.endTurn();
      // Der Client verarbeitet die Ereignisse in seiner Schleife; kurz Luft lassen.
      await new Promise(r => setTimeout(r, 20));
    }
  }, ziel);

  const nach = await page.evaluate(() => {
    const s = window.__PA__.getState();
    return { runde: s.round, status: s.status, sturm: s.maelstrom };
  });
  expect(nach.status).toBe('playing');
  expect(nach.runde).toBeGreaterThanOrEqual(ziel);
  expect(nach.sturm.active, 'der Sturm läuft ab der Valhalla-Runde').toBe(true);
  expect(nach.sturm.inset, 'der Rand ist eingeschnürt').toBeGreaterThan(0);

  await expect(page.locator('#hud-status')).toHaveText('Mahlstrom');
  await expect.poll(async () => (await hudMeldungen(page)).filter(m => m.text === 'Mahlstrom zieht sich zusammen').length, {
    message: 'je Sturmrunde eine Meldung (Valhalla-Runde und die folgende)',
  }).toBe(nach.runde - start.valhallaRunde + 1);
  // Die Zeichnung folgt der Einschnürung des Motors: in den Randstreifen der Geländeebene ist kein Pixel mehr gemalt.
  const deckung = await page.evaluate((inset) => {
    const ebene = window.__PA__.game.renderer.terrainLayer;
    const ctx = ebene.getContext('2d');
    const zaehle = x => {
      const d = ctx.getImageData(x, 0, 1, ebene.height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n += 1;
      return n;
    };
    return { links: zaehle(Math.floor(inset / 2)), rechts: zaehle(ebene.width - 1 - Math.floor(inset / 2)) };
  }, nach.sturm.inset);
  expect(deckung, 'Randstreifen der Geländeebene leer').toEqual({ links: 0, rechts: 0 });
  expect(fehler).toEqual([]);
});
