/**
 * Gemalte Kulissen der Sonderbiome: jede Zuordnung zeigt auf einen echten Katalogeintrag, alle Sonderbiome außer dem Planeten sind abgedeckt,
 * die Wahl folgt dem Seed.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { SONDER_KULISSEN, sonderKulisseFuer } from '../src/client/sonderKulissen.js';
import { SONDERBIOM_IDS_FASSUNG_7 } from '../src/shared/config/biome-neu.js';
import { ALL_BACKDROPS } from '../src/shared/config/backdrops.js';
import { BACKDROPS_NEU } from '../src/shared/config/backdrops-neu.js';

test('Jeder Schlüssel der Zuordnung ist eine Kulisse des Katalogs', () => {
  // Katalog der klassischen Kulissen plus der Biome 15 bis 20 (`config/backdrops-neu.js`, Fassung 7).
  const keys = new Set([...ALL_BACKDROPS, ...BACKDROPS_NEU].map(b => b.key));
  for (const [biom, liste] of Object.entries(SONDER_KULISSEN)) {
    assert.ok(liste.length >= 2, `${biom}: mindestens zwei Bilder zur Auswahl`);
    for (const k of liste) assert.ok(keys.has(k), `${biom}: ${k} fehlt im Katalog`);
  }
});

test('Alle Sonderbiome haben Bilder, nur der Planet behält seine generative Szene', () => {
  for (const id of SONDERBIOM_IDS_FASSUNG_7) {
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

test('Beide Höhlenformen haben für jedes gemalte Sonderbiom einen gültigen Höhlenblick', () => {
  const katalog = new Set([...ALL_BACKDROPS, ...BACKDROPS_NEU].map(b => b.key));
  for (const biom of Object.keys(SONDER_KULISSEN)) {
    for (const art of ['hoehle', 'hoehleInsel']) {
      const key = sonderKulisseFuer(biom, 42, art);
      assert.ok(key.endsWith('hoehle') && katalog.has(key), biom);
    }
  }
  assert.equal(sonderKulisseFuer('vulkan', 42, 'insel'), 'island/volcano');
  assert.equal(sonderKulisseFuer('planet', 42, 'hoehle'), null);
});

import { FOTOS, panorama, fotoFuerBiom, findeKulisse } from '../src/client/panoramen.js';
import { existsSync } from 'node:fs';

test('Panoramafotos haben beide SDR-Stufen und behalten eine gültige Motivbasis', () => {
  for (const id of Object.keys(FOTOS)) {
    const foto = panorama(id);
    assert.equal(foto.key, 'foto/' + id);
    assert.ok(ALL_BACKDROPS.some(b => b.file === foto.file));
    assert.deepEqual(findeKulisse(foto.key), foto);
    for (const ende of ['', '-1280']) {
      assert.ok(existsSync(new URL('../src/client/assets/panoramen/' + id + ende + '.webp', import.meta.url)));
    }
  }
  assert.equal(panorama('toString'), null);
  assert.equal(findeKulisse('foto/unbekannt'), null);
  assert.equal(findeKulisse('alpine/winter_snow').key, 'alpine/winter_snow');
  assert.equal(fotoFuerBiom('eiswueste', 'insel'), 'snow_field');
  assert.equal(fotoFuerBiom('eiswueste', 'hoehle'), null);
  assert.equal(fotoFuerBiom('kristallhoehle', 'hoehle'), 'small_cave');
  assert.equal(fotoFuerBiom('planet', 'hoehle'), null);
});
