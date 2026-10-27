/**
 * Gelände-Fassung 5 (Biom-Materialien): Rezepte nennen nur Stoffe des Katalogs, ältere Fassungen bleiben
 * Bit für Bit gleich, Server und Client bauen dieselbe Stoffkarte, die Karte nutzt die neuen Stoffe.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MatchController } from '../src/engine/match.js';
import { buildTerrainForSeed } from '../src/client/terrainPreview.js';
import { stoffHash } from '../src/shared/stoffkarte.js';
import { NEUE_BIOME } from '../src/shared/config/biome-neu.js';
import { rezeptFuer } from '../src/shared/config/stoff-rezepte.js';
import { REZEPTE_MATERIAL } from '../src/shared/config/stoff-rezepte-material.js';
import { stoffByKey } from '../src/shared/config/stoffe.js';
import { GELAENDE_PLANET, GELAENDE_MATERIAL, normalisiereGelaende } from '../src/shared/config/gelaende.js';
import { ZERSTOERUNG_STOFF } from '../src/shared/config/zerstoerung.js';

const BASIS = 18;
const IDS = Object.keys(REZEPTE_MATERIAL);
const schluessel = (r) => [...r.deck.map((d) => d[0]), r.kern, ...(r.adern ?? []).map((a) => a.stoff), ...(r.platten ? [r.platten.stoff] : [])];

test('Fassung 5 ist eine gültige Fassung und nicht die Vorgabe', () => {
  assert.equal(normalisiereGelaende(GELAENDE_MATERIAL), GELAENDE_MATERIAL);
});

test('Rezepte: jeder Stoff steht im Katalog, jede Schicht hat eine Tiefe, jedes Rezept nutzt neue Stoffe', () => {
  assert.equal(IDS.length, 19);
  for (const id of IDS) {
    const r = REZEPTE_MATERIAL[id];
    for (const k of schluessel(r)) assert.ok(stoffByKey(k), `${id}: unbekannter Stoff ${k}`);
    for (const [, tiefe] of r.deck) assert.ok(tiefe > 0, `${id}: Tiefe`);
    assert.ok(schluessel(r).some((k) => stoffByKey(k).id >= BASIS), `${id}: nutzt keinen neuen Stoff`);
  }
});

test('Ältere Fassungen bleiben unverändert: ohne Fassung 5 gilt das alte Rezept', () => {
  for (const id of IDS) {
    assert.equal(rezeptFuer(id), NEUE_BIOME[id].stoffe, `${id}: Fassung 0`);
    assert.equal(rezeptFuer(id, GELAENDE_PLANET), NEUE_BIOME[id].stoffe, `${id}: Fassung 4`);
    assert.equal(rezeptFuer(id, GELAENDE_MATERIAL), REZEPTE_MATERIAL[id], `${id}: Fassung 5`);
  }
  assert.equal(rezeptFuer('maritime', GELAENDE_MATERIAL), rezeptFuer('maritime'), 'alte Biome ohne Material-Rezept bleiben');
});

test('Form bleibt: Fassung 5 ändert nur die Stoffe, nicht die Karte (Maske) des Matches', () => {
  for (const biom of ['vulkan', 'schwebinseln', 'planet_lava']) {
    const mk = (g) => new MatchController({ seed: 424, teams: 2, playersPerTeam: 1, kartentyp: 'autonom', biom, maxRounds: 2, gelaende: g, zerstoerung: ZERSTOERUNG_STOFF });
    const a = mk(GELAENDE_PLANET);
    const b = mk(GELAENDE_MATERIAL);
    a.start();
    b.start();
    assert.deepEqual(a.bitmap, b.bitmap, `${biom}: Maske`);
    assert.notEqual(stoffHash(a.stoffkarte), stoffHash(b.stoffkarte), `${biom}: Stoffkarte muss sich ändern`);
  }
});

test('Fassung 5: Server und Client bauen dieselbe Stoffkarte, mit neuen Stoffen', () => {
  for (const [i, biom] of ['vulkan', 'dschungel', 'eiswueste', 'duenen', 'fabrik', 'planet_stein'].entries()) {
    const seed = 600 + i;
    const m = new MatchController({ seed, teams: 2, playersPerTeam: 1, kartentyp: 'autonom', biom, maxRounds: 2, gelaende: GELAENDE_MATERIAL, zerstoerung: ZERSTOERUNG_STOFF });
    m.start();
    const c = buildTerrainForSeed(seed, 'hills', 'landscape', 'autonom', { gelaende: GELAENDE_MATERIAL, zerstoerung: ZERSTOERUNG_STOFF, biom });
    assert.equal(stoffHash(m.stoffkarte), stoffHash(c.stoffkarte), `${biom}: Server gegen Client`);
    const ids = new Set(m.stoffkarte.feld);
    assert.ok([...ids].some((id) => id >= BASIS), `${biom}: kein neuer Stoff auf der Karte (Kennungen ${[...ids].join(',')})`);
  }
});
