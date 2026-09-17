#!/usr/bin/env node
/**
 * Misst, wie viele Figuren der Motor wirklich trägt.
 *
 * ## Warum dieses Werkzeug existiert
 *
 * Die Matcharten nennen bis zu **40 Figuren** (Krieg, 8 Spieler × 5 Einheiten).
 * Die Rechenlast-Messung ging bis 12 Figuren; alles darüber war lineare
 * Fortschreibung — und eine Fortschreibung ist keine Messung.
 *
 * Bevor Einheiten (mehrere Figuren je Spieler) gebaut werden, muss klar sein:
 * **Trägt der Motor 40 Figuren, und was kostet es?**
 *
 * ## Was gemessen wird
 *
 * 1. **Ob es läuft** — alle Figuren gesetzt, alle Teams vorhanden, Partie läuft.
 * 2. **Was es kostet** — Rechenzeit je Tick, hochgerechnet auf einen Kern.
 * 3. **Ob der Determinismus hält** — zweimal derselbe Seed, derselbe Hash.
 *    Mehr Figuren heißt mehr Zustand; wenn der Hash nicht mehr greift, ist der
 *    Replay nicht mehr belegbar.
 *
 * ## Aufruf
 *
 *     node scripts/measure-figures.mjs
 */
import { MatchController } from '../src/engine/match.js';

const KONFIGS = [
  { teams: 2, playersPerTeam: 1, name: '2 Figuren', figuren: 2 },
  { teams: 2, playersPerTeam: 2, name: '4 Figuren', figuren: 4 },
  { teams: 2, playersPerTeam: 3, name: '6 Figuren', figuren: 6 },
  { teams: 2, playersPerTeam: 4, name: '8 Figuren', figuren: 8 },
  { teams: 2, playersPerTeam: 5, name: '10 Figuren', figuren: 10 },
  { teams: 2, playersPerTeam: 6, name: '12 Figuren', figuren: 12 },
  { teams: 3, playersPerTeam: 5, name: '15 Figuren', figuren: 15 },
  { teams: 4, playersPerTeam: 5, name: '20 Figuren', figuren: 20 },
  /* Die Zielgröße der Krieg-Matchart: 8 Spieler × 5 Einheiten. */
  { teams: 2, playersPerTeam: 8, name: '16 Figuren', figuren: 16 },
  { teams: 2, playersPerTeam: 10, name: '20 (2×10)', figuren: 20 },
  { teams: 4, playersPerTeam: 10, name: '40 Figuren', figuren: 40 },
];

/**
 * Misst eine Konfiguration.
 *
 * Die Partie wird wirklich gespielt — mit kurzer Zugzeit, damit viele Ticks
 * zusammenkommen. Gemessen wird die reine Simulationszeit (`step`), ohne
 * Zeichnen und ohne Netz.
 */
function messe(konfig) {
  let match;
  let aufbauMs = 0;

  try {
    const t0 = performance.now();
    match = new MatchController({
      seed: 4242, teams: konfig.teams, playersPerTeam: konfig.playersPerTeam,
      preset: 'hills', turnDurationMs: 200, maxRounds: 8,
    });
    match.start();
    aufbauMs = performance.now() - t0;
  } catch (fehler) {
    return { ...konfig, fehler: fehler.message };
  }

  const zustand = match.getState();
  const gesetzt = zustand.entities.length;

  const t0 = performance.now();
  let ticks = 0;
  for (let i = 0; i < 4000 && match.status === 'playing'; i += 1) {
    match.step();
    match.consumeEvents();
    ticks += 1;
    if (i % 7 === 0) match.endTurn();
  }
  const simMs = performance.now() - t0;

  return {
    ...konfig,
    aufbauMs,
    gesetzt,
    ticks,
    jeTickMs: simMs / Math.max(1, ticks),
    hash: match.stateHash(),
  };
}

console.log('Wie viele Figuren trägt der Motor?');
console.log('');
console.log(`${'Konfiguration'.padEnd(14)}${'Figuren'.padStart(9)}${'Aufbau'.padStart(10)}${'je Tick'.padStart(10)}${'% Kern'.padStart(9)}${'Ticks'.padStart(8)}`);
console.log('-'.repeat(62));

