import { test, expect } from '@playwright/test';

/**
 * Sonderbiome und Stoffkarte im Spielerpfad: Auswahl im Menü, Start, spielbares Match,
 * Client-Stoffkarte gleich der des Matches (kein Abgleichsfehler), keine Konsolenfehler.
 */
const BIOME = ['vulkan', 'eiswueste', 'schrott'];

test('Menü bietet alle Sonderbiome; gewählte Biome starten mit Stoffkarte', { timeout: 180_000 }, async ({ page }) => {
  const fehler = [];
  page.on('pageerror', e => fehler.push(String(e)));
  for (const [i, biom] of BIOME.entries()) {
    await page.goto('/');
    await page.waitForFunction(() => Boolean(window.__PA__));
    await page.evaluate(() => window.__PA__.setAutoLoop(false));
    const optionen = await page.locator('#cfg-biom option').evaluateAll(o => o.map(x => x.value));
    expect(optionen).toContain(biom);
    expect(optionen.length).toBeGreaterThanOrEqual(8);
    await page.locator('#cfg-erweitert > summary').click();
    await page.locator('#cfg-biom').selectOption(biom);
    await page.locator('#cfg-seed').fill(String(5150 + i));
    await page.getByRole('button', { name: 'Match starten' }).click();
    await expect(page.locator('#menu-overlay')).toBeHidden();
    const befund = await page.evaluate(() => {
      const m = window.__PA__.getMatch();
      return { status: window.__PA__.getState().status, biom: m.sonderbiom ?? null, stoffe: m.stoffkarte ? new Set(m.stoffkarte.feld).size : 0 };
    });
    expect(befund.status).toBe('playing');
    expect(befund.biom).toBe(biom);
    expect(befund.stoffe).toBeGreaterThanOrEqual(2);
  }
  expect(fehler).toEqual([]);
});

test('Planeten im Menü: Wahl „Planet“ und die sechs Arten starten spielbar, Kulisse zeigt den Kosmos', { timeout: 180_000 }, async ({ page }) => {
  const fehler = [];
  page.on('pageerror', e => fehler.push(String(e)));
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__PA__));
  await page.evaluate(() => window.__PA__.setAutoLoop(false));
  const optionen = await page.locator('#cfg-biom option').evaluateAll(o => o.map(x => x.value));
  for (const id of ['planet', 'planet_eis', 'planet_lava', 'planet_sand', 'planet_dschungel', 'planet_rost', 'planet_stein']) expect(optionen).toContain(id);
  for (const [i, wahl] of ['planet', 'planet_stein'].entries()) {
    if (!(await page.locator('#cfg-erweitert').evaluate(d => d.open))) await page.locator('#cfg-erweitert > summary').click();
    await page.locator('#cfg-biom').selectOption(wahl);
    await page.locator('#cfg-seed').fill(String(6150 + i));
    await page.getByRole('button', { name: 'Match starten' }).click();
    await expect(page.locator('#menu-overlay')).toBeHidden();
    const befund = await page.evaluate(() => {
      const m = window.__PA__.getMatch();
      const r = window.__PA__.game.renderer;
      return {
        status: window.__PA__.getState().status, biom: m.sonderbiom, gelaende: m.gelaende,
        himmel: r.scenery?.celestial?.kind, wasser: r.scenery?.waterId, ok: m.erreichbarkeit?.ok,
      };
    });
    expect(befund.status).toBe('playing');
    expect(befund.biom).toMatch(/^planet_/);
    if (wahl !== 'planet') expect(befund.biom).toBe(wahl);
    expect(befund.gelaende).toBe(6);
    expect(befund.himmel).toBe('planet');
    expect(befund.wasser).toBe('void');
    expect(befund.ok).toBe(true);
    await page.evaluate(() => window.__PA__.game.abortMatch?.());
    await page.goto('/');
    await page.waitForFunction(() => Boolean(window.__PA__));
    await page.evaluate(() => window.__PA__.setAutoLoop(false));
  }
  expect(fehler).toEqual([]);
});
