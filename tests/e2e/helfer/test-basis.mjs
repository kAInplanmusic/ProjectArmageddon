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

export const test = basis.extend({
  context: async ({ context }, use) => {
    await context.addInitScript(() => {
      try { sessionStorage.setItem('pa.home.v1', '1'); } catch { /* kein Speicher: Home bleibt sichtbar */ }
    });
    await use(context);
  },
});

export { expect };
