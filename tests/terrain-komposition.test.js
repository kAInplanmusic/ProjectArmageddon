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
    assert.ok(anteil > 0.15 && anteil < 0.62, `Seed ${seed}: Landanteil ${anteil.toFixed(2)}`);
    assert.ok(k.bauteile.platten >= 3, `Seed ${seed}: weniger als eine Platte je Ebene`);
    assert.ok(k.wasserY > 0 && k.wasserY < H, `Seed ${seed}: Wasserlinie`);
  }
});

import { KARTENARTEN } from '../src/shared/terrainKomposition.js';

// Gemessen über 40 Seeds (2026-10-27, Dichtefeld-Generator, 1280×720 bzw. 720×1280): Landanteil je Art; die Schranken lassen Luft nach beiden Seiten.
const LANDANTEIL = {
  ebenen: [0.28, 0.62],
  insel: [0.18, 0.45],
  inselgruppe: [0.03, 0.4],
  hoehle: [0.4, 0.65],
  hoehleInsel: [0.4, 0.66],
  hochkant: [0.3, 0.72],
  schlucht: [0.47, 0.7],
  archipel: [0.15, 0.58],
  vulkan: [0.3, 0.53],
  ruinenstadt: [0.33, 0.6],
  pyramide: [0.27, 0.42],
  planet: [0.1, 0.3],
  unmoeglich: [0.18, 0.4],
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

test('Komposition: „unmöglich“ verlangt den Umlauf und ist an der Naht so glatt wie im Inneren', () => {
  for (let seed = 1; seed <= 20; seed += 1) {
    const k = erzeugeKompositionsKarte({ rng: createRng(seed * 131), width: B, height: H, art: 'unmoeglich' });
    assert.equal(k.umlauf, true);
    const unterschied = (x1, x2) => {
      let n = 0;
      for (let y = 0; y < H; y += 1) if (k.bitmap[y * B + x1] !== k.bitmap[y * B + x2]) n += 1;
      return n;
    };
    let summe2 = 0;
    for (let x = 0; x < B - 1; x += 1) summe2 += unterschied(x, x + 1);
    const mittel = summe2 / (B - 1);
    assert.ok(unterschied(B - 1, 0) <= 1.5 * mittel + 4, `Seed ${seed}: Naht ist ein Sprung`);
  }
  for (const art of KARTENARTEN.filter((a) => a !== 'unmoeglich')) {
    const [b, h] = art === 'hochkant' ? [720, 1280] : [B, H];
    assert.equal(erzeugeKompositionsKarte({ rng: createRng(3), width: b, height: h, art }).umlauf, false, art);
  }
});

test('Komposition: nur der Planet ist rund', () => {
  for (const art of KARTENARTEN) {
    const [b, h] = art === 'hochkant' ? [720, 1280] : [B, H];
    assert.equal(erzeugeKompositionsKarte({ rng: createRng(3), width: b, height: h, art }).rund, art === 'planet', art);
  }
});

import { PLANET_BIOM_IDS } from '../src/shared/config/biome-planet.js';

test('Komposition: der Planet zieht seine Art aus den sechs Arten, alle kommen vor, andere Karten haben keine', () => {
  const gesehen = new Set();
  for (let seed = 1; seed <= 60; seed += 1) {
    const k = erzeugeKompositionsKarte({ rng: createRng(seed * 17), width: B, height: H, art: 'planet' });
    assert.ok(PLANET_BIOM_IDS.includes(k.planetenart), `Seed ${seed}: ${k.planetenart}`);
    gesehen.add(k.planetenart);
  }
  assert.equal(gesehen.size, PLANET_BIOM_IDS.length, `gesehen: ${[...gesehen].join(', ')}`);
  assert.equal(erzeugeKompositionsKarte({ rng: createRng(3), width: B, height: H, art: 'insel' }).planetenart, null);
});
