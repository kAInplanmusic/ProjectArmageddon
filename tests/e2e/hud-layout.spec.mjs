/**
 * E2E: Das HUD verdeckt weder die aktive Figur noch ihr Schild.
 *
 * Anlass: Abnahme 2026-10-15 — die Figur links saß unter der Spielerliste, die
 * Schilder von Gipfel-Figuren unter der Kopfleiste. Geprüft in 1280x720,
 * 800x400 und Touch 844x390, über mehrere Zugwechsel und mehrere Seeds.
 * Gemessen wird über `window.__PA__.sichtbereich()` (gemessene DOM-Rechtecke,
 * keine Konstanten). Mit `PA_SHOTS=<Ordner>` werden Bilder abgelegt.
 */
import { test, expect } from '@playwright/test';

const FORMATE = [
  { name: 'd1280', viewport: { width: 1280, height: 720 } },
  { name: 'd800', viewport: { width: 800, height: 400 } },
  { name: 'touch844', viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true },
];
const SEEDS = ['20260910', '5', '77'];

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

async function ablegen(page, name) {
  if (!process.env.PA_SHOTS) return;
  const fs = await import('node:fs');
  fs.mkdirSync(process.env.PA_SHOTS, { recursive: true });
  fs.writeFileSync(`${process.env.PA_SHOTS}/${name}.png`, await page.screenshot());
}

/** Wartet, bis Kamera und Ausweichen eingeschwungen sind (weiches Nachziehen). */
async function einschwingen(page) {
  await page.waitForTimeout(1500);
}

async function pruefeAktive(page) {
  const d = await page.evaluate(() => window.__PA__.sichtbereich());
  expect(d).not.toBeNull();
  const aktive = d.figuren.find(f => f.aktiv);
  expect(aktive, 'aktive Figur vorhanden').toBeTruthy();
  const r = aktive.rechteck;
  // Kopf liegt unterhalb der Kopfleiste, die Figur wird von keinem deckenden HUD-Element berührt.
  expect(r.y, 'Kopf nicht unter der Kopfleiste').toBeGreaterThanOrEqual(d.sicher.y0 - 1);
  expect(aktive.verdeckt, `aktive Figur verdeckt (${JSON.stringify(r)})`).toBe(false);
  return d;
}

for (const f of FORMATE) {
  test.describe(`Größe ${f.name}`, () => {
    test.use({ viewport: f.viewport, ...(f.hasTouch ? { hasTouch: true, isMobile: true } : {}) });

    for (const seed of SEEDS) {
      test(`Seed ${seed}: aktive Figur liegt nach jedem Zugwechsel im sicheren Bereich`, async ({ page }) => {
        const fehler = await oeffne(page, seed);
        await einschwingen(page);
        for (let zug = 0; zug < 4; zug += 1) {
          const d = await pruefeAktive(page);
          // Der sichere Bereich ist gemessen: Kopfleiste oben abgezogen, nicht das ganze Fenster.
          expect(d.sicher.y0).toBeGreaterThan(20);
          expect(d.sicher.y1).toBeLessThanOrEqual(f.viewport.height);
          await ablegen(page, `hud-${f.name}-s${seed}-z${zug}`);
          const vorher = await page.evaluate(() => window.__PA__.activePlayerId());
          await page.evaluate(() => window.__PA__.fire(Math.PI / 4, 30));
          await page.waitForFunction(id => window.__PA__.activePlayerId() !== id, vorher, { timeout: 15000 });
          await einschwingen(page);
        }
        expect(fehler).toEqual([]);
      });
    }

    test('Ein Panel hinter einer Figur wird durchscheinend, sonst bleibt es deckend', async ({ page }) => {
      const fehler = await oeffne(page, '20260910');
      await einschwingen(page);
      const d = await page.evaluate(() => window.__PA__.sichtbereich());
      for (const id of d.weicht) {
        const op = await page.locator(`#${id}`).evaluate(el => Number(getComputedStyle(el).opacity));
        expect(op).toBeLessThan(0.5);
      }
      const deckend = await page.locator('#hud-top').evaluate(el => Number(getComputedStyle(el).opacity));
      expect(deckend).toBe(1);
      expect(fehler).toEqual([]);
    });
  });
}