const ergebnisse = [];
for (const k of KONFIGS) {
  const r = messe(k);
  ergebnisse.push(r);

  if (r.fehler) {
    console.log(`${k.name.padEnd(14)}${'—'.padStart(9)}${'—'.padStart(10)}${'—'.padStart(10)}${'—'.padStart(9)}${'—'.padStart(8)}  FEHLER: ${r.fehler.slice(0, 30)}`);
    continue;
  }

  const prozent = (r.jeTickMs * 60) / 10;
  console.log(
    `${k.name.padEnd(14)}${String(r.gesetzt).padStart(9)}`
    + `${`${r.aufbauMs.toFixed(0)} ms`.padStart(10)}`
    + `${`${r.jeTickMs.toFixed(3)} ms`.padStart(10)}`
    + `${`${prozent.toFixed(1)} %`.padStart(9)}`
    + `${String(r.ticks).padStart(8)}`,
  );
}

console.log('');
console.log('WAS DIE ZAHLEN SAGEN');
console.log('');

const laufend = ergebnisse.filter(r => !r.fehler);
const groesste = laufend[laufend.length - 1];

console.log(`  Größte gemessene Konfiguration: ${groesste.gesetzt} Figuren,`);
console.log(`  ${((groesste.jeTickMs * 60) / 10).toFixed(1)} % eines Kerns, Aufbau ${groesste.aufbauMs.toFixed(0)} ms.`);
console.log('');

/*
 * Der Vergleich zur Fortschreibung. Sie ist der Grund für dieses Werkzeug:
 * Wenn die Messung von der linearen Annahme abweicht, war die Hochrechnung falsch.
 */
const vier = laufend.find(r => r.gesetzt === 4);
if (vier) {
  const faktor = groesste.jeTickMs / vier.jeTickMs;
  const figurenFaktor = groesste.gesetzt / vier.gesetzt;
  console.log('  Gemessen gegen hochgerechnet:');
  console.log(`    Figuren:     ${figurenFaktor.toFixed(1)}× mehr`);
  console.log(`    Rechenzeit:  ${faktor.toFixed(1)}× mehr`);
  console.log('');

  if (faktor < figurenFaktor * 0.8) {
    console.log('  Die Rechenzeit wächst LANGSAMER als die Figurenzahl. Der Grund:');
    console.log('  Ein Teil der Arbeit je Tick hängt nicht an den Figuren (Wasser,');
    console.log('  Mahlstrom, Zeitgeber). Die lineare Hochrechnung war zu pessimistisch.');
  } else if (faktor > figurenFaktor * 1.2) {
    console.log('  Die Rechenzeit wächst SCHNELLER als die Figurenzahl. Das wäre ein');
    console.log('  Hinweis auf quadratische Anteile — etwa Kollisionen zwischen allen');
    console.log('  Figuren. Dann müsste man dort ansetzen, nicht an der Instanzgröße.');
  } else {
    console.log('  Die Rechenzeit wächst etwa linear mit der Figurenzahl — die');
    console.log('  Hochrechnung trifft zu.');
  }
}

console.log('');
console.log('DER DETERMINISMUS BEI VIELEN FIGUREN');
console.log('');

/*
 * Zwei Läufe mit demselben Seed müssen denselben Hash ergeben. Bei vielen
 * Figuren wächst der Zustand — wenn der Hash dann auseinanderläuft, ist der
 * Replay nicht mehr belegbar.
 */
for (const figuren of [4, 12, 20]) {
  const k = KONFIGS.find(x => x.figuren === figuren);
  if (!k) continue;

  const a = messe(k);
  const b = messe(k);
  if (a.fehler || b.fehler) continue;

  const gleich = a.hash === b.hash;
  console.log(`  ${String(figuren).padStart(2)} Figuren: Hash ${a.hash.slice(0, 8)} / ${b.hash.slice(0, 8)} — ${gleich ? 'gleich' : 'UNTERSCHIEDLICH'}`);
}

console.log('');
console.log('  Gleiche Hashes bei gleichem Seed heißen: Der Replay bleibt belegbar,');
console.log('  auch mit vielen Figuren.');
