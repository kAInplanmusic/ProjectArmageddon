/**
 * Zerstörungstabelle (Hilfe, `shared/zerstoerungsTabelle.js`): Die Zahlen kommen aus der Config.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zerstoerungsTabelle, biomStoffe, urteil, GRUPPEN_LABEL, MEHR_AB, WENIGER_BIS } from '../src/shared/zerstoerungsTabelle.js';
import { STOFFE, WIRKGRUPPEN, stoffWirkung, stoffByKey } from '../src/shared/config/stoffe.js';

test('Eine Zeile je Stoff, eine Spalte je Wirkgruppe, Faktoren gleich denen der Engine', () => {
  const tabelle = zerstoerungsTabelle();
  assert.equal(tabelle.length, STOFFE.length);
  assert.deepEqual(Object.keys(GRUPPEN_LABEL), [...WIRKGRUPPEN]);
  for (const zeile of tabelle) {
    const stoff = stoffByKey(zeile.key);
    assert.equal(zeile.spalten.length, WIRKGRUPPEN.length);
    for (const s of zeile.spalten) {
      const w = stoffWirkung(stoff.id, s.gruppe === 'hitze' ? 'brand' : 'sprengung', s.gruppe, true);
      assert.equal(s.faktor, Math.round(w.radius * 100) / 100, `${zeile.key}/${s.gruppe}`);
    }
  }
});

test('Urteile: unzerstörbar hält, Schnee geht bei Hitze mehr kaputt, Obsidian weniger als Erde', () => {
  const nach = Object.fromEntries(zerstoerungsTabelle().map(z => [z.key, z]));
  const spalte = (stoff, gruppe) => nach[stoff].spalten.find(s => s.gruppe === gruppe);
  for (const g of WIRKGRUPPEN) assert.equal(spalte('metall', g).urteil, 'haelt');
  assert.equal(spalte('schnee', 'hitze').urteil, 'mehr');
  assert.equal(spalte('holz', 'hitze').reaktion, 'brennt');
  assert.equal(spalte('eis', 'hitze').reaktion, 'schmilzt');
  assert.ok(spalte('obsidian', 'wucht').faktor < spalte('erde', 'wucht').faktor);
  assert.equal(urteil(MEHR_AB), 'mehr');
  assert.equal(urteil(WENIGER_BIS - 0.01), 'weniger');
  assert.equal(urteil(1), 'normal');
});

test('Jedes Sonderbiom nennt seine Stoffe', () => {
  const { sonder, alt } = biomStoffe();
  assert.ok(sonder.length >= 13 && alt.length >= 10);
  for (const b of sonder) {
    assert.ok(b.stoffe.length >= 2, b.id);
    for (const k of b.stoffe) assert.ok(stoffByKey(k), `${b.id}: ${k}`);
  }
});
