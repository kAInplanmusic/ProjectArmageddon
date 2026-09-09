/**
 * Allgemeine Spielregeln für ProjectArmageddon.
 */
export const GAME_RULES = Object.freeze({
  dimension: '2d',
  maxPlayers: 8,
  minPlayers: 2,
  teamSize: Object.freeze({
    minimum: 4,
    maximum: 6
  }),
  turnDurationSeconds: 30,
  matchDurationRounds: 20,
  deterministic: true
});
