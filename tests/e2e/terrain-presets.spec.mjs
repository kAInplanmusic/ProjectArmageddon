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

/**
 * Fester Seed für alle Messungen.
 *
 * Ohne ihn zieht der Start einen zufälligen Seed, und Messungen über
 * verschiedene Karten sind nicht vergleichbar (siehe `messen`).
 */
const SEED = 4242;

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

test('Jede der vier neuen Formen nutzt ihre EIGENE Szene', async ({ page }) => {
  /*
   * Alle vier hatten zunächst KEINE eigene Szene und fielen auf `forest` zurück —
   * eine „Flut" sah aus wie ein Wald. Inzwischen hat jede ihr Leitbiom:
   *
   *   flooded → deluge   (versunkene Stadt, Monsun, ertränkter Wald,
   *                       Reisterrassen, Dammbruch)
   *   open    → open     (Weizenfelder, Heide, Salzpfanne, Polder, Präriesturm)
   *   spires  → spires   (Karsttürme, Dolomiten, Basaltsäulen, Felspfeiler,
   *                       Eisnadeln)
   *   warren  → warren   (Schlucht, Stadtruinen, Höhlengänge, Bambusdickicht,
   *                       Schützengräben)
   *
   * Geprüft wird, dass die ZUORDNUNG ankommt — nicht nur, dass irgendein Biom
   * gesetzt ist. Der Rückfall `forest` wäre die stille Rückkehr des Fehlers.
   */
  const ZUORDNUNG = {
    flooded: 'deluge',
    open: 'open',
    spires: 'spires',
    warren: 'warren',
  };

  for (const [form, erwartet] of Object.entries(ZUORDNUNG)) {
    await page.goto('/');
    await page.waitForFunction(() => Boolean(window.__PA__));
    await page.evaluate(() => window.__PA__.setAutoLoop(false));
    await page.locator('#cfg-preset').selectOption(form);
    await page.getByRole('button', { name: 'Match starten' }).click();
    await expect(page.locator('#menu-overlay')).toBeHidden();

    const kulisse = await page.evaluate(() => window.__PA__.backdrop());
    expect(kulisse.szene?.biom, `${form} nutzt nicht sein eigenes Biom`)
      .toBe(erwartet);
    expect(kulisse.szene.biom, `${form} fällt auf den Wald-Rückfall zurück`)
      .not.toBe('forest');
    expect(kulisse.szene.himmel, `${form}: Szene ohne Himmel`).toBeTruthy();
    expect(kulisse.szene.wasser, `${form}: Szene ohne Wasser`).toBeTruthy();
    // Und es ist die generative Szene (Vorgabe), keine Bildkulisse.
    expect(kulisse.key).toBeNull();
  }
});

