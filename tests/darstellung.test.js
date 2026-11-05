import test from 'node:test';
import assert from 'node:assert/strict';

import { FACTIONS, CHARACTERS, COMBAT_ROLES } from '../src/shared/config/factions.js';
import { CLASS_IDS, ARCHETYPE_IDS, LEGACY_CLASS_IDS } from '../src/shared/config/classes.js';
import { charakterFuer, bereinigeFraktionen, istFraktion } from '../src/shared/config/darstellung.js';
import { KLASSEN_ALT, KLASSEN_STANDARD } from '../src/shared/config/klassen-fassung.js';
import { LobbyManager } from '../src/server/lobby.js';

const ROLLE_JE_KLASSE = { nahkampf: 'melee', fernkampf: 'ranged', okkultist: 'magic' };

test('Jede Fraktion deckt 3 Klassen × 3 Plätze = 9 Charaktere ab, jeden genau einmal', () => {
  const fraktionen = new Set(CHARACTERS.map(c => c.faction));
  assert.equal(fraktionen.size, 9);
  for (const f of fraktionen) {
    const gesehen = new Set();
    for (const k of CLASS_IDS) {
      for (const platz of [0, 1, 2]) {
        const c = charakterFuer(f, k, platz, KLASSEN_STANDARD);
        assert.ok(c, `${f}/${k}/${platz}: kein Charakter`);
        assert.equal(c.faction, f);
        assert.equal(c.role, ROLLE_JE_KLASSE[k], `${f}/${k}/${platz}: falsche Zeile`);
        assert.equal(c.slot, platz, `${f}/${k}/${platz}: falscher Platz`);
        gesehen.add(c.id + c.sprite);
      }
    }
    assert.equal(gesehen.size, 9, `${f}: Zuordnung nicht eindeutig`);
  }
  assert.equal(CHARACTERS.length, 9 * 3 * 3, '81 Charaktere');
});

test('Je Fraktion und Klasse stehen genau drei Einheiten', () => {
  for (const f of FACTIONS) {
    for (const k of CLASS_IDS) {
      const einheiten = new Set([0, 1, 2].map(p => charakterFuer(f.id, k, p, KLASSEN_STANDARD)?.id));
      assert.equal(einheiten.size, 3, `${f.id}/${k}: nicht drei verschiedene Einheiten`);
    }
  }
});

test('charakterFuer ist deterministisch je Platz — kein Zufall, kein Math.random', () => {
  for (const f of FACTIONS) {
    for (const k of CLASS_IDS) {
      for (const p of [0, 1, 2]) {
        const a = charakterFuer(f.id, k, p, KLASSEN_STANDARD);
        const b = charakterFuer(f.id, k, p, KLASSEN_STANDARD);
        assert.equal(a?.id, b?.id, `${f.id}/${k}/${p}: nicht reproduzierbar`);
        // Der Platz ist zyklisch: 3 fällt auf 0 zurück (0..2 ist der Vertrag).
        assert.equal(charakterFuer(f.id, k, p + 3, KLASSEN_STANDARD)?.id, a?.id);
      }
    }
  }
});

test('Indizes und Kennungen ergeben denselben Charakter; ohne Fraktion keiner', () => {
  assert.equal(charakterFuer('pirates', 0, 1, KLASSEN_STANDARD),
    charakterFuer('pirates', CLASS_IDS[0], 1, KLASSEN_STANDARD));
  assert.equal(charakterFuer(null, 'nahkampf', 0), null);
  assert.equal(charakterFuer('gibtsnicht', 'nahkampf', 0), null);
  assert.equal(charakterFuer('xeno', 'nahkampf', 0).id, 'sgt-acid-xeno');
  assert.equal(charakterFuer('xeno', 'fernkampf', 0).role, 'ranged');
  assert.equal(charakterFuer('xeno', 'okkultist', 2).role, 'magic');
});

test('Fassungen ≤ 2 behalten die alte Auflösung (Archetyp → Zeile, Klasse → Platz)', () => {
  /*
   * Altreplays zeigen dieselben Figuren wie vor dem Umbau. Die Zuordnung ist
   * dort eine andere: Der Archetyp bestimmt die Zeile, die alte Klasse den Platz.
   */
  const archetypRolle = Object.fromEntries(Object.values(COMBAT_ROLES).map(r => [r.archetype, r.id]));
  for (const f of FACTIONS) {
    for (const k of LEGACY_CLASS_IDS) {
      for (const a of ARCHETYPE_IDS) {
        const c = charakterFuer(f.id, k, a, KLASSEN_ALT);
        assert.ok(c, `${f.id}/${k}/${a}: kein Charakter`);
        assert.equal(c.role, archetypRolle[a], `${f.id}/${k}/${a}: falsche Zeile`);
      }
    }
  }
  // Bitgleich zur alten Regel: heavy → Platz 0, scout → Platz 1, artillery → Platz 2.
  assert.equal(charakterFuer('xeno', 'heavy', 'brawler', KLASSEN_ALT).slot, 0);
  assert.equal(charakterFuer('xeno', 'scout', 'artillerist', KLASSEN_ALT).slot, 1);
  assert.equal(charakterFuer('xeno', 'artillery', 'occultist', KLASSEN_ALT).slot, 2);
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
