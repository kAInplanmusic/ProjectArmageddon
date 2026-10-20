/**
 * E2E: HUD im Hochformat am Telefon (390x844, Abnahme 2026-10-20).
 * Vorher lagen Status, FEUER und die Waffenleiste außerhalb der Bühne; jetzt liegt jedes Bedienelement im Bild
 * und die Waffenleiste überdeckt weder FEUER noch den Winkelregler.
 */
import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });

test('Hochformat 390 px: HUD liegt im Bild, FEUER und Waffenleiste überlappen nicht', async ({ page }) => {
  const fehler = [];
  page.on('pageerror', e => fehler.push(String(e)));
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__PA__));
  await page.evaluate(() => {
    const api = window.__PA__;
    api.setAutoLoop(false);
    api.startMatch({ seed: 4711, orientation: 'portrait', kartentyp: 'autonom' });
    api.setAutoLoop(false);
  });
  await page.waitForTimeout(1200);
  const k = async sel => page.locator(sel).first().boundingBox();
  for (const sel of ['#hud-top', '#hud-status', '#hud-fire', '#hud-right', '#hud-dial', '#hud-abort']) {
    const b = await k(sel);
    expect(b, sel).not.toBeNull();
    expect(b.x, `${sel} links`).toBeGreaterThanOrEqual(-1);
    expect(b.x + b.width, `${sel} rechts`).toBeLessThanOrEqual(391);
    expect(b.y + b.height, `${sel} unten`).toBeLessThanOrEqual(845);
  }
  const fire = await k('#hud-fire');
  const leiste = await k('#hud-right');
  const dial = await k('#hud-dial');
  const schneidet = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  expect(schneidet(fire, leiste), 'FEUER über Waffenleiste').toBe(false);
  expect(schneidet(dial, leiste), 'Winkelregler über Waffenleiste').toBe(false);
  expect(schneidet(dial, fire), 'Winkelregler über FEUER').toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect(fehler).toEqual([]);
});
