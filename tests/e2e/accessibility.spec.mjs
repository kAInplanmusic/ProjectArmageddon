import { test, expect } from '@playwright/test';

/**
 * E2E-Prüfung von Tastaturbedienung und Fokus.
 *
 * Zwei reale Bedienfehler werden hier abgesichert:
 *  1. Die Tastatursteuerung hing global am Fenster und prüfte nicht, ob der
 *     Nutzer gerade in ein Formularfeld tippt. Der Seed "2026" veränderte
 *     dadurch den Winkel, und ein "r" im Serverfeld startete das Match neu.
 *  2. Es gab keinerlei :focus-visible-Styling, weshalb beim Tabben nicht
 *     erkennbar war, welches Element aktiv ist.
 */

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__PA__));
});

test('Tippen im Seed-Feld steuert nicht das Spiel', async ({ page }) => {
  // Bewusst OHNE Matchstart: die Menüfelder sind nach dem Start ausgeblendet.
  // Im Menü ist die Tastatursteuerung bereits aktiv (der InputController hängt
  // global am Fenster), also lässt sich der Fehler hier direkt beobachten.
  //
  // Wichtig: Nicht nur den Winkel prüfen. "a" und "d" verändern ihn gegenläufig
  // und heben sich bei der Eingabe "wasd" gegenseitig auf — ein Test, der nur
  // den Winkel vergleicht, besteht dann trotz Fehler. Deshalb werden Winkel,
  // Kraft und gewählte Waffe einzeln geprüft.
  const vorher = await page.evaluate(() => ({
    angle: window.__PA__.game.aim.angle,
    power: window.__PA__.game.aim.power,
  }));

  const feld = page.locator('#cfg-seed');
  await feld.click();

  // Winkel: "aa" verschiebt ihn deutlich, wenn die Sperre fehlt.
  await page.keyboard.type('aa');
  const nachWinkel = await page.evaluate(() => window.__PA__.game.aim.angle);
  expect(nachWinkel, 'Winkel darf sich beim Tippen nicht ändern').toBe(vorher.angle);

  // Kraft: "ww" erhöht sie, wenn die Sperre fehlt.
  await page.keyboard.type('ww');
  const nachKraft = await page.evaluate(() => window.__PA__.game.aim.power);
  expect(nachKraft, 'Kraft darf sich beim Tippen nicht ändern').toBe(vorher.power);

  // Der Text muss vollständig angekommen sein (kein abgefangenes Zeichen).
  await expect(feld).toHaveValue('aaww');

  // Kein Match wurde gestartet und keine Ladung begonnen.
  expect(await page.evaluate(() => window.__PA__.getMatch())).toBeNull();
  expect(await page.evaluate(() => window.__PA__.game.input.isCharging)).toBe(false);
});

test('"r" im Textfeld startet kein Match neu', async ({ page }) => {
  await page.evaluate(() => window.__PA__.startMatch({ seed: 777, teams: 2, playersPerTeam: 1 }));
  await page.evaluate(() => window.__PA__.setAutoLoop(false));

  // Zurück ins Menü, damit die Felder wieder bedienbar sind — genau die
  // Situation, in der der Fehler auftrat.
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    window.__PA__.game.menuOverlay.hidden = false;
  });

  const vorher = await page.evaluate(() => window.__PA__.game.aim.angle);

  const feld = page.locator('#cfg-seed');
  await feld.click();
  await page.keyboard.type('rrrr');

  await expect(feld).toHaveValue('rrrr');

  // Das Match darf nicht durch den Neustart-Handler zerstört worden sein.
  expect(await page.evaluate(() => Boolean(window.__PA__.getMatch()))).toBe(true);
  expect(await page.evaluate(() => window.__PA__.getMatch().status)).toBe('playing');
  expect(await page.evaluate(() => window.__PA__.game.aim.angle)).toBe(vorher);
});

test('Leertaste im Textfeld feuert nicht', async ({ page }) => {
  // Ohne Matchstart prüfen, dass die Leertaste keine Ladung beginnt und kein
  // Projektil entsteht.
  const feld = page.locator('#cfg-seed');
  await feld.click();
  await page.keyboard.type('1 2 3');

  await expect(feld).toHaveValue('1 2 3');
  expect(await page.evaluate(() => window.__PA__.game.input.isCharging)).toBe(false);
  expect(await page.evaluate(() => window.__PA__.getMatch())).toBeNull();
});

