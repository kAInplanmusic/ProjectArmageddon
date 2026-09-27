/**
 * Das Trefferfenster der Kennzahlen: Ein Treffer zählt nur, wenn der Schaden
 * INNERHALB einer Frist ankommt.
 *
 * ## Der Fund (belegt)
 *
 * `MatchStats#feed` führt für jeden Schuss den Takt mit, in dem er fiel
 * (`letzterSchuss.tick`), und vergleicht gegen den laufenden Takt:
 *
 *     this.tick - letzter.tick <= TREFFER_FENSTER_TICKS
 *
 * Nur: `this.tick` wurde NIE fortgeschrieben. Der einzige Schreiber war
 * `match_over` (`p.ticks`) — während der Partie blieb der Wert 0. Damit lautete
 * die Bedingung immer `0 - 0 <= 240`, das Fenster war also IMMER durchlässig.
 * Gemessen vorher: ein Schuss, 2000 Takte später Schaden → `treffer: 1`,
 * `trefferquote: 1`. Sichtbar für den Spieler war das in der Trefferquote des
 * Berichts.
 *
 * Kein Test deckte es, weil `tests/stats.test.js` den Takt von Hand nachzog
 * (`stats.tick = match.world.tickCount`) — der Test führte genau die Zeile aus,
 * die im Produkt fehlte.
 *
 * ## Was hier gemessen wird
 *
 * Der Takt kommt jetzt über den Aufruf mit (`feedAll(events, tick)`), so wie ihn
 * der Client aus seinem Match gibt (`main.js#step`). Drei Fälle sind zu
 * unterscheiden:
 *
 *   - Schaden INNERHALB des Fensters  → zählt als Treffer
 *   - Schaden AUSSERHALB              → zählt NICHT (der Schuss bleibt ein Fehlschuss)
 *   - Die Grenze selbst (genau 240)   → zählt (die Bedingung ist `<=`)
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { MatchStats } from '../src/shared/stats.js';
import { MatchController } from '../src/engine/match.js';

const TEAMS = new Map([[1, 0], [2, 1]]);

/** Ein Schuss-Ereignis, wie der Motor es emittiert. */
function schuss(playerId, weaponId = 'pa_001') {
  return { type: 'shot', payload: { playerId, weaponId } };
}

/** Ein Schaden-Ereignis an einem Gegner. */
function schaden(attackerId, entityId, amount = 25) {
  return { type: 'damage', payload: { attackerId, entityId, amount } };
}

test('Schaden innerhalb des Fensters zählt als Treffer, Schaden außerhalb nicht', () => {
  // Der Schuss fällt in Takt 100.
  const innerhalb = new MatchStats({ teams: TEAMS });
  innerhalb.feedAll([schuss(1)], 100);
  // 239 Takte später: noch im Fenster.
  innerhalb.feedAll([schaden(1, 2)], 339);
  const nah = innerhalb.fuer(1);
  assert.equal(nah.schuesse, 1);
  assert.equal(nah.treffer, 1, 'Schaden 239 Takte nach dem Schuss ist ein Treffer');
  assert.equal(nah.trefferquote, 1);

  // Derselbe Fall, nur 241 Takte später: KEIN Treffer.
  const ausserhalb = new MatchStats({ teams: TEAMS });
  ausserhalb.feedAll([schuss(1)], 100);
  ausserhalb.feedAll([schaden(1, 2)], 341);
  const fern = ausserhalb.fuer(1);
  assert.equal(fern.schuesse, 1);
  assert.equal(
    fern.treffer, 0,
    'Schaden 241 Takte nach dem Schuss ist KEIN Treffer — genau das war vorher falsch (treffer: 1)',
  );
  assert.equal(fern.trefferquote, 0);
  // Der Schaden selbst zählt weiter: Die Kennzahl „Schaden" ist keine Trefferquote.
  assert.equal(fern.schaden, 25);
});

