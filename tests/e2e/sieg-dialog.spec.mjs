import { test, expect } from '@playwright/test';

/*
 * Sieg-Dialog (Redesign 2026-10-14): Siegerzeichen, Siegerzeile in der Teamfarbe, Kennzahlen, zwei Knöpfe —
 * „Revanche“ startet seit UI-4 ein NEUES Match auf derselben Karte (nicht mehr nur das Menü),
 * „Zum Menü“ führt zurück ins Hauptmenü.
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
  await expect(page.locator('#winner-text')).toBeFocused();
  await expect(page.getByRole('columnheader', { name: 'Trefferquote' })).toBeVisible();
  await expect(page.locator('#end-overlay .sieg-schaedel')).toBeVisible();
  await expect(page.locator('#rematch-button')).toBeVisible();
  await page.click('#end-menu-button');
  await expect(page.locator('#end-overlay')).toBeHidden();
  await expect(page.locator('#menu-overlay')).toBeVisible();
});

test('„Revanche“ startet ein neues Match auf derselben Karte', async ({ page }) => {
  await bisSieg(page);
  await page.click('#rematch-button');

  // Das Menü bleibt zu, der Sieg-Dialog verschwindet, und ein NEUES Match läuft.
  await expect(page.locator('#end-overlay')).toBeHidden();
  await expect(page.locator('#menu-overlay')).toBeHidden();
  await page.waitForFunction(() => window.__PA__?.game?.match?.status === 'playing', { timeout: 15_000 });

  // Dieselbe Karte: der Seed der Vorpartie steckt im neuen Match.
  expect(await page.evaluate(() => window.__PA__.game.match.seedManager.baseSeed)).toBe(4);
  // Und der Zustand ist sauber: Modus lokal, R fragt nicht ins Leere, der Abbruchknopf ist da.
  expect(await page.evaluate(() => window.__PA__.game.mode)).toBe('local');
  await expect(page.locator('#hud-abort')).toBeVisible();

  // Nach der Revanche fragt R nach einem LAUFENDEN Match — nicht nach einem Geist.
  const laeuft = await page.evaluate(() => (window.__PA__.game.match?.world.tickCount ?? 0));
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__PA__.game.match?.world.tickCount ?? 0)).toBeGreaterThan(laeuft);
});
