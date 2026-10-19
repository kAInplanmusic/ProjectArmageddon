import test from 'node:test';
import assert from 'node:assert/strict';

import { CHARACTERS } from '../src/shared/config/factions.js';
import { FIGUR_TYPEN, TYP_JE_CHARAKTER, PARAMETER, typFuer, parameterFuer } from '../src/client/figurTypen.js';

test('Jede der 81 Figuren hat genau einen bekannten Typ, und die Tabelle hat keine Waisen', () => {
  assert.equal(CHARACTERS.length, 81);
  for (const c of CHARACTERS) {
    assert.ok(FIGUR_TYPEN.includes(TYP_JE_CHARAKTER[c.id]), `${c.id} ohne Typ`);
  }
  assert.equal(Object.keys(TYP_JE_CHARAKTER).length, 81);
  const ids = new Set(CHARACTERS.map(c => c.id));
  for (const id of Object.keys(TYP_JE_CHARAKTER)) assert.ok(ids.has(id), `${id} unbekannt`);
});

test('Jeder Typ kommt vor und hat einen vollständigen, endlichen Parametersatz', () => {
  const benutzt = new Set(Object.values(TYP_JE_CHARAKTER));
  const felder = Object.keys(PARAMETER.humanoid);
  for (const typ of FIGUR_TYPEN) {
    assert.ok(benutzt.has(typ), `Typ ${typ} ohne Figur`);
    assert.deepEqual(Object.keys(PARAMETER[typ]), felder, `Felder von ${typ}`);
    for (const [k, v] of Object.entries(PARAMETER[typ])) {
      assert.ok(k === 'tod' || (typeof v === 'number' && Number.isFinite(v) && v >= 0), `${typ}.${k}`);
    }
  }
  assert.equal(typFuer('unbekannt'), 'humanoid');
  assert.equal(parameterFuer('recon-luchs-01'), PARAMETER.tier);
});

test('Typen unterscheiden sich wie gedacht: Schweber wippen nicht, Fahrzeuge vibrieren, Wesen pulsieren', () => {
  assert.equal(PARAMETER.schweber.laufWippen, 0);
  assert.ok(PARAMETER.schweber.schwebHoehe > 0);
  assert.ok(PARAMETER.fahrzeug.vibAmp > 0 && PARAMETER.humanoid.vibAmp === 0);
  assert.ok(PARAMETER.wesen.pulsAmp > 0);
  assert.ok(PARAMETER.schwarm.wuselAmp > 0);
  assert.equal(PARAMETER.fahrzeug.tod, 'explodieren');
});
