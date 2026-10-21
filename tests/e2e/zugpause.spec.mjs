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

  // In der Pause schießt die Leertaste NICHT: Sie beendet die Pause vorzeitig (Hinweis „Leertaste oder Shift überspringt“).
  // Früher erwartete dieser Test hier eine Protokollzeile „Zugpause" (Schuss verweigert); seit die Taste die Pause
  // überspringt (`Main#fire` → `#ueberspringeZugpause`), gibt es diese Zeile nie — der Test war veraltet, nicht die Sperre.
  await page.keyboard.down(' ');
  await page.waitForTimeout(300);
  await page.keyboard.up(' ');
  // Weit vor dem regulären Ende der 3-s-Pause verschwindet der Hinweis (sie wurde übersprungen, nicht abgewartet) ...
  await expect(feld).toBeHidden({ timeout: 1500 });
  // ... und es ist KEIN Schuss gefallen: weder im Protokoll noch am Himmel.
  await expect(page.locator('#log-list')).not.toContainText(/Schuss abgegeben/i);
  expect(await page.evaluate(() => window.__PA__.getState().projectiles.length)).toBe(0);
  expect(await page.evaluate(() => window.__PA__.getState().rueckzugMs)).toBe(0);
});

test('Während der Zugpause verweigert die Engine den Schuss mit „Zugpause" (die Sperre selbst)', async ({ page }) => {
  await page.goto('/?zugpause=3');
  await page.fill('#cfg-seed', '4');
  await page.click('#start-button');
  await expect(page.locator('#zugpause')).toBeVisible({ timeout: 3000 });
  const antwort = await page.evaluate(() => {
    const m = window.__PA__.game.match;
    return m.fire(m.activePlayerId, 1, 30);
  });
  expect(antwort.ok).toBe(false);
  expect(antwort.errors.join(' ')).toMatch(/Zugpause/i);
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
