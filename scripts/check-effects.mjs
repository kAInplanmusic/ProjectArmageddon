#!/usr/bin/env node
/**
 * Prüft, ob die WIRKFELDER des Waffenkatalogs im Motor auch ankommen.
 *
 * ## Warum dieses Werkzeug
 *
 * FUND (belegt, 2026-09-20): Drei Felder standen in der Designdatei und im
 * erzeugten Katalog, aber **kein Stück Motorlas sie**:
 *
 *   homing   > 0 bei 2 Waffen   (Phönix-Angriff, Fliegendes Superschaf)
 *   piercing > 0 bei 6 Waffen   (Scharfschützengewehr, Armbrust, Plasma-…)
 *   aoe          bei 54 Waffen  — und widersprach bei 2 Waffen dem Radius
 *
 * Ein Feld ohne Leser ist eine Zusage ohne Wirkung: Der Spieler liest
 * „durchschlägt", „zielsuchend", „flächig" — und nichts davon geschieht. Ein
 * einzelner Blick in den Code findet das nicht zuverlässig; dieser Wächter tut es
 * bei jedem Lauf.
 *
 * ## Was geprüft wird
 *
 * 1. **Jedes Wirkfeld hat einen Leser im Motor** (`src/engine/**`). Gesucht wird
 *    der Feldname als Eigenschaftszugriff — dieselbe Methode, mit der dieses
 *    Projekt schon einmal 974 Zeilen toten Code gefunden hat.
 * 2. **Die Invarianten der Felder** untereinander:
 *      `aoe`      ⇔ `blastRadius > 0`        (eine Aussage, eine Quelle)
 *      `homing>0` ⇒ Projektil                (wer zielt, fliegt)
 *      `piercing>0` ⇒ Projektil              (Durchschlag braucht einen Flugweg)
 *
 * Exit-Code 1 bei einem Verstoß — der Lauf ist dann keine Freigabe.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const hier = dirname(fileURLToPath(import.meta.url));
const root = resolve(hier, '..');
const { WEAPONS } = await import(join(root, 'src', 'shared', 'config', 'weapons.js'));

/** Alle Dateien unter `verzeichnis` (rekursiv). */
function sammle(verzeichnis) {
  const raus = [];
  for (const eintrag of readdirSync(verzeichnis)) {
    const pfad = join(verzeichnis, eintrag);
    if (statSync(pfad).isDirectory()) raus.push(...sammle(pfad));
    else if (pfad.endsWith('.js')) raus.push(pfad);
  }
  return raus;
}

/*
 * Der MOTOR ist die Quelle der Wahrheit — der Katalog und die Datendatei zählen
 * nicht: Sie BEHAUPTEN die Wirkung, sie erzeugen sie nicht. Deshalb wird nur in
 * `src/engine` gesucht (plus die geteilte Ballistik, die der Motor benutzt).
 */
const motorDateien = [...sammle(join(root, 'src', 'engine')),
  join(root, 'src', 'shared', 'ballistics.js')];

/**
 * Die Wirkfelder — und wie sie im Motor gelesen werden.
 *
 * `muster` ist absichtlich ein Eigenschaftszugriff: `piercing` in einem
 * Kommentar oder in einem Test zählt NICHT als Leser (nur der Motor pfad wird
 * durchsucht, doch auch dort wäre Prosa kein Leser).
 */
