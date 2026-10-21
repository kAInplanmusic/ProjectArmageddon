/**
 * E2E: Hintergrundmusik — Bedienung und Zustand.
 *
 * Playwright setzt `navigator.webdriver`; damit ist die WIEDERGABE standardmäßig
 * aus (siehe `wiedergabeErlaubt`), Schalter, Regler und Taste M arbeiten aber
 * auf dem Zustand und werden über `window.__PA__.musik()` gelesen. Kein
 * echtes Audio nötig. Ein Test erzwingt die Wiedergabe mit `?musik=1`, um den
 * Weg Geste → Stück → Stimmungswechsel im echten Browser zu prüfen.
 */
import { test, expect } from '@playwright/test';

const zustand = page => page.evaluate(() => window.__PA__.musik());

async function starteMatch(page) {
  await page.evaluate(() => window.__PA__.setAutoLoop(false));
  await page.evaluate(
    options => window.__PA__.startMatch(options),
    { seed: 20260910, teams: 2, playersPerTeam: 2, preset: 'hills' },
  );
  await expect(page.locator('#menu-overlay')).toBeHidden();
}

test.describe('Musik', () => {
  test('In Tests ist die Wiedergabe aus, auch nach Klick und Taste', async ({ page }) => {
    await page.goto('/');
    await page.mouse.click(5, 5);
    await page.keyboard.press('Shift');
    const z = await zustand(page);
    expect(z.aktiv).toBe(false);
    expect(z.gestartet).toBe(false);
    expect(z.starts).toBe(0);
    expect(z.spielt).toBe(false);
    expect(z.an).toBe(true);
    expect(z.lautstaerke).toBe(0.35);
    await expect(page.locator('#menu-overlay [data-musik-titel]')).toContainText('aus');
  });

  test('?musik=0 startet nichts (auch mit erzwingender Geste)', async ({ page }) => {
    await page.goto('/?musik=0');
    await page.mouse.click(5, 5);
    await page.keyboard.press('a');
    await starteMatch(page);
    const z = await zustand(page);
    expect(z.aktiv).toBe(false);
    expect(z.starts).toBe(0);
    expect(z.gestartet).toBe(false);
    // Es wurde nicht einmal ein Audio-Element angelegt.
    expect(await page.evaluate(() => document.querySelectorAll('audio').length)).toBe(0);
  });

  test('Schalter im Menü: aria-pressed, Zustand und HUD-Kopie bleiben gleich', async ({ page }) => {
    await page.goto('/');
    const menue = page.locator('#menu-overlay [data-musik-schalter]');
    const hud = page.locator('#musik-hud [data-musik-schalter]');
    await expect(menue).toHaveAttribute('aria-pressed', 'true');
    await expect(menue).toBeVisible();
    expect(await menue.boundingBox().then(b => b.height)).toBeGreaterThanOrEqual(44);

    await menue.click();
    await expect(menue).toHaveAttribute('aria-pressed', 'false');
    await expect(hud).toHaveAttribute('aria-pressed', 'false');
    await expect(menue).toContainText('Musik aus');
    expect((await zustand(page)).an).toBe(false);

    await menue.click();
    await expect(menue).toHaveAttribute('aria-pressed', 'true');
    expect((await zustand(page)).an).toBe(true);
  });

  test('Regler stellt die Lautstärke und bleibt nach dem Neuladen erhalten', async ({ page }) => {
    await page.goto('/');
    const regler = page.locator('#menu-overlay [data-musik-regler]');
    await expect(regler).toHaveValue('35');
    await regler.fill('70');
    expect((await zustand(page)).lautstaerke).toBeCloseTo(0.7, 5);
    await expect(page.locator('#musik-hud [data-musik-regler]')).toHaveValue('70');

    await page.reload();
    expect((await zustand(page)).lautstaerke).toBeCloseTo(0.7, 5);
    await expect(page.locator('#menu-overlay [data-musik-regler]')).toHaveValue('70');
    await page.evaluate(() => localStorage.removeItem('pa.musik.v1'));
  });

  test('Taste M schaltet stumm/laut, aber nicht beim Tippen in ein Textfeld', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.removeItem('pa.musik.v1'));
    await page.reload();
    await page.locator('body').click({ position: { x: 3, y: 3 } });
    await page.keyboard.press('m');
    expect((await zustand(page)).an).toBe(false);
    await page.keyboard.press('M');
    expect((await zustand(page)).an).toBe(true);

    await page.locator('#cfg-seed').click();
    await page.keyboard.type('mm1');
    expect((await zustand(page)).an).toBe(true);
    await expect(page.locator('#cfg-seed')).toHaveValue('mm1');
    // Strg+M ist ein Browserkürzel und schaltet nichts.
    await page.locator('body').click({ position: { x: 3, y: 3 } });
    await page.keyboard.press('Control+m');
    expect((await zustand(page)).an).toBe(true);
  });

  test('Im Spiel: HUD-Bedienung sichtbar, M wirkt, Titelanzeige da', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.removeItem('pa.musik.v1'));
    await page.reload();
    await starteMatch(page);
    const hud = page.locator('#musik-hud');
    await expect(hud).toBeVisible();
    await expect(hud.locator('[data-musik-schalter]')).toHaveAttribute('aria-pressed', 'true');
    await hud.locator('[data-musik-schalter]').click();
    expect((await zustand(page)).an).toBe(false);
    await page.keyboard.press('m');
    expect((await zustand(page)).an).toBe(true);
    await hud.locator('[data-musik-regler]').fill('10');
    expect((await zustand(page)).lautstaerke).toBeCloseTo(0.1, 5);
    expect((await zustand(page)).stimmung).toBe('match');
    await page.evaluate(() => localStorage.removeItem('pa.musik.v1'));
  });

  test('Erzwungene Wiedergabe (?musik=1): Start nach Geste, Titel, Stimmungswechsel', async ({ page }) => {
    const fehler = [];
    page.on('pageerror', e => fehler.push(String(e)));
    await page.goto('/?musik=1');
    await page.evaluate(() => localStorage.removeItem('pa.musik.v1'));
    await page.reload();
    let z = await zustand(page);
    expect(z.aktiv).toBe(true);
    expect(z.gestartet).toBe(false);
    expect(z.stimmung).toBe('menu');

    await page.mouse.click(5, 5);
    await expect.poll(async () => (await zustand(page)).gestartet).toBe(true);
    z = await zustand(page);
    expect(z.starts).toBe(1);
    expect(['heathcliff', 'thief']).toContain(z.id);
    await expect(page.locator('#menu-overlay [data-musik-titel]')).toHaveText(`Läuft: ${z.titel}`);
    // Genau ein Audio-Element, nicht die ganze Bibliothek.
    expect(await page.evaluate(() => document.querySelectorAll('audio').length)).toBeLessThanOrEqual(2);

    await starteMatch(page);
    await expect.poll(async () => (await zustand(page)).stimmung).toBe('match');
    z = await zustand(page);
    expect(z.ueberblendungen).toBe(1);
    expect(z.verlauf.length).toBe(2);
    expect(z.verlauf[0]).not.toBe(z.verlauf[1]);

    // Stumm: Stücke pausieren, ohne Fehler.
    await page.keyboard.press('m');
    await expect.poll(async () => (await zustand(page)).spielt).toBe(false);
    expect(fehler).toEqual([]);
    await page.evaluate(() => localStorage.removeItem('pa.musik.v1'));
  });

  test('Fraktionshymne im Menü: Anwahl spielt sie, Wechsel tauscht, Match-Start blendet aus', async ({ page }) => {
    await page.goto('/?musik=1');
    await page.evaluate(() => localStorage.removeItem('pa.musik.v1'));
    await page.reload();
    await page.mouse.click(5, 5);
    await expect.poll(async () => (await zustand(page)).gestartet).toBe(true);
    await page.locator('#fraktion-auswahl > summary').click();
    const feld = page.locator('#cfg-fraktion-0');
    await feld.selectOption('xeno');
    await expect.poll(async () => (await zustand(page)).id).toBe('hymne-xeno');
    await expect(page.locator('#menu-overlay [data-musik-titel]')).toContainText('Hymne: ');
    await feld.selectOption('pirates');
    await expect.poll(async () => (await zustand(page)).id).toBe('hymne-pirates');
    // Höchstens eine Hymne zugleich: ein Audio-Element spielt, höchstens zwei existieren.
    expect(await page.evaluate(() => document.querySelectorAll('audio').length)).toBeLessThanOrEqual(2);
    await feld.selectOption('');
    await expect.poll(async () => (await zustand(page)).hymne).toBe(null);
    await feld.selectOption('pixel');
    await expect.poll(async () => (await zustand(page)).hymne).toBe('pixel');
    await starteMatch(page);
    await expect.poll(async () => (await zustand(page)).hymne).toBe(null);
    const z = await zustand(page);
    expect(z.stimmung).toBe('match');
    expect(z.id).not.toMatch(/^hymne-/);
    await page.evaluate(() => localStorage.removeItem('pa.musik.v1'));
  });
});
