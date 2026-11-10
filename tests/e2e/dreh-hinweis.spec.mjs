/**
 * E2E: Telefon hochkant zeigt den Dreh-Hinweis (Entscheidung 2026-11-04, „nur quer und fertig").
 *
 * Hochkant gibt es kein eigenes Layout mehr. Geprüft wird: Der Hinweis „Bitte Gerät drehen" deckt die Seite ab
 * (zugänglich als `role="alert"`/`aria-live`), das Spiel darunter ist nicht bedienbar (Tippen trifft den Hinweis,
 * `#app` ist `inert`, Tasten starten nichts), und nach dem Drehen ins Querformat verschwindet er und das Spiel läuft.
 */
import { test, expect } from '@playwright/test';

for (const [breite, hoehe] of [[390, 844], [412, 915]]) {
  test.describe(`Telefon hochkant ${breite}x${hoehe}`, () => {
    test.use({ viewport: { width: breite, height: hoehe }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });

    test('Telefon hochkant zeigt Dreh-Hinweis; das Spiel darunter wird nicht bedient', async ({ page }) => {
      const fehler = [];
      page.on('pageerror', e => fehler.push(String(e)));
      await page.goto('/');
      await page.waitForFunction(() => Boolean(window.__PA__));

      const hinweis = page.locator('#dreh-hinweis');
      await expect(hinweis).toBeVisible();
      await expect(hinweis).toHaveAttribute('role', 'alert');
      await expect(hinweis).toHaveAttribute('aria-live', 'assertive');
      await expect(hinweis).toContainText('Bitte Gerät drehen');
      await expect(page.getByRole('alert').filter({ hasText: 'Bitte Gerät drehen' })).toBeVisible();

      // Deckt das ganze Fenster ab.
      const b = await hinweis.boundingBox();
      expect(b.x).toBeLessThanOrEqual(0);
      expect(b.y).toBeLessThanOrEqual(0);
      expect(b.width).toBeGreaterThanOrEqual(breite);
      expect(b.height).toBeGreaterThanOrEqual(hoehe);

      // Nicht bedienbar: Der Startknopf liegt unter dem Hinweis, #app ist inert, ein Tipp startet nichts.
      expect(await page.evaluate(() => document.getElementById('app').inert)).toBe(true);
      const start = await page.locator('#start-button').evaluate(knopf => {
        // Das Menü ist hochkant länger als das Fenster; der Startknopf liegt unter dem Falz (gemessen: y≈1138 bei
        // 844 px Höhe). Außerhalb des Fensters liefert elementFromPoint null — die Prüfung sagte dann nichts über
        // die Abdeckung. Deshalb erst in den sichtbaren Bereich holen, dann prüfen, was an seiner Mitte oben liegt.
        knopf.scrollIntoView({ block: 'center' });
        const r = knopf.getBoundingClientRect();
        const oben = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return { obenImHinweis: Boolean(oben?.closest('#dreh-hinweis')), x: r.x + r.width / 2, y: r.y + r.height / 2 };
      });
      expect(start.obenImHinweis, 'Startknopf ist vom Hinweis verdeckt').toBe(true);
      await page.touchscreen.tap(Math.max(1, start.x), Math.max(1, start.y));
      await page.keyboard.press('Enter');
      await page.keyboard.press(' ');
      await page.waitForTimeout(300);
      expect(await page.evaluate(() => window.__PA__.game.match ?? null), 'kein Match gestartet').toBe(null);
      await expect(page.locator('#menu-overlay')).toBeVisible();

      // Gedreht: Hinweis weg, Spiel bedienbar.
      await page.setViewportSize({ width: hoehe, height: breite });
      await expect(hinweis).toBeHidden();
      expect(await page.evaluate(() => document.getElementById('app').inert)).toBe(false);
      await page.locator('#start-button').tap();
      await expect(page.locator('#menu-overlay')).toBeHidden();
      expect(await page.evaluate(() => window.__PA__.game.match?.orientation)).toBe('landscape');
      expect(fehler).toEqual([]);
    });
  });
}

test('Desktop-Fenster (auch quadratisch) zeigt keinen Dreh-Hinweis', async ({ page }) => {
  for (const [b, h] of [[1280, 720], [800, 800]]) {
    await page.setViewportSize({ width: b, height: h });
    await page.goto('/');
    await expect(page.locator('#dreh-hinweis')).toBeHidden();
    expect(await page.evaluate(() => document.getElementById('app').inert)).toBe(false);
  }
});
