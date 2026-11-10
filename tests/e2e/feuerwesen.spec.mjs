/**
 * E2E: Feuerwesen (Waffenfassung 20, `pa_118`) im Browser.
 *
 * Geprüft: Der Schuss setzt einen Gnom ab, der sichtbar läuft (die Lage im Zustand ändert sich, der Renderer zeichnet
 * ihn), springt (Hopser, in der Luft) und am Ende zerbirst (Protokollzeile, danach fliegen Feuerkugeln). Kein
 * Seitenfehler. Mit `PA_SHOTS=<Ordner>` wird ein Bild abgelegt.
 */
import { test, expect } from '@playwright/test';

test('Feuerwesen: abfeuern, laufen, springen, zerbersten — ohne Seitenfehler', async ({ page }) => {
  test.setTimeout(120_000); // der Gnom läuft 4,5 s Spielzeit; unter Last braucht der Browser länger
  const fehler = [];
  page.on('pageerror', e => fehler.push(String(e)));
  await page.goto('/');
  await page.fill('#cfg-seed', '4');
  await page.click('#start-button');
  await expect(page.locator('#menu-overlay')).toBeHidden();
  await expect(page.locator('#weapon-list .weapon-item').first()).toBeVisible();

  const spieler = await page.evaluate(() => {
    const api = window.__PA__;
    const match = api.getMatch();
    const id = match.activePlayerId;
    match.inventory.register(id, ['pa_118']);
    api.selectWeaponById('pa_118');
    return id;
  });
  expect(await page.evaluate(id => window.__PA__.getMatch().inventory.getActiveWeaponId(id), spieler)).toBe('pa_118');
  expect(await page.evaluate(() => window.__PA__.getMatch().waffen)).toBe(20);

  // Beobachten: Lagen aus dem Zustand und die gezeichneten Gnome je Bild, bis der Gnom und seine Kugeln weg sind.
  const beob = page.evaluate(() => new Promise((ok) => {
    const erg = { lagen: [], gezeichnet: 0, luft: false, kugelnNachher: 0, weg: false };
    let gesehen = false;
    const t0 = performance.now();
    const schritt = () => {
      const api = window.__PA__;
      const state = api.getMatch().getState();
      const g = state.feuerwesen?.[0];
      if (g) {
        gesehen = true;
        erg.lagen.push({ x: g.x, y: g.y, luft: g.luft });
        if (g.luft) erg.luft = true;
        erg.gezeichnet = Math.max(erg.gezeichnet, api.waffenAnimation().stat.feuerwesen ?? 0);
      } else if (gesehen) {
        erg.weg = true;
        erg.kugelnNachher = Math.max(erg.kugelnNachher, state.projectiles.length);
      }
      if (performance.now() - t0 < 30000 && !(erg.weg && erg.kugelnNachher > 0 && state.projectiles.length === 0)) requestAnimationFrame(schritt);
      else ok(erg);
    };
    requestAnimationFrame(schritt);
  }));
  const schuss = await page.evaluate(() => window.__PA__.fire(0.3, 50));
  expect(schuss?.ok ?? true).toBe(true);
  await page.waitForFunction(() => (window.__PA__.getMatch().getState().feuerwesen?.length ?? 0) > 0, null, { timeout: 5000 });
  if (process.env.PA_SHOTS) {
    await page.waitForTimeout(600);
    const fs = await import('node:fs');
    fs.mkdirSync(process.env.PA_SHOTS, { recursive: true });
    fs.writeFileSync(`${process.env.PA_SHOTS}/feuerwesen-laeuft.png`, await page.screenshot());
  }
  const erg = await beob;

  expect(erg.lagen.length, 'der Gnom stand im Zustand').toBeGreaterThan(10);
  const xs = erg.lagen.map(l => l.x);
  expect(Math.max(...xs) - Math.min(...xs), 'er läuft').toBeGreaterThan(40);
  expect(erg.luft, 'er springt (Hopser)').toBe(true);
  expect(erg.gezeichnet, 'der Renderer zeichnet ihn').toBeGreaterThan(0);
  expect(erg.weg, 'er ist aufgelöst').toBe(true);
  // Je Bild laufen mehrere Takte: Kugeln mit Direkttreffer sind schon weg, bevor das erste Bild sie sieht. Die genaue
  // Zahl (fünf) belegt `tests/feuerwesen-fassung20.test.js` Takt für Takt.
  expect(erg.kugelnNachher, 'nach dem Zerbersten fliegen Feuerkugeln').toBeGreaterThan(0);
  expect(erg.kugelnNachher).toBeLessThanOrEqual(5);
  await expect(page.locator('#log-list')).toContainText(/Feuerwesen (zerbirst|verglüht)/);
  expect(fehler).toEqual([]);
});
