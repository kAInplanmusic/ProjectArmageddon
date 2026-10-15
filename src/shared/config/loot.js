/**
 * Loot-System für ProjectArmageddon.
 *
 * Wichtigkeit: Alle Zufallsoperationen müssen über einen deterministischen PRNG
 * laufen, der vom Server verteilt wird. KEIN Math.random() im Simulationspfad!
 */

import { MatchSeedManager } from '../seed.js';
import { KISTEN_ALT, KISTEN_STANDARD, KISTEN_MAX_AUF_KARTE } from './kisten.js';

export const LOOT_DROP_RULES = Object.freeze({
  /** Kistenfassung 2 (Standard, `config/kisten.js`): im Mittel 1,6 Kisten je Runde. */
  cratesPerRoundStart: Object.freeze({
    none: 0.05,
    one: 0.45,
    two: 0.35,
    three: 0.15
  }),
  /** Kistenfassung 1 (Altaufzeichnungen): im Mittel 0,95 Kisten je Runde. */
  cratesPerRoundStartAlt: Object.freeze({
    none: 0.10,
    one: 0.85,
    two: 0.05
  }),
  /** Höchstzahl unaufgehobener Kisten gleichzeitig auf der Karte (Fassung 2). */
  maxCratesOnMap: KISTEN_MAX_AUF_KARTE,
  contents: Object.freeze({
    weapons: 0.55,
    sustain: 0.30,
    empty: 0.10,
    trap: 0.05
  }),
  rarities: Object.freeze(['standard', 'enhanced', 'premium', 'epic']),
  gamechangerMatchRate: Object.freeze({
    minimum: 0.05,
    maximum: 0.10
  }),
  rarityColors: Object.freeze({
    standard: '#ffffff',
    enhanced: '#3b82f6',
    premium: '#a855f7',
    epic: '#fbbf24'
  })
});

export function createPseudoRandomDropState() {
  return {
    dudStreak: 0
  };
}

export function getRareChanceWithPrd(baseChance, dudStreak) {
  return Math.min(1, baseChance + dudStreak * baseChance);
}

export function weightedRarity(rng, weights, rarities = LOOT_DROP_RULES.rarities) {
  if (!rng || typeof rng.nextIntBelow !== 'function') {
    throw new TypeError('Ein SeededRandom-Instanz (rng) ist erforderlich');
  }
  if (!rarities || rarities.length === 0) {
    throw new Error('rarities darf nicht leer sein');
  }

  const weightArray = rarities.map(r => weights[r] || 0);
  const totalWeight = weightArray.reduce((sum, w) => sum + w, 0);

  if (totalWeight <= 0) {
    const randomIndex = rng.nextIntBelow(rarities.length);
    return rarities[randomIndex];
  }

  const threshold = rng.next() * totalWeight;
  let cumulative = 0;

  for (let i = 0; i < weightArray.length; i++) {
    cumulative += weightArray[i];
    if (threshold < cumulative) {
      return rarities[i];
    }
  }

  return rarities[rarities.length - 1];
}

export function rollCrateCount(rng, kisten = KISTEN_STANDARD) {
  const r = rng.next();
  const raten = kisten === KISTEN_ALT ? LOOT_DROP_RULES.cratesPerRoundStartAlt : LOOT_DROP_RULES.cratesPerRoundStart;

  if (r < raten.none) {
    return 'none';
  }
  const afterNone = raten.none + raten.one;
  if (r < afterNone) {
    return 'one';
  }
  const afterOne = afterNone + raten.two;
  if (kisten === KISTEN_ALT || r < afterOne) {
    return 'two';
  }
  return 'three';
}

export function rollCrateContents(rng) {
  const r = rng.next();
  const { contents } = LOOT_DROP_RULES;

  if (r < contents.weapons) {
    return 'weapons';
  }
  const afterWeapons = contents.weapons + contents.sustain;
  if (r < afterWeapons) {
    return 'sustain';
  }
  const afterSustain = afterWeapons + contents.empty;
  if (r < afterSustain) {
    return 'empty';
  }
  return 'trap';
}

export function rollGamechanger(rng, dropState) {
  const { minimum, maximum } = LOOT_DROP_RULES.gamechangerMatchRate;

  const currentRate = Math.min(maximum, minimum + dropState.dudStreak * 0.01);
  const prdChance = getRareChanceWithPrd(currentRate, dropState.dudStreak);
  const rolled = rng.next();

  if (rolled < prdChance) {
    dropState.dudStreak = 0;
    return true;
  }

  dropState.dudStreak++;
  return false;
}

export function createLootSeedManager(matchSeed) {
  return new MatchSeedManager(matchSeed);
}

export function getLootRng(seedManager) {
  if (!(seedManager instanceof MatchSeedManager)) {
    throw new TypeError('Ein MatchSeedManager-Instanz ist erforderlich');
  }
  return seedManager.getSubRng('LOOT');
}
