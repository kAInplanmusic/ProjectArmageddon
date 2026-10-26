import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/shared/prng.js';
import { erzeugeKompositionsKarte } from '../src/shared/terrainKomposition.js';

const B = 1280;
const H = 720;
const karte = (seed) => erzeugeKompositionsKarte({ rng: createRng(seed), width: B, height: H, art: 'ebenen' });
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

import { KARTENARTEN } from '../src/shared/terrainKomposition.js';

// Gemessen über 20 Seeds (2026-10-26): Landanteil je Art; die Schranken lassen Luft nach beiden Seiten.
const LANDANTEIL = {
  ebenen: [0.18, 0.4],
  insel: [0.15, 0.35],
  inselgruppe: [0.08, 0.25],
  hoehle: [0.5, 0.8],
  hoehleInsel: [0.5, 0.8],
  hochkant: [0.3, 0.6],
};

test('Komposition: jede Kartenart ist deterministisch, trägt ihren Namen und hält ihren Landanteil', () => {
  assert.deepEqual([...KARTENARTEN].sort(), Object.keys(LANDANTEIL).sort());
  for (const art of KARTENARTEN) {
    const [b, h] = art === 'hochkant' ? [720, 1280] : [B, H];
    for (let seed = 1; seed <= 8; seed += 1) {
      const a = erzeugeKompositionsKarte({ rng: createRng(seed * 131), width: b, height: h, art });
      const c = erzeugeKompositionsKarte({ rng: createRng(seed * 131), width: b, height: h, art });
      assert.equal(a.art, art);
      assert.deepEqual(a.bitmap, c.bitmap, `${art} Seed ${seed}: nicht deterministisch`);
      const anteil = summe(a.bitmap) / (b * h);
      assert.ok(anteil >= LANDANTEIL[art][0] && anteil <= LANDANTEIL[art][1], `${art} Seed ${seed}: Landanteil ${anteil.toFixed(2)}`);
    }
  }
});

test('Komposition: Hochformat wählt ohne Angabe „hochkant“, Querformat nie', () => {
  assert.equal(erzeugeKompositionsKarte({ rng: createRng(5), width: 720, height: 1280 }).art, 'hochkant');
  for (let seed = 1; seed <= 30; seed += 1) {
    assert.notEqual(erzeugeKompositionsKarte({ rng: createRng(seed), width: B, height: H }).art, 'hochkant');
  }
});
