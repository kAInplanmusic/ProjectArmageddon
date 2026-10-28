import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STOFFE, stoffByKey, WIRKGRUPPEN } from '../src/shared/config/stoffe.js';
import {
  materialMatrix, matrixAlsMarkdown, bodenEigenschaften, haftungVon, wirkfaktor, HAFTUNG_STUFEN, NACHGIEBIGKEIT_STUFEN,
} from '../src/shared/materialMatrix.js';

test('Jeder Stoff hat drei gültige Eigenschaften und alle Wirkgruppen', () => {
  const m = materialMatrix();
  assert.equal(m.length, STOFFE.length);
  for (const z of m) {
    assert.ok(HAFTUNG_STUFEN.includes(z.haftung), z.key);
    assert.ok(NACHGIEBIGKEIT_STUFEN.includes(z.nachgiebigkeit), z.key);
    for (const g of WIRKGRUPPEN) assert.ok(Number.isFinite(z.faktoren[g]) && z.faktoren[g] >= 0, `${z.key}/${g}`);
  }
});

test('Bekannte Stoffe ordnen sich sinnvoll ein', () => {
  assert.equal(bodenEigenschaften(stoffByKey('eis')).haftung, 'rutschig');
  assert.equal(bodenEigenschaften(stoffByKey('erde')).haftung, 'normal');
  assert.equal(bodenEigenschaften(stoffByKey('sand')).haftung, 'griffig');
  assert.equal(bodenEigenschaften(stoffByKey('industriemagma')).nachgiebigkeit, 'traegt nicht');
  assert.equal(haftungVon(undefined), 'normal');
});

test('Matrix: Hitze frisst Holz und schmilzt Eis, Metall hält alles', () => {
  assert.ok(wirkfaktor(stoffByKey('holz'), 'hitze') > wirkfaktor(stoffByKey('holz'), 'wucht'));
  assert.ok(wirkfaktor(stoffByKey('eis'), 'hitze') > wirkfaktor(stoffByKey('eis'), 'kaelte'));
  for (const g of WIRKGRUPPEN) assert.equal(wirkfaktor(stoffByKey('metall'), g), 0);
});

test('docs/terrain-matrix.md enthält die aktuelle Tabelle', () => {
  const doku = readFileSync(new URL('../docs/terrain-matrix.md', import.meta.url), 'utf8');
  assert.ok(doku.includes(matrixAlsMarkdown()), 'Tabelle veraltet: `node scripts/terrain-matrix-schreiben.mjs` ausführen');
});