test('Die Biomgruppen der neuen Formen sind im Menü wählbar', async ({ page }) => {
  /*
   * Eine Geländeform mit eigenem Biom ist nur dann fertig, wenn die Kulissen auch
   * WÄHLBAR sind: Der Spieler soll nicht nur die Vorgabe sehen, sondern zwischen
   * den Varianten wählen können. Geprüft wird gegen das echte Markup — ein Biom
   * im Katalog ohne Menüeintrag wäre eine unsichtbare Kulisse.
   *
   * Der Dateiname muss zum Schlüssel passen (`<biom>_<variante>.jpg`); die
   * Übereinstimmung ist auch eine Zusage der Projektstruktur und wird vom
   * Unit-Test „Schlüssel und Dateinamen sind eindeutig" verlangt.
   */
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__PA__));

  const stand = await page.evaluate(async () => {
    const modul = await import('/src/shared/config/backdrops.js');
    const auswahl = document.getElementById('cfg-backdrop');
    const optionen = [...auswahl.querySelectorAll('option')].map(o => o.value);
    const gruppen = [...auswahl.querySelectorAll('optgroup')].map(g => g.label);
    return {
      optionen,
      gruppen,
      biome: ['deluge', 'open', 'spires', 'warren'].map(id => {
        const b = modul.BACKDROP_BIOMES.find(x => x.id === id);
        return {
          id,
          label: b?.label ?? null,
          varianten: (b?.variants ?? []).map(v => `${id}/${v.id}`),
          bilder: (b?.variants ?? []).map(v => v.file),
        };
      }),
    };
  });

  for (const biom of stand.biome) {
    expect(biom.label, `Biom „${biom.id}" fehlt im Katalog`).toBeTruthy();
    expect(biom.varianten.length, `Biom „${biom.id}" hat keine fünf Varianten`).toBe(5);
    expect(stand.gruppen, `Die Biomgruppe „${biom.label}" fehlt im Menü`).toContain(biom.label);
    for (const key of biom.varianten) {
      expect(stand.optionen, `Die Kulisse „${key}" fehlt in der Auswahl`).toContain(key);
    }
    for (const datei of biom.bilder) {
      expect(datei, `${biom.id}: Variante ohne passenden Dateinamen`)
        .toMatch(new RegExp(`^${biom.id}_[a-z_]*\\.jpg$`));
    }
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
    /*
     * SEED FESTSCHREIBEN — sonst vergleicht der Test verschiedene Karten.
     *
     * Fund (belegt): Bleibt das Seed-Feld leer, zieht `startMatch` einen
     * ZUFÄLLIGEN Seed. Jeder `messen()`-Aufruf erzeugte damit ein anderes
     * Gelände, und die gemessene Höhenvarianz schwankte entsprechend:
     *
     *     spires:  124, 182, 197, 221   (vier Läufe, vier Karten)
     *     open:     15,4 / 15,7 / 15,7  (zufällig stabil, weil sehr flach)
     *
     * Der Test war deshalb ein Wettrennen: Er fiel um, sobald der zufällige Seed
     * gerade eine flachere `spires`-Karte ergab. Mit festem Seed werden die
     * Zahlen vergleichbar — und der Test prüft wirklich die Geländeform statt
     * das Glück beim Seed.
     */
    await page.locator('#cfg-seed').fill(String(SEED));
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

  /*
   * Verglichen wird RELATIV, nicht gegen feste Zahlen aus einer anderen Umgebung.
   *
   * Fund (belegt): Der Test verlangte für `spires` eine Höhenvarianz > 150 — der
   * Wert stammte aus der Node-Messung (`tests/terrain-presets.test.js`: 191 bei
   * 1280×720). Im Browser gemessen sind es **124**. Die beiden Zahlen sind nicht
   * vergleichbar: Das Match-Terrain wird auf die Leinwandgröße erzeugt, und die
   * Varianz hängt an der Auflösung der Höhenabtastung. Der Test war damit ein
   * Wettrennen um 26 Punkte — er fiel um, sobald sich die Fenstergröße im
   * Testlauf unterschied.
   *
   * Die Aussage, um die es geht, ist ohnehin relativ: `spires` muss STEILER sein
   * als die anderen Formen, `open` FLACHER. Das gilt in jeder Auflösung.
   */
  const offen = await messen('open');
  const huegel = await messen('hills');
  const spitz = await messen('spires');
  const flut = await messen('flooded');

  test.info().annotations.push({
    type: 'Höhenvarianz im Browser',
    description: `open ${offen.varianz.toFixed(0)} | hills ${huegel.varianz.toFixed(0)} `
      + `| spires ${spitz.varianz.toFixed(0)} | flooded ${flut.varianz.toFixed(0)}`,
  });

  // Belegte Werte bei Seed 4242 (gemessen, vier Läufe): open rund 15, hills
  // rund 50, spires rund 190, flooded rund 200. Geprüft wird der Abstand, nicht
  // die Zahl selbst — der Abstand gilt in jeder Umgebung.
  expect(offen.varianz, `Offene Weite ist nicht flach (${offen.varianz.toFixed(0)})`)
    .toBeLessThan(huegel.varianz / 2);
  expect(spitz.varianz, `Felsspitzen sind nicht steiler als Hügel (${spitz.varianz.toFixed(0)} `
    + `gegen ${huegel.varianz.toFixed(0)})`).toBeGreaterThan(huegel.varianz * 2);
  expect(flut.landAnteil, `Flut hat zu viel Land (${(flut.landAnteil * 100).toFixed(0)} %)`)
    .toBeLessThan(0.35);

  // Alle drei sind verschieden — und jedes Match hat einen eigenen Hash.
  expect(new Set([offen.hash, spitz.hash, flut.hash]).size).toBe(3);
});
