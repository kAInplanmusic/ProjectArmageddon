/**
 * Tests: Verkabelung der Katalogfelder — hat jedes Feld einen Leser?
 *
 * ## Die Fehlerklasse, die dieser Test schliesst
 *
 * Ein Feld im Katalog beweist nichts. Es beweist erst etwas, wenn eine Stelle
 * im Produktcode es LIEST und die Wirkung davon abhängt. Dieses Projekt hat
 * schon zweimal die Folgen getragen:
 *
 *  - `damageType` stand bei 26 von 150 Waffen pauschal auf `physical`, und der
 *    Motor las das Feld nirgends,
 *  - `requiresLineOfSight` stand bei ALLEN 150 auf `false` — eine Zusage ohne
 *    Wirkung.
 *
 * Beide sind geheilt (Schadensart und Sichtlinie werden jetzt gelesen). Der
 * Test sichert nicht die beiden Einzelfälle, sondern die REGEL: Jedes Feld des
 * erzeugten Katalogs muss entweder einen Leser ausserhalb der Katalogdatei
 * haben oder in der Begruendungsliste des Generators stehen.
 *
 * ## Was gemessen wird
 *
 *  1. Der Katalog hat genau die dokumentierten Feldnamen. Ein neues Feld, das
 *     der Generator von irgendwoher mitschleppt (der Fall `cooldownTurns`, ein
 *     Schattenfeld von `cooldown` bei vier Waffen), faellt hier auf.
 *  2. Jedes Feld ohne Leser steht in `FELDER_OHNE_PRODUKTLESER_BEWUSST` (mit
 *     Grund) oder in `FELDER_OHNE_PRODUKTLESER_OFFEN` (gemeldete Luecke).
 *  3. Die bekannte Luecke `effectMagnitude` ist in ZAHLEN festgehalten: Der
 *     Motor befragt den Wert nicht. Dieser Test schlaegt absichtlich fehl, wenn
 *     jemand den Leser nachtraegt — dann muss er die Luecke austragen.
 *
 * ## Grenze der Messung (bewusst)
 *
 * Der Leser wird ueber den FELDNAMEN im Quelltext gesucht (`weapon.feld` oder
 * `'feld'`), in `src/**` ohne die Katalogdatei selbst, und ohne Kommentare. Das
 * ist eine Textmessung: Ein Treffer kann ein Schreibvorgang sein statt eines
 * Lesevorgangs, oder ein fremdes Feld desselben Namens — belegte Beispiele:
 * `kopf.dataset.subcategory` (DOM-Attribut, kein Waffenfeld) und
 * `crate.rarity` (Feld der KISTE).
 *
 * Die Messung irrt damit in die SICHERE Richtung: Sie erkennt eher einen Leser
 * zu VIEL als zu wenig. Kein Feld wird faelschlich als „ohne Leser" gemeldet und
 * stillschweigend geduldet; die als ungelesen gemeldeten Felder sind zusaetzlich
 * von Hand nachgeprueft (siehe `docs/waffen-verkabelung.md`, Abschnitt 3).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { WEAPONS } from '../src/shared/config/weapons.js';
import {
  FELDER_OHNE_PRODUKTLESER_BEWUSST,
  FELDER_OHNE_PRODUKTLESER_OFFEN,
} from '../scripts/build-weapon-catalog.mjs';
import { SPECIAL_DEFAULTS, buildEffect } from '../src/engine/specials.js';
import { ohneKommentare } from './helfer/ohne-kommentare.js';

const HIER = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HIER, '..');
const KATALOG = join(ROOT, 'src', 'shared', 'config', 'weapons.js');

/**
 * Die Feldnamen des Katalogs — dokumentierte Erwartung.
 *
 * 41 Namen; eine Waffe traegt 40 davon, die acht Waffen mit eigener Identitaet
 * 41 (`concept`). Diese Liste ist die Gegenprobe gegen ein durchgereichtes
 * Fremdfeld: Was hier nicht steht, darf nicht im Katalog stehen.
 */
const KATALOG_FELDER = [
  'aoe', 'blastRadius', 'bounces', 'category', 'concept', 'cooldown', 'cooldownSource',
  'damage', 'damageSource', 'damageType', 'damageTypeSource', 'delivery', 'displayName',
  'effectMagnitude', 'elemental', 'fuseIntent', 'fuseTime', 'gravityScale', 'homing', 'icon',
  'iconPath', 'id', 'index', 'internalName', 'knockback', 'maxAmmo', 'maxRange', 'piercing',
  'powerScore', 'powerTier', 'projectileSpeed', 'rarity', 'requiresLineOfSight',
  'requiresLineOfSightSource', 'sourceRarity', 'special', 'speedFactor', 'strikeStyle',
  'subcategory', 'targeting', 'terrainDamage',
];

