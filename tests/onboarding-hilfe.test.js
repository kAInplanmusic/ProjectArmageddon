/**
 * Tests der Hilfe-Ableitung (Onboarding).
 *
 * Warum es diese Datei gibt
 * -------------------------
 * Der Entwurf (docs/entwurf-onboarding-sidegrades-counterplay.md, Abschnitt A)
 * verlangt, dass die Hilfe-Anzeige ihre Inhalte AUS DEN CONFIGS ableitet und
 * nichts im Client hartkodiert. Diese Datei prüft genau das — ohne Browser,
 * weil die Ableitung eine reine Funktion ist.
 *
 * Geprüft wird in drei Richtungen:
 *   1. Die Ableitung liefert vollständige Daten (jede Klasse, jeder Archetyp).
 *   2. Die Zahlen stammen aus den Configs — nicht aus einer zweiten Quelle.
 *   3. Die Texte nennen KEINE Zahlen. Ein Satz wie „schießt am schwächsten
 *      (0,7)" müsste bei jeder Balance-Änderung mitwandern; genau diese zweite
 *      Quelle soll vermieden werden.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CLASS_IDS,
  ARCHETYPE_IDS,
  CLASS_DEFINITIONS,
  CLASS_ARCHETYPES,
  combatProfile,
  uebersichtFuerHilfe,
} from '../src/shared/config/classes.js';
import { TERRAIN_PRESETS } from '../src/shared/terrainGen.js';
import { getClassLoadoutDetail } from '../src/shared/config/loadouts.js';

test('Die Übersicht führt jede Klasse und jeden Archetyp', () => {
  const u = uebersichtFuerHilfe();
  assert.equal(u.klassen.length, CLASS_IDS.length);
  assert.equal(u.archetypen.length, ARCHETYPE_IDS.length);
  assert.deepEqual(u.klassen.map(k => k.id), [...CLASS_IDS]);
  assert.deepEqual(u.archetypen.map(a => a.id), [...ARCHETYPE_IDS]);
});

test('Jede Klasse und jeder Archetyp hat einen Erklärungssatz', () => {
  /*
   * Der Satz ist die Zutat, die im Entwurf gefehlt hat: Er steht bei den WERTEN
   * (classes.js), nicht im Client. Fehlt er, wäre die Übersicht leer — ohne dass
   * etwas fehlschlägt. Deshalb ausdrücklich geprüft.
   */
  const u = uebersichtFuerHilfe();
  for (const eintrag of [...u.klassen, ...u.archetypen]) {
    assert.equal(typeof eintrag.erklaerung, 'string', `${eintrag.id}: kein Erklärungstext`);
    assert.ok(eintrag.erklaerung.length > 15, `${eintrag.id}: Erklärung zu kurz`);
  }
});

test('Die wirksamen Zahlen stammen aus den Configs, nicht aus einer zweiten Quelle', () => {
  /*
   * Der Kern der Architekturentscheidung: Wenn die Anzeige den Faktor 0,7 als
   * Prosa nennt, muss dieser Wert bei einer Balance-Änderung mitwandern. Deshalb
   * darf er NUR an einer Stelle stehen. Dieser Test vergleicht die Übersicht
   * gegen die Rohtabellen — weichen sie ab, gibt es eine zweite Quelle.
   */
  const u = uebersichtFuerHilfe();

  for (const eintrag of u.klassen) {
    const roh = CLASS_DEFINITIONS[eintrag.id];
    assert.equal(eintrag.wirksam.leben, roh.health,
      `${eintrag.id}: Leben weicht von CLASS_DEFINITIONS ab`);
    assert.equal(eintrag.wirksam.schaden, roh.power,
      `${eintrag.id}: Schaden weicht von CLASS_DEFINITIONS ab`);
    // Genau die drei Achsen, die der Motor liest (siehe combatProfile).
    assert.equal(eintrag.wirksam.schaden, combatProfile(eintrag.id, 'brawler').damageMultiplier,
      `${eintrag.id}: Schaden weicht von combatProfile ab`);
  }

  for (const eintrag of u.archetypen) {
    const roh = CLASS_ARCHETYPES[eintrag.id];
    assert.equal(eintrag.wirksam.leben, roh.health,
      `${eintrag.id}: Leben weicht von CLASS_ARCHETYPES ab`);
  }
});

