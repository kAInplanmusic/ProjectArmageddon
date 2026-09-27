import assert from 'node:assert/strict';
import test from 'node:test';
import { SeededRandom } from '../src/shared/prng.js';
import { WEAPONS } from '../src/shared/config/weapons.js';
import { RARITY_IDS, RARITY_WEIGHTS } from '../src/engine/systems/lootSystem.js';
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

/*
 * ============ WACHE: der bewusste Zustand der Kisten-Seltenheit ============
 *
 * Diese Tests sind KEINE Qualitaetsaussage -- sie halten einen ENTSCHIEDENEN
 * Zustand fest, damit er nicht versehentlich kippt.
 *
 * Hintergrund (gemessen 2026-09-27): `RARITY_WEIGHTS` ist nach `powerTier`
 * benannt, `RARITY_IDS` traegt die vier `rarity`-Namen. Nur 'epic' kommt in
 * beiden vor. Eine vereinheitlichende Fassung wurde gebaut und auf Wunsch des
 * Auftraggebers ZURUECKGENOMMEN, weil sie das Spielgefuehl der Kisten aendert
 * (Kisten waren vorher immer 'epic', danach 55/25/12/6/2 %).
 *
 * Faellt einer dieser Tests, hat jemand das Spielgefuehl geaendert. Dann ist das
 * eine Entscheidung, keine Regression -- und der Replay-Hash wandert mit
 * (gemessen 9ec63e8c -> 384c51cf auf Seed 20260910).
 */
test('WACHE: RARITY_IDS ist die Katalog-Liste, keine zweite Kopie', () => {
  assert.equal(RARITY_IDS, LOOT_DROP_RULES.rarities,
    'RARITY_IDS muss die Liste aus LOOT_DROP_RULES sein -- ein zweites Literal '
    + 'laeuft sonst auseinander');
  assert.deepEqual([...RARITY_IDS], ['standard', 'enhanced', 'premium', 'epic']);
});

test('WACHE: Rundenkisten ziehen bewusst immer "epic" (Namensraum-Mismatch ist entschieden)', () => {
  const rng = new SeededRandom(4242);
  const namen = new Set();
  for (let i = 0; i < 5000; i += 1) namen.add(weightedRarity(rng, RARITY_WEIGHTS, RARITY_IDS));

  assert.deepEqual([...namen], ['epic'],
    'Die Ziehung faellt immer auf "epic", weil nur dieser Name in beiden Listen '
    + 'vorkommt. Andere Namen hier = der Namensraum wurde vereinheitlicht; dann '
    + 'ist das Spielgefuehl der Kisten geaendert und der Replay-Hash wandert mit.');
  assert.equal(RARITY_IDS.indexOf('epic'), 3, 'epic liegt auf Index 3');
});

test('WACHE: abgeworfene Waffen tragen Seltenheit 0 (kein Waffenname liegt in RARITY_IDS)', () => {
  const indizes = new Set(WEAPONS.map(w => Math.max(0, RARITY_IDS.indexOf(w.rarity))));
  assert.deepEqual([...indizes], [0],
    'Alle Waffen-Seltenheiten liegen ausserhalb von RARITY_IDS. Andere Indizes '
    + 'hier = ein Namensraum wurde angeglichen.');
});
