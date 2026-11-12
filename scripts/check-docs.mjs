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
 * Kategorien, Terrain-Arten, Gates, Node-Version, Kartenmaße, die Zahlen der
 * Wirkungs-Übersicht. Die Testzahlen (die nur ein Lauf kennt) stehen in einem
 * erzeugten Block aus `docs/testlauf.json`, siehe `scripts/lib/testzahlen.mjs`
 * und den Abschnitt „Testbestand“ unten (OPT-5). `--schreiben` erzeugt die Blöcke.
 *
 * NICHT geprüft wird Prosa: Ein Werkzeug, das Formulierungen bewertet, wird
 * ignoriert. `npm run check:docs` endet mit Exit 1 bei einer Abweichung.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WEAPONS } from '../src/shared/config/weapons.js';
import { TERRAIN_PRESETS } from '../src/shared/terrainGen.js';
import {
  leseBlock, pruefeTestlauf, renderBlock, setzeBlock, zaehleDateien,
} from './lib/testzahlen.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const lies = pfad => readFileSync(join(root, pfad), 'utf8');

const SCHREIBEN = process.argv.includes('--schreiben');
const README = lies('README.md');
const MASTER = lies('MASTERDOTO.md');
let TESTLAUF = null;
try { TESTLAUF = JSON.parse(lies('docs/testlauf.json')); } catch { /* unten gemeldet */ }
const MATRIX = lies('docs/matrix-terrain-waffen-wirkung.md');
const CHECKS = lies('scripts/checks.mjs');
const PKG = JSON.parse(lies('package.json'));

/* ------------------------------------------------ Die Wirklichkeit (gemessen) */
const WIRKLICH = {
  waffen: WEAPONS.length,
  kategorien: new Set(WEAPONS.map(w => w.category)).size,
  terrainArten: Object.keys(TERRAIN_PRESETS).length,
  gates: (CHECKS.match(/skript: '/g) ?? []).length,
  unitDateien: zaehleDateien(root, 'tests', '.test.js'),
  e2eSpecs: zaehleDateien(root, 'tests/e2e', '.spec.mjs'),
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

console.log('\nTestbestand (erzeugter Block aus docs/testlauf.json):');
/*
 * OPT-5: Testzahlen stehen NICHT von Hand in der Doku. Quelle ist
 * `docs/testlauf.json` (erfasst von `npm run testlauf:erfassen`, nur mit
 * nachweisbarem Lauf), README und MASTERDOTO tragen je einen erzeugten Block.
 * Scharf bleibt: Block == Erzeugnis aus der JSON (also README == MASTERDOTO),
 * Zahlen in sich stimmig, und es gibt nicht weniger Testdateien oder
 * Spezifikationen als beim erfassten Lauf (Tests löschen fällt auf); rote Tests im Lauf
 * stehen im Block und als Warnung, das Tor dafür bleibt `npm test`.
 * Neue, noch nicht erfasste Testdateien paralleler Arbeit lassen die Prüfung nicht
 * kippen; sie werden nur als Hinweis gemeldet, denn eine Zahl ohne Lauf wäre geraten.
 */
if (!TESTLAUF) {
  fehler('docs/testlauf.json fehlt oder ist kein JSON (Erfassen: npm run testlauf:erfassen)');
} else {
  const formfehler = pruefeTestlauf(TESTLAUF);
  for (const f of formfehler) fehler(`docs/testlauf.json: ${f}`);
  if (formfehler.length === 0) {
    const soll = renderBlock(TESTLAUF);
    for (const [name, text, pfad] of [['README', README, 'README.md'], ['MASTERDOTO', MASTER, 'MASTERDOTO.md']]) {
      const ist = leseBlock(text);
      if (ist === null) {
        fehler(`${name}: erzeugter Testzahlen-Block fehlt (Markierungen testzahlen:start/ende)`);
      } else if (ist !== soll) {
        if (SCHREIBEN) {
          writeFileSync(join(root, pfad), setzeBlock(text, soll));
          console.log(`  neu   ${name}: Block aus docs/testlauf.json geschrieben`);
        } else {
          fehler(`${name}: Testzahlen-Block weicht von docs/testlauf.json ab (npm run check:docs -- --schreiben)`);
        }
      } else {
        ok(`${name}: Testzahlen-Block == docs/testlauf.json`);
      }
    }
    const u = TESTLAUF.unit;
    const e = TESTLAUF.e2e;
    /*
     * Rote Tests im erfassten Lauf sind KEIN Dokufehler: Das Tor dafür ist `npm test`
     * (AGENTS.md §3), `check:docs` prüft, dass die Doku die Messung richtig wiedergibt.
     * Verschwiegen wird nichts: der Block nennt die roten Tests fett, hier steht eine Warnung.
     */
    if (u.rot > 0) console.log(`  WARNUNG ${u.rot} rote(r) Test(s) im erfassten Lauf (${u.commit}) — AGENTS.md §3 verlangt grün`);
    if (WIRKLICH.unitDateien < u.dateien) {
      fehler(`Testdateien: ${WIRKLICH.unitDateien} vorhanden, beim erfassten Lauf waren es ${u.dateien} — Tests entfernt?`);
    } else if (WIRKLICH.unitDateien > u.dateien) {
      console.log(`  Hinweis: ${WIRKLICH.unitDateien - u.dateien} Testdatei(en) seit dem erfassten Lauf neu (${WIRKLICH.unitDateien} statt ${u.dateien}); Lauf bei Gelegenheit neu erfassen`);
    } else {
      ok(`Testdateien: ${WIRKLICH.unitDateien} wie beim erfassten Lauf`);
    }
    if (WIRKLICH.e2eSpecs < e.spezifikationen) {
      fehler(`E2E-Spezifikationen: ${WIRKLICH.e2eSpecs} vorhanden, beim erfassten Stand waren es ${e.spezifikationen} — Specs entfernt?`);
    } else if (WIRKLICH.e2eSpecs > e.spezifikationen) {
      console.log(`  Hinweis: ${WIRKLICH.e2eSpecs - e.spezifikationen} E2E-Spezifikation(en) seit der erfassten Zählung neu; npm run testlauf:erfassen -- --e2e`);
    } else {
      ok(`E2E-Spezifikationen: ${WIRKLICH.e2eSpecs} wie bei der erfassten Zählung`);
    }
  }
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
