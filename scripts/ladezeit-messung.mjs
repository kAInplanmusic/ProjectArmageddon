#!/usr/bin/env node
/**
 * Ladezeit-Messung: ungenutztes JavaScript beim Menüaufbau (BUILD-1).
 *
 * Warum dieses Werkzeug
 * ---------------------
 * Lighthouse meldet „ungenutztes JavaScript“ als eine Zahl. Für die Frage, WAS
 * aus dem Startpfad heraus in einen eigenen Chunk gehört, reicht die Zahl nicht:
 * Man braucht die Quellmodule. Dieses Werkzeug misst die Ausführung im echten
 * Chromium (CDP `Profiler.startPreciseCoverage`) und ordnet die nie
 * ausgeführten Bytes über die Sourcemap den Dateien unter `src/` zu.
 *
 * Ablauf
 * ------
 *   1. Produktionsbau mit Sourcemap in einen Zwischenordner (nicht `dist/`, damit
 *      versehentlich ausgelieferte Maps gar nicht erst entstehen):
 *        node scripts/ladezeit-messung.mjs --bauen
 *      Ohne `--bauen` wird ein vorhandener Bau mit `--ordner=...` gelesen; die
 *      Map muss neben dem Chunk liegen.
 *   2. Das Werkzeug startet selbst einen kleinen statischen Server auf einem
 *      freien Port — `npm run preview` ist nicht nötig.
 *   3. Ausgegeben werden FCP/LCP, die ungenutzten Bytes insgesamt und die
 *      größten Quellmodule. `--json` liefert dieselben Werte maschinenlesbar.
 *
 * Das ist ein MESSWERKZEUG, kein Gate: Es schlägt nicht fehl, wenn viel Code
 * ungenutzt ist. Ein Gate auf eine Momentaufnahme des Menüs wäre willkürlich,
 * weil der Anteil von den Startbedingungen abhängt.
 *
 * Aufruf:
 *   node scripts/ladezeit-messung.mjs --bauen
 *   node scripts/ladezeit-messung.mjs --ordner=dist --chunk=assets/index-XXXX.js
 *   node scripts/ladezeit-messung.mjs --bauen --laeufe=5 --json
 */
