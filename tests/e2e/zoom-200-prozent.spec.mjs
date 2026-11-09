/**
 * E2E: 200-%-Browser-Zoom.
 *
 * ## Was 200 % Zoom technisch bedeutet
 *
 * Ein Browser-Zoom von 200 % halbiert die CSS-Fläche und verdoppelt
 * `devicePixelRatio`. Aus einem 1440×900-Fenster wird eine 720×450 große
 * CSS-Ansicht, die auf 1440×900 Gerätepixel gezeichnet wird. Genau das stellt
 * `test.use` hier ein — ohne echtes Gerät, ohne Screenshot-Vergleich und ohne
 * Baseline, die bei jeder Schriftänderung nachgezogen werden müsste.
 *
 * ## Warum das eine eigene Spezifikation braucht
 *
 * Bei halber CSS-Fläche passieren drei Fehler, die bei 100 % unsichtbar sind:
 *  1. Das Menü wird höher als das Fenster und der Startknopf ist mit der Maus
 *     nicht mehr erreichbar (der historische Befund zu `#profil-reset`).
 *  2. Das HUD schiebt Knöpfe aus dem Fenster, obwohl die Seite keinen
 *     horizontalen Überlauf meldet.
 *  3. Das Waffenmenü wächst über den Rand, statt in der Höhe zu scrollen.
 *
 * Geprüft wird deshalb die BEDIENBARKEIT (Rollen, Klicken, Scrollen), nicht ein
 * Pixelbild. `docs/testgrenzen.md` begrenzt Bildvergleiche bewusst auf die
 * Strukturprüfung; ein Zoom-Test über Baselines wäre dort eine zweite,
 * umgebungsabhängige Ampel.
 */
import { test, expect } from '@playwright/test';

test.use({
  // 1440×900 bei 200 % Zoom = 720×450 CSS-Pixel bei DPR 2.
  viewport: { width: 720, height: 450 },
  deviceScaleFactor: 2,
});

/** Rechteck in CSS-Pixeln, auf ganze Zahlen gerundet. */
async function rechteck(page, selektor) {
  const element = page.locator(selektor);
  await expect(element).toBeVisible();
  const box = await element.boundingBox();
  expect(box, `${selektor} hat kein Rechteck`).not.toBeNull();
  return {
    x: box.x, y: box.y, breite: box.width, hoehe: box.height,
    rechts: box.x + box.width, unten: box.y + box.height,
  };
}

/** Prüft, dass ein Rechteck vollständig im 720×450-Fenster liegt. */
function imFenster(name, box) {
  expect(box.x, `${name}: links außerhalb`).toBeGreaterThanOrEqual(-0.5);
  expect(box.y, `${name}: oben außerhalb`).toBeGreaterThanOrEqual(-0.5);
  expect(box.rechts, `${name}: rechts außerhalb`).toBeLessThanOrEqual(720.5);
  expect(box.unten, `${name}: unten außerhalb`).toBeLessThanOrEqual(450.5);
}

test('200 % Zoom: Menü scrollt, Startknopf ist mit der Maus erreichbar', async ({ page }) => {
  // DPR 2 zeichnet die vierfache Pixelzahl; der Start eines Matches ist auf
  // Software-Renderern entsprechend langsam. Die Zusagen bleiben unverändert.
  test.slow();
  const fehler = [];
  page.on('pageerror', error => fehler.push(String(error)));

  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__PA__));
  await page.evaluate(() => window.__PA__.setAutoLoop(false));

  // Die Emulation muss im Browser ankommen — sonst prüft der Test 100 %.
  expect(await page.evaluate(() => window.devicePixelRatio)).toBe(2);
  expect(await page.evaluate(() => window.innerWidth)).toBe(720);

  const seite = await page.evaluate(() => ({
    scrollBreite: document.documentElement.scrollWidth,
    clientBreite: document.documentElement.clientWidth,
  }));
  expect(seite.scrollBreite, 'Die Seite darf bei 200 % nicht seitlich scrollen')
    .toBeLessThanOrEqual(seite.clientBreite);

  // Die Menükarte ist der Scrollbehälter (max-height + overflow-y: auto).
  const karte = await page.evaluate(() => {
    const el = document.querySelector('#menu-overlay .overlay-card');
    const stil = getComputedStyle(el);
    return {
      scrollHoehe: el.scrollHeight,
      clientHoehe: el.clientHeight,
      scrollBreite: el.scrollWidth,
      clientBreite: el.clientWidth,
      overflowY: stil.overflowY,
    };
  });
  expect(karte.overflowY).toBe('auto');
  expect(karte.scrollHoehe, 'Bei 200 % muss die Menükarte höher sein als das Fenster')
    .toBeGreaterThan(karte.clientHoehe);
  expect(karte.scrollBreite, 'Die Menükarte darf nicht seitlich überlaufen')
    .toBeLessThanOrEqual(karte.clientBreite);

  // Der Startknopf liegt zunächst unterhalb des Fensters. Ein echtes Mausrad
  // über der Karte muss ihn hereinscrollen — Tastatur allein reicht nicht,
  // denn ein Mausspieler hat keine andere Möglichkeit.
  const start = page.locator('#start-button');
  const vorher = await start.boundingBox();
  expect(vorher.y, 'Der Startknopf liegt bei 200 % erwartungsgemäß unter dem Fenster')
    .toBeGreaterThan(450);

  await page.locator('#menu-overlay .overlay-card').hover();
  /*
   * In kleinen Schritten scrollen statt einmal ans Ende: Ein Sprung an das
   * Kartenende schiebt den Startknopf oben wieder hinaus. So verhält sich
   * auch ein Mausrad — der Test hält an, sobald das Ziel sichtbar ist.
   */
  const sichtbar = async () => {
    const box = await start.boundingBox();
    return Boolean(box && box.y >= 0 && box.y + box.height <= 450.5);
  };
  for (let i = 0; i < 15 && !(await sichtbar()); i += 1) {
    await page.mouse.wheel(0, 200);
    await page.waitForTimeout(40);
  }
  expect(await sichtbar(), 'Der Startknopf muss nach dem Scrollen vollständig sichtbar sein').toBe(true);

  await start.click();
  await expect(page.locator('#menu-overlay')).toBeHidden();
  await expect(page.locator('#hud')).toBeVisible();
  expect(await page.evaluate(() => window.__PA__?.game?.match?.status)).toBe('playing');
  expect(fehler).toEqual([]);
});

