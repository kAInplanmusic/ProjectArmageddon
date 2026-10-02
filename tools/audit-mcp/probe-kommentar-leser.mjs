#!/usr/bin/env node
/**
 * Gegenprobe für die Blindstelle 5/6 (2026-10-02):
 * Kommentarnennungen von Export-Namen und Konstantennamen zählen als Leser.
 *
 * WICHTIG: Diese Datei darf die reellen Ziel-Namen (`applySelfEffect`,
 * `renderGroundOnGpu`) NICHT als String-Literal in nicht-kommentiertem Code
 * enthalten — sonst würde `unbenutzteExporte()` des ECHTEN Baums sie als Leser
 * zählen und die Messung dort verfälschen (der selbe Effekt, den dieser Fix
 * behebt). Stattdessen werden hier PLACEHOLDER-Namen verwendet, die nirgendwo
 * anders im Baum vorkommen, damit sie den echten Lauf nicht beeinflussen.
 *
 * Der echte Baum wird getrennt in `probe-real-repo.mjs` (oder manuell via
 * `node tools/audit-mcp/server.mjs --ruf audit_deadcode`) geprüft; diese Sonde
 * prüft ausschliesslich den Mechanismus in einem Temp-Projekt.
 *
 * Aufruf:  node tools/audit-mcp/probe-kommentar-leser.mjs
 * Exit-Code 0 = alle Erwartungen erfüllt, 1 = mindestens eine verletzt.
 *
 * MESSREGEL (2026-10-02 teuer gelernt): Diese Sonde gegen eine KOPIE des Baums
 * halten, nie gegen den Baum, in dem sie liegt. Ihr eigener Kopf nennt die
 * Ziel-Namen in Kommentaren — in einem Baum OHNE den Fix zaehlen genau diese
 * Kommentare als Leser und VERDECKEN die Funde (gemessen: 7 -> 5). Wer dann
 * schliesst „der Fix wirkt nicht“, hat die Sonde gemessen, nicht den Code.
 *
 * ZWEITE REGEL: immer nur EINE Aenderung im Baum, dann messen. Ein gleichzeitig
 * laufender zweiter Fix hat hier schon einmal den Zuwachs zugeschrieben bekommen,
 * der ihm nicht gehoerte.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const PROJEKT = path.resolve(HIER, '..', '..');

// PLACEHOLDER-Namen: kollidieren mit keinem Namen im echten Baum, damit diese
// Datei den echten Audit-Lauf nicht verfälscht.
const NAME_NUR_IM_KOMMENTAR = 'NurImKommentarExport';
const NAME_ECHTER_IMPORT = 'EchterImportExport';
const NAME_ECHTE_KONSTANTE = 'ECHTE_KONSTANTE_IM_TEST';

let fehler = 0;
const pruefe = (titel, erwartet, gemessen, ok) => {
  console.log(`\n${ok ? 'OK  ' : 'FEHL'} ${titel}`);
  console.log(`     ERWWARTET: ${erwartet}`);
  console.log(`     GEMESSEN: ${gemessen}`);
  if (!ok) fehler += 1;
};

/** Baut ein Temp-PROJEKT mit einer KOPIE des Werkzeugs (`lib/`) und eigenem `src/`. */
function baueProjekt(prefix) {
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), `audit-mcp-${prefix}-`));
  const ziel = path.join(wurzel, 'tools', 'audit-mcp');
  fs.mkdirSync(ziel, { recursive: true });
  fs.cpSync(path.join(HIER, 'lib'), path.join(ziel, 'lib'), { recursive: true });
  fs.mkdirSync(path.join(wurzel, 'src'), { recursive: true });
  return wurzel;
}

function schreibe(wurzel, relativ, inhalt) {
  const voll = path.join(wurzel, relativ);
  fs.mkdirSync(path.dirname(voll), { recursive: true });
  fs.writeFileSync(voll, inhalt);
}

/** Führt einen Ausdruck in der KOPIE aus und liefert sein JSON-Ergebnis. */
function messeIn(wurzel, ausdruck) {
  const lib = path.join(wurzel, 'tools', 'audit-mcp', 'lib', 'statisch.mjs');
  const quelle = `import * as S from ${JSON.stringify(lib)};\n`
    + `console.log(JSON.stringify(${ausdruck}));`;
  const aus = execFileSync(process.execPath, ['--input-type=module', '-e', quelle], {
    encoding: 'utf8', cwd: wurzel, timeout: 60_000,
  });
  return JSON.parse(aus);
}

