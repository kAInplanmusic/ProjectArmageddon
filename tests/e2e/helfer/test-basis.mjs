/**
 * Gemeinsame Testbasis für die E2E-Specs.
 *
 * Der Home-Bildschirm (A6) liegt beim ersten Laden VOR dem Menü und überdeckt es. Die meisten Specs
 * prüfen aber das Menü oder ein Match, nicht den Einstieg. Diese Basis markiert den Home-Bildschirm
 * in jedem Test als „schon gesehen" (`sessionStorage pa.home.v1`), bevor die Seite lädt.
 *
 * Nur `home-screen.spec.mjs` importiert direkt aus '@playwright/test', weil es den Home-Bildschirm
 * selbst prüft.
 */
import { test as basis, expect } from '@playwright/test';

const home = () => {
  try { sessionStorage.setItem('pa.home.v1', '1'); } catch { /* kein Speicher: Home bleibt sichtbar */ }
};

export const test = basis.extend({
  context: async ({ context }, use) => {
    await context.addInitScript(home);
    await use(context);
  },
  // Specs, die mit `browser.newContext()` / `browser.newPage()` eigene Kontexte anlegen (Mehrspieler, Viewports).
  browser: [async ({ browser }, use) => {
    const neuerKontext = browser.newContext.bind(browser);
    const neueSeite = browser.newPage.bind(browser);
    browser.newContext = async (...args) => {
      const kontext = await neuerKontext(...args);
      await kontext.addInitScript(home);
      return kontext;
    };
    browser.newPage = async (...args) => {
      const seite = await neueSeite(...args);
      await seite.addInitScript(home);
      return seite;
    };
    await use(browser);
    browser.newContext = neuerKontext;
    browser.newPage = neueSeite;
  }, { scope: 'worker' }],
});

export { expect };