test('Der Archetyp wirkt als TEMPO, nicht als Schaden — und die Anzeige nennt es so', () => {
  /*
   * Fund aus dem Codeaudit: `archetype.damage` geht als
   * `launchSpeedMultiplier` in die Abschussgeschwindigkeit ein und wird NICHT
   * als Schadensfaktor angewandt. Eine Übersicht, die ihn unter „Schaden"
   * aufführte, wäre glatt falsch — und niemand würde es bemerken.
   */
  const u = uebersichtFuerHilfe();
  for (const eintrag of u.archetypen) {
    assert.equal(eintrag.wirksam.schaden, undefined,
      `${eintrag.id}: Ein Archetyp hat keinen Schadensfaktor — Feld darf nicht existieren`);
    assert.equal(typeof eintrag.wirksam.tempo, 'number',
      `${eintrag.id}: Tempo-Faktor fehlt`);

    // Gegenprobe über die wirksame Verrechnung: combatProfile arbeitet den
    // Archetyp in launchSpeedMultiplier ein, in damageMultiplier NICHT.
    const mit = combatProfile('heavy', eintrag.id);
    const ohne = combatProfile('heavy', 'brawler');
    assert.equal(mit.damageMultiplier, ohne.damageMultiplier,
      `${eintrag.id}: Archetyp darf den Schaden NICHT verändern`);
  }
});

test('Die Erklärungstexte nennen KEINE Zahlen', () => {
  /*
   * Der wichtigste Test dieser Datei.
   *
   * Ein Satz wie „schießt am schwächsten (0,7)" wäre eine zweite Quelle für
   * denselben Wert: Er müsste bei jeder Balance-Änderung mitwandern. Weil die
   * Anzeige die Zahlen ohnehin aus der Tabelle daneben zeigt, sind sie im Text
   * nicht nur überflüssig, sondern schädlich — sie können veralten.
   *
   * Geprüft wird auf Ziffern. Ausnahme: Formulierungen wie „drei der neun
   * Kombinationen" in den Hinweistexten — das sind Anzahlen von Aufzählungen,
   * keine Spielwerte. Deshalb gelten die Hinweise als ausgenommen.
   */
  const u = uebersichtFuerHilfe();
  for (const eintrag of [...u.klassen, ...u.archetypen]) {
    assert.doesNotMatch(eintrag.erklaerung, /\d/,
      `${eintrag.id}: Der Erklärungstext nennt eine Zahl ("${eintrag.erklaerung}") — `
      + 'die Zahlen kommen aus der Tabelle daneben und würden sonst doppelt gepflegt');
  }
});

test('Die Kopplung von Klasse und Archetyp wird genannt', () => {
  /*
   * Die Übersicht zeigt neun Kombinationen; im Match sind nur drei erreichbar
   * (`index % 3`, gemessen: scout/brawler, heavy/artillerist,
   * artillery/occultist). Sie zu verschweigen wäre irreführend — der Entwurf
   * verlangt den Hinweis ausdrücklich.
   */
  const u = uebersichtFuerHilfe();
  assert.match(u.kopplungHinweis, /drei/, 'Der Hinweis muss die Zahl der erreichbaren nennen');
  assert.match(u.kopplungHinweis, /neun/, 'Der Hinweis muss die Zahl der möglichen nennen');
  assert.ok(u.inertHinweis.length > 20, 'Der Hinweis auf wirkungslose Werte fehlt');
});

test('Die wirkungslosen Werte sind als solche gekennzeichnet', () => {
  /*
   * `drag` und `mass` liest der Motor nicht. Sie als Spielwerte mit Balken zu
   * zeigen wäre eine stille Lüge — der Entwurf lässt sie höchstens als Hinweis
   * zu. Hier wird geprüft, dass sie GETRENNT von den wirksamen Werten geführt
   * werden, damit die Anzeige sie unterscheiden kann.
   *
   * `speed` stand früher ebenfalls hier. Seit es auf den Absprung wirkt (der
   * Scout springt höher), gehört es zu den WIRKSAMEN Werten — dass es nicht
   * mehr unter `inert` steht, prüft `tests/counterplay.test.js`.
   */
  const u = uebersichtFuerHilfe();
  for (const eintrag of u.klassen) {
    assert.ok(Object.keys(eintrag.inert).length > 0,
      `${eintrag.id}: wirkungslose Werte fehlen — sie sollen als Hinweis erscheinen`);
    // Und sie dürfen NICHT unter „wirksam" stehen.
    for (const schluessel of Object.keys(eintrag.inert)) {
      assert.equal(eintrag.wirksam[schluessel], undefined,
        `${eintrag.id}: "${schluessel}" steht unter wirksam, ist aber wirkungslos`);
    }
    // Die Beweglichkeit dagegen MUSS unter den wirksamen Werten stehen.
    assert.equal(typeof eintrag.wirksam.beweglichkeit, 'number',
      `${eintrag.id}: die Beweglichkeit fehlt unter den wirksamen Werten`);
  }
});