const WIRKFELDER = [
  { feld: 'damage', muster: /['"]damage['"]/, was: 'Schaden' },
  { feld: 'blastRadius', muster: /['"]blastRadius['"]/, was: 'Flächenwirkung' },
  { feld: 'knockback', muster: /['"]knockback['"]/, was: 'Rückstoß' },
  { feld: 'terrainDamage', muster: /['"]terrainDamage['"]/, was: 'Terrainschaden' },
  { feld: 'bounces', muster: /['"]bounces['"]/, was: 'Abpraller' },
  { feld: 'homing', muster: /['"]homing['"]/, was: 'Zielsuche' },
  {
    // Der Katalog nennt das Feld `piercing`, das GESCHOSS trägt `pierce` (der
    // Komponentenspeicher führt Zahlenfelder). Beides muss zusammenpassen.
    feld: 'piercing',
    muster: /['"]pierce['"]/,
    was: 'Durchschlag',
  },
  { feld: 'elemental', muster: /elemental/, was: 'Elementarschaden' },
];

let verstoesse = 0;
const fehler = (text) => { verstoesse += 1; console.error(`  VERSTOSS: ${text}`); };

console.log('Wirkfelder im Motor\n');
console.log('  Feld                Verbraucher                  Waffen mit Wert');
console.log('  ------------------- ---------------------------- ---------------');
for (const eintrag of WIRKFELDER) {
  const leser = motorDateien.filter(pfad => eintrag.muster.test(readFileSync(pfad, 'utf8')));
  const kurz = leser.map(pfad => pfad.slice(root.length + 1).replace('src/engine/', '').replace('src/shared/', ''));

  /* Wie viele Waffen tragen überhaupt einen Wert? Ein Feld ohne Wert braucht
   * keinen Leser — ein Feld MIT Wert und ohne Leser ist der Fehler. */
  const mitWert = WEAPONS.filter(waffe => {
    if (eintrag.feld === 'elemental') {
      const e = waffe.elemental ?? {};
      return (e.fire ?? 0) + (e.ice ?? 0) + (e.poison ?? 0) > 0;
    }
    const wert = waffe[eintrag.feld];
    return typeof wert === 'number' ? wert > 0 : Boolean(wert);
  }).length;

  console.log(`  ${eintrag.feld.padEnd(19)} ${String(kurz.length ? kurz[0] : '—').padEnd(28)} ${mitWert}`);
  if (mitWert > 0 && leser.length === 0) {
    fehler(`"${eintrag.feld}" (${eintrag.was}) steht bei ${mitWert} Waffen, aber kein `
      + 'Motorcode liest es — eine Zusage ohne Wirkung.');
  }
}

console.log('\nInvarianten\n');
const falschesAoe = WEAPONS.filter(waffe => waffe.aoe !== (waffe.blastRadius > 0));
if (falschesAoe.length > 0) {
  fehler(`aoe widerspricht dem Radius bei ${falschesAoe.length} Waffen: `
    + falschesAoe.map(waffe => `${waffe.id} (aoe=${waffe.aoe}, Radius=${waffe.blastRadius})`).join(', '));
} else {
  console.log(`  aoe = (blastRadius > 0)            : ok für alle ${WEAPONS.length} Waffen`);
}

const zielendOhneFlug = WEAPONS.filter(waffe => waffe.homing > 0 && waffe.delivery !== 'projectile');
if (zielendOhneFlug.length > 0) {
  fehler(`Zielsuche ohne Flugweg: ${zielendOhneFlug.map(waffe => waffe.id).join(', ')}`);
} else {
  console.log(`  homing > 0 ⇒ Projektil             : ok (${WEAPONS.filter(w => w.homing > 0).length} Waffen)`);
}

const durchschlagOhneFlug = WEAPONS.filter(waffe => waffe.piercing > 0 && waffe.delivery !== 'projectile');
if (durchschlagOhneFlug.length > 0) {
  fehler(`Durchschlag ohne Flugweg: ${durchschlagOhneFlug.map(waffe => waffe.id).join(', ')}`);
} else {
  console.log(`  piercing > 0 ⇒ Projektil           : ok (${WEAPONS.filter(w => w.piercing > 0).length} Waffen)`);
}

console.log(`\nWaffen: ${WEAPONS.length} | Verstöße: ${verstoesse}`);
if (verstoesse > 0) {
  console.error('\nDie Designdatei verspricht Wirkungen, die der Motor nicht ausführt.');
  process.exitCode = 1;
}
