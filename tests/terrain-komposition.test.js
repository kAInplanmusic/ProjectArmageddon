import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/shared/prng.js';
import { erzeugeKompositionsKarte } from '../src/shared/terrainKomposition.js';

const B = 1280;
const H = 720;
const karte = (seed) => erzeugeKompositionsKarte({ rng: createRng(seed), width: B, height: H });
const summe = (bitmap) => bitmap.reduce((a, v) => a + v, 0);

test('Komposition: gleicher Seed, gleiche Karte', () => {
  const a = karte(101);
  const b = karte(101);
  assert.deepEqual(a.bitmap, b.bitmap);
  assert.equal(a.wasserY, b.wasserY);
});

test('Komposition: verschiedene Seeds ergeben verschiedene Karten', () => {
  assert.notDeepEqual(karte(101).bitmap, karte(202).bitmap);
});

test('Komposition: Landanteil und Bauteile liegen über 40 Seeds im erwarteten Rahmen', () => {
  for (let seed = 1; seed <= 40; seed += 1) {
    const k = karte(seed * 7919);
    const anteil = summe(k.bitmap) / (B * H);
    assert.ok(anteil > 0.15 && anteil < 0.5, `Seed ${seed}: Landanteil ${anteil.toFixed(2)}`);
    assert.ok(k.bauteile.platten >= 3, `Seed ${seed}: weniger als eine Platte je Ebene`);
    assert.ok(k.wasserY > 0 && k.wasserY < H, `Seed ${seed}: Wasserlinie`);
  }
});
