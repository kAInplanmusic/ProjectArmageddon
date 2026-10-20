import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STOFFE, STOFF_FEIN, WIRKGRUPPEN, stoffWirkung } from '../src/shared/config/stoffe.js';
import {
  ZERSTOERUNG_HANG, ZERSTOERUNG_FEIN, ZERSTOERUNG_STANDARD, normalisiereZerstoerung,
} from '../src/shared/config/zerstoerung.js';

/** Die Tabelle Stoff × Wirkgruppe × Charakter, wie sie Fassung 6 lieferte (ohne `fein`). */
function tabelle(fein) {
  const t = {};
  for (const s of STOFFE) {
    for (const g of WIRKGRUPPEN) {
      for (const c of ['sprengung', 'splitter', 'brand', 'durchschlag', 'beben']) {
        t[`${s.key}/${g}/${c}`] = JSON.stringify(stoffWirkung(s.id, c, g, fein));
      }
    }
  }
  return t;
}

test('Fassung 7 ist Standard, Fassung 6 bleibt gültig', () => {
  assert.equal(ZERSTOERUNG_STANDARD, ZERSTOERUNG_FEIN);
  assert.equal(normalisiereZerstoerung(ZERSTOERUNG_HANG), ZERSTOERUNG_HANG);
  assert.equal(normalisiereZerstoerung(ZERSTOERUNG_FEIN), ZERSTOERUNG_FEIN);
});

test('ohne fein bleibt die Tabelle der Fassung 6 unverändert', () => {
  const alt = tabelle(false);
  assert.equal(stoffWirkung(6, 'sprengung', 'wucht').radius, 0.4 * 0.4);
  assert.deepEqual(tabelle(undefined), alt);
});

test('fein ändert nur die benannten Zellen', () => {
  const alt = tabelle(false);
  const neu = tabelle(true);
  const geaendert = new Set(Object.keys(alt).filter(k => alt[k] !== neu[k]).map(k => k.split('/')[0]));
  assert.deepEqual([...geaendert].sort(), Object.keys(STOFF_FEIN).sort());
  assert.ok(Math.abs(stoffWirkung(6, 'sprengung', 'wucht', true).radius - 0.22) < 1e-9);
  assert.ok(stoffWirkung(2, 'sprengung', 'nass', true).radius < stoffWirkung(2, 'sprengung', 'nass', false).radius);
  assert.ok(stoffWirkung(4, 'sprengung', 'aetz', true).radius > stoffWirkung(4, 'sprengung', 'aetz', false).radius);
});

test('fein macht nichts Unzerstörbares zerstörbar und nichts Zerstörbares unzerstörbar', () => {
  for (const s of STOFFE) {
    const a = stoffWirkung(s.id, 'sprengung', 'wucht', false);
    const b = stoffWirkung(s.id, 'sprengung', 'wucht', true);
    assert.equal(a.unzerstoerbar, b.unzerstoerbar, s.key);
  }
});
