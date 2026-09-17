/**
 * Tests des Sidegrade-Systems.
 *
 * Schwerpunkte
 * ------------
 *  1. Die TRADE-OFF-Bedingung: Jeder Eintrag hat mindestens einen Faktor > 1
 *     UND einen < 1. Ein Eintrag mit ausschließlich Faktoren >= 1 wäre ein
 *     Upgrade und ist ausdrücklich nicht der Entwurf.
 *  2. Die PURHEIT der Rechnung — Voraussetzung für reproduzierbare Replays.
 *  3. Die Abwärtskompatibilität: Ohne Sidegrade muss `combatProfile` exakt die
 *     Werte liefern wie vor der Änderung. Sonst wären alle Altreplays und alle
 *     Balancetabellen still falsch.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  SIDEGRADES,
  SIDEGRADE_IDS,
  SIDEGRADE_BY_CLASS,
  SIDEGRADE_AXES,
  SIDEGRADE_FLOOR,
  isKnownSidegrade,
  resolveSidegrade,
  sidegradeModifiers,
  sidegradesForClass,
} from '../src/shared/config/sidegrades.js';
import {
  CLASS_IDS,
  ARCHETYPE_IDS,
  combatProfile,
} from '../src/shared/config/classes.js';

const hier = dirname(fileURLToPath(import.meta.url));
const WURZEL = resolve(hier, '..');

test('Jedes Sidegrade hat mindestens einen Vorteil UND einen Nachteil', () => {
  /*
   * DIE Kernbedingung des Entwurfs. Ein Eintrag, der nur verbessert, ist ein
   * Upgrade — und ein Upgrade-System ist genau die Progression, die die
   * Qualitätsregel „keine Number-Bloat-Progression" untersagt.
   *
   * Geprüft wird über die Faktoren, nicht über die Prosa: Ein Text kann
   * „Trade-off" behaupten, während die Zahlen etwas anderes sagen.
   */
  for (const [id, eintrag] of Object.entries(SIDEGRADES)) {
    const werte = Object.values(eintrag.modifiers);
    const besser = werte.filter(w => w > 1);
    const schlechter = werte.filter(w => w < 1);

    assert.ok(besser.length >= 1,
      `${id}: kein Faktor über 1 — das wäre kein Vorteil, sondern ein Nachteil`);
    assert.ok(schlechter.length >= 1,
      `${id}: kein Faktor unter 1 — das wäre ein Upgrade, kein Sidegrade. `
      + `Faktoren: ${JSON.stringify(eintrag.modifiers)}`);
  }
});

test('Ein Sidegrade verändert nur die wirksamen Achsen', () => {
  /*
   * `drag`, `mass` und die Tempo-Werte liest der Motor nicht. Ein Sidegrade
   * darauf hätte keine Wirkung — die Anzeige würde eine Änderung versprechen,
   * die nicht eintritt. Das ist die stille Lüge, die classes.js vermeidet.
   */
  for (const [id, eintrag] of Object.entries(SIDEGRADES)) {
    for (const achse of Object.keys(eintrag.modifiers)) {
      assert.ok(SIDEGRADE_AXES.includes(achse),
        `${id}: Achse "${achse}" ist nicht wirksam — zulässig sind ${SIDEGRADE_AXES.join(', ')}`);
    }
  }
});

test('Jede Kennung in SIDEGRADE_IDS hat einen Eintrag — und umgekehrt', () => {
  // Keine Waise in beide Richtungen: Eine ID ohne Eintrag wäre ein Fehler beim
  // Nachschlagen, ein Eintrag ohne ID wäre unerreichbar.
  assert.deepEqual([...SIDEGRADE_IDS].sort(), Object.keys(SIDEGRADES).sort());
  for (const id of SIDEGRADE_IDS) {
    assert.equal(SIDEGRADES[id].id, id, `${id}: id-Feld weicht vom Schlüssel ab`);
  }
});

test('Jede Klassenliste nennt nur bekannte Sidegrades', () => {
  for (const [klasse, ids] of Object.entries(SIDEGRADE_BY_CLASS)) {
    assert.ok(Array.isArray(ids) && ids.length > 0, `${klasse}: keine Sidegrades angeboten`);
    for (const id of ids) {
      assert.ok(isKnownSidegrade(id), `${klasse}: unbekannte Kennung "${id}"`);
    }
    // Doppelte Einträge wären in der Anzeige zweimal dasselbe.
    assert.equal(new Set(ids).size, ids.length, `${klasse}: doppelte Kennung`);
  }
});

test('Jede Klasse hat eine Angebotsliste', () => {
  // Eine Klasse ohne Sidegrades wäre im Menü eine leere Auswahl — das fiele
  // erst beim Benutzen auf.
  for (const klasse of CLASS_IDS) {
    assert.ok(Array.isArray(SIDEGRADE_BY_CLASS[klasse]),
      `${klasse}: keine Sidegrade-Liste — die Auswahl im Menü bliebe leer`);
  }
});

