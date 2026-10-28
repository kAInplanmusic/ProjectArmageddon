import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MatchController } from '../src/engine/match.js';
import { KARTENARTEN, normalisiereKartenart, GELAENDE_KOMPOSITION, GELAENDE_STANDARD } from '../src/shared/config/gelaende.js';
import { ReplayRecorder } from '../src/engine/replay.js';

const bau = (extra = {}) => { const m = new MatchController({ seed: 20260921, teams: 2, playersPerTeam: 2, kartentyp: 'autonom', ...extra }); m.start(); return m; };

test('Kartenvorlage: nur gültige Arten ab Fassung 6, sonst null', () => {
  assert.equal(normalisiereKartenart('insel', GELAENDE_KOMPOSITION), 'insel');
  assert.equal(normalisiereKartenart('insel', GELAENDE_KOMPOSITION - 1), null);
  assert.equal(normalisiereKartenart('planet', GELAENDE_KOMPOSITION), null);
  assert.equal(normalisiereKartenart(undefined, GELAENDE_KOMPOSITION), null);
});

test('Gewählte Vorlage bestimmt die Kartenart; ohne Wahl bleibt die Karte wie bisher', () => {
  const ohne = bau();
  const gleich = bau({ kartenart: null });
  assert.deepEqual(ohne.kartencharakter, gleich.kartencharakter);
  assert.equal(ohne.kartenart, null);
  for (const art of ['insel', 'schlucht', 'ebenen']) {
    const m = bau({ kartenart: art });
    assert.equal(m.kartenart, art);
    assert.equal(m.kartencharakter.kartenart, art, art);
  }
});

test('Alle Vorlagen ergeben spielbare Karten; gleiche Wahl gleiche Karte', () => {
  for (const art of KARTENARTEN) {
    const a = bau({ kartenart: art, seed: 777 });
    const b = bau({ kartenart: art, seed: 777 });
    assert.equal(a.stateHash(), b.stateHash(), art);
  }
});

test('Alte Geländefassungen ignorieren die Vorlage', () => {
  const m = bau({ kartenart: 'insel', gelaende: GELAENDE_KOMPOSITION - 1 });
  assert.equal(m.kartenart, null);
  assert.ok(GELAENDE_STANDARD >= GELAENDE_KOMPOSITION);
});

test('Replay-Kopf trägt die Vorlage nur, wenn gewählt', () => {
  const mit = new ReplayRecorder({ seed: 1, kartenart: 'vulkan' }).toJSON();
  const ohne = new ReplayRecorder({ seed: 1 }).toJSON();
  assert.equal(mit.config.kartenart, 'vulkan');
  assert.equal('kartenart' in ohne.config, false);
});