/** Alle JS-Dateien unter `verzeichnis` (rekursiv). */
function javascriptDateien(verzeichnis) {
  const raus = [];
  for (const eintrag of readdirSync(verzeichnis)) {
    const pfad = join(verzeichnis, eintrag);
    if (statSync(pfad).isDirectory()) raus.push(...javascriptDateien(pfad));
    else if (pfad.endsWith('.js')) raus.push(pfad);
  }
  return raus;
}

/** Quelltext ohne Kommentare — Prosa ist kein Leser. */

const PRODUKT_DATEIEN = javascriptDateien(join(ROOT, 'src'))
  .filter(pfad => pfad !== KATALOG)
  .map(pfad => ({ pfad: relative(ROOT, pfad), text: ohneKommentare(readFileSync(pfad, 'utf8')) }));

/** Felder, die irgendwo in `src/**` als Eigenschaft gelesen werden. */
function felderMitLeser() {
  const mitLeser = new Map();
  for (const { pfad, text } of PRODUKT_DATEIEN) {
    for (const feld of KATALOG_FELDER) {
      const re = new RegExp(`(?:\\.${feld}\\b|['"]${feld}['"])`);
      if (re.test(text)) {
        if (!mitLeser.has(feld)) mitLeser.set(feld, []);
        mitLeser.get(feld).push(pfad.replace('src/', ''));
      }
    }
  }
  return mitLeser;
}

const MIT_LESER = felderMitLeser();
const OHNE_LESER = KATALOG_FELDER.filter(feld => !MIT_LESER.has(feld));

test('Der Katalog traegt genau die dokumentierten Feldnamen', () => {
  const gefunden = [...new Set(WEAPONS.flatMap(waffe => Object.keys(waffe)))].sort();
  assert.deepEqual(gefunden, [...KATALOG_FELDER].sort(),
    'Ein Feld steht im Katalog, das hier nicht dokumentiert ist — oder umgekehrt. '
    + 'Ein durchgereichtes Fremdfeld (Beispiel: `cooldownTurns`) faellt hier auf.');
});

test('Jede Waffe traegt 40 oder 41 Felder — keines fehlt', () => {
  for (const waffe of WEAPONS) {
    const anzahl = Object.keys(waffe).length;
    assert.ok(anzahl === 40 || anzahl === 41,
      `${waffe.id} (${waffe.displayName}) traegt ${anzahl} Felder statt 40/41`);
    // `concept` ist der einzige ungleiche Feldname: nur die acht Identitaeten.
    const hatConcept = Object.prototype.hasOwnProperty.call(waffe, 'concept');
    assert.equal(hatConcept, anzahl === 41,
      `${waffe.id}: concept und Feldzahl passen nicht zusammen`);
  }
});

test('Jedes Feld ohne Leser ist mit Begruendung dokumentiert', () => {
  const unbekannt = OHNE_LESER.filter(feld => !(feld in FELDER_OHNE_PRODUKTLESER_BEWUSST)
    && !(feld in FELDER_OHNE_PRODUKTLESER_OFFEN));
  assert.deepEqual(unbekannt, [],
    'Diese Katalogfelder liest niemand in src/**, und sie stehen in keiner der beiden '
    + 'Begruendungslisten von scripts/build-weapon-catalog.mjs. Ein Feld ohne Leser ist '
    + 'keine Eigenschaft, sondern eine Behauptung: entweder verdrahten oder begruenden.');

  // Jede Begruendung muss ein Grund sein, kein Platzhalter.
  for (const [feld, grund] of Object.entries({
    ...FELDER_OHNE_PRODUKTLESER_BEWUSST, ...FELDER_OHNE_PRODUKTLESER_OFFEN,
  })) {
    assert.ok(typeof grund === 'string' && grund.length > 40,
      `Begruendung fuer "${feld}" ist zu kurz, um eine zu sein`);
  }
});

test('Die Begruendungslisten nennen keinen Leser, den es inzwischen gibt', () => {
  /*
   * Die Listen sind die Erinnerung an einen GEMESSENEN Zustand. Wird der Leser
   * nachgetragen, ist der Eintrag veraltet — dieselbe Sorte Fehler wie eine
   * abgeschriebene Zahl in einem Pruefwerkzeug.
   */
  const veraltet = [...Object.keys(FELDER_OHNE_PRODUKTLESER_BEWUSST),
    ...Object.keys(FELDER_OHNE_PRODUKTLESER_OFFEN)].filter(feld => MIT_LESER.has(feld));
  assert.deepEqual(veraltet, [],
    'Fuer diese Felder gibt es inzwischen einen Leser in src/** — der Eintrag in '
    + 'build-weapon-catalog.mjs ist zu streichen (oder als bewusst zu begruenden).');
});

