import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HIER, '..');

/*
 * Zeilenbudget von `match.js`, 2026-10-29 von 3200 auf 2790 GESENKT (nur Verschärfung).
 *
 * Grund: `match.js` wurde rein strukturell zerlegt (3152 -> 2638 Zeilen):
 * Kisten und Abwerfen -> `kistenWurf.js`, Zielwirkungen und Bodenmaterial ->
 * `zieleffekte.js`, Oberfläche und Wasserstand -> `wasserOberflaeche.js`
 * (siehe `docs/zerlegung-match.md`). Die neue Grenze lässt rund 150 Zeilen Luft;
 * die alte hätte erlaubt, die ausgelagerten 500 Zeilen unbemerkt zurückzuholen.
 */
test('match.js hat ≤ 2790 Zeilen (Zeilenbudget)', () => {
  const match = fs.readFileSync(path.join(ROOT, 'src', 'engine', 'match.js'), 'utf8');
  const zeilen = match.split('\n').length;
  assert.ok(zeilen <= 2790, `match.js hat ${zeilen} Zeilen — Limit 2790`);
});