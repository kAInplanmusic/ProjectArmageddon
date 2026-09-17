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
 * ## Fund (belegt): Es ist kein Kreis
 *
 * Der Entwurf ging von Schere-Stein-Papier aus. Gemessen ist es eine Rangfolge:
 * Der Scout ist auf allen drei wirksamen Achsen der schwächste und hat gegen
 * NIEMANDEN einen Vorteil, die Artillerie ist auf zwei von drei die stärkste.
 * Der Scout ist als beweglichster Charakter angelegt (`speed: 1.2`), aber
 * `speed` steht unter `inert` — der Motor liest es nicht.
 *
 * Diese Tests halten das fest. Sie sind damit auch eine Wache: Wird `speed`
 * eines Tages verdrahtet, ändern sich die Beziehungen — und diese Tests sagen,
 * dass die Anzeige dann neu geprüft werden muss.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { CLASS_IDS, classCounterplay, combatProfile } from '../src/shared/config/classes.js';
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
  /*
   * Wäre eine Klasse nirgends favorisiert, hätte sie auf keiner Karte einen
   * Vorteil — das wäre ein Balance-Befund, den die Anzeige nicht verschweigen
   * darf.
   */
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
  const cp = classCounterplay();
  for (const classId of CLASS_IDS) {
    const ausFunktion = cp[classId].profil;
    const ausProfil = combatProfile(classId, 'brawler');
    assert.equal(ausFunktion.leben, ausProfil.healthMultiplier,
      `${classId}: Leben weicht vom Kampfprofil ab`);
    assert.equal(ausFunktion.wucht, ausProfil.damageMultiplier,
      `${classId}: Wucht weicht vom Kampfprofil ab`);
    assert.equal(ausFunktion.reichweite, ausProfil.launchSpeedMultiplier,
      `${classId}: Reichweite weicht vom Kampfprofil ab`);
  }
});

test('Eine genannte Gegenseite ist IMMER durch Vorteile gedeckt', () => {
  /*
   * Der wichtigste Test: Eine „stark gegen"-Aussage ohne einen einzigen
   * Vorteil wäre eine Anzeige, die eine Balance behauptet, die es nicht gibt.
   * Genau das lieferte der erste Anlauf der Funktion (scout war „stark gegen
   * heavy" mit leerer Begründungsliste).
   *
   * Hier wird jede Aussage gegen die Zahlen nachgerechnet.
   */
  const cp = classCounterplay();
  for (const classId of CLASS_IDS) {
    const e = cp[classId];

    if (e.starkGegen) {
      assert.ok(e.starkGegen.wegen.length > 0,
        `${classId}: „stark gegen ${e.starkGegen.classId}" hat keine Begründung`);
      // Nachrechnen: Die eigene Klasse muss den Gegner auf mindestens einer
      // wirksamen Achse übertreffen.
      const eigene = combatProfile(classId, 'brawler');
      const fremde = combatProfile(e.starkGegen.classId, 'brawler');
      const ueberlegen = eigene.healthMultiplier > fremde.healthMultiplier
        || eigene.damageMultiplier > fremde.damageMultiplier
        || eigene.launchSpeedMultiplier > fremde.launchSpeedMultiplier;
      assert.ok(ueberlegen,
        `${classId}: „stark gegen ${e.starkGegen.classId}" ist durch keine Achse gedeckt`);
    }

    if (e.schwachGegen) {
      assert.ok(e.schwachGegen.wegen.length > 0,
        `${classId}: „schwach gegen ${e.schwachGegen.classId}" hat keine Begründung`);
      const eigene = combatProfile(classId, 'brawler');
      const fremde = combatProfile(e.schwachGegen.classId, 'brawler');
      const unterlegen = eigene.healthMultiplier < fremde.healthMultiplier
        || eigene.damageMultiplier < fremde.damageMultiplier
        || eigene.launchSpeedMultiplier < fremde.launchSpeedMultiplier;
      assert.ok(unterlegen,
        `${classId}: „schwach gegen ${e.schwachGegen.classId}" ist durch keine Achse gedeckt`);
    }
  }
});

test('Der Befund ist festgehalten: Der Scout hat keine wirksame Stärke', () => {
  /*
   * Der Fund beim Umsetzen — und der Grund, warum kein Kreis entsteht.
   *
   * Der Scout ist als beweglichster Charakter angelegt (`speed: 1.2`, der
   * höchste Wert der Klassentabelle). Aber `speed` steht unter `inert`: Der
   * Motor liest es nicht. Auf den drei Achsen, die WIRKEN, ist der Scout
   * überall der Schwächste.
   *
   * Dieser Test schlägt fehl, sobald `speed` verdrahtet wird — dann ist der
   * Scout nicht mehr der Schwächste, und die Anzeige (samt diesem Test) muss
   * neu bewertet werden. Das ist beabsichtigt: Der Befund soll nicht still
   * verschwinden.
   */
  const cp = classCounterplay();
  const scout = cp.scout;

  assert.equal(scout.starkGegen, null,
    'Der Scout hat laut Profil keine Gegenseite mit Vorteil — hat sich das geändert, '
    + 'weil `speed` verdrahtet wurde? Dann Anzeige und Test prüfen.');

  // Und die Zahlen, die das begründen: schwächster Wert auf allen drei Achsen.
  for (const classId of CLASS_IDS) {
    if (classId === 'scout') continue;
    const andere = cp[classId].profil;
    assert.ok(scout.profil.leben < andere.leben, `scout hat mehr Leben als ${classId}`);
    assert.ok(scout.profil.wucht < andere.wucht, `scout trifft härter als ${classId}`);
    assert.ok(scout.profil.reichweite < andere.reichweite, `scout schießt weiter als ${classId}`);
  }
});

test('Der `speed`-Wert des Scouts ist deklariert, aber unwirksam', () => {
  /*
   * Die Ursache des Befunds, direkt an der Quelle geprüft: Der Scout hat den
   * höchsten `speed`-Wert der Tabelle — und er landet unter `inert`.
   */
  const scout = combatProfile('scout', 'brawler');
  assert.equal(scout.inert.classSpeed, 1.2,
    'Der Scout hatte den höchsten speed-Wert — ist die Tabelle geändert worden?');
  // Unter `inert` heißt: nicht gelesen. Wäre er wirksam, stünde er als eigene
  // Achse im Profil.
  assert.equal(scout.classSpeed, undefined,
    'speed taucht als wirksame Achse auf — dann ist der Motor geändert worden');
});

test('Die Beziehung ist rein und reproduzierbar', () => {
  // Eine Anzeige darf keinen Zustand verändern; zwei Aufrufe müssen dasselbe
  // liefern (sonst zeigte das Menü bei jedem Öffnen etwas anderes).
  const a = classCounterplay();
  const b = classCounterplay();
  assert.deepEqual(a, b);
});
