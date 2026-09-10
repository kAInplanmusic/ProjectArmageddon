#!/usr/bin/env node
/**
 * Replay-Werkzeug: zeichnet ein Match auf und spielt es wieder ab.
 *
 * Aufrufe:
 *   node scripts/replay.mjs record [--seed=N] [--teams=N] [--players=N] \
 *                                  [--preset=NAME] [--rounds=N] [--shots=N] \
 *                                  [--out=DATEI] [--quiet]
 *   node scripts/replay.mjs play DATEI [--until=N] [--verify]
 *   node scripts/replay.mjs info DATEI
 *
 * `--verify` prüft, dass das Replay exakt denselben Zustandshash erzeugt wie
 * beim Aufzeichnen — der Determinismusbeweis für einen konkreten Lauf.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { MatchController } from '../src/engine/match.js';
import { ReplayRecorder, playReplay } from '../src/engine/replay.js';

function parseArgs(argv) {
  const args = { _: [] };
  for (const token of argv) {
    if (token.startsWith('--')) {
      const [key, value] = token.slice(2).split('=');
      args[key] = value === undefined ? true : value;
    } else {
      args._.push(token);
    }
  }
  return args;
}

function num(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function record(args) {
  const seed = num(args.seed, 20260910);
  const teams = num(args.teams, 2);
  const playersPerTeam = num(args.players, 2);
  const preset = args.preset ?? 'hills';
  const maxRounds = num(args.rounds, 12);
  const maxShots = num(args.shots, 200);
  const quiet = Boolean(args.quiet);

  const match = new MatchController({ seed, teams, playersPerTeam, preset, maxRounds, turnDurationMs: 2000 });
  match.start();

  const recorder = new ReplayRecorder({
    seed,
    teams,
    playersPerTeam,
    preset,
    maxRounds,
    turnDurationMs: match.turnDurationMs,
  });

  const hashTrace = [];
  let shots = 0;
  let ticks = 0;

  while (match.status === 'playing' && ticks < 400_000) {
    const state = match.getState();
    if (state.activePlayerId !== null && state.turnElapsedMs < 16 && shots < maxShots) {
      // Deterministisch variierende Zielwerte: deckt verschiedene Flugbahnen ab.
      const angle = Math.PI / 4 + (shots % 9) * 0.05;
      const power = 50 + (shots % 6) * 8;
      const result = match.fire(state.activePlayerId, angle, power);
      if (result.ok) {
        recorder.recordInput({ tick: match.world.tickCount, playerId: state.activePlayerId, angle, power });
        shots += 1;
      }
    }
    match.step();
    match.consumeEvents();
    ticks += 1;
    if (ticks % 100 === 0) hashTrace.push([ticks, match.stateHash()]);
  }

  recorder.finalize(match.world.tickCount);

  const outPath = resolve(process.cwd(), args.out ?? `artifacts/replay-${seed}.json`);
  mkdirSync(dirname(outPath), { recursive: true });

  const document = {
    ...recorder.toJSON(),
    // Der Endzustand wird mitgespeichert, damit --verify etwas zu prüfen hat.
    expected: {
      status: match.status,
      round: match.round,
      tick: match.world.tickCount,
      stateHash: match.stateHash(),
    },
    hashTrace,
  };
  writeFileSync(outPath, JSON.stringify(document), 'utf8');

  if (!quiet) {
    console.log(`Replay aufgezeichnet: ${outPath}`);
    console.log(`  Seed        : ${seed}`);
    console.log(`  Konfig      : ${teams} Teams x ${playersPerTeam} Spieler, Karte ${preset}`);
    console.log(`  Schüsse     : ${shots}`);
    console.log(`  Ticks       : ${match.world.tickCount}`);
    console.log(`  Runden      : ${match.round}`);
    console.log(`  Endstatus   : ${match.status} (Sieger: ${match.winnerTeamId ?? 'keiner'})`);
    console.log(`  Zustandshash: ${match.stateHash()}`);
    console.log(`  Dateigröße  : ${(JSON.stringify(document).length / 1024).toFixed(1)} kB`);
    console.log('  Mit "play --verify" lässt sich die Reproduzierbarkeit prüfen.');
  }
  return 0;
}

function loadDocument(path) {
  const full = resolve(process.cwd(), path);
  return { full, document: JSON.parse(readFileSync(full, 'utf8')) };
}

function info(args) {
  const path = args._[1];
  if (!path) {
    console.error('Aufruf: node scripts/replay.mjs info DATEI');
    return 2;
  }
  const { full, document } = loadDocument(path);
  console.log(`Replay: ${full}`);
  console.log(`  Format      : ${document.format}`);
  console.log(`  Seed        : ${document.seed}`);
  console.log(`  Konfig      : ${JSON.stringify(document.config)}`);
  console.log(`  Eingaben    : ${document.entries?.length ?? 0}`);
  console.log(`  Ticks       : ${document.totalTicks}`);
  console.log(`  Erwartet    : ${JSON.stringify(document.expected ?? null)}`);
  return 0;
}

function play(args) {
  const path = args._[1];
  if (!path) {
    console.error('Aufruf: node scripts/replay.mjs play DATEI [--until=N] [--verify]');
    return 2;
  }
  const { document } = loadDocument(path);
  const until = args.until === undefined ? null : num(args.until, null);

  const start = Date.now();
  const { match, appliedInputs, ticks, rejected } = playReplay(document, {
    untilTick: until,
    onEvent: null,
  });
  const elapsed = Date.now() - start;

  console.log(`Replay abgespielt in ${elapsed} ms`);
  console.log(`  Angewendete Eingaben: ${appliedInputs}`);
  console.log(`  Simulierte Ticks    : ${ticks}`);
  console.log(`  Abgelehnte Eingaben : ${rejected.length}`);
  console.log(`  Status              : ${match.status} (Runde ${match.round})`);
  console.log(`  Zustandshash        : ${match.stateHash()}`);

  if (rejected.length > 0) {
    console.error('  Erste Ablehnungen:', JSON.stringify(rejected.slice(0, 3)));
  }

  if (args.verify) {
    const expected = document.expected;
    if (!expected) {
      console.error('  VERIFY FEHLGESCHLAGEN: Das Replay enthält keinen erwarteten Zustand.');
      return 1;
    }
    const checks = [
      ['Status', match.status, expected.status],
      ['Runde', match.round, expected.round],
      ['Tick', match.world.tickCount, expected.tick],
      ['Zustandshash', match.stateHash(), expected.stateHash],
    ];
    let ok = true;
    for (const [label, actual, want] of checks) {
      const match_ok = actual === want;
      if (!match_ok) ok = false;
      console.log(`  ${match_ok ? 'OK  ' : 'FEHL'} ${label}: ${actual}${match_ok ? '' : ` (erwartet ${want})`}`);
    }
    // Zwischenhashes prüfen, damit eine Abweichung früh sichtbar wird.
    if (Array.isArray(document.hashTrace) && document.hashTrace.length > 0) {
      const traceResult = playReplay(document, {
        untilTick: document.hashTrace[document.hashTrace.length - 1][0],
        onTick: null,
      });
      const lastExpected = document.hashTrace[document.hashTrace.length - 1];
      const traceOk = traceResult.match.stateHash() === lastExpected[1];
      console.log(`  ${traceOk ? 'OK  ' : 'FEHL'} Zwischenhash bei Tick ${lastExpected[0]}`);
      if (!traceOk) ok = false;
    }

    console.log(ok ? 'VERIFY: Replay ist exakt reproduzierbar.' : 'VERIFY FEHLGESCHLAGEN.');
    return ok ? 0 : 1;
  }
  return 0;
}

const args = parseArgs(process.argv.slice(2));
const command = args._[0];

const commands = { record, play, info };
const handler = commands[command];

if (!handler) {
  console.error('Aufruf: node scripts/replay.mjs <record|play|info> [Optionen]');
  console.error('  record [--seed=N] [--teams=N] [--players=N] [--preset=NAME] [--rounds=N] [--shots=N] [--out=DATEI]');
  console.error('  play   DATEI [--until=N] [--verify]');
  console.error('  info   DATEI');
  process.exit(2);
}

process.exit(handler(args));
