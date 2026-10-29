/**
 * Waffenfassung 11, Teil Munition (`config/munition.js`, Kistenfassung 4): vier Klassen (unendlich, 1, 2, 3 Schuss),
 * Obergrenze 5, Funde voll geladen, Munitionskisten füllen EINE begrenzte Waffe um 1 bis 5.
 * Fassungen 1 bis 10 behalten `maxAmmo` (Inventar ohne Schalter).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MatchSeedManager } from '../src/shared/seed.js';
import PlayerInventory from '../src/engine/inventory.js';
import { WEAPONS, WEAPONS_BY_ID, FALLBACK_WEAPON_ID } from '../src/shared/config/weapons.js';
import {
  munitionsKlasse, MUNITION_OBERGRENZE, MUNITION_FUND_MAX, STARTWAFFEN_POOL,
} from '../src/shared/config/munition.js';
import { getStartWaffen, KIT_SCHARF } from '../src/shared/config/loadouts.js';
import { KISTEN_STANDARD, KISTEN_MUNITION, KISTEN_WAFFEN } from '../src/shared/config/kisten.js';
import { WAFFEN_STANDARD, WAFFEN_MUNITION } from '../src/shared/config/waffen-fassung.js';
import { legeKiste, CRATE_TYPES } from '../src/engine/systems/lootSystem.js';

function welt() {
  const kisten = [];
  return { kisten, createEntity: () => kisten.push({}) - 1, addComponent: (id, n, w) => { if (n === 'Crate') kisten[id] = w; } };
}

const ohneStart = () => WEAPONS.filter(w => munitionsKlasse(w) !== Infinity);

test('Standard ist Waffenfassung 11 und Kistenfassung 4', () => {
  assert.equal(WAFFEN_STANDARD, WAFFEN_MUNITION);
  assert.equal(KISTEN_STANDARD, KISTEN_MUNITION);
});

test('vier Klassen: unendlich, 1, 2, 3; alle 150 Waffen haben genau eine', () => {
  const zaehl = new Map();
  for (const w of WEAPONS) zaehl.set(munitionsKlasse(w), (zaehl.get(munitionsKlasse(w)) ?? 0) + 1);
  assert.deepEqual([...zaehl.keys()].sort((a, b) => a - b), [1, 2, 3, Infinity]);
  assert.equal([...zaehl.values()].reduce((a, b) => a + b, 0), 150);
  assert.equal(zaehl.get(Infinity), 1 + STARTWAFFEN_POOL.length);
});

test('Klassen folgen Stufe und Spielwert: schwach 3, mittel 2, stark und episch 1', () => {
  for (const w of ohneStart()) {
    const k = munitionsKlasse(w);
    if (w.powerTier === 'epic' || w.powerTier === 'legendary') assert.equal(k, 1, w.id);
    else if (w.powerScore < 50) assert.equal(k, 3, w.id);
    else if (w.powerScore < 100) assert.equal(k, 2, w.id);
    else assert.equal(k, 1, w.id);
    assert.ok(k <= MUNITION_FUND_MAX);
  }
});

test('die Startwaffen des Kits (alle Plätze, viele Seeds) stehen im unendlichen Pool', () => {
  const pool = new Set(STARTWAFFEN_POOL);
  for (let seed = 1; seed <= 300; seed += 1) {
    for (const platz of [0, 1, 2, 3]) {
      for (const id of getStartWaffen('scout', KIT_SCHARF, { seed, platz })) assert.ok(pool.has(id) || id === 'pa_041', `${seed}/${platz}/${id}`); // pa_041 = begrenzte Flächenwaffe des Kits
    }
  }
  assert.equal(munitionsKlasse(WEAPONS_BY_ID[FALLBACK_WEAPON_ID]), Infinity);
});

test('Fassung 11: Startwaffen unendlich, Fund voll geladen mit der Klasse, nie mehr als 3', () => {
  const inv = new PlayerInventory();
  inv.setzeMunition(true);
  const start = getStartWaffen('scout', KIT_SCHARF, { seed: 5, platz: 0 });
  inv.register(1, start);
  for (const id of start) assert.equal(inv.getAmmo(1, id), munitionsKlasse(WEAPONS_BY_ID[id]), id);
  assert.equal(inv.getAmmo(1, FALLBACK_WEAPON_ID), Infinity);
  for (const w of ohneStart()) {
    inv.grantWeapon(1, w.id);
    assert.equal(inv.getAmmo(1, w.id), munitionsKlasse(w), w.id);
    assert.ok(inv.getAmmo(1, w.id) <= MUNITION_FUND_MAX);
  }
});

test('Fassung 11: ein zweiter Fund stapelt nicht über die Klasse', () => {
  const inv = new PlayerInventory();
  inv.setzeMunition(true);
  inv.register(1, []);
  const w = ohneStart().find(x => munitionsKlasse(x) === 2);
  inv.grantWeapon(1, w.id); inv.consume(1, w.id);
  inv.grantWeapon(1, w.id);
  assert.equal(inv.getAmmo(1, w.id), 2);
  inv.grantWeapon(1, w.id);
  assert.equal(inv.getAmmo(1, w.id), 2);
});

test('Fassung 11: Obergrenze 5 für alle Waffen, Munitionskiste füllt EINE begrenzte Waffe', () => {
  const inv = new PlayerInventory();
  inv.setzeMunition(true);
  const start = STARTWAFFEN_POOL.slice(0, 2);
  inv.register(1, start);
  assert.equal(inv.fuelleMunitionskiste(1, 3, 4), null, 'nur unendliche Waffen: nichts zu füllen');
  const a = ohneStart().find(x => munitionsKlasse(x) === 3);
  const b = ohneStart().find(x => munitionsKlasse(x) === 1);
  inv.grantWeapon(1, a.id); inv.grantWeapon(1, b.id);
  assert.deepEqual(inv.fuellbareWaffen(1), [a.id, b.id]);
  const r = inv.fuelleMunitionskiste(1, 1, 5);
  assert.equal(r.weaponId, b.id);
  assert.equal(r.amount, 4, 'von 1 nur bis 5');
  assert.equal(inv.getAmmo(1, b.id), MUNITION_OBERGRENZE);
  assert.equal(inv.getAmmo(1, a.id), 3, 'die andere Waffe bleibt unberührt');
  assert.deepEqual(inv.fuellbareWaffen(1), [a.id]);
  inv.fuelleMunitionskiste(1, 0, 5);
  assert.equal(inv.getAmmo(1, a.id), 5);
  assert.equal(inv.fuelleMunitionskiste(1, 0, 1), null);
});

test('Fassung 10 und älter: Inventar unverändert (maxAmmo, kein Schalter)', () => {
  const inv = new PlayerInventory();
  inv.register(1, ['pa_023']);
  assert.equal(inv.getAmmo(1, 'pa_023'), WEAPONS_BY_ID.pa_023.maxAmmo);
  assert.equal(inv.kapazitaet('pa_023'), WEAPONS_BY_ID.pa_023.maxAmmo);
});

test('Kistenfassung 4: die frühere leere Kiste ist eine Munitionskiste mit 1 bis 5 gleichverteilt', () => {
  const rng = new MatchSeedManager(21).getSubRng('LOOT');
  const menge = [0, 0, 0, 0, 0, 0]; let ammo = 0; let leer = 0; const N = 40000;
  for (let i = 0; i < N; i += 1) {
    const w = welt();
    legeKiste(w, rng, 0, 0, KISTEN_MUNITION);
    const k = w.kisten[0];
    if (k.crateType === CRATE_TYPES.empty) leer += 1;
    if (k.crateType !== CRATE_TYPES.ammo) continue;
    assert.ok(k.ammo >= 1 && k.ammo <= 5);
    assert.ok(k.weaponId >= 1 && k.weaponId <= 1000);
    menge[k.ammo] += 1; ammo += 1;
  }
  assert.equal(leer, 0, 'es gibt keine leeren Kisten mehr');
  assert.ok(Math.abs(ammo / N - 0.10) < 0.01, `Anteil ${ammo / N}`);
  for (let m = 1; m <= 5; m += 1) assert.ok(Math.abs(menge[m] / ammo - 0.2) < 0.03, `Menge ${m}: ${menge[m] / ammo}`);
});

test('Kistenfassung 4: Waffenkisten tragen kein Teilmagazin mehr (die Klasse entscheidet beim Aufheben)', () => {
  const rng = new MatchSeedManager(8).getSubRng('LOOT');
  let waffen = 0;
  for (let i = 0; i < 4000; i += 1) {
    const w = welt();
    legeKiste(w, rng, 0, 0, KISTEN_MUNITION);
    if (w.kisten[0].crateType === CRATE_TYPES.weapon) { waffen += 1; assert.equal(w.kisten[0].ammo, 0); }
  }
  assert.ok(waffen > 1500);
});
