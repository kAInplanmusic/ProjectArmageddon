#!/usr/bin/env node
/**
 * pflichtfelder.mjs — prüft die Pflichtangaben vor einer Miete.
 *
 * Quelle der Wahrheit ist die Tabelle in `docs/betrieb-INSTANZ.md`,
 * Abschnitt 1: die Zeilen `PFLICHT-01` bis `PFLICHT-15`. Dieses Werkzeug
 * entscheidet nicht, ob ein eingetragener Wert richtig ist — es stellt fest,
 * ob ein Feld FEHLT oder noch `LÜCKE` enthält, und ob die technische
 * Vorlage (`deploy/betrieb.env.example`) die genannten `PA_*`-Schalter kennt.
 *
 * Aufruf
 *   node scripts/betrieb/pflichtfelder.mjs            # Klartext, Rückgabewert 0|3|1
 *   node scripts/betrieb/pflichtfelder.mjs --json     # maschinenlesbar
 *   node scripts/betrieb/pflichtfelder.mjs --datei <pfad>
 *
 * Rückgabewerte
 *   0  alle 15 Felder ausgefüllt (kein `LÜCKE` mehr)
 *   3  Vorlage vollständig, aber Felder offen — so wird NICHT gemietet
 *   1  Strukturfehler (Feld fehlt, doppelt, Reihenfolge falsch, Umgebungsvorlage
 *      kennt einen genannten Schalter nicht)
 *
 * Bewusst ohne Netz, ohne Server, ohne Secrets.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WURZEL = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DOKUMENT = join(WURZEL, 'docs/betrieb-INSTANZ.md');
const UMGEBUNG = join(WURZEL, 'deploy/betrieb.env.example');

/**
 * Die 15 Felder mit der Bedeutung, die der Test und die Doku teilen.
 * `begriff` ist ein Muster, das im Feldnamen vorkommen MUSS — damit ein
 * versehentlich vertauschtes Feld auffällt und nicht nur die Anzahl stimmt.
 */
export const FELDER = [
  { id: 'PFLICHT-01', begriff: /Name/i },
  { id: 'PFLICHT-02', begriff: /Zweck/i },
  { id: 'PFLICHT-03', begriff: /Instanztyp/i },
  { id: 'PFLICHT-04', begriff: /Preis pro Stunde/i },
  { id: 'PFLICHT-05', begriff: /Besitzer/i },
  { id: 'PFLICHT-06', begriff: /Höchstdauer/i },
  { id: 'PFLICHT-07', begriff: /PA_MAX_MACHINE_MINUTES/ },
  { id: 'PFLICHT-08', begriff: /PA_MAX_RUNTIME_MINUTES/ },
  { id: 'PFLICHT-09', begriff: /PA_IDLE_MINUTES/ },
  { id: 'PFLICHT-10', begriff: /PA_ACTION/ },
  { id: 'PFLICHT-11', begriff: /PA_SNAPSHOT_KEEP/ },
  { id: 'PFLICHT-12', begriff: /Hostname/i },
  { id: 'PFLICHT-13', begriff: /Alarm außerhalb/i },
  { id: 'PFLICHT-14', begriff: /TLS/i },
  { id: 'PFLICHT-15', begriff: /GB/ },
];

