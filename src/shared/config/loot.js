export const LOOT_DROP_RULES = Object.freeze({
  cratesPerRoundStart: Object.freeze({
    none: 0.10,
    one: 0.85,
    two: 0.05
  }),
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
