import { expect } from '@playwright/test';

/**
 * Gemeinsame Zustände für die UX-Werkzeuge (axe und Screenshot-Vergleich).
 *
 * Alle drei Zustände werden mit festen Daten aufgebaut, damit ein Lauf
 * reproduzierbar ist:
 *  - Menü: Startseite, Auto-Loop aus, Schriften geladen.
 *  - Lobby: die Lobby-Liste wird über `page.route` mit einer festen Antwort
 *    versorgt (kein Serverprozess, keine zufälligen Lobby-IDs).
 *  - HUD: lokales Match mit festem Seed; Kamera und Renderer-Zeit werden nach
 *    dem Einschwingen eingefroren, damit das Canvas nicht von der Bildrate
 *    abhängt.
 */

export const FORMATE = {
  '1280x720': { width: 1280, height: 720 },
  '390x844': { width: 390, height: 844 },
};

/** Feste Lobby-Antwort: gleiche IDs, gleiche Belegung, gleicher Text. */
export const LOBBY_ANTWORT = {
  lobbies: [
    {
      id: 'ux-lobby-1', preset: 'hills', status: 'open',
      teams: 2, playersPerTeam: 3, seatsTotal: 2, occupied: 0, connected: 0,
    },
    {
      id: 'ux-lobby-2', preset: 'mountains', status: 'open',
      teams: 2, playersPerTeam: 3, seatsTotal: 2, occupied: 1, connected: 1,
    },
  ],
};

/**
 * Öffnet die Startseite und wartet auf die Debug-Schnittstelle.
 *
 * @returns {Promise<string[]>} Liste der Seitenfehler (leer = sauber)
 */
export async function oeffneMenue(page) {
  const fehler = [];
  page.on('pageerror', error => fehler.push(String(error)));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // Vor dem Laden: die Lobby-Liste kommt aus einer festen Antwort.
  await page.route('**/api/lobby', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(LOBBY_ANTWORT),
  }));
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__PA__));
  await page.evaluate(() => window.__PA__.setAutoLoop(false));
  // Webfonts müssen stehen, sonst verschiebt sich das Menü zwischen zwei Läufen.
  await page.evaluate(() => document.fonts.ready.then(() => true));
  return fehler;
}

/** Öffnet den Lobby-Browser im Menü und wartet auf die festen Einträge. */
export async function oeffneLobby(page) {
  await page.fill('#cfg-server', 'http://ux.test');
  await page.locator('#lobby-browser > summary').click();
  await expect(page.locator('#lobby-list li')).toHaveCount(LOBBY_ANTWORT.lobbies.length);
  await expect(page.locator('#lobby-status')).toContainText('2 offene Lobby');
  await page.locator('#lobby-browser').scrollIntoViewIfNeeded();
  return page.locator('#lobby-browser');
}

/** Startet ein lokales Match mit festem Seed und friert Kamera und Renderer ein. */
export async function starteHud(page, optionen = {}) {
  const konfiguration = {
    seed: 4242, teams: 2, playersPerTeam: 2, preset: 'hills', ...optionen,
  };
  await page.evaluate((options) => {
    const api = window.__PA__;
    api.setAutoLoop(false);
    api.startMatch(options);
    api.setAutoLoop(false);
    api.advance(2);
  }, konfiguration);
  await expect(page.locator('#menu-overlay')).toBeHidden();
  await expect(page.locator('#hud')).toBeVisible();

  // Kamera einschwingen lassen; der Auto-Loop steht, es wird nur gezeichnet.
  await page.waitForTimeout(1200);

  await page.evaluate(() => {
    const api = window.__PA__;
    const spiel = api.game;
    cancelAnimationFrame(spiel.animationHandle);
    spiel.animationHandle = null;

    const state = api.getState();
    const aktiv = state.entities.find(entity => entity.entityId === state.activePlayerId);
    if (aktiv) {
      spiel.kamera.setzeZoom(0.8);
      spiel.kamera.zieleAuf(aktiv.x, aktiv.y, true);
    }
    // Feste Darstellungszeit: Himmel, Wasser und Effekte hängen sonst an der Bildrate.
    spiel.renderer.time = 900;
    spiel.renderer.render(state, {
      aim: spiel.aim,
      water: spiel.match.water,
      blastRadius: 0,
      dt: 0,
    });
  });
  return konfiguration;
}
