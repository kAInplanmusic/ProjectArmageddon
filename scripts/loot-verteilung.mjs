#!/usr/bin/env node
/**
 * Misst die Loot-Verteilung über viele Seeds, je Kistenfassung (`config.kisten`).
 *
 * Kein Spiel, nur der Ziehweg: `rollCrateCount` -> `legeKiste` (Inhalt, Seltenheit, Waffe) mit dem
 * LOOT-Sub-RNG des Match-Seeds, über `--runden` Runden je Seed. Gezählt wird, was FÄLLT (Obergrenze
 * und Aufheben ausgenommen): Anteil je Stufe an den Waffenkisten, Waffen je Partie, verschiedene
 * Waffen je Partie, nie gezogene Waffen, Spanne der Einzelwahrscheinlichkeit.
 *
 * Aufruf: node scripts/loot-verteilung.mjs [--seeds=2000] [--runden=23] [--json]
 */
import { MatchSeedManager } from '../src/shared/seed.js';
import { rollCrateCount } from '../src/shared/config/loot.js';
import { legeKiste, CRATE_TYPES, weaponIdFromIndex } from '../src/engine/systems/lootSystem.js';
import { KISTEN_ALT, KISTEN_OFT, KISTEN_STANDARD } from '../src/shared/config/kisten.js';
import { WEAPONS, WEAPONS_BY_ID } from '../src/shared/config/weapons.js';

const args = Object.fromEntries(process.argv.slice(2).filter(a => a.startsWith('--'))
  .map(a => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));
const SEEDS = Number(args.seeds ?? 2000);
const RUNDEN = Number(args.runden ?? 23);
const STUFEN = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

/** Kleinstwelt: nur, was `legeKiste` anfasst. */
function kleinwelt() {
  const kisten = [];
  return {
    kisten,
    createEntity: () => kisten.push({}) - 1,
    addComponent: (id, name, wert) => { if (name === 'Crate') kisten[id] = wert; },
  };
}

export function messe(kisten) {
  const stufe = Object.fromEntries(STUFEN.map(s => [s, 0]));
  const je = new Map();
  let waffenKisten = 0; let alle = 0; let proPartieSumme = 0; let verschiedenSumme = 0;
  let kistenOhne = 0; let munitionskisten = 0; const verteilung = {};
  for (let seed = 1; seed <= SEEDS; seed += 1) {
    const rng = new MatchSeedManager(seed * 7919).getSubRng('LOOT');
    const gesehen = new Set(); let waffen = 0;
    for (let r = 0; r < RUNDEN; r += 1) {
      const n = { none: 0, one: 1, two: 2, three: 3 }[rollCrateCount(rng, kisten)];
      if (n === 0) kistenOhne += 1;
      for (let i = 0; i < n; i += 1) {
        const welt = kleinwelt();
        legeKiste(welt, rng, 0, 0, kisten);
        const k = welt.kisten[0]; k.ammo ??= 0;
        alle += 1;
        if (k.crateType === CRATE_TYPES.ammo) munitionskisten += 1;
        if (k.crateType !== CRATE_TYPES.weapon) continue;
        const w = WEAPONS_BY_ID[weaponIdFromIndex(k.weaponId)];
        waffenKisten += 1; waffen += 1; stufe[w.powerTier] += 1;
        je.set(w.id, (je.get(w.id) ?? 0) + 1); gesehen.add(w.id);
      }
    }
    proPartieSumme += waffen; verschiedenSumme += gesehen.size;
    verteilung[waffen] = (verteilung[waffen] ?? 0) + 1;
  }
  const nie = WEAPONS.filter(w => !je.has(w.id)).map(w => w.id);
  const anteil = Object.fromEntries(STUFEN.map(s => [s, +(stufe[s] / waffenKisten * 100).toFixed(1)]));
  const katalog = Object.fromEntries(STUFEN.map(s => [s, WEAPONS.filter(w => w.powerTier === s).length]));
  const proWaffe = Object.fromEntries(STUFEN.map(s => {
    const ids = WEAPONS.filter(w => w.powerTier === s && je.has(w.id));
    return [s, ids.length ? +(ids.reduce((a, w) => a + je.get(w.id), 0) / ids.length / waffenKisten * 100).toFixed(3) : 0];
  }));
  // Chance, eine bestimmte Waffe der Stufe in einer Partie mindestens einmal zu finden.
  const proPartie = Object.fromEntries(STUFEN.map(s => [s, +(100 * (1 - Math.pow(1 - (proWaffe[s] / 100), proPartieSumme / SEEDS))).toFixed(1)]));
  return {
    kisten, kistenJeRunde: +(alle / SEEDS / RUNDEN).toFixed(2), rundenOhneKiste: +(kistenOhne / SEEDS / RUNDEN * 100).toFixed(1),
    waffenkistenJePartie: +(proPartieSumme / SEEDS).toFixed(1), munitionskistenJePartie: +(munitionskisten / SEEDS).toFixed(1), verschiedeneJePartie: +(verschiedenSumme / SEEDS).toFixed(1),
    anteilStufeProzent: anteil, katalogJeStufe: katalog, prozentJeWaffeProKiste: proWaffe,
    chanceEineWaffePartieProzent: proPartie, nieGezogen: nie,
    partienMitWeniger3Waffen: +(100 * Object.entries(verteilung).filter(([k]) => Number(k) < 3).reduce((a, [, v]) => a + v, 0) / SEEDS).toFixed(1),
  };
}

const fassungen = args.kisten ? [Number(args.kisten)] : [KISTEN_ALT, KISTEN_OFT, KISTEN_STANDARD].filter((v, i, a) => a.indexOf(v) === i);
for (const f of fassungen) {
  const m = messe(f);
  if (args.json) console.log(JSON.stringify(m)); else console.dir(m, { depth: 4, maxArrayLength: 200 });
}
