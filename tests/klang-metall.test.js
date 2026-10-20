/**
 * Metall-Einschlagprofil: Nur wenn die Stoffkarte am Einschlag `metall` meldet, klingt es nach Metall.
 * Die Engine trägt den Stoff im Ereignis `explosion` (Zerstörungsfassung 6), der Client leitet ihn sonst
 * aus der eigenen Stoffkarte ab (`stoffSchluesselAmEinschlag`) — in beiden Betriebsarten dieselbe Funktion.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { einschlagProfil, EREIGNIS_PROFILE } from '../src/client/klangProfile.js';
import { MatchController } from '../src/engine/match.js';
import { stoffAm } from '../src/shared/stoffkarte.js';
import { stoffSchluesselAmEinschlag } from '../src/shared/einschlag.js';
import { STOFF } from '../src/shared/config/stoffe.js';
import { SONDERBIOM_IDS } from '../src/shared/config/biome-neu.js';
import { GELAENDE_BIOME } from '../src/shared/config/gelaende.js';
import { ZERSTOERUNG_STOFF, ZERSTOERUNG_HANG } from '../src/shared/config/zerstoerung.js';

test('einschlagProfil: Metall nur bei stoff=metall, Wasser hat Vorrang, alles andere bleibt', () => {
  assert.equal(einschlagProfil({ radius: 0, material: 'erde', stoff: 'metall' }), 'einschlag_metall');
  assert.equal(einschlagProfil({ radius: 0, material: 'fels', stoff: 'metall' }), 'einschlag_metall');
  assert.equal(einschlagProfil({ radius: 40, material: 'erde', stoff: 'metall' }), 'explosion_metall');
  assert.equal(einschlagProfil({ radius: 0, material: 'wasser', stoff: 'metall' }), 'platscher_klein');
  assert.equal(einschlagProfil({ radius: 0, material: 'erde', stoff: 'fels' }), 'einschlag_erde');
  assert.equal(einschlagProfil({ radius: 0, material: 'erde', stoff: null }), 'einschlag_erde');
  assert.equal(einschlagProfil({ radius: 0, material: 'fels' }), 'einschlag_fels');
  assert.equal(einschlagProfil({ radius: 40, material: 'erde', stoff: 'sand' }), 'explosion_mittel');
  assert.ok(EREIGNIS_PROFILE.einschlag_metall && EREIGNIS_PROFILE.explosion_metall);
});

function metallMatch(zerstoerung) {
  for (const biom of SONDERBIOM_IDS) {
    const m = new MatchController({ seed: 31, teams: 2, playersPerTeam: 1, kartentyp: 'autonom', biom, maxRounds: 2, gelaende: GELAENDE_BIOME, zerstoerung });
    m.start();
    const t = m.terrain ?? null;
    for (let y = 4; y < m.stoffkarte.hoehe; y += 8) {
      for (let x = 4; x < m.stoffkarte.breite; x += 8) {
        if (stoffAm(m.stoffkarte, x, y) === STOFF.METALL) return { m, x, y, t };
      }
    }
  }
  return null;
}

function zuende(m, x, y) {
  const w = m.world;
  m.consumeEvents();
  const g = w.createEntity();
  w.addComponent(g, 'Position', { x, y });
  w.addComponent(g, 'Velocity', { x: 0, y: 0 });
  w.addComponent(g, 'Projectile', {
    owner: m.activePlayerId, weaponId: 0, damageType: 0, damage: 1, blastRadius: 10, knockback: 0,
    drag: 1, gravityScale: 0, windFactor: 0, terrainDamage: 0, bounces: 0, fuseTicks: 1, lifetime: 50, alive: 1,
    pierce: 0, homing: 0, letztesZiel: -1, pierceSchutz: 0,
  });
  m.step();
  return m.consumeEvents().find(e => e.type === 'explosion');
}

test('Engine: Ereignis explosion trägt den Stoff ab Fassung 6, davor nicht', () => {
  const neu = metallMatch(ZERSTOERUNG_HANG);
  assert.ok(neu, 'kein Sonderbiom mit Metall gefunden');
  const e = zuende(neu.m, neu.x, neu.y);
  assert.equal(e.payload.stoff, 'metall');
  assert.equal(stoffSchluesselAmEinschlag(neu.m.stoffkarte, e.payload.x, e.payload.y), e.payload.stoff, 'Client-Ableitung gleich');
  const alt = metallMatch(ZERSTOERUNG_STOFF);
  const e5 = zuende(alt.m, alt.x, alt.y);
  assert.equal(e5.payload.stoff, undefined);
});
