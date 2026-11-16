/**
 * E2E: Home-Bildschirm (Startseite vor dem Menü).
 *
 * Der Unit-Test `tests/home-screen.test.js` prüft nur Zeichenketten im HTML. Dieser Test geht den
 * echten Weg ohne `sessionStorage`-Umgehung: Seite laden, Splash abwarten, Knopf klicken.
 * Audit 2026-11-16: `verlasseHome()` hatte die Bedingung umgedreht, der Home-Bildschirm
 * blieb nach dem Klick stehen.
 */
import { test, expect } from '@playwright/test';

/** Wartet, bis der Intro-Splash (1,8 s) vorbei ist und der Home-Bildschirm bedienbar ist. */
async function wartePastSplash(page) {
  await page.goto('/');
  await expect(page.locator('#intro-splash')).toBeHidden({ timeout: 10_000 });
  await expect(page.locator('#home-screen')).toBeVisible();
  await expect(page.locator('#menu-overlay')).toBeHidden();
}

test.describe('Home-Bildschirm', () => {
  test('„Match starten“ verlässt den Home-Bildschirm und zeigt das Menü', async ({ page }) => {
    const fehler = [];
    page.on('pageerror', e => fehler.push(String(e)));
    await wartePastSplash(page);

    await page.locator('#home-start').click();

    await expect(page.locator('#home-screen')).toBeHidden();
    await expect(page.locator('#menu-overlay')).toBeVisible();
    expect(fehler).toEqual([]);
  });

  test('„Überrasch mich“ verlässt den Home-Bildschirm und zeigt das Menü', async ({ page }) => {
    await wartePastSplash(page);

    await page.locator('#home-ueberrasch').click();

    await expect(page.locator('#home-screen')).toBeHidden();
    await expect(page.locator('#menu-overlay')).toBeVisible();
  });

  test('Taste verlässt den Home-Bildschirm', async ({ page }) => {
    await wartePastSplash(page);

    await page.keyboard.press('Space');

    await expect(page.locator('#home-screen')).toBeHidden();
    await expect(page.locator('#menu-overlay')).toBeVisible();
  });
});