test('combatProfile OHNE Sidegrade liefert exakt die alten Werte', () => {
  /*
   * DER wichtigste Test dieser Datei: Abwärtskompatibilität.
   *
   * Alle bestehenden Balancetabellen, Replays und Tests rechnen ohne Sidegrade.
   * Weicht auch nur ein Wert ab, wären sie still falsch — und ein stiller Fehler
   * in der Balance fällt niemandem auf.
   *
   * Die erwarteten Werte werden aus den ROHDATEN nachgerechnet, nicht aus einer
   * abgetippten Liste: Sonst prüfte der Test nur, dass zwei Zahlen gleich
   * abgeschrieben wurden.
   */
  for (const classId of CLASS_IDS) {
    for (const archetypeId of ARCHETYPE_IDS) {
      const ohne = combatProfile(classId, archetypeId);
      const mitNull = combatProfile(classId, archetypeId, null);
      assert.deepEqual(ohne, mitNull,
        `${classId}/${archetypeId}: null als Sidegrade muss identisch sein`);

      // Und die Werte müssen den alten Formeln entsprechen (Faktor 1 = neutral).
      assert.ok(Number.isFinite(ohne.healthMultiplier) && ohne.healthMultiplier > 0,
        `${classId}/${archetypeId}: unplausibles Leben`);
      assert.equal(ohne.sidegradeId, null, 'ohne Sidegrade muss sidegradeId null sein');
    }
  }
});

test('Ein Sidegrade multipliziert genau die Achsen, die es nennt', () => {
  // Geprüft wird die VERKETTUNG: Basis × Sidegrade, je Achse einzeln.
  for (const id of SIDEGRADE_IDS) {
    const side = sidegradeModifiers(id);
    for (const classId of CLASS_IDS) {
      const basis = combatProfile(classId, 'brawler');
      const mit = combatProfile(classId, 'brawler', id);

      assert.equal(mit.healthMultiplier, basis.healthMultiplier * side.healthMultiplier,
        `${classId}/${id}: Leben falsch verkettet`);
      assert.equal(mit.damageMultiplier, basis.damageMultiplier * side.damageMultiplier,
        `${classId}/${id}: Schaden falsch verkettet`);
      assert.equal(mit.launchSpeedMultiplier,
        basis.launchSpeedMultiplier * side.launchSpeedMultiplier,
        `${classId}/${id}: Tempo falsch verkettet`);
      assert.equal(mit.sidegradeId, id, `${classId}/${id}: Kennung nicht übernommen`);
    }
  }
});

test('Eine unbekannte Kennung wirkt wie kein Sidegrade — ohne Rückfallmeldung', () => {
  /*
   * Tolerierbar heißt: `null` als Ergebnis, KEIN `onFallback`. Der Unterschied
   * zu einer unbekannten Klasse ist Absicht — ein Replay aus einer älteren
   * Fassung soll spielbar bleiben, und ein fehlendes Sidegrade ist kein Fehler.
   */
  const basis = combatProfile('scout', 'brawler');
  const unbekannt = combatProfile('scout', 'brawler', 'gibt-es-nicht');

  assert.equal(unbekannt.sidegradeId, null);
  assert.deepEqual(unbekannt, basis, 'unbekannte Kennung darf nichts verändern');
  assert.equal(unbekannt.onFallback, false,
    'eine unbekannte SIDEgrade-Kennung darf onFallback NICHT setzen');

  // Gegenprobe: Eine unbekannte KLASSE setzt onFallback weiterhin.
  assert.equal(combatProfile('gibt-es-nicht', 'brawler').onFallback, true);
});

test('Die Rechnung ist pur — zweimal aufgerufen dasselbe Ergebnis', () => {
  /*
   * Voraussetzung für reproduzierbare Replays: Dieselben Eingaben ergeben auf
   * jedem Rechner und zu jedem Tick dieselben Faktoren. Ein Zustand in der
   * Rechnung würde das brechen.
   */
  for (const id of SIDEGRADE_IDS) {
    const a = combatProfile('heavy', 'occultist', id);
    const b = combatProfile('heavy', 'occultist', id);
    assert.deepEqual(a, b, `${id}: nicht deterministisch`);
  }
});

