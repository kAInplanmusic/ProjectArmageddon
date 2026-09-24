/**
 * Tests: Schadensart und Sichtlinie der 150 Waffen (Katalog-Ebene).
 *
 * ## Die beiden Fundstellen
 *
 * FUND 1 (belegt, gemessen 2026-09-25): 26 der 150 Waffen trugen kein
 * `damage_type` in der Designdatei — alle Nahkampfwaffen und ein Teil des
 * direkten Fernkampfs. Der Generator füllte dafür pauschal `physical`. Ein
 * „Raketenwerfer" hatte damit dieselbe Schadensart wie ein „Baseballschläger",
 * und im Motor las ohnehin niemand das Feld.
 *
 * FUND 2 (belegt, gemessen 2026-09-25): `requiresLineOfSight` stand für ALLE
 * 150 Waffen auf `false` — eine Zusage ohne Wirkung.
 *
 * Beide Merkmale sind jetzt befüllt und im Motor verdrahtet. Diese Datei sichert
 * die DATEN-Seite ab; die Wirkung im laufenden Match prüft
 * `tests/wirkungsmerkmale-match.test.js`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { WEAPONS } from '../src/shared/config/weapons.js';
import {
  DAMAGE_TYPE_IDS, DEFAULT_DAMAGE_TYPE_ID, damageTypeId, damageTypeName, isKnownDamageType,
} from '../src/engine/damageTypes.js';

test('Jede Waffe trägt eine Schadensart, die der Motor kennt', () => {
  for (const waffe of WEAPONS) {
    assert.ok(waffe.damageType, `${waffe.id} (${waffe.displayName}): keine Schadensart`);
    assert.ok(isKnownDamageType(waffe.damageType),
      `${waffe.id}: "${waffe.damageType}" kennt der Motor nicht — sie würde im `
      + 'Int32-Feld des Projektils stillschweigend zu 0 (körperlich)');
  }
});

test('Der Katalog nutzt mehr als die Hälfte der bekannten Schadensarten', () => {
  /*
   * Die Gegenprobe zum pauschalen Rückfallwert: Vorher trugen 26 Waffen „aus
   * Verlegenheit" physical. Wäre die Ableitung kaputt, driften die Zahlen
   * wieder auf wenige Arten zusammen.
   */
  const benutzt = new Set(WEAPONS.map(w => w.damageType));
  assert.ok(benutzt.size >= DAMAGE_TYPE_IDS.length / 2,
    `nur ${benutzt.size} von ${DAMAGE_TYPE_IDS.length} Arten im Katalog — `
    + 'die Ableitung greift offenbar nicht mehr');
});

test('Die 26 Waffen ohne Quellangabe wirken NICHT alle körperlich', () => {
  /*
   * Genau die belegte Fundstelle: Die Waffen, deren Schadensart aus dem Namen
   * abgeleitet wurde (`damageTypeSource === 'derived'` UND kein Quellwert),
   * müssen über mehrere Arten streuen. Wären sie alle `physical`, wäre die
   * Ableitung wirkungslos — und genau das war der Zustand vor der Behebung.
   */
  const abgeleitet = WEAPONS.filter(w => w.damageTypeSource === 'derived');
  assert.ok(abgeleitet.length >= 20,
    `Es muss viele abgeleitete Schadensarten geben: ${abgeleitet.length}`);

  const ohneQuelle = abgeleitet.filter(w => w.damageType !== 'physical');
  assert.ok(ohneQuelle.length >= 10,
    `Nur ${ohneQuelle.length} abgeleitete Waffen wirken nicht körperlich — `
    + 'die Namensableitung schlägt nicht durch (Raketenwerfer, Fackel, Zauber …)');
});

test('Bekannte Beispiele: Waffe und Schadensart passen zusammen', () => {
  // Die Ableitung wird an Fällen geprüft, die jeder nachvollziehen kann.
  const faelle = [
    ['Handgranate', 'explosive'],
    ['Raketenwerfer', 'explosive'],
    ['Fackel', 'fire'],
    ['Magischer Geschosszauber', 'arcane'],
    ['Scharfschützengewehr', 'physical'],
  ];

  for (const [name, erwartet] of faelle) {
    const waffe = WEAPONS.find(w => w.displayName === name);
    assert.ok(waffe, `Vorbedingung: "${name}" existiert im Katalog`);
    assert.equal(waffe.damageType, erwartet,
      `"${name}": erwartet "${erwartet}", steht aber "${waffe.damageType}"`);
  }
});

test('Sichtlinie: nur Direktschützen verlangen sie, niemals Steilfeuer', () => {
  /*
   * Die Kernregel. Ein Geschoss, das von oben oder von der Seite kommt
   * (`strikeStyle` sky/flank), schießt BEWUSST über Deckung — eine Sichtlinie
   * zu verlangen widerspräche seiner Anflugart.
   */
  const mitSicht = WEAPONS.filter(w => w.requiresLineOfSight);

  assert.ok(mitSicht.length > 0,
    'KEINE Waffe verlangt Sichtlinie — das Merkmal wäre wieder ohne Wirkung');
  assert.ok(mitSicht.length < WEAPONS.length / 2,
    `${mitSicht.length} von ${WEAPONS.length} verlangen Sicht — das wäre keine `
    + 'Auszeichnung mehr, sondern die Regel');

  for (const waffe of mitSicht) {
    assert.equal(waffe.strikeStyle, 'self',
      `${waffe.id} (${waffe.displayName}): verlangt Sichtlinie, kommt aber als `
      + `${waffe.strikeStyle}-Anflug`);
  }
});

test('Sichtlinie: Mörser und Granaten sind ausdrücklich ausgenommen', () => {
  /*
   * Die Gegenprobe. Ohne sie könnte das Merkmal einfach überall gesetzt sein.
   * Eine Granate bleibt liegen und zündet (`fuseIntent: timed`) — sie hat ihr
   * Ziel nie gesehen.
   */
  const granate = WEAPONS.find(w => w.displayName === 'Handgranate');
  assert.ok(granate, 'Vorbedingung: die Handgranate existiert');
  assert.equal(granate.requiresLineOfSight, false,
    'Die Handgranate wird geworfen und braucht keine Sichtlinie');
});

test('Der Zahlenindex der Schadensarten ist stabil und vollständig', () => {
  // Die Kennungen stehen in Int32-Feldern und in Momentaufnahmen: Sie dürfen
  // sich nicht verschieben. `physical` ist 0 und zugleich der Rückfallwert.
  assert.equal(DAMAGE_TYPE_IDS[DEFAULT_DAMAGE_TYPE_ID], 'physical');
  assert.equal(new Set(DAMAGE_TYPE_IDS).size, DAMAGE_TYPE_IDS.length,
    'doppelte Kennung in DAMAGE_TYPE_IDS');

  for (const [id, name] of DAMAGE_TYPE_IDS.entries()) {
    assert.equal(damageTypeId(name), id, `${name} → ${id}`);
    assert.equal(damageTypeName(id), name, `${id} → ${name}`);
  }

  // Unbekanntes fällt auf körperlich zurück, statt `undefined` zu werden.
  assert.equal(damageTypeId('gibtsnicht'), DEFAULT_DAMAGE_TYPE_ID);
  assert.equal(damageTypeId(undefined), DEFAULT_DAMAGE_TYPE_ID);
  // Zahlen bleiben Zahlen (Aufrufer, die schon eine Kennung haben).
  assert.equal(damageTypeId(11), 11);
});