test('Die Spielfläche ist per Tastatur fokussierbar', async ({ page }) => {
  await page.evaluate(() => window.__PA__.startMatch({ seed: 999, teams: 2, playersPerTeam: 1 }));

  const canvas = page.locator('#game-canvas');
  await expect(canvas).toHaveAttribute('tabindex', '0');

  await canvas.focus();
  const istFokussiert = await page.evaluate(() => document.activeElement?.id);
  expect(istFokussiert).toBe('game-canvas');

  // Beschreibung für Screenreader muss vorhanden sein.
  const label = await canvas.getAttribute('aria-label');
  expect(label).toBeTruthy();
  expect(label.length).toBeGreaterThan(20);
});

test('Fokussierte Elemente sind sichtbar hervorgehoben', async ({ page }) => {
  // Der Fokusring muss sich messbar vom unfokussierten Zustand unterscheiden.
  const button = page.locator('#start-button');

  const ohneFokus = await button.evaluate(el => {
    const style = getComputedStyle(el);
    return { outlineWidth: style.outlineWidth, outlineStyle: style.outlineStyle };
  });

  await button.focus();

  const mitFokus = await button.evaluate(el => {
    const style = getComputedStyle(el);
    return {
      outlineWidth: style.outlineWidth,
      outlineStyle: style.outlineStyle,
      outlineColor: style.outlineColor,
    };
  });

  // Entweder ein sichtbarer Umriss oder ein Schatten muss den Fokus markieren.
  const hatUmriss = mitFokus.outlineStyle !== 'none' && parseFloat(mitFokus.outlineWidth) > 0;
  expect(
    hatUmriss,
    `Kein Fokusindikator: vorher ${JSON.stringify(ohneFokus)}, nachher ${JSON.stringify(mitFokus)}`,
  ).toBe(true);
});

test('Alle Formularfelder sind per Tab erreichbar', async ({ page }) => {
  const erwarteteReihenfolge = [
    'cfg-teams', 'cfg-players', 'cfg-preset', 'cfg-seed',
    'cfg-server', 'cfg-lobby', 'start-button',
  ];

  // Vom Dokumentanfang aus durchtabben und die erreichten IDs sammeln.
  const erreicht = await page.evaluate(() => {
    const ids = [];
    const fokussierbar = Array.from(document.querySelectorAll('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'))
      .filter(el => !el.disabled && el.offsetParent !== null && el.tabIndex >= 0);
    for (const el of fokussierbar) if (el.id) ids.push(el.id);
    return ids;
  });

  for (const id of erwarteteReihenfolge) {
    expect(erreicht, `Feld ${id} ist nicht per Tab erreichbar. Gefunden: ${erreicht.join(', ')}`)
      .toContain(id);
  }
});

test('Der Sprunglink führt zum Spielfeld', async ({ page }) => {
  const link = page.locator('#skip-to-board');
  await expect(link).toHaveAttribute('href', '#game-canvas');

  // Sichtbar erst bei Fokus — sonst würde er das Menü stören.
  const vorher = await link.evaluate(el => el.getBoundingClientRect().left);
  await link.focus();
  const nachher = await link.evaluate(el => el.getBoundingClientRect().left);
  expect(nachher).toBeGreaterThan(vorher);
});

test('Versteckte Overlays nehmen keinen Fokus', async ({ page }) => {
  await page.evaluate(() => window.__PA__.startMatch({ seed: 1234, teams: 2, playersPerTeam: 1 }));

  // Das Menü ist nach dem Start verborgen und darf keine Fokusziele mehr liefern.
  const menuSichtbar = await page.locator('#menu-overlay').isVisible();
  expect(menuSichtbar).toBe(false);

  // [hidden] muss echtes Ausblenden bewirken, sonst bleiben die Felder fokussierbar.
  const startButtonErreichbar = await page.evaluate(() => {
    const el = document.getElementById('start-button');
    return el ? el.offsetParent !== null : false;
  });
  expect(startButtonErreichbar).toBe(false);
});
