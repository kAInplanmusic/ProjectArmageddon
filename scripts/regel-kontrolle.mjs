/**
 * Kontrollmessung für Biomregeln (QV-6): dieselben Seeds und dasselbe Biom, nur die Biomregel-Fassung (`config.biomregeln`)
 * wechselt. Je Seed wird ein Bot-Duell gespielt und der Verlaufsschlüssel (Züge/Schüsse/Treffer/Schaden/Sieger/Tick)
 * verglichen: `=` gleich, `Δ` anders. Das zeigt, WO eine Regel den Verlauf ändert; ob sie Spaß macht oder fair ist,
 * sagt die Messung nicht (Spieltest QV-4).
 *
 * Aufruf (Beispiele):
 *   node scripts/regel-kontrolle.mjs --von=4 --bis=5 --biome=klassisch,vulkan,riff
 *   node scripts/regel-kontrolle.mjs --von=2 --bis=3 --biome=kosmos,planet --seeds=4
 *
 * Optionen: `--von`/`--bis` Fassungen (Pflicht), `--biome` Liste (Standard: alle Biome mit Wasser),
 * `--seeds` Anzahl (Standard 4), `--start` erster Seed (Standard 20261111), `--markdown` gibt eine Tabelle aus.
 * Die Duelle laufen auf der Menükarte (24:9 groß) mit allen Menü-Fassungen (`MENUE_FASSUNGEN`).
 */
import { spiele } from './bot-partien.mjs';

const arg = (name, standard) => {
  const treffer = process.argv.find((a) => a.startsWith(`--${name}=`));
  return treffer ? treffer.slice(name.length + 3) : standard;
};

const von = Number(arg('von'));
const bis = Number(arg('bis'));
if (!Number.isInteger(von) || !Number.isInteger(bis)) {
  console.error('Aufruf: node scripts/regel-kontrolle.mjs --von=<Fassung> --bis=<Fassung> [--biome=a,b] [--seeds=4] [--start=20261111] [--markdown]');
  process.exit(2);
}
const biome = arg('biome', 'klassisch,vulkan,riff,tiefsee,dschungel,pilzwald').split(',').map((b) => b.trim()).filter(Boolean);
const anzahl = Number(arg('seeds', '4'));
const start = Number(arg('start', '20261111'));
const markdown = process.argv.includes('--markdown');
const seeds = Array.from({ length: anzahl }, (_, i) => start + i * 7919);

const schluessel = (biom, seed, fassung) => {
  const b = spiele(seed, 4, { teams: 2, proTeam: 1, extra: { biom, biomregeln: fassung, format: '24:9', groesse: 'gross' } });
  return `${b.zuege}/${b.schuesse}/${b.treffer}/${Math.round(b.schaden)}/${b.siegerTeam}/${b.tick}`;
};

const zeilen = [];
for (const biom of biome) {
  const marken = seeds.map((seed) => (schluessel(biom, seed, von) === schluessel(biom, seed, bis) ? '=' : 'Δ'));
  zeilen.push({ biom, marken });
  if (!markdown) console.log(biom.padEnd(18), `Fassung ${von} vs ${bis} je Seed:`, marken.join(' '));
}
if (markdown) {
  console.log(`| Biom | ${seeds.map((_, i) => `Seed ${i + 1}`).join(' | ')} |`);
  console.log(`|---|${seeds.map(() => '---').join('|')}|`);
  for (const z of zeilen) console.log(`| ${z.biom} | ${z.marken.map((m) => (m === '=' ? 'gleich' : 'anders')).join(' | ')} |`);
}
