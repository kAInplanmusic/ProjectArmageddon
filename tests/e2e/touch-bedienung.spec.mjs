import { test, expect } from '@playwright/test';

/*
 * Touch (Handy, Querformat): Gehen (gehalten), Sprung links/rechts, Salto und Abwurf als Tasten; am Desktop (feiner Zeiger) unsichtbar.
 * Außerdem: Das Hauptmenü ist ein Dialog, und Spielfeld/HUD dahinter sind währenddessen `inert`.
 */
test.describe('Touch-Aktionen', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });

  test('Die Tasten erscheinen am eigenen Zug und lösen Sprung aus', async ({ page }) => {
    await page.goto('/');
    await page.fill('#cfg-seed', '4');
    await page.tap('#start-button');
    const tasten = page.locator('#touch-aktionen');
    await expect(tasten).toBeVisible({ timeout: 4000 });
    const box = await tasten.locator('[data-aktion=sprung-rechts]').boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    await page.waitForTimeout(600); // Figur setzt auf
    await tasten.locator('[data-aktion=sprung-rechts]').tap();
    await expect(page.locator('#log-list')).toContainText(/springt/i, { timeout: 3000 });
  });

  test('Die Gehen-Knöpfe laufen, solange sie gehalten werden, und halten beim Loslassen an', async ({ page }) => {
    await page.goto('/');
    await page.fill('#cfg-seed', '4');
    await page.tap('#start-button');
    const tasten = page.locator('#touch-laufen');
    await expect(tasten).toBeVisible({ timeout: 4000 });
    await expect.poll(() => page.evaluate(() => window.__PA__.isGrounded()), { timeout: 15000 }).toBe(true);
    const x = () => page.evaluate(() => {
      const s = window.__PA__.getState();
      return s.entities.find(e => e.entityId === s.activePlayerId).x;
    });
    expect((await tasten.locator('[data-laufen=rechts]').boundingBox()).height).toBeGreaterThanOrEqual(44);
    const x0 = await x();
    await tasten.locator('[data-laufen=rechts]').dispatchEvent('pointerdown', { button: 0, pointerId: 7, bubbles: true });
    await page.waitForTimeout(500);
    await tasten.locator('[data-laufen=rechts]').dispatchEvent('pointerup', { button: 0, pointerId: 7, bubbles: true });
    const x1 = await x();
    expect(x1 - x0, 'gehaltener Knopf läuft nach rechts').toBeGreaterThan(15);
    await page.waitForTimeout(300);
    expect(await x(), 'Loslassen hält an').toBe(x1);
  });
});

test('Am Desktop sind die Touch-Tasten unsichtbar; das Menü ist ein Dialog und sperrt das Spielfeld', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#menu-overlay')).toHaveAttribute('role', 'dialog');
  expect(await page.evaluate(() => document.getElementById('game-canvas').inert)).toBe(true);
  await page.fill('#cfg-seed', '4');
  await page.click('#start-button');
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => document.getElementById('game-canvas').inert)).toBe(false);
  await expect(page.locator('#touch-aktionen')).toBeHidden();
  await expect(page.locator('#touch-laufen')).toBeHidden();
});
