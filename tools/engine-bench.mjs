#!/usr/bin/env node
/**
 * A5-Messwerkzeug (ENG-6/ENG-7): Registrierung, ECS-Query je Tick, LootSystem.
 *
 * Misst drei Pfade getrennt, damit eine Änderung je Pfad belegt ist und nicht im
 * Rauschen eines ganzen Matches verschwindet:
 *
 *  1. `registerSystem` — Kosten beim Aufbau einer Welt (9 Systeme, 2000 Welten).
 *  2. `World.step` — Query- und Filter-Allokation je System und Tick (no-op-Systeme,
 *     400 Entities, 20 000 Ticks). Dazu die GC-Zeit aus `PerformanceObserver`.
 *  3. `LootSystem.update` — ein Tick mit 8 Figuren und 5 Kisten, 100 000 Aufrufe.
 *
 * Aufruf: node tools/engine-bench.mjs [--json]
 * Die Zahlen sind Relativwerte für denselben Rechner; verglichen wird vor/nach.
 */
import { PerformanceObserver } from 'node:perf_hooks';
import { World } from '../src/engine/ecs/world.js';
import { COMPONENT_SIGNATURES } from '../src/engine/ecs/componentStore.js';
import { registerDefaultComponents } from '../src/engine/init.js';
import { LootSystem } from '../src/engine/systems/lootSystem.js';

const asJson = process.argv.includes('--json');
const ruhe = () => new Promise((fertig) => setImmediate(fertig));
/* CPU-Zeit statt Wanduhr: unter Last (andere Testläufe) misst sie nur den Prozess. */
const cpuMs = () => { const zeit = process.cpuUsage(); return (zeit.user + zeit.system) / 1000; };

/* GC-Zeit je Abschnitt: Summe der vom Observer gemeldeten Pausen. */
let gcPausen = [];
const gcObserver = new PerformanceObserver((liste) => {
  for (const eintrag of liste.getEntries()) gcPausen.push(eintrag.duration);
});
gcObserver.observe({ entryTypes: ['gc'] });
const gcLeeren = () => { gcPausen = []; };
const gcSumme = () => gcPausen.reduce((a, b) => a + b, 0);

const noop = { update() {} };

/* 1) Registrierung: Welt bauen und neun Systeme anmelden. */
gcLeeren();
const REGISTRIERUNGEN = 2000;
const tRegStart = process.hrtime.bigint();
const cRegStart = cpuMs();
for (let i = 0; i < REGISTRIERUNGEN; i += 1) {
  const world = new World();
  for (let s = 0; s < 9; s += 1) world.registerSystem(`s${s}`, noop, 100 - s);
}
const tRegEnd = process.hrtime.bigint();
const cRegEnd = cpuMs();
await ruhe();
const registrierung = {
  welten: REGISTRIERUNGEN,
  ms: Number(tRegEnd - tRegStart) / 1e6,
  cpuMs: cRegEnd - cRegStart,
  gcMs: gcSumme(),
};
registrierung.usProWelt = (registrierung.cpuMs * 1000) / REGISTRIERUNGEN;

/* 2) World.step: sechs Signaturen über 400 Entities. */
const stepWorld = new World();
registerDefaultComponents(stepWorld.componentStore);
const sigs = [
  COMPONENT_SIGNATURES.POSITION | COMPONENT_SIGNATURES.VELOCITY,
  COMPONENT_SIGNATURES.HEALTH,
  COMPONENT_SIGNATURES.CRATE | COMPONENT_SIGNATURES.POSITION,
  COMPONENT_SIGNATURES.POSITION | COMPONENT_SIGNATURES.VELOCITY | COMPONENT_SIGNATURES.HEALTH,
  COMPONENT_SIGNATURES.POSITION | COMPONENT_SIGNATURES.VELOCITY | COMPONENT_SIGNATURES.PROJECTILE,
  COMPONENT_SIGNATURES.HEALTH | COMPONENT_SIGNATURES.TEAM,
];
sigs.forEach((sig, i) => stepWorld.registerSystem(`bench${i}`, { signature: sig, update() {} }, 50 - i));

const add = (id, name, values) => stepWorld.addComponent(id, name, values);
for (let i = 0; i < 400; i += 1) {
  const id = stepWorld.createEntity();
  add(id, 'Position', { x: i % 100, y: i % 40 });
  add(id, 'Velocity', { x: 0, y: 0 });
  if (i % 2 === 0) add(id, 'Health', { current: 100, max: 100 });
  if (i % 10 === 0) add(id, 'Crate', { crateType: 0, picked: 0, inFlight: 0 });
  if (i % 20 === 0) add(id, 'Projectile', { alive: 1 });
  if (i % 4 === 0) add(id, 'Team', { teamId: i % 4 });
}

