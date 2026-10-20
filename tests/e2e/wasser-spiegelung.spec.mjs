/**
 * E2E: Wasserspiegelung (reine Optik im Wasserdurchlauf des Renderers) kostet höchstens 10 % Bildzeit.
 *
 * Gemessen wird die Zeit von `renderer.render` selbst (nicht der Bildtakt: der klebt am vsync und
 * würde jede Mehrarbeit unter 16,7 ms verschlucken). Abwechselnd ohne und mit Spiegelung, je Runde
 * 120 Bilder; verglichen werden die Mediane der Rundenmittel. Bei sehr kleiner absoluter Bildzeit
 * (unter 0,3 ms Unterschied) gilt der Unterschied als Messrauschen.
 */
import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 1280, height: 720 } });

function messeRunde(page, mit, bilder) {
  return page.evaluate(async ({ mit, bilder }) => {
    const r = window.__PA__.game.renderer;
    r.spiegelung = mit;
    const original = r.render.bind(r);
    const zeiten = [];
    r.render = (...args) => {
      const t0 = performance.now();
      const ergebnis = original(...args);
      zeiten.push(performance.now() - t0);
      return ergebnis;
    };
    await new Promise((fertig) => {
      const schritt = () => (zeiten.length >= bilder ? fertig() : requestAnimationFrame(schritt));
      requestAnimationFrame(schritt);
    });
    r.render = original;
    const sortiert = [...zeiten].sort((a, b) => a - b);
    return { mittel: zeiten.reduce((s, z) => s + z, 0) / zeiten.length, median: sortiert[Math.floor(sortiert.length / 2)] };
  }, { mit, bilder });
}

test('Spiegelung: höchstens 10 % mehr Renderzeit, und das Wasser sieht anders aus', { timeout: 120_000 }, async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__PA__));
  await page.locator('#cfg-seed').fill('20260916');
  await page.locator('#start-button').click();
  await expect(page.locator('#menu-overlay')).toBeHidden();
  await page.waitForTimeout(800);

  const ohne = [];
  const mit = [];
  for (let runde = 0; runde < 3; runde += 1) {
    ohne.push((await messeRunde(page, false, 120)).mittel);
    mit.push((await messeRunde(page, true, 120)).mittel);
  }
  const median = a => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
  const a = median(ohne);
  const b = median(mit);
  test.info().annotations.push({ type: 'renderzeit', description: `ohne ${a.toFixed(3)} ms, mit ${b.toFixed(3)} ms` });
  console.log(`Renderzeit ohne ${a.toFixed(3)} ms, mit ${b.toFixed(3)} ms (${((b / a - 1) * 100).toFixed(1)} %)`);
  expect(b - a <= 0.3 || b <= a * 1.1, `ohne ${a.toFixed(3)} ms, mit ${b.toFixed(3)} ms`).toBe(true);

  // Die Spiegelung verändert das Bild: Wasserebene mit und ohne unterscheidet sich.
  const unterschied = await page.evaluate(() => {
    const r = window.__PA__.game.renderer;
    const lies = () => {
      r.wasserFertig = false;
      r.render(window.__PA__.getState(), { water: window.__PA__.getMatch()?.water ?? null, wasserNeu: true });
      return r.waterCtx.getImageData(0, 0, r.waterLayer.width, r.waterLayer.height).data.slice();
    };
    r.spiegelung = false;
    const aus = lies();
    r.spiegelung = true;
    const an = lies();
    let n = 0;
    for (let i = 0; i < an.length; i += 4) if (an[i] !== aus[i] || an[i + 1] !== aus[i + 1] || an[i + 2] !== aus[i + 2]) n += 1;
    return n;
  });
  expect(unterschied).toBeGreaterThan(100);
});
