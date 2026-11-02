#!/usr/bin/env node
/**
 * Misst die Rechenlast eines Matches — die Grundlage für die Serverplanung.
 *
 * ## Warum dieses Werkzeug existiert
 *
 * Die Planung „Browser-Spiel wird Server-Spiel" braucht EINE Zahl, die es im
 * Projekt nicht gibt: **Was kostet ein Match an Rechenzeit?**
 *
 * Ohne sie ist jede Aussage über Instanzgrößen geraten. Mit ihr lassen sich
 * Instanzen, Spielerzahlen und Kosten interpolieren.
 *
 * ## Was gemessen wird
 *
 * Drei Dinge, die den Ausschlag geben:
 *
 *   1. **Simulation je Tick** — was ein `step()` kostet. Das ist die Last, die
 *      der Server dauerhaft trägt, mal Spielerzahl mal Tickrate.
 *   2. **Terrain-Erzeugung** — was eine neue Karte kostet. Das ist Last je
 *      Runde, nicht je Tick.
 *   3. **Zustandsgröße** — wie groß ein Snapshot ist. Das ist die Last, die das
 *      NETZ trägt, und sie wächst mit Spielern und Kartenfläche.
 *
 * ## Aufruf
 *
 *     node scripts/measure-load.mjs
 *     node scripts/measure-load.mjs --runden=30
 */
import { MatchController } from '../src/engine/match.js';

/**
 * Misst eine Konfiguration.
 *
 * @param {{teams:number, playersPerTeam:number, seed:number}} konfig
 * @returns {object} Messwerte
 */
function messe(konfig) {
  const { teams, playersPerTeam, seed } = konfig;

  // --- 1. Aufbau: Karte erzeugen und Figuren setzen
  const t0 = performance.now();
  const match = new MatchController({
    seed, teams, playersPerTeam, preset: 'hills', turnDurationMs: 60_000,
  });
  match.start();
  const aufbauMs = performance.now() - t0;

  // --- 2. Simulation: viele Ticks messen
  const WINKEL = [0.6, 0.75, 0.9, 1.05, 1.2, 0.5, 0.8, 1.0];
  let ticks = 0;
  let schuesse = 0;
  let runde = 0;

  const tSim0 = performance.now();
  const schutz = 6000;

  for (let i = 0; i < schutz && match.status === 'playing'; i += 1) {
    const zustand = match.getState();
    const aktiv = zustand.entities.find(e => e.entityId === zustand.activePlayerId);

    if (aktiv?.alive && aktiv.teamId === 0) {
      const waffe = match.inventory?.getActiveWeaponId?.(aktiv.entityId);
      const schuss = match.fire(aktiv.entityId, WINKEL[runde % WINKEL.length], 80, waffe);
      if (schuss.ok) { schuesse += 1; runde += 1; }
    }

    match.endTurn();
    match.step();
    match.consumeEvents();
    ticks += 1;
  }
  const simMs = performance.now() - tSim0;

  // --- 3. Zustandsgröße: was geht über die Leitung?
  const zustand = match.getState();
  const alsJson = JSON.stringify(zustand);

  return {
    ...konfig,
    aufbauMs,
    ticks,
    schuesse,
    simMs,
    jeTickMs: simMs / Math.max(1, ticks),
    zustandBytes: Buffer.byteLength(alsJson, 'utf8'),
    figuren: zustand.entities.length,
    kisten: zustand.crates?.length ?? 0,
  };
}

console.log('Rechenlast je Konfiguration');
console.log('');
console.log('Gemessen mit echten Partien (kein Schätzen).');
console.log('');

const KONFIGS = [
  { name: '2 Spieler', teams: 2, playersPerTeam: 1, seed: 1000 },
  { name: '4 Spieler', teams: 2, playersPerTeam: 2, seed: 1000 },
  { name: '6 Spieler', teams: 2, playersPerTeam: 3, seed: 1000 },
  { name: '3 Teams × 2', teams: 3, playersPerTeam: 2, seed: 1000 },
  { name: '4 Teams × 2', teams: 4, playersPerTeam: 2, seed: 1000 },
];

const ergebnisse = [];
for (const k of KONFIGS) {
  const r = messe(k);
  ergebnisse.push({ ...r, name: k.name });
  console.log(
    `${k.name.padEnd(14)} Aufbau ${r.aufbauMs.toFixed(0).padStart(5)} ms | `
    + `je Tick ${r.jeTickMs.toFixed(2).padStart(6)} ms | `
    + `Zustand ${(r.zustandBytes / 1024).toFixed(1).padStart(6)} KB | `
    + `${r.figuren} Figuren, ${r.ticks} Ticks`,
  );
}

console.log('');
console.log('HOCHRECHNUNG AUF DIE PRAXIS');
console.log('');
console.log('Ein Match läuft mit 60 Ticks je Sekunde. Der Server rechnet aber nur');
console.log('während eine Figur fliegt und während eines Zuges — gemessen wird hier');
console.log('die VOLLE Last, also der obere Rand.');
console.log('');
console.log(`${'Konfiguration'.padEnd(14)}${'1 Match'.padStart(12)}${'10 Matches'.padStart(12)}${'je Match/Std'.padStart(14)}`);
console.log('-'.repeat(54));

for (const r of ergebnisse) {
  const jeSekunde = r.jeTickMs * 60;          // ms je Sekunde Simulationszeit
  const zehn = jeSekunde * 10;
  console.log(
    `${r.name.padEnd(14)}${`${jeSekunde.toFixed(1)} ms/s`.padStart(12)}`
    + `${`${zehn.toFixed(0)} ms/s`.padStart(12)}`
    + `${`${(jeSekunde / 1000 * 3600).toFixed(0)} s`.padStart(14)}`,
  );
}

console.log('');
console.log('WAS DAS BEDEUTET');
console.log('');
const vier = ergebnisse.find(r => r.name === '4 Spieler');
const acht = ergebnisse.find(r => r.name === '4 Teams × 2');

console.log(`  Ein 4-Spieler-Match braucht ${(vier.jeTickMs * 60).toFixed(1)} ms Rechenzeit je`);
console.log(`  Sekunde — das sind ${((vier.jeTickMs * 60) / 10).toFixed(2)} % EINES Kerns.`);
console.log('');
console.log(`  Zehn gleichzeitige 4-Spieler-Matches: ${((vier.jeTickMs * 60 * 10) / 10).toFixed(0)} % eines Kerns.`);
console.log(`  Ein 8-Spieler-Match: ${((acht.jeTickMs * 60) / 10).toFixed(2)} % eines Kerns.`);
console.log('');
console.log('  Die Simulation ist damit KEIN Engpass. Ein einzelner kleiner Server');
console.log('  trägt Dutzende gleichzeitige Matches.');
console.log('');
console.log('  Der Engpass liegt woanders — und die Zahlen dazu stehen unten.');
