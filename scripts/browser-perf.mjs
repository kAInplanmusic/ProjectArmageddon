#!/usr/bin/env node
/**
 * Browser-Profiling: Rendering-Kosten im echten Chrome.
 *
 * Warum dieses Skript zusätzlich zu `npm run perf` existiert
 * ----------------------------------------------------------
 * `npm run perf` misst die SIMULATION ohne Rendering (`MatchController` direkt
 * in Node). Das war die offene Lücke in MASTERDOTO.md: Die teuersten Arbeiten
 * des Spiels laufen nicht in der Simulation, sondern in der Anzeige —
 * Terrain-Backen (900 000 Pixel je Karte), Wasser-Feld, Partikel, Kulisse.
 * Keine davon erscheint in einer Headless-Messung.
 *
 * Gemessen wird am ECHTEN Frame-Takt des Browsers (`requestAnimationFrame`),
 * nicht an einer nachgebauten Schleife: Nur dort zählen Layout, Compositing und
 * der Hauptthread, der sich Anzeige und Spielcode teilt.
 *
 * Aufruf:
 *   node scripts/browser-perf.mjs [--frames=N] [--json] [--seed=N]
 *                                 [--preset=NAME] [--teams=N] [--players=N]
 *
 * Was die Zahlen bedeuten
 * -----------------------
 *  - `frameMs` ist die Zeit zwischen zwei Frames. Bei 60 Hz sind das 16,7 ms.
 *  - `p95`/`p99` sind die wichtigen Werte, nicht der Mittelwert: Ein einzelner
 *    Ausreißer über dem Budget ist das, was der Spieler als Ruckler sieht.
 *  - `longFrames` zählt Frames über dem Budget.
 *  - `terrainBakeMs` ist eigens ausgewiesen, weil das Terrain-Backen ein
 *    einzelner, sehr teurer Vorgang ist (er fällt beim Kartenaufbau an, nicht
 *    je Frame).
 *
 * Das Skript ist ein MESSWERKZEUG, kein Gate: Es schlägt nicht fehl, wenn ein
 * Wert über dem Budget liegt — es berichtet. Ein Gate wäre hier willkürlich,
 * weil die Zahlen von der Maschine abhängen (CI hat keine GPU).
 */
import { chromium } from '@playwright/test';

function parseArgs(argv) {
  const args = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const [key, value] = token.slice(2).split('=');
    args[key] = value === undefined ? true : value;
  }
  return args;
}

function num(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const args = parseArgs(process.argv.slice(2));
const frames = num(args.frames, 300);
const seed = num(args.seed, 20260916);
const preset = args.preset ?? 'hills';
const teams = num(args.teams, 2);
const players = num(args.players, 2);
const asJson = Boolean(args.json);

const frameBudgetMs = 1000 / 60;

/** Perzentil aus einer sortierten Liste. */
function percentile(sorted, fraction) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * fraction));
  return sorted[index];
}

function stats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, value) => acc + value, 0);
  return {
    count: sorted.length,
    mean: sorted.length > 0 ? sum / sorted.length : 0,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    max: sorted[sorted.length - 1] ?? 0,
    overBudget: sorted.filter(value => value > frameBudgetMs).length,
  };
}

/** Startet Chrome. Fällt auf das gebündelte Chromium zurück, wenn nötig. */
async function launchBrowser() {
  const varianten = [
    { channel: 'chrome' },
    { channel: 'chrome', args: ['--enable-unsafe-swiftshader'] },
    {},
  ];
  let letzterFehler = null;
  for (const optionen of varianten) {
    try {
      return await chromium.launch(optionen);
    } catch (error) {
      letzterFehler = error;
    }
  }
  throw letzterFehler ?? new Error('Kein Browser startbar');
}

