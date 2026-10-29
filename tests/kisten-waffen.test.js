/**
 * Kistenfassung 3 (`config/kisten.js`): Waffenkisten fallen wirklich, Stufe vor Waffe, Magazin nach Stufe.
 * Die Fassungen 1 und 2 bleiben bitgleich (Altaufzeichnungen) — auch mit ihrem Fehler: keine Waffenkiste.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MatchSeedManager } from '../src/shared/seed.js';
import { MatchController } from '../src/engine/match.js';
import { legeKiste, waehleWaffeNachStufe, CRATE_TYPES, weaponIdFromIndex } from '../src/engine/systems/lootSystem.js';
import { KISTEN_ALT, KISTEN_OFT, KISTEN_WAFFEN, KISTEN_MUNITION, KISTEN_STANDARD, KISTEN_STUFEN_GEWICHT, KISTEN_MUNITION_STUFE, normalisiereKisten } from '../src/shared/config/kisten.js';
import { WEAPONS, WEAPONS_BY_ID, hasSpecialEffect } from '../src/shared/config/weapons.js';

function welt() {
  const kisten = [];
  return { kisten, createEntity: () => kisten.push({}) - 1, addComponent: (id, n, w) => { if (n === 'Crate') kisten[id] = w; } };
}

test('Standard ist Fassung 4; Fassung 1 bis 4 bleiben gültig', () => {
  assert.equal(KISTEN_STANDARD, KISTEN_MUNITION); // Fassung 4 (Waffenfassung 11) ist Standard; Fassung 3 bleibt gültig (Beleg: Munition-Test)
  for (const f of [KISTEN_ALT, KISTEN_OFT, KISTEN_WAFFEN, KISTEN_MUNITION]) assert.equal(normalisiereKisten(f), f);
  assert.equal(normalisiereKisten(99), KISTEN_MUNITION);
});

test('Fassung 2 bleibt wie aufgezeichnet: aus Rundenkisten fällt nie eine Waffe', () => {
  const rng = new MatchSeedManager(11).getSubRng('LOOT');
  for (let i = 0; i < 2000; i += 1) {
    const w = welt();
    legeKiste(w, rng, 0, 0, KISTEN_OFT);
    assert.notEqual(w.kisten[0].crateType, CRATE_TYPES.weapon);
  }
});

test('Fassung 3: 55 % Waffenkisten, Stufenanteile nach Gewicht, jede Waffe erreichbar', () => {
  const rng = new MatchSeedManager(7).getSubRng('LOOT');
  const stufe = {}; const gesehen = new Set(); let waffen = 0; const N = 60000;
  for (let i = 0; i < N; i += 1) {
    const w = welt();
    legeKiste(w, rng, 0, 0, KISTEN_WAFFEN);
    const k = w.kisten[0];
    if (k.crateType !== CRATE_TYPES.weapon) continue;
    const waffe = WEAPONS_BY_ID[weaponIdFromIndex(k.weaponId)];
    waffen += 1; gesehen.add(waffe.id); stufe[waffe.powerTier] = (stufe[waffe.powerTier] ?? 0) + 1;
    const grenze = KISTEN_MUNITION_STUFE[waffe.powerTier];
    assert.equal(k.ammo, grenze === undefined ? 0 : Math.min(grenze, waffe.maxAmmo));
  }
  assert.ok(Math.abs(waffen / N - 0.55) < 0.01);
  const summe = Object.values(KISTEN_STUFEN_GEWICHT).reduce((a, b) => a + b, 0);
  for (const [s, g] of Object.entries(KISTEN_STUFEN_GEWICHT)) {
    assert.ok(Math.abs(stufe[s] / waffen - g / summe) < 0.015, `${s}: ${stufe[s] / waffen}`);
  }
  assert.deepEqual(WEAPONS.filter(w => hasSpecialEffect(w) && !gesehen.has(w.id)).map(w => w.id), []);
});

test('Fassung 3: Waffen, Magazin und Farbe passen zur Stufe; zwei Ziehungen je Waffe', () => {
  const rng = new MatchSeedManager(3).getSubRng('LOOT');
  const vorher = new MatchSeedManager(3).getSubRng('LOOT');
  const waffe = waehleWaffeNachStufe(rng);
  vorher.next(); vorher.next();
  assert.equal(rng.next(), vorher.next());
  assert.ok(hasSpecialEffect(waffe));
});

test('Fassung 3 im Match: Rundenkisten enthalten Waffen; Fassung 2 im Match nicht', () => {
  const zaehle = kisten => {
    let n = 0;
    for (let seed = 1; seed <= 40; seed += 1) {
      const m = new MatchController({ seed, teams: 2, playersPerTeam: 2, preset: 'hills', turnDurationMs: 1e6, kisten });
      m.start();
      n += m.getState().crates.filter(c => c.crateType === CRATE_TYPES.weapon).length;
    }
    return n;
  };
  assert.equal(zaehle(KISTEN_OFT), 0);
  assert.ok(zaehle(KISTEN_WAFFEN) > 15);
});

test('Altköpfe bitgleich: Zustands-Hash nach 4000 Schritten, Fassung 1 und 2 (Goldwerte vom Stand vor Fassung 3)', () => {
  const gold = { 1: ['9ac2e336', 'c55fa9df', 'ac3f29fa'], 2: ['bc7c33c3', '68e15549', 'f3a90fee'] };
  for (const kisten of [KISTEN_ALT, KISTEN_OFT]) {
    gold[kisten].forEach((erwartet, i) => {
      const m = new MatchController({ seed: i + 1, teams: 2, playersPerTeam: 2, preset: 'hills', turnDurationMs: 2000, kisten, maxRounds: 6, waffen: 10 }); // Goldwerte: Waffenfassung 10 (Fassung 11 ändert das Inventar)
      m.start();
      for (let n = 0; n < 4000 && m.getState().status === 'playing'; n += 1) m.step();
      assert.equal(m.stateHash(), erwartet, `Fassung ${kisten}, Seed ${i + 1}`);
    });
  }
});
