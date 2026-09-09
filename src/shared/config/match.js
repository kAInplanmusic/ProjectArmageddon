/**
 * Match-Regel-Konfiguration für ProjectArmageddon.
 * Enthält Timer, Sudden-Death-Parameter und Mahlstrom-Konfiguration.
 */
export const MATCH_RULES = Object.freeze({
  gameplayDimension: '2d',
  visualsDimension: '2.5d',
  teamSize: Object.freeze({
    minimum: 4,
    maximum: 6
  }),
  turnTimers: Object.freeze({
    duelSeconds: Object.freeze({
      minimum: 30,
      maximum: 60
    }),
    fourPlayerSeconds: Object.freeze({
      minimum: 20,
      maximum: 40
    })
  }),
  suddenDeath: Object.freeze({
    roundBreakpoint: 15,
    toxicRainMaxHpPercentPerTurn: 15,
    knockbackPercentBonus: 100,
    terrainContractionPixelsPerRound: 32,
    outOfZoneDamageBase: 10,
    outOfZoneGrowthFactor: 1.5
  })
});

export function computeMaelstromDamage(roundNumber, rules = MATCH_RULES.suddenDeath) {
  if (roundNumber < rules.roundBreakpoint) {
    return 0;
  }
  return rules.outOfZoneDamageBase * (rules.outOfZoneGrowthFactor ** (roundNumber - rules.roundBreakpoint));
}
