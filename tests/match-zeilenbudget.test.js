import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HIER, '..');

test('match.js hat ≤ 3200 Zeilen (Zeilenbudget)', () => {
  const match = fs.readFileSync(path.join(ROOT, 'src', 'engine', 'match.js'), 'utf8');
  const zeilen = match.split('\n').length;
  assert.ok(zeilen <= 3200, `match.js hat ${zeilen} Zeilen — Limit 3200`);
});