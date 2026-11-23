#!/usr/bin/env node
/**
 * Syntax- und Ladetor (TODO 1.7 SYNTAX-TOR).
 *
 * Anlass: Am 2026-11-23 lagen auf `main` Konfliktmarker in Tests und ein überschriebenes Modul, dessen Exporte
 * fehlten (b383bee). Zwei Prüfungen in einem Lauf:
 *
 *  1. `node --check` über alle `.js`/`.mjs` in `src`, `scripts`, `functions`, `tests`, `tools` (reine Syntax:
 *     Konfliktmarker, abgeschnittene Dateien).
 *  2. Laden aller Module in `src/server`, `src/engine`, `src/shared` und `functions` in Node. Erst das Laden prüft die
 *     Verknüpfung: ein `import { x }`, dessen Export fehlt, scheitert hier. Die Module haben keine Nebenwirkungen
 *     beim Laden (kein Lauschen, kein Netz); der Prozess endet danach von selbst.
 *
 * Der Client (`src/client`) braucht Browser-APIs und `import.meta.glob`; seine fehlenden Exporte meldet der
 * Produktionsbau als Fehler (`MISSING_EXPORT`), der im Gate `check:bundle` läuft.
 */
import { execFile } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

const WURZEL = new URL('..', import.meta.url).pathname;
const AUSGENOMMEN = new Set(['node_modules', 'dist', '.git', 'test-results', 'playwright-report']);

function dateien(ordner) {
  const liste = [];
  const lauf = d => {
    let eintraege;
    try { eintraege = readdirSync(d); } catch { return; }
    for (const n of eintraege) {
      if (AUSGENOMMEN.has(n)) continue;
      const p = join(d, n);
      if (statSync(p).isDirectory()) lauf(p);
      else if (/\.m?js$/.test(n)) liste.push(p);
    }
  };
  lauf(join(WURZEL, ordner));
  return liste;
}

const fehler = [];

const syntax = ['src', 'scripts', 'functions', 'tests', 'tools'].flatMap(dateien);
const pruefe = datei => new Promise(fertig => {
  execFile(process.execPath, ['--check', datei], (err, _out, stderr) => {
    if (err) fehler.push(`Syntax ${relative(WURZEL, datei)}: ${String(stderr || err.message).trim().split('\n').slice(0, 4).join(' | ')}`);
    fertig();
  });
});
const warteschlange = [...syntax];
await Promise.all(Array.from({ length: Math.max(2, availableParallelism()) }, async () => {
  while (warteschlange.length) await pruefe(warteschlange.shift());
}));

const laden = ['src/server', 'src/engine', 'src/shared', 'functions'].flatMap(dateien);
for (const datei of laden) {
  try {
    await import(pathToFileURL(datei).href);
  } catch (e) {
    fehler.push(`Laden ${relative(WURZEL, datei)}: ${String(e?.message ?? e).split('\n')[0]}`);
  }
}

if (fehler.length) {
  for (const f of fehler) console.error(`FEHLER ${f}`);
  console.error(`check:syntax: ${fehler.length} Fehler (${syntax.length} Dateien geprüft, ${laden.length} Module geladen)`);
  process.exit(1);
}
console.log(`check:syntax: ok (${syntax.length} Dateien geprüft, ${laden.length} Module geladen)`);
