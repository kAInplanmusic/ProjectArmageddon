/**
 * E2E: Einstellungs-Dropdown im HUD (Entscheidung 2026-11-04: „Musikschalter und ähnliche unwichtige Buttons in
 * Dropdown-Einstellungsmenü").
 *
 * Geprüft: Spielinfos bleiben in der Kopfzeile sichtbar, die selten gebrauchten Knöpfe liegen im Dropdown;
 * öffnen/schließen per Knopf, Esc und Tipp daneben (der Tipp schießt nicht); aria-expanded/aria-controls;
 * Tastatur (Enter öffnet, Pfeile wandern, Esc gibt den Fokus zurück) ohne Spieleingaben (kein Schuss, kein
 * Zielen); Musik schalten; Aufgeben fragt nach (Nein = weiter, Ja = Spielende); Berührflächen ≥ 44 px.
 */
import { test, expect } from '@playwright/test';

async function starte(page) {
  const fehler = [];
  page.on('pageerror', e => fehler.push(String(e)));
  await page.goto('/');
  await page.evaluate(() => localStorage.removeItem('pa.musik.v1'));
  await page.reload();
  await page.locator('#start-button').click();
  await expect(page.locator('#menu-overlay')).toBeHidden();
  await page.waitForFunction(() => window.__PA__?.game?.match?.status === 'playing');
  return fehler;
}

const musikAn = page => page.evaluate(() => window.__PA__.musik().an);
const zustand = page => page.evaluate(() => {
  const m = window.__PA__.game.match;
  return { projektile: m.activeProjectileCount, tick: m.world.tickCount, laedt: window.__PA__.game.input?.isCharging ?? null, winkel: window.__PA__.game.aim?.angle };
});

test('Kopfzeile: Spielinfos sichtbar, Musik/Verlassen/Aufgeben erst im geöffneten Dropdown', async ({ page }) => {
  const fehler = await starte(page);
  for (const sel of ['#hud-round', '#hud-wind', '#hud-timer', '#hud-status']) await expect(page.locator(sel)).toBeVisible();
  const knopf = page.locator('#hud-menue-knopf');
  await expect(knopf).toBeVisible();
  await expect(knopf).toHaveAttribute('aria-expanded', 'false');
  await expect(knopf).toHaveAttribute('aria-controls', 'hud-menue');
  for (const sel of ['#musik-hud', '#hud-abort', '#hud-aufgeben', '#hud-ton']) await expect(page.locator(sel)).toBeHidden();
  const box = await knopf.boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.width).toBeGreaterThanOrEqual(44);

  await knopf.click();
  await expect(knopf).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#hud-menue')).toBeVisible();
  for (const sel of ['#musik-hud', '#hud-abort', '#hud-aufgeben', '#hud-ton', '#kamera-beben',
    '#hud-menue [data-kamera-effekt]']) await expect(page.locator(sel).first()).toBeVisible();
  for (const sel of ['#hud-menue [data-musik-schalter]', '#hud-ton', '#hud-abort', '#hud-aufgeben',
    '#kamera-beben', '#hud-menue [data-kamera-effekt]']) {
    expect((await page.locator(sel).first().boundingBox()).height, `${sel} Berührfläche`).toBeGreaterThanOrEqual(44);
  }
  // Knopf schließt wieder.
  await knopf.click();
  await expect(page.locator('#hud-menue')).toBeHidden();
  await expect(knopf).toHaveAttribute('aria-expanded', 'false');
  expect(fehler).toEqual([]);
});

test('Esc schließt und gibt den Fokus an den Knopf zurück; Tipp daneben schließt und schießt nicht', async ({ page }) => {
  const fehler = await starte(page);
  const knopf = page.locator('#hud-menue-knopf');
  await knopf.click();
  await expect(page.locator('#hud-menue')).toBeVisible();
  // Fokus liegt im Dropdown (erster Eintrag).
  expect(await page.evaluate(() => document.getElementById('hud-menue').contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('#hud-menue')).toBeHidden();
  await expect(knopf).toBeFocused();

  await knopf.click();
  await expect(page.locator('#hud-menue')).toBeVisible();
  const vorher = await zustand(page);
  const canvas = await page.locator('#game-canvas').boundingBox();
  await page.mouse.click(canvas.x + canvas.width * 0.5, canvas.y + canvas.height * 0.55);
  await expect(page.locator('#hud-menue')).toBeHidden();
  await page.waitForTimeout(400);
  const nachher = await zustand(page);
  expect(nachher.projektile, 'der Tipp daneben feuert nicht').toBe(0);
  expect(vorher.projektile).toBe(0);
  expect(fehler).toEqual([]);
});

test('Tastatur: Enter öffnet, Pfeile wandern, Leertaste schaltet Musik ohne Schuss, M wirkt weiter', async ({ page }) => {
  const fehler = await starte(page);
  const knopf = page.locator('#hud-menue-knopf');
  await knopf.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#hud-menue')).toBeVisible();
  const schalter = page.locator('#hud-menue [data-musik-schalter]');
  await expect(schalter).toBeFocused();

  // Pfeil runter: zum Regler; der braucht die Pfeile selbst, also mit Tab weiter zu „Effekte".
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#hud-menue [data-musik-regler]')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#hud-ton')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#hud-abort')).toBeFocused();
  // Seit KAMERA C6 steht die Gruppe „Kameraeffekte" hinter „Aufgeben": Ende ist ihr letzter Knopf.
  await page.keyboard.press('End');
  await expect(page.locator('#hud-menue [data-kamera-effekt="ketten"]')).toBeFocused();
  await page.keyboard.press('Home');
  await expect(schalter).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('#hud-menue [data-kamera-effekt="ketten"]')).toBeFocused();
  await page.keyboard.press('Home');

  // Leertaste auf dem Musikschalter: schaltet die Musik, feuert nicht und zielt nicht.
  const vorher = await zustand(page);
  expect(await musikAn(page)).toBe(true);
  await page.keyboard.down(' ');
  await page.waitForTimeout(250);
  await page.keyboard.up(' ');
  await page.waitForTimeout(300);
  expect(await musikAn(page)).toBe(false);
  const nachher = await zustand(page);
  expect(nachher.projektile, 'Leertaste im Dropdown feuert nicht').toBe(0);
  expect(nachher.winkel, 'Pfeile im Dropdown zielen nicht').toBe(vorher.winkel);

  // Kürzel M bleibt wirksam, auch mit Fokus im Dropdown.
  await page.keyboard.press('m');
  expect(await musikAn(page)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('#hud-menue')).toBeHidden();
  await page.evaluate(() => localStorage.removeItem('pa.musik.v1'));
  expect(fehler).toEqual([]);
});

