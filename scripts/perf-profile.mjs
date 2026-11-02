#!/usr/bin/env node
/**
 * Performance-Profil eines Headless-Matches.
 *
 * Misst die Simulationskosten ohne Rendering: Ticks pro Sekunde, Speicher-
 * verbrauch und die Verteilung der Tick-Dauer. Das ist die Grundlage, um zu
 * beurteilen, ob das 60-Hz-Budget (16,7 ms pro Tick) eingehalten wird.
 *
 * Aufruf:
 *   node scripts/perf-profile.mjs [--ticks=N] [--seed=N] [--teams=N] [--players=N]
 *                                 [--preset=NAME] [--shots=N] [--json]
 */
import { MatchController } from '../src/engine/match.js';

function parseArgs(argv) {
  const args = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const [key, value] = token.slice(2).split('=');
    args[key] = value === undefined ? true : value;
  }
  return args;
}

function num(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const args = parseArgs(process.argv.slice(2));
const targetTicks = num(args.ticks, 18_000); // 5 Minuten bei 60 Hz
const seed = num(args.seed, 20260910);
const teams = num(args.teams, 2);
const playersPerTeam = num(args.players, 2);
const preset = args.preset ?? 'hills';
const maxShots = num(args.shots, 2000);
const asJson = Boolean(args.json);

const frameBudgetMs = 1000 / 60;
const samples = [];
let shots = 0;
let ticks = 0;
let peakHeap = 0;
let matchesRun = 0;
let lastMatch = null;
const roundsSeen = [];

/**
 * Ein Match endet, sobald ein Team ausgeschaltet ist — oft nach wenigen
 * Sekunden. Für ein belastbares Profil werden deshalb mehrere Matches
 * nacheinander simuliert, bis das Tickziel erreicht ist. Jedes Match erhält
 * einen eigenen Seed, damit sich die Messung nicht auf eine Karte beschränkt.
 */
function createMatch(index) {
  const match = new MatchController({
    seed: seed + index * 7919,
    teams,
    playersPerTeam,
    preset,
    maxRounds: 30,
  });
  match.start();
  return match;
}

let match = createMatch(0);
matchesRun = 1;

const wallStart = process.hrtime.bigint();

while (ticks < targetTicks) {
  // Match beendet: Runde festhalten und ein frisches Match beginnen, bis das
  // Tickziel erreicht ist. So misst das Profil durchgehende Simulationslast.
  if (match.status !== 'playing') {
    roundsSeen.push(match.round);
    lastMatch = match;
    match = createMatch(matchesRun);
    matchesRun += 1;
    continue;
  }

  const state = match.getState();

  // Regelmäßig feuern, damit Projektile, Kollisionen und Terrain-Krater
  // tatsächlich im Messpfad liegen.
  if (state.activePlayerId !== null && state.turnElapsedMs < 16 && shots < maxShots) {
    const angle = Math.PI / 4 + (shots % 11) * 0.04;
    const power = 50 + (shots % 7) * 7;
    if (match.fire(state.activePlayerId, angle, power).ok) shots += 1;
  }

  const tickStart = process.hrtime.bigint();
  match.step();
  match.consumeEvents();
  const tickEnd = process.hrtime.bigint();

  samples.push(Number(tickEnd - tickStart) / 1e6);
  ticks += 1;

  if (ticks % 500 === 0) {
    global.gc?.();
    peakHeap = Math.max(peakHeap, process.memoryUsage().heapUsed);
  }
}

const wallEnd = process.hrtime.bigint();
const wallMs = Number(wallEnd - wallStart) / 1e6;
peakHeap = Math.max(peakHeap, process.memoryUsage().heapUsed);
if (lastMatch === null) lastMatch = match;

samples.sort((a, b) => a - b);
const percentile = p => samples.length === 0 ? 0 : samples[Math.min(samples.length - 1, Math.floor(samples.length * p))];
const mean = samples.reduce((sum, value) => sum + value, 0) / Math.max(1, samples.length);
const overBudget = samples.filter(value => value > frameBudgetMs).length;

const report = {
  konfiguration: { seed, teams, playersPerTeam, preset, maxRounds: match.maxRounds },
  ergebnis: {
    ticks,
    schuesse: shots,
    matches: matchesRun,
    rundenProMatch: roundsSeen.length > 0
      ? Number((roundsSeen.reduce((sum, value) => sum + value, 0) / roundsSeen.length).toFixed(1))
      : lastMatch.round,
    letzterZustandshash: lastMatch.stateHash(),
  },
  laufzeit: {
    wanduhrMs: Math.round(wallMs),
    ticksProSekunde: Math.round((ticks / wallMs) * 1000),
  },
  tickDauerMs: {
    mittel: Number(mean.toFixed(4)),
    p50: Number(percentile(0.5).toFixed(4)),
    p95: Number(percentile(0.95).toFixed(4)),
    p99: Number(percentile(0.99).toFixed(4)),
    maximum: Number(samples[samples.length - 1]?.toFixed(4) ?? 0),
    budget: Number(frameBudgetMs.toFixed(4)),
    ticksUeberBudget: overBudget,
    anteilUeberBudget: Number(((overBudget / Math.max(1, samples.length)) * 100).toFixed(2)),
  },
  speicher: {
    heapUsedMB: Number((peakHeap / 1024 / 1024).toFixed(1)),
    rssMB: Number((process.memoryUsage().rss / 1024 / 1024).toFixed(1)),
  },
};

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log('Performance-Profil (Headless, ohne Rendering)');
  console.log(`  Konfiguration : ${teams} Teams x ${playersPerTeam}, Karte ${preset}, Seed ${seed}`);
  console.log(`  Simuliert     : ${ticks} Ticks (${(ticks / 60).toFixed(1)} s Spielzeit), ${shots} Schüsse`);
  console.log(`  Matches       : ${report.ergebnis.matches} (Ø ${report.ergebnis.rundenProMatch} Runden pro Match)`);
  console.log(`  Wanduhr       : ${report.laufzeit.wanduhrMs} ms → ${report.laufzeit.ticksProSekunde} Ticks/s`);
  console.log(`  Tick-Dauer    : mittel ${report.tickDauerMs.mittel} ms | p95 ${report.tickDauerMs.p95} ms | p99 ${report.tickDauerMs.p99} ms | max ${report.tickDauerMs.maximum} ms`);
  console.log(`  Budget        : ${report.tickDauerMs.budget} ms/Tick (60 Hz)`);
  console.log(`  Über Budget   : ${overBudget} Ticks (${report.tickDauerMs.anteilUeberBudget} %)`);
  console.log(`  Speicher      : Heap ${report.speicher.heapUsedMB} MB, RSS ${report.speicher.rssMB} MB`);

  const echteSpielzeit = ticks / 60;
  console.log(`  Echtzeitfaktor: ${(echteSpielzeit / (wallMs / 1000)).toFixed(1)}x (Simulation läuft schneller als Echtzeit)`);

  const ok = overBudget / Math.max(1, samples.length) < 0.01;
  console.log(ok
    ? '  ERGEBNIS: Simulationsbudget wird eingehalten (< 1 % der Ticks über 16,7 ms).'
    : '  ERGEBNIS: Budget wird überschritten — Optimierung nötig (siehe MASTERDOTO.md).');
}

// Exit-Code spiegelt das Budget, damit das Skript in CI als Gate nutzbar ist.
process.exit(overBudget / Math.max(1, samples.length) < 0.05 ? 0 : 1);
