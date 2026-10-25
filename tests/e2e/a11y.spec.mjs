import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { oeffneMenue, oeffneLobby, starteHud } from './helfer/ux-zustand.mjs';

/**
 * Barrierefreiheits-Prüfung mit axe-core (WCAG 2.0 A/AA).
 *
 * Geprüft werden die drei Wege, die jeder Spieler zuerst sieht: Menü, die
 * offene Lobby-Liste und das HUD eines laufenden lokalen Matches.
 *
 * Die Verstöße werden IMMER als Liste ausgegeben — auch die nicht kritischen.
 * Der Test schlägt nur bei `critical` fehl: Die übrigen Funde sollen sichtbar
 * sein, ohne den Lauf für bekannte Altlasten (etwa Farbkontraste) zu blockieren.
 */

/** Führt axe aus, protokolliert alle Verstöße und bricht nur bei `critical` ab. */
async function pruefeMitAxe(page, bereich) {
  const ergebnis = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();

  const zeilen = ergebnis.violations.map(verstoss => ({
    id: verstoss.id,
    impact: verstoss.impact ?? 'unbekannt',
    help: verstoss.help,
    hilfe: verstoss.helpUrl,
    knoten: verstoss.nodes.length,
    ziele: verstoss.nodes.slice(0, 4).map(knoten => knoten.target.join(' ')),
  }));

  console.log(`\n[axe] ${bereich}: ${zeilen.length} Verstoß(e)`);
  for (const zeile of zeilen) {
    console.log(
      `- [${zeile.impact}] ${zeile.id}: ${zeile.help} `
      + `(${zeile.knoten} Knoten; ${zeile.ziele.join(' | ') || 'ohne Ziel'})`,
    );
  }
  if (zeilen.length === 0) console.log('- keine');

  await test.info().attach(`axe-${bereich.replace(/\s+/g, '-').toLowerCase()}.json`, {
    body: JSON.stringify(zeilen, null, 2),
    contentType: 'application/json',
  });

  const kritisch = zeilen.filter(zeile => zeile.impact === 'critical');
  expect(kritisch, `Kritische axe-Verstöße (${bereich}): ${JSON.stringify(kritisch, null, 2)}`)
    .toEqual([]);

  return zeilen;
}

test('Menü: WCAG A/AA ohne kritische Verstöße', async ({ page }) => {
  const fehler = await oeffneMenue(page);
  await expect(page.locator('#menu-overlay')).toBeVisible();
  await pruefeMitAxe(page, 'Menü');
  expect(fehler).toEqual([]);
});

test('Lobby: WCAG A/AA ohne kritische Verstöße', async ({ page }) => {
  const fehler = await oeffneMenue(page);
  await oeffneLobby(page);
  await pruefeMitAxe(page, 'Lobby');
  expect(fehler).toEqual([]);
});

test('HUD: WCAG A/AA ohne kritische Verstöße', async ({ page }) => {
  const fehler = await oeffneMenue(page);
  await starteHud(page);
  await pruefeMitAxe(page, 'HUD');
  expect(fehler).toEqual([]);
});
