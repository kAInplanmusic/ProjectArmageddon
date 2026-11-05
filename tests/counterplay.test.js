/**
 * Tests für Counterplay und Map-Synergie.
 *
 * ## Die Leitentscheidung, die hier geprüft wird
 *
 * Counterplay ist in diesem Projekt eine SICHTBARE Beziehung, keine versteckte
 * Rechnung. Zwei Dinge werden deshalb ausdrücklich geprüft:
 *
 *  1. Die abgeleitete Beziehung stützt sich auf Zahlen — und erfindet keinen
 *     Gegner, wenn die Zahlen keinen hergeben.
 *  2. Die Gelände-Affinität ist ein Anzeigetext ohne Multiplikator. Der Motor
 *     darf sie NICHT lesen.
 *
 * ## Fassung 3
 *
 * Die drei Klassen sind auf gleiche Summe der wirksamen Faktoren ausgelegt
 * (`npm run balance:classes`): nahkampf 1,30/0,75/0,75/1,20, fernkampf
 * 1,00/1,00/1,00/1,00, okkultist 0,70/1,25/1,25/0,80. Jede Klasse gewinnt zwei
 * Achsen und verliert zwei — es gibt deshalb keine NETTO-Überlegenheit, und
 * `starkGegen`/`schwachGegen` bleiben `null`. Das ist die ehrliche Aussage, keine
 * Lücke.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { CLASS_IDS, classCounterplay, combatProfile, istKlassenfassungNeu } from '../src/shared/config/classes.js';
import { KLASSEN_STANDARD } from '../src/shared/config/klassen-fassung.js';
import { TERRAIN_PRESETS, TERRAIN_AFFINITY } from '../src/shared/terrainGen.js';

const hier = dirname(fileURLToPath(import.meta.url));
const WURZEL = resolve(hier, '..');

test('Jede Geländeform hat eine Affinität — keine Lücke, keine Waise', () => {
  // Eine Form ohne Eintrag wäre im Menü eine leere Zeile; ein Eintrag ohne Form
  // wäre unerreichbar.
  const formen = Object.keys(TERRAIN_PRESETS).sort();
  const zugeordnet = Object.keys(TERRAIN_AFFINITY).sort();
  assert.deepEqual(zugeordnet, formen,
    'Die Affinität muss genau die Formen abdecken, die es gibt');
});

test('Jede Affinität nennt eine bekannte Klasse und eine Begründung', () => {
  for (const [form, eintrag] of Object.entries(TERRAIN_AFFINITY)) {
    assert.ok(CLASS_IDS.includes(eintrag.favorisiert),
      `${form}: unbekannte Klasse "${eintrag.favorisiert}"`);
    assert.equal(typeof eintrag.begruendung, 'string',
      `${form}: keine Begründung`);
    assert.ok(eintrag.begruendung.length > 20, `${form}: Begründung zu kurz`);
    // Dieselbe Regel wie überall: keine Zahlen im Text — sie stehen in den
    // Kennzahlen daneben und würden sonst doppelt gepflegt.
    assert.doesNotMatch(eintrag.begruendung, /\d/,
      `${form}: Der Text nennt eine Zahl ("${eintrag.begruendung}")`);
  }
});

test('Alle drei Klassen werden von der Affinität begünstigt', () => {
  const beguenstigt = new Set(Object.values(TERRAIN_AFFINITY).map(e => e.favorisiert));
  assert.deepEqual([...beguenstigt].sort(), [...CLASS_IDS].sort(),
    `Nicht jede Klasse ist irgendwo begünstigt: ${[...beguenstigt].join(', ')}`);
});

test('Die Affinität ist reine Anzeige — der Motor liest sie NICHT', () => {
  /*
   * DIE Kernprüfung der Leitentscheidung. Ein Multiplikator im Motor hätte
   * mehrere Folgekosten (Balance-Messungen ohne Kartentrennung, 24 statt 3 zu
   * prüfende Kombinationen, kein Testnetz). Geprüft wird, dass keine
   * Motor-Datei auf die Affinität zugreift.
   */
  for (const datei of ['src/engine/match.js', 'src/engine/replay.js']) {
    const inhalt = readFileSync(resolve(WURZEL, datei), 'utf8');
    assert.doesNotMatch(inhalt, /TERRAIN_AFFINITY/,
      `${datei} liest TERRAIN_AFFINITY — sie darf nur Anzeige sein`);
  }
});

