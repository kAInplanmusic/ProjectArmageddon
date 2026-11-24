/**
 * E2E: Home-Bildschirm (Startseite vor dem Menü).
 *
 * Der Unit-Test `tests/home-screen.test.js` prüft nur Zeichenketten im HTML. Dieser Test geht den
 * echten Weg ohne `sessionStorage`-Umgehung: Seite laden, Splash abwarten, Knopf klicken.
 * Audit 2026-11-16: `verlasseHome()` hatte die Bedingung umgedreht, der Home-Bildschirm
 * blieb nach dem Klick stehen.
 */
import { test, expect, HOME_SCHLUESSEL } from './helfer/test-basis.mjs';

/** Wartet, bis der Intro-Splash (1,8 s) vorbei ist und der Home-Bildschirm bedienbar ist. */
async function wartePastSplash(page) {
  await page.goto('/');
  await expect(page.locator('#intro-splash')).toBeHidden({ timeout: 10_000 });
  await expect(page.locator('#home-screen')).toBeVisible();
  await expect(page.locator('#menu-overlay')).toBeHidden();
}

test.describe('Home-Bildschirm', () => {
  // Die gemeinsame Basis markiert die Startseite als gesehen; hier gilt der echte Weg ohne Umgehung.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(schluessel => sessionStorage.removeItem(schluessel), HOME_SCHLUESSEL);
  });

  test('„Spielen“ startet mit einem Klick eine Partie (TODO 2.7), ohne das Menü', async ({ page }) => {
    const fehler = [];
    page.on('pageerror', e => fehler.push(String(e)));
    await wartePastSplash(page);

    await page.locator('#home-start').click();

    await expect(page.locator('#home-screen')).toBeHidden();
    await page.waitForFunction(() => window.__PA__?.game?.match?.status === 'playing', null, { timeout: 20_000 });
    await expect(page.locator('#menu-overlay')).toBeHidden();
    await expect(page.locator('#hud')).toBeVisible();
    expect(fehler).toEqual([]);
  });

  test('„Anpassen“ verlässt den Home-Bildschirm und zeigt das Menü', async ({ page }) => {
    await wartePastSplash(page);

    await page.locator('#home-anpassen').click();

    await expect(page.locator('#home-screen')).toBeHidden();
    await expect(page.locator('#menu-overlay')).toBeVisible();
    expect(await page.evaluate(() => Boolean(window.__PA__?.game?.match))).toBe(false);
  });

  test('Taste verlässt den Home-Bildschirm', async ({ page }) => {
    await wartePastSplash(page);

    await page.keyboard.press('Space');

    await expect(page.locator('#home-screen')).toBeHidden();
    await expect(page.locator('#menu-overlay')).toBeVisible();
  });

  test('Der Splash blendet einen verlassenen Home-Bildschirm nicht wieder ein', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => Boolean(window.__PA__));
    // Sofort verlassen, noch vor dem Ende des Splash-Timers (1,8 s).
    await page.evaluate(() => document.getElementById('home-anpassen').click());
    await expect(page.locator('#home-screen')).toBeHidden();

    await page.waitForTimeout(3000); // Timer des Splash ist abgelaufen
    await expect(page.locator('#home-screen')).toBeHidden();
    await expect(page.locator('#menu-overlay')).toBeVisible();
  });

  test('Bereits gesehener Home-Bildschirm bleibt nach dem Splash zu', async ({ page }) => {
    await page.addInitScript(() => sessionStorage.setItem('pa.home.v1', '1'));
    await page.goto('/');
    await page.waitForTimeout(3000);

    await expect(page.locator('#home-screen')).toBeHidden();
    await expect(page.locator('#menu-overlay')).toBeVisible();
  });

  test('Ein laufendes Match wird nicht vom Home-Bildschirm überdeckt', async ({ page }) => {
    await page.addInitScript(() => sessionStorage.setItem('pa.home.v1', '1'));
    await page.goto('/');
    await page.waitForFunction(() => Boolean(window.__PA__));
    await page.evaluate(() => window.__PA__.startMatch({ seed: 4242, teams: 2, playersPerTeam: 2, preset: 'hills' }));
    await page.waitForTimeout(3000);

    await expect(page.locator('#home-screen')).toBeHidden();
    await expect(page.locator('#menu-overlay')).toBeHidden();
    await expect(page.locator('#hud')).toBeVisible();
  });

  test('Das Logo des Home-Bildschirms wird geladen und hat Größe', async ({ page }) => {
    await wartePastSplash(page);
    const logo = page.locator('#home-screen .menu-logo');
    const stil = await logo.evaluate(el => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return { bild: cs.backgroundImage, w: r.width, h: r.height };
    });
    expect(stil.bild).toContain('logo.webp'); // früher: 'none', leerer Block
    expect(stil.w).toBeGreaterThan(40);
    expect(stil.h).toBeGreaterThan(40);
  });

  test('Die Nebenaktion „Anpassen“ ist als Zweitknopf formatiert', async ({ page }) => {
    await wartePastSplash(page);
    const fs = await page.locator('#home-anpassen').evaluate(el => getComputedStyle(el).fontSize);
    expect(fs).toBe('20px'); // früher wirkte die Regel wegen eines Tippfehlers im Selektor nicht
  });

  test('Auf iPhone quer (844x390) liegen beide Knöpfe vollständig im Viewport', async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await wartePastSplash(page);
    for (const id of ['#home-start', '#home-anpassen']) {
      const b = await page.locator(id).boundingBox();
      expect(b, id).not.toBeNull();
      expect(b.y, id + ' oben').toBeGreaterThanOrEqual(0);
      expect(b.y + b.height, id + ' unten').toBeLessThanOrEqual(390);
    }
  });
});
