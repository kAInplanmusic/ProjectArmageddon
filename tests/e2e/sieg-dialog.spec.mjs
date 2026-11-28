import { test, expect } from './helfer/test-basis.mjs';

/*
 * Sieg-Dialog (Redesign 2026-10-14): Siegerzeichen, Siegerzeile in der Teamfarbe, Kennzahlen, zwei Knöpfe —
 * „Revanche“ startet seit UI-4 ein NEUES Match (nicht mehr nur das Menü), seit 2026-11-28 auf einer NEUEN Karte,
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

test('„Revanche“ startet ein neues Match auf einer neuen Karte', async ({ page }) => {
  await bisSieg(page);
  await page.click('#rematch-button');

  // Das Menü bleibt zu, der Sieg-Dialog verschwindet, und ein NEUES Match läuft.
  await expect(page.locator('#end-overlay')).toBeHidden();
  await expect(page.locator('#menu-overlay')).toBeHidden();
  await page.waitForFunction(() => window.__PA__?.game?.match?.status === 'playing', { timeout: 15_000 });

  // Neue Karte (2026-11-28, „Keine Map gibt es zweimal“): der Seed der Vorpartie (4) ist es nicht mehr, das Feld ist leer.
  expect(await page.evaluate(() => window.__PA__.game.match.seedManager.baseSeed)).not.toBe(4);
  expect(await page.locator('#cfg-seed').inputValue()).toBe('');
  // Und der Zustand ist sauber: Modus lokal, R fragt nicht ins Leere, der Abbruchknopf ist da.
  expect(await page.evaluate(() => window.__PA__.game.mode)).toBe('local');
  // Der Abbruchknopf liegt seit 2026-11-04 im Einstellungs-Dropdown der Kopfzeile (nicht mehr offen im HUD).
  await page.locator('#hud-menue-knopf').click();
  await expect(page.locator('#hud-abort')).toBeVisible();
  await page.locator('#hud-menue-knopf').click();

  // Nach der Revanche fragt R nach einem LAUFENDEN Match — nicht nach einem Geist.
  const laeuft = await page.evaluate(() => (window.__PA__.game.match?.world.tickCount ?? 0));
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__PA__.game.match?.world.tickCount ?? 0)).toBeGreaterThan(laeuft);
});
