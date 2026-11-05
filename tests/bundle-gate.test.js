/**
 * Bundle-Größen-Gate (BLD-1): Messweg und Grenzvergleich von `scripts/bundle-gate.mjs`.
 *
 * Der echte Bau läuft in `npm run checks` (`check:bundle`); hier wird ein kleiner
 * Schein-Bau in einem Zwischenordner gemessen, damit die Rechenwege ohne Vite prüfbar sind.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { miss, pruefe } from '../scripts/bundle-gate.mjs';

const WURZEL = path.resolve(import.meta.dirname, '..');

function scheinBau() {
  const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'pa-bundle-'));
  fs.mkdirSync(path.join(ordner, 'assets'));
  fs.writeFileSync(path.join(ordner, 'index.html'),
    '<html><head><script type="module" crossorigin src="./assets/index-a.js"></script>'
    + '<link rel="stylesheet" crossorigin href="./assets/index-b.css"></head></html>');
  fs.writeFileSync(path.join(ordner, 'assets/index-a.js'),
    'import{x as y}from"./teil-c.js";const z=()=>import("./spaet-d.js");console.log(y,z);');
  fs.writeFileSync(path.join(ordner, 'assets/teil-c.js'), 'import"./teil-e.js";export const x=1;');
  fs.writeFileSync(path.join(ordner, 'assets/teil-e.js'), 'globalThis.e=1;');
  fs.writeFileSync(path.join(ordner, 'assets/spaet-d.js'), 'export default "spät, nicht beim Start";'.repeat(50));
  fs.writeFileSync(path.join(ordner, 'assets/index-b.css'), 'body{margin:0}');
  return ordner;
}

test('Start zählt Einstieg, statische Importe (rekursiv) und CSS, nicht import()', () => {
  const ordner = scheinBau();
  try {
    const w = miss(ordner);
    assert.equal(w.haupt.datei, path.join('assets', 'index-a.js'));
    const haupt = fs.readFileSync(path.join(ordner, 'assets/index-a.js'));
    assert.equal(w.haupt.roh, haupt.length);
    assert.equal(w.haupt.gzip, gzipSync(haupt, { level: 9 }).length);
    // index.html + index-a.js + teil-c.js + teil-e.js + index-b.css
    assert.equal(w.start.dateien, 5);
    const startRoh = ['index.html', 'assets/index-a.js', 'assets/teil-c.js', 'assets/teil-e.js', 'assets/index-b.css']
      .reduce((s, d) => s + fs.statSync(path.join(ordner, d)).size, 0);
    assert.equal(w.start.roh, startRoh);
    assert.equal(w.dist.dateien, 6);
    assert.equal(w.sourcemaps, 0);
  } finally {
    fs.rmSync(ordner, { recursive: true, force: true });
  }
});

test('Grenzvergleich meldet jede überschrittene Größe, auch eine Sourcemap', () => {
  const werte = { haupt: { roh: 10, gzip: 5 }, start: { roh: 20, gzip: 8 }, dist: { roh: 100 }, sourcemaps: 1 };
  assert.deepEqual(pruefe(werte, { haupt: { roh: 10, gzip: 5 }, start: { roh: 20, gzip: 8 }, dist: { roh: 100 }, sourcemaps: 1 }), []);
  const v = pruefe(werte, { haupt: { roh: 9, gzip: 5 }, start: { roh: 20, gzip: 7 }, dist: { roh: 100 }, sourcemaps: 0 });
  assert.deepEqual(v.map(z => z.split(':')[0]), ['haupt.roh', 'start.gzip', 'sourcemaps']);
});

test('Grenzdatei: alle Größen gesetzt, Sourcemaps 0; Gate steht in checks und CI-Kommentar', () => {
  const g = JSON.parse(fs.readFileSync(path.join(WURZEL, 'scripts/bundle-grenzen.json'), 'utf8'));
  for (const wert of [g.haupt.roh, g.haupt.gzip, g.start.roh, g.start.gzip, g.dist.roh]) {
    assert.ok(Number.isInteger(wert) && wert > 0, `Grenze fehlt: ${wert}`);
  }
  assert.equal(g.sourcemaps, 0);
  const paket = JSON.parse(fs.readFileSync(path.join(WURZEL, 'package.json'), 'utf8'));
  assert.match(paket.scripts['check:bundle'], /bundle-gate\.mjs --bauen/);
  assert.match(fs.readFileSync(path.join(WURZEL, 'scripts/checks.mjs'), 'utf8'), /skript: 'check:bundle'/);
  // Sourcemaps bleiben im Bau aus (BUILD-1).
  assert.match(fs.readFileSync(path.join(WURZEL, 'vite.config.mjs'), 'utf8'), /sourcemap:\s*false/);
});
