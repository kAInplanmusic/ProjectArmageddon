/**
 * Tests: Weapon-specific animation styling
 * Tests the new waffenEigenschaften function and weapon-specific styling
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  waffenEigenschaften,
  WAFFEN_STILE
} from '../src/client/weaponAnimation.js';

test('waffenEigenschaften returns correct fire color and melee recoil', () => {
  const fireWeapon = {
    stats: { damage_type: 'fire' },
    category: 'melee'
  };
  const props = waffenEigenschaften(fireWeapon);
  assert.strictEqual(props.farbe, '#ff5500');
  assert.strictEqual(props.rueckstoss, 0.4);
});

test('waffenEigenschaften returns correct energy color and ranged recoil', () => {
  const energyWeapon = {
    stats: { damage_type: 'energy' },
    category: 'ranged'
  };
  const props = waffenEigenschaften(energyWeapon);
  assert.strictEqual(props.farbe, '#4cc9f0');
  assert.strictEqual(props.rueckstoss, 1.0);
});

test('waffenEigenschaften returns correct explosive color and heavy ranged recoil', () => {
  const explosiveWeapon = {
    stats: { damage_type: 'explosive' },
    category: 'heavy_ranged'
  };
  const props = waffenEigenschaften(explosiveWeapon);
  assert.strictEqual(props.farbe, '#f4a261');
  assert.strictEqual(props.rueckstoss, 2.2);
});

test('waffenEigenschaften returns correct ice color and ultimate recoil', () => {
  const iceWeapon = {
    stats: { damage_type: 'ice' },
    category: 'ultimate'
  };
  const props = waffenEigenschaften(iceWeapon);
  assert.strictEqual(props.farbe, '#e8eef5');
  assert.strictEqual(props.rueckstoss, 3.5);
});

test('waffenEigenschaften returns defaults for null weapon', () => {
  const props = waffenEigenschaften(null);
  assert.strictEqual(props.farbe, '#ffe066'); // physical default
  assert.strictEqual(props.rueckstoss, 1);
});

test('waffenEigenschaften handles missing damage_type gracefully', () => {
  const weapon = { category: 'magic' }; // no damage_type
  const props = waffenEigenschaften(weapon);
  assert.strictEqual(props.farbe, '#ffe066'); // physical fallback
  assert.strictEqual(props.rueckstoss, 0.7); // magic recoil
});

test('waffenEigenschaften handles missing category gracefully', () => {
  const weapon = { stats: { damage_type: 'poison' } }; // no category
  const props = waffenEigenschaften(weapon);
  assert.strictEqual(props.farbe, '#90be6d'); // poison color
  assert.strictEqual(props.rueckstoss, 1); // default recoil
});

test('WAFFEN_STILE contains all expected color values', () => {
  assert.strictEqual(WAFFEN_STILE.farben.fire, '#ff5500');
  assert.strictEqual(WAFFEN_STILE.farben.energy, '#4cc9f0');
  assert.strictEqual(WAFFEN_STILE.farben.plasma, '#a855f7');
  assert.strictEqual(WAFFEN_STILE.farben.electric, '#fbbf24');
  assert.strictEqual(WAFFEN_STILE.farben.ice, '#e8eef5');
  assert.strictEqual(WAFFEN_STILE.farben.poison, '#90be6d');
  assert.strictEqual(WAFFEN_STILE.farben.physical, '#ffe066');
  assert.strictEqual(WAFFEN_STILE.farben.explosive, '#f4a261');
  assert.strictEqual(WAFFEN_STILE.farben.magic, '#9d4edd');
});

test('WAFFEN_STILE contains all expected recoil values', () => {
  assert.strictEqual(WAFFEN_STILE.rueckstoss.melee, 0.4);
  assert.strictEqual(WAFFEN_STILE.rueckstoss.ranged, 1.0);
  assert.strictEqual(WAFFEN_STILE.rueckstoss.heavy_ranged, 2.2);
  assert.strictEqual(WAFFEN_STILE.rueckstoss.ultimate, 3.5);
  assert.strictEqual(WAFFEN_STILE.rueckstoss.tech, 1.4);
  assert.strictEqual(WAFFEN_STILE.rueckstoss.magic, 0.7);
  assert.strictEqual(WAFFEN_STILE.rueckstoss.elemental, 1.1);
  assert.strictEqual(WAFFEN_STILE.rueckstoss.utility, 0.5);
});