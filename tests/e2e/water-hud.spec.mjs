import { test, expect } from '@playwright/test';

/**
 * E2E-Prüfung der Wasseranzeige.
 *
 * Die Unit-Tests belegen Schwellen, Übertragung und Zustandslogik. Hier wird
 * geprüft, dass es im echten Spiel auch ANKOMMT: eine Marke am Spielernamen,
 * ein lesbarer Zustand im Klartext und — ebenso wichtig — keine Meldungsflut
 * im Protokoll.
 *
 * Der Test setzt das Wasser über die Diagnose-API (`setWaterLevelAt`), weil es
 * in einem normalen Zug kaum vorkommt, dass eine Figur unter die Ertrinkgrenze
 * gerät. Geprüft wird die Anzeige, nicht das Wasserfeld — das decken die
 * Unit-Tests ab.
 */

async function boot(page, { seed = 20260911 } = {}) {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__PA__));
  await page.evaluate(options => {
    window.__PA__.setAutoLoop(false);
    window.__PA__.startMatch(options);
    window.__PA__.setAutoLoop(false);
    window.__PA__.advance(1);
  }, { seed, teams: 2, playersPerTeam: 1 });
  await expect(page.locator('#menu-overlay')).toBeHidden();
}

/** Flutet einen Streifen um den Spieler am Zug und lässt einen Schritt laufen. */
async function fluten(page, level) {
  return page.evaluate((fuellstand) => {
    const api = window.__PA__;
    const spieler = api.getState().entities.find(e => e.entityId === api.activePlayerId());
    let gesetzt = 0;
    for (let x = spieler.x - 80; x <= spieler.x + 80; x += 4) {
      for (let y = spieler.y - 40; y <= spieler.y + 120; y += 4) {
        if (api.setWaterLevelAt(x, y, fuellstand)) gesetzt += 1;
      }
    }
    api.advance(1);
    return {
      gesetzt,
      level: api.activeWaterLevel(),
      badges: [...document.querySelectorAll('#roster .status-badge')].map(b => b.textContent),
    };
  }, level);
}

test('Eine Figur im Wasser bekommt eine Marke mit Zustand und Prozent', async ({ page }) => {
  await boot(page);
  const ergebnis = await fluten(page, 0.8);

  expect(ergebnis.gesetzt).toBeGreaterThan(0);
  expect(ergebnis.level).toBeGreaterThan(0.72);

  // Die Marke steht am Spielernamen und nennt Zustand UND Füllstand.
  const marke = page.locator('#roster .status-badge').first();
  await expect(marke).toBeVisible();
  await expect(marke).toContainText('untergetaucht');
  await expect(marke).toContainText('%');

  // Und der Klartext beim Überfahren nennt die Ertrinkgrenze.
  const titel = await marke.getAttribute('title');
  expect(titel).toContain('72 %');
  expect(titel.length).toBeGreaterThan(20);
});

test('Nasses Wasser ohne Ertrinkgefahr wird als „nass" gezeigt', async ({ page }) => {
  await boot(page);
  // 0,5 liegt zwischen den Schwellen: gebremst, aber kein Schaden.
  const ergebnis = await fluten(page, 0.5);
  expect(ergebnis.level).toBeGreaterThan(0.35);
  expect(ergebnis.level).toBeLessThan(0.72);

  const marke = page.locator('#roster .status-badge').first();
  await expect(marke).toContainText('nass');
  await expect(marke).not.toContainText('untergetaucht');
});

test('Das Protokoll meldet den Übergang, nicht jeden Simulationsschritt', async ({ page }) => {
  await boot(page);

  /*
   * Die ganze Karte fluten: Bei gleichmäßigem Pegel fließt nichts nach, der
   * Zustand bleibt also stabil — genau das, was für die Aussage nötig ist.
   * Zwei Spieler ertrinken dann gleichzeitig (zwei Teams zu je einer Figur).
   */
  await page.evaluate(() => {
    const api = window.__PA__;
    api.getMatch().water.fillRectangle(
      0, 0, api.getMatch().water.width - 1, api.getMatch().water.height - 1, 1,
    );
  });
  // Der Pegel muss im Zustand ankommen, bevor die Schritte laufen.
  await expect.poll(() => page.evaluate(() => window.__PA__.activeWaterLevel()))
    .toBeGreaterThan(0.72);

  /*
   * Wichtig: Die Anzeige wird im ANIMATIONSBILD aktualisiert, nicht im
   * Simulationsschritt (`advance` rechnet nur). Ohne ein echtes Bild dazwischen
   * sähe das Protokoll nie einen Übergang — der Test wäre grün, ohne etwas zu
   * prüfen. Deshalb je Schritt ein Bild abwarten.
   */
  for (let i = 0; i < 40; i += 1) {
    await page.evaluate(() => window.__PA__.advance(1));
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => resolve())));
  }

  const meldungen = await page.evaluate(() => {
    const eintraege = [...document.querySelectorAll('#log-list li')].map(li => li.textContent);
    return {
      ertrinkt: eintraege.filter(text => text.includes('ertrinkt')).length,
      namen: eintraege.filter(text => text.includes('ertrinkt')),
      gesamt: eintraege.length,
    };
  });

  /*
   * Eine Meldung je FIGUR, nicht je Schritt: zwei Spieler, 40 Schritte. Bei
   * einer Meldung je Ereignis wären es 80 — das Protokoll (60 Zeilen) hätte
   * damit alles andere verdrängt.
   */
  expect(meldungen.ertrinkt).toBe(2);
  expect(meldungen.namen.join(' ')).toContain('P1');
  expect(meldungen.namen.join(' ')).toContain('P2');
  expect(meldungen.gesamt).toBeLessThan(15);
});

test('Wasser verschwindet aus der Anzeige, wenn die Figur heraus ist', async ({ page }) => {
  await boot(page);
  await fluten(page, 0.9);
  await expect(page.locator('#roster .status-badge').first()).toBeVisible();

  // Pegel abpumpen und einen Schritt laufen lassen.
  await page.evaluate(() => {
    const api = window.__PA__;
    const spieler = api.getState().entities.find(e => e.entityId === api.activePlayerId());
    for (let x = spieler.x - 120; x <= spieler.x + 120; x += 4) {
      for (let y = spieler.y - 80; y <= spieler.y + 160; y += 4) {
        api.setWaterLevelAt(x, y, 0);
      }
    }
    api.advance(1);
  });

  await expect(page.locator('#roster .status-badge')).toHaveCount(0);
  await expect(page.locator('#log-list')).toContainText('wieder über Wasser');
});