/* Einlaufen, dann messen. */
for (let i = 0; i < 2000; i += 1) stepWorld.step();
await ruhe();
gcLeeren();
const STEPS = 20000;
const tStepStart = process.hrtime.bigint();
const cStepStart = cpuMs();
for (let i = 0; i < STEPS; i += 1) stepWorld.step();
const tStepEnd = process.hrtime.bigint();
const cStepEnd = cpuMs();
await ruhe();
const step = {
  ticks: STEPS,
  entities: 400,
  systeme: sigs.length,
  ms: Number(tStepEnd - tStepStart) / 1e6,
  cpuMs: cStepEnd - cStepStart,
  gcMs: gcSumme(),
};
step.usProTick = (step.cpuMs * 1000) / STEPS;

/* 3) LootSystem.update: 8 Figuren, 5 Kisten, ein Tick. */
const lootWorld = new World();
registerDefaultComponents(lootWorld.componentStore);
for (let i = 0; i < 8; i += 1) {
  const id = lootWorld.createEntity();
  lootWorld.addComponent(id, 'Position', { x: 20 + i * 30, y: 300 });
  lootWorld.addComponent(id, 'Velocity', { x: 0, y: 0 });
  lootWorld.addComponent(id, 'Health', { current: 100, max: 100 });
}
for (let i = 0; i < 5; i += 1) {
  const id = lootWorld.createEntity();
  lootWorld.addComponent(id, 'Position', { x: 600 + i * 40, y: 300 });
  lootWorld.addComponent(id, 'Velocity', { x: 0, y: 0 });
  lootWorld.addComponent(id, 'Crate', {
    crateType: 0, crateX: 600 + i * 40, crateY: 300, rarity: 0,
    weaponId: 1, picked: 0, ammo: 0, inFlight: 0, flightTicks: 0,
  });
}
const loot = new LootSystem({ rng: { next: () => 0.5, nextFloat: () => 0.5 } });
const lootEntities = lootWorld.getEntitiesBySignature(
  COMPONENT_SIGNATURES.CRATE | COMPONENT_SIGNATURES.POSITION,
);
for (let i = 0; i < 1000; i += 1) loot.update(lootWorld, lootEntities, 16.666);
await ruhe();
gcLeeren();
const LOOT_RUNDEN = 100000;
const tLootStart = process.hrtime.bigint();
const cLootStart = cpuMs();
for (let i = 0; i < LOOT_RUNDEN; i += 1) loot.update(lootWorld, lootEntities, 16.666);
const tLootEnd = process.hrtime.bigint();
const cLootEnd = cpuMs();
await ruhe();
const lootBericht = {
  runden: LOOT_RUNDEN,
  kisten: lootEntities.length,
  figuren: 8,
  ms: Number(tLootEnd - tLootStart) / 1e6,
  cpuMs: cLootEnd - cLootStart,
  gcMs: gcSumme(),
};
lootBericht.usProRunde = (lootBericht.cpuMs * 1000) / LOOT_RUNDEN;

const bericht = { registrierung, worldStep: step, lootSystem: lootBericht };
if (asJson) {
  console.log(JSON.stringify(bericht, null, 2));
} else {
  const zeile = (name, wert, gcMs) => console.log(
    `${name.padEnd(16)} ${wert.toFixed(3).padStart(10)} ms   GC ${gcMs.toFixed(2).padStart(8)} ms`,
  );
  console.log('A5 Engine-Messung');
  zeile('Anmeldung/Welt', registrierung.ms, registrierung.gcMs);
  console.log(`                 ${registrierung.usProWelt.toFixed(3)} µs je Welt (9 Systeme)`);
  zeile('World.step', step.ms, step.gcMs);
  console.log(`                 ${step.usProTick.toFixed(3)} µs je Tick (${STEPS} Ticks, 400 Entities, ${sigs.length} Signaturen)`);
  zeile('LootSystem', lootBericht.ms, lootBericht.gcMs);
  console.log(`                 ${lootBericht.usProRunde.toFixed(3)} µs je Runde (8 Figuren, ${lootEntities.length} Kisten)`);
}
gcObserver.disconnect();
