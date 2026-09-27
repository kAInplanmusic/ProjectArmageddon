#!/usr/bin/env node
/**
 * Gegenprobe für die vier Blindstellen der EIGENEN Werkzeuge (2026-09-27).
 *
 * Aufruf:  node tools/audit-mcp/probe-blindstellen.mjs
 * Exit-Code 0 = alle Erwartungen erfüllt, 1 = mindestens eine verletzt.
 *
 * ## Warum diese Datei existiert
 *
 * Ein Prüfer hat belegt, dass die Meldung `0` dieses Werkzeugs für DREI Fragen
 * korrekt war und für DREI andere blind — ein Werkzeug, das 0 meldet, weil es
 * nicht hinschaut, erzeugt Vertrauen und ist damit gefährlicher als eines, das
 * schweigt. Belegt waren:
 *
 *   1. `QUELTEXT` kannte kein `.json` → die drei Datendateien unter `src/`
 *      (168 979 B) mit null Lesern erschienen in KEINER Meldung.
 *   2. `EINSTIEG` fing jedes `index.js` → auch das code-leere
 *      `src/shared/data/index.js`. Der Freispruch war still, die Prüfung maß an
 *      dieser Stelle nichts.
 *   3. `doppelregeln()` sah nur `const GROSSBUCHSTABEN` → mehrfach definierte
 *      FUNKTIONEN blieben unsichtbar (`hasSpecialEffect` stand mit ZWEI
 *      unvereinbaren Regeln im Baum, gemeldet wurde 0).
 *   4. Der „kein Importeur"-Wächter deckte 30 von 90 Dateien
 *      (`tests/no-dead-code.test.js` lief nur über `src/engine/`).
 *
 * Diese Datei hält die Reparatur fest und prüft sie in BEIDE Richtungen:
 * gefunden werden MUSS der echte Gegenstand — und NICHT gefunden werden darf
 * der Scheintreffer. Der zweite Teil ist der wichtigere: dieselbe Werkzeugfamilie
 * hat sich die Lehre „Kommentarzeilen sind keine Treffer" schon einmal selbst
 * eingebaut, weil drei von drei Treffern Kommentare waren.
 *
 * ## Der Aufbau (und warum er so ist)
 *
 * Gemessen wird gegen eine KOPIE unter `/tmp` (wie `probe-stand.mjs`): der echte
 * Baum wird nicht angefasst, weil parallel andere Worker in `src/` schreiben.
 * Fall B stellt den belegten Zustand AUS DER GIT-HISTORIE wieder her
 * (`git show HEAD:src/engine/specials.js`) und zeigt, dass der neue Detektor ihn
 * findet — unabhängig davon, ob der Fall im Baum inzwischen repariert ist.
 *
 * Fall F misst den ECHTEN Baum und ist absichtlich in BEIDE Richtungen
 * formuliert: steht `hasSpecialEffect` dort als Code, MUSS es gefunden werden;
 * steht es dort nur noch als Notiz (so war der Stand nach der Reparatur in
 * `src/`), darf `src/engine/specials.js` NICHT als Definitionsort erscheinen.
 * Ein Kommentar ist kein Treffer.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  toteDaten, datenDateien, doppelregeln, modulDefinitionen, einstiegspunkt,
  streicheKommentare, sichtgrenzen, DOPPELREGEL_AUSNAHMEN_QUELLE,
} from './lib/statisch.mjs';

const HIER = path.dirname(fileURLToPath(import.meta.url));
/** Die Projektwurzel: `tools/audit-mcp` liegt zwei Ebenen darunter. */
const PROJEKT = path.resolve(HIER, '..', '..');

let fehler = 0;
const pruefe = (titel, erwartet, gemessen, ok) => {
  console.log(`\n${ok ? 'OK  ' : 'FEHL'} ${titel}`);
  console.log(`     ERWARTET: ${erwartet}`);
  console.log(`     GEMESSEN: ${gemessen}`);
  if (!ok) fehler += 1;
};

