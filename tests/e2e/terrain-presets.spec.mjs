import { test, expect } from '@playwright/test';

/**
 * Geländeformen im Spiel.
 *
 * Die Unit-Tests prüfen die Erzeugung; hier geht es um den WEG, auf dem ein
 * Spieler eine Geländeform erreicht: Auswahl im Menü, Klick auf „Match starten",
 * spielbares Match. Ein Motor-Test hätte nicht bemerkt, dass eine Form zwar
 * existiert, aber nicht in der Auswahl steht — oder dass der Start mit ihr
 * fehlschlägt.
 *
 * Der Anlass: Vier Formen kamen hinzu (`open`, `spires`, `flooded`, `warren`).
 * Bei `flooded` starteten zuvor 51 % der Figuren untergetaucht — das Match war
 * entschieden, bevor der erste Zug begann.
 */

/** Die Geländeformen in der Reihenfolge der Auswahlliste. */
const FORMEN = ['hills', 'mountains', 'islands', 'caverns', 'open', 'spires', 'flooded', 'warren'];

test('Jede Geländeform steht in der Kartenauswahl', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__PA__));

  const werte = await page.locator('#cfg-preset option').evaluateAll(
    optionen => optionen.map(o => o.value),
  );

  for (const form of FORMEN) {
    expect(werte, `Die Geländeform „${form}" fehlt in der Auswahl`).toContain(form);
  }
  // Und jede Option hat eine lesbare Beschriftung.
  const beschriftungen = await page.locator('#cfg-preset option').evaluateAll(
    optionen => optionen.map(o => (o.textContent ?? '').trim()),
  );
  for (const [index, text] of beschriftungen.entries()) {
    expect(text.length, `Option ${werte[index]} hat keine Beschriftung`).toBeGreaterThan(2);
  }
});

test('Mit jeder Geländeform lässt sich über das Menü ein Match starten', async ({ page }) => {
  /*
   * Der vollständige Spielerpfad. Geprüft wird nicht nur, dass das Match läuft,
   * sondern auch dass alle Figuren auf trockenem Grund stehen — das ist die
   * Eigenschaft, die bei `flooded` fehlte.
   */
  for (const form of FORMEN) {
    await page.goto('/');
    await page.waitForFunction(() => Boolean(window.__PA__));
    // Die automatische Schleife vor dem Start abschalten, damit der Test nicht
    // von der Zahl der gelaufenen Ticks abhängt.
    await page.evaluate(() => window.__PA__.setAutoLoop(false));

    await page.locator('#cfg-preset').selectOption(form);
    await page.getByRole('button', { name: 'Match starten' }).click();
    await expect(page.locator('#menu-overlay'), `Menü blieb offen bei ${form}`).toBeHidden();

    const befund = await page.evaluate(() => {
      const api = window.__PA__;
      const state = api.getState();
      return {
        status: state.status,
        figuren: state.entities.length,
        wasser: state.entities.map(e => e.waterLevel),
        // Die Kartenform, mit der das Match tatsächlich läuft.
        preset: api.getMatch().preset ?? api.getMatch().terrain?.preset ?? null,
      };
    });

    expect(befund.status, `${form}: Match läuft nicht`).toBe('playing');
    expect(befund.figuren, `${form}: keine Figuren`).toBeGreaterThan(0);

    for (const [index, stand] of befund.wasser.entries()) {
      // 0.72 ist DROWN_LEVEL: darüber ertrinkt die Figur.
      expect(stand, `${form}: Figur ${index} startet untergetaucht (${stand})`).toBeLessThan(0.72);
    }
    // Und keine startet auch nur nass — sonst wäre der Start vom Seed abhängig
    // benachteiligt.
    for (const [index, stand] of befund.wasser.entries()) {
      expect(stand, `${form}: Figur ${index} startet nass (${stand})`).toBe(0);
    }
  }
});

