import test from 'node:test';
import assert from 'node:assert/strict';
import { erzeugeAutonomeKarte } from '../src/shared/terrainGen3.js';
import { biomFuerCharakter } from '../src/shared/biomwahl.js';
import { SeededRandom } from '../src/shared/prng.js';
import { GELAENDE_MATERIAL, GELAENDE_KOMPOSITION, normalisiereGelaende } from '../src/shared/config/gelaende.js';

const B = 2560;
const H = 1440;
const karte = (seed, fassung = GELAENDE_KOMPOSITION) => erzeugeAutonomeKarte({ rng: new SeededRandom(seed), width: B, height: H, stoffe: true, fassung });

test('Fassung 6 ist bekannt, Fassung 5 bleibt gültig', () => {
  assert.equal(GELAENDE_KOMPOSITION, 6);
  assert.equal(normalisiereGelaende(6), 6);
  assert.equal(normalisiereGelaende(GELAENDE_MATERIAL), 5);
});

test('Bauteilkarte: gleicher Seed, gleiche Karte; jede Karte nennt ihre Art und ist spielbar', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const a = karte(seed);
    const b = karte(seed);
    assert.deepEqual(a.bitmap, b.bitmap);
    assert.equal(a.charakter.kartenart, b.charakter.kartenart);
    assert.ok(a.charakter.kartenart, 'Kartenart fehlt');
    assert.equal(a.warnung, undefined, `Seed ${seed}: ${a.warnung}`);
    assert.ok(a.stoffkarte, 'Stoffkarte fehlt');
  }
});

test('Bauteilkarte: über 200 Seeds kommen alle elf Arten vor, das Biom folgt der Art', () => {
  const arten = new Set();
  const biome = new Set();
  for (let seed = 1; seed <= 200; seed += 1) {
    const k = karte(seed);
    arten.add(k.charakter.kartenart);
    biome.add(biomFuerCharakter(k.charakter));
    if (['hoehle', 'hoehleInsel', 'schlucht'].includes(k.charakter.kartenart)) assert.equal(biomFuerCharakter(k.charakter), 'caverns');
    if (['insel', 'inselgruppe', 'archipel'].includes(k.charakter.kartenart)) assert.equal(biomFuerCharakter(k.charakter), 'island');
  }
  assert.equal(arten.size, 11, [...arten].join(','));
  assert.ok(biome.size >= 3, [...biome].join(','));
});

test('Hochformat zieht immer „hochkant“', () => {
  const k = erzeugeAutonomeKarte({ rng: new SeededRandom(9), width: 1440, height: 2560, fassung: GELAENDE_KOMPOSITION });
  assert.equal(k.charakter.kartenart, 'hochkant');
});

test('Fassung 5 baut weiter Hügelkarten ohne Kartenart', () => {
  const k = karte(1, GELAENDE_MATERIAL);
  assert.equal(k.charakter.kartenart, undefined);
});
