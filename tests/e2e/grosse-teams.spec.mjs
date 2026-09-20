/**
 * E2E: Die Matcharten — ein Mensch führt ein ganzes TEAM.
 *
 * ## Der Befund
 *
 * Die Matcharten nennen **3, 4 bzw. 5 Einheiten JE SPIELER**:
 *
 *     klein   2–4 Spieler × 3 Einheiten =  6–12 Figuren
 *     groß      4 Spieler × 4 Einheiten = 16    Figuren
 *     Krieg   6–8 Spieler × 5 Einheiten = 30–40 Figuren
 *
 * Einen Modus mit EINER Einheit je Spieler gibt es darin nicht. Das Menü bot ihn
 * aber an („Spieler pro Team 1–6") — und im Server belegte jeder Beitritt genau
 * einen Platz. Ein Mensch steuerte damit eine einzige Figur.
 *
 * Jetzt heißt das Feld „Einheiten je Spieler" und bietet 3/4/5; ein Mensch
 * besetzt ein ganzes Team. Das Menü muss die Matcharten auch wirklich spielbar
 * machen: anbieten, starten, und alle Figuren in der Übersicht zeigen.
 *
 * ## Was hier geprüft wird
 *
 * Nicht die Zahlen als Selbstzweck, sondern dass die Matcharten **wirklich
 * laufen**: Das Menü bietet sie an, das Match startet, die größeren Matches
 * stehen.
 *
 * ## Eigener Fehler beim Schreiben (bleibt stehen)
 *
 * Ein erster Anlauf suchte die Spielerliste unter `#player-list` und fand
 * **0 Einträge** — der Selektor heißt `#roster` (mit `.roster-item` je Eintrag).
 * Der Fehlschlag sah nach einem kaputten Match aus, war aber ein falscher Test.
 */
import { test, expect } from '@playwright/test';

/** Startet ein lokales Match mit der gegebenen Matchart. */
async function starteMit(page, teams, einheiten) {
  await page.goto('/');
  await page.selectOption('#cfg-teams', String(teams));
  await page.selectOption('#cfg-players', String(einheiten));
  await page.click('#start-button');
  await expect(page.locator('#menu-overlay')).toBeHidden({ timeout: 15000 });
}

test('Das Menü bietet genau die Einheiten der Matcharten an — 3, 4 und 5', async ({ page }) => {
  /*
   * Vorher standen dort 1 bis 6. Die 1 widersprach dem Modell („ein Mensch führt
   * ein Team"); die 6 war im Kriegsmodus nicht vorgesehen und ergäbe mit 8 Teams
   * 48 Figuren — über der Grenze von 40.
   */
  await page.goto('/');

  const werte = await page.locator('#cfg-players option').evaluateAll(
    optionen => optionen.map(o => Number(o.value)),
  );
  expect(werte).toEqual([3, 4, 5]);

  // Die Beschriftung nennt die Matchart, damit die Zahl lesbar ist.
  const texte = await page.locator('#cfg-players option').allTextContents();
  expect(texte.join(' ')).toContain('klein');
  expect(texte.join(' ')).toContain('groß');
  expect(texte.join(' ')).toContain('Krieg');
});

test('Klein: 2 Teams mit 3 Einheiten zeigen 6 Figuren', async ({ page }) => {
  await starteMit(page, 2, 3);

  await expect(page.locator('#roster .roster-item')).toHaveCount(6, { timeout: 10_000 });
});

test('Klein (Maximum): 4 Teams mit 3 Einheiten zeigen 12 Figuren', async ({ page }) => {
  await starteMit(page, 4, 3);

  await expect(page.locator('#roster .roster-item')).toHaveCount(12, { timeout: 10_000 });
});

test('Groß: 4 Teams mit 4 Einheiten zeigen 16 Figuren', async ({ page }) => {
  await starteMit(page, 4, 4);

  await expect(page.locator('#roster .roster-item')).toHaveCount(16, { timeout: 15_000 });
});

test('Krieg: 6 Teams mit 5 Einheiten zeigen 30 Figuren und laufen', async ({ page }) => {
  /*
   * Die kleinste Kriegs-Matchart (6 × 5 = 30). Nicht nur starten: Bei dreißig
   * Figuren ist die Zugreihenfolge der erste Pfad, der bricht, wenn irgendwo eine
   * feste Spielerzahl angenommen wird.
   */
  await starteMit(page, 6, 5);

  await expect(page.locator('#roster .roster-item')).toHaveCount(30, { timeout: 20_000 });

  // Und das Match ist nicht sofort vorbei.
  await expect(page.locator('#hud-log')).toBeVisible();
  await expect(page.locator('#end-overlay')).toBeHidden();
});

test('Das Loadout bietet einen Platz für jede Figur der Partie', async ({ page }) => {
  /*
   * Der Folgefehler, den man leicht übersieht: Die Loadout-Felder werden aus
   * Teams × Einheiten aufgebaut. Bliebe die Liste kürzer, könnten die übrigen
   * Plätze keine Klasse wählen — das Match startete mit Platzhaltern, ohne dass
   * es auffiele.
   */
  await page.goto('/');
  await page.selectOption('#cfg-teams', '4');
  await page.selectOption('#cfg-players', '4');

  // Die Loadout-Auswahl je Platz aufbauen lassen.
  await page.waitForTimeout(500);

  /*
   * Der Selektor heißt `cfg-loadout-klasse-N` (client/main.js) — nicht
   * `loadout-class-N`. Ein erster Anlauf suchte den falschen Namen und fand 0,
   * was wie ein fehlender Aufbau aussah.
   */
  const anzahl = await page.evaluate(
    () => document.querySelectorAll('[id^="cfg-loadout-klasse-"]').length,
  );

  expect(anzahl).toBe(16);
});
