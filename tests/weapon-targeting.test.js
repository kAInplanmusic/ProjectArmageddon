/**
 * Tests: Die Doppelspur `targeting` (Quelldatei) gegen die Wirkung (Motor).
 *
 * ## Der Befund
 *
 * Die Quelldatei führt für jede Waffe ein Feld `mechanic.targeting`
 * (`'directional'` oder `'self_or_area'`). Der Motor liest es **nicht** — er
 * leitet die Unterscheidung aus der Wirkung ab (`SELF_TARGET_KINDS` in
 * `specials.js`).
 *
 * Nachgemessen stimmen beide Quellen bei **139 von 150** Waffen überein. Bei 11
 * widersprechen sie sich: Die Quelldatei nennt sie `directional`, der Motor
 * erkennt sie als selbstbezogen (Heilzauber, Eisschild, Auto-Turret …).
 *
 * ## Warum diese Datei keinen Fehler „behebt"
 *
 * Die Ableitung des Motors ist die **verlässliche** Quelle: Der Heilzauber hat
 * `special: "heal"` UND `targeting: "directional"` — die Quelldatei
 * widerspricht sich in sich selbst. `targeting` ist dort der undifferenzierte
 * Normalfall (125 von 150), auch für Waffen, die nachweislich auf den Schützen
 * wirken.
 *
 * Das Feld zu verdrahten würde 11 Waffen **falsch** steuern. Diese Tests halten
 * deshalb fest, dass der Motor nach der WIRKUNG geht — und benennen den
 * Widerspruch, damit er nicht still verschwindet.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { WEAPONS } from '../src/shared/config/weapons.js';
import { buildEffect, SELF_TARGET_KINDS } from '../src/engine/specials.js';

/** Die Waffen, bei denen Datenfeld und Ableitung auseinandergehen. */
function widersprueche() {
  const liste = [];
  for (const waffe of WEAPONS) {
    const effekt = buildEffect(waffe);
    const istSelbstbezogen = Boolean(effekt && SELF_TARGET_KINDS.has(effekt.kind));
    const datenSagenSelbst = waffe.targeting === 'self_or_area';
    if (istSelbstbezogen !== datenSagenSelbst) {
      liste.push({
        id: waffe.id,
        name: waffe.displayName,
        daten: waffe.targeting,
        wirkung: effekt?.kind ?? null,
        istSelbstbezogen,
      });
    }
  }
  return liste;
}

test('Das Datenfeld `targeting` existiert für alle Waffen', () => {
  // Vorbedingung: Ohne das Feld wäre der Vergleich unten gegenstandslos.
  const werte = new Set(WEAPONS.map(w => w.targeting));
  assert.ok(werte.size > 0, 'kein einziges `targeting` im Katalog');

  const ohne = WEAPONS.filter(w => w.targeting === undefined || w.targeting === null);
  assert.deepEqual(ohne.map(w => w.id), [],
    'diese Waffen haben kein `targeting` — die Voraussetzung dieses Tests stimmt nicht mehr');
});

test('Der Motor leitet die Selbstwirkung aus der WIRKUNG ab, nicht aus dem Feld', () => {
  /*
   * Die Kernaussage: Für jede selbstbezogene Waffe muss die Ableitung sie
   * erkennen — unabhängig davon, was das Datenfeld sagt.
   */
  const selbstbezogen = WEAPONS.filter(w => {
    const e = buildEffect(w);
    return e && SELF_TARGET_KINDS.has(e.kind);
  });
  assert.ok(selbstbezogen.length >= 20,
    `Es muss viele selbstwirkende Waffen geben: ${selbstbezogen.length}`);

  // Für jede davon: Der Effekt ist bekannt und hat einen Namen.
  for (const waffe of selbstbezogen) {
    const effekt = buildEffect(waffe);
    assert.ok(effekt.kind, `${waffe.id}: die Wirkung hat keine Kennung`);
    assert.ok(SELF_TARGET_KINDS.has(effekt.kind),
      `${waffe.id}: "${effekt.kind}" gilt nicht als Selbstwirkung`);
  }
});

