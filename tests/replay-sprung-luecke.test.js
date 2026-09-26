/**
 * BEFUND-WACHE: Ein Sprung ist in einer Aufzeichnung NICHT reproduzierbar.
 *
 * ## Der Befund, gemessen
 *
 * Aufgezeichnet werden kann nur EIN Ding: ein Schuss.
 * `ReplayRecorder.recordInput({ tick, playerId, angle, power, weaponId })`
 * (`src/engine/replay.js:118`) — und der Wiedergabepfad ruft ausschliesslich
 * `match.fire(...)` (`:393`). Fuer einen Sprung hat das Format keinen Platz.
 *
 * Der Sprung ist aber SIMULATIONSZUSTAND: `MatchController.jump()` setzt einen
 * Geschwindigkeitsimpuls (`Velocity.y`), die Figur fliegt danach unter
 * Schwerkraft. Er veraendert also den Spielverlauf — und wird nicht aufgezeichnet.
 *
 * ## Gemessen (Sonde, 2026-09-26)
 *
 * Zwei Partien, identischer Seed, identische Konfiguration, identische Schussfolge.
 * In der zweiten Partie zusaetzlich EIN Sprung (nur wenn `isGrounded()` es erlaubt):
 *
 *     ohne Sprung   Hash nach Aufzeichnung b528e643  -> Wiedergabe b528e643  REPRODUZIERBAR
 *     mit  Sprung   Hash nach Aufzeichnung 380b5ef8  -> Wiedergabe c7576510  ABWEICHUNG
 *
 * Und ein zweites Signal, das die Groesse zeigt: mit Sprung wurden beim
 * Abspielen **3 von 12** aufgezeichneten Schuessen ABGELEHNT — das Match ist so
 * weit auseinandergelaufen, dass die Aufzeichnung nicht mehr zum Takt passt.
 *
 * ## Warum das heute niemanden trifft
 *
 *  - `scripts/replay.mjs` schiesst nur und springt nie — seine Aufzeichnungen
 *    verifizieren deshalb.
 *  - ONLINE kann niemand springen: `src/client/main.js:793-794` steigt bei
 *    `mode !== 'local'` STUMM aus, und das `CONTROL`-Protokoll kennt keinen
 *    Sprungbefehl. Eine Serveraufzeichnung kann also keinen Sprung enthalten.
 *  - Eine LOKAL gespielte Partie mit Sprung wird nicht aufgezeichnet, weil nur
 *    `scripts/replay.mjs` aufzeichnet — und das springt nicht.
 *
 * Der Befund ist damit LATENT: er wartet auf den ersten, der springt und dabei
 * aufzeichnet.
 *
 * ## Warum diese Wache existiert — und wann sie UMZUDREHEN ist
 *
 * Sie haelt den Ist-Zustand fest. Der naechste, der Online-Springen baut
 * (Befund O8, `docs/auftraege/online-sprung-und-abwurf.md`), wird hier ROT und
 * liest, was zu tun ist:
 *
 *   **Das Replay-Format muss den Sprung aufnehmen** (eine Eingabeart neben dem
 *   Schuss), UND der Server muss ihn aufzeichnen. Danach wird aus dieser Wache
 *   eine Gleichheits-Zusicherung: dieselbe Partie mit Sprung muss reproduzierbar
 *   sein.
 *
 * Wer diese Datei loescht, statt sie umzudrehen, nimmt den Befund mit.
 *
 * ## Reichweite
 *
 * Gemessen wird der MOTOR, ohne Browser und ohne Server. Der Befund ist damit
 * eine Eigenschaft des Aufzeichnungsformats, nicht des Netzwerkwegs.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { MatchController } from '../src/engine/match.js';
import { ReplayRecorder, playReplay } from '../src/engine/replay.js';

const KONFIG = Object.freeze({
  seed: 20260910,
  teams: 2,
  playersPerTeam: 2,
  preset: 'hills',
  maxRounds: 12,
});

/**
 * Spielt eine Partie und zeichnet nur das auf, was der Recorder kann: Schuesse.
 *
 * @param {boolean} mitSprung - ob zusaetzlich EINMAL gesprungen wird
 * @returns {{document: object, spruenge: number, schuesse: number, hash: string}}
 */
