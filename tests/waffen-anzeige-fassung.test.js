/**
 * Menü, Klang und Farbe lesen die Schadensart der Waffenfassung im Standard (Fassung 10), nicht die des Katalogs:
 * Die Elementwaffen heißen nur dort nach ihrem Element (Glutelixier = Feuer, Eisschild = Eis ...).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { WEAPONS_BY_ID } from '../src/shared/config/weapons.js';
import { getWaffe, WAFFEN_ZUENDERPLUS } from '../src/shared/config/waffen-fassung.js';

const ERWARTET = {
  pa_084: 'fire', pa_095: 'electric', pa_099: 'ice', pa_109: 'poison',
  pa_085: 'fire', pa_105: 'ice', pa_100: 'electric', pa_096: 'poison', pa_101: 'ice', pa_093: 'electric',
};

test('Standardfassung: Elementwaffen tragen ihr Element, ältere Fassungen den Katalogwert', () => {
  for (const [id, art] of Object.entries(ERWARTET)) {
    assert.equal(getWaffe(id).damageType, art, `${id} im Standard`);
    assert.equal(getWaffe(id, WAFFEN_ZUENDERPLUS).damageType, WEAPONS_BY_ID[id].damageType, `${id} in Fassung 7`);
  }
});

test('Menü liest Schaden und Rückstoß aus der Standardfassung', async () => {
  const quelle = (await import('node:fs')).readFileSync(new URL('../src/client/waffenMenue.js', import.meta.url), 'utf8');
  assert.match(quelle, /\.\.\.getWaffe\(/, 'Menü mischt die Fassungswerte ein');
  assert.match(quelle, /Rückstoß/);
  assert.notEqual(getWaffe('pa_029').damage, WEAPONS_BY_ID.pa_029.damage, 'Fassung 11 weicht vom Katalog ab');
});
