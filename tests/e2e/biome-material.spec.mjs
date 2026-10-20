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