function partie(mitSprung) {
  const match = new MatchController({ ...KONFIG, turnDurationMs: 2000 });
  match.start();

  const recorder = new ReplayRecorder({ ...KONFIG, turnDurationMs: match.turnDurationMs });

  let schuesse = 0;
  let spruenge = 0;
  let ticks = 0;

  while (match.status === 'playing' && ticks < 60_000 && schuesse < 12) {
    const state = match.getState();
    if (state.activePlayerId !== null && state.turnElapsedMs < 16) {
      /*
       * Der Sprung — nur wenn der Motor ihn erlaubt.
       *
       * `jump()` lehnt ab, wenn die Figur nicht am Boden steht ("In der Luft ist
       * kein erster Sprung moeglich"): Eine Figur auf `boden - 12` (Kopfhoehe)
       * muss erst fallen. Deshalb wird `isGrounded()` abgewartet statt geraten.
       */
      if (mitSprung && spruenge === 0 && schuesse === 3 && match.isGrounded(state.activePlayerId)) {
        const ergebnis = match.jump(state.activePlayerId, 1);
        if (ergebnis.ok) spruenge += 1;
      }

      const angle = Math.PI / 4 + (schuesse % 9) * 0.05;
      const power = 50 + (schuesse % 6) * 8;
      const result = match.fire(state.activePlayerId, angle, power);
      if (result.ok) {
        recorder.recordInput({
          tick: match.world.tickCount, playerId: state.activePlayerId, angle, power,
        });
        schuesse += 1;
      }
    }
    match.step();
    match.consumeEvents();
    ticks += 1;
  }

  recorder.finalize(match.world.tickCount);

  return {
    document: {
      ...recorder.toJSON(),
      expected: {
        status: match.status,
        round: match.round,
        tick: match.world.tickCount,
        stateHash: match.stateHash(),
      },
    },
    spruenge,
    schuesse,
    hash: match.stateHash(),
  };
}

test('Die Gegenprobe: OHNE Sprung ist die Aufzeichnung reproduzierbar', () => {
  /*
   * Ohne diesen Test waere der Befund unten nicht aussagekraeftig — er koennte
   * auch heissen "Aufzeichnung funktioniert generell nicht". Erst der
   * Unterschied zwischen den beiden Faellen zeigt, dass es der SPRUNG ist.
   */
  const { document, spruenge, hash } = partie(false);
  assert.equal(spruenge, 0, 'Vorbedingung: in diesem Lauf wird nicht gesprungen');

  const { match: zurueck, rejected } = playReplay(document, {});
  assert.equal(zurueck.stateHash(), hash,
    'Ohne Sprung muss die Wiedergabe denselben Zustand ergeben');
  assert.equal(rejected.length, 0, 'Ohne Sprung darf keine Eingabe abgelehnt werden');
  assert.equal(zurueck.world.tickCount, document.expected.tick, 'Auch der Takt muss stimmen');
});

test('BEFUND: Ein Sprung ist NICHT aufzeichenbar und macht die Wiedergabe abweichend', () => {
  const { document, spruenge, hash } = partie(true);
  /*
   * Vorbedingung scharf pruefen: Wenn der Sprung nicht ausgeloest wurde, misst
   * dieser Test nichts. Ein stiller Durchlauf waere schlimmer als ein roter
   * Test — er saehe wie Bestaetigung aus.
   */
  assert.equal(spruenge, 1, 'Vorbedingung: der Sprung MUSS ausgeloest worden sein');

  const { match: zurueck, rejected } = playReplay(document, {});

  // 1. Der aufgezeichnete Zustand ist NICHT der wiedergegebene.
  assert.notEqual(zurueck.stateHash(), hash,
    'Wenn diese Zusicherung faellt, ist der Sprung aufzeichenbar geworden — '
    + 'DANN ist diese Wache umzudrehen (Gleichheit fordern), nicht zu loeschen. '
    + 'Siehe Kopfkommentar.');

  // 2. Die Abweichung ist gross genug, dass Aufzeichnungen abgelehnt werden.
  assert.ok(rejected.length > 0,
    'Die Abweichung muss sich in abgelehnten Eingaben zeigen — ein reiner '
    + 'Hash-Unterschied ohne abgelehnte Eingaben waere ein anderer Befund');
});

test('Der Recorder kennt genau EINE Eingabeart: den Schuss', () => {
  /*
   * Der strukturelle Grund des Befunds, an der Quelle geprueft.
   *
   * Diese Zusicherung ist absichtlich am QUELLTEXT: Sie faellt, sobald jemand
   * eine zweite Eingabeart einfuehrt — und zwingt ihn, den Befund oben
   * mitzunehmen statt ihn zu uebersehen.
   */
  const quelle = readFileSync(
    new URL('../src/engine/replay.js', import.meta.url), 'utf8',
  );
  const signatur = quelle.match(/recordInput\(([^)]*)\)/);
  assert.ok(signatur, 'recordInput muss es geben');
  assert.match(signatur[1], /angle/, 'Der Schuss traegt einen Winkel');
  assert.match(signatur[1], /power/, 'Der Schuss traegt eine Kraft');
  assert.doesNotMatch(signatur[1], /jump|sprung|kind|type/,
    'recordInput kennt KEINE Eingabeart und KEINEN Sprung. Wer hier eine zweite '
    + 'Art ergaenzt, muss den Befund-Test oben umdrehen (siehe Kopfkommentar).');
});
