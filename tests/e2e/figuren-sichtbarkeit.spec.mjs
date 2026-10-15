/**
 * E2E: Figuren sind gut sichtbar und die Standard-Automatik ordnet Fraktionen zu.
 *
 * Geprüft: Ohne Menüwahl bekommt jedes Team eine eigene Fraktion (deterministisch
 * aus dem Seed); „Klassisch" zeigt die alte Figur; die Bildschirmhöhe der Figur
 * liegt bei 1280x720 / 800x400 / Touch im vorgesehenen Bereich; die Hitbox
 * bleibt unverändert. Mit `PA_SHOTS=<Ordner>` werden Bilder abgelegt.
 */
import { test, expect } from '@playwright/test';

const FORMATE = [
  { name: 'd1280', viewport: { width: 1280, height: 720 }, min: 70, max: 100 },
  { name: 'd800', viewport: { width: 800, height: 400 }, min: 60, max: 100 },
  { name: 'touch844', viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, min: 60, max: 100 },
];

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

async function ablegen(page, name) {
  if (!process.env.PA_SHOTS) return;
  const fs = await import('node:fs');
  fs.mkdirSync(process.env.PA_SHOTS, { recursive: true });
  fs.writeFileSync(`${process.env.PA_SHOTS}/${name}.png`, await page.screenshot());
}

test('Ohne Menüwahl bekommt jedes Team automatisch eine eigene Fraktion (deterministisch)', async ({ page }) => {
  const fehler = await oeffne(page);
  const erste = await page.evaluate(() => window.__PA__.game.renderer.fraktionJeTeam);
  expect(erste).toHaveLength(2);
  expect(erste[0]).toBeTruthy();
  expect(erste[1]).toBeTruthy();
  expect(erste[0]).not.toBe(erste[1]);
  // Gleicher Seed, zweiter Aufbau: dieselbe Zuordnung.
  const zweite = await page.evaluate(async () => {
    const { loeseFraktionen } = await import('/src/shared/config/darstellung.js');
    return loeseFraktionen(null, 2, window.__PA__.game.match.seedManager.baseSeed);
  });
  expect(zweite).toEqual(erste);
  await page.waitForTimeout(1200);
  await expect(page.locator('#hud-figur')).toBeVisible();
  expect(fehler).toEqual([]);
});

test('„Klassisch" zeigt die alte Figur ohne Sprites und ohne Figurenkarte', async ({ page }) => {
  await oeffne(page, { fraktionen: ['klassisch', 'klassisch'] });
  const liste = await page.evaluate(() => window.__PA__.game.renderer.fraktionJeTeam);
  expect(liste).toEqual([null, null]);
  await page.waitForTimeout(600);
  await expect(page.locator('#hud-figur')).toBeHidden();
});

test('Menü: Automatisch ist Standard, dazu Klassisch und alle neun Fraktionen', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#cfg-fraktion-0')).toHaveValue('');
  const optionen = await page.locator('#cfg-fraktion-0 option').evaluateAll(o => o.map(x => [x.value, x.textContent]));
  expect(optionen).toHaveLength(11);
  expect(optionen[0][1]).toMatch(/Automatisch/);
  expect(optionen[1]).toEqual(['klassisch', 'Klassisch (ohne Figuren)']);
});

for (const f of FORMATE) {
  test.describe(`Größe ${f.name}`, () => {
    const { name, viewport, hasTouch, isMobile } = f;
    test.use({ viewport, ...(hasTouch ? { hasTouch, isMobile } : {}) });

    test(`Figur hat ${f.min}-${f.max} px Bildschirmhöhe, Hitbox unverändert`, async ({ page }) => {
      const fehler = await oeffne(page, { fraktionen: ['pirates', 'machina'] });
      await page.waitForTimeout(1800);
      const m = await page.evaluate(() => {
        const r = window.__PA__.game.renderer;
        return { skala: r.figurSkala, zoom: (r.kamera?.zoom ?? 1) * r.cssFaktor };
      });
      // Sichtbare Höhe = Basishöhe 52 px * 0,93 (Rand) * Skala * Zoom
      const px = 52 * 0.93 * m.skala * m.zoom;
      expect(px).toBeGreaterThanOrEqual(f.min);
      expect(px).toBeLessThanOrEqual(f.max);
      const halb = await page.evaluate(async () => (await import('/src/shared/config/player.js')).PLAYER_HALF_HEIGHT);
      expect(halb).toBe(10);
      await ablegen(page, `${name}-pirates-machina`);
      expect(fehler).toEqual([]);
    });

    test('Weitere Fraktionspaare werden sauber gezeichnet', async ({ page }) => {
      const fehler = await oeffne(page, { seed: '77', fraktionen: ['xeno', 'beasts'] });
      await page.waitForTimeout(1800);
      await ablegen(page, `${name}-xeno-beasts`);
      expect(fehler).toEqual([]);
    });
  });
}
