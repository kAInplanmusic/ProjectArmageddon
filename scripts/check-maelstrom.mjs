#!/usr/bin/env node
/**
 * Mahlstrom-Prüfung: Wann beginnt Valhalla, und wie viel vom Match steht unter dem Sturm?
 *
 * ## Was sich geändert hat (Entscheidung des Auftraggebers, 2026-10-13)
 *
 * Früher begann der Mahlstrom ab einer FESTEN Runde (`roundBreakpoint`, zuletzt 8), und
 * dieses Werkzeug verglich Kandidaten für diese Zahl. Seit dem 2026-10-13 beginnt
 * Valhalla ZUFÄLLIG zwischen 6 und 12 Minuten Spielzeit (aus dem Match-Seed gezogen),
 * und das Match läuft, bis es entschieden ist (kein Rundenlimit). Einen Breakpoint zum
 * Vergleichen gibt es nicht mehr — das Werkzeug misst deshalb nur noch, WAS passiert:
 *
 *   - Wann (Minute, Runde) beginnt der Sturm in jeder Partie?
 *   - Liegt der gezogene Zeitpunkt wirklich in 6–12 Minuten?
 *   - Wie lange dauert die Partie, und wie viele Runden stehen unter dem Sturm?
 *   - Endet jede Partie (ohne dass das Rundenlimit-Netz greift)?
 *
 * Es entscheidet nichts. Die Zahlen sind eine OBERGRENZE für echte Partien: Die
 * Test-Spieler zielen nicht.
 *
 * ## Aufruf
 *
 *     node scripts/check-maelstrom.mjs
 *     node scripts/check-maelstrom.mjs --seeds=8
 */
import { MatchController } from '../src/engine/match.js';
import { MATCH_RULES } from '../src/shared/config/match.js';
import { SIMULATION_HZ } from '../src/shared/config/network.js';

const args = new Map(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));
const ANZAHL = Number(args.get('seeds') ?? 6);
const MIN_RUNDE = MATCH_RULES.suddenDeath.valhallaMinRound;
const MAX_RUNDE = MATCH_RULES.suddenDeath.valhallaMaxRound;

/** Spielt eine Partie (nur Team 0 schießt) und protokolliert Beginn und Ende des Sturms. */
function spiele(seed) {
  const match = new MatchController({
    seed, teams: 2, playersPerTeam: 2, preset: 'hills', turnDurationMs: 20_000,
  });
  match.start();

  const WINKEL = [0.6, 0.75, 0.9, 1.05, 1.2, 0.5, 0.8, 1.0];
  let schuesse = 0;
  let sturmRunde = null;
  let sturmTick = null;
  let ticks = 0;

  while (match.status === 'playing' && ticks < 60 * 60 * 120) {
    const zustand = match.getState();
    if (sturmRunde === null && zustand.maelstrom?.active) {
      sturmRunde = zustand.round;
      sturmTick = match.world.tickCount;
    }
    const aktiv = zustand.entities.find(e => e.entityId === zustand.activePlayerId);
    if (aktiv?.alive && aktiv.teamId === 0 && match.activeProjectileCount === 0 && !match.hasFiredThisTurn) {
      const waffe = match.inventory?.getActiveWeaponId?.(aktiv.entityId);
      if (match.fire(aktiv.entityId, WINKEL[schuesse % WINKEL.length], 80, waffe).ok) schuesse += 1;
    }
    match.step();
    match.consumeEvents();
    ticks += 1;
  }

  const ende = match.getState();
  return {
    seed,
    status: match.status,
    endrunde: ende.round,
    minuten: ticks / SIMULATION_HZ / 60,
    gezogeneRunde: match.valhallaRound,
    gezogenMin: match.valhallaTick / SIMULATION_HZ / 60,
    sturmRunde,
    sturmMin: sturmTick === null ? null : sturmTick / SIMULATION_HZ / 60,
    schuesse,
  };
}

console.log(`Mahlstrom-Prüfung: ${ANZAHL} Partien (Valhalla zufällig Runde ${MIN_RUNDE}–${MAX_RUNDE})`);
console.log('');
console.log('Seed    gezogen   Sturm ab (Min / Runde)   Endrunde   Dauer (min)   Status');
console.log('-'.repeat(78));

const ergebnisse = [];
for (let i = 0; i < ANZAHL; i += 1) {
  const r = spiele(1000 + i * 137);
  ergebnisse.push(r);
  console.log(
    `${String(r.seed).padStart(4)}   ${String(r.gezogeneRunde).padStart(7)}   `
    + `${(r.sturmMin === null ? '—' : r.sturmMin.toFixed(2)).padStart(10)} / ${String(r.sturmRunde ?? '—').padEnd(6)}   `
    + `${String(r.endrunde).padStart(8)}   ${r.minuten.toFixed(1).padStart(11)}   ${r.status}`,
  );
}

const imFenster = ergebnisse.every(e => e.gezogeneRunde >= MIN_RUNDE && e.gezogeneRunde <= MAX_RUNDE);
// Der Sturm beginnt GENAU in der gezogenen Runde — oder gar nicht, dann endete die
// Partie vorher. Beides ist pruefbar, also wird beides geprueft.
const sturmPasst = ergebnisse.every(e => (e.sturmRunde === null
  ? e.endrunde < e.gezogeneRunde
  : e.sturmRunde === e.gezogeneRunde));
const alleEnden = ergebnisse.every(e => e.status === 'gameover');
const netz = ergebnisse.filter(e => e.endrunde > MATCH_RULES.roundLimitBackstop).length;
const verschieden = new Set(ergebnisse.map(e => e.gezogeneRunde)).size;

console.log('');
console.log(`Gezogene Runde in ${MIN_RUNDE}–${MAX_RUNDE}:  ${imFenster ? 'ja' : 'NEIN'}   (${verschieden} verschiedene Werte bei ${ANZAHL} Partien)`);
console.log(`Sturm beginnt genau in der gezogenen Runde (oder die Partie endet vorher):  ${sturmPasst ? 'ja' : 'NEIN'}`);
console.log(`Alle Partien enden von selbst:  ${alleEnden ? 'ja' : 'NEIN'}`);
console.log(`Rundenlimit-Netz (${MATCH_RULES.roundLimitBackstop}) erreicht:  ${netz} von ${ANZAHL}`);
process.exit(imFenster && sturmPasst && alleEnden && netz === 0 ? 0 : 1);
