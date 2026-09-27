/**
 * WACHE: Ein UNVOLLSTÄNDIGER Ereignis-Kontext darf nichts werfen.
 *
 * ## Der Befund (belegt, 2026-09-27)
 *
 * Ein Aufruf mit unvollständigem Kontext riss den GESAMTEN Ereignis-Durchlauf ab:
 *
 *     TypeError: Cannot read properties of undefined (reading 'status')
 *       at Object.lokal (src/client/ereignisse.js:615:25)
 *         if (k.fernzustand.status() !== 'gameover') k.hud.log('Match beendet', …);
 *
 * `k.fernzustand` war nicht gesetzt. Der Wurf brach die Schleife über die
 * Ereignisse ab — EIN fehlendes Feld nahm ALLE folgenden Meldungen mit. Im echten
 * Client ist das Feld gesetzt (`main.js#ereignisKontext`); es war kein Live-Fehler,
 * sondern ein Aufrufer, der einen Teil des Vertrags wegließ. Ein solcher Aufruf
 * darf trotzdem nicht mehr kosten als seine eigene Wirkung.
 *
 * ## Was hier festgehalten wird
 *
 *  1. Der gemeldete Fall (lokales `match_over` ohne `fernzustand`) wirft nicht —
 *     und die NACHFOLGENDEN Ereignisse kommen noch an. Genau das war der Schaden.
 *  2. Ein Aufruf ohne Kontext (undefined/null) werfen nicht.
 *  3. JEDE Ereignisart der Tabelle kommt mit einem leeren Kontext aus.
 *  4. Der Normalbetrieb erzeugt KEINE zusätzliche Meldung, und die Anzeige
 *     unterscheidet weiter „Sprung" und „Doppelsprung".
 *
 * Die Regel selbst (warum Pflichtfelder EINMAL gemeldet werden und `match` online
 * fehlen darf) steht in `src/client/ereignisse.js`, Abschnitt „Der Kontext".
 */
import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

import { EREIGNIS_WIRKUNGEN, verarbeiteLokal, verarbeiteOnline } from '../src/client/ereignisse.js';

/**
 * Ein Kontext, wie `Main#ereignisKontext()` ihn baut.
 *
 * Absichtlich vollständig: Jeder Test entfernt genau das Feld, das er prüfen
 * will — sonst würde er Lücken mitprüfen, die er nicht meint.
 *
 * @param {Array<{text: string, art: string}>} texte Sammelstelle der Meldungen
 * @returns {object} Kontext für beide Einstiege
 */
function vollerKontext(texte = []) {
  return {
    renderer: {
      applyContraction() {},
      applyCrater() {},
      addFlash() {},
      spawnExplosionParticles() {},
      addMuzzleFlash() {},
    },
    hud: { log: (text, art) => texte.push({ text, art }) },
    // Darf fehlen (kein Ausgabegerät) — deshalb steht es NICHT in den Pflichtfeldern.
    sound: null,
    match: { players: [] },
    shotPredictor: { resolve() {} },
    nameOf: id => `P${id}`,
    findEntity: () => null,
    drawHitscanBeam() {},
    logSpecialEffect() {},
    showGuentherWheel() {},
    showEndScreen() {},
    fernzustand: {
      status: () => 'playing',
      setzeStatus() {},
      setzeSieger() {},
      setzeEinschnitt() {},
    },
  };
}

