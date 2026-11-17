import { test, expect } from './helfer/test-basis.mjs';

/**
 * Der Matchstart baut die Karte asynchron (Vorgabe 24:9 groß, mehrere Sekunden, Hauptthread belegt).
 * Erst danach läuft die Pause sichtbar; deshalb erst auf das Match warten, dann prüfen.
 */
async function matchBereit(page) {
  await page.waitForFunction(() => Boolean(window.__PA__?.game?.match), null, { timeout: 30_000 });
}

/*
 * Zugpause im Browser (lokal): vor dem Zug steht der Hinweis mit Zähler, Schießen ist gesperrt,
 * nach Ablauf verschwindet er und der Schuss geht durch. Die E2E-Konfiguration spielt sonst ohne
 * Pause (`VITE_ZUGPAUSE_SEKUNDEN=0`); hier schaltet `?zugpause=6` sie für diese Seite ein.
 */
test('Die Zugpause zeigt Hinweis und Zähler, sperrt das Schießen und endet von selbst', async ({ page }) => {
  await page.goto('/?zugpause=6');
  await page.fill('#cfg-seed', '4');
  await page.click('#start-button');
  await matchBereit(page);

  const feld = page.locator('#zugpause');
  await expect(feld).toBeVisible({ timeout: 3000 });
  await expect(feld.locator('.zugpause-titel')).toContainText('gleich dran');
  await expect(feld.locator('.zugpause-zahl')).toHaveText(/^[1-6]$/);

  // In der Pause schießt die Leertaste NICHT: Sie beendet die Pause vorzeitig (Hinweis „Leertaste oder Shift überspringt“).
  // Früher erwartete dieser Test hier eine Protokollzeile „Zugpause" (Schuss verweigert); seit die Taste die Pause
  // überspringt (`Main#fire` → `#ueberspringeZugpause`), gibt es diese Zeile nie — der Test war veraltet, nicht die Sperre.
  await page.keyboard.down(' ');
  await page.waitForTimeout(300);
  await page.keyboard.up(' ');
  // Weit vor dem regulären Ende der 6-s-Pause verschwindet der Hinweis (sie wurde übersprungen, nicht abgewartet) ...
  await expect(feld).toBeHidden({ timeout: 1500 });
  // ... und es ist KEIN Schuss gefallen: weder im Protokoll noch am Himmel.
  await expect(page.locator('#log-list')).not.toContainText(/Schuss abgegeben/i);
  expect(await page.evaluate(() => window.__PA__.getState().projectiles.length)).toBe(0);
  expect(await page.evaluate(() => window.__PA__.getState().rueckzugMs)).toBe(0);
});

test('Während der Zugpause verweigert die Engine den Schuss mit „Zugpause" (die Sperre selbst)', async ({ page }) => {
  await page.goto('/?zugpause=6');
  await page.fill('#cfg-seed', '4');
  await page.click('#start-button');
  await matchBereit(page);
  await expect(page.locator('#zugpause')).toBeVisible({ timeout: 3000 });
  const antwort = await page.evaluate(() => {
    const m = window.__PA__.game.match;
    return m.fire(m.activePlayerId, 1, 30);
  });
  expect(antwort.ok).toBe(false);
  expect(antwort.errors.join(' ')).toMatch(/Zugpause/i);
});

test('Ein Abbruch während der Pause lässt den Hinweis nicht stehen', async ({ page }) => {
  await page.goto('/?zugpause=6');
  await page.fill('#cfg-seed', '4');
  await page.click('#start-button');
  await matchBereit(page);
  await expect(page.locator('#zugpause')).toBeVisible({ timeout: 3000 });
  await page.keyboard.press('r');
  await page.waitForTimeout(500);
  await expect(page.locator('#zugpause')).toBeHidden();
});