test('200 % Zoom: HUD-Knöpfe und Waffenmenü bleiben im Fenster', async ({ page }) => {
  test.slow();
  const fehler = [];
  page.on('pageerror', error => fehler.push(String(error)));

  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__PA__));
  await page.evaluate(() => window.__PA__.setAutoLoop(false));
  await page.locator('#start-button').click();
  await expect(page.locator('#menu-overlay')).toBeHidden();
  await page.waitForFunction(() => window.__PA__?.game?.match?.status === 'playing');
  // Einmal einschwingen lassen: HUD-Maße hängen am ersten Render.
  await page.waitForTimeout(1200);

  // Alle sichtbaren HUD-Teile müssen im Fenster liegen. Die Zielanzeige und
  // der Kameraschalter entfallen bei dieser Größe bewusst (kompaktes HUD).
  for (const selektor of ['#hud-top', '#hud-left', '#hud-log', '#hud-right', '#hud-fire', '#hud-menue-knopf']) {
    imFenster(selektor, await rechteck(page, selektor));
  }

  // Sichtbar ist nicht genug: Der Feuerknopf muss auch treffbar sein. Ein
  // darüberliegendes Panel würde den Klick abfangen.
  const treffer = await page.evaluate(() => {
    const knopf = document.getElementById('hud-fire');
    const box = knopf.getBoundingClientRect();
    const oben = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return {
      imKnopf: Boolean(oben && (oben === knopf || knopf.contains(oben))),
      tag: oben?.tagName ?? null,
      id: oben?.id ?? null,
    };
  });
  expect(treffer, `Feuerknopf ist verdeckt (oben: ${treffer.tag}#${treffer.id})`).toMatchObject({ imKnopf: true });

  // Waffenmenü: eigener Scrollbereich statt Überlauf aus dem Fenster.
  await page.keyboard.press('e');
  await expect(page.locator('#waffenmenue')).toBeVisible();
  imFenster('#waffenmenue', await rechteck(page, '#waffenmenue'));
  imFenster('#waffenmenue-schliessen', await rechteck(page, '#waffenmenue-schliessen'));

  const liste = await page.evaluate(() => {
    const el = document.getElementById('waffenmenue-liste');
    return { scrollHoehe: el.scrollHeight, clientHoehe: el.clientHeight, overflowY: getComputedStyle(el).overflowY };
  });
  expect(liste.overflowY).toBe('auto');
  expect(liste.scrollHoehe, 'Die Waffenliste muss bei 200 % scrollen statt abgeschnitten zu werden')
    .toBeGreaterThan(liste.clientHoehe);

  await page.keyboard.press('Escape');
  await expect(page.locator('#waffenmenue')).toBeHidden();

  // Auch im Match bleibt die Seite ohne seitlichen Überlauf.
  const seite = await page.evaluate(() => ({
    scrollBreite: document.documentElement.scrollWidth,
    clientBreite: document.documentElement.clientWidth,
  }));
  expect(seite.scrollBreite).toBeLessThanOrEqual(seite.clientBreite);
  expect(fehler).toEqual([]);
});
