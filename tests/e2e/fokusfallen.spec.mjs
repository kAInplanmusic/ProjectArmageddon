/**
 * E2E: Fokusfallen in Overlays.
 *
 * Drei Overlays liegen über dem Spiel: Hauptmenü, Rückfrage (`#bestaetigung`)
 * und Waffenmenü (`#waffenmenue`). Ein Tastaturnutzer darf darin nicht
 * „hinter“ das Overlay fallen — sonst landet er auf unsichtbaren Feldern,
 * feuert versehentlich oder muss sich von vorn durch die Seite tabben.
 *
 * Geprüft wird das Verhalten im echten Browser:
 *  - Rückfrage: Fokus startet auf „Ja“, Tab/Shift+Tab bleiben im Dialog,
 *    Spieltasten erreichen das Spiel nicht, Esc gibt den Fokus zurück.
 *  - Waffenmenü: Tab bleibt zwischen Menü und Schließen-Knopf.
 *  - Hauptmenü: Der Hintergrund (`#game-canvas`, `#hud`) ist `inert` und
 *    bekommt niemals Fokus.
 *
 * Bewusst NICHT geprüft: ein zyklischer Tab-Lauf im Hauptmenü. Dessen Karte
 * hat keinen Trap; Tab verlässt sie nach der letzten `summary` über `<body>`
 * und den Sprunglink. Das ist im Abschlussbericht als offene Lücke vermerkt,
 * nicht als bestandene Prüfung getarnt. Die Sicherheitszusage, die das Menü
 * heute gibt — nichts davon erreicht das Spiel — wird geprüft.
 */
import { test, expect } from '@playwright/test';

/** Startet ein lokales Match über den sichtbaren Weg. */
async function starteMatch(page) {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__PA__?.game), { timeout: 20_000 });
  await page.evaluate(() => window.__PA__.setAutoLoop(false));
  await page.locator('#start-button').click();
  await page.waitForFunction(() => window.__PA__?.game?.match?.status === 'playing', { timeout: 15_000 });
  await page.evaluate(() => {
    const api = window.__PA__;
    api.setAutoLoop(false);
    // Ein Schritt macht die erste Figur zum Zug und füllt das Waffenmenü.
    // Ohne ihn ist `getFigur()` noch leer und „e“ öffnet nichts.
    api.advance(1);
  });
}

/** Liefert ID und Rolle des aktiven Elements. */
function aktivesElement(page) {
  return page.evaluate(() => ({
    id: document.activeElement?.id ?? '',
    tag: document.activeElement?.tagName ?? '',
    imDialog: Boolean(document.activeElement?.closest?.('#bestaetigung')),
    imWaffenmenue: Boolean(document.activeElement?.closest?.('#waffenmenue')),
    imSpiel: Boolean(document.activeElement?.closest?.('#hud, #game-canvas')),
  }));
}

test('Rückfrage: Tab bleibt im Dialog, Spieltasten erreichen das Spiel nicht', async ({ page }) => {
  test.slow();
  await starteMatch(page);

  // Vorher bewusst die Spielfläche fokussieren: Nur so lässt sich prüfen, ob
  // der Fokus nach Esc wirklich dorthin zurückkehrt.
  await page.locator('#game-canvas').focus();
  expect(await page.evaluate(() => document.activeElement?.id)).toBe('game-canvas');

  await page.keyboard.press('r');
  await expect(page.locator('#bestaetigung')).toBeVisible();

  // Startpunkt der Fokusfalle: „Ja“, wie beim nativen Dialog dessen OK-Knopf.
  expect(await aktivesElement(page)).toMatchObject({ id: 'bestaetigung-ja', imDialog: true });

  // Das Spiel dahinter ist nicht bedienbar — nicht nur optisch verdeckt.
  await expect.poll(() => page.evaluate(() => ({
    canvas: document.getElementById('game-canvas').inert,
    hud: document.getElementById('hud').inert,
  }))).toEqual({ canvas: true, hud: true });

  // Tab pendelt zwischen den beiden Knöpfen und verlässt den Dialog nie.
  const reihenfolge = [];
  for (let i = 0; i < 8; i += 1) {
    await page.keyboard.press('Tab');
    const aktiv = await aktivesElement(page);
    reihenfolge.push(aktiv.id);
    expect(aktiv.imDialog, `Tab ${i + 1} verließ den Dialog (${aktiv.tag}#${aktiv.id})`).toBe(true);
  }
  expect(reihenfolge).toEqual([
    'bestaetigung-nein', 'bestaetigung-ja',
    'bestaetigung-nein', 'bestaetigung-ja',
    'bestaetigung-nein', 'bestaetigung-ja',
    'bestaetigung-nein', 'bestaetigung-ja',
  ]);

  await page.keyboard.press('Shift+Tab');
  expect(await aktivesElement(page)).toMatchObject({ id: 'bestaetigung-nein', imDialog: true });

  /*
   * Spieltasten dürfen den Dialog nicht erreichen: „e“ öffnet sonst das
   * Waffenmenü, „r“ startet eine zweite Rückfrage. Beide bleiben hier stumm.
   * Die Leertaste wird bewusst nicht gedrückt — sie löst den fokussierten
   * Knopf aus und würde die Frage legitim mit „Ja“ beantworten.
   */
  await page.keyboard.press('e');
  await page.keyboard.press('r');
  expect(await page.evaluate(() => ({
    dialogOffen: !document.getElementById('bestaetigung').hidden,
    waffenmenueOffen: !document.getElementById('waffenmenue').hidden,
    matchLaeuft: Boolean(window.__PA__.game.match),
  }))).toEqual({ dialogOffen: true, waffenmenueOffen: false, matchLaeuft: true });

  // Esc antwortet „Nein“, gibt den Fokus an die Spielfläche zurück und hebt
  // `inert` wieder auf.
  await page.keyboard.press('Escape');
  await expect(page.locator('#bestaetigung')).toBeHidden();
  expect(await page.evaluate(() => ({
    fokus: document.activeElement?.id ?? '',
    canvasInert: document.getElementById('game-canvas').inert,
    hudInert: document.getElementById('hud').inert,
    matchLaeuft: Boolean(window.__PA__.game.match),
  }))).toEqual({ fokus: 'game-canvas', canvasInert: false, hudInert: false, matchLaeuft: true });
});

