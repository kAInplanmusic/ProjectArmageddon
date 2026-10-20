/**
 * E2E: Fraktionswahl je Team (reine Darstellung).
 *
 * Geprüft: Die Felder gibt es und folgen der Teamzahl; die Wahl erreicht den
 * Renderer; die Figuren werden mit Sprites gezeichnet (ein Spielbild mit
 * Fraktion unterscheidet sich vom Bild ohne); die Spielwerte bleiben gleich.
 * Mit `PA_SHOTS=<Ordner>` werden Bilder dort abgelegt.
 */
import { test, expect } from '@playwright/test';

async function starte(page, fraktionen) {
  const fehler = [];
  page.on('pageerror', e => fehler.push(String(e)));
  await page.goto('/');
  if (fraktionen) {
    await page.locator('#fraktion-auswahl summary').click();
    for (const [t, id] of fraktionen.entries()) await page.locator(`#cfg-fraktion-${t}`).selectOption(id);
  }
  await page.locator('#cfg-seed').fill('20260910');
  await page.getByRole('button', { name: 'Match starten' }).click();
  await expect(page.locator('#menu-overlay')).toBeHidden();
  return fehler;
}

test('Klassisch (ohne Figuren): die Figurenkarte bleibt verborgen', async ({ page }) => {
  await starte(page, ['klassisch', 'klassisch']);
  await page.waitForTimeout(500);
  await expect(page.locator('#hud-figur')).toBeHidden();
});

test('Fraktionsfelder folgen der Teamzahl, Standard ist Zufällig / Automatisch', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#cfg-fraktion-0')).toHaveValue('');
  await expect(page.locator('#cfg-fraktion-1')).toHaveCount(1);
  await expect(page.locator('#cfg-fraktion-2')).toHaveCount(0);
  const werte = await page.locator('#cfg-fraktion-0 option').evaluateAll(o => o.map(x => x.value));
  expect(werte.length).toBe(11);
  expect(werte.slice(0, 2)).toEqual(['', 'klassisch']);
});

test('Gewählte Fraktion erreicht den Renderer und wird als Sprite gezeichnet', async ({ page }) => {
  const fehler = await starte(page, ['pirates', 'machina']);
  const gewaehlt = await page.evaluate(() => window.__PA__.game.renderer.fraktionJeTeam);
  expect(gewaehlt).toEqual(['pirates', 'machina']);
  // Sprites laden lazy: ein paar Bilder zeichnen lassen.
  await page.waitForTimeout(1500);
  const bild = await page.locator('#game-canvas').screenshot();
  if (process.env.PA_SHOTS) {
    const fs = await import('node:fs');
    fs.writeFileSync(`${process.env.PA_SHOTS}/fraktion-${page.viewportSize().width}.png`, bild);
  }
  // Figurenkarte der aktiven Figur: Name aus dem Kader, Porträt vorhanden.
  await expect(page.locator('#hud-figur')).toBeVisible();
  await expect(page.locator('#hud-figur-name')).not.toBeEmpty();
  await expect(page.locator('#hud-figur-bild')).toHaveAttribute('src', /characters(-hd)?\/pirates\//);
  expect(bild.length).toBeGreaterThan(2000);
  expect(fehler).toEqual([]);
});