test('Die Grenze selbst zählt noch (<= 240)', () => {
  const stats = new MatchStats({ teams: TEAMS });
  stats.feedAll([schuss(1)], 100);
  stats.feedAll([schaden(1, 2)], 100 + 240);
  assert.equal(stats.fuer(1).treffer, 1, 'genau 240 Takte liegen noch im Fenster');
});

test('Ein Schuss ohne Schaden bleibt ein Fehlschuss — auch nach langer Partie', () => {
  // Der Fall aus der Messung: Schuss, 2000 Takte später Schaden.
  const stats = new MatchStats({ teams: TEAMS });
  stats.feedAll([schuss(1)], 10);
  stats.feedAll([schaden(1, 2, 30)], 2010);
  const eintrag = stats.fuer(1);
  assert.equal(eintrag.schuesse, 1);
  assert.equal(eintrag.treffer, 0);
  assert.equal(eintrag.schaden, 30, 'Der Schaden wird trotzdem verbucht');
});

test('Jeder Treffer zählt nur einmal, auch bei mehreren Schadensmeldungen', () => {
  // Eine Flächenwaffe trifft mehrere Gegner — gezählt wird EIN Treffer.
  const stats = new MatchStats({ teams: TEAMS });
  stats.feedAll([schuss(1)], 50);
  stats.feedAll([schaden(1, 2), schaden(1, 3)], 60);
  assert.equal(stats.fuer(1).treffer, 1, 'Ein Schuss, der zwei Gegner trifft, ist EIN Treffer');
});

test('Der Takt kommt auf dem Weg des Clients mit (echtes Match)', () => {
  /*
   * Dieser Fall fährt den Pfad aus `main.js#step` nach: Ereignisse abholen und
   * MIT dem Takt des Matches auswerten. Ohne die Taktübergabe (alter Aufruf)
   * bliebe `stats.tick` bei 0 stehen — die Schranke darunter schlägt dann an.
   */
  const match = new MatchController({ seed: 4242, teams: 2, playersPerTeam: 1, turnDurationMs: 600 });
  match.start();
  const teams = new Map(match.getState().entities.map(e => [e.entityId, e.teamId]));
  const stats = new MatchStats({ teams });

  let schutz = 0;
  while (match.status === 'playing' && schutz < 3000) {
    const zustand = match.getState();
    if (zustand.activePlayerId !== null && zustand.turnElapsedMs < 20) {
      match.fire(zustand.activePlayerId, Math.PI / 4, 60);
    }
    match.step();
    // Genau wie der Client: Ereignisse UND Takt.
    stats.feedAll(match.consumeEvents(), match.world.tickCount);
    schutz += 1;
  }

  assert.ok(match.world.tickCount > 100, 'Die Partie muss messbar gelaufen sein');
  assert.equal(
    stats.tick, match.world.tickCount,
    'Der Takt der Kennzahlen muss dem des Matches folgen',
  );
  assert.ok(
    stats.tick > 0,
    'Ohne Taktfortschreibung stünde hier 0 — und das Trefferfenster wäre immer offen',
  );

  /*
   * Und die Gegenprobe für das Fenster: Ein Schaden, der 2000 Takte nach dem
   * letzten Schuss gemeldet wird, zählt nicht mehr.
   */
  const letzterSchuetze = stats.alle()[0]?.playerId ?? 1;
  stats.feedAll([schuss(letzterSchuetze)], stats.tick);
  const vorher = stats.fuer(letzterSchuetze).treffer;
  const ziel = [...teams.keys()].find(id => id !== letzterSchuetze);
  stats.feedAll([schaden(letzterSchuetze, ziel)], stats.tick + 2000);
  assert.equal(
    stats.fuer(letzterSchuetze).treffer, vorher,
    'Ein Schaden 2000 Takte nach dem Schuss darf keinen Treffer mehr begründen',
  );
});
