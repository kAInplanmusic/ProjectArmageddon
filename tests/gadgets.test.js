/**
 * Gadgets (2026-10-29): Fluggeräte, Haken, Kisten, Schutz und Tore sind keine Waffen.
 * Das Katalogfeld `gadget` ändert NUR Anzeigegruppe und Reihenfolge der Zifferntasten;
 * Kategorie, Beute und Kits bleiben (Messung der Beute: `npm run balance:loot`, Stand vorher = nachher).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  WEAPONS, getWeapon, displayGroupFor, displayGroupLabel, orderInventoryBySubcategory, FALLBACK_WEAPON_ID,
} from '../src/shared/config/weapons.js';
import { GADGET_IDS } from '../scripts/build-weapon-catalog.mjs';

test('Die Gadget-Liste des Generators steht im Katalog, mit unveränderter Kategorie', () => {
  const kategorien = {
    pa_032: 'ranged', pa_111: 'utility', pa_112: 'utility', pa_114: 'utility', pa_115: 'utility', pa_119: 'utility',
    pa_122: 'tech', pa_125: 'tech', pa_126: 'tech', pa_127: 'tech', pa_128: 'tech', pa_130: 'tech', pa_131: 'tech',
  };
  assert.deepEqual([...GADGET_IDS].sort(), Object.keys(kategorien).sort());
  for (const waffe of WEAPONS) assert.equal(waffe.gadget, GADGET_IDS.includes(waffe.id), waffe.id);
  for (const [id, kategorie] of Object.entries(kategorien)) assert.equal(getWeapon(id).category, kategorie, id);
});

test('Raketenrucksack, Düsenrucksack und Gleitschirm sind Gadgets, Schaden- und Bohrwaffen nicht', () => {
  for (const id of ['pa_032', 'pa_112', 'pa_114']) assert.equal(displayGroupFor(id), 'gadgets');
  for (const id of ['pa_113', 'pa_116', 'pa_117', 'pa_118', 'pa_120', 'pa_124']) {
    assert.notEqual(displayGroupFor(id), 'gadgets', id);
  }
  assert.equal(displayGroupLabel('gadgets'), 'Gadgets');
});

test('Gadgets bilden eine zusammenhängende Gruppe vor der Reserve', () => {
  const inventar = [FALLBACK_WEAPON_ID, 'pa_112', 'pa_001', 'pa_131', 'pa_090'];
  const gruppen = orderInventoryBySubcategory(inventar).map(i => displayGroupFor(inventar[i]));
  assert.equal(gruppen.at(-1), 'reserve');
  assert.deepEqual(gruppen.slice(-3, -1), ['gadgets', 'gadgets']);
  const wechsel = gruppen.filter((g, i) => g !== gruppen[i - 1]);
  assert.equal(new Set(gruppen).size, wechsel.length, 'Gruppen nicht zusammenhängend');
});
