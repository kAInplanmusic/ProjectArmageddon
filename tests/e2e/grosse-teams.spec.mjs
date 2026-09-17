/**
 * E2E: Größere Teams (bis 12 Spieler).
 *
 * ## Der Befund
 *
 * Die Lobby erlaubte **3 Spieler je Team**, ohne dass im Code ein Grund stand.
 * Die Messung zeigte, dass die Grenze nicht nötig war: Der Motor trägt
 * **12 Figuren** ohne Einschränkung (alle werden gesetzt, alle Teams stehen).
 *
 * Zudem widersprachen sich zwei Zahlen: `MAX_LOBBY_PLAYERS` lag bereits bei 12,
 * die Grenze je Team aber bei 3 — die kleinere war die wirksame.
 *
 * ## Was hier geprüft wird
 *
 * Nicht die Zahlen (die sind eine Produktentscheidung), sondern dass die
 * größeren Matches **wirklich spielbar** sind: Das Menü bietet sie an, das
 * Match startet, alle Figuren stehen in der Übersicht.
 *
 * ## Eigener Fehler beim Schreiben
 *
 * Ein erster Anlauf suchte die Spielerliste unter `#player-list` und fand
 * **0 Einträge** — der Selektor heißt `#roster` (mit `.roster-item` je
 * Eintrag). Der Fehlschlag sah nach einem kaputten Match aus, war aber ein
 * falscher Test. Die echten Selektoren stehen in `index.html:686` und werden in
 * `emblem.spec.mjs` bereits so benutzt.
 */
import { test, expect } from '@playwright/test';

/** Startet ein lokales Match mit der gegebenen Teamgröße. */
async function starteMit(page, teams, proTeam) {
  await page.goto('/');
  await page.selectOption('#cfg-teams', String(teams));
  await page.selectOption('#cfg-players', String(proTeam));
  await page.click('#start-button');
  await expect(page.locator('#menu-overlay')).toBeHidden({ timeout: 15000 });
}

test('Das Menü bietet bis zu sechs Spieler je Team an', async ({ page }) => {
  /*
   * Vorher standen dort nur 1 bis 3. Ein Spieler konnte die größeren Matches
   * gar nicht wählen — selbst wenn der Server sie erlaubte.
   */
  await page.goto('/');

  const werte = await page.locator('#cfg-players option').evaluateAll(
    optionen => optionen.map(o => Number(o.value)),
  );

  expect(werte).toEqual([1, 2, 3, 4, 5, 6]);
});

test('2 Teams mit 6 Spielern starten und zeigen 12 Figuren', async ({ page }) => {
  /*
   * Die größte Konfiguration, die die Kapazität hergibt (2 × 6 = 12).
   */
  await starteMit(page, 2, 6);

  await expect(page.locator('#roster .roster-item')).toHaveCount(12, { timeout: 10_000 });
});

test('4 Teams mit 3 Spielern starten und zeigen 12 Figuren', async ({ page }) => {
  /*
   * Die andere Verteilung derselben Gesamtzahl — 4 Teams × 3.
   */
  await starteMit(page, 4, 3);

  await expect(page.locator('#roster .roster-item')).toHaveCount(12, { timeout: 10_000 });
});

test('Ein 8-Spieler-Match läuft', async ({ page }) => {
  /*
   * Nicht nur starten: Das Match muss auch LAUFEN. Bei acht Figuren ist die
   * Zugreihenfolge der erste Pfad, der bricht, wenn irgendwo eine feste
   * Spielerzahl angenommen wird.
   */
  await starteMit(page, 2, 4);

  // Acht Figuren in der Übersicht.
  await expect(page.locator('#roster .roster-item')).toHaveCount(8, { timeout: 10_000 });

  // Und das Match ist nicht sofort vorbei.
  await expect(page.locator('#hud-log')).toBeVisible();
  await expect(page.locator('#end-overlay')).toBeHidden();
});

test('Das Loadout bietet einen Platz für jeden der 12 Spieler', async ({ page }) => {
  /*
   * Der Folgefehler, den man leicht übersieht: Die Loadout-Felder werden aus
   * der Teamgröße aufgebaut. Bliebe die Liste bei vier stehen, könnten die
   * Spieler 5 bis 12 keine Klasse wählen — das Match startete mit Platzhaltern,
   * ohne dass es auffiele.
   */
  await page.goto('/');
  await page.selectOption('#cfg-teams', '2');
  await page.selectOption('#cfg-players', '6');

  // Die Loadout-Auswahl je Platz aufbauen lassen.
  await page.waitForTimeout(500);

  /*
   * Der Selektor heißt `cfg-loadout-klasse-N` (client/main.js:412) — nicht
   * `loadout-class-N`. Ein erster Anlauf suchte den falschen Namen und fand 0,
   * was wie ein fehlender Aufbau aussah.
   */
  const anzahl = await page.evaluate(
    () => document.querySelectorAll('[id^="cfg-loadout-klasse-"]').length,
  );

  expect(anzahl).toBe(12);
});
