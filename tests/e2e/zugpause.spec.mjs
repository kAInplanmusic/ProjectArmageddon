import { test, expect } from '@playwright/test';

/*
 * Zugpause im Browser (lokal): vor dem Zug steht der Hinweis mit Zähler, Schießen ist gesperrt,
 * nach Ablauf verschwindet er und der Schuss geht durch. Die E2E-Konfiguration spielt sonst ohne
 * Pause (`VITE_ZUGPAUSE_SEKUNDEN=0`); hier schaltet `?zugpause=3` sie für diese Seite ein.
 */
test('Die Zugpause zeigt Hinweis und Zähler, sperrt das Schießen und endet von selbst', async ({ page }) => {
  await page.goto('/?zugpause=3');
  await page.fill('#cfg-seed', '4');
  await page.click('#start-button');

  const feld = page.locator('#zugpause');
  await expect(feld).toBeVisible({ timeout: 3000 });
  await expect(feld.locator('.zugpause-titel')).toContainText('gleich dran');
  await expect(feld.locator('.zugpause-zahl')).toHaveText(/^[123]$/);

  // In der Pause: Schuss wird verweigert (Protokollzeile), der Zug läuft nicht.
  await page.keyboard.down(' ');
  await page.waitForTimeout(300);
  await page.keyboard.up(' ');
  await expect(page.locator('#log-list')).toContainText(/Zugpause/i, { timeout: 3000 });

  // Danach verschwindet der Hinweis.
  await expect(feld).toBeHidden({ timeout: 6000 });
});

test('Ein Abbruch während der Pause lässt den Hinweis nicht stehen', async ({ page }) => {
  await page.goto('/?zugpause=5');
  await page.fill('#cfg-seed', '4');
  await page.click('#start-button');
  await expect(page.locator('#zugpause')).toBeVisible({ timeout: 3000 });
  await page.keyboard.press('r');
  await page.waitForTimeout(500);
  await expect(page.locator('#zugpause')).toBeHidden();
});
