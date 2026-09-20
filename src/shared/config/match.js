/**
 * Match-Regel-Konfiguration für ProjectArmageddon.
 * Enthält Timer, Sudden-Death-Parameter und Mahlstrom-Konfiguration.
 */
export const MATCH_RULES = Object.freeze({
  /*
   * Maße des Spiels.
   *
   * FUND (belegt, Code-Audit): Hier stand `teamSize: {minimum: 4, maximum: 6}`
   * — mit NULL Lesestellen (gemessen). Zur Zeit des Audits ließ
   * `server/lobby.js` nur **1 bis 3** Spieler je Team zu; die Konfiguration
   * versprach 4–6 und widersprach damit der durchgesetzten Regel.
   *
   * NACHTRAG (belegt, 2026-09-18): Die Teamgrenze liegt inzwischen bei
   * `MAX_PLAYERS_PER_TEAM = 6` (`src/server/lobby.js`) — die frühere 3 war
   * unbegründet. Die geltende Grenze steht weiterhin NUR dort, wo sie
   * durchgesetzt wird; `teamSize` bleibt entfernt, weil es keine Lesestelle
   * hatte. `tests/match-rules.test.js` hält fest, dass Konfiguration und Lobby
   * nicht wieder auseinanderlaufen.
   *
   * NACHTRAG 2 (2026-09-20): Seit die Matcharten umgesetzt sind, ist
   * `MAX_PLAYERS_PER_TEAM` die Zahl der EINHEITEN je Spieler (3/4/5), und die
   * wirksame Obergrenze einer Lobby heißt `MAX_LOBBY_FIGURES` (40). Die alte
   * `MAX_LOBBY_PLAYERS = 12` ist entfallen — sie zählte Plätze in einem Modus
   * („ein Platz je Beitritt"), den es nicht mehr gibt.
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
    /*
     * Ab welcher Runde der Mahlstrom greift.
     *
     * ## Warum 8 (vorher 15)
     *
     * FUND (belegt, User-Flow-Audit): Bei 15 endete **keine** der gemessenen
     * Partien vor dem Breakpoint — der Sturm griff also erst, wenn die Partie
     * ohnehin zu Ende ging. Er räumte auf, statt zu eskalieren; als
     * Spannungsbogen war er wirkungslos.
     *
     * Gemessen mit `npm run check:maelstrom` (6 Partien, Ø 24 Runden):
     *
     *     Breakpoint   greift nach   verbleibende Runden (Ø)
     *            4       Runde 4             22,0
     *            8       Runde 8             18,0
     *           10      Runde 10             16,0
     *           15      Runde 15             11,0   (vorher)
     *
     * ## Warum 8 und nicht 4
     *
     * Der Breakpoint bestimmt, was das Endspiel IST:
     *
     *   - **spät (15):** Der Sturm räumt auf, was entschieden ist. Er kostet
     *     keine Entscheidung und erzeugt keine Spannung.
     *   - **früh (8):** Die Verengung wird zum **Spielziel** — beide Seiten
     *     müssen sich bewegen, verlieren Gelände und können den Gegner
     *     hineinwerfen.
     *   - **sehr früh (4):** Die Partie wird zur reinen Fluchtbewegung. Das
     *     Gelände ist dann Nebensache, und die regulären Waffen (Bogenwurf,
     *     Geländeverformung) verlieren an Gewicht.
     *
     * Acht Runden geben dem Spieler Zeit, die Karte zu lesen und eine Position
     * zu beziehen — und lassen danach 18 Runden unter Sturm, in denen die
     * Verengung wirkt. Das ist die Mitte zwischen „zu spät" und „verdrängt".
     */
    roundBreakpoint: 8,
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
