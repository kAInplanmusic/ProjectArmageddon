import { test, expect } from './helfer/test-basis.mjs';

/*
 * Touch (Handy, Querformat): Gehen (gehalten), Sprung links/rechts, Salto und Abwurf als Tasten; am Desktop (feiner Zeiger) unsichtbar.
 * Außerdem: Das Hauptmenü ist ein Dialog, und Spielfeld/HUD dahinter sind währenddessen `inert`.
 */
test.describe('Touch-Aktionen', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });

  test('Die Tasten erscheinen am eigenen Zug und lösen Sprung aus', async ({ page }) => {
    await page.goto('/');
    await page.fill('#cfg-seed', '4');
    await page.tap('#start-button');
    const tasten = page.locator('#touch-aktionen');
    await expect(tasten).toBeVisible({ timeout: 4000 });
    const box = await tasten.locator('[data-aktion=sprung-rechts]').boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    await page.waitForTimeout(600); // Figur setzt auf
    await tasten.locator('[data-aktion=sprung-rechts]').tap();
    await expect(page.locator('#log-list')).toContainText(/springt/i, { timeout: 3000 });
  });

  test('Die Gehen-Knöpfe laufen, solange sie gehalten werden, und halten beim Loslassen an', async ({ page }) => {
    await page.goto('/');
    await page.fill('#cfg-seed', '4');
    await page.tap('#start-button');
    const tasten = page.locator('#touch-laufen');
    await expect(tasten).toBeVisible({ timeout: 4000 });
    await expect.poll(() => page.evaluate(() => window.__PA__.isGrounded()), { timeout: 15000 }).toBe(true);
    const x = () => page.evaluate(() => {
      const s = window.__PA__.getState();
      return s.entities.find(e => e.entityId === s.activePlayerId).x;
    });
    expect((await tasten.locator('[data-laufen=rechts]').boundingBox()).height).toBeGreaterThanOrEqual(44);
    const x0 = await x();
    await tasten.locator('[data-laufen=rechts]').dispatchEvent('pointerdown', { button: 0, pointerId: 7, bubbles: true });
    await page.waitForTimeout(500);
    await tasten.locator('[data-laufen=rechts]').dispatchEvent('pointerup', { button: 0, pointerId: 7, bubbles: true });
    const x1 = await x();
    expect(x1 - x0, 'gehaltener Knopf läuft nach rechts').toBeGreaterThan(15);
    await page.waitForTimeout(300);
    expect(await x(), 'Loslassen hält an').toBe(x1);
  });
});

test('Am Desktop sind die Touch-Tasten unsichtbar; das Menü ist ein Dialog und sperrt das Spielfeld', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#menu-overlay')).toHaveAttribute('role', 'dialog');
  expect(await page.evaluate(() => document.getElementById('game-canvas').inert)).toBe(true);
  await page.fill('#cfg-seed', '4');
  await page.click('#start-button');
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => document.getElementById('game-canvas').inert)).toBe(false);
  await expect(page.locator('#touch-aktionen')).toBeHidden();
  await expect(page.locator('#touch-laufen')).toBeHidden();
});

test('Nur der ladende Finger schießt, eine unterbrochene Geste bricht ab', async ({ page }) => {
  await page.goto('/');
  const ergebnis = await page.evaluate(async () => {
    const { InputController } = await import('/src/client/input.js');
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 100;
    canvas.getBoundingClientRect = () => ({ left: 10, top: 10, width: 100, height: 50 });
    let schuesse = 0;
    const input = new InputController(canvas, { getOrigin: () => ({ x: 0, y: 0 }), onFire: () => schuesse++ });
    const sende = (ziel, typ, id) => ziel.dispatchEvent(new PointerEvent(typ, { pointerId: id, button: 0, clientX: 40, clientY: 20 }));
    sende(canvas, 'pointerdown', 1);
    sende(window, 'pointerup', 2);
    const laedt = input.isCharging;
    sende(window, 'pointercancel', 1);
    sende(window, 'pointerup', 1);
    const nachAbbruch = schuesse;
    sende(canvas, 'pointerdown', 3);
    sende(window, 'pointerup', 3);
    return { zeiger: input.pointer, laedt, nachAbbruch, schuesse };
  });
  expect(ergebnis).toEqual({ zeiger: { x: 60, y: 20 }, laedt: true, nachAbbruch: 0, schuesse: 1 });
});

test.describe('Touch zuerst (TODO 2.1)', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });

  test('Eine Knopfreihe: Seil ▲/▼ nur am Seil, keine Tastaturhinweise', async ({ page }) => {
    await page.goto('/');
    await page.fill('#cfg-seed', '4');
    await page.tap('#start-button');
    const tasten = page.locator('#touch-aktionen');
    await expect(tasten).toBeVisible({ timeout: 4000 });
    await expect(tasten.locator('[data-seil]')).toHaveCount(2);
    for (const knopf of await tasten.locator('[data-seil]').all()) await expect(knopf).toBeHidden();
    await expect(tasten.locator('[data-aktion=seil]')).toBeVisible();
    const hoehe = (await tasten.boundingBox()).height;
    expect(hoehe, 'eine Reihe (46 px Knöpfe)').toBeLessThan(60);
    // Touch-Texte statt Tasten: Zugpause und Kamera ohne Tastenangabe.
    await expect(page.locator('.zugpause-hinweis .nur-tastatur')).toBeHidden();
    await expect(page.locator('#hud-kamera kbd')).toBeHidden();
    expect(await page.locator('.zugpause-hinweis .nur-touch').textContent()).toBe('FEUER überspringt');
  });

  test('Die Kamera zählt die Knopfreihen als unteren Rand (Figur am Zug darüber)', async ({ page }) => {
    await page.goto('/');
    await page.fill('#cfg-seed', '4');
    await page.tap('#start-button');
    await expect(page.locator('#touch-aktionen')).toBeVisible({ timeout: 4000 });
    await expect.poll(() => page.evaluate(() => {
      const c = document.getElementById('game-canvas').getBoundingClientRect();
      const fy = c.height / document.getElementById('game-canvas').height;
      const oben = Math.min(...['touch-aktionen', 'touch-laufen'].map(id => document.getElementById(id).getBoundingClientRect().top));
      const unten = window.__PA__.game.kamera.rand.unten * fy; // CSS-Pixel unter der Knopfoberkante
      return Math.round(unten - (c.bottom - oben));
    }), { timeout: 5000, message: 'Kamerarand unten reicht bis zur Oberkante der Knopfreihen' }).toBeGreaterThanOrEqual(-1);
    // Die Zielanzeige (eine Zeile über den Laufknöpfen) ist am Telefon kein rechter Seitenrand: vorher 30 % der Breite.
    const rechts = await page.evaluate(() => window.__PA__.game.kamera.rand.rechts / document.getElementById('game-canvas').width);
    expect(rechts, 'rechter Kamerarand am Telefon').toBeLessThan(0.1);
  });
});

test('Am Desktop bleiben die Tastaturhinweise', async ({ page }) => {
  await page.goto('/');
  await page.fill('#cfg-seed', '4');
  await page.click('#start-button');
  await expect(page.locator('#hud-kamera kbd')).toBeVisible({ timeout: 4000 });
  await expect(page.locator('.zugpause-hinweis .nur-touch')).toBeHidden();
});