import { spawnSync } from 'node:child_process';
import { createReadStream, existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ZWISCHEN = path.join(WURZEL, 'node_modules/.cache/ladezeit-messung');

const args = new Map();
for (const token of process.argv.slice(2)) {
  if (!token.startsWith('--')) continue;
  const [key, wert] = token.slice(2).split('=');
  args.set(key, wert ?? true);
}
const bauen = args.has('bauen');
const alsJson = args.has('json');
const laeufe = Number(args.get('laeufe') ?? 3);
const wartezeit = Number(args.get('wartezeit') ?? 2500);

/* ---------------------------------------------------------------- Sourcemap */

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function vlq(text) {
  const werte = [];
  let wert = 0;
  let shift = 0;
  for (const zeichen of text) {
    const ziffer = B64.indexOf(zeichen);
    const weiter = ziffer & 32;
    wert += (ziffer & 31) << shift;
    if (weiter) { shift += 5; continue; }
    werte.push(wert & 1 ? -(wert >> 1) : wert >> 1);
    wert = 0;
    shift = 0;
  }
  return werte;
}

/** Liefert je generierter Zeile die Segmente `{ spalte, quelle }` (fortlaufend dekodiert). */
function leseMappings(map) {
  const jeZeile = [];
  let quelle = 0;
  // Quellzeile/-spalte werden nur mitgeführt, weil die VLQ-Deltas darauf aufbauen.
  let _quellZeile = 0;
  let _quellSpalte = 0;
  for (const zeile of map.mappings.split(';')) {
    const segmente = [];
    let spalte = 0;
    for (const teil of zeile.split(',')) {
      if (!teil) continue;
      const werte = vlq(teil);
      spalte += werte[0];
      if (werte.length >= 4) {
        quelle += werte[1];
        _quellZeile += werte[2];
        _quellSpalte += werte[3];
        segmente.push({ spalte, quelle });
      }
    }
    jeZeile.push(segmente);
  }
  return jeZeile;
}

const kurz = datei => datei.split('/').slice(-3).join('/');

/** Ordnet die nie ausgeführten Bytes der Quelle zu, die an dieser Stelle gemappt ist. */
function teileUngenutztesAuf(text, jeZeile, map, gedeckt) {
  const jeQuelle = new Map();
  const zeilen = text.split('\n');
  let gesamt = 0;
  let versatz = 0;
  for (let i = 0; i < zeilen.length; i += 1) {
    const laenge = zeilen[i].length;
    let k = 0;
    while (k < laenge) {
      if (gedeckt[versatz + k]) { k += 1; continue; }
      let ende = k;
      while (ende < laenge && !gedeckt[versatz + ende]) ende += 1;
      gesamt += ende - k;
      const segmente = jeZeile[i] ?? [];
      let index = -1;
      for (let s = 0; s < segmente.length; s += 1) {
        if (segmente[s].spalte <= k) index = s;
        else break;
      }
      const name = index >= 0 ? map.sources[segmente[index].quelle] : '(ohne Zuordnung)';
      jeQuelle.set(name, (jeQuelle.get(name) ?? 0) + (ende - k));
      k = ende;
    }
    versatz += laenge + 1;
  }
  return { gesamt, jeQuelle };
}

/* ------------------------------------------------------------------- Messung */

function baue() {
  rmSync(ZWISCHEN, { recursive: true, force: true });
  const lauf = spawnSync('node', [path.join(WURZEL, 'node_modules/vite/bin/vite.js'), 'build',
    '--outDir', ZWISCHEN, '--emptyOutDir', '--sourcemap', '--logLevel', 'error'], {
    cwd: WURZEL, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8',
  });
  if (lauf.status !== 0) throw new Error(`Bau fehlgeschlagen:\n${lauf.stdout}${lauf.stderr}`);
  return ZWISCHEN;
}

function findeHauptChunk(ordner) {
  const html = readFileSync(path.join(ordner, 'index.html'), 'utf8');
  const treffer = html.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/);
  if (!treffer) throw new Error('kein Modul-Skript in index.html');
  const datei = path.join(ordner, treffer[1].replace(/^\.?\//, ''));
  return { datei, map: `${datei}.map` };
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.avif': 'image/avif',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
};

/** Kleiner statischer Server für den Messbau (kein Vite-Preview nötig). */
function starteServer(ordner) {
  const server = createServer((anfrage, antwort) => {
    const pfad = decodeURIComponent(new URL(anfrage.url, 'http://127.0.0.1').pathname);
    const datei = path.join(ordner, pfad === '/' ? 'index.html' : pfad.replace(/^\//, ''));
    if (!datei.startsWith(ordner) || !existsSync(datei) || !statSync(datei).isFile()) {
      antwort.writeHead(404).end('nicht gefunden');
      return;
    }
    antwort.writeHead(200, { 'content-type': MIME[path.extname(datei)] ?? 'application/octet-stream' });
    createReadStream(datei).pipe(antwort);
  });
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}/` }));
  });
}

async function messeLauf(ordner, ziel) {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.__LCP__ = 0;
    new PerformanceObserver(liste => {
      for (const eintrag of liste.getEntries()) window.__LCP__ = eintrag.startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.startPreciseCoverage', { callCount: false, detailed: true });
  await page.goto(ziel, { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.__PA__), null, { timeout: 60000 });
  await page.waitForTimeout(wartezeit);
  const werte = await page.evaluate(() => {
    const navigation = performance.getEntriesByType('navigation')[0];
    const paint = performance.getEntriesByType('paint');
    return {
      fcp: paint.find(e => e.name === 'first-contentful-paint')?.startTime ?? null,
      lcp: window.__LCP__ || null,
      domContentLoaded: navigation?.domContentLoadedEventEnd ?? null,
      load: navigation?.loadEventEnd ?? null,
    };
  });
  const { result } = await cdp.send('Profiler.takePreciseCoverage');
  await cdp.send('Profiler.stopPreciseCoverage');
  await context.close();
  await browser.close();
  return { ...werte, coverage: result };
}

function ordnerFuerBau() {
  if (bauen) return baue();
  const eigener = args.get('ordner');
  if (eigener) return path.resolve(WURZEL, eigener);
  throw new Error('Ohne --bauen bitte --ordner=<dist-Ordner mit Sourcemap> angeben');
}

const ordner = ordnerFuerBau();
const { datei, map: mapDatei } = args.get('chunk')
  ? { datei: path.resolve(WURZEL, args.get('chunk')), map: path.resolve(WURZEL, args.get('map')) }
  : findeHauptChunk(ordner);
if (!existsSync(mapDatei)) throw new Error(`Sourcemap fehlt: ${mapDatei}`);
const text = readFileSync(datei, 'utf8');
const map = JSON.parse(readFileSync(mapDatei, 'utf8'));
const jeZeile = leseMappings(map);

const { server, url: ziel } = await starteServer(ordner);
const berichte = [];
for (let lauf = 1; lauf <= laeufe; lauf += 1) {
  const messung = await messeLauf(ordner, ziel);
  const eintrag = messung.coverage.find(c => path.basename(c.url) === path.basename(datei));
  if (!eintrag) throw new Error(`Haupt-Chunk nicht in der Coverage: ${datei}`);
  /* CDP liefert verschachtelte Bereiche: erst die großen, dann die kleinen
   * (tieferen) einzeichnen — ein Kindbereich mit count 0 hebt den Elternbereich auf. */
  const gedeckt = new Uint8Array(text.length);
  const bereiche = [];
  for (const funktion of eintrag.functions) for (const bereich of funktion.ranges) bereiche.push(bereich);
  bereiche.sort((a, b) => (b.endOffset - b.startOffset) - (a.endOffset - a.startOffset));
  for (const bereich of bereiche) gedeckt.fill(bereich.count > 0 ? 1 : 0, bereich.startOffset, bereich.endOffset);
  const { gesamt, jeQuelle } = teileUngenutztesAuf(text, jeZeile, map, gedeckt);
  berichte.push({
    lauf,
    haupt: path.basename(datei),
    hauptBytes: text.length,
    ungenutztBytes: gesamt,
    ungenutztProzent: +(100 * gesamt / text.length).toFixed(1),
    fcp: messung.fcp && +messung.fcp.toFixed(0),
    lcp: messung.lcp && +messung.lcp.toFixed(0),
    domContentLoaded: messung.domContentLoaded && +messung.domContentLoaded.toFixed(0),
    load: messung.load && +messung.load.toFixed(0),
    jeQuelle,
  });
}

if (alsJson) {
  const ohneInterna = berichte.map(({ jeQuelle, ...rest }) => ({
    ...rest,
    top: [...jeQuelle.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)
      .map(([quelle, bytes]) => ({ quelle: kurz(quelle), bytes })),
  }));
  console.log(JSON.stringify(ohneInterna, null, 2));
} else {
  const mittel = werte => werte.reduce((s, w) => s + w, 0) / Math.max(1, werte.length);
  console.log(`Haupt-Chunk: ${path.basename(datei)} (${(text.length / 1024).toFixed(1)} KiB roh), ${berichte.length} Läufe`);
  console.log(`ungenutzt beim Menü: ${(mittel(berichte.map(b => b.ungenutztBytes)) / 1024).toFixed(1)} KiB`
    + ` von ${(text.length / 1024).toFixed(1)} KiB (${berichte[0].ungenutztProzent} %)`);
  console.log(`FCP ${mittel(berichte.map(b => b.fcp)).toFixed(0)} ms, LCP ${mittel(berichte.map(b => b.lcp)).toFixed(0)} ms`
    + ` (Mittel über ${berichte.length}; lokale Maschine, ohne Drosselung)`);
  console.log('');
  const erste = berichte[0].jeQuelle;
  console.log('größte ungenutzte Quellmodule:');
  for (const [quelle, bytes] of [...erste.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
    console.log(`  ${String(bytes).padStart(7)} B  ${kurz(quelle)}`);
  }
}
await new Promise(resolve => server.close(resolve));
if (bauen) rmSync(ZWISCHEN, { recursive: true, force: true });
