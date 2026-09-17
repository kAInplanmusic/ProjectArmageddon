#!/usr/bin/env node
/**
 * Misst, ob der autonome Generator unerreichbare Flächen erzeugt.
 *
 * ## Warum dieses Werkzeug existiert
 *
 * Der autonome Generator darf Inseln und Höhlen erzeugen — das ist gewollt.
 * Aber eine Figur, die auf einer Fläche festsitzt, die niemand erreichen kann,
 * macht die Partie kaputt: Sie läuft nicht verloren, sondern **aus**, bis die
 * Rundengrenze greift.
 *
 * Ein Generator, der das zulässt, ist nicht frei, sondern fehlerhaft. Dieses
 * Werkzeug beziffert, wie oft es vorkommt — BEVOR eine Regel dagegen gebaut
 * wird.
 *
 * ## Aufruf
 *
 *     node scripts/check-erreichbarkeit.mjs
 *     node scripts/check-erreichbarkeit.mjs --partien=40
 */
import { MatchController } from '../src/engine/match.js';
import { findeFlaechen } from '../src/shared/erreichbarkeit.js';

const args = new Map(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));
const PARTIEN = Number(args.get('partien') ?? 30);

console.log('Erreichbarkeit im autonomen Generator');
console.log('');

let ohneProblem = 0;
const probleme = [];
const flaechenZahlen = [];
const kennzahlen = [];

for (let i = 0; i < PARTIEN; i += 1) {
  const seed = 200000 + i * 6151;
  const m = new MatchController({
    seed, teams: 2, playersPerTeam: 2, kartentyp: 'autonom',
    turnDurationMs: 2000, maxRounds: 10,
  });
  m.start();
  m.consumeEvents();

  // Die Flächen der Karte zählen
  const bitmap = m.bitmap ?? null;
  let anzahl = 0;
  if (bitmap) {
    const f = findeFlaechen(bitmap, m.width, m.height);
    anzahl = f.anzahl;
    flaechenZahlen.push(anzahl);
  }

  const e = m.erreichbarkeit ?? { ok: true };
  if (e.ok) ohneProblem += 1;
  else probleme.push({ seed, grund: e.grund });

  kennzahlen.push({
    seed,
    hohlraum: m.kartenkennzahlen?.hohlraum ?? 0,
    erhebungen: m.kartenkennzahlen?.erhebungen ?? 0,
    flaechen: anzahl,
    erreichbar: e.ok,
  });
}

console.log(`${'Kennzahl'.padEnd(24)}${'Wert'.padStart(14)}`);
console.log('-'.repeat(40));
console.log(`${'Partien geprüft'.padEnd(24)}${String(PARTIEN).padStart(14)}`);
console.log(`${'ohne Problem'.padEnd(24)}${String(ohneProblem).padStart(14)}`);
console.log(`${'mit unerreichbarer Figur'.padEnd(24)}${String(probleme.length).padStart(14)}`);
console.log('');

const mittel = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
if (flaechenZahlen.length > 0) {
  flaechenZahlen.sort((a, b) => a - b);
  console.log('Zusammenhängende Landflächen je Karte:');
  console.log(`  kleinste:  ${flaechenZahlen[0]}`);
  console.log(`  Median:    ${flaechenZahlen[Math.floor(flaechenZahlen.length / 2)]}`);
  console.log(`  größte:    ${flaechenZahlen[flaechenZahlen.length - 1]}`);
  console.log(`  Mittel:    ${mittel(flaechenZahlen).toFixed(1)}`);
  console.log('');
}

if (probleme.length > 0) {
  console.log('DIE PROBLEMFÄLLE');
  console.log('');
  for (const p of probleme.slice(0, 10)) {
    console.log(`  Seed ${p.seed}: ${p.grund}`);
  }
  console.log('');
}

/*
 * Die Zugzeit bleibt das Maximum — und die Zugreihenfolge ist die des
 * klassischen Spiels.
 *
 * Beides gehört hierher, weil es die Erreichbarkeit relativiert: Wer nicht
 * schießen kann, ist nicht verloren — er kann sich bewegen. Und weil die
 * Reihenfolge jedem Spieler einen festen Platz gibt, weiß jeder, wann er
 * wieder dran ist.
 */
const einePartie = new MatchController({
  seed: 200000, teams: 4, playersPerTeam: 2, kartentyp: 'autonom',
  turnDurationMs: 2000, maxRounds: 2,
});
einePartie.start();
einePartie.consumeEvents();

console.log('DIE ZUGREIHENFOLGE (4 Spieler, 2 Einheiten je Spieler)');
console.log('');
console.log('  Zug   Figur   Team   Runde');
for (let i = 0; i < 8; i += 1) {
  const s = einePartie.getState();
  const e = s.entities.find(x => x.entityId === s.activePlayerId);
  console.log(`  ${String(i + 1).padStart(3)}   ${String(s.activePlayerId).padStart(5)}   `
    + `${String(e?.teamId ?? '?').padStart(4)}   ${s.round}`);
  einePartie.endTurn();
}
console.log('');
console.log('  Erst alle Spieler mit ihrer ersten Einheit, dann alle mit der zweiten:');
console.log('  S1 E1, S2 E1, S3 E1, S4 E1, S1 E2, S2 E2, S3 E2, S4 E2 — dann Runde 2.');

console.log('');
console.log('WAS DAS BEDEUTET');
console.log('');

/*
 * Die Bewertung: Ein paar getrennte Flächen sind normal (Inseln). Ein Problem
 * entsteht erst, wenn eine FIGUR darauf steht und niemand hinreichen kann.
 */
const quote = probleme.length / PARTIEN;
if (quote === 0) {
  console.log(`  Keine der ${PARTIEN} Partien hatte eine unerreichbare Figur.`);
  console.log('  Die Erzeugung ist damit spielbar — Inseln kommen vor, aber');
  console.log('  immer in Schussweite.');
} else if (quote < 0.1) {
  console.log(`  ${probleme.length} von ${PARTIEN} Partien (${(quote * 100).toFixed(0)} %) hatten eine`);
  console.log('  unerreichbare Figur. Das ist selten, aber es kommt vor — und eine');
  console.log('  solche Partie ist für den betroffenen Spieler verloren, ohne dass');
  console.log('  er es merkt.');
  console.log('');
  console.log('  Ein Neuwurf im Generator wäre der falsche Weg (Determinismus).');
  console.log('  Richtig ist: Die Fläche mit der abgeschnittenen Figur nachträglich');
  console.log('  verbinden — etwa durch einen Stollen oder eine Felsbrücke.');
} else {
  console.log(`  ${probleme.length} von ${PARTIEN} Partien (${(quote * 100).toFixed(0)} %) — das ist zu viel.`);
  console.log('  Der Generator erzeugt zu oft abgeschnittene Flächen. Die Inseligkeit');
  console.log('  oder die Höhlung ist zu hoch.');
}
