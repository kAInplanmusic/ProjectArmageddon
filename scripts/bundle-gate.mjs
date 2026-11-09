#!/usr/bin/env node
/**
 * Bundle-Größen-Gate (BLD-1 / BUILD-1).
 *
 * Misst den Produktionsbau und schlägt fehl, sobald eine Größe ihre Grenze aus
 * `scripts/bundle-grenzen.json` überschreitet:
 *
 *  - `haupt`  Haupt-Bundle (das Einstiegs-Skript aus `dist/index.html`), roh und gzip.
 *  - `start`  alles, was der Browser beim Start ohne Zutun holt: `index.html`, das
 *             Einstiegs-Skript samt seiner STATISCHEN Importe (rekursiv) und die
 *             Stylesheets aus `index.html`. Bilder, Klänge und Schriften zählen nicht:
 *             Welche davon der Start lädt, entscheidet der Code zur Laufzeit (dafür die
 *             Lighthouse-Messung in `docs/ladezeit.md`).
 *  - `dist`   Summe aller Dateien im Bau (roh), damit z. B. ein versehentlich
 *             wieder eingeschaltetes Sourcemap oder ein PNG statt WebP auffällt.
 *  - `sourcemaps` Anzahl `*.map` im Bau; Grenze 0 (Auslieferung ohne Sourcemaps).
 *  - `sourcemapVerweise` Anzahl JS/CSS-Dateien mit `sourceMappingURL`; Grenze 0
 *             (ein Verweis ohne Map erzeugt eine 404 und falsche DevTools-Angaben).
 *
 * gzip mit Stufe 9, wie Vite es in seiner Bauausgabe anzeigt.
 *
 * Aufruf:
 *   node scripts/bundle-gate.mjs            misst `dist/` (vorher `npm run build`)
 *   node scripts/bundle-gate.mjs --bauen    baut selbst in ein Zwischenverzeichnis
 *                                           und misst dort (so in `npm run checks`)
 *   node scripts/bundle-gate.mjs --json     Messwerte als JSON (für Doku/Vergleiche)
 *
 * Grenzen ändern: nur mit Begründung im Commit; nach unten jederzeit.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync, rmSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GRENZEN_DATEI = path.join(WURZEL, 'scripts/bundle-grenzen.json');

const args = process.argv.slice(2);
const bauen = args.includes('--bauen');
const alsJson = args.includes('--json');

/** Gzip-Größe einer Datei (Stufe 9). */
const gz = puffer => gzipSync(puffer, { level: 9 }).length;

function alleDateien(ordner) {
  const ergebnis = [];
  for (const eintrag of readdirSync(ordner, { withFileTypes: true })) {
    const voll = path.join(ordner, eintrag.name);
    if (eintrag.isDirectory()) ergebnis.push(...alleDateien(voll));
    else ergebnis.push(voll);
  }
  return ergebnis;
}

