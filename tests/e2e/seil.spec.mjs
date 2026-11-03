/**
 * E2E: Seil (Ninja Rope, Seilfassung 2) im echten lokalen Spiel, nur über Tasten.
 *
 *   F Seil wählen · Leertaste (Feuer) schießt das Seil im Zielwinkel · D/A schwingen · W einholen · Leertaste löst
 *
 * Der Zielwinkel wird vorher so gesetzt, dass das Seil Halt findet (Abtastung mit derselben Strahlfunktion wie der
 * Motor, `engine/seil.js#seilStrahl`); alles Weitere läuft über die Tastatur wie beim Spieler.
 */
import { test, expect } from '@playwright/test';

async function oeffne(page) {
  const fehler = [];
  page.on('pageerror', e => fehler.push(String(e)));
  await page.goto('/');
  await page.locator('#cfg-seed').fill('10');
  // Höhlenkarte: über der Figur liegt Gelände, an dem das Seil Halt findet.
  await page.locator('#cfg-erweitert').evaluate(d => { d.open = true; });
  await page.locator('#cfg-kartenart').selectOption('hoehle');
  await page.locator('#start-button').click();
  await expect(page.locator('#menu-overlay')).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.__PA__.isGrounded()), { timeout: 15000 }).toBe(true);
  return fehler;
}

const seil = page => page.evaluate(() => {
  const s = window.__PA__.getState();
  const e = s.entities.find(q => q.entityId === s.activePlayerId);
  const anker = s.seil?.punkte?.at(-1) ?? [e.x, e.y];
  return { haengt: Boolean(s.seil?.haengt), laenge: s.seil?.laenge ?? 0, abstand: Math.hypot(e.x - anker[0], e.y - anker[1]), x: e.x, y: e.y, id: s.activePlayerId };
});

/** Sucht einen Zielwinkel, unter dem das Seil der Figur am Zug Halt findet, und stellt ihn ein. */
async function zieleAufHalt(page) {
  return page.evaluate(async () => {
    const { seilStrahl } = await import('/src/engine/seil.js');
    const game = window.__PA__.game;
    const m = game.match;
    const id = m.activePlayerId;
    const x = m.world.getComponent(id, 'Position', 'x');
    const y = m.world.getComponent(id, 'Position', 'y');
    for (let i = 0; i <= 90; i += 1) {
      const w = i % 2 === 0 ? Math.PI / 2 - (i / 2) * 0.034 : Math.PI / 2 + ((i + 1) / 2) * 0.034;
      if (w < 0 || w > Math.PI) continue;
      const r = seilStrahl(m.terrain, x, y, w, m.seilSystem.maxLaenge);
      if (r.treffer && r.laenge > 60) { game.input.setAngle(w); game.aim.angle = w; return w; }
    }
    return null;
  });
}

async function tippe(page, taste, ms = 60) {
  await page.keyboard.down(taste);
  await page.waitForTimeout(ms);
  await page.keyboard.up(taste);
}

test('Seil: F wählen, im Sprung schießen, D schwingt, W holt ein, Feuer löst', async ({ page }) => {
  const fehler = await oeffne(page);
  expect(await page.evaluate(() => Boolean(window.__PA__.game.match.seilSystem)), 'neue Partien haben das Seil').toBe(true);

  await tippe(page, 'f');
  expect(await page.evaluate(() => window.__PA__.game.seilSteuerung.gewaehlt)).toBe(true);
  // Wie in Worms: abspringen und im Flug das Seil schießen — dann hängt die Figur frei.
  await tippe(page, 'Enter');
  await page.waitForTimeout(220);
  const winkel = await zieleAufHalt(page);
  expect(winkel, 'Testaufbau: es gibt einen Winkel mit Halt').not.toBeNull();
  await tippe(page, ' ', 30);
  await expect.poll(async () => (await seil(page)).haengt, { timeout: 3000 }).toBe(true);
  const start = await seil(page);

  // Schwingen: D gehalten, die Figur pendelt am Seil.
  await page.keyboard.down('d');
  await page.waitForTimeout(900);
  await page.keyboard.up('d');
  const geschwungen = await seil(page);
  expect(geschwungen.haengt).toBe(true);
  expect(Math.hypot(geschwungen.x - start.x, geschwungen.y - start.y), 'die Figur schwingt').toBeGreaterThan(5);

  // Einholen: W gehalten verkürzt das Seil (und zielt dabei nicht).
  const winkelVorher = await page.evaluate(() => window.__PA__.game.aim.angle);
  await page.keyboard.down('w');
  await page.waitForTimeout(700);
  await page.keyboard.up('w');
  const eingeholt = await seil(page);
  expect(eingeholt.haengt).toBe(true);
  expect(eingeholt.laenge, 'W holt das Seil ein').toBeLessThan(geschwungen.laenge - 10);
  expect(await page.evaluate(() => window.__PA__.game.aim.angle), 'am Seil wird mit W nicht gezielt').toBe(winkelVorher);

  // Lösen: Feuer mit gewähltem Seil.
  await tippe(page, ' ');
  await expect.poll(async () => (await seil(page)).haengt, { timeout: 3000 }).toBe(false);
  expect(fehler).toEqual([]);
});

test('Seil: im Waffenmenü als Werkzeug wählbar', async ({ page }) => {
  const fehler = await oeffne(page);
  await tippe(page, 'e');
  await expect(page.locator('#waffenmenue')).toBeVisible();
  const zeile = page.locator('#wm-o-seil');
  await expect(zeile).toBeVisible();
  await zeile.click();
  await expect(page.locator('#waffenmenue')).toBeHidden();
  expect(await page.evaluate(() => window.__PA__.game.seilSteuerung.gewaehlt)).toBe(true);
  expect(fehler).toEqual([]);
});