test('Ein fehlendes Kontextfeld bricht den Durchlauf NICHT ab', () => {
  const texte = [];
  const kontext = vollerKontext(texte);
  delete kontext.fernzustand; // genau der gemeldete Fall (ereignisse.js, lokal)

  const warnung = mock.method(console, 'warn', () => {});
  try {
    assert.doesNotThrow(() => {
      // Die drei Ereignisse laufen wie in `Main#handleEvents` hintereinander —
      // das erste ist das, das den Durchlauf früher abgerissen hat.
      verarbeiteLokal(kontext, { type: 'match_over', payload: {} });
      verarbeiteLokal(kontext, { type: 'jumped', payload: { playerId: 1, double: false, jumpsLeft: null } });
      verarbeiteLokal(kontext, { type: 'landed', payload: { playerId: 1 } });
    }, 'Ein fehlendes Kontextfeld darf nicht werfen');

    assert.deepEqual(
      texte.map(eintrag => eintrag.text),
      /*
       * „Match beendet" steht mit in der Liste: Ohne `fernzustand` ist der
       * Fernzustand unbekannt, `k.fernzustand?.status()` liefert `undefined` —
       * die Bedingung „nicht gameover" gilt damit als erfüllt und die Meldung
       * erscheint. Genau richtig: Das Ereignis SELBST heißt `match_over`, die
       * Aussage „Match beendet" stimmt also unabhängig vom Kontext. Angekommen
       * ist sie — und die beiden FOLGENDEN Ereignisse ebenfalls; DAS ist die
       * Zusicherung, um die es hier geht.
       */
      ['Match beendet', 'P1 springt', 'P1 ist gelandet'],
      'Nach dem Ereignis mit fehlendem Feld müssen die FOLGENDEN noch ankommen',
    );

    // Die Lücke wird gemeldet — aber EINMAL, nicht je Ereignis.
    assert.equal(warnung.mock.callCount(), 1,
      `Die Lücke muss genau einmal gemeldet werden, nicht je Ereignis (${warnung.mock.callCount()} Warnungen)`);
    assert.match(String(warnung.mock.calls[0].arguments[0]), /fernzustand/,
      'Die Meldung muss das fehlende Feld NENNEN');
  } finally {
    warnung.mock.restore();
  }
});

test('Ein Aufruf ohne Kontext wirft nicht', () => {
  const warnung = mock.method(console, 'warn', () => {});
  try {
    assert.doesNotThrow(() => {
      verarbeiteLokal(undefined, { type: 'landed', payload: { playerId: 1 } });
      verarbeiteOnline(undefined, { t: 'jumped', playerId: 1 });
      verarbeiteLokal(null, { type: 'match_over', payload: {} });
      verarbeiteOnline(null, { t: 'turn_start' });
      // Leerer Kontext: Objekt, aber ohne jedes Feld.
      verarbeiteLokal({}, { type: 'landed', payload: { playerId: 1 } });
    }, 'Ohne (oder mit leerem) Kontext darf nichts werfen');
  } finally {
    warnung.mock.restore();
  }
});

test('Jede Ereignisart der Tabelle kommt mit leerem Kontext aus', () => {
  const typen = Object.keys(EREIGNIS_WIRKUNGEN);
  assert.ok(typen.length > 20,
    `Die Wirkungstabelle ist unerwartet klein (${typen.length}) — dann prüft dieser Test nichts`);

  const warnung = mock.method(console, 'warn', () => {});
  try {
    for (const typ of typen) {
      assert.doesNotThrow(() => verarbeiteLokal({}, { type: typ, payload: {} }), `lokal, leerer Kontext: ${typ}`);
      assert.doesNotThrow(() => verarbeiteOnline({}, { t: typ }), `online, leerer Kontext: ${typ}`);
      assert.doesNotThrow(() => verarbeiteLokal(undefined, { type: typ, payload: {} }), `lokal, ohne Kontext: ${typ}`);
      assert.doesNotThrow(() => verarbeiteOnline(undefined, { t: typ }), `online, ohne Kontext: ${typ}`);
    }
  } finally {
    warnung.mock.restore();
  }
});

test('Der Normalbetrieb meldet nichts — und die Anzeige unterscheidet weiter', () => {
  const texte = [];
  const kontext = vollerKontext(texte);
  const warnung = mock.method(console, 'warn', () => {});
  try {
    verarbeiteLokal(kontext, { type: 'jumped', payload: { playerId: 1, double: true, impulse: 8.1, jumpsLeft: null } });
    verarbeiteLokal(kontext, { type: 'jumped', payload: { playerId: 2, double: false, impulse: 10.1, jumpsLeft: null } });
    verarbeiteOnline(kontext, { t: 'match_over', winnerTeamId: 1 });
    verarbeiteOnline(kontext, { t: 'landed', playerId: 1 });

    assert.equal(warnung.mock.callCount(), 0,
      `Mit vollständigem Kontext darf keine Meldung entstehen: ${JSON.stringify(warnung.mock.calls)}`);
    assert.deepEqual(texte.map(eintrag => eintrag.text),
      ['P1 springt (Doppelsprung)', 'P2 springt', 'P1 ist gelandet'],
      'Die Unterscheidung „Sprung"/„Doppelsprung" hängt an `double`, nicht an `jumpsLeft`');
  } finally {
    warnung.mock.restore();
  }
});