test('Jede Geländeform erklärt sich in einem Satz', () => {
  // Die Hilfe leitet die Gelände-Texte aus TERRAIN_PRESETS ab — der frühere
  // Kommentar je Form ist jetzt ein Feld.
  for (const [id, preset] of Object.entries(TERRAIN_PRESETS)) {
    assert.equal(typeof preset.erklaerung, 'string', `${id}: kein Erklärungstext`);
    assert.ok(preset.erklaerung.length > 15, `${id}: Erklärung zu kurz`);
    assert.doesNotMatch(preset.erklaerung, /\d/,
      `${id}: Der Text nennt eine Zahl — die Kennzahlen stehen daneben und würden `
      + 'sonst doppelt gepflegt');
  }
});

test('Das Startaufgebot je Klasse ist vollständig und trägt eine Rolle', () => {
  /*
   * Das Startaufgebot war im Menü nirgends zu sehen; die Hilfe ist sein erster
   * Konsument. Geprüft wird, dass es überhaupt etwas zu zeigen gibt.
   *
   * `reason` wird hier ABSICHTLICH nicht geprüft: Der Entwurf nannte das Feld
   * eine „Begründung", nachgemessen ist es aber maschinell zusammengesetzt
   * (`Rolle ${roleLabel} — Wahl der Klasse ${klasse}`, siehe loadouts.js:221-223)
   * und trägt keine eigene Information. Die Anzeige nutzt deshalb Rolle + Waffe
   * — der nächste Test hält das fest.
   */
  for (const classId of CLASS_IDS) {
    const detail = getClassLoadoutDetail(classId);
    assert.ok(Array.isArray(detail) && detail.length > 0,
      `${classId}: kein Startaufgebot`);
    for (const platz of detail) {
      assert.equal(typeof platz.roleLabel, 'string', `${classId}: roleLabel fehlt`);
      assert.ok(platz.roleLabel.length > 0, `${classId}: roleLabel ist leer`);
      assert.equal(typeof platz.weaponId, 'string', `${classId}: weaponId fehlt`);
    }
  }
});

test('Der reason des Startaufgebots ist KEINE Begründung, sondern zusammengesetzt', () => {
  /*
   * Fund (belegt): Der Entwurf verspricht, aus `reason` erklärenden Text zu
   * gewinnen — „Felder, die im Menü nirgends angezeigt werden". Nachgemessen
   * wiederholt der Satz lediglich `roleLabel` und den Klassennamen:
   *
   *   "Rolle Flächenwirkung — Wahl der Klasse scout"
   *
   * Ihn anzuzeigen ergäbe doppelten Text. Dieser Test hält den Befund fest,
   * damit das Feld nicht später wieder als Inhaltsquelle eingeplant wird. Wird
   * `reason` eines Tages zu einer echten Begründung, schlägt der Test fehl —
   * und die Anzeige kann darauf umgestellt werden.
   */
  const detail = getClassLoadoutDetail('scout');
  for (const platz of detail) {
    const erwarteterPlatzhalter = platz.role === 'kuer'
      ? /Kür der Klasse/
      : /Wahl der Klasse/;
    assert.match(platz.reason, erwarteterPlatzhalter,
      `reason für "${platz.role}" ist nicht mehr das erwartete Muster — `
      + `prüfen, ob es jetzt eine echte Begründung ist (dann Anzeige umstellen): `
      + `"${platz.reason}"`);

    /*
     * Der Satz nennt den Klassennamen — das ist der Teil, der ihn zu einem
     * Platzhalter macht (er gilt für jede Klasse gleich).
     *
     * NICHT geprüft wird, ob `reason` das `roleLabel` enthält: Beim
     * `kuer`-Platz heißt die Rolle „Klassenwaffe", der Satz sagt aber
     * „Bewegungsmittel" (gemessen). Die beiden nutzen unterschiedliche Wörter;
     * eine Prüfung auf Gleichheit war ein Testfehler, kein Codefehler.
     */
    assert.match(platz.reason, /der Klasse scout/,
      `reason nennt die Klasse nicht — Muster geändert?`);
  }
});

test('Die Ableitung ist rein — zweimal aufgerufen dasselbe Ergebnis', () => {
  // Eine Anzeige darf keinen Zustand verändern. Wäre die Ableitung nicht rein,
  // zeigte ein zweiter Aufruf etwas anderes — und niemand würde es merken.
  const a = uebersichtFuerHilfe();
  const b = uebersichtFuerHilfe();
  assert.deepEqual(a, b);
});
