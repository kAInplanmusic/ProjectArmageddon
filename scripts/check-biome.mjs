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

/*
 * Sonderbiome (config.gelaende 2): Jede Biom-Konfiguration muss eine spielbare Karte liefern.
 * 30 Seed×Biom-Karten über alle Sonderbiome: Spawnpunkte erreichbar, Wasseranteil im Rahmen,
 * Stoffkarte vorhanden und Server/Client gleich.
 */
const { MatchController } = await import('../src/engine/match.js');
const { NEUE_BIOME, SONDERBIOM_IDS } = await import('../src/shared/config/biome-neu.js');
const { stoffHash, zaehleStoffe } = await import('../src/shared/stoffkarte.js');
const { buildTerrainForSeed } = await import('../src/client/terrainPreview.js');

console.log('');
console.log('DIE SONDERBIOME — IST JEDE KONFIGURATION SPIELBAR?');
console.log('');
let fehler = 0;
const proBiom = new Map();
for (let i = 0; i < 30; i += 1) {
  const biom = SONDERBIOM_IDS[i % SONDERBIOM_IDS.length];
  const seed = 700000 + i * 7607;
  const fassung = { gelaende: 2, zerstoerung: 5 };
  const m = new MatchController({ seed, teams: 2, playersPerTeam: 2, kartentyp: 'autonom', biom, maxRounds: 2, turnDurationMs: 2000, ...fassung });
  m.start();
  m.consumeEvents();
  const c = buildTerrainForSeed(seed, 'hills', 'landscape', 'autonom', { ...fassung, biom });
  const wasser = 1 - c.waterLevel / m.height;
  const probleme = [];
  if (!m.erreichbarkeit?.ok) probleme.push(`Spawn nicht erreichbar: ${m.erreichbarkeit?.grund}`);
  if (wasser < 0 || wasser > 0.6) probleme.push(`Wasseranteil ${(wasser * 100).toFixed(0)} %`);
  if (!m.stoffkarte) probleme.push('keine Stoffkarte');
  else if (stoffHash(m.stoffkarte) !== stoffHash(c.stoffkarte)) probleme.push('Client weicht ab');
  const anzahl = m.stoffkarte ? zaehleStoffe(m.stoffkarte, c.bitmap).size : 0;
  if (anzahl < 2) probleme.push('nur ein Stoff');
  const z = proBiom.get(biom) ?? { n: 0, wasser: 0, stoffe: 0 };
  proBiom.set(biom, { n: z.n + 1, wasser: z.wasser + wasser, stoffe: z.stoffe + anzahl });
  if (probleme.length) { fehler += 1; console.log(`  FEHLER ${biom} Seed ${seed}: ${probleme.join('; ')}`); }
}
for (const [biom, z] of proBiom) {
  console.log(`  ${biom.padEnd(15)} ${String(z.n).padStart(2)} Karten  Wasser Ø ${(z.wasser / z.n * 100).toFixed(0).padStart(2)} %  Stoffe Ø ${(z.stoffe / z.n).toFixed(1)}  ${NEUE_BIOME[biom].label}`);
}
console.log('');
console.log(fehler ? `  ${fehler} Karten fehlerhaft` : `  Alle ${SONDERBIOM_IDS.length} Sonderbiome: 30 Karten ohne Fehler.`);
if (fehler) process.exitCode = 1;