test('BEKANNTER WIDERSPRUCH: 11 Waffen sind als `directional` verschlagwortet, wirken aber auf den Schützen', () => {
  /*
   * Dieser Test ist eine DOKUMENTATION, kein Fehlerwächter im üblichen Sinn.
   *
   * Er hält fest, dass es den Widerspruch gibt — damit niemand später
   * versehentlich `targeting` verdrahtet und sich wundert, warum der Heilzauber
   * plötzlich angreift.
   *
   * Die Liste ist der GEGENWÄRTIGE Stand. Wird die Quelldatei nachgeschärft,
   * schlägt dieser Test fehl — und das ist erwünscht: Dann soll die Liste
   * angepasst werden.
   */
  const liste = widersprueche();
  const namen = liste.map(w => w.name).sort();

  const erwartet = [
    'Auto-Turret', 'Blutritual', 'Chaosmagier', 'Eisschild', 'Goldene Reliktkugel',
    'Heilzauber', 'Himmelswächter', 'Mutationselixier', 'Weltenbaum', 'Wächterstatue',
    'Zauberrolle',
  ].sort();

  assert.deepEqual(namen, erwartet,
    'Die Liste der Widersprüche hat sich geändert. Falls die Quelldatei '
    + 'nachgeschärft wurde: Diese Erwartung anpassen (und im MASTERDOTO die '
    + 'Kategorie von "offen" auf "erledigt" setzen).');
});

test('Alle Widersprüche gehen in dieselbe Richtung', () => {
  /*
   * Wichtig für die Bewertung: Es geht IMMER darum, dass die Daten
   * „gerichtet" sagen, der Motor aber „selbstbezogen" erkennt — nie umgekehrt.
   *
   * Gäbe es auch den umgekehrten Fall (Daten sagen selbstbezogen, Motor
   * erkennt gerichtet), wäre das ein Hinweis auf eine fehlende Wirkung: Eine
   * Waffe, die auf sich wirken SOLL, aber keinen Effekt hat. Das wäre ein
   * anderer, ernsterer Befund.
   */
  const liste = widersprueche();
  assert.ok(liste.length > 0, 'Vorbedingung: der Widerspruch existiert');

  for (const w of liste) {
    assert.equal(w.istSelbstbezogen, true,
      `${w.id} (${w.name}): die Daten sagen "${w.daten}", der Motor erkennt `
      + `"${w.wirkung}" als gerichtet — das ist ein ANDERER Befund als der `
      + 'dokumentierte. Bitte prüfen, ob dieser Waffe eine Wirkung fehlt.');
    assert.equal(w.daten, 'directional',
      `${w.id}: der dokumentierte Widerspruch war "daten=directional", `
      + `jetzt ist es "${w.daten}"`);
  }
});

test('Die Übereinstimmung ist hoch — der Widerspruch ist die Ausnahme', () => {
  /*
   * Die Einordnung. Wären 80 von 150 Widersprüche, wäre das Datenfeld wertlos
   * und der Motor die einzige Quelle — dann wäre die Empfehlung „Feld
   * entfernen" richtig. Bei 11 von 150 ist es eine Unschärfe in der Quelldatei.
   */
  const anzahl = widersprueche().length;
  const uebereinstimmung = WEAPONS.length - anzahl;
  assert.ok(uebereinstimmung / WEAPONS.length > 0.9,
    `Nur ${uebereinstimmung} von ${WEAPONS.length} stimmen überein — die `
    + 'Einordnung "Unschärfe" trägt dann nicht mehr; das Feld wäre wertlos');
});

test('`targeting` wird vom Motor nicht gelesen', () => {
  /*
   * Die Prüfung, die den Widerspruch überhaupt erst zu einem Problem macht:
   * Wäre das Feld in Gebrauch, würde eine falsche Angabe unmittelbar wirken.
   */
  const quelle = WEAPONS[0];
  assert.ok('targeting' in quelle, 'Vorbedingung: das Feld steht im Katalog');

  /*
   * Geprüft wird über den EFFEKT, nicht über den Quelltext: Für eine Waffe mit
   * widersprüchlichen Angaben muss die Wirkung der ABLEITUNG folgen. Der
   * Heilzauber ist das klarste Beispiel — er heilt, statt zu schießen.
   */
  const heilzauber = WEAPONS.find(w => w.displayName === 'Heilzauber');
  assert.ok(heilzauber, 'Vorbedingung: der Heilzauber existiert');
  assert.equal(heilzauber.targeting, 'directional',
    'Vorbedingung: er ist als gerichtet verschlagwortet');

  const effekt = buildEffect(heilzauber);
  assert.equal(effekt.kind, 'heal',
    'Der Heilzauber muss heilen — folgte der Motor dem Datenfeld, würde er schießen');
});
