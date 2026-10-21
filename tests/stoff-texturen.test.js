/**
 * Material-Texturen der Stoffe: Zuordnung, Dateien, Wirkung auf die Färbung (reine Client-Optik).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildTerrainForSeed } from '../src/client/terrainPreview.js';
import { faerbeGelaende } from '../src/client/gelaendeStil.js';
import {
  STOFF_TEXTUR, TEXTUR_NAMEN, TEXTUR_GROESSE, registriereStoffTextur, leereStoffTexturen,
} from '../src/client/stoffTexturen.js';
import { STOFFE } from '../src/shared/config/stoffe.js';

const ORDNER = resolve(import.meta.dirname, '../src/client/assets/stoff-texturen');

test('Jeder zugeordnete Stoff existiert, jede Textur hat ihre kleine Datei', () => {
  const keys = new Set(STOFFE.map(s => s.key));
  for (const k of Object.keys(STOFF_TEXTUR)) assert.ok(keys.has(k), `Stoff ${k} unbekannt`);
  for (const n of TEXTUR_NAMEN) {
    const pfad = join(ORDNER, `${n}.jpg`);
    assert.ok(existsSync(pfad), `${n}.jpg fehlt`);
    assert.ok(statSync(pfad).size < 150_000, `${n}.jpg zu groß (Ladezeit)`);
  }
});

function faerbe(mitTextur) {
  leereStoffTexturen();
  if (mitTextur) {
    for (const n of TEXTUR_NAMEN) {
      const px = new Uint8ClampedArray(TEXTUR_GROESSE * TEXTUR_GROESSE * 4);
      for (let i = 0; i < px.length; i += 4) { const v = 70 + ((i >> 2) * 7919) % 120; px[i] = v; px[i + 1] = v; px[i + 2] = v; px[i + 3] = 255; }
      registriereStoffTextur(n, px);
    }
  }
  const k = buildTerrainForSeed(77, 'hills', 'landscape', 'autonom', { gelaende: 3, biom: 'dschungel' });
  const d = new Uint8ClampedArray(k.width * k.height * 4);
  for (let i = 0; i < k.bitmap.length; i += 1) if (k.bitmap[i]) d[i * 4 + 3] = 255;
  faerbeGelaende(d, k.bitmap, k.width, k.height, { surface: [96, 138, 92], deep: [38, 54, 46] }, 5, k.stoffkarte);
  leereStoffTexturen();
  return { d, k };
}

test('Texturen ändern nur Farben, nie die Maske; ohne Texturen bleibt das Bild wie gehabt', () => {
  const ohne = faerbe(false);
  const ohne2 = faerbe(false);
  const mit = faerbe(true);
  assert.ok(ohne.k.stoffkarte, 'Testkarte hat eine Stoffkarte');
  assert.deepEqual(ohne.d, ohne2.d, 'deterministisch');
  let anders = 0;
  for (let i = 0; i < ohne.d.length; i += 4) {
    assert.equal(mit.d[i + 3], ohne.d[i + 3], 'Deckkraft (Maske) unverändert');
    if (mit.d[i] !== ohne.d[i]) anders += 1;
  }
  assert.ok(anders > 1000, 'Texturen wirken sichtbar');
  assert.deepEqual(mit.k.bitmap, ohne.k.bitmap);
});
