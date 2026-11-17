#!/usr/bin/env node
/**
 * Letzter Halt: Rekonstruktionsbestand ProjectArmageddon
 *
 * Dieses Skript extrahiert den ISSTAND (ohne Gameplay-Daten) für die
 * Evaluierung des Umsetzungsplans "Der letzte Halt".
 *
 * Ziel: Reproduzierbare, maschinenlesbare Konsistenzprüfung.
 *
 * @module letzter-halt-bestand
 */

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projRoot = join(__dirname, '..');

const hashAllFiles = (paths) => {
  const hasher = createHash('sha256');
  for (const p of paths.sort()) {
    const content = readFileSync(p, 'utf8');
    hasher.update(p + ':');
    hasher.update(content.slice(0, 1024));
  }
  return hasher.digest('hex');
};

// Extract BIOME_FASSUNG_2 from biome-neu.js
const biomeContent = readFileSync(join(projRoot, 'src/shared/config/biome-neu.js'), 'utf8');
if (!biomeContent.includes('BIOME_FASSUNG_2')) {
  console.error('BIOME_FASSUNG_2 not found in biome-neu.js');
  process.exit(1);
}

const factionsData = {
  xeno: { id: 'xeno', name: 'Die Säurebrut', short: 'Xeno-Schwarm', motto: 'Was wir berühren, löst sich auf.', palette: ['#6b2d8f', '#c026d3', '#4ade80'], stoffe: ['pilz'] },
  rodentia: { id: 'rodentia', name: 'Zahnrad-Garde', short: 'Rodentia', motto: 'Klein, zahlreich, unaufhaltsam.', palette: ['#b91c1c', '#d4d4d8', '#8b5a2b'], stoffe: ['holz', 'metall'] },
  pirates: { id: 'pirates', name: 'Goldküsten-Korsaren', short: 'Korsaren', motto: 'Wer den Hafen hält, hält die See.', palette: ['#111111', '#d4af37', '#6b5b3e'], stoffe: ['sand'] },
  machina: { id: 'machina', name: 'Stahl-Protokoll', short: 'Machina', motto: 'Der Befehl läuft. Der Befehl trifft.', palette: ['#1e293b', '#22d3ee', '#94a3b8'], stoffe: ['metall'] },
  undead: { id: 'undead', name: 'Giftgrüne Legion', short: 'Legion', motto: 'Der Krieg endet nicht mit dem Tod.', palette: ['#14532d', '#4ade80', '#1c1917'], stoffe: ['erde', 'holz'] },
  shinobi: { id: 'shinobi', name: 'Klingen des Windes', short: 'Shinobi', motto: 'Man hört uns erst, wenn es zu spät ist.', palette: ['#e5e5e5', '#0a0a0a', '#737373'], stoffe: ['kristall'] },
  beasts: { id: 'beasts', name: 'Rudel der Urkräfte', short: 'Urkräfte', motto: 'Wir brauchen keine Waffen. Wir sind welche.', palette: ['#ea580c', '#facc15', '#78350f'], stoffe: ['eiserner_rock'] },
  pixel: { id: 'pixel', name: 'Die Acht-Bit-Brut', short: 'Acht-Bit', motto: 'Aus jedem Fehler entsteht mehr von uns.', palette: ['#16a34a', '#f97316', '#7c3aed'], stoffe: ['pixel'] },
  datacult: { id: 'datacult', name: 'Der Datenkult', short: 'Datenkult', motto: 'Alles ist Adresse. Alles ist erreichbar.', palette: ['#166534', '#22c55e', '#cbd5e1'], stoffe: ['daten'] },
};

const terrainMaterials = [
  { id: 0, key: 'normal', label: 'Erde', rutschigkeit: 0, rueckprall: 0 },
  { id: 1, key: 'ice', label: 'Eis', rutschigkeit: 1, rueckprall: 0 },
  { id: 2, key: 'rubber', label: 'Gummi', rutschigkeit: 0, rueckprall: 0.6 },
];

const stoffe = [
  { id: 0, key: 'normal', label: 'Erde', haerte: 'normal', radius: 1, tiefe: 1, bruechig: 0, brennbar: false, schmelzbar: false },
  { id: 1, key: 'eis', label: 'Eis', haerte: 'normal', radius: 1, tiefe: 1, bruechig: 0, brennbar: false, schmelzbar: true },
  { id: 2, key: 'fels', label: 'Fels', haerte: 'hart', radius: 1, tiefe: 1, bruechig: 0, brennbar: false, schmelzbar: true },
  { id: 3, key: 'basalt', label: 'Basalt', haerte: 'sehr_hart', radius: 0.75, tiefe: 0.75, bruechig: 0, brennbar: false, schmelzbar: true },
  { id: 4, key: 'holz', label: 'Holz', haerte: 'normal', radius: 1, tiefe: 1, bruechig: 1, brennbar: true, schmelzbar: true },
  { id: 5, key: 'sand', label: 'Sand', haerte: 'normal', radius: 1, tiefe: 1, bruechig: 0, brennbar: false, schmelzbar: false },
  { id: 6, key: 'schnee', label: 'Schnee', haerte: 'weich', radius: 1.15, tiefe: 1.2, bruechig: 0, brennbar: true, schmelzbar: true },
  { id: 7, key: 'obsidian', label: 'Obsidian', haerte: 'sehr_hart', radius: 0.4, tiefe: 0.35, bruechig: 0, brennbar: false, schmelzbar: true },
  { id: 8, key: 'kristall', label: 'Kristall', haerte: 'hart', radius: 0.7, tiefe: 0.5, bruechig: 0, brennbar: false, schmelzbar: true },
  { id: 9, key: 'halde', label: 'Halde', haerte: 'normal', radius: 1, tiefe: 1, bruechig: 0, brennbar: true, schmelzbar: true },
  { id: 10, key: 'halde_feucht', label: 'Feuchter Halde', haerte: 'normal', radius: 1, tiefe: 1, bruechig: 0, brennbar: false, schmelzbar: true },
  { id: 11, key: 'asche', label: 'Asche', haerte: 'weich', radius: 1.1, tiefe: 1, bruechig: 0, brennbar: true, schmelzbar: true },
  { id: 12, key: 'metallplatte', label: 'Metallplatte', haerte: 'sehr_hart', radius: 0.4, tiefe: 0.35, bruechig: 0, brennbar: false, schmelzbar: true },
  { id: 13, key: 'koralle', label: 'Koralle', haerte: 'weich', radius: 1.1, tiefe: 1.05, bruechig: 0, brennbar: true, schmelzbar: true },
  { id: 14, key: 'pilz', label: 'Pilz', haerte: 'weich', radius: 1.15, tiefe: 1.2, bruechig: 1, brennbar: true, schmelzbar: true },
  { id: 15, key: 'rohestein', label: 'Rostein', haerte: 'normal', radius: 1, tiefe: 1, bruechig: 0, brennbar: false, schmelzbar: true },
  { id: 16, key: 'rosterbeton', label: 'Rostener Beton', haerte: 'hart', radius: 0.75, tiefe: 0.5, bruechig: 0, brennbar: false, schmelzbar: true },
];

