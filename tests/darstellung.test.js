import test from 'node:test';
import assert from 'node:assert/strict';

import { CHARACTERS } from '../src/shared/config/factions.js';
import { CLASS_IDS, ARCHETYPE_IDS } from '../src/shared/config/classes.js';
import { charakterFuer, bereinigeFraktionen, istFraktion } from '../src/shared/config/darstellung.js';
import { LobbyManager } from '../src/server/lobby.js';

test('Jede Fraktion deckt alle neun Kombinationen aus Klasse und Archetyp ab, jede genau einmal', () => {
  const fraktionen = new Set(CHARACTERS.map(c => c.faction));
  assert.equal(fraktionen.size, 9);
  for (const f of fraktionen) {
    const gesehen = new Set();
    for (const k of CLASS_IDS) {
      for (const a of ARCHETYPE_IDS) {
        const c = charakterFuer(f, k, a);
        assert.ok(c, `${f}/${k}/${a}: kein Charakter`);
        assert.equal(c.faction, f);
        gesehen.add(c.id + c.sprite);
      }
    }
    assert.equal(gesehen.size, 9, `${f}: Zuordnung nicht eindeutig`);
  }
});

test('Indizes und Kennungen ergeben denselben Charakter; ohne Fraktion keiner', () => {
  assert.equal(charakterFuer('pirates', 0, 1), charakterFuer('pirates', CLASS_IDS[0], ARCHETYPE_IDS[1]));
  assert.equal(charakterFuer(null, 'heavy', 'brawler'), null);
  assert.equal(charakterFuer('gibtsnicht', 'heavy', 'brawler'), null);
  assert.equal(charakterFuer('xeno', 'heavy', 'brawler').id, 'sgt-acid-xeno');
});

test('bereinigeFraktionen ist tolerant', () => {
  assert.equal(bereinigeFraktionen(null, 2), null);
  assert.equal(bereinigeFraktionen([null, 'x'], 2), null);
  assert.deepEqual(bereinigeFraktionen(['xeno', 'x', 'pirates'], 2), ['xeno', null]);
  assert.ok(istFraktion('machina'));
});

test('Die Lobby führt die Fraktionen je Team und lässt den Rest unberührt', () => {
  const m = new LobbyManager();
  const mit = m.create({ teams: 2, playersPerTeam: 2, fraktionen: ['xeno', 'unbekannt'] }).lobby;
  assert.deepEqual(mit.fraktionen, ['xeno', null]);
  const ohne = m.create({ teams: 2, playersPerTeam: 2 }).lobby;
  assert.equal(ohne.fraktionen, null);
});

test('loeseFraktionen: automatisch, deterministisch, verschiedene Fraktionen je Team', async () => {
  const { loeseFraktionen, KLASSISCH } = await import('../src/shared/config/darstellung.js');
  const a = loeseFraktionen(null, 4, 20260910);
  assert.deepEqual(a, loeseFraktionen(undefined, 4, 20260910));
  assert.equal(a.length, 4);
  assert.equal(new Set(a).size, 4);
  assert.ok(a.every(istFraktion));
  assert.equal(new Set(loeseFraktionen(null, 9, 'abc123')).size, 9);
  assert.equal(loeseFraktionen(null, 8, 'abc123').length, 8);
  const verschieden = new Set();
  for (let s = 0; s < 20; s += 1) verschieden.add(loeseFraktionen(null, 2, s).join());
  assert.ok(verschieden.size > 5);
  const b = loeseFraktionen(['xeno', KLASSISCH, null], 3, 5);
  assert.equal(b[0], 'xeno');
  assert.equal(b[1], null);
  assert.ok(istFraktion(b[2]) && b[2] !== 'xeno');
});

test('bereinigeFraktionen behält klassisch', () => {
  assert.deepEqual(bereinigeFraktionen(['klassisch', 'xeno'], 2), ['klassisch', 'xeno']);
});
