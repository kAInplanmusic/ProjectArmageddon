/**
 * DYNAMIK: Treffer- und Explosionsgefühl — Wirkung UND Preis.
 *
 * ## Warum diese Datei zwei Dinge tut
 *
 * Der Auftrag lautet „bessere Dynamik, hoher Flow" — und die Zahlen des Audits
 * sagen, dass dafür Zeit da ist (Simulation 0,069 ms je Tick gegen ein Budget
 * von 16,7 ms). Daraus folgt aber nicht, dass jede Rückmeldung gratis ist. Also
 * wird hier JEDE Maßnahme zweimal geprüft:
 *
 *   1. SIEHT MAN SIE? — ein Pixelunterschied im echten Canvas, gemessen im
 *      selben Bild mit und ohne die Liste. Belegt wird das Bild, nicht die
 *      Absicht.
 *   2. WAS KOSTET SIE? — die Dauer von `renderer.render()` und die Zahl der
 *      Zeichenaufrufe, je Maßnahme gegen dieselbe Rechnung OHNE die Liste.
 *
 * ## Wie gemessen wird
 *
 * - **Synchron in EINEM `page.evaluate`.** Die Bildschleife des Spiels läuft
 *   über `requestAnimationFrame`; ein synchroner Block kann nicht von ihr
 *   unterbrochen werden. Damit misst jede Zahl dieselbe Umgebung — und nicht
 *   die Tagesform des Rechners.
 * - **Der Renderer-Zeitgeber wird stillgelegt** (`renderer.time` vor jedem
 *   Aufruf gesetzt): Sonst zeichnen Wasser, Kulisse und Puls je Aufruf ein
 *   anderes Bild, und der Vergleich misst die Animation statt der Maßnahme.
 *   Dasselbe Vorgehen wie in `guenther-online.spec.mjs`.
 * - **Die Bildzeit ist die Dauer von `renderer.render()`**, nicht die Bildrate:
 *   In dieser Umgebung (kopfloses Chrome, Software-Rasterung) bestimmt der
 *   Rasterer die Bildrate, nicht das Spiel — gemessen 48,8 ms je Bild im
 *   `profiling.spec.mjs`. Geprüft wird die Arbeit, die die Maßnahmen ZUSÄTZLICH
 *   verursachen; genau die ändert sich mit dem Code.
 *
 * ## Die Gegenprobe (Zähne)
 *
 * Jede Sichtbarkeits-Prüfung vergleicht ZWEI Bilder DESSELBEN Zustands — mit
 * und ohne die betreffende Liste. Ein Test, der nur „das Bild hat sich
 * verändert" prüft, wäre auch dann grün, wenn die Liste gar nichts zeichnet.
 * Die andere Hälfte des Beweises: Mit leerer Liste ist der Unterschied genau
 * null — und das war vor diesem Zug der Zustand BEI GEFÜLLTER Liste (die
 * Splitter wurden nie gezeichnet).
 *
 * ## Parallele Arbeiter: der Dev-Server lädt die Seite neu
 *
 * Während dieses Zuges schreiben sieben andere Arbeiter am selben Baum. Jede
 * gespeicherte Datei lässt Vite die Seite neu laden; mitten in einem Test ist
 * der Ausführungskontext dann zerstört („Execution context was destroyed, most
 * likely because of a navigation", gemessen im ersten Lauf dieser Datei). Das
 * ist KEIN Produktfehler. Jeder Testkörper läuft deshalb in
 * `mitWiederholung`: Bei einem Umgebungsfehler wird das Match neu gestartet und
 * der Körper wiederholt — höchstens dreimal, und JEDE Wiederholung wird mit
 * ihrer Ursache protokolliert. Zusicherungen (`AssertionError`) werden NICHT
 * wiederholt: Sie sind das Ergebnis, auf das es ankommt.
 */
import { test, expect } from '@playwright/test';

/** Fester Seed — sonst misst jeder Lauf eine andere Karte. */
const SEED = 20260927;

/** So viele Renderer-Aufrufe je Arm (mit/ohne) einer Maßnahme. */
const RUNDEN = 20;

/** Startbedingung des Matches — zwei Teams, damit es Treffer geben kann. */
const START = { seed: SEED, teams: 2, playersPerTeam: 2, preset: 'mountains' };

/** Fehlerbilder eines Dev-Server-Neuladens (siehe Dateikopf). */
const UMGEBUNGSFEHLER = [
  'Execution context was destroyed',
  'Cannot read properties of undefined (reading \'getState\')',
  'Cannot read properties of null (reading \'entities\')',
  'Cannot read properties of null (reading \'projectiles\')',
  'Target closed',
];

/**
 * Startet ein Match und hält die Simulation an.
 *
 * `setAutoLoop(false)` ist wesentlich: Ohne das rechnet der Motor zwischen zwei
 * Messungen weiter, und derselbe Aufruf träfe einen anderen Zustand.
 *
 * Die Wartebedingung ist NULLSICHER (`window.__PA__?.getState?.()`): Nach einem
 * Neuladen ist `__PA__` kurz weg, und ein werfendes Prädikat lässt
 * `waitForFunction` sofort scheitern, statt weiter zu warten (gemessen im
 * ersten Lauf dieser Datei: „TypeError: Cannot read properties of undefined
 * (reading 'getState')").
 */
