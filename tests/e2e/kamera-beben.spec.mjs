/**
 * E2E: Erdbebenzittern (`terrain_quake`, Zerstörung Fassung 4) zusammen mit der Kameraführung.
 *
 * Das Ereignis wirkt nur online; hier wird dieselbe Anzeige (`renderer.bebenOptik`) lokal
 * über `__PA__.beben` ausgelöst und im echten Browser vermessen: zeitlich begrenzt, höchstens
 * 5 px, keine Sprünge von Bild zu Bild, keine bleibende Kameraabweichung, HUD-Bereich bleibt
 * stehen, Schießen bleibt möglich; bei „Bewegung reduzieren" kein Zittern.
 */
import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 1280, height: 720 } });

async function oeffne(page, seed) {
  const fehler = [];
  page.on('pageerror', e => fehler.push(String(e)));
  await page.goto('/');
  await page.locator('#fraktion-auswahl summary').click();
  await page.locator('#cfg-fraktion-0').selectOption('pirates');
  await page.locator('#cfg-fraktion-1').selectOption('machina');
  await page.locator('#cfg-seed').fill(seed);
  await page.locator('#start-button').click();
  await expect(page.locator('#menu-overlay')).toBeHidden();
  return fehler;
}

/** Wartet, bis die Kamera in der Übersicht steht und still ist. */
async function ruhe(page) {
  await page.waitForFunction(() => {
    const k = window.__PA__.kamera();
    if (!k || k.phase !== 'uebersicht') { window.__ruhe = null; return false; }
    const s = `${k.x.toFixed(1)}|${k.y.toFixed(1)}|${k.zoom.toFixed(3)}`;
    if (!window.__ruhe || window.__ruhe.s !== s) { window.__ruhe = { s, t: performance.now() }; return false; }
    return performance.now() - window.__ruhe.t > 400;
  }, undefined, { timeout: 12000, polling: 50 });
}

/** Löst ein Beben aus und tastet Ruck und Kamera je Bild ab. */
function beben(page) {
  return page.evaluate(() => new Promise((ok) => {
    const api = window.__PA__;
    const s = api.getState();
    const a = s.entities.find(e => e.entityId === s.activePlayerId);
    const vor = api.kamera();
    const proben = [];
    const t0 = performance.now();
    api.beben({ x: a.x + 150, y: a.y + 20, radius: 120, staerke: 1 });
    const schritt = () => {
      const r = api.ruck();
      const k = api.kamera();
      const sb = api.sichtbereich();
      proben.push({ t: performance.now() - t0, rx: r.x, ry: r.y, x: k.x, y: k.y, zoom: k.zoom, sicher: sb.sicher.y0 });
      if (performance.now() - t0 < 2500) requestAnimationFrame(schritt);
      else ok({ vor, nach: api.kamera(), proben });
    };
    requestAnimationFrame(schritt);
  }));
}

test('Zittern ist begrenzt, ohne bleibende Verschiebung, Kamera und HUD unberührt', async ({ page }) => {
  const fehler = await oeffne(page, '20260910');
  await ruhe(page);
  const m = await beben(page);
  const betrag = m.proben.map(p => Math.hypot(p.rx, p.ry));
  expect(Math.max(...betrag), 'Zittern sichtbar').toBeGreaterThan(0.1);
  expect(Math.max(...betrag), 'höchstens 5 px (Lesbarkeitsgrenze)').toBeLessThanOrEqual(5.01);
  let sprung = 0;
  for (let i = 1; i < m.proben.length; i += 1) {
    sprung = Math.max(sprung, Math.hypot(m.proben[i].rx - m.proben[i - 1].rx, m.proben[i].ry - m.proben[i - 1].ry));
  }
  expect(sprung, `größte Verschiebung von Bild zu Bild: ${sprung.toFixed(2)} px`).toBeLessThanOrEqual(10.1);
  const ende = m.proben.filter(p => p.t > 2000);
  expect(ende.length).toBeGreaterThan(0);
  for (const p of ende) { expect(p.rx).toBe(0); expect(p.ry).toBe(0); }
  expect(m.nach.x).toBeCloseTo(m.vor.x, 6);
  expect(m.nach.y).toBeCloseTo(m.vor.y, 6);
  expect(m.nach.zoom).toBeCloseTo(m.vor.zoom, 6);
  expect(new Set(m.proben.map(p => p.sicher.toFixed(2))).size, 'HUD-Bereich bleibt stehen').toBe(1);
  for (const p of m.proben) expect(Math.abs(p.x - m.vor.x)).toBeLessThan(1e-6);
  // Spielbar: Schießen während des Zitterns.
  await page.evaluate(() => window.__PA__.beben({ x: 600, y: 700, radius: 120, staerke: 1 }));
  const id = await page.evaluate(() => window.__PA__.activePlayerId());
  await page.evaluate(() => window.__PA__.fire(Math.PI / 4, 40));
  await page.waitForFunction(i => window.__PA__.activePlayerId() !== i, id, { timeout: 20000 });
  expect(fehler).toEqual([]);
});

test('Bewegung reduzieren: kein Zittern', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await oeffne(page, '20260910');
  await ruhe(page);
  const m = await beben(page);
  for (const p of m.proben) { expect(p.rx).toBe(0); expect(p.ry).toBe(0); }
  expect(m.nach.x).toBeCloseTo(m.vor.x, 6);
});
