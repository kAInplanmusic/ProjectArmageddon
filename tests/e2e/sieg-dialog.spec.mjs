import { test, expect } from '@playwright/test';

/*
 * Sieg-Dialog (Redesign 2026-10-14): Siegerzeichen, Siegerzeile in der Teamfarbe, Kennzahlen, zwei Knöpfe —
 * „Revanche“ öffnet das Menü mit demselben Seed, „Zum Menü“ führt zurück ins Hauptmenü.
 */
async function bisSieg(page) {
  await page.goto('/');
  await page.fill('#cfg-seed', '4');
  await page.click('#start-button');
  await page.waitForFunction(() => window.__PA__?.game?.match?.status === 'playing');
  await page.evaluate(() => {
    const g = window.__PA__.game;
    for (const p of g.match.players) if (p.teamId !== 0) g.match.world.getSystem('damage').applyDamage(g.match.world, p.entityId, 100000, null);
  });
  await expect(page.locator('#end-overlay')).toBeVisible({ timeout: 15_000 });
}

test('Der Sieg-Dialog zeigt Sieger, Zeichen und beide Knöpfe; „Zum Menü“ führt ins Menü', async ({ page }) => {
  await bisSieg(page);
  await expect(page.locator('#winner-text')).toContainText('gewinnt');
  await expect(page.locator('#end-overlay .sieg-schaedel')).toBeVisible();
  await expect(page.locator('#rematch-button')).toBeVisible();
  await page.click('#end-menu-button');
  await expect(page.locator('#end-overlay')).toBeHidden();
  await expect(page.locator('#menu-overlay')).toBeVisible();
});

test('„Revanche“ öffnet das Menü mit demselben Seed (dieselbe Karte)', async ({ page }) => {
  await bisSieg(page);
  await page.click('#rematch-button');
  await expect(page.locator('#end-overlay')).toBeHidden();
  await expect(page.locator('#menu-overlay')).toBeVisible();
  await expect(page.locator('#cfg-seed')).toHaveValue('4');
});
