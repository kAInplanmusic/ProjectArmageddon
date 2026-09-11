import { test, expect } from '@playwright/test';

/**
 * Günther im Browser.
 *
 * Die Unit-Tests belegen Auftritte, Anpinkeln, Kacken und das Rad. Hier wird
 * geprüft, dass er auch GEZEICHNET wird und das Glücksrad erscheint — die Stelle,
 * an der eine Mechanik im Spiel unsichtbar bleiben kann.
 */

/** Startet ein Match und wartet, bis Günther aktiv ist. */
async function startMitGuenther(page, { maxSeeds = 120 } = {}) {
  await page.goto('http://127.0.0.1:5173/');
  await page.waitForFunction(() => Boolean(window.__PA__));

  const gefunden = await page.evaluate(async (grenze) => {
    const api = window.__PA__;
    for (let seed = 0; seed < grenze; seed += 1) {
      api.setAutoLoop(false);
      api.startMatch({ seed, teams: 2, playersPerTeam: 2, preset: 'hills' });
      api.setAutoLoop(false);
      const g = api.guenther();
      if (!g?.plan?.length) continue;

      // Bis zu seiner ersten Auftrittsrunde vorspulen.
      for (let runde = 0; runde < 30; runde += 1) {
        if (api.guenther()?.aktiv) return { seed, plan: g.plan, runde };
        for (let i = 0; i < 40; i += 1) api.advance(1);
        api.getMatch().endTurn();
      }
    }
    return null;
  }, maxSeeds);

  expect(gefunden).not.toBeNull();
  return gefunden;
}

test('Günther wird gezeichnet, wenn er aktiv ist', async ({ page }) => {
  await startMitGuenther(page);

  const stand = await page.evaluate(() => {
    const api = window.__PA__;
    const vorher = api.guenther();
    const renderer = api.game.renderer;
    const zustand = api.getState();

    const canvas = document.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    const links = Math.max(0, Math.round(vorher.x - 40));
    const oben = Math.max(0, Math.round(vorher.y - 40));
    const breite = 90;
    const hoehe = 55;

    // Mit Günther zeichnen.
    renderer.render(zustand, { aim: null, water: api.game.water, blastRadius: 0 });
    const mitHund = ctx.getImageData(links, oben, breite, hoehe).data;

    // Dasselbe Bild OHNE Günther: `render` bekommt einen Zustand, in dem er
    // fehlt. Ein Verändern des echten Zustands wäre wirkungslos — `getState()`
    // baut bei jedem Aufruf ein neues Objekt.
    renderer.render({ ...zustand, guenther: null }, { aim: null, water: api.game.water, blastRadius: 0 });
    const ohneHund = ctx.getImageData(links, oben, breite, hoehe).data;

    let unterschiede = 0;
    for (let i = 0; i < mitHund.length; i += 4) {
      if (Math.abs(mitHund[i] - ohneHund[i]) > 12) unterschiede += 1;
    }

    return { aktiv: vorher.aktiv, x: vorher.x, y: vorher.y, unterschiede, pixel: mitHund.length / 4 };
  });

  expect(stand.aktiv).toBe(true);
  // Der Hund muss sichtbare Spuren hinterlassen: Bei einem 90x55-Feld sind das
  // über 100 Pixel Unterschied, wenn wirklich gezeichnet wurde.
  expect(stand.unterschiede).toBeGreaterThan(100);
  expect(stand.pixel).toBeGreaterThan(4000);
});

test('Das Glücksrad erscheint und zeigt den Ausgang', async ({ page }) => {
  await startMitGuenther(page);

  await page.evaluate(() => {
    window.__PA__.showGuentherWheel({
      outcome: 'gassi',
      label: 'Du gehst mit Günther Gassi',
      detail: 'Günther muss dringend raus. Du setzt eine Runde aus.',
    });
  });

  const overlay = page.locator('#guenther-wheel');
  await expect(overlay).toBeVisible();
  await expect(page.locator('#wheel-result')).toHaveText('Du gehst mit Günther Gassi', { timeout: 5000 });
  await expect(page.locator('#wheel-detail')).toContainText('setzt eine Runde aus');
});

test('Heimdall wird hervorgehoben und löst die Animation aus', async ({ page }) => {
  await startMitGuenther(page);

  await page.evaluate(() => {
    window.__PA__.showGuentherWheel({
      outcome: 'heimdall',
      label: 'Günther verwandelt sich in Heimdall',
      detail: 'Das Gjallarhorn erklingt.',
      weaponName: 'Dimensionsriss',
    });
  });

  // Eigene Gestaltung für den seltenen Ausgang.
  await expect(page.locator('#guenther-wheel .wheel-panel')).toHaveClass(/heimdall/, { timeout: 5000 });

  // Und die Animation liegt im Renderer.
  const hatAnimation = await page.evaluate(() => {
    window.__PA__.game.renderer.render(
      window.__PA__.getState(),
      { aim: null, water: window.__PA__.game.water, blastRadius: 0 },
    );
    return window.__PA__.game.renderer.effects.some(e => e.kind === 'heimdall');
  });
  expect(hatAnimation).toBe(true);
});

test('Das Rad verschwindet nach kurzer Zeit wieder', async ({ page }) => {
  await startMitGuenther(page);

  await page.evaluate(() => {
    window.__PA__.showGuentherWheel({ outcome: 'angriff', label: 'Günther greift dich an', detail: 'Au.' });
  });
  await expect(page.locator('#guenther-wheel')).toBeVisible();
  // Nach dem Ausblenden darf es den Blick nicht mehr verdecken.
  await expect(page.locator('#guenther-wheel')).toBeHidden({ timeout: 8000 });
});

test('Jeder Rad-Ausgang lässt sich anzeigen', async ({ page }) => {
  await startMitGuenther(page);

  const ausgaenge = await page.evaluate(() => window.__PA__.guentherWheelOutcomes());
  expect(ausgaenge.length).toBe(5);
  for (const ausgang of ausgaenge) {
    await page.evaluate(a => window.__PA__.showGuentherWheel(a), {
      outcome: ausgang.id, label: ausgang.label, detail: ausgang.detail,
    });
    await expect(page.locator('#wheel-result')).toHaveText(ausgang.label, { timeout: 5000 });
  }
});
