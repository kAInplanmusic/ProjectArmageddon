import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FORMATE, oeffneMenue, oeffneLobby, starteHud } from './helfer/ux-zustand.mjs';

/**
 * Visuelle Baselines für Menü, Lobby und HUD.
 *
 * Zwei Formate: Desktop 1280x720 und Hochformat 390x844. Der Vergleich läuft
 * über `toHaveScreenshot` mit `maxDiffPixelRatio: 0.02`; Animationen sind
 * abgeschaltet, das HUD wird mit festem Seed und eingefrorener Renderer-Zeit
 * gezeichnet.
 *
 * Mit `PA_UX_LOOK=1` legt der Lauf zusätzlich die Desktop-Bilder unter
 * `test-results/ux-look/` ab (nicht versioniert, Beleg für den UX-Audit).
 */

const OPTIONEN = {
  animations: 'disabled',
  caret: 'hide',
  maxDiffPixelRatio: 0.02,
};

const LOOK_DIR = fileURLToPath(new URL('../../test-results/ux-look/', import.meta.url));

/** Schreibt das aktuelle Bild nur auf Wunsch als Audit-Beleg. */
async function merkeLook(page, name) {
  if (process.env.PA_UX_LOOK !== '1') return;
  mkdirSync(LOOK_DIR, { recursive: true });
  await page.screenshot({ path: `${LOOK_DIR}${name}.png`, animations: 'disabled' });
}

for (const [formatName, viewport] of Object.entries(FORMATE)) {
  test.describe(`Format ${formatName}`, () => {
    test.use({ viewport });

    test(`Menü ${formatName}`, async ({ page }) => {
      const fehler = await oeffneMenue(page);
      await expect(page.locator('#menu-overlay')).toBeVisible();
      await page.locator('#menu-overlay .overlay-card').evaluate(el => { el.scrollTop = 0; });
      await merkeLook(page, `menue-${formatName}`);
      await expect(page).toHaveScreenshot(`menue-${formatName}.png`, OPTIONEN);
      expect(fehler).toEqual([]);
    });

    test(`Lobby ${formatName}`, async ({ page }) => {
      const fehler = await oeffneMenue(page);
      const lobby = await oeffneLobby(page);
      await lobby.evaluate(el => el.scrollIntoView({ block: 'start' }));
      await merkeLook(page, `lobby-${formatName}`);
      await expect(page).toHaveScreenshot(`lobby-${formatName}.png`, OPTIONEN);
      expect(fehler).toEqual([]);
    });

    test(`HUD ${formatName}`, async ({ page }) => {
      const fehler = await oeffneMenue(page);
      await starteHud(page);
      await merkeLook(page, `hud-${formatName}`);
      await expect(page).toHaveScreenshot(`hud-${formatName}.png`, OPTIONEN);
      expect(fehler).toEqual([]);
    });
  });
}
