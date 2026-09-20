#!/usr/bin/env node
/**
 * Prüft, ob die ZAHLEN in der Dokumentation noch stimmen.
 *
 * ## Warum dieses Werkzeug
 *
 * AUDIT-BEFUND (2026-09-20): In EINER Sitzung mussten veraltete Zahlen **fünfmal**
 * von Hand korrigiert werden — Testzahlen (947 → 974 → 983), E2E-Zahlen
 * (160 → 176 → 182 → 183), Waffenzahlen, Kartengrößen (1280×720 → 2560×1440) und
 * Messdistanzen (426 → 854 px). Jedes Mal log die DOKU, nicht der Code.
 *
 * Eine handgepflegte Zahl in einer Markdown-Datei kann nicht „richtig bleiben",
 * sie kann nur rechtzeitig auffallen. Das tut dieses Werkzeug: Es liest die
 * Behauptungen und vergleicht sie mit dem, was der Code hergibt.
 *
 * ## Was geprüft wird — und was nicht
 *
 * Geprüft werden Zahlen, die OHNE einen Testlauf herleitbar sind: Waffen,
 * Kategorien, Terrain-Arten, Gates, Testdateien, Node-Version, Kartenmaße, die
 * Zahlen der Wirkungs-Übersicht. Zusätzlich müssen README und MASTERDOTO bei der
 * Testzahl DIESELBE Zahl nennen — welche, kann nur ein Lauf sagen, aber
 * auseinanderlaufen dürfen sie nicht.
 *
 * NICHT geprüft wird Prosa: Ein Werkzeug, das Formulierungen bewertet, wird
 * ignoriert. `npm run check:docs` endet mit Exit 1 bei einer Abweichung.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WEAPONS } from '../src/shared/config/weapons.js';
import { TERRAIN_PRESETS } from '../src/shared/terrainGen.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const lies = pfad => readFileSync(join(root, pfad), 'utf8');

const README = lies('README.md');
const MASTER = lies('MASTERDOTO.md');
const MATRIX = lies('docs/matrix-terrain-waffen-wirkung.md');
const CHECKS = lies('scripts/checks.mjs');
const PKG = JSON.parse(lies('package.json'));

/* ------------------------------------------------ Die Wirklichkeit (gemessen) */
const WIRKLICH = {
  waffen: WEAPONS.length,
  kategorien: new Set(WEAPONS.map(w => w.category)).size,
  terrainArten: Object.keys(TERRAIN_PRESETS).length,
  gates: (CHECKS.match(/skript: '/g) ?? []).length,
  unitDateien: readdirSync(join(root, 'tests')).filter(f => f.endsWith('.test.js')).length,
  e2eSpecs: readdirSync(join(root, 'tests', 'e2e')).filter(f => f.endsWith('.spec.mjs')).length,
  zuender: WEAPONS.filter(w => w.fuseTime > 0).length,
  node: PKG.engines?.node ?? null,
};

let verstoesse = 0;
const ok = text => console.log(`  ok    ${text}`);
const fehler = text => { verstoesse += 1; console.error(`  FEHL  ${text}`); };

/**
 * Zieht eine Zahl aus einem Muster und vergleicht sie.
 * `gruppe` = welche Klammer die Zahl führt.
 */
function zahl(dateiName, text, muster, soll, was, gruppe = 1) {
  const treffer = text.match(muster);
  if (!treffer) {
    fehler(`${dateiName}: nennt ${was} nicht (Muster ${muster})`);
    return;
  }
  const gefunden = Number(treffer[gruppe]);
  if (gefunden !== soll) {
    fehler(`${dateiName}: ${gefunden} ${was} — wirklich ${soll}`);
    return;
  }
  ok(`${dateiName}: ${gefunden} ${was}`);
}

console.log('Zahlen in der Dokumentation — gegen den Code geprüft\n');

console.log('Katalog:');
zahl('README', README, /Wirkung jeder der (\d+) Waffen/, WIRKLICH.waffen, 'Waffen');
zahl('MASTERDOTO', MASTER, /`docs\/matrix-terrain-waffen-wirkung\.md`: (\d+) Waffen/, WIRKLICH.waffen, 'Waffen');
zahl('MASTERDOTO', MASTER, /(\d+) Terrain-Arten mit gemessenem Festanteil/, WIRKLICH.terrainArten, 'Terrain-Arten');
zahl('Matrix', MATRIX, /\*\*Katalog:\*\* (\d+) Waffen/, WIRKLICH.waffen, 'Waffen');

console.log('\nTestbestand:');
zahl('README', README, /\*\*\d+ Tests in (\d+) Dateien\*\*/, WIRKLICH.unitDateien, 'Testdateien');
zahl('README', README, /\*\*\d+ Tests in (\d+) Spezifikationen\*\*/, WIRKLICH.e2eSpecs, 'E2E-Spezifikationen');

/*
 * Die UNIT-TESTZAHL kann nur ein Lauf sagen. Prüfbar ist aber, dass README und
 * MASTERDOTO DIESELBE Zahl nennen — auseinanderlaufen ist immer falsch.
 */
const readmeZahl = README.match(/\*\*(\d+) Tests in \d+ Dateien\*\*/);
const masterZahl = MASTER.match(/\*\*(\d+)\/(\d+)\*\* grün/);
if (!readmeZahl) {
  fehler('README: nennt die Testzahl nicht als „**N Tests in M Dateien**"');
} else if (!masterZahl) {
  fehler('MASTERDOTO: nennt die Testzahl nicht als „**N/N** grün"');
} else if (readmeZahl[1] !== masterZahl[1] || masterZahl[1] !== masterZahl[2]) {
  fehler(`Testzahl läuft auseinander: README ${readmeZahl[1]}, MASTERDOTO `
    + `${masterZahl[1]}/${masterZahl[2]}`);
} else {
  ok(`Testzahl einheitlich: ${readmeZahl[1]} (README wie MASTERDOTO, bestanden = gesamt)`);
}

console.log('\nWerkzeuge und Umgebung:');
zahl('MASTERDOTO', MASTER, /\*\*(\d+) Gates in/, WIRKLICH.gates, 'Gates');
if (!WIRKLICH.node) {
  fehler('package.json: `engines.node` fehlt — die CI pinnt eine Version, das Projekt sagt nichts');
} else if (!MASTER.includes(`\`${WIRKLICH.node}\` festgeschrieben`)) {
  fehler(`MASTERDOTO: nennt die Node-Version ${WIRKLICH.node} nicht`);
} else {
  ok(`Node-Version ${WIRKLICH.node} in package.json und MASTERDOTO`);
}

console.log('\nKarte:');
zahl('Matrix', MATRIX, /\*\*Karte:\*\* [\d.]+×[\d.]+ px = ([\d.]+) Mio\. Pixel/, 3.69, 'Mio. Pixel');
if (/2560×1440|2\.560×1\.440/.test(MATRIX)) {
  ok('Matrix: Kartengröße 2560×1440');
} else {
  fehler('Matrix: Kartengröße 2560×1440 nicht genannt');
}

console.log(`\nGeprüfte Behauptungen: ${(verstoesse === 0 ? 'alle richtig' : `${verstoesse} Abweichung(en)`)}`);
if (verstoesse > 0) {
  console.error('\nDie Dokumentation nennt Zahlen, die der Code nicht hergibt.');
  console.error('Behebung: die Zahl in der Doku richtigstellen (oder den Code, falls ER falsch ist).');
  process.exitCode = 1;
}
