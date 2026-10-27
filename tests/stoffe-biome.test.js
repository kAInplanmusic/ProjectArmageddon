import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { STOFFE } from '../src/shared/config/stoffe.js';
import teil1 from '../src/shared/config/stoffe-biome/teil1.js';
import teil2 from '../src/shared/config/stoffe-biome/teil2.js';
import teil3 from '../src/shared/config/stoffe-biome/teil3.js';

const teile = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../docs/biome/materialien-teile.json', import.meta.url)), 'utf8'));
const HAERTEN = ['weich', 'normal', 'hart', 'sehr_hart', 'unzerstoerbar'];
const MUSTER = ['koernig', 'schichten', 'facetten', 'platten', 'fasern', 'poroes'];
const KONTUREN = ['dunkel', 'hell', 'keine'];
const BRUECHE = ['splitter', 'platten', 'scherben', 'rieseln', 'faser', 'schmelzen', 'ganz'];
const GRUPPEN = ['wucht', 'hitze', 'kaelte', 'aetz', 'strom', 'nass'];
const FELDER = ['key', 'label', 'farbe', 'muster', 'glanz', 'textur', 'kontur', 'haerte', 'radius', 'tiefe', 'bruechig', 'brennbar', 'schmelzbar', 'leitfaehig', 'anfaellig', 'bruch', 'reibung', 'bremst', 'traegt', 'versinkt'];
const KATALOG = new Map(STOFFE.map((s) => [s.key, s]));
const TEXTUREN = new Set(['stoff-texturen-neu', 'stoff-texturen'].flatMap((o) => {
  const p = fileURLToPath(new URL(`../src/client/assets/${o}/`, import.meta.url));
  return fs.existsSync(p) ? fs.readdirSync(p).map((f) => f.replace(/\.[^.]+$/, '')) : [];
}));
const zahl = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

function pruefe(e) {
  const name = e.label ?? e.key;
  assert.deepEqual(Object.keys(e).sort(), [...FELDER].sort(), `${name}: Felder`);
  assert.match(e.key, /^[a-z]+(_[a-z]+)*$/, `${name}: key`);
  assert.ok(Array.isArray(e.farbe) && e.farbe.length === 3 && e.farbe.every((c) => Number.isInteger(c) && c >= 0 && c <= 255), `${name}: farbe`);
  assert.ok(MUSTER.includes(e.muster), `${name}: muster`);
  assert.ok(zahl(e.glanz, 0, 1), `${name}: glanz`);
  assert.ok(e.textur === null || TEXTUREN.has(e.textur), `${name}: textur ${e.textur}`);
  assert.ok(KONTUREN.includes(e.kontur), `${name}: kontur`);
  assert.ok(HAERTEN.includes(e.haerte), `${name}: haerte`);
  if (e.haerte === 'unzerstoerbar') assert.ok(e.radius === 0 && e.tiefe === 0, `${name}: unzerstoerbar braucht radius/tiefe 0`);
  else {
    assert.ok(zahl(e.radius, 0.3, 1.6), `${name}: radius`);
    assert.ok(zahl(e.tiefe, 0.3, 1.4), `${name}: tiefe`);
  }
  assert.ok(Number.isInteger(e.bruechig) && e.bruechig >= 0 && e.bruechig <= 4, `${name}: bruechig`);
  for (const f of ['brennbar', 'schmelzbar', 'leitfaehig', 'traegt', 'versinkt']) assert.equal(typeof e[f], 'boolean', `${name}: ${f}`);
  for (const [g, v] of Object.entries(e.anfaellig)) {
    assert.ok(GRUPPEN.includes(g), `${name}: anfaellig.${g}`);
    assert.ok(zahl(v, 0.5, 1.8), `${name}: anfaellig.${g}=${v}`);
  }
  assert.ok(BRUECHE.includes(e.bruch), `${name}: bruch`);
  assert.ok(zahl(e.reibung, 0.1, 1.6), `${name}: reibung`);
  assert.ok(zahl(e.bremst, 0, 0.8), `${name}: bremst`);
  const k = KATALOG.get(e.key);
  if (k) {
    for (const f of ['haerte', 'radius', 'tiefe', 'bruechig', 'brennbar', 'schmelzbar', 'anfaellig', 'farbe', 'muster']) {
      assert.deepEqual(e[f], k[f], `${name}: ${f} weicht vom Katalogstoff ${k.key} ab`);
    }
  }
}

for (const [teil, daten] of [['teil1', teil1], ['teil2', teil2], ['teil3', teil3]]) {
  test(`Materialwerte ${teil}: genau die Materialien des Arbeitspakets, alle Felder in der Skala`, () => {
    assert.deepEqual(daten.map((e) => e.label).sort(), [...teile[teil]].sort(), 'Labels weichen vom Arbeitspaket ab');
    for (const e of daten) pruefe(e);
  });
}

test('Materialwerte: Schlüssel über alle Teile eindeutig', () => {
  const keys = [...teil1, ...teil2, ...teil3].map((e) => e.key);
  assert.equal(new Set(keys).size, keys.length, 'doppelter key');
});