/**
 * Baut ein Temp-PROJEKT mit einer KOPIE des Werkzeugs und einem EIGENEN `src/`.
 *
 * Kopiert wird NUR `lib/`, nicht das ganze Werkzeugverzeichnis. Grund (belegte
 * Falle, an der diese Probe zuerst selbst gescheitert ist): `toteDaten()` liest
 * eine Pfad-NENNUNG im Code als Leser. Eine kopierte `probe-blindstellen.mjs`
 * nennt die synthetischen Dateien (`src/daten/ungelesen.json`) — und würde sie
 * damit alle freisprechen. Wer eine Textsuche aus einer Kopie heraus prüft, muss
 * dafür sorgen, dass der Prüfer nicht im Prüfgebiet liegt.
 *
 * `src/` wird als echtes Verzeichnis angelegt (nicht als Symlink): ein Symlink
 * würde jeden synthetischen Schreibzugriff in den PRODUKTIVBAUM umleiten — genau
 * das, was diese Probe ausschließen soll.
 */
function baueProjekt(prefix) {
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), `audit-mcp-${prefix}-`));
  const ziel = path.join(wurzel, 'tools', 'audit-mcp');
  fs.mkdirSync(ziel, { recursive: true });
  fs.cpSync(path.join(HIER, 'lib'), path.join(ziel, 'lib'), { recursive: true });
  fs.mkdirSync(path.join(wurzel, 'src'), { recursive: true });
  return wurzel;
}

/** Schreibt eine Datei samt Verzeichnis. */
function schreibe(wurzel, relativ, inhalt) {
  const voll = path.join(wurzel, relativ);
  fs.mkdirSync(path.dirname(voll), { recursive: true });
  fs.writeFileSync(voll, inhalt);
}

/**
 * Führt einen Ausdruck in der KOPIE aus und liefert sein JSON-Ergebnis.
 *
 * Nicht der Import in den eigenen Prozess: `ROOT` in `lib/repo.mjs` wird aus dem
 * ORT DER DATEI gebildet. Nur ein Prozess, der die Kopie lädt, sieht die Kopie.
 */
function messeIn(wurzel, ausdruck) {
  const lib = path.join(wurzel, 'tools', 'audit-mcp', 'lib', 'statisch.mjs');
  const quelle = `import * as S from ${JSON.stringify(lib)};\n`
    + `console.log(JSON.stringify(${ausdruck}));`;
  const aus = execFileSync(process.execPath, ['--input-type=module', '-e', quelle], {
    encoding: 'utf8', cwd: wurzel, timeout: 60_000,
  });
  return JSON.parse(aus);
}

console.log('Gegenprobe: die vier Blindstellen der eigenen Werkzeuge');
console.log(`Projekt: ${PROJEKT}`);

/* ────────────────────────────────────────────────────────────────────────────
 * A. Die Messfunktion selbst: was ist eine Definition, was nicht
 * ─────────────────────────────────────────────────────────────────────────── */
const trap = [
  'export function hasSpecialEffect(weapon) {',
  "  return effectFor(weapon?.special) !== null;",
  '}',
  '',
  '/*',
  ' * HIER STAND `hasSpecialEffect()` — eine ZWEITE Antwort auf dieselbe Frage.',
  ' */',
  '// export function hasSpecialEffect(weapon) {',
  'const LOKAL = 1;',
  'function lokal() {',
  '  const hasSpecialEffect = 2;',
  '  let LOKAL2 = 3;',
  '}',
].join('\n');
const defs = modulDefinitionen(trap);
const namen = defs.map(d => `${d.name}@${d.zeile}`);
pruefe(
  'A1) `modulDefinitionen`: Modul-Ebene zählt, Kommentar und lokale Größe nicht',
  'gefunden: hasSpecialEffect@1, LOKAL@9, lokal@10 — NICHT: Zeile 6 (Blockkommentar), Zeile 8 (auskommentiert), Zeilen 11/12 (Spalte 2)',
  `gefunden: ${namen.join(', ')}`,
  defs.length === 3
    && namen.includes('hasSpecialEffect@1')
    && namen.includes('LOKAL@9')
    && namen.includes('lokal@10')
    && !defs.some(d => d.zeile === 6 || d.zeile === 8 || d.zeile === 11 || d.zeile === 12),
);

