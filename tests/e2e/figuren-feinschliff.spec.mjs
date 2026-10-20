/**
 * E2E: Figuren-Feinschliff — Typen, Hangneigung, Culling, Mip-Stufen, Figurenkarte.
 * Mit `PA_SHOTS=<Ordner>` werden Bilder abgelegt.
 */
import { test, expect } from '@playwright/test';

async function oeffne(page, { seed = '20260910', fraktionen = null } = {}) {
  const fehler = [];
  page.on('pageerror', e => fehler.push(String(e)));
  await page.goto('/');
  if (fraktionen) {
    await page.locator('#fraktion-auswahl summary').click();
    for (const [t, id] of fraktionen.entries()) await page.locator(`#cfg-fraktion-${t}`).selectOption(id);
  }
  await page.locator('#cfg-seed').fill(seed);
  await page.locator('#start-button').click();
  await expect(page.locator('#menu-overlay')).toBeHidden();
  return fehler;
}

test('Figuren tragen einen Typ, die Hangneigung bleibt unter 12 Grad, nur sichtbare werden gezeichnet', async ({ page }) => {
  const fehler = await oeffne(page, { fraktionen: ['xeno', 'machina'] });
  await page.waitForTimeout(2000);
  const m = await page.evaluate(() => {
    const r = window.__PA__.game.renderer;
    const zs = [...r.figurPosen.zustaende.values()];
    return {
      typen: zs.map(z => z.typ),
      neigung: zs.map(z => Math.abs(z.pose.neigung)),
      gezeichnet: r.figurStat.gezeichnet,
      stufe: r.figurStat.stufe,
    };
  });
  expect(m.typen.length).toBeGreaterThan(0);
  for (const t of m.typen) expect(['humanoid', 'tier', 'fahrzeug', 'schweber', 'wesen', 'schwarm']).toContain(t);
  for (const n of m.neigung) expect(n).toBeLessThanOrEqual(12 * Math.PI / 180 + 1e-6);
  expect(m.gezeichnet).toBeGreaterThan(0);
  // Sprite-Kante in Bildpunkten: dafür gibt es eine Mip-Stufe (64 bis 256).
  expect(m.stufe).toBeGreaterThan(40);
  expect(m.stufe).toBeLessThan(600);
  expect(fehler).toEqual([]);
});

test('Figurenkarte zeigt Klasse-Chips, Leben und Waffe; im niedrigen Fenster bleibt sie kompakt', async ({ page }) => {
  await oeffne(page, { fraktionen: ['pirates', 'machina'] });
  await page.waitForTimeout(1500);
  await expect(page.locator('#hud-figur')).toBeVisible();
  await expect(page.locator('#hud-figur-rolle')).not.toBeEmpty();
  await expect(page.locator('#hud-figur-klasse')).not.toBeEmpty();
  await expect(page.locator('#hud-figur-hp')).toHaveText(/^\d+ \/ \d+$/);
  await expect(page.locator('#hud-figur-waffe')).not.toBeEmpty();
  const hoch = await page.locator('#hud-figur').evaluate(e => e.getBoundingClientRect().height);
  expect(hoch).toBeLessThan(90);
  await page.setViewportSize({ width: 800, height: 400 });
  await page.waitForTimeout(400);
  await expect(page.locator('#hud-figur-rolle')).toBeHidden();
  const klein = await page.locator('#hud-figur').evaluate(e => e.getBoundingClientRect().height);
  expect(klein).toBeLessThan(50);
});

test('Mip-Stufen: kleine Anzeige nimmt kleine, große Anzeige große Stufe', async ({ page }) => {
  await oeffne(page);
  await page.waitForTimeout(1500);
  const w = await page.evaluate(async () => {
    const { stufeFuer } = await import('/src/client/figurStufen.js');
    const { holeFigur } = await import('/src/client/figurenBilder.js');
    const { CHARACTERS } = await import('/src/shared/config/factions.js');
    const fig = await new Promise((ok) => {
      const t = setInterval(() => { const f = holeFigur(CHARACTERS[0]); if (f) { clearInterval(t); ok(f); } }, 50);
    });
    return { klein: stufeFuer(fig, 60).kante, mittel: stufeFuer(fig, 110).kante, gross: stufeFuer(fig, 250).kante };
  });
  expect(w.klein).toBe(64);
  expect(w.mittel).toBe(128);
  expect(w.gross).toBe(256);
});

test('Reduzierte Bewegung: Posen bleiben ruhig, Spiel läuft fehlerfrei', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const fehler = await oeffne(page, { fraktionen: ['beasts', 'pixel'] });
  await page.waitForTimeout(1800);
  const p = await page.evaluate(() => [...window.__PA__.game.renderer.figurPosen.zustaende.values()]
    .map(z => ({ dy: z.pose.dy, sx: z.pose.sx, sy: z.pose.sy, rot: z.pose.rot, zug: z.pose.zug })));
  expect(p.length).toBeGreaterThan(0);
  for (const z of p) expect(z).toEqual({ dy: 0, sx: 1, sy: 1, rot: 0, zug: 0 });
  expect(fehler).toEqual([]);
});