async function starteStill(page) {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__PA__), null, { timeout: 30_000 });
  await page.evaluate(async optionen => {
    await window.__PA__.startMatch(optionen);
    window.__PA__.setAutoLoop(false);
  }, START);
  await page.waitForFunction(
    () => window.__PA__?.getState?.()?.entities?.length > 0,
    null,
    { timeout: 30_000 },
  );
  // Den Kartenaufbau (Terrain-Backen, ~900 000 Pixel) abklingen lassen.
  await page.waitForTimeout(800);
}

/**
 * Führt einen Testkörper aus — und wiederholt ihn, wenn die UMGEBUNG ihn
 * abgebrochen hat (Dev-Server-Reload, siehe Dateikopf).
 *
 * @param {import('@playwright/test').Page} page
 * @param {Function} koerper läuft nach `starteStill`; bekommt die Seitenfehler
 * @returns {Promise<any>} das Ergebnis des Körpers
 */
async function mitWiederholung(page, koerper, { versuche = 3 } = {}) {
  let letzterFehler;
  for (let versuch = 1; versuch <= versuche; versuch += 1) {
    const seitenfehler = [];
    const sammle = error => seitenfehler.push(String(error));
    page.on('pageerror', sammle);
    try {
      await starteStill(page);
      const ergebnis = await koerper(seitenfehler);
      if (seitenfehler.length > 0) throw new Error(`Seitenfehler: ${seitenfehler.join(' | ')}`);
      page.off('pageerror', sammle);
      return ergebnis;
    } catch (fehler) {
      page.off('pageerror', sammle);
      letzterFehler = fehler;
      const text = String(fehler?.message ?? fehler);
      if (fehler?.name === 'AssertionError' || !UMGEBUNGSFEHLER.some(m => text.includes(m))) {
        throw fehler;
      }
      console.log(`[Umgebung] Versuch ${versuch}/${versuche} verworfen: `
        + `${text.split('\n')[0]} — ein Neuladen durch einen parallel schreibenden Arbeiter, `
        + 'kein Produktfehler. Neuer Versuch.');
    }
  }
  throw letzterFehler;
}

/**
 * Legt die Prüf-Helfer im Seitenkontext ab.
 *
 * ## Warum im SEITENKONTEXT und nicht im Test
 *
 * Die Messungen müssen synchron laufen (siehe Dateikopf). Außerdem sind die
 * Bilddaten `Uint8ClampedArray` — die gehen nicht über die Playwright-Brücke.
 * Der Vergleich passiert deshalb in der Seite, und herüber kommt nur die Zahl
 * der unterschiedlichen Bildpunkte.
 *
 * Der gemessene Zustand trägt SECHS Krater mit Splittern, Rauch, Narben und
 * Ruck. Er wird über die ECHTE Schnittstelle `applyCrater` gebaut — genau der
 * Aufruf, den die Ereignistafel für eine Explosion macht, und keine handgebaute
 * Liste.
 */