const gefiltert = streicheKommentare(trap);
pruefe(
  'A2) `streicheKommentare` entfernt Block- UND Zeilenkommentar (die Lehre „Kommentare sind keine Treffer")',
  'roh 4× `hasSpecialEffect` → gefiltert 2× (nur die echten Code-Zeilen 1 und 11); Block- und Zeilenkommentar sind weg',
  `roh: ${(trap.match(/hasSpecialEffect/g) ?? []).length}× · gefiltert: ${(gefiltert.match(/hasSpecialEffect/g) ?? []).length}× · „HIER STAND" noch da: ${gefiltert.includes('HIER STAND')} · auskommentierte Definition noch da: ${/\/\/ export function/.test(gefiltert)}`,
  (trap.match(/hasSpecialEffect/g) ?? []).length === 4
    && (gefiltert.match(/hasSpecialEffect/g) ?? []).length === 2
    && !gefiltert.includes('HIER STAND')
    && !/\/\/ export function/.test(gefiltert),
);

/* ────────────────────────────────────────────────────────────────────────────
 * B. Der belegte Gegenstand aus der GIT-HISTORIE: hasSpecialEffect
 * ─────────────────────────────────────────────────────────────────────────── */
const b = baueProjekt('blind-b');
const headFassung = execFileSync('git', ['show', 'HEAD:src/engine/specials.js'],
  { cwd: PROJEKT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
schreibe(b, 'src/engine/specials.js', headFassung);
fs.mkdirSync(path.join(b, 'src', 'shared', 'config'), { recursive: true });
fs.copyFileSync(path.join(PROJEKT, 'src', 'shared', 'config', 'weapons.js'),
  path.join(b, 'src', 'shared', 'config', 'weapons.js'));

const bDoppelt = messeIn(b, 'S.doppelregeln()');
const bTreffer = bDoppelt.find(d => d.name === 'hasSpecialEffect') ?? null;
const bOrte = bTreffer?.orte ?? [];
pruefe(
  'B1) Der Detektor FINDET `hasSpecialEffect` an ZWEI Orten (HEAD-Fassung, zwei unvereinbare Regeln)',
  'ein Eintrag hasSpecialEffect mit je einem Ort in specials.js und weapons.js',
  bTreffer ? `orte: ${bOrte.join(' · ')} · dateien: ${bTreffer.dateien}` : 'KEIN Treffer',
  Boolean(bTreffer)
    && bTreffer.dateien === 2
    && bOrte.some(o => o.startsWith('src/engine/specials.js:'))
    && bOrte.some(o => o.startsWith('src/shared/config/weapons.js:')),
);

/*
 * Die Regelrümpfe werden ÜBER DEN FUND DER DEFINITION gelesen, nicht über ein
 * festes Zeilenfenster: `src/shared/config/weapons.js` ist GENERIERT und wird
 * beim nächsten `npm run weapons:build` verschoben — ein Fenster „Zeile
 * 7125–7135" wäre beim nächsten Lauf falsch. (Beim ersten Lauf dieser Probe war
 * er es: die Datei hatte sich unter dem laufenden Test geändert.)
 */
const rumpfAb = (text, marke, zeilen = 5) => {
  const z = text.split('\n');
  const i = z.findIndex(x => x.startsWith(marke));
  return i < 0 ? '' : z.slice(i, i + zeilen).join(' ');
};
const weaponsText = fs.readFileSync(path.join(b, 'src', 'shared', 'config', 'weapons.js'), 'utf8');
const specialsRumpf = rumpfAb(headFassung, 'export function hasSpecialEffect');
const weaponsRumpf = rumpfAb(weaponsText, 'export function hasSpecialEffect');
pruefe(
  'B2) Die zwei Regeln sind wirklich unterschiedlich (nicht nur der Name doppelt)',
  'specials-Regel nennt `effectFor`, weapons-Regel nennt `SPECIAL_WITHOUT_DAMAGE`',
  `specials: ${specialsRumpf.replace(/\s+/g, ' ')} || weapons: ${weaponsRumpf.replace(/\s+/g, ' ')}`,
  /effectFor/.test(specialsRumpf) && /SPECIAL_WITHOUT_DAMAGE/.test(weaponsRumpf),
);

/* ────────────────────────────────────────────────────────────────────────────
 * C–E. Datendateien, Einstiegspunkte, mehrzeilige Importe (ein Temp-Projekt)
 * ─────────────────────────────────────────────────────────────────────────── */
const c = baueProjekt('blind-c');

/* C: drei Datendateien mit drei Beurteilungen */
schreibe(c, 'src/daten/ungelesen.json', '{ "a": 1 }\n');               // nur in Doku genannt
schreibe(c, 'src/daten/nurdoku.json', '{ "b": 2 }\n');                 // nur im KOMMENTAR genannt
schreibe(c, 'src/daten/gelesen.json', '{ "c": 3 }\n');                 // echter Leser (mehrzeilig)
schreibe(c, 'src/code/liest.js', [
  "import {",
  '  daten,',
  "} from '../daten/gelesen.json';",
  'export const x = daten;',
  '',
].join('\n'));
schreibe(c, 'src/code/nurkommentar.js', [
  "// hier stand frueher: liest '../daten/nurdoku.json'",
  'export const y = 1;',
  '',
].join('\n'));
schreibe(c, 'docs/notiz.md', 'Die Datei `src/daten/ungelesen.json` ist ein Archivstand.\n');

const cDaten = messeIn(c, 'S.toteDaten()');
const cNamen = cDaten.map(x => x.datei);
pruefe(
  'C1) `toteDaten` findet die Datendatei, die NUR IM BERICHT genannt wird (Doku ist kein Leser)',
  'src/daten/ungelesen.json ist in der Trefferliste',
  `Treffer: ${cNamen.join(', ') || '—'}`,
  cNamen.includes('src/daten/ungelesen.json'),
);
pruefe(
  'C2) Kein Fehlalarm: die WIRKLICH gelesene Datei darf nicht erscheinen',
  'src/daten/gelesen.json ist NICHT in der Trefferliste (mehrzeiliger Import zählt)',
  `Treffer: ${cNamen.join(', ') || '—'}`,
  !cNamen.includes('src/daten/gelesen.json'),
);
pruefe(
  'C3) Kein Fehlalarm: der Name im `//`-Kommentar ist kein Leser',
  'src/daten/nurdoku.json IST ein Treffer (nur der Kommentar nannte den Namen)',
  `Treffer: ${cNamen.join(', ') || '—'}`,
  cNamen.includes('src/daten/nurdoku.json'),
);
pruefe(
  'C4) `toteDaten` nennt die Bezugsgröße (geprüfte Gesamtzahl), nicht nur die Treffer',
  `geprüft = ${messeIn(c, 'S.datenDateien().length')} Dateien · Treffer = 2`,
  `geprüft = ${messeIn(c, 'S.datenDateien().length')} · Treffer = ${cDaten.length}`,
  messeIn(c, 'S.datenDateien().length') === 3 && cDaten.length === 2,
);

/* D: Einstiegspunkte — der Name allein reicht nicht */
schreibe(c, 'package.json', JSON.stringify({
  main: 'src/server/index.js',
  scripts: { validate: "node -e \"import('./src/shared/index.js')\"" },
}, null, 2));
schreibe(c, 'index.html', '<script type="module" src="/src/client/main.js"></script>\n');
schreibe(c, 'vite.config.mjs', 'export default { root: "." };\n');
schreibe(c, 'playwright.config.mjs', 'export default { testDir: "tests" };\n');
schreibe(c, 'src/server/index.js', 'export const server = 1;\n');
schreibe(c, 'src/shared/index.js', 'export const shared = 1;\n');
schreibe(c, 'src/client/main.js', 'export const main = 1;\n');
schreibe(c, 'src/shared/data/index.js', '// leer — keine Anweisung\n');
schreibe(c, 'src/shared/neu/index.js', 'export const neu = 1;\n');

const aeusser = messeIn(c, '[...S.genanntePfade(S.aeussereBezugnahmen())]');
const cEinstieg = messeIn(c, "S.einstiegspunkte().map(e => e.datei)");
const cTote = messeIn(c, 'S.toteDateien().map(t => t.datei)');
pruefe(
  'D1) Einstiegspunkt NUR mit Beleg: namentlich genannt UND nicht code-leer',
  'belegt: src/server/index.js, src/shared/index.js, src/client/main.js',
  `belegt: ${cEinstieg.join(', ') || '—'} (genannte Pfade: ${aeusser.join(', ')})`,
  cEinstieg.includes('src/server/index.js')
    && cEinstieg.includes('src/shared/index.js')
    && cEinstieg.includes('src/client/main.js')
    && cEinstieg.length === 3,
);
pruefe(
  'D2) Der LEERE `index.js` ist kein Einstiegspunkt mehr — er wird geprüft und gemeldet',
  'src/shared/data/index.js steht in `toteDateien()`',
  `toteDateien: ${cTote.join(', ') || '—'}`,
  cTote.includes('src/shared/data/index.js'),
);
pruefe(
  'D3) Ein `index.js` mit Code, das NIEMAND nennt, ist ebenfalls kein Einstiegspunkt',
  'src/shared/neu/index.js steht in `toteDateien()`',
  `toteDateien: ${cTote.join(', ') || '—'}`,
  cTote.includes('src/shared/neu/index.js'),
);
pruefe(
  'D4) Kein Fehlalarm: die BELEGTEN Einstiegspunkte bleiben freigesprochen',
  'src/server/index.js und src/client/main.js erscheinen NICHT in `toteDateien()`',
  `toteDateien: ${cTote.join(', ') || '—'}`,
  !cTote.includes('src/server/index.js') && !cTote.includes('src/client/main.js'),
);
const dLeer = einstiegspunkt('src/shared/data/index.js', '// leer — keine Anweisung\n', new Set());
pruefe(
  'D5) Das Urteil wird BEGRÜNDET, nicht behauptet',
  'der Grund nennt „KEINEN Code (nur Kommentare)"',
  `grund: ${dLeer.grund}`,
  /KEINEN Code/.test(dLeer.grund),
);

/* E: die Falle des Prüfers selbst — mehrzeilige Importe */
schreibe(c, 'src/code/ziel.js', 'export const ziel = 1;\n');
schreibe(c, 'src/code/import-formen.js', [
  "import {",
  '  ziel,',
  "} from './ziel.js';",
  '',
].join('\n'));
schreibe(c, 'src/code/import-umbruch.js', [
  'import { ziel }',
  "  from './ziel.js';",
  '',
].join('\n'));
schreibe(c, 'src/code/import-klammer.js', 'const m = await import(\n  "./ziel.js"\n);\n');
const eImporteure = messeIn(
  c,
  "[...S.importIndex()].filter(([k]) => k.endsWith('ziel.js')).map(([, v]) => v.length)[0] ?? 0",
);
pruefe(
  'E1) Mehrzeilige Importe werden erfasst (die Falle des ersten Scanners: 127 Phantom-Verletzungen)',
  '3 Importeure der Datei `src/code/ziel.js` — Form A `import {\\n...\\n} from`, Form B `import {...}\\n from`, Form C `import(...)`',
  `Importeure: ${eImporteure}`,
  eImporteure === 3,
);

/* ────────────────────────────────────────────────────────────────────────────
 * F. Der ECHTE Baum — in beide Richtungen
 * ─────────────────────────────────────────────────────────────────────────── */
const fDaten = toteDaten();
const fBytes = fDaten.reduce((s, x) => s + x.bytes, 0);
console.log(`\nIst-Stand im echten Baum: ${datenDateien().length} .json unter src/ · `
  + `${fDaten.length} ohne Leser · ${fBytes} Byte · Dateien: ${fDaten.map(x => x.datei).join(', ') || '—'}`);
pruefe(
  'F1) Der echte Baum: jede gemeldete Datendatei hat einen LESER-Beweis von 0 (nicht nur eine Zahl)',
  'jeder Eintrag hat `leser === 0` und `bytes > 0`',
  `Einträge: ${fDaten.length} · alle leser=0: ${fDaten.every(x => x.leser === 0)} · Bytesumme: ${fBytes}`,
  fDaten.every(x => x.leser === 0 && x.bytes > 0),
);

const specialsText = fs.readFileSync(path.join(PROJEKT, 'src', 'engine', 'specials.js'), 'utf8');
const specialsCode = streicheKommentare(specialsText);
const imCode = /^\s*(?:export\s+)?(?:async\s+)?(?:const|let|var|function|class)\s+hasSpecialEffect\s*[=(]/m
  .test(specialsCode);
const imKommentar = !imCode && specialsText.includes('hasSpecialEffect');
const fDoppelt = doppelregeln();
const fOrteSpecials = fDoppelt.filter(d => d.orte.some(o => o.startsWith('src/engine/specials.js:')));
pruefe(
  'F2) Der echte Baum: `hasSpecialEffect` wird genau dann gemeldet, wenn es dort CODE ist',
  imCode
    ? 'Code vorhanden → Eintrag hasSpecialEffect MUSS erscheinen'
    : `nur Notiz vorhanden → src/engine/specials.js darf NICHT als Ort erscheinen (gemessene Doppelregeln: ${fDoppelt.map(d => d.name).join(', ') || '—'})`,
  imCode
    ? `gemessen: ${fDoppelt.filter(d => d.name === 'hasSpecialEffect').map(d => d.orte.join(' · ')).join(' | ') || 'KEIN Treffer'}`
    : `im Roh-Text: ${specialsText.includes('hasSpecialEffect')} · im Code: ${imCode} · Orte in specials.js: ${fOrteSpecials.length}`,
  imCode
    ? fDoppelt.some(d => d.name === 'hasSpecialEffect' && d.dateien >= 2)
    : fOrteSpecials.length === 0 && imKommentar,
);
if (!imCode) {
  console.log('     (Hinweis: `hasSpecialEffect` steht im echten Baum nur noch als Notiz — '
    + 'der Gegenstand selbst wurde in `src/` repariert; Fall B hält ihn aus der Historie fest.)');
}

/* G. Die Sichtgrenzen sind Teil JEDER Antwort — sonst ist „0" nicht lesbar */
const grenzen = sichtgrenzen();
pruefe(
  'G1) Die Sichtgrenze nennt Quelltext- UND Datenfilter wörtlich',
  'eine Zeile nennt die nicht erfassten Endungen, eine die .json unter src/',
  `quelltext: ${grenzen.quelltext}`,
  /NICHT als Quelltext/.test(grenzen.quelltext) && /Dateifilter Daten/.test(grenzen.daten),
);
pruefe(
  'G2) Die Sichtgrenze benennt die verbleibende Namen-statt-Bindungen-Schwäche des Exportzählers',
  'der Text nennt `hasSpecialEffect` und die Maskierung durch den zweiten Export',
  `exporte: ${grenzen.exporte.slice(0, 120)}…`,
  /hasSpecialEffect/.test(grenzen.exporte) && /BINDUNGEN/.test(grenzen.exporte),
);
pruefe(
  'G3) Die Aussage über den Ausnahme-Ort ist zitierbar',
  `${DOPPELREGEL_AUSNAHMEN_QUELLE}`,
  DOPPELREGEL_AUSNAHMEN_QUELLE,
  DOPPELREGEL_AUSNAHMEN_QUELLE.endsWith('statisch.mjs (DOPPELREGEL_AUSNAHMEN)'),
);

console.log(`\n${fehler === 0 ? 'Alle Erwartungen erfüllt.' : `${fehler} Erwartung(en) verletzt.`}`);
process.exit(fehler === 0 ? 0 : 1);
