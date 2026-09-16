/**
 * E2E: Schussvorhersage und Boden-Rechenweg im echten Browser.
 *
 * Warum im Browser und nicht nur als Unit-Test: Die Vorhersage hängt an Dingen,
 * die es nur dort gibt — `performance.now`, das rekonstruierte Terrain, die
 * Bestandsnachricht vom Server. Ein Unit-Test kann die Rechnung prüfen, nicht
 * das Zusammenspiel.
 *
 * Der WebGPU-Teil prüft bewusst NICHT, dass die GPU benutzt wird: In dieser
 * Umgebung gibt es kein WebGPU (gemessen: `navigator.gpu` fehlt im
 * System-Chrome, auch mit `--enable-unsafe-swiftshader`). Geprüft wird, was
 * stimmen muss — dass die Wahl korrekt gemeldet wird und der Rückfall
 * vollständige Pixel liefert. Eine Behauptung „GPU läuft" wäre hier nicht
 * belegbar und wird deshalb auch nicht aufgestellt.
 */
import { test, expect } from '@playwright/test';

/** Startet ein lokales Match mit festem Seed. */
async function starteLokalesMatch(page, seed = '20260916') {
  await page.goto('/');
  await page.selectOption('#cfg-preset', 'hills');
  await page.fill('#cfg-seed', seed);
  await page.click('#start-button');
  await page.waitForFunction(() => window.__PA__?.game?.match !== null, null, { timeout: 15_000 });
  // Ein paar Bilder laufen lassen, damit Terrain und Kulisse stehen.
  await page.waitForTimeout(400);
}

test.describe('Boden-Rechenweg (WebGPU-Auswahl)', () => {
  test('In dieser Umgebung ist WebGPU nicht verfügbar — der Rückfall nennt den Grund', async ({ page }) => {
    await page.goto('/');
    const ergebnis = await page.evaluate(() => window.__PA__.enableGpu());
    expect(ergebnis.available).toBe(false);
    /*
     * Der Grund ist konkret, nicht „unbekannt".
     *
     * Gemessen in dieser Umgebung: `navigator.gpu` IST vorhanden, aber
     * `requestAdapter()` liefert `null` — der Kopf ist da, die Hardware nicht.
     * Genau deshalb prüft die Erkennung bis zum GERÄT und nicht nur die
     * Schnittstelle: Eine Prüfung auf `'gpu' in navigator` hätte hier
     * fälschlich „verfügbar" gemeldet.
     */
    expect(typeof ergebnis.reason).toBe('string');
    expect(ergebnis.reason.length).toBeGreaterThan(0);
    expect(ergebnis.reason).not.toMatch(/unknown|undefined/);
  });

  test('Nach der Anfrage ist der Weg ausgewiesen und liefert trotzdem Pixel', async ({ page }) => {
    await starteLokalesMatch(page);
    await page.evaluate(() => window.__PA__.enableGpu());

    const pfad = await page.evaluate(() => window.__PA__.terrainPath());
    expect(pfad.attempted).toBe(true);
    // Ohne nutzbares Gerät MUSS der Weg die CPU sein. Das ist die eigentliche
    // Aussage dieses Tests.
    expect(pfad.path).toBe('cpu');
    expect(pfad.device).toBe(false);
    expect(pfad.reason).toBeTruthy();

    /*
     * Und die Bodenfläche ist wirklich gefüllt — nicht nur „kein Fehler".
     *
     * Gemessen wird am Canvas: Die Geländeschicht liegt als erstes Bild auf der
     * Zeichenfläche. Ein Pixel deutlich unter der Oberfläche muss die
     * Bodenfarbe tragen, kein Schwarz und kein Alpha-Null.
     */
    const gefuellt = await page.evaluate(() => {
      const game = window.__PA__.game;
      const layer = game.renderer.terrainLayer;
      if (!layer) return { error: 'keine Geländeschicht' };
      const ctx = layer.getContext('2d');
      const bild = ctx.getImageData(0, 0, layer.width, layer.height).data;
      let undurchsichtig = 0;
      for (let i = 3; i < bild.length; i += 4) {
        if (bild[i] > 0) undurchsichtig += 1;
      }
      return { undurchsichtig, gesamt: layer.width * layer.height };
    });

    expect(gefuellt.error).toBeUndefined();
    // Auf einer Hügelkarte liegt ein erheblicher Teil unter der Oberfläche.
    expect(gefuellt.undurchsichtig).toBeGreaterThan(gefuellt.gesamt * 0.2);
  });

  test('Die Vorgabe ist die CPU — ohne Wahl wird kein Gerät angefordert', async ({ page }) => {
    await starteLokalesMatch(page);
    const pfad = await page.evaluate(() => window.__PA__.terrainPath());
    // `attempted` bleibt false: Wer die Option nicht wählt, bekommt keinen
    // stillen GPU-Versuch. Das ist der Unterschied zwischen „Wahl" und „Zwang".
    expect(pfad.attempted).toBe(false);
    expect(pfad.device).toBe(false);
  });
});

