import { test, expect } from '@playwright/test';

/**
 * E2E: Schadensarten im Browser (Fassung 2 von `config.schaden`).
 *
 * Die Regeln prüft `tests/schadensarten.test.js`. Hier: Die Mali kommen als Marke mit
 * erklärendem Titel in der Spielerliste an, das Protokoll nennt Anwendung und Ablauf, und
 * Schadenszahlen tragen Farbe und Zeichen ihrer Schadensart.
 */
async function boot(page, seed = 20261019) {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__PA__));
  await page.evaluate(options => {
    window.__PA__.setAutoLoop(false);
    window.__PA__.startMatch(options);
    window.__PA__.setAutoLoop(false);
  }, { seed, teams: 2, playersPerTeam: 1 });
  await expect(page.locator('#menu-overlay')).toBeHidden();
}

test('Malus erscheint als Marke mit Titel und im Protokoll', async ({ page }) => {
  await boot(page);
  const opfer = await page.evaluate(() => {
    const match = window.__PA__.getMatch();
    const aktiv = match.activePlayerId;
    const ziel = match.getState().entities.find(e => e.entityId !== aktiv).entityId;
    match.mali.wende(ziel, 'brand', { dmg: 10, by: aktiv, dauer: 3 });
    match.mali.wende(ziel, 'gift', { dmg: 10, by: aktiv, dauer: 3 });
    window.__PA__.advance(2);
    return ziel;
  });
  const marken = page.locator(`.roster-item[data-entity-id="${opfer}"] .status-badge`);
  await expect(marken.first()).toBeVisible();
  const titel = await marken.evaluateAll(els => els.map(e => e.getAttribute('title')));
  expect(titel.join('|')).toMatch(/Brand/);
  expect(titel.join('|')).toMatch(/Gift/);
  await expect(page.locator('#log-list')).toContainText('Brand');
});

test('Schadenszahl trägt Farbe und Zeichen der Schadensart', async ({ page }) => {
  await boot(page, 777);
  await page.evaluate(() => {
    const match = window.__PA__.getMatch();
    const aktiv = match.activePlayerId;
    const ziel = match.getState().entities.find(e => e.entityId !== aktiv).entityId;
    window.__gesehen = [];
    setInterval(() => window.__gesehen.push(...window.__PA__.schadenszahlen()), 16);
    match.world.getSystem('damage').applyDamage(match.world, ziel, 12, aktiv, { damageType: 11 });
    // Das Ereignis erreicht die Anzeige im Simulationsschritt; danach zeichnet die Schleife die Zahl.
    window.__PA__.advance(1);
    window.__PA__.setAutoLoop(true);
  });
  const gesehen = await page.waitForFunction(
    () => window.__gesehen.some(z => z.art === 'schaden-feuer' && z.text.includes('♨')),
    null, { timeout: 5000, polling: 30 },
  ).then(() => true, () => false);
  const alle = await page.evaluate(() => window.__gesehen.slice(0, 5));
  expect(gesehen, JSON.stringify(alle)).toBe(true);
});

test('Dauerbetäubung ist ausgeschlossen: nach einer Betäubung folgt ein Schutzzug', async ({ page }) => {
  await boot(page, 31);
  const ergebnis = await page.evaluate(() => {
    const match = window.__PA__.getMatch();
    const aktiv = match.activePlayerId;
    const ziel = match.getState().entities.find(e => e.entityId !== aktiv).entityId;
    match.mali.betaeube(ziel, aktiv);
    match.endTurn();
    return { abgewehrt: match.mali.betaeube(ziel, aktiv) === null };
  });
  expect(ergebnis.abgewehrt).toBe(true);
});
