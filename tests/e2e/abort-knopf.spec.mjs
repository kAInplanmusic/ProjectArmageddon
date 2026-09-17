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
 */
import { test, expect } from '@playwright/test';

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

  // Im Match: sichtbar UND bedienbar (nicht nur im DOM vorhanden).
  await expect(knopf).toBeVisible({ timeout: 10_000 });
  await expect(knopf).toBeEnabled();
});

test('Ein abgelehnter Abbruch lässt das Match weiterlaufen', async ({ page }) => {
  await starteMatch(page);
  const knopf = page.locator('#hud-abort');
  await expect(knopf).toBeVisible();

  // Die Rückfrage ablehnen.
  page.once('dialog', dialog => dialog.dismiss());

  await knopf.click();

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
  const knopf = page.locator('#hud-abort');
  await expect(knopf).toBeVisible();

  // Die Rückfrage bestätigen.
  page.once('dialog', dialog => dialog.accept());

  await knopf.click();

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
   * dass der Text sagt, was passiert.
   */
  await starteMatch(page);

  let text = null;
  page.once('dialog', dialog => { text = dialog.message(); dialog.dismiss(); });

  await page.locator('#hud-abort').click();

  expect(text, 'es muss eine Rückfrage erscheinen').toBeTruthy();
  expect(text.toLowerCase()).toContain('verlassen');
});

test('Die Taste R verhält sich gleich', async ({ page }) => {
  /*
   * Beide Wege laufen durch dieselbe Methode. Geprüft wird, dass die Taste
   * ebenfalls nachfragt — und bei „Nein" nichts tut.
   */
  await starteMatch(page);

  page.once('dialog', dialog => dialog.dismiss());
  await page.keyboard.press('r');

  const laeuft = await page.evaluate(() => Boolean(
    (window.__PA__.game ?? window.__PA__.api)?.match,
  ));
  expect(laeuft, 'die Taste R darf bei „Nein" nichts beenden').toBe(true);

  // Und mit Bestätigung führt sie ins Menü.
  page.once('dialog', dialog => dialog.accept());
  await page.keyboard.press('r');

  await expect(page.locator('#menu-overlay')).toBeVisible({ timeout: 10_000 });
});
