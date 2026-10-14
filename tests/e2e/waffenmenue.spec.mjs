import { test, expect } from '@playwright/test';

/*
 * Waffenmenü: Dropdown des Besitzes (Taste E / Knopf neben der Leiste).
 * Es zeigt die Waffen der Figur am Zug, gruppiert, mit Munition; Auswahl
 * wirkt wie die Zifferntasten.
 */
async function matchStarten(page, tap = false) {
  await page.goto('/');
  await page.fill('#cfg-seed', '4');
  if (tap) await page.tap('#start-button'); else await page.click('#start-button');
  await expect(page.locator('#menu-overlay')).toBeHidden();
  await expect(page.locator('#weapon-list .weapon-item').first()).toBeVisible();
}

const aktiveWaffe = page => page.evaluate(() => {
  const s = window.__PA__.getState();
  return s.entities.find(e => e.entityId === s.activePlayerId).activeWeaponId;
});

test.describe('Waffenmenü (Desktop)', () => {
  test('E öffnet und schließt, Esc schließt, Knopf zeigt den Zustand', async ({ page }) => {
    await matchStarten(page);
    await expect(page.locator('#waffenmenue')).toBeHidden();
    await page.keyboard.press('e');
    await expect(page.locator('#waffenmenue')).toBeVisible();
    await expect(page.locator('#waffen-menue-knopf')).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(page.locator('#waffenmenue')).toBeHidden();
    await expect(page.locator('#waffen-menue-knopf')).toHaveAttribute('aria-expanded', 'false');
  });

  test('Das Menü listet den Besitz, gruppiert, mit Munition', async ({ page }) => {
    await matchStarten(page);
    await page.keyboard.press('e');
    const optionen = page.locator('#waffenmenue [role=option]');
    const hudAnzahl = await page.locator('#weapon-list .weapon-item').count();
    await expect(optionen).toHaveCount(hudAnzahl);
    expect(await page.locator('#waffenmenue [role=group]').count()).toBeGreaterThan(0);
    await expect(page.locator('#waffenmenue [role=listbox]')).toBeVisible();
    for (const text of await optionen.locator('.wm-munition').allTextContents()) {
      expect(text).toMatch(/^(∞|\d+\/\d+)$/);
    }
    // Genau eine Waffe ist als gewählt markiert.
    await expect(page.locator('#waffenmenue [role=option][aria-selected=true]')).toHaveCount(1);
  });

  test('Pfeil + Enter wählt eine Waffe und schließt; die Leiste folgt', async ({ page }) => {
    await matchStarten(page);
    const vorher = await aktiveWaffe(page);
    await page.keyboard.press('e');
    // Auf eine andere Waffe gehen.
    const ids = await page.evaluate(() => window.__PA__.waffenMenue().ids);
    const ziel = ids.find(id => id !== vorher);
    expect(ziel).toBeTruthy();
    for (let i = 0; i < ids.length && (await page.evaluate(() => window.__PA__.waffenMenue().aktiveId)) !== ziel; i++) {
      await page.keyboard.press('ArrowDown');
    }
    await page.keyboard.press('Enter');
    await expect(page.locator('#waffenmenue')).toBeHidden();
    expect(await aktiveWaffe(page)).toBe(ziel);
    await expect(page.locator(`#weapon-list .weapon-item.is-active[data-weapon-id="${ziel}"]`)).toHaveCount(1);
  });

  test('Klick wählt, Hover zeigt Schaden und Radius', async ({ page }) => {
    await matchStarten(page);
    await page.click('#waffen-menue-knopf');
    await expect(page.locator('#waffenmenue')).toBeVisible();
    const vorher = await aktiveWaffe(page);
    const ziel = page.locator(`#waffenmenue [role=option]:not([data-weapon-id="${vorher}"]):not(.is-leer)`).first();
    await ziel.hover();
    await expect(page.locator('#waffenmenue-info')).toContainText(/Schaden \d+/);
    await expect(page.locator('#waffenmenue-info')).toContainText(/Radius|Flächenschaden/);
    const id = await ziel.getAttribute('data-weapon-id');
    await ziel.click();
    await expect(page.locator('#waffenmenue')).toBeHidden();
    expect(await aktiveWaffe(page)).toBe(id);
  });

  test('Offenes Menü: Leertaste/Pfeile steuern das Spiel nicht', async ({ page }) => {
    await matchStarten(page);
    const winkel = () => page.evaluate(() => window.__PA__.game.aim.angle);
    const a0 = await winkel();
    await page.keyboard.press('e');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('a');
    expect(await winkel()).toBe(a0);
    expect(await page.evaluate(() => window.__PA__.getState().projectiles.length)).toBe(0);
  });

  test('Klick aufs Spielfeld schließt das Menü, ohne zu schießen', async ({ page }) => {
    await matchStarten(page);
    await page.keyboard.press('e');
    await page.mouse.click(120, 200);
    await expect(page.locator('#waffenmenue')).toBeHidden();
    expect(await page.evaluate(() => window.__PA__.getState().projectiles.length)).toBe(0);
  });

  test('Q-Abwurf-Hinweis bleibt in der Tastenliste, E ist ergänzt', async ({ page }) => {
    await page.goto('/');
    const keymap = page.locator('.keymap').first();
    await expect(keymap).toContainText('Waffe abwerfen');
    await expect(keymap).toContainText('Waffenmenü');
  });
});

test.describe('Waffenmenü (Touch, Querformat)', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });

  test('Der Knopf hat einen großen Tippbereich und öffnet/schließt das Menü', async ({ page }) => {
    await matchStarten(page, true);
    const knopf = page.locator('#waffen-menue-knopf');
    const box = await knopf.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    await knopf.tap();
    await expect(page.locator('#waffenmenue')).toBeVisible();
    const menue = await page.locator('#waffenmenue').boundingBox();
    expect(menue.y).toBeGreaterThanOrEqual(0);
    expect(menue.y + menue.height).toBeLessThanOrEqual(390);
    const zeile = await page.locator('#waffenmenue [role=option]').first().boundingBox();
    expect(zeile.height).toBeGreaterThanOrEqual(44);
    await knopf.tap();
    await expect(page.locator('#waffenmenue')).toBeHidden();
  });

  test('Antippen einer Waffe wählt sie', async ({ page }) => {
    await matchStarten(page, true);
    const vorher = await aktiveWaffe(page);
    await page.locator('#waffen-menue-knopf').tap();
    const ziel = page.locator(`#waffenmenue [role=option]:not([data-weapon-id="${vorher}"]):not(.is-leer)`).first();
    const id = await ziel.getAttribute('data-weapon-id');
    await ziel.tap();
    await expect(page.locator('#waffenmenue')).toBeHidden();
    expect(await aktiveWaffe(page)).toBe(id);
  });
});
