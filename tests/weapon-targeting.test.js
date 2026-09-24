/**
 * Tests: Das Datenfeld `targeting` gegen die Wirkung im Motor.
 *
 * ## Der Befund (2026-09-24) und seine Behebung (2026-09-25)
 *
 * Die Quelldatei führt für jede Waffe `mechanic.targeting` (`'directional'`
 * oder `'self_or_area'`). Der Motor entscheidet die Frage „geht das auf den
 * Schützen oder ins Ziel?" aus der WIRKUNG (`buildEffect`/`SELF_TARGET_KINDS`).
 *
 * Nachgemessen stimmten beide Quellen bei 139 von 150 Waffen überein. Bei 11
 * widersprachen sie sich: Die Quelldatei nannte sie `directional`, der Motor
 * erkannte sie als selbstbezogen (Heilzauber, Eisschild, Auto-Turret …). Die
 * Ableitung des Motors ist die verlässliche Quelle — der Heilzauber hat
 * `special: "heal"` UND `targeting: "directional"`, die Quelldatei widersprach
 * sich also in sich selbst.
 *
 * Die Quelldatei wurde deshalb am 2026-09-25 an DIESEN 11 Stellen korrigiert
 * (`scripts/fix-targeting.mjs`, einmalig). Beide Quellen stimmen jetzt bei
 * ALLEN 150 Waffen überein, und `npm run check:targeting` hält das fest.
 *
 * ## Warum der Motor trotzdem nach der Wirkung entscheidet
 *
 * „Eine Regel, eine Stelle": Die Wirkung bestimmt, WAS geschieht (`kind`), und
 * damit zwangsläufig auch, WER betroffen ist. Das Feld ist die Absicht der
 * Designdatei; sie wird gegen die Wirkung geprüft, statt sie zu doppeln. Das
 * Feld reist als Teil des `shot`-Ereignisses zu den Verbrauchern (Anzeige,
 * Aufzeichnung, Ton).
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

  for (const waffe of selbstbezogen) {
    const effekt = buildEffect(waffe);
    assert.ok(effekt.kind, `${waffe.id}: die Wirkung hat keine Kennung`);
    assert.ok(SELF_TARGET_KINDS.has(effekt.kind),
      `${waffe.id}: "${effekt.kind}" gilt nicht als Selbstwirkung`);
  }
});

test('Datenfeld und Wirkung stimmen bei ALLEN Waffen überein', () => {
  /*
   * Die behobene Stelle. Bis 2026-09-24 standen hier 11 Widersprüche als
   * dokumentierter Zustand; die Quelldatei wurde danach an genau diesen 11
   * Waffen von `directional` auf `self_or_area` korrigiert.
   *
   * Der Test ist jetzt ein WÄCHTER: Kommt ein Widerspruch zurück, schlägt er
   * fehl — und zwar mit Namen und Wirkung, damit die Ursache sofort sichtbar
   * ist.
   */
  const liste = widersprueche();
  assert.deepEqual(
    liste.map(w => `${w.id} ${w.name}: daten=${w.daten}, wirkung=${w.wirkung}`),
    [],
    'Datenfeld und Wirkung gehen wieder auseinander — '
    + 'die Designdatei muss zur Wirkung nachgeschärft werden '
    + '(oder die Waffe hat eine neue Wirkung bekommen)',
  );
});

test('Die 11 ehemals widersprüchlichen Waffen sind jetzt als selbstbezogen verschlagwortet', () => {
  /*
   * Gegenprobe zur Korrektur: Nicht nur „keine Widersprüche", sondern die
   * benannten Waffen tragen wirklich den neuen Wert. Sonst könnte der Test
   * oben auch grün sein, weil die WIRKUNG sich geändert hat statt der Daten.
   */
  const erwartet = [
    'Auto-Turret', 'Blutritual', 'Chaosmagier', 'Eisschild', 'Goldene Reliktkugel',
    'Heilzauber', 'Himmelswächter', 'Mutationselixier', 'Weltenbaum', 'Wächterstatue',
    'Zauberrolle',
  ].sort();

  const gefunden = WEAPONS
    .filter(w => erwartet.includes(w.displayName))
    .map(w => w.displayName)
    .sort();
  assert.deepEqual(gefunden, erwartet, 'Vorbedingung: die Waffen existieren');

  for (const name of erwartet) {
    const waffe = WEAPONS.find(w => w.displayName === name);
    assert.equal(waffe.targeting, 'self_or_area',
      `${name}: muss als self_or_area verschlagwortet sein, ist aber "${waffe.targeting}"`);
    const effekt = buildEffect(waffe);
    assert.ok(effekt && SELF_TARGET_KINDS.has(effekt.kind),
      `${name}: die Wirkung muss selbstbezogen sein`);
  }
});

test('Die Wirkung folgt weiterhin der ABLEITUNG, nicht dem Feld', () => {
  /*
   * Die Prüfung, die den Widerspruch überhaupt erst zu einem Problem machte:
   * Wäre das Feld die Steuerquelle, könnte eine falsche Angabe unmittelbar
   * wirken. Geprüft wird über den EFFEKT — der Heilzauber muss heilen.
   */
  const heilzauber = WEAPONS.find(w => w.displayName === 'Heilzauber');
  assert.ok(heilzauber, 'Vorbedingung: der Heilzauber existiert');
  assert.equal(heilzauber.targeting, 'self_or_area',
    'Der Heilzauber ist jetzt korrekt als selbstbezogen verschlagwortet');

  const effekt = buildEffect(heilzauber);
  assert.equal(effekt.kind, 'heal',
    'Der Heilzauber muss heilen — folgte der Motor dem Datenfeld statt der Wirkung, '
    + 'würde er schießen');
});
