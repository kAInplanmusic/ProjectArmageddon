/**
 * E2E: Einstieg (TODO 2.11): Die erste lokale Partie zeigt die Führung; Zielen schaltet weiter; „Überspringen“ beendet sie, und die
 * nächste Partie zeigt sie nicht mehr. Die Testbasis markiert den Einstieg als gesehen; hier wird die Markierung entfernt.
 */
import { test, expect } from './helfer/test-basis.mjs';

test('Einstieg: erste Partie zeigt die Führung, Zielen schaltet weiter, Überspringen beendet sie dauerhaft', async ({ page }) => {
  const fehler = [];
  page.on('pageerror', e => fehler.push(String(e)));
  await page.addInitScript(() => { if (!sessionStorage.getItem('einstieg-test')) { localStorage.removeItem('pa.einstieg.v1'); sessionStorage.setItem('einstieg-test', '1'); } });
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__PA__?.game));
  await page.locator('#start-button').click();
  await page.waitForFunction(() => window.__PA__?.game?.match?.status === 'playing', null, { timeout: 20_000 });

  const feld = page.locator('#einstieg');
  await expect(feld).toBeVisible();
  await expect(page.locator('#einstieg-schritt')).toHaveText('1 / 4');
  await expect(feld).toHaveAttribute('data-schritt', 'zielen');

  // Zielen: W gehalten verändert den Winkel → Schritt 2.
  await page.keyboard.down('w');
  await page.waitForTimeout(500);
  await page.keyboard.up('w');
  await expect(feld).toHaveAttribute('data-schritt', 'feuern', { timeout: 5000 });

  await page.locator('#einstieg-ueberspringen').click();
  await expect(feld).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('pa.einstieg.v1'))).toBe('1');
  expect(fehler).toEqual([]);
});