async function installiereHelfer(page) {
  await page.evaluate(() => {
    const spiel = window.__PA__.game;
    const renderer = spiel.renderer;

    const basis = window.__PA__.getState();
    const figuren = basis.entities.map(f => ({ ...f }));

    if (renderer.gefuehlZuruecksetzen) renderer.gefuehlZuruecksetzen();
    else renderer.particles = [];

    /*
     * SECHS Einschläge mit Flächenwirkung, an verschiedenen Stellen und in
     * verschiedenen Bildern (`renderer.time`) — sonst greift der Schutz gegen
     * den doppelten Krater desselben Einschlags.
     */
    const krater = [];
    for (let i = 0; i < 6; i += 1) {
      renderer.time += 1;
      const x = 320 + i * 110;
      const y = 360 + (i % 2) * 24;
      renderer.applyCrater(x, y, 40);
      krater.push({ x, y });
    }

    // Ein echter Schuss gehört dazu: Mündungsfeuer, Strahl, Blitz.
    renderer.addMuzzleFlash(basis.activePlayerId ?? figuren[0]?.entityId ?? 1, Math.PI / 4);
    renderer.addFlash(krater[0].x, krater[0].y, 56);
    renderer.addBeam(400, 300, krater[0].x, krater[0].y, { hit: true });

    const kontext = { aim: null, water: null, blastRadius: 0 };

    /** Der Zustand, der gezeichnet wird (Leben je Figur überschreibbar). */
    const zustandMit = (projektile = [], leben = [100, 100]) => ({
      ...basis,
      entities: figuren.map((f, i) => ({ ...f, health: leben[i] ?? f.health })),
      projectiles: projektile,
    });

    const bewegtesGeschoss = i => ({ entityId: 901, x: 520 + i * 16, y: 260, fuseSeconds: 0 });

    /*
     * Die Spuren gibt es erst seit diesem Zug. Fehlen sie (eine ältere Fassung
     * des Renderers, etwa in einem Vergleichs-Baum), wird die Spur übersprungen
     * statt zu werfen — die übrigen Maßnahmen bleiben messbar.
     */
    const spurFaehig = Boolean(renderer.spuren);
    if (spurFaehig) {
      // Spur füllen: 14 Bilder dasselbe Geschoss, je ein Schritt.
      for (let i = 0; i < 14; i += 1) {
        renderer.time = 900 + i;
        renderer.render(zustandMit([bewegtesGeschoss(i)]), kontext);
      }
    }
    const spurInhalt = spurFaehig ? [...(renderer.spuren.get(901) ?? [])] : [];

    /*
     * TREFFER erzeugen: ein Bild mit vollem Leben, dann eines mit weniger. Der
     * Renderer vergleicht die Gesundheit selbst — das ist der Weg des Spiels.
     */
    renderer.time = 777;
    renderer.render(zustandMit(), kontext);
    renderer.time = 778;
    renderer.render(zustandMit([], [70, 60]), kontext);

    /** Der feste Inhalt je Liste — das, was gemessen wird. */
    const inhalte = {
      particles: [...(renderer.particles ?? [])],
      narben: [...(renderer.narben ?? [])],
      rauch: [...(renderer.rauch ?? [])],
      trefferMarken: [...(renderer.trefferMarken ?? [])],
      spuren: new Map([[901, [...spurInhalt]]]),
    };

    /* ---------------------------------------------------------------- *
     * Zeichenaufrufe mitzählen (Instanz-Patch: der Renderer ruft sie über
     * `this.ctx`, also greift die eigene Eigenschaft zuerst).
     * ---------------------------------------------------------------- */
    const gezaehlt = { arc: 0, fill: 0, stroke: 0, fillRect: 0, strokeRect: 0, drawImage: 0, fillText: 0, ellipse: 0 };
    const originale = {};
    for (const name of Object.keys(gezaehlt)) {
      originale[name] = renderer.ctx[name].bind(renderer.ctx);
      renderer.ctx[name] = (...args) => {
        gezaehlt[name] += 1;
        return originale[name](...args);
      };
    }

    window.__T__ = {
      spiel,
      renderer,
      kontext,
      zustandMit,
      inhalte,
      /*
       * Der gemessene Zustand trägt das bewegte Geschoss, damit
       * `Renderer#fuehreSpuren` die Spur aus dem ZUSTAND fortschreibt — sonst
       * wäre sie beim Zeichnen schon wieder leer (der Renderer baut die Karte
       * je Bild aus dem Zustand neu, siehe `#fuehreSpuren`).
       */
      zustand: zustandMit([bewegtesGeschoss(13)], [70, 60]),

      nullen() { for (const name of Object.keys(gezaehlt)) gezaehlt[name] = 0; },
      aufrufe() { return Object.values(gezaehlt).reduce((a, b) => a + b, 0); },

      /** Stellt die Inhalte her (mehrere Listen) oder leert sie. */
      setze(felder, mit) {
        for (const feld of felder) {
          const wert = mit ? inhalte[feld] : [];
          renderer[feld] = feld === 'spuren' ? new Map(wert) : [...wert];
        }
      },

      /** Die Aufschlüsselung der Zeichenaufrufe (für den Bericht). */
      zaehler() { return { ...gezaehlt }; },

      /** Ein Bild OHNE die genannten Listen — alles andere bleibt gleich. */
      ohne(felder, fn) {
        const gerettet = {};
        for (const feld of felder) gerettet[feld] = renderer[feld];
        this.setze(felder, false);
        try { return fn(); } finally {
          for (const feld of felder) renderer[feld] = gerettet[feld];
        }
      },

      /** Ein Bildausschnitt in BILDSCHIRMkoordinaten (Kameratransformation). */
      ausschnitt(kartenX, kartenY, breite, hoehe) {
        const t = spiel.kamera.transformation();
        const sx = Math.round(kartenX * t.skalierung + t.versatzX);
        const sy = Math.round(kartenY * t.skalierung + t.versatzY);
        const links = Math.max(0, Math.min(renderer.width - breite, sx - Math.round(breite / 2)));
        const oben = Math.max(0, Math.min(renderer.height - hoehe, sy - Math.round(hoehe / 2)));
        return renderer.ctx.getImageData(links, oben, breite, hoehe).data;
      },

      unterschied(a, b) {
        let stellen = 0;
        for (let i = 0; i < a.length; i += 4) {
          if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) stellen += 1;
        }
        return stellen;
      },
    };
  });
}

/** Median/Mittel/Maximum einer Messreihe. */
function bilanz(zeiten) {
  const sortiert = [...zeiten].sort((a, b) => a - b);
  return {
    p50: +sortiert[Math.floor(sortiert.length / 2)].toFixed(3),
    mittel: +(zeiten.reduce((a, b) => a + b, 0) / zeiten.length).toFixed(3),
    max: +Math.max(...zeiten).toFixed(3),
  };
}