test('Waffenmenü: Tab bleibt zwischen Menü und Schließen-Knopf', async ({ page }) => {
  test.slow();
  await starteMatch(page);

  await page.keyboard.press('e');
  await expect(page.locator('#waffenmenue')).toBeVisible();

  // Einstiegspunkt ist das Menü selbst (`tabindex="-1"`), von dort wandert
  // Tab zum Schließen-Knopf und wieder zurück.
  expect(await aktivesElement(page)).toMatchObject({ id: 'waffenmenue', imWaffenmenue: true });

  const reihenfolge = [];
  for (let i = 0; i < 8; i += 1) {
    await page.keyboard.press('Tab');
    const aktiv = await aktivesElement(page);
    reihenfolge.push(aktiv.id);
    expect(aktiv.imWaffenmenue, `Tab ${i + 1} verließ das Waffenmenü (${aktiv.tag}#${aktiv.id})`).toBe(true);
  }
  expect(reihenfolge).toEqual([
    'waffenmenue-schliessen', 'waffenmenue',
    'waffenmenue-schliessen', 'waffenmenue',
    'waffenmenue-schliessen', 'waffenmenue',
    'waffenmenue-schliessen', 'waffenmenue',
  ]);

  await page.keyboard.press('Shift+Tab');
  expect(await aktivesElement(page)).toMatchObject({ id: 'waffenmenue-schliessen', imWaffenmenue: true });

  // Esc schließt und lässt den Fokus NICHT auf dem versteckten Dialog liegen.
  await page.keyboard.press('Escape');
  await expect(page.locator('#waffenmenue')).toBeHidden();
  const nachher = await aktivesElement(page);
  expect(nachher.imWaffenmenue, `Fokus blieb im versteckten Menü (${nachher.tag}#${nachher.id})`).toBe(false);
  expect(await page.evaluate(() => Boolean(window.__PA__.game.match))).toBe(true);
});

test('Hauptmenü: Tab erreicht niemals Spielfeld oder HUD', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__PA__?.game), { timeout: 20_000 });

  // Ohne Match sind Spielfeld und HUD nicht bedienbar; das Menü ist der
  // einzige Weg. Die Prüfung läuft über mehrere Runden, damit auch der
  // Rücksprung nach dem letzten Menüeintrag abgedeckt ist.
  const treffer = [];
  for (let i = 0; i < 40; i += 1) {
    await page.keyboard.press('Tab');
    treffer.push(await page.evaluate(() => {
      const aktiv = document.activeElement;
      return {
        id: aktiv?.id || aktiv?.tagName || '',
        imMenue: Boolean(aktiv?.closest?.('#menu-overlay')),
        imSpiel: Boolean(aktiv?.closest?.('#hud, #game-canvas')),
      };
    }));
  }

  expect(treffer.filter(t => t.imSpiel),
    'Tab ist in Spielfeld oder HUD gelandet, obwohl das Menü modal ist').toEqual([]);
  expect(treffer.some(t => t.imMenue),
    'Kein einziger Tab landete im Menü — die Prüfung wäre sonst leer').toBe(true);
});
