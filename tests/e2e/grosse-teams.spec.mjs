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

test('Krieg: der Kader bleibt bei 30 Figuren auf der Spielfläche und ist scrollbar', async ({ page }) => {
  /*
   * ## Der Befund (B-6 im Befundregister, A9 im Prüfbericht)
   *
   * `#hud-left` hatte `align-self: start` und die Liste `#roster` keinen
   * `overflow` — bei 30–40 Figuren wuchs die Liste über Zeile 2 des HUD-Rasters
   * hinaus und lag HINTER dem (absolut positionierten) Protokollfeld: unten
   * fehlten Figuren, einen Scrollweg gab es nicht.
   *
   * ## Was hier geprüft wird
   *
   * Die GEOMETRIE, nicht `toBeVisible()` (das prüft nur eine nicht-leere Box,
   * keine Deckung):
   *
   *   1. Der Kader-Kasten bleibt INNERHALB der Spielfläche.
   *   2. Die Liste ist scrollbar (`scrollHeight > clientHeight`) — der
   *      Überlaufschutz ist da, statt den Inhalt abzuschneiden.
   *   3. Der LETZTE Eintrag ist durch Scrollen ERREICHBAR — bei 30 Figuren
   *      muss auch die unterste Figur einsehbar sein.
   */
  await starteMit(page, 6, 5);
  await expect(page.locator('#roster .roster-item')).toHaveCount(30, { timeout: 20_000 });

  const messung = await page.evaluate(() => {
    const stage = document.getElementById('stage').getBoundingClientRect();
    // Der Scroll-Container ist das PANEL (#hud-left), nicht die Liste (#roster):
    // `overflow-y: auto` sitzt auf dem Panel, die `<ul>` wächst innen weiter.
    const panel = document.getElementById('hud-left');
    const liste = document.getElementById('roster');
    const items = [...liste.querySelectorAll('.roster-item')];

    const box = panel.getBoundingClientRect();
    // Vor dem Scrollen: liegt das Panel auf der Spielfläche?
    const imStage = box.top >= stage.top - 0.5 && box.bottom <= stage.bottom + 0.5;
    const scrollbar = panel.scrollHeight > panel.clientHeight;

    // Letzten Eintrag anfahren und messen, ob er im sichtbaren Fenster liegt.
    panel.scrollTop = panel.scrollHeight;
    const letzter = items[items.length - 1].getBoundingClientRect();
    const erreichbar = letzter.bottom <= stage.bottom + 0.5 && letzter.top >= stage.top - 0.5;

    return {
      imStage,
      scrollbar,
      scrollHeight: panel.scrollHeight,
      clientHeight: panel.clientHeight,
      erreichbar,
      letzterTop: Math.round(letzter.top),
      letzterBottom: Math.round(letzter.bottom),
      stageTop: Math.round(stage.top),
      stageBottom: Math.round(stage.bottom),
    };
  });

  expect(messung.imStage,
    `Der Kader läuft über die Spielfläche hinaus (bottom ${messung.letzterBottom} > stage ${messung.stageBottom})`)
    .toBe(true);
  expect(messung.scrollbar,
    `Kein Überlaufschutz: scrollHeight ${messung.scrollHeight} == clientHeight ${messung.clientHeight}`)
    .toBe(true);
  expect(messung.erreichbar,
    `Der letzte Kader-Eintrag ist auch nach dem Scrollen nicht sichtbar (top ${messung.letzterTop})`)
    .toBe(true);
});

test('Das Protokoll bleibt bei 30 Figuren AUF der Spielfläche — und zeigt mehr als eine Zeile', async ({ page }) => {
  /*
   * ## Der Befund, den dieser Test festhält (belegt, gemessen in Chrome)
   *
   * `#hud-log` hing in Zeile 3 des HUD-Rasters, und Zeile 2 ist `1fr` — sie
   * wächst mit ihrem Inhalt. Bei 30–40 Figuren ist die Spielerliste über 2000 px
   * hoch, damit rutschte das Protokoll UNTER die Spielfläche: gemessen
   * `top = 2221 px` bei einer Spielfläche, die bei `855 px` endet. Sichtbar waren
   * **0 Zeilen** — und zwar genau dann, wenn viele Meldungen entstehen.
   *
   * Die alte Prüfung an dieser Stelle war `expect(page.locator('#hud-log')).toBeVisible()`
   * und hat das NICHT bemerkt: `toBeVisible()` fragt nur nach einer nicht-leeren
   * Box, nicht danach, ob sie auf der Spielfläche liegt. Genau die Unterscheidung
   * „gehört ins Modell" gegen „ist zu sehen" war damit ungeprüft.
   *
   * ## Was hier geprüft wird
   *
   * Die GEOMETRIE: Der Kasten muss innerhalb der Spielfläche liegen, und es
   * müssen mehrere Zeilen GANZ sichtbar sein. Gemessen wird mit Füllzeilen, weil
   * die Fläche sich sonst nach dem Inhalt richtet (wenige Meldungen = kleiner
   * Kasten) — geprüft werden soll die Kapazität, nicht der Zufall eines Laufs.
   */
  await starteMit(page, 6, 5);
  await expect(page.locator('#roster .roster-item')).toHaveCount(30, { timeout: 20_000 });

  const messung = await page.evaluate(() => {
    const game = window.__PA__.game;
    for (let i = 0; i < 30; i += 1) game.hud.log(`Füllzeile ${i}`);

    const stage = document.getElementById('stage').getBoundingClientRect();
    const box = document.getElementById('hud-log').getBoundingClientRect();
    const liste = document.getElementById('log-list');

    // Sichtbar = im Kasten UND auf der Spielfläche (der Kasten schneidet
    // überzählige Zeilen ab, die Spielfläche alles außerhalb).
    const oben = Math.max(box.top, stage.top);
    const unten = Math.min(box.bottom, stage.bottom);
    let sichtbar = 0;
    for (const li of liste.children) {
      const r = li.getBoundingClientRect();
      if (r.height > 0 && r.top >= oben - 0.5 && r.bottom <= unten + 0.5) sichtbar += 1;
    }
    return {
      imStage: box.top >= stage.top - 0.5 && box.bottom <= stage.bottom + 0.5,
      boxTop: Math.round(box.top),
      stageBottom: Math.round(stage.bottom),
      sichtbar,
    };
  });

  expect(messung.imStage,
    `Das Protokoll liegt NICHT auf der Spielfläche: top ${messung.boxTop} px, `
    + `Fläche endet bei ${messung.stageBottom} px`).toBe(true);
  expect(messung.sichtbar, `Sichtbare Protokollzeilen: ${messung.sichtbar} von 30 Füllzeilen`)
    .toBeGreaterThanOrEqual(8);
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