test.describe('Dynamik — Bildzeit und Zeichenaufrufe je Maßnahme', () => {
  test('Jede Maßnahme ist im Budget — mit Zahl vor und nach', async ({ page }) => {
    /*
     * Dieses Zeitlimit gilt für DIESEN Test: Er misst 200 Renderer-Aufrufe, und
     * ein Aufruf auf 2560×1440 kostet in Software-Rasterung ein paar
     * Millisekunden. Das ist die Messung, kein Produktfehler.
     */
    test.setTimeout(240_000);

    const bericht = await mitWiederholung(page, async () => {
      await installiereHelfer(page);
      return page.evaluate(runden => {
        const T = window.__T__;
        const renderer = T.renderer;

        /**
         * Ein Messarm: ein Aufruf mit festem Inhalt bzw. ohne.
         *
         * Beide Arme laufen VERSCHRÄNKT (siehe unten): Ein Lastausschlag der
         * Umgebung trifft dann beide Arme gleichmäßig, und die Differenz bleibt
         * aussagekräftig. Ein einzelner Ausschlag (belegt: 10,9 s während eines
         * parallelen E2E-Laufs mit Terrain-Backen) verzerrt sonst genau einen
         * Arm.
         */
        const armlauf = (felder, mit, zeiten, zaehler) => {
          T.setze(felder, mit);
          T.nullen();
          renderer.time = 777;
          const t0 = performance.now();
          renderer.render(T.zustand, T.kontext);
          zeiten.push(performance.now() - t0);
          zaehler.aufrufe += T.aufrufe();
          zaehler.laeufe += 1;
        };

        const MASSE = [
          ['Splitter (Explosion)', ['particles']],
          ['Kraterrand (Narbe)', ['narben']],
          ['Nachhall (Rauch)', ['rauch']],
          ['Treffermarke', ['trefferMarken']],
          ['Projektilspur', ['spuren']],
        ];

        const ergebnis = [];
        for (const [name, felder] of MASSE) {
          const mit = [];
          const ohne = [];
          const zaehler = { mit: { aufrufe: 0, laeufe: 0 }, ohne: { aufrufe: 0, laeufe: 0 } };
          for (let i = 0; i < runden; i += 1) {
            armlauf(felder, true, mit, zaehler.mit);
            armlauf(felder, false, ohne, zaehler.ohne);
          }
          ergebnis.push({
            name,
            anzahl: felder.reduce((summe, feld) => summe + (feld === 'spuren'
              ? (T.inhalte.spuren.get(901)?.length ?? 0)
              : T.inhalte[feld].length), 0),
            mit: { zeiten: mit, aufrufe: Math.round(zaehler.mit.aufrufe / zaehler.mit.laeufe) },
            ohne: { zeiten: ohne, aufrufe: Math.round(zaehler.ohne.aufrufe / zaehler.ohne.laeufe) },
          });
        }

        /* Die Summe des Zuges: alles an gegen alles aus, ebenfalls verschränkt. */
        const ALLE = ['particles', 'narben', 'rauch', 'trefferMarken', 'spuren'];
        const summeZeiten = { mit: [], ohne: [] };
        const summeZaehler = { mit: { aufrufe: 0, laeufe: 0 }, ohne: { aufrufe: 0, laeufe: 0 } };
        for (let i = 0; i < runden; i += 1) {
          armlauf(ALLE, true, summeZeiten.mit, summeZaehler.mit);
          armlauf(ALLE, false, summeZeiten.ohne, summeZaehler.ohne);
        }

        return {
          ergebnis,
          summe: {
            mit: summeZeiten.mit,
            ohne: summeZeiten.ohne,
            aufrufeMit: Math.round(summeZaehler.mit.aufrufe / summeZaehler.mit.laeufe),
            aufrufeOhne: Math.round(summeZaehler.ohne.aufrufe / summeZaehler.ohne.laeufe),
          },
          /*
           * Die Aufschlüsselung nach Art des Zeichenaufrufs für EIN Bild mit
           * bzw. ohne die Maßnahmen — sie macht sichtbar, WOHER die Differenz
           * kommt (Punkte, Flächen, Striche, Bilder).
           */
          einzelnOhne: (() => {
            T.setze(ALLE, false); T.nullen();
            renderer.render(T.zustand, T.kontext);
            return T.zaehler();
          })(),
          einzelnMit: (() => {
            T.setze(ALLE, true); T.nullen();
            renderer.render(T.zustand, T.kontext);
            return T.zaehler();
          })(),
          bildgroesse: { breite: renderer.width, hoehe: renderer.height },
        };
      }, RUNDEN);
    });

    for (const m of bericht.ergebnis) {
      const mit = bilanz(m.mit.zeiten);
      const ohne = bilanz(m.ohne.zeiten);
      const zeile = `${m.name}: ${ohne.p50} → ${mit.p50} ms (Δ ${(mit.p50 - ohne.p50).toFixed(3)}), `
        + `${m.anzahl} Objekte, Zeichenaufrufe ${m.ohne.aufrufe} → ${m.mit.aufrufe}, `
        + `Maximum ${mit.max} ms`;
      console.log(`DYNAMIK [${m.name}] ${zeile}`);
      test.info().annotations.push({ type: `Bildzeit ${m.name}`, description: zeile });
    }

    const summeMit = bilanz(bericht.summe.mit);
    const summeOhne = bilanz(bericht.summe.ohne);
    const summenzeile = `ALLE MASSNAHMEN: ${summeOhne.p50} → ${summeMit.p50} ms `
      + `(Δ ${(summeMit.p50 - summeOhne.p50).toFixed(3)}), Zeichenaufrufe `
      + `${bericht.summe.aufrufeOhne} → ${bericht.summe.aufrufeMit}, `
      + `Bild ${bericht.bildgroesse.breite}×${bericht.bildgroesse.hoehe}`;
    console.log(`DYNAMIK [Summe] ${summenzeile}`);
    console.log(`DYNAMIK [Aufrufe/ohne] ${JSON.stringify(bericht.einzelnOhne)}`);
    console.log(`DYNAMIK [Aufrufe/mit] ${JSON.stringify(bericht.einzelnMit)}`);
    test.info().annotations.push({ type: 'Bildzeit alle Maßnahmen', description: summenzeile });

    /* ------------------------------------------------------------------ *
     * Die Prüfungen: Was gemessen wurde, muss auch GELTEN.
     * ------------------------------------------------------------------ */

    /*
     * 1. Ein Renderer-Aufruf muss in ein 60-Hz-Bild passen (16,7 ms) — mit
     *    Abstand. Geprüft wird der MEDIAN, nicht das Maximum: In dieser
     *    Umgebung ist ein einzelner Ausschlag von 10,9 s belegt (ein paralleler
     *    E2E-Lauf mit Terrain-Backen) — der sagt nichts über das Spiel, sondern
     *    über die Maschine. Der Median bleibt davon unberührt, weil beide Arme
     *    verschränkt gemessen werden.
     */
    for (const m of bericht.ergebnis) {
      const mit = bilanz(m.mit.zeiten);
      expect(mit.p50, `${m.name}: Median ${mit.p50} ms je Bild — das sprengt das 60-Hz-Budget`)
        .toBeLessThan(16.7);
    }

    /*
     * 2. DIE EIGENTLICHE GRENZE: Alle Maßnahmen ZUSAMMEN müssen einen kleinen
     *    Teil des 60-Hz-Budgets ausmachen. Geprüft wird die Differenz
     *    p50(alles an) − p50(alles aus): die zusätzliche Zeichenarbeit.
     *
     *    Die Grenze von 3,3 ms (ein Fünftel des Budgets) liegt bewusst weit
     *    über der Erwartung: Diese Umgebung rastert in Software, ein
     *    Messrauschen von ein bis zwei Millisekunden ist normal. Die Prüfung
     *    fängt einen ECHTEN Ausreißer (hundert zusätzliche Objekte, eine
     *    Schleife ohne Deckel), nicht die Streuung. Der gemessene Wert steht
     *    als Annotation im Report und in `docs/dynamik.md`.
     */
    const zusatz = summeMit.p50 - summeOhne.p50;
    expect(zusatz, `Alle Maßnahmen zusammen kosten ${zusatz.toFixed(3)} ms je Bild — `
      + 'das ist mehr als ein Fünftel des 60-Hz-Budgets (3,3 ms)').toBeLessThan(3.3);
  });
});

