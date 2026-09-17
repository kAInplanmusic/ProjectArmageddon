/**
 * Tests der Emblem-Ableitung (Erfolgs-Emblem am Spielernamen).
 *
 * ## Warum es diese Datei gibt
 *
 * Der offene Punkt in MASTERDOTO.md lautet „Erfolgs-Emblem am Spielernamen" —
 * mit dem ausdrücklichen Hinweis, dass **Namen, Texte und Symbole eine
 * Gestaltungsentscheidung des Auftraggebers** sind. Umgesetzt ist deshalb nur
 * die ABLEITUNG: Zahlen und Rang-Schlüssel aus vorhandenen Daten. Diese Tests
 * halten fest, dass nichts erfunden wird — und dass die Ableitung nicht lügt.
 *
 * ## Was geprüft wird
 *
 *  1. Die Zahlen stimmen mit den tatsächlich erreichten Erfolgen überein.
 *  2. Der Rang ist der HÖCHSTE erreichte — nicht der erste, nicht der häufigste.
 *  3. Ohne Erfolge gibt es kein Emblem (`rang: null`) statt eines leeren.
 *  4. Unbekannte Kennungen zählen nicht mit.
 *  5. `nurMuster` sagt die Wahrheit (heute sind alle 11 Erfolge Muster).
 *  6. Die Ableitung ist rein — zweimal aufgerufen dasselbe.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  emblem, ACHIEVEMENTS, TIERS, ACHIEVEMENTS_BY_ID,
} from '../src/shared/achievements.js';

/** Sammelt die Kennungen aller Erfolge eines Rangs. */
function idsMitTier(tier) {
  return ACHIEVEMENTS.filter(e => e.tier === tier).map(e => e.id);
}

test('Ohne erreichte Erfolge gibt es kein Emblem', () => {
  /*
   * `rang: null` ist die Aussage „noch nichts erreicht". Die Anzeige zeigt dann
   * GAR NICHTS — ein leerer Platzhalter wäre irreführend, als hätte der Spieler
   * etwas verpasst.
   */
  for (const eingabe of [null, undefined, [], new Set()]) {
    const e = emblem(eingabe);
    assert.equal(e.anzahl, 0, `anzahl für ${JSON.stringify(eingabe)}`);
    assert.equal(e.rang, null, 'ohne Erfolge darf kein Rang genannt werden');
    assert.equal(e.rangIndex, -1);
    assert.equal(e.anteil, 0);
    assert.equal(e.nurMuster, false);
  }
});

test('Die Anzahl entspricht den tatsächlich erreichten Erfolgen', () => {
  for (const anzahl of [1, 2, 3]) {
    const ids = ACHIEVEMENTS.slice(0, anzahl).map(e => e.id);
    const e = emblem(ids);
    assert.equal(e.anzahl, anzahl, `${anzahl} Kennungen müssen ${anzahl} ergeben`);
    assert.equal(e.gesamt, ACHIEVEMENTS.length,
      'die Gesamtzahl muss die Länge der Tabelle sein');
    assert.equal(e.anteil, anzahl / ACHIEVEMENTS.length);
  }
});

test('Der Rang ist der HÖCHSTE erreichte', () => {
  /*
   * Die Kernaussage: Ein Spieler mit einem schweren und einem leichten Erfolg
   * steht auf „schwer". Der Rang folgt der Ordnung in TIERS — nicht der
   * Reihenfolge, in der die Kennungen übergeben wurden.
   */
  const leicht = idsMitTier('leicht');
  const mittel = idsMitTier('mittel');
  assert.ok(leicht.length > 0 && mittel.length > 0, 'Vorbedingung: beide Ränge existieren');

  // Erst leicht, dann mittel …
  const e1 = emblem([...leicht.slice(0, 1), ...mittel.slice(0, 1)]);
  assert.equal(e1.rang, 'mittel');

  // … und in UMGEKEHRTER Reihenfolge dasselbe Ergebnis.
  const e2 = emblem([...mittel.slice(0, 1), ...leicht.slice(0, 1)]);
  assert.equal(e2.rang, 'mittel',
    'die Reihenfolge der Kennungen darf den Rang nicht verändern');
  assert.deepEqual(e1, e2);
});

