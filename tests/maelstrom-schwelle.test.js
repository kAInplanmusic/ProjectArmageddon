/**
 * Die Schwelle des Mahlstroms: EINE Zahl, und die Anzeige schaltet bei IHR um.
 *
 * ## Der Fund (belegt)
 *
 * Die Schwelle stand ZWEIMAL:
 *
 *   - Motor: `match.js:2722` liest `MATCH_RULES.suddenDeath.roundBreakpoint`
 *     (`roundBreakpoint = 8`).
 *   - Client: `main.js:1194` rechnete hart `(snapshot.round ?? 0) >= 15` — der
 *     Wert VOR der letzten Balancing-Änderung.
 *
 * ONLINE war der Mahlstrom damit sieben Runden lang UNSICHTBAR: Der Renderer
 * zeichnet die Sturmwand nur bei `active` (`renderer.js`, `#drawMaelstrom`), das HUD meldete
 * derweil grün „Läuft" (`hud.js:255`) — während die Karte sich ab Runde 8
 * zusammenzog und Leben kostete. Lokal fiel nichts auf, weil dort der Motor den
 * Wert liefert (`engine/stateSnapshot.js`).
 *
 * ## Was hier gemessen wird
 *
 * Der Client liest die Schwelle jetzt über `maelstromActiveFromRound()` aus
 * derselben Konfiguration wie der Motor. Dieser Test hält beide Seiten
 * GEGENEINANDER: Er spielt ein echtes Match und vergleicht für JEDE gesehene
 * Runde, was der Motor meldet (`state.maelstrom.active`) mit dem, was die
 * Funktion für die Anzeige sagt. Läuft eine der beiden Seiten wieder auf einen
 * eigenen Wert, fällt es hier auf — und nicht erst im Online-Spiel.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { MatchController } from '../src/engine/match.js';
import { MATCH_RULES, maelstromActiveFromRound } from '../src/shared/config/match.js';
import { ohneKommentare } from './helfer/ohne-kommentare.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCHWELLE = MATCH_RULES.suddenDeath.roundBreakpoint;

test('Die Schwelle der Konfiguration ist die, die der Motor liest', () => {
  /*
   * Die Zahl selbst ist eine Design-Entscheidung und wird hier NICHT
   * festgeschrieben — festgehalten wird, dass die Anzeige-Funktion sie liest
   * und nicht eine eigene führt.
   */
  assert.equal(maelstromActiveFromRound(SCHWELLE - 1), false);
  assert.equal(maelstromActiveFromRound(SCHWELLE), true);
  assert.equal(maelstromActiveFromRound(SCHWELLE + 1), true);
  assert.equal(maelstromActiveFromRound(1), SCHWELLE <= 1);
  assert.equal(maelstromActiveFromRound(Number.NaN), false, 'Unsinn schaltet nichts ein');
});

test('Der Motor schaltet genau bei der Schwelle — und die Anzeige mit ihm', () => {
  /*
   * Der Beleg: ein echtes Match, Runde für Runde. Gesammelt werden ALLE
   * Runden, in denen der Zustand gesehen wurde, samt der Aussage des Motors.
   * Danach wird jede Zeile gegen die Anzeige-Funktion gehalten.
   */
  const match = new MatchController({ seed: 20260927, teams: 2, playersPerTeam: 1, turnDurationMs: 400 });
  match.start();

  const gesehen = new Map();
  let schutz = 0;
  while (match.status === 'playing' && schutz < 4000) {
    const zustand = match.getState();
    const runde = zustand.round;
    // Erste Beobachtung je Runde festhalten (aktiv wechselt innerhalb einer
    // Runde nicht mehr).
    if (!gesehen.has(runde)) gesehen.set(runde, Boolean(zustand.maelstrom?.active));
    match.endTurn();
    match.step();
    match.consumeEvents();
    schutz += 1;
  }

  assert.ok(gesehen.size >= 3, `Es müssen mehrere Runden gesehen werden (waren ${gesehen.size})`);

  const ersteAktive = [...gesehen.entries()].find(([, aktiv]) => aktiv)?.[0] ?? null;
  assert.equal(
    ersteAktive, SCHWELLE,
    `Der Motor muss ab Runde ${SCHWELLE} aktiv sein (erste aktive Runde war ${ersteAktive})`,
  );
  assert.equal(
    gesehen.get(SCHWELLE - 1), false,
    `In Runde ${SCHWELLE - 1} darf der Motor NICHT aktiv sein`,
  );

  for (const [runde, motorAktiv] of gesehen) {
    assert.equal(
      maelstromActiveFromRound(runde), motorAktiv,
      `Runde ${runde}: Motor sagt ${motorAktiv}, die Anzeige-Schwelle sagt ${maelstromActiveFromRound(runde)}`,
    );
  }
});

test('Der alte Wert 15 wäre für jede Runde zwischen ihm und der Schwelle falsch', () => {
  /*
   * Der gemessene Effekt in einer Zeile: Für die Runden der neuen Schwelle bis
   * 14 hätte die fest verdrahtete 15 „nicht aktiv" gemeldet, während der Motor
   * längst einschneidet. Diese Schranke hält fest, wie viele Runden das betrifft
   * (heute sieben).
   */
  const falschGemeldet = [];
  for (let runde = SCHWELLE; runde < 15; runde += 1) {
    if (maelstromActiveFromRound(runde) !== (runde >= 15)) falschGemeldet.push(runde);
  }
  assert.equal(
    falschGemeldet.length, 15 - SCHWELLE,
    `Runden ${falschGemeldet.join(', ')} wären mit der festen 15 unsichtbar geblieben`,
  );
});

test('Der Online-Ansichtszustand führt keine eigene Mahlstrom-Schwelle mehr', () => {
  /*
   * Eine Wache gegen den Rückfall: Genau die Zeile, die den Fehler erzeugte,
   * darf nicht wiederkommen. Geprüft wird der Quelltext OHNE Kommentare — die
   * Kommentare NENNEN die alte Zahl, weil sie den Fund erklären.
   */
  const quelltext = ohneKommentare(fs.readFileSync(path.join(ROOT, 'src/client/main.js'), 'utf8'));
  assert.doesNotMatch(
    quelltext,
    /maelstrom\s*:\s*\{[^}]*>=\s*15/,
    'Der Ansichtszustand darf die Mahlstrom-Schwelle nicht mehr selbst rechnen (>= 15)',
  );
  assert.match(
    quelltext,
    /maelstromActiveFromRound\(/,
    'Der Ansichtszustand muss die gemeinsame Schwelle lesen (maelstromActiveFromRound)',
  );
});