test.describe('Dynamik — sieht man es? (Pixel, nicht Absicht)', () => {
  test('Die Explosionssplitter werden GEZEICHNET (der Fehler dieser Sitzung)', async ({ page }) => {
    /*
     * VOR diesem Zug war `#drawParticles` im Renderer definiert und wurde von
     * KEINER Stelle gerufen: Die Splitter entstanden, alterten und
     * verschwanden, ohne je im Bild zu sein. Diese Prüfung vergleicht zwei
     * Bilder DESSELBEN Zustands — mit gefüllter Partikelliste und mit leerer.
     * Vor der Behebung war der Unterschied 0.
     */
    const befund = await mitWiederholung(page, async () => {
      await installiereHelfer(page);
      return page.evaluate(() => {
        const T = window.__T__;
        const renderer = T.renderer;
        const krater = { x: 700, y: 380 };

        const mit = T.ohne(['narben', 'rauch', 'trefferMarken', 'spuren'], () => {
          // Den festen Inhalt zurückschreiben: Der Renderer altert die
          // Splitter am Ende jedes Bildes, und beide Arme sollen dieselben
          // Positionen zeichnen — sonst misst der Vergleich die Alterung mit.
          T.setze(['particles'], true);
          renderer.time = 950;
          renderer.render(T.zustand, T.kontext);
          return T.ausschnitt(krater.x, krater.y, 200, 200);
        });
        const ohne = T.ohne(['narben', 'rauch', 'trefferMarken', 'spuren', 'particles'], () => {
          renderer.time = 950;
          renderer.render(T.zustand, T.kontext);
          return T.ausschnitt(krater.x, krater.y, 200, 200);
        });

        return {
          partikel: T.inhalte.particles.length,
          unterschied: T.unterschied(mit, ohne),
          flaeche: 200 * 200,
        };
      });
    });

    console.log(`DYNAMIK [Splitter] ${befund.partikel} Partikel, ${befund.unterschied} von `
      + `${befund.flaeche} Bildpunkten unterschiedlich`);
    test.info().annotations.push({
      type: 'Splitter',
      description: `${befund.partikel} Partikel → ${befund.unterschied} unterschiedliche Bildpunkte`,
    });
    expect(befund.partikel, 'der Einschlag muss Splitter erzeugen').toBeGreaterThan(0);
    expect(befund.unterschied, 'die Splitter ändern KEINEN Bildpunkt — sie werden nicht gezeichnet')
      .toBeGreaterThan(0);
  });

  test('Ein Treffer hinterlässt Ring und Blitz auf der Figur', async ({ page }) => {
    const befund = await mitWiederholung(page, async () => {
      await installiereHelfer(page);
      return page.evaluate(() => {
        const T = window.__T__;
        const renderer = T.renderer;
        const figur = T.zustand.entities.find(f => f.alive) ?? T.zustand.entities[0];
        const stelle = { x: figur.x, y: figur.y };

        /*
         * Der Treffer entsteht aus dem ZUSTAND: ein Bild mit der alten
         * Gesundheit, dann eines mit weniger. Kein Ereignis, kein Motor —
         * genau der Weg, den `Renderer#ermittleTreffer` im Spiel geht.
         */
        renderer.gefuehlZuruecksetzen?.();
        renderer.time = 700;
        renderer.render(T.zustandMit(), T.kontext);
        const vorher = T.ausschnitt(stelle.x, stelle.y, 140, 140);

        renderer.time = 701;
        renderer.render(T.zustandMit([], [70, 60]), T.kontext);
        const marken = renderer.trefferMarken.length;
        const nachher = T.ausschnitt(stelle.x, stelle.y, 140, 140);

        // GEGENPROBE: dieselbe Szene, aber ohne die Marken.
        const ohneMarken = T.ohne(['trefferMarken'], () => {
          renderer.time = 701;
          renderer.render(T.zustandMit([], [70, 60]), T.kontext);
          return T.ausschnitt(stelle.x, stelle.y, 140, 140);
        });

        return {
          marken,
          unterschiedTreffer: T.unterschied(vorher, nachher),
          unterschiedMarken: T.unterschied(nachher, ohneMarken),
          bildpunkte: 140 * 140,
        };
      });
    });

    console.log(`DYNAMIK [Treffer] ${befund.marken} Marken; Bildunterschied durch den Treffer `
      + `${befund.unterschiedTreffer}, davon durch die Marke ${befund.unterschiedMarken} `
      + `von ${befund.bildpunkte} Bildpunkten`);
    test.info().annotations.push({
      type: 'Treffer',
      description: `${befund.marken} Marken, ${befund.unterschiedMarken} unterschiedliche Bildpunkte`,
    });
    expect(befund.marken, 'ein Absinken der Gesundheit muss eine Treffermarke erzeugen')
      .toBeGreaterThan(0);
    expect(befund.unterschiedMarken, 'die Treffermarke ändert keinen Bildpunkt').toBeGreaterThan(0);
  });

  test('Die Flugspur liegt hinter dem Geschoss', async ({ page }) => {
    const befund = await mitWiederholung(page, async () => {
      await installiereHelfer(page);
      return page.evaluate(() => {
        const T = window.__T__;
        const renderer = T.renderer;
        const punkte = [...(T.inhalte.spuren.get(901) ?? [])];
        const y = 260;
        const mitte = punkte[Math.floor(punkte.length / 2)].x;
        const zustand = T.zustandMit([
          { entityId: 901, x: punkte[punkte.length - 1].x, y, fuseSeconds: 0 },
        ]);

        const mit = T.ohne(['narben', 'rauch'], () => {
          /*
           * ACHTUNG — der Grund, warum hier ausdrücklich gesetzt wird: Der
           * Renderer baut die Spurenkarte je Bild aus dem Zustand NEU
           * (`#fuehreSpuren`). Nach dem letzten Aufbau steht dort ein LEERES
           * Feld, und ein einzelner Punkt wird nicht gezeichnet (`length < 2`).
           * Ohne das Zurückschreiben wäre der Arm leer — und der Vergleich
           * hätte nichts zu vergleichen.
           */
          T.setze(['spuren'], true);
          renderer.time = 960;
          renderer.render(zustand, T.kontext);
          return T.ausschnitt(mitte, y, 260, 120);
        });
        const ohne = T.ohne(['narben', 'rauch', 'spuren'], () => {
          renderer.time = 960;
          renderer.render(zustand, T.kontext);
          return T.ausschnitt(mitte, y, 260, 120);
        });

        return {
          punkte: punkte.length,
          unterschied: T.unterschied(mit, ohne),
          bildpunkte: 260 * 120,
        };
      });
    });

    console.log(`DYNAMIK [Spur] ${befund.punkte} Spurenpunkte, ${befund.unterschied} von `
      + `${befund.bildpunkte} Bildpunkten unterschiedlich`);
    test.info().annotations.push({
      type: 'Spur',
      description: `${befund.punkte} Punkte, ${befund.unterschied} unterschiedliche Bildpunkte`,
    });
    expect(befund.punkte, 'das Geschoss muss eine Spur aufbauen').toBeGreaterThan(2);
    expect(befund.unterschied, 'die Spur ändert keinen Bildpunkt').toBeGreaterThan(0);
  });

  test('Der Kraterrand macht aus dem Loch einen Einschlag', async ({ page }) => {
    const befund = await mitWiederholung(page, async () => {
      await installiereHelfer(page);
      return page.evaluate(() => {
        const T = window.__T__;
        const renderer = T.renderer;
        const krater = { x: 780, y: 420 };

        const vorher = T.ohne(['narben', 'particles', 'rauch', 'trefferMarken', 'spuren'], () => {
          renderer.time = 600;
          renderer.render(T.zustand, T.kontext);
          return T.ausschnitt(krater.x, krater.y, 160, 160);
        });

        // Ein frischer Einschlag — dieselbe Schnittstelle wie im Spiel.
        renderer.time = 601;
        renderer.applyCrater(krater.x, krater.y, 40);

        const nachher = T.ohne(['particles', 'rauch', 'trefferMarken', 'spuren'], () => {
          renderer.time = 602;
          renderer.render(T.zustand, T.kontext);
          return T.ausschnitt(krater.x, krater.y, 160, 160);
        });

        // GEGENPROBE: dieselbe Stelle, aber der Rand wird nicht gezeichnet.
        const ohneNarbe = T.ohne(['narben', 'particles', 'rauch', 'trefferMarken', 'spuren'], () => {
          renderer.time = 602;
          renderer.render(T.zustand, T.kontext);
          return T.ausschnitt(krater.x, krater.y, 160, 160);
        });

        return {
          narben: (renderer.narben ?? []).length,
          unterschiedKrater: T.unterschied(vorher, nachher),
          unterschiedNarbe: T.unterschied(nachher, ohneNarbe),
          bildpunkte: 160 * 160,
        };
      });
    });

    console.log(`DYNAMIK [Krater] Loch+Rand ${befund.unterschiedKrater} Bildpunkte, davon der `
      + `Rand ${befund.unterschiedNarbe} von ${befund.bildpunkte} (${befund.narben} Narbe(n))`);
    test.info().annotations.push({
      type: 'Krater',
      description: `Loch ${befund.unterschiedKrater} Bildpunkte, Rand ${befund.unterschiedNarbe}`,
    });
    expect(befund.unterschiedKrater, 'der Krater ist unsichtbar').toBeGreaterThan(0);
    expect(befund.unterschiedNarbe, 'der Kraterrand wird nicht gezeichnet').toBeGreaterThan(0);
  });

  test('Der Kamera-Ruck ist messbar, gedeckelt und bei reduzierter Bewegung aus', async ({ page }) => {
    /**
     * Liest die Transformation, die der Renderer WIRKLICH setzt.
     *
     * Nicht `ruckVersatz()` nachrechnen, sondern `setTransform` abfangen: Nur so
     * ist belegt, dass der Versatz ankommt — und wie groß er tatsächlich ist.
     */
    const messen = () => page.evaluate(() => {
      const T = window.__T__;
      const renderer = T.renderer;
      const ctx = renderer.ctx;
      const original = ctx.setTransform.bind(ctx);
      let gemerkt = null;
      ctx.setTransform = (...args) => {
        if (args.length === 6) gemerkt = { e: args[4], f: args[5] };
        return original(...args);
      };

      renderer.gefuehlZuruecksetzen?.();

      // Ohne Ruck: die reine Kameratransformation.
      renderer.time = 500;
      renderer.render(T.zustand, T.kontext);
      const ohne = gemerkt ? { ...gemerkt } : null;

      // Ein großer Einschlag — genau der Aufruf der Ereignistafel.
      renderer.time = 501;
      renderer.applyCrater(900, 400, 40);

      let groesster = 0;
      const versatz = [];
      for (let bild = 0; bild < 12; bild += 1) {
        renderer.time = 502 + bild;
        renderer.render(T.zustand, T.kontext);
        if (gemerkt && ohne) {
          const dx = gemerkt.e - ohne.e;
          const dy = gemerkt.f - ohne.f;
          versatz.push([+dx.toFixed(2), +dy.toFixed(2)]);
          groesster = Math.max(groesster, Math.abs(dx), Math.abs(dy));
        }
      }
      ctx.setTransform = original;

      return { groesster: +groesster.toFixed(3), versatz, ruckAktiv: Boolean(renderer.ruck) };
    });

    const befund = await mitWiederholung(page, async () => {
      await installiereHelfer(page);
      const normal = await messen();

      // GEGENPROBE: reduzierte Bewegung — dieselbe Szene, kein Versatz.
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const erkannt = await page.evaluate(
        () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      );
      expect(erkannt, 'die Systemeinstellung muss beim Browser ankommen').toBe(true);
      const reduziert = await messen();
      return { normal, reduziert };
    });

    console.log(`DYNAMIK [Ruck] größter Bildversatz ${befund.normal.groesster} px (Grenze 5 px), `
      + `Verlauf ${JSON.stringify(befund.normal.versatz)}`);
    console.log(`DYNAMIK [Ruck/reduziert] größter Bildversatz ${befund.reduziert.groesster} px`);
    test.info().annotations.push({
      type: 'Ruck',
      description: `max ${befund.normal.groesster} px, Verlauf `
        + `${JSON.stringify(befund.normal.versatz)}; reduziert ${befund.reduziert.groesster} px`,
    });

    expect(befund.normal.groesster, 'nach einem großen Einschlag muss sich das Bild bewegen')
      .toBeGreaterThan(0);
    expect(befund.normal.groesster, 'der Ruck überschreitet die Lesbarkeitsgrenze von 5 px')
      .toBeLessThanOrEqual(5);
    expect(befund.reduziert.groesster, 'bei reduzierter Bewegung darf sich das Bild NICHT bewegen')
      .toBe(0);
  });
});