test('Kein Feld der OFFEN-Liste ist unbemerkt verdrahtet worden', () => {
  // Gegenprobe zur Regel oben: Wer einen Leser nachtraegt (der richtige Weg!),
  // muss die Luecke austragen — dieser Test zwingt ihn dazu.
  for (const feld of Object.keys(FELDER_OHNE_PRODUKTLESER_OFFEN)) {
    assert.ok(!MIT_LESER.has(feld),
      `"${feld}" steht als offene Luecke, wird aber jetzt gelesen. `
      + 'Bitte den Eintrag in FELDER_OHNE_PRODUKTLESER_OFFEN streichen.');
  }
});

test('Bekannte Luecke in Zahlen: effectMagnitude wirkt nicht (4 Geraete springen gleich weit)', () => {
  /*
   * FUND (gemessen 2026-09-27): `effectMagnitude` traegt die Wirkungsstaerke der
   * vier Flug-/Sprunggeraete (64 / 72 / 150 / 165). `buildEffect` in
   * src/engine/specials.js setzt fuer MOVE aber `distance: SPECIAL_DEFAULTS.moveDistance`
   * (60) und fragt die Waffe NICHT. Damit springt der Gleitschirm (150) genau so
   * weit wie der Raketenrucksack (64) — die angekuendigte Unterscheidung
   * („kurzer Satz" gegen „weiter, aber mit Pause") ist im Spiel nicht vorhanden.
   *
   * Diesen Test absichtlich NICHT gruen halten, wenn der Leser kommt: Sobald
   * `effectMagnitude` wirkt, faellt er — und muss neu geschrieben werden, weil
   * dann ungleiche Distanzen zugesagt sind. Ein Test, der einen Fehler
   * festhaelt, ist nur so lange sinnvoll, wie er beim Beheben auffaellt.
   */
  const geraete = WEAPONS.filter(waffe => (waffe.effectMagnitude ?? 0) > 0);
  assert.equal(geraete.length, 4, 'erwartet: vier Geraete mit eigener Wirkungsstaerke');

  const staerken = geraete.map(waffe => waffe.effectMagnitude).sort((a, b) => a - b);
  assert.deepEqual(staerken, [64, 72, 150, 165], 'die vier Wirkungsstaerken haben sich geaendert');

  const distanzen = new Set(geraete.map(waffe => buildEffect(waffe)?.distance));
  assert.deepEqual([...distanzen], [SPECIAL_DEFAULTS.moveDistance],
    'buildEffect liefert jetzt verschiedene Distanzen — dann ist die Luecke behoben und '
    + 'dieser Test gehoert umgeschrieben (und der OFFEN-Eintrag gestrichen).');
});

test('Die fuenf Versprechen des Lastenhefts sind an Daten gebunden', () => {
  /*
   * Die Frage des Auftraggebers lautete: „alle Waffen analysiert, Parameter
   * bestimmt, Zuordnung Munition, Explosion, Gadgets, Drop, Rarity". Hier wird
   * nur die DATEN-Seite je Versprechen gezaehlt — wer sie im Spiel liest, steht
   * in der Spalte „Leser" von docs/waffen-verkabelung.md.
   */
  const mitMunition = WEAPONS.filter(waffe => waffe.maxAmmo > 0).length;
  const mitExplosion = WEAPONS.filter(waffe => waffe.blastRadius > 0).length;
  const mitGadget = WEAPONS.filter(waffe => Boolean(waffe.special)).length;
  const mitRarity = WEAPONS.filter(waffe => Boolean(waffe.rarity)).length;
  const mitStufe = WEAPONS.filter(waffe => Boolean(waffe.powerTier)).length;

  assert.equal(mitMunition, 150, 'Munition: jede Waffe braucht einen Munitionsvorrat');
  assert.equal(mitExplosion, 56, 'Explosion: 56 Waffen tragen einen Radius');
  assert.equal(mitGadget, 150, 'Gadget: jede Waffe braucht eine Wirkung (special)');
  assert.equal(mitRarity, 150, 'Rarity: jede Waffe traegt die Quell-Raritaet');
  assert.equal(mitStufe, 150, 'Drop-Stufe: jede Waffe traegt eine abgeleitete powerTier');
});
