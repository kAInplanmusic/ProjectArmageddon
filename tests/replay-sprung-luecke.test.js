/**
 * WACHE: Ein Sprung MUSS in einer Aufzeichnung reproduzierbar sein.
 *
 * ## Der Befund, der zu dieser Datei fuehrte (gemessen 2026-09-26)
 *
 * Aufgezeichnet werden konnte nur EIN Ding: ein Schuss.
 * `ReplayRecorder.recordInput({ tick, playerId, angle, power, weaponId })`
 * — und der Wiedergabepfad rief ausschliesslich `match.fire(...)`. Fuer einen
 * Sprung hatte das Format keinen Platz.
 *
 * Der Sprung ist aber SIMULATIONSZUSTAND: `MatchController.jump()` setzt einen
 * Geschwindigkeitsimpuls (`Velocity.y`), die Figur fliegt danach unter
 * Schwerkraft. Er veraendert also den Spielverlauf — und wurde nicht
 * aufgezeichnet.
 *
 *     ohne Sprung   Hash nach Aufzeichnung b528e643  -> Wiedergabe b528e643  REPRODUZIERBAR
 *     mit  Sprung   Hash nach Aufzeichnung 380b5ef8  -> Wiedergabe c7576510  ABWEICHUNG
 *
 * ## Was daraus wurde (O8)
 *
 * Das Replay-Format kennt jetzt MEHRERE Eingabearten (`kind`): Schuss, Sprung
 * und Abwurf (`src/engine/replay.js`). Der Server zeichnet Sprung und Abwurf auf
 * (`gameServer.js`), und die Wiedergabe wendet sie ueber `#wendeEingabeAn` an.
 *
 * **Diese Wache ist damit UMGEDREHT** — aus „der Sprung ist NICHT
 * reproduzierbar" wurde „der Sprung IST reproduzierbar". Der Kopfkommentar hielt
 * das ausdruecklich fest: Die Datei wurde nicht geloescht, sondern umgedreht.
 *
 * ## Reichweite
 *
 * Gemessen wird der MOTOR, ohne Browser und ohne Server. Die Wiedergabe ist
 * damit eine Eigenschaft des Aufzeichnungsformats, nicht des Netzwerkwegs.
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
 * Spielt eine Partie und zeichnet auf, was der Recorder kann: Schuesse und
 * (optional) EINEN Sprung.
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
       *
       * Seit O8 wird der Sprung AUFGEZEICHNET (`kind: 'jump'`) — vorher fehlte er
       * im Format, und die Wiedergabe lief auseinander.
       */
      if (mitSprung && spruenge === 0 && schuesse === 3 && match.isGrounded(state.activePlayerId)) {
        const ergebnis = match.jump(state.activePlayerId, 1);
        if (ergebnis.ok) {
          recorder.recordInput({
            tick: match.world.tickCount, playerId: state.activePlayerId,
            seitlich: 1, kind: 'jump',
          });
          spruenge += 1;
        }
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
   * Ohne diesen Test waere die Zusicherung unten nicht aussagekraeftig — sie
   * koennte auch heissen "Aufzeichnung funktioniert generell nicht". Erst die
   * Gleichheit in beiden Faellen zeigt, dass die Aufzeichnung traegt.
   */
  const { document, spruenge, hash } = partie(false);
  assert.equal(spruenge, 0, 'Vorbedingung: in diesem Lauf wird nicht gesprungen');

  const { match: zurueck, rejected } = playReplay(document, {});
  assert.equal(zurueck.stateHash(), hash,
    'Ohne Sprung muss die Wiedergabe denselben Zustand ergeben');
  assert.equal(rejected.length, 0, 'Ohne Sprung darf keine Eingabe abgelehnt werden');
  assert.equal(zurueck.world.tickCount, document.expected.tick, 'Auch der Takt muss stimmen');
});

test('Ein aufgezeichneter Sprung ist reproduzierbar (O8)', () => {
  const { document, spruenge, hash } = partie(true);
  /*
   * Vorbedingung scharf pruefen: Wenn der Sprung nicht ausgeloest wurde, misst
   * dieser Test nichts. Ein stiller Durchlauf waere schlimmer als ein roter
   * Test — er saehe wie Bestaetigung aus.
   */
  assert.equal(spruenge, 1, 'Vorbedingung: der Sprung MUSS ausgeloest worden sein');
  assert.ok(document.entries.some(e => e.kind === 'jump'),
    'Der aufgezeichnete Sprung muss als Eintrag mit kind="jump" im Dokument stehen');

  const { match: zurueck, rejected } = playReplay(document, {});

  // Der aufgezeichnete Zustand IST der wiedergegebene — die Umkehrung der alten
  // Befund-Wache.
  assert.equal(zurueck.stateHash(), hash,
    'Der Sprung ist aufzeichenbar — die Wiedergabe muss denselben Zustand ergeben. '
    + 'Faellt diese Zusicherung, ist das Replay-Format kaputt, nicht der Sprung.');

  // Keine Eingabe darf verloren gehen.
  assert.equal(rejected.length, 0,
    'Bei reproduzierbarer Wiedergabe darf keine Eingabe abgelehnt werden');
});

test('Der Recorder kennt die zweite Eingabeart: den Sprung', () => {
  /*
   * Der strukturelle Grund, an der Quelle geprueft — jetzt mit umgekehrtem
   * Vorzeichen. Frueher stand hier ein Verbot (`doesNotMatch`), das den Befund
   * festhielt; O8 hat den Befund eingeloest, und der Test fordert jetzt die
   * zweite Eingabeart.
   */
  const quelle = readFileSync(
    new URL('../src/engine/replay.js', import.meta.url), 'utf8',
  );
  const signatur = quelle.match(/recordInput\(([^)]*)\)/);
  assert.ok(signatur, 'recordInput muss es geben');
  assert.match(signatur[1], /angle/, 'Der Schuss traegt einen Winkel');
  assert.match(signatur[1], /power/, 'Der Schuss traegt eine Kraft');
  assert.match(signatur[1], /kind/, 'Das Format kennt Eingabearten');
  assert.match(signatur[1], /seitlich/, 'Der Sprung traegt eine Richtung');
});
