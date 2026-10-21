#!/usr/bin/env node
/**
 * Balancing-Überblick aus Bot-Partien (reine Messung, ändert keine Regel).
 *
 * Misst über viele Seeds:
 *  - Siegquote je Klasse (alle neun Paarungen, Archetyp fest, Seiten über alle Paarungen getauscht)
 *  - Siegquote der Start-Seite (Team 0 beginnt) in Spiegelpaarungen und in der Standardzuteilung
 *  - Partielänge (Minuten, Runden)
 *  - Ereignisse je Partie von Günther/Cookie (Tiere) und Feuer/Lava
 *
 * Fraktionen sind reine Darstellung (keine Spielwerte): eine Siegquote je Fraktion wäre Rauschen
 * und wird bewusst nicht gemessen.
 *
 * Aufruf: node scripts/balance-ueberblick.mjs [--seeds=10] [--archetyp=brawler]
 */
import { spiele } from './bot-partien.mjs';
import { CLASS_IDS } from '../src/shared/config/classes.js';

const args = Object.fromEntries(process.argv.slice(2).filter(a => a.startsWith('--'))
  .map(a => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));
const SEEDS = Number(args.seeds ?? 10);
const ARCHETYP = args.archetyp ?? 'brawler';
const PRO_TEAM = 3;

function messe(seed, loadouts, mehr = {}) {
  const z = { guenther: 0, cookie: 0, feuer: 0 };
  const ereignis = liste => {
    for (const e of liste) {
      if (e.type.startsWith('guenther_')) z.guenther += 1;
      else if (e.type.startsWith('cookie_')) z.cookie += 1;
      else if (e.type.startsWith('feuer_') || e.type.startsWith('lava_')) z.feuer += 1;
    }
  };
  const extra = { guenther: 2, cookie: 2, ...(loadouts ? { loadouts } : {}), ...mehr };
  const r = spiele(seed, 4, { teams: 2, proTeam: PRO_TEAM, extra, ereignis });
  return { r, z };
}

// Platz i gehört zu Team i % 2 (siehe spawnManager).
const paarung = (a, b) => Array.from({ length: 2 * PRO_TEAM }, (_, i) => ({ classId: i % 2 === 0 ? a : b, archetypeId: ARCHETYP }));
const summe = { partien: 0, remis: 0, minuten: [], runden: [], guenther: 0, cookie: 0, feuer: 0 };
const nimm = (r, z) => {
  summe.partien += 1;
  if (r.siegerTeam === null) summe.remis += 1;
  summe.minuten.push(r.minuten); summe.runden.push(r.runden);
  summe.guenther += z.guenther; summe.cookie += z.cookie; summe.feuer += z.feuer;
};
const klasse = Object.fromEntries(CLASS_IDS.map(k => [k, { spiele: 0, siege: 0 }]));
const spiegel = { partien: 0, sieg0: 0 };
const paarungen = {};
for (const a of CLASS_IDS) {
  for (const b of CLASS_IDS) {
    let s0 = 0;
    for (let i = 0; i < SEEDS; i += 1) {
      const { r, z } = messe(9000 + i * 97, paarung(a, b));
      nimm(r, z);
      if (r.siegerTeam === 0) s0 += 1;
      if (a === b) { spiegel.partien += 1; if (r.siegerTeam === 0) spiegel.sieg0 += 1; }
      else {
        klasse[a].spiele += 1; klasse[b].spiele += 1;
        if (r.siegerTeam === 0) klasse[a].siege += 1;
        else if (r.siegerTeam === 1) klasse[b].siege += 1;
      }
    }
    paarungen[`${a}(T0) vs ${b}(T1)`] = `${s0}/${SEEDS}`;
  }
}
const standard = { partien: 0, sieg0: 0 };
for (let i = 0; i < SEEDS * 3; i += 1) {
  const { r, z } = messe(9500 + i * 61, null, { kartentyp: 'autonom' });
  nimm(r, z); standard.partien += 1; if (r.siegerTeam === 0) standard.sieg0 += 1;
}
// Feuer/Lava: Vulkanbiom auf autonomer Karte (sonst entstehen kaum Feuerereignisse).
const vulkan = { partien: 0, feuer: 0, sieg0: 0 };
for (let i = 0; i < SEEDS; i += 1) {
  const { r, z } = messe(9700 + i * 53, null, { kartentyp: 'autonom', biom: 'vulkan' });
  vulkan.partien += 1; vulkan.feuer += z.feuer; if (r.siegerTeam === 0) vulkan.sieg0 += 1;
}
const med = a => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const q = (x, n = 2) => Number(x.toFixed(n));
console.log(JSON.stringify({
  seedsJePaarung: SEEDS, archetyp: ARCHETYP, partien: summe.partien, unentschieden: summe.remis,
  siegquoteKlasse: Object.fromEntries(Object.entries(klasse).map(([k, v]) => [k, q(v.siege / Math.max(1, v.spiele))])),
  startSeiteTeam0: { spiegel: q(spiegel.sieg0 / Math.max(1, spiegel.partien)), standardzuteilung_autonom: q(standard.sieg0 / Math.max(1, standard.partien)) },
  laengeMinuten: { median: q(med(summe.minuten), 1), max: q(Math.max(...summe.minuten), 1) },
  runden: { median: med(summe.runden), max: Math.max(...summe.runden) },
  ereignisseJePartie: { guenther: q(summe.guenther / summe.partien, 1), cookie: q(summe.cookie / summe.partien, 1), feuerLava: q(summe.feuer / summe.partien, 1) },
  vulkanbiom: { partien: vulkan.partien, feuerLavaEreignisseJePartie: q(vulkan.feuer / Math.max(1, vulkan.partien), 1), team0Siege: vulkan.sieg0 },
  paarungenTeam0Siege: paarungen,
}, null, 2));
