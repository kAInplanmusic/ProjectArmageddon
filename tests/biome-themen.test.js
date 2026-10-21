/**
 * Themenbiome (Geländefassung 3, `config/biome-themen.js`): Kosmos, Surreal, Fabrik, Burg.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NEUE_BIOME, SONDERBIOM_IDS, THEMEN_BIOM_IDS, SONDERBIOM_IDS_FASSUNG_3 } from '../src/shared/config/biome-neu.js';
import {
  GELAENDE_BIOME, GELAENDE_THEMEN, GELAENDE_PLANET, GELAENDE_STANDARD, normalisiereGelaende, normalisiereBiomWahl, waehleSonderbiom, loeseGelaende,
} from '../src/shared/config/gelaende.js';
import { stoffByKey } from '../src/shared/config/stoffe.js';
import { BACKDROP_BIOMES } from '../src/shared/config/backdrops.js';
import { SCENERY_BIOMES } from '../src/shared/config/scenery.js';
import { MatchController } from '../src/engine/match.js';
import { stoffHash } from '../src/shared/stoffkarte.js';
import { buildTerrainForSeed } from '../src/client/terrainPreview.js';

test('Vier Themenbiome, Fassung 4 (Planet) ist der Standard, Fassung 3 bleibt gültig, Fassung 2 kennt nur die neun', () => {
  assert.deepEqual([...THEMEN_BIOM_IDS], ['kosmos', 'surreal', 'fabrik', 'burg']);
  assert.equal(SONDERBIOM_IDS.length, 9);
  assert.equal(SONDERBIOM_IDS_FASSUNG_3.length, 13);
  assert.equal(GELAENDE_STANDARD, GELAENDE_PLANET);
  assert.equal(normalisiereGelaende(GELAENDE_THEMEN), GELAENDE_THEMEN);
  assert.equal(normalisiereGelaende(GELAENDE_BIOME), GELAENDE_BIOME);
  assert.equal(normalisiereBiomWahl('kosmos', GELAENDE_BIOME), null);
  assert.equal(normalisiereBiomWahl('kosmos', GELAENDE_THEMEN), 'kosmos');
  assert.equal(loeseGelaende(GELAENDE_BIOME, 'burg', 5).sonderbiom !== 'burg', true);
});

test('Die Ziehung der Fassung 2 bleibt für jeden Seed die alte (nur die neun), Fassung 3 zieht auch Themenbiome', () => {
  const neun = new Set(SONDERBIOM_IDS);
  const gesehen = new Set();
  for (let seed = 1; seed < 4000; seed += 1) {
    const alt = waehleSonderbiom(seed, null, GELAENDE_BIOME);
    if (alt) assert.ok(neun.has(alt), `Seed ${seed}: ${alt}`);
    const neu = waehleSonderbiom(seed, null, GELAENDE_THEMEN);
    if (neu) gesehen.add(neu);
  }
  for (const id of THEMEN_BIOM_IDS) assert.ok(gesehen.has(id), `${id} wird gezogen`);
});

test('Jedes Themenbiom: eigene Form, eigener Materialmix, bekannte Stoffe, Kulisse und Karte stimmen überein', () => {
  const formen = new Set();
  const rezepte = new Set();
  for (const id of THEMEN_BIOM_IDS) {
    const b = NEUE_BIOME[id];
    for (const f of ['label', 'beschreibung', 'sky', 'water', 'landmarks', 'ambient', 'ground', 'form', 'stoffe', 'pflanzen']) assert.ok(b[f], `${id}: ${f}`);
    formen.add(JSON.stringify(b.form));
    rezepte.add(JSON.stringify(b.stoffe));
    const keys = [...b.stoffe.deck.map(d => d[0]), b.stoffe.kern, ...b.stoffe.adern.map(a => a.stoff), ...(b.stoffe.platten ? [b.stoffe.platten.stoff] : [])];
    for (const k of keys) assert.ok(stoffByKey(k), `${id}: Stoff ${k}`);
    assert.ok(SCENERY_BIOMES[id], `${id} ist ein Kulissenbiom`);
  }
  assert.equal(formen.size, 4);
  assert.equal(rezepte.size, 4);
  const stoffe = id => JSON.stringify(NEUE_BIOME[id].stoffe);
  assert.ok(stoffe('fabrik').includes('beton') && stoffe('surreal').includes('glas') && stoffe('burg').includes('magiekristall') && stoffe('kosmos').includes('regolith'));
  assert.ok(BACKDROP_BIOMES.length >= 16);
});

test('Themenbiome bauen spielbare Karten: Spawn erreichbar, Stoffkarte Server = Client', () => {
  for (const biom of THEMEN_BIOM_IDS) {
    for (const seed of [11, 4242]) {
      const m = new MatchController({ seed, teams: 2, playersPerTeam: 2, kartentyp: 'autonom', biom, maxRounds: 2, gelaende: GELAENDE_THEMEN, zerstoerung: 5 });
      m.start();
      assert.equal(m.sonderbiom, biom);
      assert.ok(m.erreichbarkeit?.ok, `${biom}/${seed}: ${m.erreichbarkeit?.grund}`);
      const c = buildTerrainForSeed(seed, 'hills', 'landscape', 'autonom', { gelaende: GELAENDE_THEMEN, zerstoerung: 5, biom });
      assert.equal(stoffHash(m.stoffkarte), stoffHash(c.stoffkarte), `${biom}/${seed}`);
    }
  }
});
