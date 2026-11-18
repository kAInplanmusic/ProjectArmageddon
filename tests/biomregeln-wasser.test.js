/**
 * QV-6, Welle 2, Baustein E: Gefahrenwasser (`config/biomregeln.js`, Fassung 4).
 *
 * Geprüft wird: Versionsmarke (Fassung 1 bis 3 bleiben bitgleich), welche Wasserarten wirken, der Schaden je Sekunde
 * im CharacterSystem (Ersatz der 9 LP/s) und die Hinweiszeile. Die Höhe der Werte ist nicht Gegenstand (erste Ansätze).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BIOMREGELN_SCHWERKRAFT, BIOMREGELN_WASSER, BIOMREGELN_STANDARD, WASSER_SCHADEN, wasserWirkungFuer, normalisiereBiomregeln,
} from '../src/shared/config/biomregeln.js';
import { WATER_KINDS } from '../src/shared/config/scenery.js';
import { MatchController } from '../src/engine/match.js';
import { CharacterSystem } from '../src/engine/systems/characterSystem.js';
import { wasserregelText, meldeBiomregel, meldeWasserregel } from '../src/client/biomregelAnzeige.js';

test('Fassung 4 ist der Standard; 1 bis 3 bleiben gültig, Unbekanntes fällt auf den Standard', () => {
  assert.equal(BIOMREGELN_STANDARD, BIOMREGELN_WASSER);
  for (const f of [1, 2, 3, 4]) assert.equal(normalisiereBiomregeln(f), f);
  assert.equal(normalisiereBiomregeln(77), BIOMREGELN_STANDARD);
});

test('wasserWirkungFuer: nur Wasserarten mit Gefahr und nur ab Fassung 4; höher als das Ertrinken (9)', () => {
  assert.deepEqual(Object.keys(WASSER_SCHADEN).sort(), ['acid', 'lava', 'poison', 'swamp_sludge', 'void']);
  for (const id of Object.keys(WASSER_SCHADEN)) {
    assert.equal(wasserWirkungFuer(id, BIOMREGELN_SCHWERKRAFT), null, `${id}: Fassung 3 ohne Regel`);
    assert.ok(wasserWirkungFuer(id, BIOMREGELN_WASSER).schaden > 9, `${id} verletzt stärker als Wasser`);
    const art = WATER_KINDS.find((w) => w.id === id);
    assert.ok(art, `${id} ist eine bekannte Wasserart`);
  }
  for (const id of ['deep_sea', 'shallow_lake', 'frozen_lake', 'tar_pit', 'meltwater', 'quicksand', null, undefined]) {
    assert.equal(wasserWirkungFuer(id, BIOMREGELN_WASSER), null, String(id));
  }
});

/** Ein CharacterSystem-Lauf: eine Figur tief im Wasser, zurückgegeben wird der Schaden eines Ticks. */
function schadenEinesTicks(wasserSchaden) {
  const aufrufe = [];
  const system = new CharacterSystem();
  const world = {
    services: {
      terrain: { width: 400, height: 400, isSolid: () => false },
      water: { levelAtWorld: () => 1, getLevel: () => 1 },
      events: { emit() {} },
      match: wasserSchaden === undefined ? {} : { wasserSchaden },
    },
    isActive: () => true,
    getSystem: () => ({ applyDamage: (_w, _id, schaden) => aufrufe.push(schaden) }),
    getComponent: (_id, komp, feld) => ({ Position: { x: 200, y: 200 }, Velocity: { x: 0, y: 0 } }[komp]?.[feld] ?? 0),
    setComponent() {},
  };
  system.update(world, [1], 1000 / 60);
  return aufrufe[0];
}

test('CharacterSystem: ohne Regel 9 LP/s wie bisher, mit Regel der Wert der Wasserart', () => {
  assert.ok(Math.abs(schadenEinesTicks(undefined) - 9 / 60) < 1e-9);
  assert.ok(Math.abs(schadenEinesTicks(null) - 9 / 60) < 1e-9);
  assert.ok(Math.abs(schadenEinesTicks(16) - 16 / 60) < 1e-9);
});

test('Match: services.match.wasserSchaden folgt Wasserart und Fassung', () => {
  const lauf = (biom, biomregeln) => {
    const m = new MatchController({ seed: 31, teams: 2, playersPerTeam: 1, preset: 'hills', kartentyp: 'autonom', biom, biomregeln });
    m.start();
    return { m, schaden: m.world.services.match.wasserSchaden, wasser: m.scenery.waterId };
  };
  const neu = lauf('vulkan', BIOMREGELN_WASSER);
  assert.equal(neu.schaden, wasserWirkungFuer(neu.wasser, BIOMREGELN_WASSER)?.schaden ?? null);
  assert.equal(lauf('vulkan', BIOMREGELN_SCHWERKRAFT).schaden, null, 'Fassung 3: Ertrinken wie bisher');
  assert.equal(lauf('vulkan', 1).schaden, null);
});

test('Hinweiszeile: nennt Wasserart, Wirkung und Zahl; keine bei normalem Wasser oder Fassung 3', () => {
  assert.match(wasserregelText('lava', 4), /^Lava: .*16 Leben je Sekunde/);
  assert.equal(wasserregelText('deep_sea', 4), null);
  assert.equal(wasserregelText('lava', 3), null);
  const zeilen = [];
  const hud = { log: (t) => zeilen.push(t) };
  meldeBiomregel(hud, { biom: 'vulkan', biomregeln: 4, seed: 1 });
  meldeWasserregel(hud, 'poison');
  assert.ok(zeilen.some((z) => /Giftbrühe/.test(z)));
});
