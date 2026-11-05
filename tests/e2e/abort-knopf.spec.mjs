/**
 * E2E: Der Abbruchknopf im HUD.
 *
 * ## Der Befund
 *
 * Ein User-Flow-Audit stellte fest: Das Match ließ sich nur mit der Taste `R`
 * verlassen — global, sofort, ohne Rückfrage, und nur in der Tastaturliste des
 * Menüs dokumentiert.
 *
 * ## Was hier geprüft wird
 *
 * Das VERHALTEN im Browser — nicht die Struktur (das macht
 * `tests/abort-knopf.test.js`):
 *
 *   1. Der Knopf ist im Match sichtbar und klickbar.
 *   2. Er ist im Menü NICHT sichtbar.
 *   3. Ein Klick fragt nach; ein „Nein" lässt das Match laufen.
 *   4. Ein „Ja" führt ins Menü.
 *   5. Die Taste `R` tut dasselbe.
 *   6. Die Frage hält den Frame-Loop NICHT an (UI-3).
 *
 * Seit UI-3 ist die Rückfrage ein eigenes Overlay (`#bestaetigung`) statt
 * `window.confirm` — der native Dialog blockierte den Hauptfaden.
 */
import { test, expect } from '@playwright/test';

/**
 * Wartet auf die Rückfrage und antwortet.
 * @param {'ja'|'nein'} antwort
 */
async function antworte(page, antwort) {
  await expect(page.locator('#bestaetigung')).toBeVisible();
  const knopf = page.locator(antwort === 'ja' ? '#bestaetigung-ja' : '#bestaetigung-nein');
  await knopf.click();
  await expect(page.locator('#bestaetigung')).toBeHidden();
}

/**
 * Startet ein lokales Match über die Oberfläche.
 *
 * Der Weg ist der des Spielers: Menü öffnen, `#start-button` klicken. Ein
 * erster Anlauf rief eine `startLocalMatch()`-Methode über `window.__PA__` auf
 * — die es nicht gibt. Das Muster stammt aus `tests/e2e/loadout-choice.spec.mjs`,
 * wo genau dieser Weg benutzt wird.
 */
async function starteMatch(page) {
  await page.goto('/');
  // Warten, bis das Spiel geladen ist (die Debug-Schnittstelle erscheint).
  await page.waitForFunction(() => Boolean(window.__PA__?.game), { timeout: 20_000 });

  await page.locator('#start-button').click();

  // Warten, bis das Match wirklich läuft.
  await page.waitForFunction(
    () => window.__PA__?.game?.match?.status === 'playing',
    { timeout: 15_000 },
  );
}

/**
 * Öffnet das Einstellungs-Dropdown der Kopfzeile. Seit 2026-11-04 liegt „Match verlassen" dort
 * (Entscheidung des Auftraggebers); geprüft wird danach dasselbe wie vorher.
 */
async function oeffneEinstellungen(page) {
  await page.locator('#hud-menue-knopf').click();
  await expect(page.locator('#hud-menue')).toBeVisible();
}

test('Der Knopf ist im Match sichtbar und im Menü nicht', async ({ page }) => {
  await page.goto('/');

  const knopf = page.locator('#hud-abort');
  await expect(knopf).toBeAttached();

  /*
   * Im Menü: unsichtbar. `hidden` ist gesetzt, sobald kein Match läuft.
   * Geprüft wird über `isVisible()` — das berücksichtigt auch CSS, nicht nur
   * das Attribut.
   */
  await expect.poll(() => knopf.isVisible(), { timeout: 10_000 })
    .toBe(false, 'im Menü darf kein „Match verlassen" stehen');

  await starteMatch(page);
  await oeffneEinstellungen(page);

  // Im Match: sichtbar UND bedienbar (nicht nur im DOM vorhanden).
  await expect(knopf).toBeVisible({ timeout: 10_000 });
  await expect(knopf).toBeEnabled();
});

test('Ein abgelehnter Abbruch lässt das Match weiterlaufen', async ({ page }) => {
  await starteMatch(page);
  await oeffneEinstellungen(page);
  const knopf = page.locator('#hud-abort');
  await expect(knopf).toBeVisible();

  // Die Rückfrage ablehnen.
  await knopf.click();
  await antworte(page, 'nein');

  // Das Match läuft weiter — der Match-Zustand ist noch da.
  const laeuft = await page.evaluate(() => Boolean(
    (window.__PA__.game ?? window.__PA__.api)?.match,
  ));
  expect(laeuft, 'nach einem „Nein" darf das Match nicht beendet sein').toBe(true);

  // Und der Knopf bleibt sichtbar.
  await expect(knopf).toBeVisible();
});

