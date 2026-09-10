import assert from 'node:assert/strict';
import test from 'node:test';
import { SeededRandom } from '../src/shared/prng.js';
import {
  LOOT_DROP_RULES,
  createPseudoRandomDropState,
  getRareChanceWithPrd,
  weightedRarity,
  rollCrateCount,
  rollCrateContents,
  rollGamechanger,
  createLootSeedManager,
  getLootRng,
} from '../src/shared/config/loot.js';

test('Loot rolls are deterministic for the same seed', () => {
  const roll = seed => {
    const rng = new SeededRandom(seed);
    const state = createPseudoRandomDropState();
    return Array.from({ length: 25 }, () => ({
      count: rollCrateCount(rng),
      contents: rollCrateContents(rng),
      rarity: weightedRarity(rng, { standard: 55, enhanced: 30, premium: 10, epic: 5 }),
      gamechanger: rollGamechanger(rng, state),
      dudStreak: state.dudStreak,
    }));
  };
  assert.deepEqual(roll(1234), roll(1234));
  assert.notDeepEqual(roll(1234), roll(1235));
});

test('Loot probability helpers respect configured categories', () => {
  const rng = new SeededRandom(99);
  for (let i = 0; i < 100; i++) {
    assert.ok(['none', 'one', 'two'].includes(rollCrateCount(rng)));
    assert.ok(Object.keys(LOOT_DROP_RULES.contents).includes(rollCrateContents(rng)));
    assert.ok(LOOT_DROP_RULES.rarities.includes(weightedRarity(rng, { standard: 1, enhanced: 2, premium: 3, epic: 4 })));
  }
  assert.equal(getRareChanceWithPrd(0.05, 0), 0.05);
  assert.equal(getRareChanceWithPrd(0.05, 20), 1);
});

test('Gamechanger PRD resets on success and increases after misses', () => {
  const state = createPseudoRandomDropState();
  const rng = { values: [0.99, 0], next() { return this.values.shift(); } };
  assert.equal(rollGamechanger(rng, state), false);
  assert.equal(state.dudStreak, 1);
  assert.equal(rollGamechanger(rng, state), true);
  assert.equal(state.dudStreak, 0);
});

test('Loot seed manager isolates the loot stream', () => {
  const managerA = createLootSeedManager(77);
  const managerB = createLootSeedManager(77);
  const lootA = getLootRng(managerA);
  const lootB = getLootRng(managerB);
  assert.equal(lootA, managerA.getSubRng('LOOT'));
  assert.deepEqual(
    Array.from({ length: 10 }, () => lootA.next()),
    Array.from({ length: 10 }, () => lootB.next()),
  );
});
