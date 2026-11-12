/**
 * E2E: Menü-Auswahl der Kartengröße `kolossal` und der runden Kartenarten (Geländefassung 14, TODO N-40).
 *
 * Geprüft (Chromium, Desktop-Bildschirm und Touch-Handy-Emulation):
 *  - deutsche Beschriftung und aria-describedby auf den Hinweisabsatz (role=status)
 *  - Wahl von kolossal oder einer runden Art stellt das Format auf 1:1 und erklärt es im Hinweis
 *  - kolossal: gesperrt auf iOS (Browserkennung) und bei Lite (kein WebGL2 in der Prüfumgebung), mit Warnung bei Ultra
 *  - eine runde Art wird als Match gestartet (lokal, 1:1 klein) und kommt in der Engine an
 *
 * NICHT geprüft: Aussehen und echte Berührbedienung auf einem Gerät (Sichtabnahme offen), ein kolossal-Match im Browser (33 Mio. px).
 */
import { test, expect } from '@playwright/test';

const oeffne = async (page) => {
  await page.goto('/');
  await page.locator('#cfg-erweitert').evaluate(d => { d.open = true; });
  await expect(page.locator('#cfg-kartengroesse')).toBeVisible();
};

/** Ersatz-WebGL2 für abgelöste Prüf-Canvas (Gerätemessung): kein Software-Renderer, genug Shader-Speicher → Grafik „Ultra“ ist möglich. */
const FAKE_WEBGL = () => {
  const echt = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (art, ...rest) {
    if (art === 'webgl2' && !this.isConnected) return { getExtension: () => null, getParameter: () => 1024, MAX_FRAGMENT_UNIFORM_VECTORS: 1 };
    return echt.call(this, art, ...rest);
  };
  Object.defineProperty(navigator, 'hardwareConcurrency', { value: 8 });
};

test('Beschriftung deutsch, Felder verweisen auf den Hinweis, Kartenart-Gruppe „Rund“ mit drei Arten', async ({ page }) => {
  await oeffne(page);
  await expect(page.locator('#cfg-kartengroesse option[value="kolossal"]')).toHaveText(/Kolossal · 55 s · sehr groß, nur 1:1/);
  const gruppe = page.locator('#cfg-kartenart optgroup');
  await expect(gruppe).toHaveAttribute('label', /Rund/);
  await expect(gruppe.locator('option')).toHaveText(['Runder Planet', 'Runde Höhle', 'Schwebende Insel']);
  for (const id of ['cfg-kartengroesse', 'cfg-kartenformat', 'cfg-kartenart']) {
    await expect(page.locator(`#${id}`)).toHaveAttribute('aria-describedby', 'cfg-kartenwahl-hinweis');
  }
  const hinweis = page.locator('#cfg-kartenwahl-hinweis');
  await expect(hinweis).toHaveAttribute('role', 'status');
  await expect(hinweis).toHaveAttribute('aria-live', 'polite');
});

test('Runde Art wählen stellt das Format auf 1:1 und sagt es; Formatwechsel danach wird erklärt, nicht überstimmt', async ({ page }) => {
  // Mit Ersatz-WebGL2 gilt Grafik „Ultra“: kein Sperrhinweis zu Kolossal, der Hinweisabsatz zeigt nur die Format-Sätze.
  await page.addInitScript(FAKE_WEBGL);
  await oeffne(page);
  await expect(page.locator('#cfg-kartenformat')).toHaveValue('24:9');
  await page.selectOption('#cfg-kartenart', 'rundeHoehle');
  await expect(page.locator('#cfg-kartenformat')).toHaveValue('1:1');
  const hinweis = page.locator('#cfg-kartenwahl-hinweis');
  await expect(hinweis).toBeVisible();
  await expect(hinweis).toContainText('Format auf 1:1 gestellt, weil die runde Karte nur dort gilt');
  await page.selectOption('#cfg-kartenformat', '16:9');
  await expect(page.locator('#cfg-kartenformat')).toHaveValue('16:9');
  await expect(hinweis).toContainText('Format 1:1 gebaut');
  await page.selectOption('#cfg-kartenart', '');
  await expect(hinweis).toBeHidden();
});