export function pruefePflichtfelder(datei = DOKUMENT, umgebungsDatei = UMGEBUNG) {
  const text = readFileSync(datei, 'utf8');
  const umgebung = readFileSync(umgebungsDatei, 'utf8');
  const gefunden = [];
  text.split('\n').forEach((zeile, index) => {
    const treffer = zeile.match(/^\|\s*(PFLICHT-\d{2})\s*\|([^|]*)\|([^|]*)\|/);
    if (treffer) gefunden.push({ id: treffer[1], name: treffer[2].trim(), wert: treffer[3].trim(), zeile: index + 1 });
  });

  const fehler = [];
  if (gefunden.length !== FELDER.length) {
    fehler.push(`Es sind ${gefunden.length} Pflichtfeld-Zeilen, erwartet ${FELDER.length}.`);
  }
  FELDER.forEach((erwartet, position) => {
    const eintrag = gefunden[position];
    if (!eintrag) return;
    if (eintrag.id !== erwartet.id) {
      fehler.push(`Position ${position + 1}: ${eintrag.id} statt ${erwartet.id} (Zeile ${eintrag.zeile}).`);
    }
    if (!erwartet.begriff.test(eintrag.name)) {
      fehler.push(`${erwartet.id}: Feldname „${eintrag.name}" enthält nicht ${erwartet.begriff}.`);
    }
    // Die ID muss auch in der Checkliste (Abschnitt 4) stehen.
    if (!new RegExp(`^- \\[ \\] \\*\\*${erwartet.id}\\*\\*`, 'm').test(text)) {
      fehler.push(`${erwartet.id}: fehlt in der Checkliste (Abschnitt 4).`);
    }
    // Ein Feld ohne Wert ist keine Angabe, sondern ein offener Punkt.
    if (!eintrag.wert) fehler.push(`${erwartet.id}: Wert ist leer (auch kein LÜCKE).`);
  });

  // Jeder in der Tabelle genannte PA_*-Schalter muss in der Umgebungsvorlage stehen.
  const paSchalter = new Set();
  for (const eintrag of gefunden) {
    for (const treffer of eintrag.name.matchAll(/PA_[A-Z_]+/g)) paSchalter.add(treffer[0]);
  }
  for (const schalter of paSchalter) {
    if (!new RegExp(`^#?\\s*${schalter}=`, 'm').test(umgebung)) {
      fehler.push(`${schalter} fehlt in deploy/betrieb.env.example.`);
    }
  }

  const offen = gefunden.filter(feld => /LÜCKE/.test(feld.wert)).map(feld => feld.id);
  const vollstaendig = gefunden.length === FELDER.length && fehler.length === 0;
  return { vollstaendig, offen, felder: gefunden.map(({ id, name, wert }) => ({ id, name, wert })), fehler };
}

function main() {
  const args = process.argv.slice(2);
  let datei = DOKUMENT;
  let alsJson = false;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--json') alsJson = true;
    else if (arg === '--datei') { datei = resolve(args[i + 1] ?? ''); i += 1; }
    else if (arg === '--hilfe' || arg === '-h') {
      console.log('Aufruf: node scripts/betrieb/pflichtfelder.mjs [--json] [--datei <docs/betrieb-INSTANZ.md>]');
      return 0;
    } else {
      console.error(`Unbekannte Option: ${arg}`);
      return 1;
    }
  }

  let bericht;
  try {
    bericht = pruefePflichtfelder(datei);
  } catch (error) {
    console.error(`FEHLER: ${datei} nicht prüfbar (${error.message})`);
    return 1;
  }
  const { vollstaendig, offen, felder, fehler } = bericht;

  if (alsJson) {
    console.log(JSON.stringify(bericht, null, 2));
  } else {
    console.log('Pflichtangaben vor der Miete (docs/betrieb-INSTANZ.md, Abschnitt 1)');
    console.log(`  Datei          : ${datei}`);
    console.log(`  Felder         : ${felder.length}/${FELDER.length}`);
    console.log(`  Offen (LÜCKE)  : ${offen.length ? offen.join(', ') : 'keine'}`);
    for (const eintrag of felder) {
      console.log(`  ${/LÜCKE/.test(eintrag.wert) ? 'OFFEN ' : 'ok    '} ${eintrag.id}  ${eintrag.name}`);
    }
    if (fehler.length) {
      console.log('\nStrukturfehler:');
      for (const eintrag of fehler) console.log(`  - ${eintrag}`);
    }
    if (!fehler.length && offen.length) {
      console.log(`\nERGEBNIS: ${offen.length} Pflichtangabe(n) offen — es wird NICHT gemietet (AGENTS.md §5/§7).`);
    } else if (!fehler.length) {
      console.log('\nERGEBNIS: alle Pflichtangaben eingetragen. Der Nachweis (Abschnitt 3) bleibt davon getrennt.');
    }
  }

  if (fehler.length || !vollstaendig) return 1;
  return offen.length ? 3 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