test('Musik schalten per Tipp im Dropdown; Dropdown bleibt dabei offen', async ({ page }) => {
  const fehler = await starte(page);
  await page.locator('#hud-menue-knopf').click();
  const schalter = page.locator('#hud-menue [data-musik-schalter]');
  await schalter.click();
  await expect(schalter).toHaveAttribute('aria-pressed', 'false');
  expect(await musikAn(page)).toBe(false);
  await expect(page.locator('#hud-menue')).toBeVisible();
  await schalter.click();
  expect(await musikAn(page)).toBe(true);
  await page.evaluate(() => localStorage.removeItem('pa.musik.v1'));
  expect(fehler).toEqual([]);
});

test('Kameraeffekte: Beben schaltet durch, Schalter wirken und bleiben gespeichert', async ({ page }) => {
  const fehler = await starte(page);
  await page.evaluate(() => localStorage.removeItem('pa.kameraeffekte'));
  await page.reload();
  await page.locator('#start-button').click();
  await expect(page.locator('#menu-overlay')).toBeHidden();
  await page.locator('#hud-menue-knopf').click();

  const beben = page.locator('#kamera-beben');
  const stand = () => page.evaluate(() => window.__PA__.kameraEffekte());
  await expect(beben).toContainText('Beben: Normal');
  await beben.click();
  expect((await stand()).beben).toBe('stark');
  await beben.click();
  expect((await stand()).beben).toBe('aus');
  expect((await stand()).bebenFaktor).toBe(0);
  await expect(beben).toContainText('Beben: Aus');
  // Gespeichert, nicht nur im Speicher des Tabs.
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pa.kameraeffekte')).beben)).toBe('aus');

  const knapp = page.locator('#hud-menue [data-kamera-effekt="knapp"]');
  await knapp.click();
  await expect(knapp).toHaveAttribute('aria-pressed', 'false');
  await expect(knapp).toContainText('Knapp vorbei: aus');
  expect((await stand()).knapp).toBe(false);

  // Nach dem Neuladen gilt die Wahl weiter (vor dem Matchstart gelesen).
  await page.reload();
  await page.locator('#start-button').click();
  await expect(page.locator('#menu-overlay')).toBeHidden();
  const nach = await stand();
  expect(nach.beben).toBe('aus');
  expect(nach.knapp).toBe(false);
  await page.evaluate(() => localStorage.removeItem('pa.kameraeffekte'));
  expect(fehler).toEqual([]);
});

test('Aufgeben im Dropdown fragt nach: Nein spielt weiter, Ja beendet das Match', async ({ page }) => {
  const fehler = await starte(page);
  await page.locator('#hud-menue-knopf').click();
  await page.locator('#hud-aufgeben').click();
  // Seit UI-3 ein eigenes Overlay statt `confirm` — der Frame-Loop läuft weiter.
  await expect(page.locator('#bestaetigung')).toBeVisible();
  await expect(page.locator('#bestaetigung-titel')).toContainText('Aufgeben');
  await page.locator('#bestaetigung-nein').click();
  await expect(page.locator('#bestaetigung')).toBeHidden();
  expect(await page.evaluate(() => window.__PA__.game.match?.status)).toBe('playing');

  /*
   * Nach „Nein" bleibt das Dropdown offen und der Fokus kehrt an „Aufgeben" zurück (MERGE-3,
   * 2026-11-10): So steht es im Klick-Handler in `main.js` („erst nach einem Ja schließt sich das
   * Einstellungs-Dropdown"). Bis dahin schloss der Tipp auf „Nein" das Dropdown als „daneben
   * getippt", und dieser Test hatte das Fehlverhalten festgeschrieben.
   */
  await expect(page.locator('#hud-menue')).toBeVisible();
  await expect(page.locator('#hud-aufgeben')).toBeFocused();
  await page.locator('#hud-aufgeben').click();
  await expect(page.locator('#bestaetigung')).toBeVisible();
  await page.locator('#bestaetigung-ja').click();
  await expect(page.locator('#bestaetigung')).toBeHidden();
  await expect(page.locator('#hud-menue')).toBeHidden();
  await page.evaluate(() => window.__PA__.setAutoLoop?.(true));
  await expect(page.locator('#end-overlay')).toBeVisible({ timeout: 15_000 });
  expect(fehler).toEqual([]);
});
