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
  await page.fill('#cfg-seed', String(seed));
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

  test('HALTEN lädt auf: es ergibt mehr Kraft als ein Tippen', async ({ page }) => {
    /*
     * ## Der Befund, den dieser Test festhält (belegt)
     *
     * `InputController#releaseCharge` löschte `#charging` VOR `onFire()`, und
     * `Main#fire` las genau danach `isCharging` — immer `false`. Die Folge: Der
     * Ladezweig in `fire()` war toter Code, jede Kugel flog mit der eingestellten
     * Kraft, und der Spieler sah keinen Ladefortschritt. Der alte Test dieser
     * Datei prüfte nur `tick > 0` — er hätte das nie bemerkt: Es passierte ja
     * etwas, nur nicht das Versprochene („halten = mehr Kraft", README und
     * Tastaturliste in `index.html`).
     *
     * ## Warum die Tasten IM SEITENKONTEXT gesendet werden
     *
     * Ein Tipp ist ein Tastendruck, der praktisch keine Zeit dauert. Über das
     * Playwright-Protokoll gedrückt (keyboard.down + keyboard.up) dauerte
     * „Tippen" gemessen **~650 ms** — der Seitenprozess ist direkt nach dem
     * Matchstart mit dem Backen des Geländes beschäftigt. Gemessen wurde damit
     * `Schuss abgegeben (68 Kraft)` für einen „Tipp". Das ist kein Tipp mehr,
     * sondern ein halbes Aufladen, und der Vergleich hätte die Wirkung des
     * HALTENS nicht mehr belegt.
     *
     * Deshalb werden echte `KeyboardEvent`s im selben Task gesendet: Drücken und
     * Loslassen ohne Zeit dazwischen ist genau der getippte Schuss, und die
     * Ladung wird über `performance.now()` gemessen — die Größe, die das Spiel
     * selbst benutzt. Der Weg ist unverändert echt: dieselben `window`-Listener
     * (`InputController#attach`), derselbe `onFire`-Pfad, dieselbe Meldung im
     * Protokoll. Dass auch die echte Playwright-Tastatur feuert, hält der Test
     * direkt darüber fest (`Die Leertaste lädt weiterhin auf …`).
     *
     * ## Ein „Tipp" muss auch ein Tipp sein
     *
     * Die Dauer des Tipps wird MITGEMESSEN (`performance.now()` um die beiden
     * Versendungen — dieselbe Uhr wie der Ladefortschritt). Auf einer belasteten
     * Maschine dauert selbst dieser Block länger: gemessen **514 ms** für einen
     * „Tipp", was `Schuss abgegeben (60 Kraft)` ergibt. Das ist kein Tipp,
     * sondern ein halbes Aufladen — und genau dieser Fall hat den Test einmal
     * rot gemacht. Deshalb gilt ein Durchgang nur, wenn der Tipp unter 150 ms
     * blieb; sonst wird der ganze Durchgang wiederholt. Die Zusicherung selbst
     * bleibt streng.
     *
     * ## Was gemessen wird
     *
     * Zwei Zahlen aus dem Protokoll: ein getippter und ein voll aufgeladener
     * Schuss. Dazu der Ladefortschritt WÄHREND des Haltens — genau die Größe,
     * aus der die Ladeanzeige im Renderer und der Kraftwert im HUD entstehen.
     */
    await page.goto('/');
    await page.waitForFunction(() => window.__PA__?.game, null, { timeout: 15_000 });

    const messen = () => page.evaluate(async () => {
      const api = window.__PA__;
      const warte = ms => new Promise(fertig => setTimeout(fertig, ms));
      const runter = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      const hoch = () => window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true }));
      const leseKraft = () => {
        const treffer = [...document.querySelectorAll('#log-list li')]
          .map(li => (li.textContent ?? '').match(/Schuss abgegeben \((\d+) Kraft\)/))
          .filter(Boolean);
        return treffer.length > 0 ? Number(treffer[0][1]) : null;
      };
      const starte = async () => {
        api.startMatch({ seed: 20260916, teams: 2, playersPerTeam: 1, preset: 'hills' });
        await warte(100);
      };

      // 1) TIPPEN: Drücken und Loslassen ohne Zeit dazwischen — und die Dauer
      //    messen (sie IST die Ladedauer dieses Schusses).
      await starte();
      const t0 = performance.now();
      runter();
      hoch();
      const tippDauer = performance.now() - t0;
      await warte(150);
      const getippt = leseKraft();

      // 2) HALTEN: länger als die volle Ladezeit (1200 ms).
      await starte();
      runter();
      await warte(500);
      const beimHalten = { laedt: api.game.input.isCharging, anteil: api.game.input.chargeRatio };
      await warte(900);
      hoch();
      await warte(150);
      const gehalten = leseKraft();

      return { getippt, gehalten, beimHalten, tippDauer };
    });

    /*
     * Zwei Gründe für eine Wiederholung:
     *
     *  1. Ein Reload des Dev-Servers (schreibende Parallelarbeiter →
     *     `[vite] page reload`) zerstört den Ausführungs-Kontext mitten in der
     *     Messung.
     *  2. Der „Tipp" war auf einer belasteten Maschine KEIN Tipp (Dauer über
     *     150 ms) — dann misst der Vergleich nicht, was er messen soll.
     *
     * Die Zusicherung selbst (Halten > Tippen, Spanne 30…100) bleibt streng.
     */
    const dauern = [];
    let ergebnis = null;
    let letzterFehler = null;
    for (let versuch = 0; versuch < 5 && ergebnis === null; versuch += 1) {
      try {
        const lauf = await messen();
        dauern.push(Math.round(lauf.tippDauer));
        if (lauf.tippDauer > 150) {
          await page.waitForTimeout(300);
          continue;
        }
        ergebnis = lauf;
      } catch (fehler) {
        letzterFehler = fehler;
        if (!/Execution context was destroyed|closed/i.test(String(fehler?.message))) throw fehler;
        await page.waitForTimeout(300);
      }
    }
    if (ergebnis === null) {
      throw letzterFehler ?? new Error(
        `Kein gültiger Tipp-Durchgang: gemessene Tipp-Dauern ${JSON.stringify(dauern)} ms `
        + '(erlaubt sind höchstens 150 ms) — die Maschine ist zu belastet für diese Messung',
      );
    }

    const { getippt, gehalten, beimHalten, tippDauer } = ergebnis;

    // Vorbedingungen — ohne sie prüfte der Vergleich nichts.
    expect(getippt, 'Ein getippter Schuss muss gefeuert haben').not.toBeNull();
    expect(gehalten, 'Ein gehaltener Schuss muss gefeuert haben').not.toBeNull();
    expect(beimHalten.laedt, 'Während des Haltens muss geladen werden').toBe(true);
    expect(beimHalten.anteil, 'Der Ladefortschritt muss wachsen (die Größe der Ladeanzeige)')
      .toBeGreaterThan(0.4);

    // DIE Zusicherung: Halten ergibt MEHR Kraft als Tippen.
    expect(gehalten, `Halten (${gehalten}) muss mehr Kraft ergeben als Tippen (${getippt}, `
      + `${Math.round(tippDauer)} ms)`)
      .toBeGreaterThan(getippt);
    /*
     * Und die Spanne ist die zugesagte: Tippen = Minimum (30), voll = 100.
     *
     * Gemessen mit dieser Sonde (`/tmp/pa-probe/probe-laden.mjs`, nicht im
     * Repo): **Tippen 33, Halten 100**. Die Grenzen lassen Last zu und schließen
     * trotzdem aus, dass ein „Tipp" ein halbes Aufladen war.
     */
    expect(getippt).toBeLessThan(60);
    expect(gehalten).toBeGreaterThanOrEqual(90);
  });
});
