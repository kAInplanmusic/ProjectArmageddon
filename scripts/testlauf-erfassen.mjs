#!/usr/bin/env node
/**
 * Erfasst eine Testzählung in `docs/testlauf.json` (OPT-5) und schreibt die
 * erzeugten Blöcke in README und MASTERDOTO neu.
 *
 *   node scripts/testlauf-erfassen.mjs --unit               # führt `npm test` aus
 *   node scripts/testlauf-erfassen.mjs --unit-log lauf.log  # liest die Ausgabe eines Laufs
 *   node scripts/testlauf-erfassen.mjs --e2e                # zählt über `playwright test --list`
 *
 * Es wird nur eingetragen, was die Ausgabe nachweisbar hergibt; fehlt die
 * Zusammenfassung von `node --test`, bricht das Werkzeug ab. Ohne Lauf keine Zahl.
 * `--commit <hash>`: Stand, auf dem der Lauf lief (Vorgabe: HEAD), z. B. bei einem Lauf im sauberen Worktree.
 * `--zaehlwurzel <ordner>`: Checkout, in dem der Lauf lief und dessen Dateien gezählt werden (Vorgabe: dieses Repo).
 *   `--e2e-log <datei>`: Ausgabe von `playwright test --list` statt eines eigenen Aufrufs.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseNodeTestAusgabe, parsePlaywrightListe, zaehleDateien } from './lib/testzahlen.mjs';

const args = process.argv.slice(2);
const opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const root = resolve(join(dirname(fileURLToPath(import.meta.url)), '..'));
const datei = join(root, 'docs', 'testlauf.json');

const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim();
const zaehlwurzel = resolve(opt('--zaehlwurzel') ?? root);
const commit = opt('--commit') ?? git('rev-parse', '--short', 'HEAD');
const heute = new Date().toISOString().slice(0, 10);

let t;
try { t = JSON.parse(readFileSync(datei, 'utf8')); } catch { t = {}; }

if (args.includes('--unit') || opt('--unit-log')) {
  let text;
  if (opt('--unit-log')) text = readFileSync(opt('--unit-log'), 'utf8');
  else {
    const r = spawnSync('npm', ['test'], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 30, stdio: ['ignore', 'pipe', 'inherit'] });
    text = r.stdout ?? '';
  }
  const z = parseNodeTestAusgabe(text);
  if (!z) {
    console.error('Keine Zusammenfassung („ℹ tests …“) in der Ausgabe: Lauf unvollständig, nichts eingetragen.');
    process.exit(2);
  }
  t.unit = { ...z, dateien: zaehleDateien(zaehlwurzel, 'tests', '.test.js'), datum: heute, commit };
} else if (args.includes('--e2e') || opt('--e2e-log')) {
  let text;
  if (opt('--e2e-log')) text = readFileSync(opt('--e2e-log'), 'utf8');
  else {
    const r = spawnSync('npx', ['playwright', 'test', '--list'], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 });
    text = `${r.stdout}\n${r.stderr}`;
  }
  const z = parsePlaywrightListe(text);
  if (!z) {
    console.error('Keine Zeile „Total: N tests in M files“: nichts eingetragen.');
    process.exit(2);
  }
  t.e2e = { ...z, datum: heute, commit };
} else {
  console.error('Aufruf: --unit | --unit-log <datei> | --e2e | --e2e-log <datei>   (optional --commit <hash> --zaehlwurzel <ordner>)');
  process.exit(2);
}

writeFileSync(datei, `${JSON.stringify(t, null, 2)}\n`);
console.log(`docs/testlauf.json geschrieben: ${JSON.stringify(t)}`);
const r = spawnSync('node', [join(root, 'scripts', 'check-docs.mjs'), '--schreiben'], { cwd: root, stdio: 'inherit' });
process.exit(r.status ?? 1);
