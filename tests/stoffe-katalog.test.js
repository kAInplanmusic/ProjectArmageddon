/**
 * Der Stoffkatalog mit den Biom-Materialien: feste Reihenfolge der Kennungen, Basiskatalog unverändert,
 * keine Rezeptur nutzt die neuen Kennungen (alte Karten und Replays bleiben, wie sie waren).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { STOFFE, STOFF } from '../src/shared/config/stoffe.js';
import { NEUE_BIOME, SONDERBIOM_IDS } from '../src/shared/config/biome-neu.js';
import { rezeptFuer, ALTE_REZEPTE } from '../src/shared/config/stoff-rezepte.js';

const BASIS = Object.keys(STOFF).length;
const fnv = (text) => {
  let h = 0x811C9DC5;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h;
};

test('Katalog: Kennungen sind lückenlos, der Basiskatalog hat die benannten Kennungen', () => {
  assert.equal(BASIS, 18);
  STOFFE.forEach((s, i) => assert.equal(s.id, i, `${s.key}: Kennung weicht von der Stelle ab`));
  for (const [name, id] of Object.entries(STOFF)) assert.ok(id < BASIS, `${name}: benannte Kennung außerhalb der Basis`);
});

test('Katalog: Reihenfolge der Kennungen ist festgeschrieben (neue Stoffe nur ans Ende)', () => {
  // Wer einen Stoff einfügt oder umsortiert, verschiebt Kennungen und bricht Stoffkarten alter Replays.
  assert.equal(STOFFE.length, 126);
  assert.equal(fnv(STOFFE.map((s) => s.key).join(',')), 3143453692, 'Schlüsselreihenfolge geändert');
});

test('Katalog: Basisstoffe behalten ihre Werte, nur neue Felder kommen dazu', () => {
  const erde = STOFFE[0];
  assert.deepEqual({ key: erde.key, haerte: erde.haerte, radius: erde.radius, tiefe: erde.tiefe, farbe: erde.farbe }, { key: 'erde', haerte: 'normal', radius: 1, tiefe: 1, farbe: [120, 92, 64] });
  assert.equal(typeof STOFFE[0].reibung, 'number');
});

test('Katalog: keine Rezeptur und kein Sonderbiom nutzt die neuen Kennungen', () => {
  const rezepte = { ...ALTE_REZEPTE, ...Object.fromEntries(SONDERBIOM_IDS.map((id) => [id, rezeptFuer(id)])) };
  for (const id of Object.keys(NEUE_BIOME)) rezepte[id] ??= rezeptFuer(id);
  const neu = new Set(STOFFE.slice(BASIS).map((s) => s.key));
  for (const [biom, r] of Object.entries(rezepte)) {
    const keys = [...r.deck.map((d) => d[0]), r.kern, ...(r.adern ?? []).map((a) => a.stoff), ...(r.platten ? [r.platten.stoff] : [])];
    for (const k of keys) assert.ok(!neu.has(k), `${biom}: nutzt den neuen Stoff ${k}`);
  }
});
