/**
 * Match-Regel-Konfiguration für ProjectArmageddon.
 * Enthält Timer, Sudden-Death-Parameter und Mahlstrom-Konfiguration.
 */
export const MATCH_RULES = Object.freeze({
  /*
   * Maße des Spiels.
   *
   * FUND (belegt, Code-Audit): Hier stand `teamSize: {minimum: 4, maximum: 6}`
   * — mit NULL Lesestellen (gemessen). Die geltende Regel steht in
   * `server/lobby.js:36`: `playersPerTeam` muss zwischen 1 und 3 liegen.
   *
   * Die beiden Angaben WIDERSPRECHEN sich: Die Konfiguration verspricht 4–6
   * Spieler je Team, der Server lehnt alles über 3 ab. Wer hier nachschlägt,
   * bekommt eine falsche Antwort.
   *
   * Die Felder sind entfernt, weil sie meine Erwartung nicht steuern. Die
   * geltende Grenze steht dort, wo sie durchgesetzt wird (Lobby-Validierung) —
   * und ein Test hält fest, dass beide nicht wieder auseinanderlaufen
   * (`tests/match-rules.test.js`).
   */
  gameplayDimension: '2d',
  visualsDimension: '2.5d',

  /*
   * Zugzeiten.
   *
   * FUND (belegt, User-Flow-Audit): `maximum` hatte NULL Leser — der Motor
   * liest ausschließlich `.minimum` (match.js:311, turnSystem.js:145,148).
   *
   * Die Obergrenzen sind deshalb entfernt: Eine Zahl, die eine Grenze
   * verspricht, die nie geprüft wird, ist irreführend. Die Zugdauer ergibt sich
   * aus der Spielerzahl; wer sie anheben will, ändert `minimum`.
   */
  turnTimers: Object.freeze({
    duelSeconds: Object.freeze({ seconds: 30 }),
    fourPlayerSeconds: Object.freeze({ seconds: 20 }),
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
