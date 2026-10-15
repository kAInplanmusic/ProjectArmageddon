#!/usr/bin/env node
/**
 * Zählt Kisten je Runde über mehrere Seeds, je Kistenfassung (`config.kisten`).
 *
 * Zwei Messungen (niemand hebt Kisten auf, die Figuren stehen still):
 *   1. Abwurfrate: Rundenbeginn auf leerer Karte über viele Seeds (`proRunde`, `ohne` = Anteil
 *      ohne Kiste); so wirkt die Obergrenze nicht mit hinein.
 *   2. Anhäufung: lange Partien mit übersprungenen Zügen; `liegenMax` ist der Höchstwert
 *      unaufgehobener Kisten gleichzeitig, `liegenEnde` der Mittelwert nach der letzten Runde.
 *
 * Aufruf:
 *   node scripts/kisten-zaehlung.mjs [--seeds=24] [--runden=20] [--json]
 */
import { MatchController } from '../src/engine/match.js';
import { KISTEN_ALT, KISTEN_OFT } from '../src/shared/config/kisten.js';

const args = Object.fromEntries(process.argv.slice(2).filter(a => a.startsWith('--'))
  .map(a => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));
const SEEDS = Number(args.seeds ?? 24);
const RUNDEN = Number(args.runden ?? 20);

function liegen(match) {
  return match.getState().crates?.filter(k => !k.picked).length
    ?? match.getState().entities.filter(e => e.crateType !== undefined).length;
}

/** Rate auf leerer Karte: der Abwurf der ersten Runde über `seeds` Seeds. */
function abwurfRate(kisten, seeds) {
  let neu = 0;
  let ohne = 0;
  for (let seed = 1; seed <= seeds; seed += 1) {
    const match = new MatchController({ seed, teams: 2, playersPerTeam: 2, preset: 'hills', turnDurationMs: 1_000_000, kisten });
    match.start();
    const n = match.getState().crates.length;
    neu += n;
    if (n === 0) ohne += 1;
  }
  return { proRunde: +(neu / seeds).toFixed(2), ohne: +(ohne / seeds).toFixed(2) };
}

/** Anhäufung ohne Aufheben über `runden` Runden. */
function anhaeufung(kisten, seeds, runden) {
  let ende = 0;
  let max = 0;
  for (let seed = 1; seed <= seeds; seed += 1) {
    const match = new MatchController({
      seed, teams: 2, playersPerTeam: 2, preset: 'hills', turnDurationMs: 1_000_000, maxRounds: 999, kisten,
    });
    match.start();
    max = Math.max(max, liegen(match));
    for (let i = 0; i < 4000 && match.round < runden; i += 1) {
      match.endTurn();
      for (let t = 0; t < 130; t += 1) match.step();
      match.consumeEvents();
      max = Math.max(max, liegen(match));
    }
    ende += liegen(match);
  }
  return { liegenEnde: +(ende / seeds).toFixed(1), liegenMax: max };
}

export function zaehle(kisten, seeds = SEEDS, runden = RUNDEN) {
  return { kisten, ...abwurfRate(kisten, seeds * 10), ...anhaeufung(kisten, seeds, runden), runden };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const ergebnis = [KISTEN_ALT, KISTEN_OFT].map(k => zaehle(k));
  if (args.json) console.log(JSON.stringify(ergebnis));
  else for (const e of ergebnis) console.log(`Fassung ${e.kisten}: ${e.proRunde} Kisten je Rundenbeginn, ${(e.ohne * 100).toFixed(0)} % Runden ohne, ohne Aufheben liegen am Ende Ø ${e.liegenEnde}, Höchstwert ${e.liegenMax} nach ${e.runden} Runden`);
}
