#!/usr/bin/env node
/**
 * Prüft die Designdatei `project_armageddon_weapons_v1.json` gegen den Code.
 *
 * ## Warum dieses Werkzeug existiert
 *
 * Ein Audit fand: Das Feld `mechanic.targeting` widerspricht bei 11 Waffen der
 * Wirkung, die der Motor ableitet. Die Quelldatei nennt Heilzauber, Eisschild
 * und Auto-Turret „directional", obwohl sie nachweislich auf den **Schützen**
 * wirken.
 *
 * Die Datei ist die **Designdatei des Auftraggebers** — sie wird nicht
 * automatisch geändert. Dieses Werkzeug MELDET den Widerspruch, statt ihn zu
 * beheben: Es zeigt genau, welche Einträge betroffen sind und was zu ändern
 * wäre, damit die Entscheidung dort fällt, wo die Daten herkommen.
 *
 * ## Aufruf
 *
 *     node scripts/check-weapon-targeting.mjs           # Bericht
 *     node scripts/check-weapon-targeting.mjs --strict  # Exit 1 bei Widerspruch
 *
 * Der `--strict`-Modus ist für den Wächter gedacht: Er soll anschlagen, wenn
 * neue Widersprüche dazukommen.
 *
 * ## Warum das kein Fehler ist, sondern eine Unschärfe
 *
 * Bei 139 von 150 Waffen stimmen Feld und Wirkung überein. `targeting` ist in
 * der Designdatei der undifferenzierte Normalfall (125× `directional`), auch
 * für Waffen, die auf sich selbst wirken. Nur `flight` und `teleport` sind als
 * `self_or_area` verschlagwortet.
 *
 * Der Motor geht nach der WIRKUNG — das ist die verlässliche Quelle. Das Feld
 * zu verdrahten würde 11 Waffen falsch steuern (ein Heilzauber als Angriff).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { WEAPONS } from '../src/shared/config/weapons.js';
import { buildEffect, SELF_TARGET_KINDS } from '../src/engine/specials.js';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HIER, '..');
const QUELLE = path.join(ROOT, 'project_armageddon_weapons_v1.json');

const streng = process.argv.includes('--strict');

if (!fs.existsSync(QUELLE)) {
  console.error(`FEHLER: Designdatei nicht gefunden: ${QUELLE}`);
  process.exit(2);
}

/** Die Rohdaten der Designdatei, nach Waffen-ID. */
function rohdaten() {
  const daten = JSON.parse(fs.readFileSync(QUELLE, 'utf8'));
  const liste = daten.weapons ?? daten;
  const karte = new Map();
  for (const w of liste) karte.set(w.id, w);
  return karte;
}

const roh = rohdaten();

/**
 * Vergleicht für jede Waffe die Angabe der Designdatei mit der Wirkung im Code.
 *
 * @returns {{gleich:number, anders:Array}}
 */
export function vergleiche() {
  const anders = [];
  let gleich = 0;

  for (const waffe of WEAPONS) {
    const eintrag = roh.get(waffe.id);
    if (!eintrag) continue;

    const datenSagen = eintrag.mechanic?.targeting ?? null;
    const effekt = buildEffect(waffe);
    const wirktAufSelbst = Boolean(effekt && SELF_TARGET_KINDS.has(effekt.kind));

    if (datenSagen === null) continue; // keine Angabe: nichts zu vergleichen

    const datenSagenSelbst = datenSagen === 'self_or_area';
    if (datenSagenSelbst === wirktAufSelbst) gleich += 1;
    else {
      anders.push({
        id: waffe.id,
        name: waffe.displayName,
        special: waffe.special,
        wirkung: effekt?.kind ?? null,
        datenSagen,
        // Die Korrektur, die in der Designdatei zu machen wäre.
        vorschlag: wirktAufSelbst ? 'self_or_area' : 'directional',
      });
    }
  }

  return { gleich, anders };
}

// ------------------------------------------------------------- Bericht
const { gleich, anders } = vergleiche();
const gesamt = gleich + anders.length;

console.log('Waffen-Designprüfung: targeting gegen Wirkung');
console.log(`  Quelle        : ${path.basename(QUELLE)}`);
console.log(`  Verglichen    : ${gesamt} Waffen`);
console.log(`  Übereinstimmend: ${gleich}`);
console.log(`  Widersprüche  : ${anders.length}`);

if (anders.length > 0) {
  console.log('\n  Die Designdatei nennt diese Waffen "directional", der Motor erkennt');
  console.log('  sie als selbstbezogen. Die Korrektur wäre in der DESIGNDATEI zu machen:');
  console.log('');
  console.log('  ID       Name                   special            Wirkung        Vorschlag');
  for (const a of anders) {
    console.log(
      `  ${a.id}  ${a.name.padEnd(22)} ${String(a.special).padEnd(18)} `
      + `${String(a.wirkung).padEnd(14)} ${a.vorschlag}`,
    );
  }
  console.log('\n  WARUM DAS KEIN CODE-FEHLER IST:');
  console.log('  Der Motor leitet die Unterscheidung aus der WIRKUNG ab (SELF_TARGET_KINDS)');
  console.log('  und ist damit die verlässliche Quelle. Das Feld zu verdrahten würde diese');
  console.log('  Waffen falsch steuern — ein Heilzauber würde zum Angriff.');
  console.log('\n  Die Designdatei ist handgepflegt; die Entscheidung liegt beim Auftraggeber.');
  console.log('  Ein Test (tests/weapon-targeting.test.js) hält den Widerspruch fest.');
}

if (streng && anders.length > 0) {
  console.error(`\nFEHLER (--strict): ${anders.length} Widersprüche zwischen Designdatei und Wirkung.`);
  process.exit(1);
}

process.exit(0);