test('Die Klassenbeziehung stützt sich auf die wirksamen Achsen', () => {
  /*
   * Die Beziehung wird aus `combatProfile()` abgeleitet, nicht aus einer
   * zweiten Tabelle. Geprüft wird, dass die gelieferten Werte mit dem Profil
   * übereinstimmen — sonst gäbe es zwei Wahrheiten über dieselbe Klasse.
   */
  assert.ok(istKlassenfassungNeu(KLASSEN_STANDARD));
  const cp = classCounterplay();
  for (const classId of CLASS_IDS) {
    const ausFunktion = cp[classId].profil;
    const ausProfil = combatProfile(classId, null, null, KLASSEN_STANDARD);
    assert.equal(ausFunktion.leben, ausProfil.healthMultiplier,
      `${classId}: Leben weicht vom Kampfprofil ab`);
    assert.equal(ausFunktion.wucht, ausProfil.damageMultiplier,
      `${classId}: Wucht weicht vom Kampfprofil ab`);
    assert.equal(ausFunktion.reichweite, ausProfil.launchSpeedMultiplier,
      `${classId}: Reichweite weicht vom Kampfprofil ab`);
    assert.equal(ausFunktion.beweglichkeit, ausProfil.mobilityMultiplier,
      `${classId}: Beweglichkeit weicht vom Kampfprofil ab`);
  }
});

test('Eine genannte Gegenseite ist IMMER durch Vorteile gedeckt', () => {
  /*
   * Der wichtigste Test: Eine „stark gegen"-Aussage ohne einen einzigen
   * Vorteil wäre eine Anzeige, die eine Balance behauptet, die es nicht gibt.
   */
  const cp = classCounterplay();
  for (const classId of CLASS_IDS) {
    const e = cp[classId];

    if (e.starkGegen) {
      assert.ok(e.starkGegen.wegen.length > 0,
        `${classId}: „stark gegen ${e.starkGegen.classId}" hat keine Begründung`);
      const eigene = combatProfile(classId, null, null, KLASSEN_STANDARD);
      const fremde = combatProfile(e.starkGegen.classId, null, null, KLASSEN_STANDARD);
      const ueberlegen = eigene.healthMultiplier > fremde.healthMultiplier
        || eigene.damageMultiplier > fremde.damageMultiplier
        || eigene.launchSpeedMultiplier > fremde.launchSpeedMultiplier
        || eigene.mobilityMultiplier > fremde.mobilityMultiplier;
      assert.ok(ueberlegen,
        `${classId}: „stark gegen ${e.starkGegen.classId}" ist durch keine Achse gedeckt`);
    }

    if (e.schwachGegen) {
      assert.ok(e.schwachGegen.wegen.length > 0,
        `${classId}: „schwach gegen ${e.schwachGegen.classId}" hat keine Begründung`);
      const eigene = combatProfile(classId, null, null, KLASSEN_STANDARD);
      const fremde = combatProfile(e.schwachGegen.classId, null, null, KLASSEN_STANDARD);
      const unterlegen = eigene.healthMultiplier < fremde.healthMultiplier
        || eigene.damageMultiplier < fremde.damageMultiplier
        || eigene.launchSpeedMultiplier < fremde.launchSpeedMultiplier
        || eigene.mobilityMultiplier < fremde.mobilityMultiplier;
      assert.ok(unterlegen,
        `${classId}: „schwach gegen ${e.schwachGegen.classId}" ist durch keine Achse gedeckt`);
    }
  }
});

test('Fassung 3: gleiche Summe bedeutet keine Netto-Überlegenheit', () => {
  /*
   * Bei gleicher Summe kann eine Klasse auf zwei Achsen gewinnen und auf zwei
   * verlieren — dann bleibt `starkGegen` `null`. Der Test hält damit fest, dass
   * die Anzeige bei Gleichstand NICHTS behauptet (statt einen Gegner zu
   * erfinden) und dass die drei Klassen wirklich gleichauf sind.
   */
  const cp = classCounterplay();
  for (const classId of CLASS_IDS) {
    const p = cp[classId].profil;
    assert.equal((p.leben + p.wucht + p.reichweite + p.beweglichkeit).toFixed(9), '4.000000000',
      `${classId}: Summe der wirksamen Faktoren ist nicht 4,00`);
    assert.equal(cp[classId].starkGegen, null,
      `${classId}: bei gleicher Summe darf keine Netto-Überlegenheit behauptet werden`);
  }
});

test('Die Beweglichkeit jeder Klasse ist wirksam (nicht inert)', () => {
  const cp = classCounterplay();
  const p = Object.fromEntries(CLASS_IDS.map(k => [k, cp[k].profil]));
  assert.ok(p.nahkampf.beweglichkeit > p.fernkampf.beweglichkeit
    && p.fernkampf.beweglichkeit > p.okkultist.beweglichkeit,
  'Nahkampf muss beweglicher sein als Fernkampf, dieser beweglicher als der Okkultist');
  for (const classId of CLASS_IDS) {
    const profil = combatProfile(classId, null, null, KLASSEN_STANDARD);
    assert.equal(profil.inert.speed, undefined, `${classId}: speed steht noch unter inert`);
  }
});

test('Die Beziehung ist rein und reproduzierbar', () => {
  const a = classCounterplay();
  const b = classCounterplay();
  assert.deepEqual(a, b);
});
