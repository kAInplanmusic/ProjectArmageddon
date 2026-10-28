import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ZEITEN, WETTER_WAHL, normalisiereWahl, wetterMit, STIMMUNG_SCHICHTEN, zeichneStimmung } from '../src/client/stimmung.js';

const basis = { regen: 0.3, schnee: 0, gewitter: false, nebel: 0, lichter: true };

test('Wahl: Unbekanntes fällt auf automatisch', () => {
  assert.equal(normalisiereWahl('nacht', ZEITEN), 'nacht');
  assert.equal(normalisiereWahl('quatsch', ZEITEN), 'auto');
  assert.equal(normalisiereWahl(undefined, WETTER_WAHL), 'auto');
  assert.equal(normalisiereWahl('toString', WETTER_WAHL), 'auto');
});

test('wetterMit: automatisch behält die Kulisse, Herbstgold bringt Laub', () => {
  assert.equal(wetterMit(basis).regen, 0.3);
  assert.equal(wetterMit(basis, 'auto', 'herbst').laub > 0, true);
  assert.equal(wetterMit(basis, 'auto', 'tag').laub, 0);
});

test('wetterMit: Wahl überschreibt die Kulisse', () => {
  assert.equal(wetterMit(basis, 'klar').regen, 0);
  assert.equal(wetterMit(basis, 'sonne').sonne, 1);
  const sturm = wetterMit(basis, 'sturm');
  assert.equal(sturm.gewitter, true);
  assert.equal(sturm.wind, 1);
  assert.equal(wetterMit(basis, 'schnee').schnee > 0, true);
  assert.equal(wetterMit(basis, 'nebel').nebel > 0, true);
  assert.equal(wetterMit(basis, 'laub').laub > 0, true);
});

test('Stimmung: jede Zeit hat Schichten (außer automatisch)', () => {
  for (const k of Object.keys(ZEITEN)) assert.equal(k === 'auto' ? !STIMMUNG_SCHICHTEN[k] : STIMMUNG_SCHICHTEN[k].length > 0, true, k);
});

test('zeichneStimmung läuft für alle Kombinationen ohne Fehler', () => {
  const grad = { addColorStop() {} };
  const ctx = new Proxy({}, {
    get: (o, k) => (k === 'canvas' ? { width: 100, height: 60 } : k.startsWith('create') ? () => grad : o[k] ?? (() => {})),
    set: (o, k, v) => { o[k] = v; return true; },
  });
  for (const zeit of Object.keys(ZEITEN)) {
    for (const wetter of Object.keys(WETTER_WAHL)) {
      for (const still of [false, true]) {
        const r = { ctx, width: 100, height: 60, time: 120, reducedMotion: still, stimmung: { zeit, wetter } };
        zeichneStimmung(r, wetterMit(basis, wetter, zeit), 1);
      }
    }
  }
});
