import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HIER, '..');

test('fire() meldet und loggt bei fehlender Verbindung', () => {
  const main = fs.readFileSync(path.join(ROOT, 'src', 'client', 'main.js'), 'utf8');
  // Der online-Zweig muss bei !isConnected nicht nur zurückgeben, sondern loggen
  const block = main.match(/if \(this\.mode === 'online'\) \{[\s\S]{0,800}return \{ ok: false, errors: \['Nicht verbunden'\] \};/);
  assert.ok(block, 'online-Zweig für feuer ohne Verbindung nicht gefunden');
  assert.ok(/hud\.log\(['"]Nicht verbunden/.test(block[0]), 'hud.log fehlt bei fehlender Verbindung');
});