/** Statische Importe eines gebauten Chunks (`import … from "./x.js"`, `import "./x.js"`), ohne `import()`. */
function statischeImporte(code) {
  const treffer = new Set();
  for (const m of code.matchAll(/(?:^|[;}\s])import\s*(?:[\w${},*\s]+?\s*from\s*)?["'`](\.{1,2}\/[^"'`]+\.js)["'`]/g)) {
    treffer.add(m[1]);
  }
  for (const m of code.matchAll(/(?:^|[;}\s])export\s*(?:\*|\{[^}]*\})\s*from\s*["'`](\.{1,2}\/[^"'`]+\.js)["'`]/g)) {
    treffer.add(m[1]);
  }
  return [...treffer];
}

export function miss(distOrdner) {
  const indexPfad = path.join(distOrdner, 'index.html');
  if (!existsSync(indexPfad)) throw new Error(`${indexPfad} fehlt: erst \`npm run build\` (oder --bauen)`);
  const html = readFileSync(indexPfad, 'utf8');
  const einstiege = [...html.matchAll(/<script[^>]+type="module"[^>]+src="([^"]+)"/g)].map(m => m[1]);
  if (einstiege.length !== 1) throw new Error(`erwartet genau ein Modul-Skript in index.html, gefunden ${einstiege.length}`);
  const styles = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map(m => m[1]);
  const preloads = [...html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g)].map(m => m[1]);

  const aufloesen = rel => path.join(distOrdner, rel.replace(/^\.?\//, ''));
  const hauptPfad = aufloesen(einstiege[0]);
  const haupt = readFileSync(hauptPfad);

  // Start-Skripte: Einstieg + statische Importe (rekursiv) + modulepreload-Links.
  const skripte = new Set();
  const offen = [hauptPfad, ...preloads.map(aufloesen)];
  while (offen.length) {
    const datei = offen.pop();
    if (skripte.has(datei)) continue;
    skripte.add(datei);
    for (const rel of statischeImporte(readFileSync(datei, 'utf8'))) offen.push(path.resolve(path.dirname(datei), rel));
  }
  const startDateien = [indexPfad, ...skripte, ...styles.map(aufloesen)];
  let startRoh = 0;
  let startGzip = 0;
  for (const datei of startDateien) {
    const inhalt = readFileSync(datei);
    startRoh += inhalt.length;
    startGzip += gz(inhalt);
  }

  const dateien = alleDateien(distOrdner);
  return {
    haupt: { datei: path.relative(distOrdner, hauptPfad), roh: haupt.length, gzip: gz(haupt) },
    start: { dateien: startDateien.length, roh: startRoh, gzip: startGzip },
    dist: { dateien: dateien.length, roh: dateien.reduce((s, d) => s + statSync(d).size, 0) },
    sourcemaps: dateien.filter(d => d.endsWith('.map')).length,
    // Ein Verweis ohne Datei ist genauso falsch wie eine ausgelieferte Map: Der Browser
    // fragt dann eine 404 an, und DevTools bietet Quellcode an, den es nicht gibt.
    sourcemapVerweise: dateien.filter(d => /\.(js|css)$/.test(d)
      && readFileSync(d, 'utf8').includes('sourceMappingURL')).length,
  };
}

/** Vergleicht Messwerte mit den Grenzen; liefert die Liste der Verstöße. */
export function pruefe(werte, grenzen) {
  const verstoesse = [];
  const vergleich = (name, ist, max) => {
    if (typeof max !== 'number') return;
    if (ist > max) verstoesse.push(`${name}: ${ist} > Grenze ${max}`);
  };
  vergleich('haupt.roh', werte.haupt.roh, grenzen.haupt?.roh);
  vergleich('haupt.gzip', werte.haupt.gzip, grenzen.haupt?.gzip);
  vergleich('start.roh', werte.start.roh, grenzen.start?.roh);
  vergleich('start.gzip', werte.start.gzip, grenzen.start?.gzip);
  vergleich('dist.roh', werte.dist.roh, grenzen.dist?.roh);
  vergleich('sourcemaps', werte.sourcemaps, grenzen.sourcemaps);
  vergleich('sourcemapVerweise', werte.sourcemapVerweise, grenzen.sourcemapVerweise);
  return verstoesse;
}

const kb = n => `${(n / 1024).toFixed(1)} KiB`;
const mb = n => `${(n / 1024 / 1024).toFixed(2)} MiB`;

function main() {
  let distOrdner = path.join(WURZEL, 'dist');
  if (bauen) {
    distOrdner = path.join(WURZEL, 'node_modules/.cache/bundle-gate');
    rmSync(distOrdner, { recursive: true, force: true });
    const lauf = spawnSync('npx', ['vite', 'build', '--outDir', distOrdner, '--emptyOutDir', '--logLevel', 'error'], {
      cwd: WURZEL, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8',
    });
    if (lauf.status !== 0) {
      process.stderr.write(`${lauf.stdout}${lauf.stderr}\nBau fehlgeschlagen\n`);
      process.exit(1);
    }
  }
  const werte = miss(distOrdner);
  const grenzen = JSON.parse(readFileSync(GRENZEN_DATEI, 'utf8'));
  const verstoesse = pruefe(werte, grenzen);
  if (bauen) rmSync(distOrdner, { recursive: true, force: true });

  if (alsJson) {
    console.log(JSON.stringify({ werte, grenzen, verstoesse }, null, 2));
  } else {
    console.log(`Haupt-Bundle ${werte.haupt.datei}: ${kb(werte.haupt.roh)} roh / ${kb(werte.haupt.gzip)} gzip`
      + ` (Grenze ${kb(grenzen.haupt.roh)} / ${kb(grenzen.haupt.gzip)})`);
    console.log(`Start (${werte.start.dateien} Dateien: HTML, JS, CSS): ${kb(werte.start.roh)} roh / ${kb(werte.start.gzip)} gzip`
      + ` (Grenze ${kb(grenzen.start.roh)} / ${kb(grenzen.start.gzip)})`);
    console.log(`dist gesamt (${werte.dist.dateien} Dateien): ${mb(werte.dist.roh)} (Grenze ${mb(grenzen.dist.roh)})`);
    console.log(`Sourcemaps: ${werte.sourcemaps} (Grenze ${grenzen.sourcemaps}),`
      + ` sourceMappingURL-Verweise: ${werte.sourcemapVerweise} (Grenze ${grenzen.sourcemapVerweise})`);
    for (const v of verstoesse) console.error(`ÜBER DER GRENZE: ${v}`);
  }
  process.exit(verstoesse.length > 0 ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