test('Ein bestätigter Abbruch führt ins Menü', async ({ page }) => {
  await starteMatch(page);
  await oeffneEinstellungen(page);
  const knopf = page.locator('#hud-abort');
  await expect(knopf).toBeVisible();

  // Die Rückfrage bestätigen.
  await knopf.click();
  await antworte(page, 'ja');

  // Das Menü ist sichtbar, der Knopf verschwunden.
  await expect(page.locator('#menu-overlay')).toBeVisible({ timeout: 10_000 });
  await expect.poll(() => knopf.isVisible(), { timeout: 10_000 })
    .toBe(false, 'im Menü darf der Knopf nicht bleiben');

  // Und der Match-Zustand ist geräumt.
  const match = await page.evaluate(() => (window.__PA__.game ?? window.__PA__.api)?.match ?? null);
  expect(match, 'nach dem Abbruch darf kein Match mehr laufen').toBe(null);
});

test('Die Rückfrage nennt die Folge', async ({ page }) => {
  /*
   * Eine Rückfrage „Wirklich?" ohne Angabe der Folge hilft nicht. Geprüft wird,
   * dass der Text sagt, was passiert — und dass er im Dialog steht, nicht in
   * einem nativen `confirm`.
   */
  await starteMatch(page);
  await oeffneEinstellungen(page);

  await page.locator('#hud-abort').click();
  await expect(page.locator('#bestaetigung')).toBeVisible();

  const titel = await page.locator('#bestaetigung-titel').textContent();
  const text = await page.locator('#bestaetigung-text').textContent();
  expect(`${titel} ${text}`.toLowerCase()).toContain('verlassen');
  await antworte(page, 'nein');
});

test('Die Rückfrage friert den Frame-Loop nicht ein (UI-3)', async ({ page }) => {
  /*
   * DER Befund: `confirm` hält den Hauptfaden an. Solange die Frage offen ist,
   * steht der Frame-Loop — die Zugzeit-Anzeige friert ein.
   *
   * Gemessen wird die Uhr des Loops (`lastFrameTime`), nicht die Zugzeit: Sie
   * läuft in jedem Bild weiter, auch während der Zugpause, und ist damit der
   * direkte Beweis, dass Bilder entstehen. Ein blockierter Hauptfaden kann sie
   * nicht fortschreiben.
   */
  await starteMatch(page);
  await oeffneEinstellungen(page);

  await page.locator('#hud-abort').click();
  await expect(page.locator('#bestaetigung')).toBeVisible();

  const vorher = await page.evaluate(() => window.__PA__.game.lastFrameTime);
  await page.waitForTimeout(600);
  const nachher = await page.evaluate(() => window.__PA__.game.lastFrameTime);

  expect(nachher, 'der Frame-Loop muss während der Frage weiterlaufen').toBeGreaterThan(vorher);
  await antworte(page, 'nein');
});

test('Die Taste R verhält sich gleich', async ({ page }) => {
  /*
   * Beide Wege laufen durch dieselbe Methode. Geprüft wird, dass die Taste
   * ebenfalls nachfragt — und bei „Nein" nichts tut.
   */
  await starteMatch(page);

  await page.keyboard.press('r');
  await expect(page.locator('#bestaetigung')).toBeVisible();

  // Esc ist die Tastatur-Antwort „Nein" (Bedienung ohne Maus).
  await page.keyboard.press('Escape');
  await expect(page.locator('#bestaetigung')).toBeHidden();

  const laeuft = await page.evaluate(() => Boolean(
    (window.__PA__.game ?? window.__PA__.api)?.match,
  ));
  expect(laeuft, 'die Taste R darf bei „Nein" nichts beenden').toBe(true);

  // Und mit Bestätigung führt sie ins Menü.
  await page.keyboard.press('r');
  await antworte(page, 'ja');

  await expect(page.locator('#menu-overlay')).toBeVisible({ timeout: 10_000 });
});
