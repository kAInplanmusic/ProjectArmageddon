/**
 * Gemalte Kulissen der Sonderbiome: jede Zuordnung zeigt auf einen echten Katalogeintrag, alle Sonderbiome außer dem Planeten sind abgedeckt,
 * die Wahl folgt dem Seed.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { SONDER_KULISSEN, sonderKulisseFuer } from '../src/client/sonderKulissen.js';
import { SONDERBIOM_IDS_FASSUNG_4 } from '../src/shared/config/biome-neu.js';
import { ALL_BACKDROPS } from '../src/shared/config/backdrops.js';

test('Jeder Schlüssel der Zuordnung ist eine Kulisse des Katalogs', () => {
  const keys = new Set(ALL_BACKDROPS.map(b => b.key));
  for (const [biom, liste] of Object.entries(SONDER_KULISSEN)) {
    assert.ok(liste.length >= 2, `${biom}: mindestens zwei Bilder zur Auswahl`);
    for (const k of liste) assert.ok(keys.has(k), `${biom}: ${k} fehlt im Katalog`);
  }
});

test('Alle Sonderbiome haben Bilder, nur der Planet behält seine generative Szene', () => {
  for (const id of SONDERBIOM_IDS_FASSUNG_4) {
    if (id === 'planet') assert.equal(SONDER_KULISSEN[id], undefined);
    else assert.ok(SONDER_KULISSEN[id], `${id} ohne gemalte Kulisse`);
  }
  assert.equal(sonderKulisseFuer('planet', 1), null);
  assert.equal(sonderKulisseFuer(null, 1), null);
});

test('Die Wahl folgt dem Seed und nutzt über viele Seeds alle Bilder eines Bioms', () => {
  for (const [biom, liste] of Object.entries(SONDER_KULISSEN)) {
    assert.equal(sonderKulisseFuer(biom, 77), sonderKulisseFuer(biom, 77));
    const gesehen = new Set();
    for (let s = 1; s <= 200; s += 1) gesehen.add(sonderKulisseFuer(biom, s));
    assert.equal(gesehen.size, liste.length, `${biom}: nicht alle Bilder kommen vor`);
  }
});
