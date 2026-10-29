import { test, expect } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FORMATE, oeffneMenue, oeffneLobby, starteHud } from './helfer/ux-zustand.mjs';
import { vergleicheStruktur, GRENZEN } from './helfer/struktur-vergleich.mjs';

/**
 * Visuelle Baselines für Menü, Lobby und HUD.
 *
 * Zwei Formate: Desktop 1280x720 und Hochformat 390x844. Animationen sind
 * abgeschaltet, das HUD wird mit festem Seed und eingefrorener Renderer-Zeit
 * gezeichnet.
 *
 * ## Wie verglichen wird (seit 2026-10-29: Struktur statt Pixel)
 *
 * Bis dahin zählte `toHaveScreenshot` abweichende Pixel (`maxDiffPixelRatio` 0,02).
 * Das hing an der Render-Umgebung: Schriftmetriken und Rasterung verschieben Text
 * um 1–2 px, und am 2026-10-25 waren zwei Vergleiche rot (0,04 gegen 0,02), obwohl
 * der Code nichts geändert hatte (VIS-1, `docs/offene-punkte.md`).
 *
 * Jetzt vergleicht `helfer/struktur-vergleich.mjs`: Kanten mit Spielraum (±8 px),
 * Flächenfarben mit Spielraum und die örtliche Häufung fehlender Kanten. Versatz
 * und anders geglättete Buchstaben fallen heraus; ein fehlender Knopf, ein neues
 * Element, eine andere Flächenfarbe oder ein anderes Layout nicht. Empfindlichkeit
 * UND Unempfindlichkeit sind in `tests/struktur-vergleich.test.js` gemessen.
 *
 * **Grenze, ehrlich:** Der Vergleich deckt Rasterung und kleinen Versatz ab, NICHT
 * einen Rechner mit anderer Schriftbreite, auf dem Zeilen anders umbrechen — das
 * ist eine Layoutänderung, und von einem fehlenden Element strukturell nicht zu
 * unterscheiden. Gegen die Altbilder des fremden Rechners (VIS-1) besteht das
 * HUD, die Lobby nicht (7,8 % Kanten, Umbruch der Zeile „Fraktion je Team“).
 *
 * **Läuft überall, auch in der CI** (seit 2026-10-29). Belegt: Die Baselines entstanden auf
 * einem Entwicklungsrechner; zwei Läufe auf einem GitHub-Runner (Branch
 * `ci/bildvergleich-probe`, ohne Sperre) ergaben je 6 von 6 grün. Das alte
 * Pixelverfahren war dort nicht tragfähig (VIS-1).
 *
 * Mit `PA_UX_LOOK=1` legt der Lauf zusätzlich die Bilder unter
 * `test-results/ux-look/` ab (nicht versioniert, Beleg für den UX-Audit).
 *
 * ## Wenn ein Vergleich rot wird
 *
 * Die Meldung nennt, WAS abweicht (Kanten, Farben, Häufung); das aktuelle Bild
 * hängt am Testbericht. Dann erst messen, dann nachziehen:
 *
 * 1. **Stabil?** Dreimal laufen lassen; streuen die Läufe nur minimal, ist der
 *    Zustand eingefroren und die Abweichung echt.
 * 2. **Code?** Auf dem Stand VOR dem verdächtigen Commit laufen lassen. Kommt
 *    dasselbe Bild heraus, liegt es an der Umgebung.
 *
 * Erst wenn beides gegen „Code" spricht, ist das Nachziehen richtig, und dann nur
 * die roten Bilder:
 *
 *     PA_BILDER_NEU=1 npx playwright test tests/e2e/visuell.spec.mjs \
 *       -g "Lobby 390x844"
 *
 * Danach zweimal vollständig laufen lassen. Was NICHT in Frage kommt: die Grenzen
 * in `GRENZEN` hochsetzen, damit es grün wird — dann prüft der Vergleich nichts mehr.
 */

const BILDER = fileURLToPath(new URL('./visuell.spec.mjs-snapshots/', import.meta.url));
const NEU_ERZEUGEN = process.env.PA_BILDER_NEU === '1';

/**
 * Prüft das aktuelle Bild gegen die abgelegte Basis.
 *
 * Wartet vorher auf die Webfonts und zwei Bildläufe: Der Menü-Zustand lädt
 * Schriftschnitte erst beim ersten Gebrauch nach (z. B. Exo 2 in Fettdruck beim
 * Aufklappen der Lobby). Ein Bild, das davor entsteht, trägt eine Ersatzschrift
 * und ist eine Zufallsmessung.
 */
async function pruefeBild(page, name) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
  const ist = await page.screenshot({ animations: 'disabled', caret: 'hide' });
  const pfad = `${BILDER}${name}-chromium-linux.png`;
  if (NEU_ERZEUGEN) {
    mkdirSync(BILDER, { recursive: true });
    writeFileSync(pfad, ist);
    return;
  }
  expect(existsSync(pfad), `Keine Basis ${name}. Anlegen mit PA_BILDER_NEU=1`).toBe(true);
  const urteil = vergleicheStruktur(readFileSync(pfad), ist, GRENZEN);
  if (!urteil.ok) {
    await test.info().attach(`${name}-ist.png`, { body: ist, contentType: 'image/png' });
  }
  expect(urteil.ok, `${name}: ${urteil.grund}`).toBe(true);
}

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
      await pruefeBild(page, `menue-${formatName}`);
      expect(fehler).toEqual([]);
    });

    test(`Lobby ${formatName}`, async ({ page }) => {
      const fehler = await oeffneMenue(page);
      const lobby = await oeffneLobby(page);
      await lobby.evaluate(el => el.scrollIntoView({ block: 'start' }));
      await merkeLook(page, `lobby-${formatName}`);
      await pruefeBild(page, `lobby-${formatName}`);
      expect(fehler).toEqual([]);
    });

    test(`HUD ${formatName}`, async ({ page }) => {
      const fehler = await oeffneMenue(page);
      await starteHud(page);
      await merkeLook(page, `hud-${formatName}`);
      await pruefeBild(page, `hud-${formatName}`);
      expect(fehler).toEqual([]);
    });
  });
}