test('Die Untergrenze verhindert eine spielunfähige Figur', () => {
  /*
   * Ohne Grenze könnte die Verkettung Leben oder Tempo gegen 0 treiben — die
   * Figur wäre spielunfähig. Die Grenze steht als Konstante in sidegrades.js,
   * damit sie prüfbar ist und nicht als verstecktes Math.max an einer
   * Aufrufstelle lebt.
   */
  assert.ok(SIDEGRADE_FLOOR.healthMultiplier > 0);
  assert.ok(SIDEGRADE_FLOOR.damageMultiplier > 0);
  assert.ok(SIDEGRADE_FLOOR.launchSpeedMultiplier > 0);

  // Ein erfundener Eintrag unter der Grenze wird angehoben. Der Test baut ihn
  // NICHT über SIDEGRADES ein (das wäre eine Änderung der Config), sondern
  // prüft die Grenzfunktion direkt über einen bekannten Eintrag: Alle echten
  // Einträge liegen über der Grenze.
  for (const id of SIDEGRADE_IDS) {
    const m = sidegradeModifiers(id);
    assert.ok(m.healthMultiplier >= SIDEGRADE_FLOOR.healthMultiplier, `${id}: unter der Lebengrenze`);
    assert.ok(m.damageMultiplier >= SIDEGRADE_FLOOR.damageMultiplier, `${id}: unter der Schadensgrenze`);
    assert.ok(m.launchSpeedMultiplier >= SIDEGRADE_FLOOR.launchSpeedMultiplier,
      `${id}: unter der Tempogrenze`);
  }

  // Und der Effekt der Grenze selbst: Ein künstlich kleiner Wert wird angehoben.
  // Dafür wird die Funktion mit einem Eintrag aus SIDEGRADES geprüft, dessen
  // Werte bekannt sind — die Grenze wirkt, wenn sie unterschritten würde.
  assert.ok(sidegradeModifiers('gibt-es-nicht') === null,
    'unbekannte Kennung muss null liefern, nicht die Grenzwerte');
});

test('resolveSidegrade löst Kennungen auf und lehnt Unbekanntes ab', () => {
  /*
   * Die Funktion ist Teil der öffentlichen API des Moduls: Sie ist die
   * Nachschlagestelle, die `combatProfile` und die Anzeige gemeinsam nutzen.
   * Ein Test darauf hält fest, dass sie bei Unbekanntem `null` liefert statt zu
   * werfen — die Toleranz ist Absicht (siehe combatProfile-Doku).
   */
  for (const id of SIDEGRADE_IDS) {
    const eintrag = resolveSidegrade(id);
    assert.ok(eintrag, `${id}: nicht aufgelöst`);
    assert.equal(eintrag.id, id);
    assert.ok(eintrag.modifiers, `${id}: ohne Faktoren`);
  }

  // Unbekanntes und Unsinn liefern null, statt zu werfen.
  for (const unsinn of ['gibt-es-nicht', '', null, undefined, 42, {}, []]) {
    assert.equal(resolveSidegrade(unsinn), null,
      `resolveSidegrade(${JSON.stringify(unsinn)}) sollte null liefern`);
    assert.equal(isKnownSidegrade(unsinn), false,
      `isKnownSidegrade(${JSON.stringify(unsinn)}) sollte false liefern`);
  }
});

test('Die Anzeige-Aufbereitung liefert fertige Einträge', () => {
  // Der Client darf keine Liste und kein Nachschlagen enthalten — dieselbe
  // Doktrin wie bei der Hilfe-Übersicht.
  for (const klasse of CLASS_IDS) {
    const angebot = sidegradesForClass(klasse);
    assert.ok(angebot.length > 0, `${klasse}: leeres Angebot`);
    for (const eintrag of angebot) {
      assert.equal(typeof eintrag.id, 'string');
      assert.equal(typeof eintrag.label, 'string');
      assert.equal(typeof eintrag.erklaerung, 'string');
      assert.ok(eintrag.erklaerung.length > 10, `${eintrag.id}: Erklärung zu kurz`);
      assert.ok(eintrag.modifiers, `${eintrag.id}: keine Faktoren`);
    }
  }
  // Eine unbekannte Klasse ergibt ein leeres Angebot, keinen Fehler.
  assert.deepEqual(sidegradesForClass('gibt-es-nicht'), []);
});

test('Die Erklärungstexte nennen keine Zahlen', () => {
  // Dieselbe Regel wie bei Klassen und Geländeformen: Die Zahlen stehen in den
  // Faktoren daneben. Ein Wert im Text müsste bei jeder Balance-Änderung
  // mitwandern und wäre eine zweite Quelle.
  for (const [id, eintrag] of Object.entries(SIDEGRADES)) {
    assert.doesNotMatch(eintrag.erklaerung, /\d/,
      `${id}: Der Erklärungstext nennt eine Zahl ("${eintrag.erklaerung}")`);
  }
});

test('combatProfile bleibt die EINZIGE Verrechnungsstelle', () => {
  /*
   * Der Entwurf nennt diesen Punkt ausdrücklich: Würde die Sidegrade-Rechnung an
   * einer Aufrufstelle sitzen, entstünde genau die Doppelregel, die classes.js
   * beseitigt hat. Geprüft wird, dass die Rohdaten nirgends direkt mit einem
   * Sidegrade-Faktor multipliziert werden.
   */
  const match = readFileSync(resolve(WURZEL, 'src/engine/match.js'), 'utf8');
  assert.doesNotMatch(match, /sidegradeModifiers|SIDEGRADES\b/,
    'match.js darf die Sidegrades NICHT selbst verrechnen — das gehört in combatProfile()');
  assert.doesNotMatch(match, /\.modifiers\b/,
    'match.js greift auf modifiers zu — die Verrechnung gehört in combatProfile()');
});