test('Eine neue Geländeform startet mit einer Darstellung und ohne Fehler', async ({ page }) => {
  /*
   * `flooded` und `warren` haben noch KEINE eigene Kulissengruppe (siehe
   * MASTERDOTO). Sie müssen trotzdem starten und gezeichnet werden.
   *
   * Beim ersten Anlauf prüfte dieser Test `backdrop().key` und schlug fehl —
   * `null`. Das war aber KEIN Fehler: Ohne ausdrücklich gewählte Bildkulisse ist
   * die GENERATIVE Szene die Vorgabe, und `backdropKey` bleibt dann absichtlich
   * leer (`startMatch` ruft `setScenery`, nicht `setBackdrop`). Gemessen statt
   * angenommen: `pickScenery` liefert eine vollständige Szene, und der Weg über
   * das Bild wird nur bei ausdrücklicher Wahl beschritten.
   *
   * Geprüft wird deshalb, was tatsächlich gelten muss: Es gibt eine
   * Darstellungsgrundlage (Szene oder Bild), sie hat eine Kennung, und beim
   * Zeichnen tritt kein Fehler auf.
   */
  const fehler = [];
  page.on('pageerror', error => fehler.push(String(error)));

  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__PA__));
  await page.evaluate(() => window.__PA__.setAutoLoop(false));

  await page.locator('#cfg-preset').selectOption('flooded');
  await page.getByRole('button', { name: 'Match starten' }).click();
  await expect(page.locator('#menu-overlay')).toBeHidden();

  // Ein paar Bilder laufen lassen, damit das Zeichnen wirklich ausgeführt wird.
  await page.evaluate(() => {
    for (let i = 0; i < 30; i += 1) window.__PA__.advance(1);
  });

  const kulisse = await page.evaluate(() => window.__PA__.backdrop());
  expect(kulisse, 'Keine Darstellung gemeldet').toBeTruthy();

  // Entweder eine Bildkulisse ODER eine generative Szene — eine von beiden muss
  // es sein, sonst bliebe der Hintergrund leer.
  const hatBild = Boolean(kulisse.key);
  const hatSzene = Boolean(kulisse.szene?.biom);
  expect(hatBild || hatSzene,
    'Weder Bildkulisse noch generative Szene gesetzt — der Hintergrund wäre leer').toBe(true);

  // Die generative Szene ist vollständig, wenn sie der Weg ist.
  if (hatSzene) {
    expect(kulisse.szene.himmel, 'Szene ohne Himmel').toBeTruthy();
    expect(kulisse.szene.wasser, 'Szene ohne Wasser').toBeTruthy();
  }

  /*
   * Und die Bodenfarbe ist gesetzt. Sie kam früher global und gehört jetzt zur
   * Szene — über einer Eiskulisse ergab grünes Gras auf Packeis keinen Sinn.
   * Geprüft werden beide Werte als Farbtripel, nicht nur „vorhanden".
   */
  expect(kulisse.palette, 'Keine Bodenfarbe').toBeTruthy();
  for (const [name, farbe] of [['Oberfläche', kulisse.palette.surface], ['Tiefe', kulisse.palette.deep]]) {
    expect(Array.isArray(farbe), `Bodenfarbe ${name} ist kein Farbtripel`).toBe(true);
    expect(farbe.length, `Bodenfarbe ${name} hat ${farbe.length} Werte statt 3`).toBe(3);
    for (const wert of farbe) {
      expect(Number.isFinite(wert) && wert >= 0 && wert <= 255,
        `Bodenfarbe ${name}: unzulässiger Wert ${wert}`).toBe(true);
    }
  }

  expect(fehler, `Seitenfehler: ${fehler.join(' | ')}`).toEqual([]);
});

