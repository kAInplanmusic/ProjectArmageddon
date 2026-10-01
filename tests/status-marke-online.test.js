/**
 * Wächter für B-5: Status-Marken online.
 *
 * ## Der Befund
 * `☠ `/`↑` bleiben online fest. Ursache: das Mapping in `onlineViewState`
 * gab nur Figuren mit `shield>0` oder `frozenTurns>0` einen Status-Eintrag.
 * Fehlt der Eintrag, bleibt die alte Marke aus dem letzten Takt bestehen
 * (oder ist leer, je nach Initialisierung) — die Marke „klebt".
 *
 * ## Die Regel
 * Jede Figur bekommt JEDEZ Takt einen Status-Eintrag, auch wenn alle Felder
 * leer sind. Das Protokoll überträgt online nur shield/frozen; DOTS/Boost
 * bleiben leer — aber sie werden nicht „vergessen".
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HIER, '..');

test('onlineViewState erstellt für jede Figur einen Status-Eintrag', () => {
  const main = fs.readFileSync(path.join(ROOT, 'src', 'client', 'main.js'), 'utf8');

  const block = main.match(/const statuses = \{\};[\s\S]{0,600}const entities = \(this\.network/);
  assert.ok(block, 'das Status-Mapping im onlineViewState wurde nicht gefunden');

  // Jede Figur bekommt einen Eintrag — kein if (shield>0 || frozen>0)
  assert.ok(!/if\s*\(\s*\(entity\.shield\s*\?\?\s*0\)\s*>0/.test(block[0]),
    'das Mapping filtert noch nach shield/frozen — alte Marken können kleben bleiben');

  // Die vier Felder müssen gesetzt werden
  assert.ok(/shield/.test(block[0]), 'shield muss gesetzt werden');
  assert.ok(/frozenTurns/.test(block[0]), 'frozenTurns muss gesetzt werden');
  assert.ok(/dots/.test(block[0]), 'dots muss gesetzt werden');
  assert.ok(/boostMultiplier/.test(block[0]), 'boostMultiplier muss gesetzt werden');
});
