#!/usr/bin/env node
/**
 * Prüft, ob die Kulisse zur Karte passt.
 *
 * ## Warum dieses Werkzeug existiert
 *
 * „Kartengenerator hoch 10, aber ohne dass Menschen Einfluss nehmen können"
 * gilt auch für das AUSSEHEN. Bisher wählte der Spieler die Kulisse aus einer
 * Liste von sechzig; ohne Wahl entschied das Gelände-Preset, welche Kulissen
 * überhaupt in Frage kamen.
 *
 * Mit dem autonomen Generator gibt es kein Preset mehr. Die Zuordnung hängt
 * jetzt am **Charakter der Karte** — und das muss messbar sein, sonst ist es
 * eine Behauptung.
 *
 * ## Was gemessen wird
 *
 * Für viele Seeds: Welchen Charakter hat die Karte, welches Biom folgt daraus,
 * und welche Kulisse wird gewählt. Ein Generator, der immer dasselbe Biom
 * liefert, würde die Landschaften nicht nutzen; einer, dessen Biom nicht zum
 * Charakter passt, erzeugte falsche Bilder.
 *
 * ## Aufruf
 *
 *     node scripts/check-biome.mjs
 *     node scripts/check-biome.mjs --karten=40
 */
import { erzeugeAutonomeKarte } from '../src/shared/terrainGen3.js';
import { biomFuerCharakter, kulisseFuerBiom } from '../src/shared/biomwahl.js';
import { BACKDROP_BIOMES } from '../src/shared/config/backdrops.js';
import { SeededRandom } from '../src/shared/prng.js';

const args = new Map(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));
const ANZAHL = Number(args.get('karten') ?? 30);

console.log(`Kulissenwahl aus dem Kartencharakter (${ANZAHL} Karten)`);
console.log('');

const biomZaehler = new Map();
const kulissenZaehler = new Map();
const zeilen = [];

for (let i = 0; i < ANZAHL; i += 1) {
  const seed = 300000 + i * 4111;
  const k = erzeugeAutonomeKarte({ rng: new SeededRandom(seed), width: 1280, height: 720 });
  const biomId = biomFuerCharakter(k.charakter);
  const biom = BACKDROP_BIOMES.find(b => b.id === biomId);
  const kulisse = kulisseFuerBiom({ seed, biome: biom });

  biomZaehler.set(biomId, (biomZaehler.get(biomId) ?? 0) + 1);
  if (kulisse) {
    kulissenZaehler.set(kulisse.key, (kulissenZaehler.get(kulisse.key) ?? 0) + 1);
  }

  zeilen.push({
    seed,
    wasser: k.charakter.wasser,
    hoehlung: k.charakter.hoehlung,
    inseligkeit: k.charakter.inseligkeit,
    steilheit: k.charakter.steilheit,
    biomId,
    kulisse: kulisse?.label ?? '(keine)',
    biomLabel: biom?.label ?? '?',
  });
}

console.log(`${'Seed'.padEnd(9)}${'Wasser'.padStart(8)}${'Höhl'.padStart(7)}${'Insel'.padStart(7)}${'Steil'.padStart(7)}  ${'Biom'.padEnd(10)}Kulisse`);
console.log('-'.repeat(78));
for (const z of zeilen.slice(0, 20)) {
  console.log(
    `${String(z.seed).padEnd(9)}${z.wasser.toFixed(2).padStart(8)}`
    + `${z.hoehlung.toFixed(2).padStart(7)}${z.inseligkeit.toFixed(2).padStart(7)}`
    + `${z.steilheit.toFixed(2).padStart(7)}  ${z.biomId.padEnd(10)}${z.kulisse}`,
  );
}
if (zeilen.length > 20) console.log(`  ... und ${zeilen.length - 20} weitere`);

console.log('');
console.log('DIE VERTEILUNG DER BIOME');
console.log('');
const sortiert = [...biomZaehler.entries()].sort((a, b) => b[1] - a[1]);
for (const [biomId, n] of sortiert) {
  const balken = '#'.repeat(Math.round((n / ANZAHL) * 50));
  const label = BACKDROP_BIOMES.find(b => b.id === biomId)?.label ?? biomId;
  console.log(`  ${biomId.padEnd(10)} ${String(n).padStart(3)}  ${balken}  ${label}`);
}

console.log('');
console.log('DIE VERTEILUNG DER KULISSEN');
console.log('');
const kulissenSortiert = [...kulissenZaehler.entries()].sort((a, b) => b[1] - a[1]);
console.log(`  Verschiedene Kulissen: ${kulissenZaehler.size} von ${ANZAHL} Karten`);
console.log(`  Häufigste: ${kulissenSortiert.slice(0, 3).map(([k, n]) => `${k} (${n})`).join(', ')}`);

console.log('');
console.log('DIE ZUORDNUNG — IST SIE STIMMIG?');
console.log('');
console.log('  Biom        Merkmal                         Schwelle');
console.log('  ' + '-'.repeat(60));
console.log('  deluge      Wasser                          >= 0,22');
console.log('  caverns     Höhlung                         >= 0,18');
console.log('  island      Inseligkeit                     >= 0,32');
console.log('  alpine      Steilheit                       >= 0,42');
console.log('  forest      alles andere');
console.log('');

/*
 * Die Prüfung: Ist die Zuordnung wirklich ableitend? Ein Biom, das NIE
 * gewählt wird, hat eine Schwelle, die nie erreicht wird — und ein Biom, das
 * fast immer gewählt wird, macht die anderen bedeutungslos.
 */
const nie = Object.keys({ deluge: 1, caverns: 1, island: 1, alpine: 1, forest: 1 })
  .filter(id => !biomZaehler.has(id));

if (nie.length > 0) {
  console.log(`  HINWEIS: Diese Biome kamen nicht vor: ${nie.join(', ')}`);
  console.log('  Die Schwellen liegen damit zu hoch für die gezogenen Charaktere.');
  console.log('  Das ist kein Fehler — aber es heißt, dass diese Landschaften');
  console.log('  in der Praxis selten bis nie zu sehen sind.');
} else {
  console.log('  Alle fünf Biome kamen vor — die Zuordnung nutzt ihren Spielraum.');
}

const haeufigstes = sortiert[0];
if (haeufigstes && haeufigstes[1] / ANZAHL > 0.6) {
  console.log('');
  console.log(`  HINWEIS: „${haeufigstes[0]}" macht ${(haeufigstes[1] / ANZAHL * 100).toFixed(0)} % aus.`);
  console.log('  Die Schwellen sind so gesetzt, dass eine Landschaft dominiert.');
  console.log('  Für mehr Abwechslung müssten sie sinken.');
}