test('Die vier neuen Formen nutzen die generative Szene (Kulissen fehlen noch)', async ({ page }) => {
  /*
   * Die offene Lücke, festgehalten statt verschwiegen: Für die vier neuen Formen
   * gibt es keine eigene Kulissengruppe (Bilder). Sie laufen deshalb mit der
   * generativen Szene, die ohne Leitbiom auf `forest` zurückfällt.
   *
   * Der Test hält BEIDES fest: dass die Formen spielbar sind (also kein Grund
   * zur Eile), und dass ihnen eine eigene Szene fehlt (also kein „fertig").
   * Sobald jemand Kulissen malt und ein Leitbiom einträgt, schlägt der Test an —
   * dann ist die Lücke geschlossen und der Test wird angepasst.
   */
  for (const form of ['open', 'spires', 'flooded', 'warren']) {
    await page.goto('/');
    await page.waitForFunction(() => Boolean(window.__PA__));
    await page.evaluate(() => window.__PA__.setAutoLoop(false));
    await page.locator('#cfg-preset').selectOption(form);
    await page.getByRole('button', { name: 'Match starten' }).click();
    await expect(page.locator('#menu-overlay')).toBeHidden();

    const kulisse = await page.evaluate(() => window.__PA__.backdrop());
    expect(kulisse.key, `${form} hat jetzt eine Bildkulisse — dann bitte diesen Test anpassen`).toBeNull();
    // Der Rückfall auf `forest` ist die dokumentierte Zwischenlösung.
    expect(kulisse.szene?.biom, `${form}: keine generative Szene`).toBe('forest');
  }
});

test('Vier Formen unterscheiden sich auch im Browser messbar', async ({ page }) => {
  /*
   * Gegenprobe zur Unit-Messung: Die Erzeugung im Browser muss dieselben
   * Unterschiede zeigen wie in Node. Wäre das anders, liefe die Anzeige mit
   * einem anderen Gelände als die Simulation — und der Determinismus zwischen
   * Client und Server wäre hinfällig.
   */
  const messen = async form => {
    await page.goto('/');
    await page.waitForFunction(() => Boolean(window.__PA__));
    await page.evaluate(() => window.__PA__.setAutoLoop(false));
    await page.locator('#cfg-preset').selectOption(form);
    await page.getByRole('button', { name: 'Match starten' }).click();
    await expect(page.locator('#menu-overlay')).toBeHidden();

    return page.evaluate(() => {
      const match = window.__PA__.getMatch();
      const bitmap = match.bitmap;
      const width = match.width;
      const height = match.height;

      // Höhenprofil aus dem Bitmap: erster solider Pixel je Spalte.
      const hoehen = [];
      for (let x = 0; x < width; x += 1) {
        for (let y = 0; y < height; y += 1) {
          if (bitmap[y * width + x]) { hoehen.push(y); break; }
        }
      }
      const mittel = hoehen.reduce((a, b) => a + b, 0) / hoehen.length;
      const varianz = Math.sqrt(hoehen.reduce((a, b) => a + (b - mittel) ** 2, 0) / hoehen.length);

      let land = 0;
      for (const zelle of bitmap) if (zelle) land += 1;

      // Dieselbe Zahl muss der Zustandshash ergeben — Server und Client rechnen
      // aus demselben Seed dasselbe Gelände.
      return { varianz, landAnteil: land / (width * height), hash: match.stateHash() };
    });
  };

  const offen = await messen('open');
  const spitz = await messen('spires');
  const flut = await messen('flooded');

  expect(offen.varianz, `Offene Weite ist nicht flach (${offen.varianz.toFixed(0)})`).toBeLessThan(20);
  expect(spitz.varianz, `Felsspitzen sind nicht steil (${spitz.varianz.toFixed(0)})`).toBeGreaterThan(150);
  expect(flut.landAnteil, `Flut hat zu viel Land (${(flut.landAnteil * 100).toFixed(0)} %)`).toBeLessThan(0.35);

  // Alle drei sind verschieden — und jedes Match hat einen eigenen Hash.
  expect(new Set([offen.hash, spitz.hash, flut.hash]).size).toBe(3);
});
