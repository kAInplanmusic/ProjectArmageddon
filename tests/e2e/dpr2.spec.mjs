/**
 * E2E: Darstellung bei doppelter Pixeldichte (Playwright `deviceScaleFactor: 2`) für HUD und Figuren.
 *
 * Geprüft wird, was bei DPR 2 kaputtgehen kann: Die Seite meldet 2, Aufnahmen haben doppelte
 * Pixelzahl, HUD und Figuren liegen im Bild (nicht abgeschnitten), Text im HUD ist sichtbar, und es
 * gibt keine Seitenfehler. Mit `PA_BILDER=1` entstehen kleine JPEGs `docs/bilder/dpr2-hud.jpg` und
 * `docs/bilder/dpr2-figuren.jpg` zur Sichtprüfung.
 */
import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';

test.use({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });

test('DPR 2: HUD und Figuren liegen im Bild, Aufnahmen haben doppelte Pixelzahl', async ({ page }) => {
  const fehler = [];
  page.on('pageerror', e => fehler.push(String(e)));
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__PA__));
  await page.evaluate(() => window.__PA__.setAutoLoop(false));
  await page.locator('#cfg-seed').fill('1234');
  await page.locator('#start-button').click();
  await expect(page.locator('#menu-overlay')).toBeHidden();
  await page.waitForTimeout(1800);

  expect(await page.evaluate(() => window.devicePixelRatio)).toBe(2);

  const hud = page.locator('#hud');
  await expect(hud).toBeVisible();
  const kasten = await hud.boundingBox();
  expect(kasten.x).toBeGreaterThanOrEqual(0);
  expect(kasten.y).toBeGreaterThanOrEqual(0);
  expect(kasten.x + kasten.width).toBeLessThanOrEqual(1281);
  expect(kasten.y + kasten.height).toBeLessThanOrEqual(721);
  await expect(page.locator('#hud-round')).toBeVisible();
  await expect(page.locator('#hud-timer')).toBeVisible();

  // Die aktive Figur liegt im sichtbaren Bild.
  const figur = await page.evaluate(() => {
    const api = window.__PA__;
    const s = api.getState();
    const a = s.entities.find(e => e.entityId === s.activePlayerId);
    const q = api.kartePunktImSchirm(a.x, a.y);
    const c = document.querySelector('#game-canvas');
    const f = c.getBoundingClientRect().width / c.width;
    return { x: q.x * f, y: q.y * f };
  });
  expect(figur.x).toBeGreaterThan(0);
  expect(figur.x).toBeLessThan(1280);
  expect(figur.y).toBeGreaterThan(0);
  expect(figur.y).toBeLessThan(720);

  const bild = await page.screenshot({ type: 'jpeg', quality: 60 });
  // JPEG-Kopf lesen: Höhe und Breite stehen im SOF0/SOF2-Block.
  let breite = 0;
  for (let i = 2; i < bild.length - 9; i += 1) {
    if (bild[i] === 0xff && (bild[i + 1] === 0xc0 || bild[i + 1] === 0xc2)) { breite = bild.readUInt16BE(i + 7); break; }
  }
  expect(breite).toBe(2560);

  if (process.env.PA_BILDER) {
    mkdirSync('docs/bilder', { recursive: true });
    await page.screenshot({ path: 'docs/bilder/dpr2-hud.jpg', type: 'jpeg', quality: 70, clip: { x: 0, y: 0, width: 640, height: 220 } });
    await page.screenshot({
      path: 'docs/bilder/dpr2-figuren.jpg', type: 'jpeg', quality: 70,
      clip: { x: Math.max(0, figur.x - 160), y: Math.max(0, figur.y - 110), width: 320, height: 200 },
    });
  }
  expect(fehler).toEqual([]);
});
