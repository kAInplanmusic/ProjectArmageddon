/**
 * Match-Regel-Konfiguration für ProjectArmageddon.
 * Enthält Timer, Sudden-Death-Parameter und Mahlstrom-Konfiguration.
 */
import { SIMULATION_HZ } from './network.js';

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
  /*
   * Das Match endet, wenn es entschieden ist — nicht nach einer festen Rundenzahl
   * (Entscheidung des Auftraggebers, 2026-10-13: „Matchdauer so lang bis aus").
   *
   * Dass es endet, sichert der Mahlstrom (Valhalla): Er zieht die Karte Runde für
   * Runde zusammen, und wer außerhalb der Zone steht, verliert je Zug 15 % seiner
   * Gesundheit. Ist die Karte ganz zusammengezogen, steht jede Figur im Gift.
   *
   * `roundLimitBackstop` ist NUR ein Netz für den Fall, dass das nicht greift
   * (ein Fehler im Motor): Danach entscheidet die Restgesundheit, wie früher bei
   * der alten Rundengrenze. Im Spiel wird er nicht erreicht — gemessen endet auch
   * ein Match ohne jeden Schuss durch den Mahlstrom lange vorher.
   */
  roundLimitBackstop: 300,

  suddenDeath: Object.freeze({
    /*
     * Valhalla: wann der Mahlstrom beginnt.
     *
     * Entscheidung des Auftraggebers (2026-10-13): ZUFÄLLIG zwischen 6 und 12
     * Minuten Spielzeit — nicht mehr ab einer festen Runde (vorher Runde 8). Mit
     * der Rundenzahl hing der Beginn von der Zahl der Figuren ab (bei 8 Figuren
     * dauert Runde 8 über 20 Minuten, bei 2 knapp vier); die Spielzeit gilt für
     * jede Matchgröße gleich.
     *
     * - ZUFÄLLIG, aber nicht würfelnd: Der Zeitpunkt wird einmal aus dem Match-Seed
     *   gezogen (eigener Zweig `VALHALLA`). Derselbe Seed ergibt denselben
     *   Zeitpunkt — Replays und Wiederherstellung bleiben exakt.
     * - SPIELZEIT = Simulationszeit seit Matchbeginn (Ticks / 60), nicht die Uhr.
     * - Der Beginn wird zu Beginn der nächsten RUNDE wirksam (die Karte zieht sich
     *   pro Runde zusammen). Verspätung also höchstens eine Rundenlänge.
     * - Die Spieler erfahren den Zeitpunkt nicht vorher; die Ziehung ist geheim.
     */
    valhallaMinSeconds: 360,
    valhallaMaxSeconds: 720,
    /*
     * Das Vorzeichen (Omen): Zufällig zwischen 60 und 1 Sekunde VOR Valhalla
     * erscheinen zwei Raben im Blitz am Himmel und schauen auf das Schlachtfeld
     * (Entscheidung des Auftraggebers, 2026-10-13). Der Zeitpunkt wird wie der
     * Beginn selbst aus dem Seed gezogen — die einzige Warnung, die die Spieler
     * bekommen, und sie kommt unberechenbar.
     */
    valhallaOmenMaxLeadSeconds: 60,
    valhallaOmenMinLeadSeconds: 1,
    toxicRainMaxHpPercentPerTurn: 15,
    knockbackPercentBonus: 100,
    /*
     * Tempo (Entscheidung des Auftraggebers, 2026-10-13): Je Figur, die in der
     * Vorrunde gefallen ist, zieht sich der Sturm einen ZUSÄTZLICHEN Schritt zusammen
     * — 1 + Gefallene, höchstens `maxContractionSteps` (also 1–4 Schritte je Runde).
     * Zugleich wächst der Rückstoß mit jeder Sturmrunde (`knockbackPercentBonusPerRound`,
     * gedeckelt bei `knockbackPercentBonusMax`): lange Matches enden schneller.
     */
    maxContractionSteps: 4,
    knockbackPercentBonusPerRound: 25,
    knockbackPercentBonusMax: 300,
    terrainContractionPixelsPerRound: 32,
    outOfZoneDamageBase: 10,
    outOfZoneGrowthFactor: 1.5
  })
});

/**
 * Zeitpunkt (in Ticks seit Matchbeginn), zu dem Valhalla beginnt.
 *
 * Gleichverteilt über ganze Sekunden zwischen `valhallaMinSeconds` und
 * `valhallaMaxSeconds` (beide eingeschlossen).
 *
 * @param {{nextInt:(min:number, max:number)=>number}} rng - der Zweig `VALHALLA`
 * @param {object} [rules=MATCH_RULES.suddenDeath]
 * @returns {number} Ticks
 */
export function drawValhallaTick(rng, rules = MATCH_RULES.suddenDeath) {
  const sekunden = rng.nextInt(rules.valhallaMinSeconds, rules.valhallaMaxSeconds);
  return sekunden * SIMULATION_HZ;
}

/**
 * Wann die Raben erscheinen: Tick des Vorzeichens und ein Bildseed für die Darstellung.
 *
 * Wird NACH `drawValhallaTick` aus DEMSELBEN Zweig gezogen — die erste Ziehung
 * (der Beginn) bleibt dadurch unverändert.
 *
 * @param {{nextInt:(min:number, max:number)=>number}} rng - derselbe Zweig `VALHALLA`
 * @param {number} valhallaTick - Ergebnis von `drawValhallaTick`
 * @param {object} [rules=MATCH_RULES.suddenDeath]
 * @returns {{tick:number, vorlaufSekunden:number, bildSeed:number}}
 */
export function drawValhallaOmen(rng, valhallaTick, rules = MATCH_RULES.suddenDeath) {
  const vorlaufSekunden = rng.nextInt(rules.valhallaOmenMinLeadSeconds, rules.valhallaOmenMaxLeadSeconds);
  const bildSeed = rng.nextInt(1, 0x7fffffff);
  return { tick: Math.max(0, valhallaTick - vorlaufSekunden * SIMULATION_HZ), vorlaufSekunden, bildSeed };
}

/**
 * Schaden des Mahlstroms in der n-ten Runde UNTER dem Sturm.
 *
 * @param {number} roundsSinceStart - 0 in der Runde, in der Valhalla beginnt
 */
export function computeMaelstromDamage(roundsSinceStart, rules = MATCH_RULES.suddenDeath) {
  const n = Number(roundsSinceStart);
  if (!Number.isFinite(n) || n < 0) return 0;
  return rules.outOfZoneDamageBase * (rules.outOfZoneGrowthFactor ** n);
}

/** Schritte der Kontraktion in dieser Runde: 1 + Gefallene der Vorrunde, höchstens `maxContractionSteps`. */
export function computeContractionSteps(gefallene, rules = MATCH_RULES.suddenDeath) {
  const n = Math.max(0, Math.floor(Number(gefallene) || 0));
  return Math.min(rules.maxContractionSteps, 1 + n);
}

/** Rückstoß-Bonus in Prozent in der n-ten Sturmrunde (0 = erste). */
export function computeKnockbackBonusPercent(roundsSinceStart, rules = MATCH_RULES.suddenDeath) {
  const n = Math.max(0, Math.floor(Number(roundsSinceStart) || 0));
  return Math.min(rules.knockbackPercentBonusMax, rules.knockbackPercentBonus + n * rules.knockbackPercentBonusPerRound);
}