test.describe('Dynamik — der Klang', () => {
  test('Der Trefferklang kommt aus dem Zustand (echter Mischer)', async ({ page }) => {
    /*
     * Gemessen wird am ECHTEN Mischer (`SoundMixer#spieleTreffer`), nicht an
     * einer Attrappe: Der Klang zum Treffer eines GESCHOSSES entstand bis zu
     * diesem Zug gar nicht — er hing allein am Hitscan-Zweig der Ereignistafel
     * (`ereignisse.js`).
     *
     * Ob der AudioContext in dieser Umgebung entsteht, wird mitgemessen und
     * berichtet: Eine stille Umgebung darf den Test nicht in einen Fehlschluss
     * führen (der Aufruf am Mischer ist die Zusicherung, der Zähler der Beleg
     * dafür, dass auch wirklich ein Klang entstanden ist).
     */
    const befund = await mitWiederholung(page, async () => {
      const vorher = await page.evaluate(async () => {
        const spiel = window.__PA__.game;
        const bereit = await spiel.sound.starte();

        window.__AUFRUFE__ = [];
        const original = spiel.sound.spieleTreffer.bind(spiel.sound);
        spiel.sound.spieleTreffer = haerte => {
          window.__AUFRUFE__.push(haerte);
          return original(haerte);
        };

        // Eine Figur verletzen — über den Schadensweg des Motors (so bringen
        // die Haus-Tests Schaden deterministisch an), dann EINEN Schritt.
        const match = spiel.match;
        const figuren = window.__PA__.getState().entities.filter(f => f.alive);
        match.world.getSystem('damage').applyDamage(
          match.world, figuren[0].entityId, 25, figuren[1]?.entityId ?? null, {},
        );
        window.__PA__.advance(1);

        return { bereit, zaehler: spiel.sound.gezaehlt.treffer };
      });

      // Zwei Bilder: Der Renderer sieht den Zustand, `#spieleTrefferklang` holt
      // die Treffer ab.
      await page.evaluate(() => new Promise(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      }));

      const nachher = await page.evaluate(() => ({
        aufrufe: [...window.__AUFRUFE__],
        zaehler: window.__PA__.game.sound.gezaehlt.treffer,
        marken: window.__PA__.game.renderer.trefferMarken.length,
      }));
      return { vorher, nachher };
    });

    const { vorher, nachher } = befund;
    console.log(`DYNAMIK [Klang] AudioContext bereit: ${vorher.bereit}; Aufrufe `
      + `${JSON.stringify(nachher.aufrufe)}; Mischerzähler ${vorher.zaehler} → `
      + `${nachher.zaehler}; Treffermarken ${nachher.marken}`);
    test.info().annotations.push({
      type: 'Trefferklang',
      description: `AudioContext ${vorher.bereit}; ${nachher.aufrufe.length} Aufruf(e), Härte `
        + `${JSON.stringify(nachher.aufrufe)}; Zähler ${vorher.zaehler} → ${nachher.zaehler}`,
    });

    expect(nachher.aufrufe.length, 'der Treffer muss den vorhandenen TrefferkLang rufen')
      .toBeGreaterThan(0);
    for (const haerte of nachher.aufrufe) {
      expect(Number.isFinite(haerte) && haerte >= 0.5 && haerte <= 1.5,
        `Härte ${haerte} liegt außerhalb des Klangrezepts (0,5 bis 1,5)`).toBe(true);
    }
    if (vorher.bereit) {
      expect(nachher.zaehler,
        'der Mischer hat trotz freigegebenem Context keinen Klang erzeugt')
        .toBeGreaterThan(vorher.zaehler);
    }
  });

  test('Ein Treffer im selben Bild klingt NICHT zweimal', async ({ page }) => {
    /*
     * Der Klang zum Treffer entsteht an ZWEI Stellen: im Ereigniszweig (nur
     * Hitscan, `ereignisse.js`) und aus dem Zustand
     * (`main.js#spieleTrefferklang`). Der Zustandsweg schweigt, wenn der Mischer
     * im selben Bild schon einen Trefferklang erzeugt hat.
     *
     * Nachgebildet wird der Ereigniszweig durch EINEN Aufruf von
     * `spieleTreffer` — genau das tut der Hitscan-Zweig. Kommt danach kein
     * zweiter Aufruf aus dem Zustandsweg, greift die Sperre.
     *
     * GRENZE, ehrlich benannt: Die Sperre hängt am ZÄHLER des Mischers, und der
     * wächst nur mit freigegebenem AudioContext. Entsteht in dieser Umgebung
     * keiner, ist die Sperre nicht messbar — dann wird das BERICHTET und die
     * Zusicherung auf der Codeseite getragen
     * (`tests/dynamik-gefuehl.test.js`, „Der Trefferklang hängt am Zustand").
     */
    const befund = await mitWiederholung(page, async () => {
      const vorher = await page.evaluate(async () => {
        const spiel = window.__PA__.game;
        const bereit = await spiel.sound.starte();

        window.__AUFRUFE__ = [];
        const original = spiel.sound.spieleTreffer.bind(spiel.sound);
        spiel.sound.spieleTreffer = haerte => {
          window.__AUFRUFE__.push(haerte);
          return original(haerte);
        };

        const match = spiel.match;
        const figuren = window.__PA__.getState().entities.filter(f => f.alive);
        match.world.getSystem('damage').applyDamage(
          match.world, figuren[0].entityId, 25, figuren[1]?.entityId ?? null, {},
        );
        window.__PA__.advance(1);

        // Der Ereigniszweig: ein Klang, wie ihn der Hitscan-Zweig spielt.
        spiel.sound.spieleTreffer(1);
        return { bereit, aufrufe: window.__AUFRUFE__.length };
      });

      await page.evaluate(() => new Promise(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      }));

      const nachher = await page.evaluate(() => ({
        aufrufe: [...window.__AUFRUFE__],
        marken: window.__PA__.game.renderer.trefferMarken.length,
        zaehler: window.__PA__.game.sound.gezaehlt.treffer,
      }));
      return { vorher, nachher };
    });

    console.log(`DYNAMIK [Sperre] Aufrufe gesamt ${JSON.stringify(befund.nachher.aufrufe)} `
      + `(erwartet: 1 aus dem nachgebildeten Ereignisweg), Treffermarken `
      + `${befund.nachher.marken}, AudioContext bereit: ${befund.vorher.bereit}`);
    test.info().annotations.push({
      type: 'Klangsperre',
      description: `${befund.nachher.aufrufe.length} Aufruf(e) bei `
        + `${befund.nachher.marken} Treffermarken, Context ${befund.vorher.bereit}`,
    });

    expect(befund.nachher.marken, 'der Zustandsweg muss den Treffer gesehen haben')
      .toBeGreaterThan(0);
    if (befund.vorher.bereit) {
      expect(befund.nachher.aufrufe.length,
        `es wurde ${befund.nachher.aufrufe.length}× gespielt — der Treffer darf nur einmal klingen`)
        .toBeLessThanOrEqual(1);
    } else {
      console.log('[Umgebung] Kein AudioContext — die Sperre ist hier nicht messbar; '
        + 'sie wird auf der Codeseite geprüft (tests/dynamik-gefuehl.test.js).');
    }
  });
});
