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
 *
 * ## Wenn ein Vergleich rot wird — erst messen, dann nachziehen
 *
 * Die abgelegten Bilder hängen an der RENDER-UMGEBUNG (Schriftmetriken,
 * Rasterung), nicht nur am Code. Der Dateiname trägt nur `-chromium-linux`; zwei
 * verschiedene Linux-Rechner landen also auf demselben Namen. Am 2026-10-25
 * waren `lobby-390x844` und `hud-390x844` aus genau diesem Grund rot: 0,04
 * Abweichung gegen 0,02 Toleranz, obwohl der Code nichts geändert hatte.
 *
 * `--update-snapshots` ist deshalb **kein Reflex**. Erst diese drei Messungen,
 * zusammen etwa zwei Minuten:
 *
 * 1. **Läuft es stabil?** Denselben Test dreimal laufen lassen und die Bilder
 *    vergleichen (`PA_UX_LOOK=1` schreibt sie nach `test-results/ux-look/`).
 *    Streuen die Läufe untereinander nur um wenige Pixel, ist der Zustand
 *    eingefroren und der Fehler echt — kein Flake.
 * 2. **Hat der Code es verursacht?** Denselben Test auf dem Stand VOR dem
 *    verdächtigen Commit laufen lassen. Kommt dasselbe Bild heraus, liegt es
 *    nicht am Code, sondern an der Umgebung.
 * 3. **Passt ein Versatz?** Verschiebt das Bild um ±2 px: halbiert das den
 *    Fehler, ist es ein Layout-Versatz (meist Schriftmetriken), kein
 *    Inhaltsunterschied.
 *
 * Erst wenn 1–3 gegen „Code" sprechen, ist das Nachziehen richtig — und dann
 * **nur die roten Dateien**, nicht der ganze Satz:
 *
 *     npx playwright test tests/e2e/visuell.spec.mjs \
 *       -g "Lobby 390x844|HUD 390x844" --update-snapshots
 *
 * Danach zweimal vollständig laufen lassen. Ein einzelnes Grün beweist nichts —
 * eine Basis, die nur zufällig einmal passt, ist keine Basis.
 *
 * Was NICHT in Frage kommt: `maxDiffPixelRatio` hochsetzen, damit es grün wird.
 * Dann prüft der Vergleich nichts mehr und meldet trotzdem Erfolg.
 */

const OPTIONEN = {
  animations: 'disabled',
  caret: 'hide',
  maxDiffPixelRatio: 0.02,
};

/*
 * NUR LOKAL — der Grund steht in `docs/testgrenzen.md`, Abschnitt „Bildvergleiche".
 *
 * Die abgelegten Bilder hängen an der Render-Umgebung (Schriftmetriken,
 * Rasterung), nicht nur am Code. Gemessen am 2026-10-25: derselbe Code auf einem
 * anderen Rechner ergab 104.130 abweichende Pixel (31,6 %). Ein Vergleich, der
 * auf einer fremden Maschine läuft, prüft also nicht das Spiel, sondern den
 * Unterschied zwischen zwei Rechnern.
 *
 * Deshalb setzt die CI `PA_OHNE_BILDVERGLEICH=1`. Die Tests verschwinden dabei
 * NICHT stillschweigend, sondern erscheinen als übersprungen MIT dieser
 * Begründung — ein Gate, das man nicht sieht, ist keines.
 *
 * Lokal (Variable nicht gesetzt) laufen sie normal und sind das Gate.
 */
const OHNE_BILDVERGLEICH = process.env.PA_OHNE_BILDVERGLEICH === '1';

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

    // In der CI übersprungen, mit sichtbarer Begründung (siehe oben und
    // docs/testgrenzen.md). Lokal ist diese Zeile wirkungslos.
    test.skip(OHNE_BILDVERGLEICH,
      'Bildvergleiche nur auf dem Rechner, auf dem die Baselines entstanden sind — siehe docs/testgrenzen.md');

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