test('Der Rang folgt der Ordnung in TIERS', () => {
  /*
   * Für JEDEN Rang in der Tabelle: Das Emblem nennt genau den höchsten
   * erreichten. Damit ist die Ableitung nicht auf die heute vorhandenen Muster
   * zugeschnitten — sie gilt für jeden Rang, der je dazukommt.
   */
  for (const [index, tier] of TIERS.entries()) {
    const ids = idsMitTier(tier);
    if (ids.length === 0) continue; // Rang ohne Einträge ist kein Fehler

    const e = emblem(ids);
    assert.equal(e.rang, tier, `Rang "${tier}" nicht erkannt`);
    assert.equal(e.rangIndex, index, `Rangindex für "${tier}" falsch`);

    // Und mit einem LEICHTEREN Erfolg dazu bleibt der höhere Rang bestehen.
    const leichter = TIERS.slice(0, index).flatMap(idsMitTier);
    if (leichter.length > 0) {
      const gemischt = emblem([...ids, ...leichter]);
      assert.equal(gemischt.rang, tier,
        `ein leichterer Erfolg darf den Rang "${tier}" nicht senken`);
    }
  }
});

test('Unbekannte Kennungen zählen nicht mit', () => {
  /*
   * Toleranz wie überall: Eine Kennung aus einer älteren Fassung oder mit
   * Tippfehler darf die Anzeige nicht verfälschen — sie zählt einfach nicht.
   * Ein geratener Erfolg wäre schlimmer als ein fehlender.
   */
  const echt = ACHIEVEMENTS[0].id;
  const e = emblem([echt, 'gibt-es-nicht', '', 'muster_fantasie']);

  assert.equal(e.anzahl, 1, 'nur der echte Erfolg darf zählen');
  assert.equal(e.rang, ACHIEVEMENTS_BY_ID[echt].tier);
});

test('`nurMuster` sagt die Wahrheit über die Inhalte', () => {
  /*
   * Die Inhalte der Erfolge fehlen noch (siehe Dateikopf von achievements.js):
   * Alle Einträge sind Muster. Ein Emblem daraus darf nicht wie eine echte
   * Auszeichnung aussehen — die Anzeige soll das kenntlich machen können.
   *
   * Dieser Test schlägt fehl, sobald echte Inhalte dazukommen (dann ist
   * `nurMuster` für gemischte Fälle `false`) — und die Anzeige kann darauf
   * umgestellt werden.
   */
  const musterIds = ACHIEVEMENTS.filter(e => e.muster === true).map(e => e.id);
  const echteIds = ACHIEVEMENTS.filter(e => e.muster !== true).map(e => e.id);

  const nurMuster = emblem(musterIds);
  assert.equal(nurMuster.nurMuster, true,
    'ein Emblem aus lauter Mustern muss sich als solches erkennen lassen');

  if (echteIds.length > 0) {
    const gemischt = emblem([...musterIds, ...echteIds]);
    assert.equal(gemischt.nurMuster, false,
      'mit echten Inhalten ist es kein Muster-Emblem mehr');
  }
});

test('Die Ableitung ist rein — zweimal aufgerufen dasselbe', () => {
  // Eine Anzeige darf keinen Zustand verändern. Wäre die Ableitung nicht rein,
  // zeigte ein zweiter Aufruf etwas anderes — und niemand würde es merken.
  const ids = ACHIEVEMENTS.slice(0, 3).map(e => e.id);
  assert.deepEqual(emblem(ids), emblem(ids));
  assert.deepEqual(emblem(null), emblem(null));
});

test('Das Emblem nennt keine Gestaltung — nur Daten', () => {
  /*
   * Die Leitentscheidung dieses Punktes: Namen, Texte und Symbole sind Sache des
   * Auftraggebers. Die Ableitung darf deshalb KEIN Symbol und KEINEN Prosa-Text
   * liefern — nur Zahlen und den Rang-Schlüssel, den das CSS einfärbt.
   */
  const e = emblem(ACHIEVEMENTS.slice(0, 2).map(a => a.id));
  assert.deepEqual(Object.keys(e).sort(),
    ['anteil', 'anzahl', 'gesamt', 'nurMuster', 'rang', 'rangIndex'],
    'die Rückgabe enthält mehr als reine Daten — wurde Gestaltung ergänzt?');
  assert.equal(typeof e.rang, 'string');
  // Der Rang ist ein Schlüssel aus TIERS, kein Symbol und kein Satz.
  assert.ok(TIERS.includes(e.rang));
});
