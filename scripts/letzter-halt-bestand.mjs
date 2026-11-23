#!/usr/bin/env node
/**
 * Letzter Halt: Bestandsmessung ProjectArmageddon
 *
 * Liest den IST-Stand live aus den Projektkatalogen (keine Kopien im Skript,
 * keine Partienmessung) und gibt ihn als JSON aus. Grundlage für die
 * Konsistenzprüfung im Plan docs/letzter-halt-plan.md (in Git; offen: docs/TODO.md 2.13).
 *
 * @module letzter-halt-bestand
 */

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FACTIONS } from '../src/shared/config/factions.js';
import { NEUE_BIOME, SONDERBIOM_IDS } from '../src/shared/config/biome-neu.js';
import { STOFFE } from '../src/shared/config/stoffe.js';
import { TERRAIN_MATERIALS } from '../src/shared/config/terrain.js';

const projRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const QUELLDATEIEN = [
  'src/shared/config/biome-neu.js',
  'src/shared/config/factions.js',
  'src/shared/config/stoffe.js',
  'src/shared/config/terrain.js',
];

/** SHA-256 über die vollständigen Quelldateien (feste Reihenfolge). */
const quellHash = () => {
  const h = createHash('sha256');
  for (const p of [...QUELLDATEIEN].sort()) {
    h.update(`${p}:`);
    h.update(readFileSync(join(projRoot, p), 'utf8'));
  }
  return h.digest('hex');
};

/** Alle Stoffschlüssel, die ein Biom im Aufbau (deck/kern/adern) verwendet. */
const stoffeVonBiom = (b) => {
  const s = b.stoffe ?? {};
  const keys = [...(s.deck ?? []).map(([k]) => k), s.kern, ...(s.adern ?? []).map(a => a.stoff)];
  return [...new Set(keys.filter(Boolean))];
};

const fraktionen = FACTIONS.map(({ id, name, short, motto, palette }) => ({ id, name, short, motto, palette }));
const biome = SONDERBIOM_IDS.map(id => ({
  id, label: NEUE_BIOME[id].label, fraktion: NEUE_BIOME[id].fraktion, stoffe: stoffeVonBiom(NEUE_BIOME[id]),
}));
const stoffe = STOFFE.map(({ id, key, label, haerte, radius, tiefe, bruechig, brennbar, schmelzbar }) => (
  { id, key, label, haerte, radius, tiefe, bruechig, brennbar, schmelzbar }));
const material = TERRAIN_MATERIALS.map(({ id, key, label, rutschigkeit, rueckprall }) => (
  { id, key, label, rutschigkeit, rueckprall }));

// Heim-Biom je Fraktion: erstes Biom (in Katalogreihenfolge) mit dieser Fraktion.
const heim = {};
for (const b of biome) if (!heim[b.fraktion]) heim[b.fraktion] = b;

const matrix = [];
for (const f of fraktionen) {
  const home = heim[f.id];
  const homeId = home?.id ?? 'keine';
  matrix.push({ fraktion: f.id, biome: homeId, home: true, stoffe: home?.stoffe ?? [] });
  for (const b of biome) {
    if (b.id !== homeId) matrix.push({ fraktion: f.id, biome: b.id, home: false, stoffe: b.stoffe, gegen: homeId });
  }
}

const ohneHeim = fraktionen.filter(f => !heim[f.id]).map(f => f.id);
const mehrfach = Object.entries(biome.reduce((m, b) => ({ ...m, [b.fraktion]: [...(m[b.fraktion] ?? []), b.id] }), {}))
  .filter(([, ids]) => ids.length > 1).map(([f, ids]) => `${f} (${ids.join(', ')})`);

const report = {
  schema: 1,
  herkunft: 'Live-Import der Projektkataloge; keine Partienmessung',
  zeit: new Date().toISOString(),
  commit: {
    hash: process.env.GIT_COMMIT?.slice(0, 7) ?? 'lokal',
    branch: process.env.GIT_BRANCH ?? 'HEAD',
  },
  quellen: {
    biome: 'src/shared/config/biome-neu.js (NEUE_BIOME, SONDERBIOM_IDS)',
    factions: 'src/shared/config/factions.js (FACTIONS)',
    stoffe: 'src/shared/config/stoffe.js (STOFFE)',
    material: 'src/shared/config/terrain.js (TERRAIN_MATERIALS)',
  },
  zaehler: {
    fraktionen: fraktionen.length,
    biome: biome.length,
    stoffe: stoffe.length,
    material: material.length,
    matrix_eintraege: matrix.length,
    beachte: `ohne Heim-Biom: ${ohneHeim.join(', ') || '–'}; mehrere Biome: ${mehrfach.join('; ') || '–'}`,
  },
  fraktionen,
  biome,
  stoffe,
  material,
  matrix,
  quellHash: quellHash(),
};

console.log(JSON.stringify(report, null, 2));