console.log('Gegenprobe: Kommentarnennungen dürfen keine Leser sein');
console.log(`Projekt: ${PROJEKT}`);

const w = baueProjekt('kommentar');

/*
 * Fall (a) — NUR-Kommentar-Nennung zählt NICHT als Leser.
 *
 *  src/a/nur-kommentar-export.js  definiert  `export function <NAME>() {}`
 *  ein zweites Modul erwähnt den Namen NUR in einem Block-Kommentar.
 *  Erwartet: der Name ist UNGELESEN (muss in den unbenutzten Exporten stehen).
 */
schreibe(w, 'src/a/nur-kommentar-export.js', `export function ${NAME_NUR_IM_KOMMENTAR}() { return 1; }\n`);
schreibe(w, 'src/b/kommentar-erwaehnt.js', [
  '/*',
  ` * \`${NAME_NUR_IM_KOMMENTAR}\` ist hier nur als Notiz enthalten — kein echter Import.`,
  ' */',
  'export const y = 1;',
].join('\n'));

/*
 * Fall (b) — echter Import: Name bleibt gelesen (kein Fehlalarm).
 */
schreibe(w, 'src/a/echter-export.js', `export function ${NAME_ECHTER_IMPORT}() { return 2; }\n`);
schreibe(w, 'src/c/echter-import.js', [
  `import { ${NAME_ECHTER_IMPORT} } from '../a/echter-export.js';`,
  `export const z = ${NAME_ECHTER_IMPORT}();`,
].join('\n'));

/*
 * Fall (b) — Konstante, die wirklich genutzt wird, darf NICHT als unbenutzt
 * gemeldet werden (streicheKommentare darf sie nicht überdecken).
 */
schreibe(w, 'src/a/echte-konstante.js', [
  `export const ${NAME_ECHTE_KONSTANTE} = 42;`,
  `export const nutzer = () => ${NAME_ECHTE_KONSTANTE} + 1;`,
].join('\n'));

const exporte = messeIn(w, 'S.unbenutzteExporte()');
const konstanten = messeIn(w, 'S.unbenutzteKonstanten()');

const nurKommentarGefunden = exporte.find(e => e.name === NAME_NUR_IM_KOMMENTAR);
const echterImportGefunden = exporte.find(e => e.name === NAME_ECHTER_IMPORT);
const konstGefunden = konstanten.find(k => k.name === NAME_ECHTE_KONSTANTE);

pruefe(
  'a) NUR-Kommentar-Nennung (Export): Name gilt als ungelesen',
  `${NAME_NUR_IM_KOMMENTAR} ist in den unbenutzten Exporten (kein Leser)`,
  nurKommentarGefunden
    ? `gefunden: ${nurKommentarGefunden.datei}:${nurKommentarGefunden.name} · art=${nurKommentarGefunden.art}`
    : 'NICHT gefunden — Kommentar wurde fälschlicherweise als Leser gezählt',
  Boolean(nurKommentarGefunden),
);
pruefe(
  'a) Bestätigung: der Kommentar-Name hat keinen echten Leser',
  'leserAusserhalb === 0 (nur interne Verwendung)',
  nurKommentarGefunden
    ? `leserAusserhalb=${nurKommentarGefunden.leserAusserhalb} · intern=${nurKommentarGefunden.verwendungenInDerDatei}`
    : '—',
  Boolean(nurKommentarGefunden && nurKommentarGefunden.leserAusserhalb === 0),
);

pruefe(
  'b) Echter Import (Export): Name bleibt gelesen (kein Fehlalarm)',
  `${NAME_ECHTER_IMPORT} ist NICHT in den unbenutzten Exporten`,
  echterImportGefunden
    ? `FAHLALARM: ${echterImportGefunden.datei}:${echterImportGefunden.name}`
    : 'nicht gelistet (richtig gelesen)',
  !echterImportGefunden,
);

pruefe(
  'b) Echte Konstante: wirklich genutzte Konstante ist NICHT als unbenutzt gemeldet',
  `${NAME_ECHTE_KONSTANTE} nicht in der Liste`,
  konstGefunden ? `FAHLALARM: ${konstGefunden.datei}:${konstGefunden.name}` : 'nicht gelistet (richtig)',
  !konstGefunden,
);

console.log(`\n${fehler === 0 ? 'Alle Erwartungen erfüllt.' : `${fehler} Erwartung(en) verletzt.`}`);
process.exit(fehler === 0 ? 0 : 1);