test('kolossal bei Ultra: wählbar mit Warnung, zieht das Format auf 1:1', async ({ page }) => {
  await page.addInitScript(FAKE_WEBGL);
  await oeffne(page);
  await page.selectOption('#cfg-grafik', 'ultra');
  const option = page.locator('#cfg-kartengroesse option[value="kolossal"]');
  await expect(option).toHaveJSProperty('disabled', false);
  await page.selectOption('#cfg-kartengroesse', 'kolossal');
  await expect(page.locator('#cfg-kartenformat')).toHaveValue('1:1');
  const hinweis = page.locator('#cfg-kartenwahl-hinweis');
  await expect(hinweis).toHaveAttribute('data-stufe', 'warnung');
  await expect(hinweis).toContainText('sehr groß (33,2 Mio. Pixel)');
  await expect(hinweis).toContainText('Format auf 1:1 gestellt');
  // Wechsel auf Lite sperrt die Stufe und fällt auf Riesig zurück.
  await page.selectOption('#cfg-grafik', 'lite');
  await expect(option).toHaveJSProperty('disabled', true);
  await expect(page.locator('#cfg-kartengroesse')).toHaveValue('riesig');
  await expect(hinweis).toHaveAttribute('data-stufe', 'gesperrt');
  await expect(hinweis).toContainText('Mit Grafik „Lite“ gesperrt');
});

test('kolossal auf iOS (Browserkennung iPhone): gesperrt mit Grund, Touch-Bedienung der Felder ≥ 44 px', async ({ browser }) => {
  const kontext = await browser.newContext({
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true,
  });
  const page = await kontext.newPage();
  try {
    await page.addInitScript(FAKE_WEBGL);
    await oeffne(page);
    const option = page.locator('#cfg-kartengroesse option[value="kolossal"]');
    await expect(option).toHaveJSProperty('disabled', true);
    await expect(option).toHaveText(/\(gesperrt\)$/);
    const hinweis = page.locator('#cfg-kartenwahl-hinweis');
    await expect(hinweis).toBeVisible();
    await expect(hinweis).toContainText('Auf iPhone und iPad gesperrt');
    await expect(hinweis).toContainText('16,7 Mio.');
    for (const id of ['cfg-kartengroesse', 'cfg-kartenformat', 'cfg-kartenart']) {
      const box = await page.locator(`#${id}`).boundingBox();
      expect(box.height, `#${id} Berührfläche`).toBeGreaterThanOrEqual(44);
    }
    // Die runden Arten bleiben auf iOS wählbar (sie sind nicht größer als die bisherigen Karten).
    await page.selectOption('#cfg-kartenart', 'schwebendeInsel');
    await expect(page.locator('#cfg-kartenformat')).toHaveValue('1:1');
  } finally {
    await kontext.close();
  }
});

test('Start einer runden Karte (Runder Planet, 1:1 klein): Kartenart und Maße kommen im Match an', async ({ page }) => {
  const fehler = [];
  page.on('pageerror', e => fehler.push(String(e)));
  await oeffne(page);
  await page.selectOption('#cfg-kartengroesse', 'klein');
  await page.selectOption('#cfg-kartenart', 'rundPlanet');
  await expect(page.locator('#cfg-kartenformat')).toHaveValue('1:1');
  await page.locator('#start-button').click();
  await expect(page.locator('#menu-overlay')).toBeHidden();
  await page.waitForFunction(() => window.__PA__?.game?.match?.status === 'playing', null, { timeout: 30_000 });
  const stand = await page.evaluate(() => { const m = window.__PA__.game.match; return { art: m.kartenart, b: m.width, h: m.height }; });
  expect(stand).toEqual({ art: 'rundPlanet', b: 960, h: 960 });
  expect(fehler).toEqual([]);
});