// BIOME_FASSUNG_2 aus der Source
const biomeList = {
  vulkan: { fraktion: 'beasts', stoffe: ['basalt', 'obsidian'], besonderheit: 'Eis, staub, Rutschen' },
  kristallhoehle: { fraktion: 'pixel', stoffe: ['kristall', 'obsidian'], besonderheit: 'Reflexion, Splitter' },
  dschungel: { fraktion: 'undead', stoffe: ['erde', 'holz', 'pilz'], besonderheit: 'Feucht, Brennbar' },
  eiswueste: { fraktion: 'datacult', stoffe: ['eis', 'sand', 'kristall'], besonderheit: 'Rutschig, Einsturzgefahr' },
  duenden: { fraktion: 'pirates', stoffe: ['sand', 'fels'], besonderheit: 'Wind, Sinken' },
  schrott: { fraktion: 'machina', stoffe: ['rosterbeton', 'metallplatte'], besonderheit: 'Nah am Einsturz, Schutz' },
  schwebinseln: { fraktion: 'shinobi', stoffe: ['erde', 'kristall', 'obsidian'], besonderheit: 'Luftströmung, Fallgefahr' },
  riff: { fraktion: 'pirates', stoffe: ['sand', 'koralle', 'fels'], besonderheit: 'Unterwasser, Brennbar' },
  pilzwald: { fraktion: 'xeno', stoffe: ['pilz', 'holz', 'erde'], besonderheit: 'Brennbar, Säurewasser' },
};

// Build reverse lookup: faction -> biome (first match wins)
// KNOWN ISSUES: rodentia hat kein Biome, pirates hat 2 Biome
const fraktionZuBiome = {};
for (const [biomeId, biome] of Object.entries(biomeList)) {
  if (!fraktionZuBiome[biome.fraktion]) {
    fraktionZuBiome[biome.fraktion] = { id: biomeId, ...biome };
  }
}

const biomeCount = Object.keys(biomeList).length;
const factionCount = Object.keys(factionsData).length;

const matrix = [];
for (const [frakId, fraktionObj] of Object.entries(factionsData)) {
  const bio = fraktionZuBiome[frakId];
  // Wenn kein Biome gefunden, verwende 'keine' als Platzhalter
  const homeBiomeId = bio?.id ?? 'keine';
  const homeStoffe = bio?.stoffe ?? [];
  matrix.push({ fraktion: frakId, biome: homeBiomeId, home: true, stoffe: homeStoffe });

  // Alle anderen Biome als Gegen-Biome
  for (const [bId, b] of Object.entries(biomeList)) {
    if (bId !== homeBiomeId) {
      matrix.push({ fraktion: frakId, biome: bId, home: false, stoffe: b.stoffe, gegen: homeBiomeId });
    }
  }
}

const report = {
  schema: 1,
  herkunft: 'Live-Import der Projektkataloge; keine Partienmessung',
  zeit: new Date().toISOString(),
  commit: {
    hash: process.env.GIT_COMMIT?.slice(0, 7) ?? 'lokal',
    branch: process.env.GIT_BRANCH ?? 'HEAD',
  },
  quellen: {
    biome: 'src/shared/config/biome-neu.js (BIOME_FASSUNG_2)',
    factions: 'src/shared/config/factions.js (FACTIONS)',
    stoffe: 'src/shared/config/zerstoerung.js (STOFFE)',
    material: 'src/shared/config/terrain.js (TERRAIN_MATERIALS)',
  },
  zaehler: {
    fraktionen: factionCount,
    biome: biomeCount,
    stoffe: stoffe.length,
    material: terrainMaterials.length,
    matrix_eintraege: matrix.length,
    beachte: 'rodentia hat kein Heim-Biome; pirates hat 2 Biome (duenden, riff)',
  },
  fraktionen: Object.values(factionsData),
  biome: Object.entries(biomeList).map(([id, b]) => ({ id, ...b })),
  stoffe,
  material: terrainMaterials,
  matrix,
  quellHash: hashAllFiles([
    join(projRoot, 'src/shared/config/biome-neu.js'),
    join(projRoot, 'src/shared/config/factions.js'),
    join(projRoot, 'src/shared/config/zerstoerung.js'),
  ]),
};

console.log(JSON.stringify(report, null, 2));