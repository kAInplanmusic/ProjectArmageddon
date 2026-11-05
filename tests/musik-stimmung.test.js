/**
 * Tests: Die Stimmung `intensiv` bekommt Auslöser (AUDIO-1).
 *
 * ## Der Befund
 *
 * Das Manifest kennt `menu | match | intensiv`, aber `intensiv` wurde nie
 * gesetzt — die Musik folgte allein dem `hidden` des Menüs. Valhalla und das
 * Ende einer Partie klangen wie der Anfang.
 *
 * ## Die Regel (docs/plan-produktion.md §1)
 *
 * `intensiv` bei Valhalla/Mahlstrom, bei den letzten zwei lebenden Figuren oder
 * wenn ein Team ≤ 25 % Leben hat; zurück auf `match`, sobald die Lage sich
 * entspannt.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  waehleStimmung, TEAM_LEBEN_SCHWELLE, LETZTE_FIGUREN,
} from '../src/client/musikStimmung.js';

/** Ein Anzeigezustand mit Figuren; `leben` je Figur in Prozent. */
function zustand(teams, { status = 'playing', maelstrom = false } = {}) {
  const entities = [];
  teams.forEach((figuren, teamId) => {
    for (const anteil of figuren) {
      entities.push({
        teamId,
        alive: anteil > 0,
        health: anteil > 0 ? anteil : 0,
        maxHealth: anteil > 0 ? 100 : 0,
      });
    }
  });
  return { status, maelstrom: { active: maelstrom, inset: maelstrom ? 0.1 : 0 }, entities };
}

test('Die Schwellen sind die der Entscheidung', () => {
  assert.equal(TEAM_LEBEN_SCHWELLE, 0.25);
  assert.equal(LETZTE_FIGUREN, 2);
});

test('Ruhige Lage: gesunde Teams, mehr als zwei Figuren → match', () => {
  const state = zustand([[100, 100], [100, 100]]);
  assert.equal(waehleStimmung(state), 'match');
});

test('Valhalla/Mahlstrom → intensiv', () => {
  const state = zustand([[100, 100], [100, 100]], { maelstrom: true });
  assert.equal(waehleStimmung(state), 'intensiv');
});

test('Die letzten zwei lebenden Figuren → intensiv', () => {
  const state = zustand([[100], [100]]);
  assert.equal(waehleStimmung(state), 'intensiv');

  // Gegenprobe: drei Lebende sind noch nicht „die letzten zwei".
  const drei = zustand([[100, 100], [100]]);
  assert.equal(waehleStimmung(drei), 'match');
});

test('Ein Team mit ≤ 25 % Leben → intensiv; knapp darüber nicht', () => {
  const kippe = zustand([[25, 25], [100, 100]]);
  assert.equal(waehleStimmung(kippe), 'intensiv');

  const knapp = zustand([[26, 26], [100, 100]]);
  assert.equal(waehleStimmung(knapp), 'match');
});

test('Es entspannt sich: ohne Auslöser geht es zurück auf match', () => {
  const angespannt = zustand([[100, 100], [100, 100]], { maelstrom: true });
  assert.equal(waehleStimmung(angespannt), 'intensiv');
  const entspannt = zustand([[100, 100], [100, 100]]);
  assert.equal(waehleStimmung(entspannt), 'match');
});

test('Nach dem Spielende bleibt es ruhig — auch bei zwei Überlebenden', () => {
  const state = zustand([[100], [0]], { status: 'gameover' });
  assert.equal(waehleStimmung(state), 'match');
});

test('Das Menü gewinnt immer', () => {
  const state = zustand([[100], [100]], { maelstrom: true });
  assert.equal(waehleStimmung(state, { basis: 'menu' }), 'menu');
  assert.equal(waehleStimmung(null, { basis: 'menu' }), 'menu');
});

test('Ohne Zustand keine Fehlannahme: match statt Absturz', () => {
  assert.equal(waehleStimmung(null), 'match');
  assert.equal(waehleStimmung({}), 'match');
  assert.equal(waehleStimmung({ status: 'playing', entities: [] }), 'match');
});

test('Tote Figuren zählen nicht als Restleben — ein Team mit Toten rutscht nicht hoch', () => {
  /*
   * Tote tragen im Zustand `health: 0` UND `maxHealth: 0`. Würde man sie in den
   * Nenner nehmen, stünde das Team nach dem Tod seiner Figuren wieder bei 100 %.
   * Hier: ein Team mit zwei Toten und einer lebenden Figur bei 30 % — es hat
   * 30 % seines (lebenden) Lebens und ist damit über der Schwelle; die zwei
   * Lebenden der anderen Seite machen die Lage aber schon „intensiv".
   */
  const entities = [
    { teamId: 0, alive: false, health: 0, maxHealth: 0 },
    { teamId: 0, alive: false, health: 0, maxHealth: 0 },
    { teamId: 0, alive: true, health: 30, maxHealth: 100 },
    { teamId: 1, alive: true, health: 100, maxHealth: 100 },
    { teamId: 1, alive: true, health: 100, maxHealth: 100 },
  ];
  // Drei Lebende, Team 0 bei 30 % → keine Schwelle verletzt außer „drei Leben".
  assert.equal(waehleStimmung({ status: 'playing', entities }), 'match');

  // Fällt einer der beiden Gegner, sind es die letzten zwei → intensiv.
  entities[4] = { teamId: 1, alive: false, health: 0, maxHealth: 0 };
  assert.equal(waehleStimmung({ status: 'playing', entities }), 'intensiv');
});

test('Online und lokal lesen denselben Zustand — `maelstrom.active` genügt', () => {
  /*
   * `onlineViewState` setzt `maelstrom.active` aus dem Einschnitt des Snapshots,
   * der lokale Zustand kommt aus dem Motor. Die Regel darf nur dieses eine Feld
   * lesen — kein `match`-Objekt, keine Engine.
   */
  const ohneInset = zustand([[100, 100], [100, 100]], { maelstrom: false });
  assert.equal(waehleStimmung(ohneInset), 'match');
  assert.equal(waehleStimmung({ ...ohneInset, maelstrom: { active: true, inset: 0.2 } }), 'intensiv');
});
