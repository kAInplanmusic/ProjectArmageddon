import { test, expect } from '@playwright/test';

/**
 * Grafikstufe im Menü: Auswahl Automatisch/Lite/Ultra, Speichern im Browser, Anzeige mit Grund,
 * Wirkung auf die geltenden Grenzen (`window.__PA__.grafik()`).
 */
test('Grafikstufe: Lite wählen, speichern, nach dem Neuladen wieder da; Anzeige nennt die Stufe', { timeout: 90_000 }, async ({ page }) => {
  const fehler = [];
  page.on('pageerror', e => fehler.push(String(e)));
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__PA__));
  await page.evaluate(() => { window.__PA__.setAutoLoop(false); localStorage.removeItem('pa.grafik'); });
  await page.reload();
  await page.waitForFunction(() => Boolean(window.__PA__));
  await page.locator('#cfg-erweitert > summary').click();

  await expect(page.locator('#cfg-grafik')).toHaveValue('auto');
  await expect(page.locator('#cfg-grafik-info')).toContainText(/Aktiv: (Lite|Ultra)/);

  await page.locator('#cfg-grafik').selectOption('lite');
  await expect(page.locator('#cfg-grafik-info')).toContainText('Aktiv: Lite — von dir gewählt');
  const lite = await page.evaluate(() => window.__PA__.grafik());
  expect(lite.stufe).toBe('lite');
  expect(lite.grenzen.gelaendeGpu).toBe(false);
  expect(lite.grenzen.gpuStoffe).toBe(32);
  expect(await page.evaluate(() => localStorage.getItem('pa.grafik'))).toBe('lite');

  await page.reload();
  await page.waitForFunction(() => Boolean(window.__PA__));
  await page.locator('#cfg-erweitert > summary').click();
  await expect(page.locator('#cfg-grafik')).toHaveValue('lite');
  expect((await page.evaluate(() => window.__PA__.grafik())).stufe).toBe('lite');

  // Ultra gilt nur, wenn das Gerät es schafft; sonst bleibt es bei Lite und der Grund steht da.
  await page.locator('#cfg-grafik').selectOption('ultra');
  const ultra = await page.evaluate(() => window.__PA__.grafik());
  if (ultra.stufe === 'ultra') expect(ultra.grenzen.gpuStoffe).toBeGreaterThan(32);
  else expect(ultra.grund).toMatch(/Ultra nicht möglich/);
  expect(fehler).toEqual([]);
});
