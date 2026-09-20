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

/*
 * ENTFERNT (2026-09-19): Der Test „Jede Geländeform steht in der Kartenauswahl"
 * prüfte die Menü-Auswahl `#cfg-preset`. Die Auswahl ist entfernt, weil sie die
 * Karte nicht beeinflusste (der autonome Generator entscheidet aus dem Seed).
 * Der Katalog der Formen (`TERRAIN_PRESETS`) wird in `tests/terrain-presets.test.js`
 * geprüft — dort, wo er hingehört.
 */

test('Mit festem Seed lässt sich über das Menü ein Match starten', { timeout: 180_000 }, async ({ page }) => {
  /*
   * Der vollständige Spielerpfad. Geprüft wird nicht nur, dass das Match läuft,
   * sondern auch dass alle Figuren auf TROCKENEM Grund stehen.
   *
   * Der Seed wandert über die acht Formen, weil die Form keine Karte mehr
   * auswählt (2026-09-19 entfernt): Acht Läufe mit acht Seeds prüfen damit acht
   * verschiedene Karten — mehr als vorher, wo alle acht Läufe dieselbe ergaben.
   */
  for (const [index, form] of FORMEN.entries()) {
    await page.goto('/');
    await page.waitForFunction(() => Boolean(window.__PA__));
    // Die automatische Schleife vor dem Start abschalten, damit der Test nicht
    // von der Zahl der gelaufenen Ticks abhängt.
    await page.evaluate(() => window.__PA__.setAutoLoop(false));

    /*
     * Fester Seed je Durchlauf. Ohne ihn zieht der Start eine ZUFÄLLIGE Karte,
     * und dieser Test wäre eine Lotterie — gemessen (2026-09-19) starteten über
     * den Menüweg bei 19 von 60 Seeds Figuren im Wasser, weil die
     * Startplatzierung nur den Fußpunkt prüfte. Die Ursache ist behoben
     * (Körperpunkt wird jetzt mitgeprüft); der feste Seed stellt sicher, dass
     * der Test den Zustand prüft, den er behauptet.
     */
    await page.locator('#cfg-seed').fill(String(SEED + index));
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

  await page.locator('#cfg-seed').fill(String(SEED));
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

/*
 * ENTSCHIEDEN UND UMGESCHRIEBEN (2026-09-20).
 *
 * Die frühere Fassung erwartete, dass jede Geländeform ihr eigenes Leitbiom
 * zeigt (`flooded → deluge` …). Das galt, als das PRESET die Karte baute. Seit
 * der autonome Generator die Vorgabe ist (`main.js` übergibt
 * `kartentyp: 'autonom'`), entscheidet der Seed — und die Kulisse folgt dem
 * CHARAKTER der Karte (`match.js #waehleSzeneAusCharakter`, `kartencharakter`).
 * Über den Menüweg zeigten deshalb gemessen ALLE vier Formen dieselbe Kulisse.
 *
 * Die Entscheidung ist die des Auftraggebers von damals: `#cfg-preset` ist
 * ENTFERNT (ein Bedienelement, das nichts bewirkt, ist irreführender als
 * keines). Der Test prüft jetzt die Zusage, die es wirklich gibt:
 *
 *     Das Biom der gezeigten Szene ist die Ableitung des Kartencharakters.
 *
 * Damit ist er wieder eine echte Gegenprobe: Er würde fallen, wenn die Anzeige
 * eine andere Kulisse zöge als die Karte hergibt — oder wenn das Biom aus dem
 * Seed direkt käme statt aus dem Charakter.
 */
test('Die gezeigte Kulisse ist die Ableitung des Kartencharakters', { timeout: 180_000 }, async ({ page }) => {
  /*
   * Zuerst war die Kulisse dem PRESET zugeordnet („Flut sieht aus wie eine
   * Flut"), dann fiel sie auf `forest` zurück („eine Flut sah aus wie ein
   * Wald"), jetzt folgt sie dem CHARAKTER der erzeugten Karte.
   *
   * Geprüft wird die Ableitung selbst — nicht, dass irgendein Biom gesetzt ist.
   * Der Vergleich kommt aus derselben Funktion, die der Motor benutzt
   * (`biomFuerCharakter`), wird aber IM BROWSER aufgerufen: Eine Kopie der Regel
   * hier wäre eine zweite Wahrheit und würde einen Fehler in der Anzeige
   * überdecken.
   *
   * Mehrere Seeds, damit nicht ein einzelner Charakter die Aussage trägt.
   */
  const SEEDS = [4242, 4243, 4244, 4245, 7777, 9001];

  for (const seed of SEEDS) {
    await page.goto('/');
    await page.waitForFunction(() => Boolean(window.__PA__));
    await page.evaluate(() => window.__PA__.setAutoLoop(false));
    await page.locator('#cfg-seed').fill(String(seed));
    await page.getByRole('button', { name: 'Match starten' }).click();
    await expect(page.locator('#menu-overlay')).toBeHidden();

    const stand = await page.evaluate(async () => {
      const modul = await import('/src/shared/biomwahl.js');
      const match = window.__PA__.getMatch();
      const kulisse = window.__PA__.backdrop();
      return {
        charakter: match.kartencharakter ?? null,
        erwartet: modul.biomFuerCharakter(match.kartencharakter),
        biom: kulisse.szene?.biom ?? null,
        himmel: kulisse.szene?.himmel ?? null,
        wasser: kulisse.szene?.wasser ?? null,
        bildKey: kulisse.key,
      };
    });

    expect(stand.charakter, `Seed ${seed}: das Match nennt keinen Kartencharakter`).toBeTruthy();
    expect(stand.biom, `Seed ${seed}: die Kulisse folgt nicht dem Charakter`)
      .toBe(stand.erwartet);
    expect(stand.himmel, `Seed ${seed}: Szene ohne Himmel`).toBeTruthy();
    expect(stand.wasser, `Seed ${seed}: Szene ohne Wasser`).toBeTruthy();
    // Und es ist die generative Szene (die Vorgabe), keine Bildkulisse.
    expect(stand.bildKey, `Seed ${seed}: Bildkulisse statt generativer Szene`).toBeNull();
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

/*
 * ENTSCHIEDEN UND UMGESCHRIEBEN (2026-09-20).
 *
 * Die frühere Fassung verglich die Geländekennzahlen der vier FORMEN über das
 * Menü. Das kann nicht mehr funktionieren: `main.js` übergibt
 * `kartentyp: 'autonom'`, der SEED bestimmt die Karte — gemessen erzeugten alle
 * vier Formen dieselbe (`hash 6bc9aa96`, `landAnteil 0,524`).
 *
 * Die Neufassung vergleicht deshalb SEEDS. Das ist die stärkere Aussage: Sie
 * prüft genau die Zusage, auf der Client und Server aufbauen — GLEICHER Seed
 * ergibt GLEICHE Karte, VERSCHIEDENE Seeds verschiedene. Der Determinismus ist
 * damit im Browser belegt, nicht nur in Node.
 */
test('Gleicher Seed ergibt dieselbe Karte, verschiedene Seeds verschiedene (Browser wie Node)', { timeout: 180_000 }, async ({ page }) => {
  /*
   * Gegenprobe zur Unit-Messung: Die Erzeugung im Browser muss dieselbe Karte
   * ergeben wie in Node. Wäre das anders, liefe die Anzeige mit einem anderen
   * Gelände als die Simulation — und der Determinismus zwischen Client und
   * Server wäre hinfällig.
   *
   * Geprüft wird deshalb das, worauf Client und Server aufbauen:
   *   - GLEICHER Seed, zweimal gestartet  → dieselbe Karte (auch der Hash).
   *   - VERSCHIEDENE Seeds                 → verschiedene Karten.
   * Gegen feste Höhenwerte wird NICHT geprüft: Die Varianz hängt an der
   * Auflösung der Höhenabtastung (gemessen: 124 im Browser gegen 191 in Node
   * bei `spires`) — ein solcher Wert wäre ein Wettrennen um Fenstergrößen.
   */
  const messen = async seed => {
    await page.goto('/');
    await page.waitForFunction(() => Boolean(window.__PA__));
    await page.evaluate(() => window.__PA__.setAutoLoop(false));
    /*
     * SEED FESTSCHREIBEN — sonst vergleicht der Test verschiedene Karten.
     *
     * Fund (belegt, 2026-09-19): Bleibt das Feld leer, zieht `startMatch` einen
     * ZUFÄLLIGEN Seed; jeder Aufruf erzeugte ein anderes Gelände, und die
     * gemessene Höhenvarianz schwankte entsprechend (124, 182, 197, 221).
     */
    await page.locator('#cfg-seed').fill(String(seed));
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

      // Der Zustandshash ist die Zahl, die Client und Server aus demselben Seed
      // übereinstimmend bilden müssen.
      return {
        varianz,
        landAnteil: land / (width * height),
        hash: match.stateHash(),
        seedUsed: match.seedManager.baseSeed,
      };
    });
  };

  const erst = await messen(4242);
  const nochmal = await messen(4242);
  const anders = await messen(9001);

  test.info().annotations.push({
    type: 'Karte im Browser',
    description: `Seed 4242: Varianz ${erst.varianz.toFixed(1)} | `
      + `Land ${(erst.landAnteil * 100).toFixed(1)} % | Hash ${erst.hash} `
      + `(zweiter Lauf: ${nochmal.hash}) — Seed 9001: Varianz `
      + `${anders.varianz.toFixed(1)} | Hash ${anders.hash}`,
  });

  // 1. Der Seed kommt an — nicht ein zufälliger.
  expect(erst.seedUsed).toBe(4242);
  expect(anders.seedUsed).toBe(9001);

  // 2. GLEICHER Seed, zweimal gestartet: dieselbe Karte.
  expect(nochmal.hash).toBe(erst.hash);
  expect(nochmal.varianz).toBeCloseTo(erst.varianz, 6);
  expect(nochmal.landAnteil).toBeCloseTo(erst.landAnteil, 9);

  // 3. VERSCHIEDENE Seeds: verschiedene Karten.
  expect(anders.hash).not.toBe(erst.hash);
  const unterscheidetSich = Math.abs(anders.varianz - erst.varianz) > 0.5
    || Math.abs(anders.landAnteil - erst.landAnteil) > 0.001;
  expect(unterscheidetSich, 'zwei verschiedene Seeds ergaben dasselbe Gelände').toBe(true);

  // 4. Sanity: Es ist überhaupt Land da (kein Fixwert, nur ein Bereich).
  for (const messung of [erst, nochmal, anders]) {
    expect(messung.landAnteil).toBeGreaterThan(0.02);
    expect(messung.landAnteil).toBeLessThan(0.98);
  }
});