async function main() {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const seitenfehler = [];
  page.on('pageerror', error => seitenfehler.push(error.message));

  await page.goto(process.env.PA_URL ?? 'http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });

  // Ein Match über das Menü starten — derselbe Weg wie beim Spieler.
  await page.selectOption('#cfg-preset', preset).catch(() => {});
  await page.fill('#cfg-teams', String(teams)).catch(() => {});
  await page.fill('#cfg-players', String(players)).catch(() => {});
  await page.fill('#cfg-seed', String(seed)).catch(() => {});
  await page.click('#start-button');
  await page.waitForFunction(() => Boolean(window.__PA__?.game?.match), null, { timeout: 20_000 });
  // Der Kartenaufbau läuft im ersten Frame; ohne diese Pause würde die Messung
  // das Backen mitzählen und jeden p95-Wert verfälschen.
  await page.waitForTimeout(500);

  /*
   * Das Terrain-Backen wird EINZELN gemessen: Es ist der teuerste Vorgang und
   * fällt nur beim Kartenaufbau an. Als eigener Wert ist erkennbar, ob eine
   * Änderung daran etwas verschoben hat — im Frame-Durchschnitt ginge es unter.
   */
  const terrainBake = await page.evaluate(async () => {
    const renderer = window.__PA__.game.renderer;
    const quelle = renderer.terrainSource;
    if (!quelle) return null;
    const messungen = [];
    for (let i = 0; i < 5; i++) {
      const start = performance.now();
      renderer.buildTerrainLayer(quelle.bitmap, quelle.width, quelle.height);
      messungen.push(performance.now() - start);
    }
    return { messungen, width: quelle.width, height: quelle.height, path: renderer.gpuTerrainPath };
  });

  // Vor dem Messen ein paar Bilder laufen lassen, damit Vite fertig lädt.
  await page.waitForTimeout(300);

  /*
   * Frame-Zeiten im Browser sammeln.
   *
   * `requestAnimationFrame` liefert den Zeitstempel des Frame-Starts. Die
   * Differenz zweier Startzeitpunkte ist die Frame-Dauer — sie enthält auch die
   * Zeit, die der Browser für Layout und Compositing braucht, und ist deshalb
   * aussagekräftiger als eine Messung im Spielcode.
   */
  const frameZeiten = await page.evaluate(async (anzahl) => {
    const zeiten = [];
    let vorher = null;
    return new Promise(resolve => {
      function messen(jetzt) {
        if (vorher !== null) zeiten.push(jetzt - vorher);
        vorher = jetzt;
        if (zeiten.length >= anzahl) return resolve(zeiten);
        requestAnimationFrame(messen);
      }
      requestAnimationFrame(messen);
    });
  }, frames);

  /*
   * Zweite Messung MIT Schüssen: Rendering-Effekte (Explosionen, Partikel,
   * Krater) entstehen erst beim Schießen. Eine Messung ohne Schüsse würde den
   * teuersten Fall übersehen.
   */
  const schussFrames = await page.evaluate(async (anzahl) => {
    const game = window.__PA__.game;
    const zeiten = [];
    let vorher = null;
    let schuesse = 0;
    return new Promise(resolve => {
      function messen(jetzt) {
        if (vorher !== null) zeiten.push(jetzt - vorher);
        vorher = jetzt;
        // Alle 20 Frames feuern, damit Effekte entstehen.
        if (zeiten.length % 20 === 0 && game.match?.status === 'playing') {
          const id = game.match.activePlayerId;
          if (id !== null) {
            game.match.fire(id, Math.PI / 3 + (schuesse % 5) * 0.1, 60);
            schuesse += 1;
          }
        }
        if (zeiten.length >= anzahl) return resolve({ zeiten, schuesse });
        requestAnimationFrame(messen);
      }
      requestAnimationFrame(messen);
    });
  }, Math.min(frames, 180));

  const browserInfo = await page.evaluate(() => ({
    ua: navigator.userAgent,
    hardwareConcurrency: navigator.hardwareConcurrency ?? null,
    // WebGPU-Verfügbarkeit mitberichten: Sie erklärt, welcher Bodenpfad lief.
    hasWebGpu: 'gpu' in navigator,
  }));

  const terrainPath = await page.evaluate(() => window.__PA__.terrainPath());

  await browser.close();

  const ruhig = stats(frameZeiten);
  const mitSchuessen = stats(schussFrames.zeiten);
  const bakeZeiten = terrainBake?.messungen ?? [];

  const bericht = {
    browser: browserInfo,
    preset,
    seed,
    frames: ruhig.count,
    budgetMs: frameBudgetMs,
    idle: ruhig,
    shooting: mitSchuessen,
    shots: schussFrames.schuesse,
    terrainBakeMs: {
      mean: bakeZeiten.length ? bakeZeiten.reduce((a, b) => a + b, 0) / bakeZeiten.length : 0,
      max: bakeZeiten.length ? Math.max(...bakeZeiten) : 0,
      runs: bakeZeiten.length,
      width: terrainBake?.width ?? null,
      height: terrainBake?.height ?? null,
      path: terrainBake?.path ?? terrainPath?.path ?? null,
    },
    webgpu: terrainPath,
    pageErrors: seitenfehler,
  };

  if (asJson) {
    console.log(JSON.stringify(bericht, null, 2));
    return;
  }

  const ms = value => `${value.toFixed(2)} ms`;
  console.log('Browser-Profiling — Rendering im echten Frame-Takt');
  console.log(`  Browser        : ${browserInfo.ua.slice(0, 70)}`);
  console.log(`  Kerne          : ${browserInfo.hardwareConcurrency ?? '?'}`);
  console.log(`  Karte          : ${preset}, Seed ${seed}`);
  console.log(`  Budget         : ${ms(frameBudgetMs)}/Frame (60 Hz)`);
  console.log('');
  console.log(`  Ohne Schüsse (${ruhig.count} Frames)`);
  console.log(`    Mittel       : ${ms(ruhig.mean)}`);
  console.log(`    p50 / p95/p99: ${ms(ruhig.p50)} / ${ms(ruhig.p95)} / ${ms(ruhig.p99)}`);
  console.log(`    Maximum      : ${ms(ruhig.max)}`);
  console.log(`    Über Budget  : ${ruhig.overBudget} (${((ruhig.overBudget / Math.max(1, ruhig.count)) * 100).toFixed(1)} %)`);
  console.log('');
  console.log(`  Mit Schüssen (${mitSchuessen.count} Frames, ${schussFrames.schuesse} Schüsse)`);
  console.log(`    Mittel       : ${ms(mitSchuessen.mean)}`);
  console.log(`    p50 / p95/p99: ${ms(mitSchuessen.p50)} / ${ms(mitSchuessen.p95)} / ${ms(mitSchuessen.p99)}`);
  console.log(`    Maximum      : ${ms(mitSchuessen.max)}`);
  console.log(`    Über Budget  : ${mitSchuessen.overBudget} (${((mitSchuessen.overBudget / Math.max(1, mitSchuessen.count)) * 100).toFixed(1)} %)`);
  console.log('');
  console.log(`  Terrain-Backen : ${ms(bericht.terrainBakeMs.mean)} (max ${ms(bericht.terrainBakeMs.max)}, ${bericht.terrainBakeMs.runs} Läufe)`);
  console.log(`    Fläche       : ${bericht.terrainBakeMs.width}×${bericht.terrainBakeMs.height} = ${(bericht.terrainBakeMs.width * bericht.terrainBakeMs.height / 1e6).toFixed(2)} Mio Pixel`);
  console.log(`    Rechenweg    : ${bericht.terrainBakeMs.path} (${terrainPath?.reason ?? '—'})`);
  console.log(`  WebGPU         : ${browserInfo.hasWebGpu ? 'Schnittstelle vorhanden' : 'nicht vorhanden'} — Gerät: ${terrainPath?.device ? 'ja' : 'nein'}`);
  if (seitenfehler.length > 0) {
    console.log('');
    console.log(`  SEITENFEHLER (${seitenfehler.length}):`);
    for (const fehler of seitenfehler.slice(0, 5)) console.log(`    ${fehler.slice(0, 120)}`);
  }
}

main().catch(error => {
  console.error('Profiling fehlgeschlagen:', error.message);
  process.exit(1);
});
