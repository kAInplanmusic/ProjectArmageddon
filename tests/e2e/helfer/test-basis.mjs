/**
 * Gemeinsame Basis aller E2E-Specs (statt `@playwright/test` direkt).
 *
 * Seit der Startseite (A6, UI-Rest) liegt vor dem Menü der Home-Bildschirm; `goto('/')` landet
 * dort, `#menu-overlay` bleibt verdeckt, und jede Spec, die das Menü bedient, lief in die
 * Zeitüberschreitung (CI 2026-11-17: Teile 2–4 rot, 1,5 h je Teil statt ~7 min). Die Menü-Specs
 * prüfen das Menü, nicht die Startseite. Deshalb markiert diese Basis den Home-Bildschirm für
 * jede Seite als gesehen (derselbe Schlüssel wie `src/client/home.js`), auch in Kontexten, die
 * eine Spec selbst mit `browser.newContext()` anlegt (Mehrspieler, Online).
 *
 * Wer die Startseite selbst prüft (`home-screen.spec.mjs`), nimmt die Markierung per
 * `page.addInitScript` wieder heraus; Init-Skripte der Seite laufen nach denen des Kontexts.
 */
import { test as basis, expect } from '@playwright/test';

/** Schlüssel wie `HOME_KEY` in `src/client/home.js`. */
export const HOME_SCHLUESSEL = 'pa.home.v1';

function markiereHomeGesehen(schluessel) {
  try { sessionStorage.setItem(schluessel, '1'); } catch { /* kein Speicher: Startseite bleibt */ }
}

export const test = basis.extend({
  // Vom Browser selbst angelegte Kontexte und Seiten (`browser.newContext()`, `browser.newPage()`).
  browser: [async ({ browser }, use) => {
    const neuerKontext = browser.newContext.bind(browser);
    const neueSeite = browser.newPage.bind(browser);
    browser.newContext = async (...args) => {
      const kontext = await neuerKontext(...args);
      await kontext.addInitScript(markiereHomeGesehen, HOME_SCHLUESSEL);
      return kontext;
    };
    browser.newPage = async (...args) => {
      const seite = await neueSeite(...args);
      await seite.addInitScript(markiereHomeGesehen, HOME_SCHLUESSEL);
      return seite;
    };
    await use(browser);
    browser.newContext = neuerKontext;
    browser.newPage = neueSeite;
  }, { scope: 'worker' }],

  // Der Kontext, den Playwright je Test selbst anlegt (Fixture `page`).
  context: async ({ context }, use) => {
    await context.addInitScript(markiereHomeGesehen, HOME_SCHLUESSEL);
    await use(context);
  },
});

export { expect };
