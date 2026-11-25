/**
 * Bodenart nach Motiv der Kulisse (`src/client/bodenMotiv.js`, Rückmeldung 2026-11-25).
 * Vorher bekamen 120 von 165 Kulissen grauen Fels oder Asche, auch Wald, Felder und die Landschaftsfotos.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bodenFuerMotiv } from '../src/client/bodenMotiv.js';
import { BACKDROP_BIOMES, paletteFor } from '../src/shared/config/backdrops.js';
import { bodenArt } from '../src/client/gelaendeStil.js';

test('Eindeutige Motive bekommen ihren Boden', () => {
  const fall = (biomeId, id) => bodenFuerMotiv({ key: `${biomeId}/${id}`, biomeId, id });
  assert.equal(fall('forest', 'autumn_forest'), 'gras');
  assert.equal(fall('open', 'wheat_plains'), 'gras');
  assert.equal(fall('warren', 'bamboo_thicket'), 'gras');
  assert.equal(fall('western', 'desert_town'), 'sand');
  assert.equal(fall('alpine', 'winter_snow'), 'schnee');
  assert.equal(fall('island', 'volcano'), 'asche');
  assert.equal(fall('caverns', 'crystal'), 'fels');
  assert.equal(fall('caverns', 'ice_cave'), 'schnee');
  assert.equal(fall('fantasy', 'elven_city'), 'gras');
  assert.equal(fall('noir', 'rainy_street'), 'fels');
});

test('Landschaftsfotos (stil/…) folgen dem Dateinamen, nicht ihrer Bildfamilie', () => {
  const stil = (name, biomeId) => bodenFuerMotiv({ key: `stil/${name}`, biomeId, id: 'stimmung_dunkel', file: `${name}.webp` });
  assert.equal(stil('nachtstadt_tal_dunkel', 'urban'), 'gras');
  assert.equal(stil('herbstwiese_hell', 'forest'), 'gras');
  assert.equal(stil('schnee_alpendorf_hell', 'alpine'), 'schnee');
  assert.equal(stil('palmenstrand_fluss_hell', 'island'), 'sand');
});

test('Kein Wald-, Feld- oder Wiesenmotiv bekommt grauen Boden; grau wird seltener', () => {
  const GRUEN = /forest|meadow|wheat|heath|prairie|rice|bamboo|jungle|glade|valley|swamp|polder|elven/;
  let grau = 0; let alle = 0;
  for (const b of BACKDROP_BIOMES) {
    for (const v of b.variants) {
      const kulisse = { key: `${b.id}/${v.id}`, biomeId: b.id, id: v.id };
      const art = bodenArt(paletteFor(kulisse).surface, bodenFuerMotiv(kulisse));
      alle += 1;
      if (art === 'fels' || art === 'asche') grau += 1;
      if (GRUEN.test(v.id) && !/ragnarok|hoehle|winter/.test(v.id)) assert.equal(art, 'gras', kulisse.key);
    }
  }
  assert.ok(alle >= 160, `Testaufbau: ${alle} Kulissen`);
  // Vorher 120 von 160 (nur nach Farbe). Städte, Höhlen, Kosmos, Abstraktes und Weltuntergang bleiben zu Recht Stein.
  assert.ok(grau <= 105, `grau: ${grau} von ${alle}`);
});

test('Ohne Kulisse entscheidet weiter die Farbe', () => {
  assert.equal(bodenFuerMotiv(null), null);
  assert.equal(bodenArt([250, 250, 255], null), 'schnee');
});
