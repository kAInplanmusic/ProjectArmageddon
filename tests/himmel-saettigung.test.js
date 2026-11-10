/**
 * LOOK-2 (Rest, 2026-11-10): Kein generativer Himmel zeichnet eine Stufe über Sättigung 0,45.
 *
 * Vorher (gemessen an den gezeichneten Stufen nach `naechtlich`): 14 von 22 Himmeln mit
 * mindestens einer Stufe über 0,45. Entscheidung des Auftraggebers: Deckel bei 0,45.
 * Messweise wie die Kulissenmessung in `kulisseUndWasser.js`: HSV (max − min) / max.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { SKY_KINDS } from '../src/shared/config/scenery.js';
import { deckleSaettigung, himmelStufe, HIMMEL_SAETTIGUNG_DECKEL } from '../src/client/sceneryPainter.js';

const sattheit = (c) => {
  const max = Math.max(...c);
  const min = Math.min(...c);
  return max <= 0 ? 0 : (max - min) / max;
};
const farbton = ([r, g, b]) => {
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return null;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};

test('Der Deckel steht bei 0,45', () => {
  assert.equal(HIMMEL_SAETTIGUNG_DECKEL, 0.45);
});

test('Jede gezeichnete Stufe jedes Himmels liegt bei höchstens 0,45', () => {
  assert.ok(SKY_KINDS.length >= 22, `nur ${SKY_KINDS.length} Himmel — Testannahme veraltet`);
  let gedeckelt = 0;
  for (const himmel of SKY_KINDS) {
    const n = himmel.colors.length;
    let wirkt = false;
    himmel.colors.forEach((farbe, i) => {
      const stufe = himmelStufe(farbe, i / Math.max(1, n - 1));
      assert.ok(sattheit(stufe) <= HIMMEL_SAETTIGUNG_DECKEL + 1e-9,
        `${himmel.id} Stufe ${i}: Sättigung ${sattheit(stufe).toFixed(3)}`);
      if (sattheit(stufe) > HIMMEL_SAETTIGUNG_DECKEL - 1e-9) wirkt = true;
    });
    if (wirkt) gedeckelt += 1;
  }
  // Gegenprobe: Der Deckel greift wirklich (vorher 14 von 22 darüber).
  assert.ok(gedeckelt >= 14, `nur ${gedeckelt} Himmel erreichen den Deckel — greift er überhaupt?`);
});

test('Der Deckel erhält Farbton und Helligkeit und lässt ruhige Farben unverändert', () => {
  const proben = [[30, 120, 230], [200, 40, 20], [90, 220, 140], [140, 60, 200], [250, 250, 10]];
  for (const c of proben) {
    const d = deckleSaettigung(c);
    assert.ok(Math.abs(sattheit(d) - 0.45) < 1e-9, `${c}: Sättigung ${sattheit(d)}`);
    assert.equal(Math.max(...d), Math.max(...c), `${c}: Helligkeit (max-Kanal) geändert`);
    assert.ok(Math.abs(farbton(d) - farbton(c)) < 1e-6, `${c}: Farbton ${farbton(c)} -> ${farbton(d)}`);
  }
  for (const c of [[120, 120, 120], [100, 110, 120], [0, 0, 0], [200, 180, 160]]) {
    assert.deepEqual(deckleSaettigung(c), c, `${c} liegt unter dem Deckel und muss bleiben`);
  }
});
