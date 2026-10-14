import { test, expect } from '@playwright/test';

/*
 * Touch (Handy, Querformat): Sprung links/rechts und Abwurf als Tasten; am Desktop (feiner Zeiger) unsichtbar.
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
});
