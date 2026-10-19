import { test, expect } from '@playwright/test';

/**
 * Messung der Geländeaktualisierung im echten Chrome (Software-Rasterung):
 * Terrain-Neuaufbau, Kraterupdate (`applyCrater`), Inselfall (Ablösen + Landen).
 *
 * Der Test MISST und berichtet (`console.log`, Annotationen) und schlägt nur bei
 * groben Ausfällen fehl (ein Kraterupdate über 200 ms wäre ein Hänger, kein Ruckler).
 * Vorher/Nachher-Werte der Optimierung stehen in MASTERDOTO.md, „Zerstörung Fassung 4".
 */

const SEED = 20260916;

async function startMatch(page) {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__PA__));
  await page.evaluate(() => window.__PA__.setAutoLoop(false));
  await page.locator('#cfg-seed').fill(String(SEED));
  await page.getByRole('button', { name: 'Match starten' }).click();
  await expect(page.locator('#menu-overlay')).toBeHidden();
  await page.waitForTimeout(500);
}

test('Geländeupdate: Neuaufbau, Krater und Inselfall werden gemessen', async ({ page }) => {
  test.slow();
  const fehler = [];
  page.on('pageerror', e => fehler.push(String(e)));
  await startMatch(page);

  const werte = await page.evaluate(() => {
    const r = window.__PA__.game.renderer;
    const q = r.terrainSource;
    // Canvas-Befehle laufen verzögert: ein 1x1-Lesen erzwingt, dass die Arbeit WIRKLICH erledigt ist.
    const flush = () => r.terrainLayer.getContext('2d').getImageData(0, 0, 1, 1);
    const median = a => [...a].sort((x, y) => x - y)[a.length >> 1];
    const neu = [];
    for (let i = 0; i < 5; i += 1) {
      const t0 = performance.now();
      r.buildTerrainLayer(q.bitmap, q.width, q.height);
      neu.push(performance.now() - t0);
    }
    // 24 Krater mit Tiefe (wie Fassung 2+), verteilt über die Karte.
    const krater = [];
    for (let i = 0; i < 24; i += 1) {
      const x = 200 + (i * 97) % (q.width - 400);
      const y = 500 + (i * 53) % 500;
      const t0 = performance.now();
      r.applyCrater(x, y, 30 + (i % 4) * 12, i % 3 === 0 ? 135 : 85);
      flush();
      krater.push(performance.now() - t0);
      r.time += 1;
    }
    // Eine große Insel (150 Spalten x 100 Zeilen) ablösen und landen lassen.
    const runs = [];
    for (let x = 600; x < 750; x += 1) runs.push(x, 300, 399);
    const t1 = performance.now();
    r.starteInsel(901, runs);
    flush();
    const ablösen = performance.now() - t1;
    const t2 = performance.now();
    r.landeInsel(901, runs, 80);
    flush();
    const landen = performance.now() - t2;
    return {
      neuaufbau: median(neu), kraterMedian: median(krater), kraterMax: Math.max(...krater),
      abloesenMs: ablösen, landenMs: landen,
    };
  });
  const zeile = `MESSUNG Neuaufbau ${werte.neuaufbau.toFixed(0)} ms | Krater Median ${werte.kraterMedian.toFixed(1)} ms, max ${werte.kraterMax.toFixed(1)} ms | Insel lösen ${werte.abloesenMs.toFixed(1)} ms, landen ${werte.landenMs.toFixed(1)} ms`;
  console.log(zeile);
  test.info().annotations.push({ type: 'Gelände', description: zeile });
  expect(werte.kraterMax, 'ein Kraterupdate darf nicht hängen').toBeLessThan(200);
  expect(fehler).toEqual([]);
});
