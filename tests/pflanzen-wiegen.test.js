import test from 'node:test';
import assert from 'node:assert/strict';
import { pflanzenWiegen } from '../src/client/pflanzen.js';

test('Wiegen: klein und beschränkt, ohne Zufall (gleiche Eingabe, gleicher Wert)', () => {
  let max = 0;
  for (let t = 0; t < 60; t += 0.1) {
    for (let x = 0; x < 2560; x += 37) {
      const s = pflanzenWiegen(t, x, 0);
      assert.equal(s, pflanzenWiegen(t, x, 0));
      max = Math.max(max, Math.abs(s));
    }
  }
  assert.ok(max > 0.05 && max <= 0.08 + 1e-9, `Höchstwert ohne Wind ${max}`);
});

test('Wiegen: Wind legt die Pflanzen in seine Richtung, ab dem Sättigungswert nicht stärker', () => {
  const mittel = (wind) => { let s = 0; let n = 0; for (let t = 0; t < 120; t += 0.05) { s += pflanzenWiegen(t, 500, wind); n += 1; } return s / n; };
  assert.ok(Math.abs(mittel(0)) < 0.002, 'ohne Wind kein Dauerzug');
  assert.ok(mittel(0.05) < -0.04 && mittel(-0.05) > 0.04, 'Vorzeichen folgt dem Wind');
  assert.ok(Math.abs(mittel(0.5) - mittel(0.05)) < 1e-9, 'Sättigung');
  assert.ok(Math.abs(pflanzenWiegen(3, 100, 5)) <= 0.13, 'Schranke ±0,13 auch bei Sturm');
});

test('Wiegen: unbrauchbarer Wind (kein Zahlenwert) zählt als Windstille', () => {
  assert.equal(pflanzenWiegen(2, 300, undefined), pflanzenWiegen(2, 300, 0));
  assert.equal(pflanzenWiegen(2, 300, 'x'), pflanzenWiegen(2, 300, 0));
});