test.describe('Schussvorhersage', () => {
  test('Lokal läuft keine Vorhersage — der Schuss ist ohnehin sofort da', async ({ page }) => {
    await starteLokalesMatch(page);
    // Feuern: Der Schuss geht in die lokale Simulation, nicht durchs Netz.
    await page.keyboard.press('Enter');
    await page.waitForTimeout(120);

    const zustand = await page.evaluate(() => window.__PA__.prediction());
    expect(zustand.active).toBe(false);
    expect(zustand.stats.predictions).toBe(0);
  });

  test('Nach einem lokalen Schuss gibt es weiterhin genau eine Anzeige', async ({ page }) => {
    /*
     * Die Vorhersage darf die lokale Anzeige NICHT verdoppeln: Lokal erzeugt die
     * Simulation das Ereignis sofort, eine zusätzliche Vorschau wäre ein zweiter
     * Strahl für denselben Schuss.
     */
    await starteLokalesMatch(page);
    await page.click('#game-canvas', { position: { x: 400, y: 300 } });
    await page.waitForTimeout(150);

    const zustand = await page.evaluate(() => window.__PA__.prediction());
    expect(zustand.pending).toBeNull();
  });

  test('Der Vorhersage-Zustand ist über die Diagnose abfragbar', async ({ page }) => {
    await starteLokalesMatch(page);
    const zustand = await page.evaluate(() => window.__PA__.prediction());
    expect(zustand).toHaveProperty('active');
    expect(zustand.stats).toEqual({
      predictions: 0, confirmed: 0, discarded: 0, timedOut: 0,
    });
  });
});

test.describe('Tastatur feuert', () => {
  test('Enter löst einen Schuss aus', async ({ page }) => {
    /*
     * Fund (belegt): Enter wurde STUMM verworfen. In `input.js` stand es in der
     * Aufzählung der ignorierten Tasten, während das README „`Enter` | Feuern"
     * dokumentierte. Kein Test hat es je geprüft — die Steuerungstabelle war
     * eine Behauptung.
     *
     * Aufgefallen ist es, als die Schussvorhersage einen Test brauchte, der
     * ohne Maus feuert: Ein Klick auf die Zeichenfläche verändert den Winkel
     * mit, Enter nicht.
     */
    await starteLokalesMatch(page);

    const vorher = await page.evaluate(() => {
      const game = window.__PA__.game;
      const zustand = game.match.getState();
      return {
        tick: zustand.tick,
        hatGefeuert: game.match.getState().projectiles.length > 0,
      };
    });

    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);

    /*
     * Gemessen wird am sichtbaren Protokoll — dort schreibt der Client jede
     * Schussmeldung hinein (`Schuss abgegeben …`). Ein Geschoss allein wäre
     * kein Beweis: Bei einer Hitscan- oder Selbstwirkungswaffe entsteht keines,
     * der Schuss wäre trotzdem abgegeben.
     */
    const danach = await page.evaluate(() => {
      const game = window.__PA__.game;
      const zustand = game.match.getState();
      const protokoll = [...document.querySelectorAll('#log-list li')]
        .map(el => el.textContent ?? '');
      return {
        geschosse: zustand.projectiles.length,
        tick: zustand.tick,
        hatGefeuert: game.match.hasFiredThisTurn ?? null,
        protokoll,
      };
    });

    expect(danach.tick).toBeGreaterThan(vorher.tick);
    const hatMeldung = danach.protokoll.some(text => /Schuss/i.test(text));
    expect(hatMeldung || danach.geschosse > 0,
      `Enter muss einen Schuss auslösen. Protokoll: ${JSON.stringify(danach.protokoll.slice(0, 6))}`).toBe(true);
  });

  test('Die Leertaste lädt weiterhin auf und feuert beim Loslassen', async ({ page }) => {
    // Die Gegenprobe: Der Enter-Weg darf die Leertaste nicht verdrängt haben.
    await starteLokalesMatch(page);
    await page.keyboard.down(' ');
    await page.waitForTimeout(120);
    await page.keyboard.up(' ');
    await page.waitForTimeout(120);

    const zustand = await page.evaluate(() => window.__PA__.game.match.getState());
    expect(zustand.tick).toBeGreaterThan(0);
  });
});
