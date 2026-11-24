/**
 * TODO 2.2: Treibsand (`config/biomregeln.js`, Fassung 8).
 *
 * `quicksand` war in `config/scenery.js` als „kein Schaden, kommt kaum voran" beschrieben, der Motor ließ die Figur
 * aber ertrinken wie im Wasser. Geprüft am echten `CharacterSystem` in einer Grube voll Treibsand: bis Fassung 7
 * ertrinkt die Figur, ab Fassung 8 nimmt sie keinen Schaden, kommt seitlich kaum voran, sinkt langsamer und kann
 * herausspringen. Die genauen Faktoren sind erste Ansätze.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { CharacterSystem } from '../src/engine/systems/characterSystem.js';
import {
  BIOMREGELN_STANDARD, BIOMREGELN_STURZFLUT, BIOMREGELN_TREIBSAND, TREIBSAND, normalisiereBiomregeln, treibsandFuer, wasserWirkungFuer,
} from '../src/shared/config/biomregeln.js';
import { WATER_KINDS } from '../src/shared/config/scenery.js';
import { wasserregelText } from '../src/client/biomregelAnzeige.js';

test('Fassungen: 8 bleibt gültig (Standard 10); 7 behält das alte Verhalten', () => {
  assert.equal(BIOMREGELN_STANDARD, BIOMREGELN_TREIBSAND + 2, 'Standard ist 10 (Splitter)');
  assert.equal(normalisiereBiomregeln(8), 8);
  assert.equal(treibsandFuer('quicksand', BIOMREGELN_STURZFLUT), null);
  assert.equal(wasserWirkungFuer('quicksand', BIOMREGELN_STURZFLUT), null, 'Fassung 7: Ertrinken wie Wasser');
  assert.deepEqual(treibsandFuer('quicksand', 8), { bremse: TREIBSAND.bremse, sinken: TREIBSAND.sinken });
  assert.equal(treibsandFuer('deep_sea', 8), null);
  assert.equal(TREIBSAND.bremse, WATER_KINDS.find(w => w.id === 'quicksand').hazard.factor, 'Faktor aus der Szenenbeschreibung');
  assert.equal(wasserWirkungFuer('lava', 8).schaden, 16, 'Gefahrenwasser unverändert');
});

test('Hinweis: Treibsand ohne „0 Leben je Sekunde"', () => {
  assert.match(wasserregelText('quicksand', 8), /^Treibsand: /);
  assert.doesNotMatch(wasserregelText('quicksand', 8), /Leben je Sekunde/);
  assert.match(wasserregelText('lava', 8), /16 Leben je Sekunde/);
});

/** Figur in einer Grube voller Treibsand (Pegel 1 überall unter y = 100), 4 s; `gehen` = Tempo je Takt nach rechts. */
function grube(fassung, { gehen = 0, sprung = 0, y0 = 120 } = {}) {
  const komp = { Position: { x: 200, y: y0 }, Velocity: { x: 0, y: 0 } };
  let schaden = 0;
  const sand = treibsandFuer('quicksand', fassung);
  const world = {
    services: {
      terrain: { width: 400, height: 400, isSolid: (_x, y) => y >= 300 },
      water: { levelAtWorld: (_x, y) => (y > 100 ? 1 : 0), getLevel: () => 1, flussAn: () => 0 },
      events: { emit() {} },
      match: { wasserSchaden: wasserWirkungFuer('quicksand', fassung)?.schaden ?? null, treibsand: sand },
    },
    isActive: () => true,
    getSystem: () => ({ applyDamage(_w, _id, menge) { schaden += menge; } }),
    getComponent: (_id, k, f) => komp[k]?.[f] ?? 0,
    setComponent: (_id, k, f, w) => { if (komp[k]) komp[k][f] = w; },
  };
  const system = new CharacterSystem();
  let minY = y0;
  for (let t = 0; t < 240; t++) {
    if (gehen) komp.Velocity.x = gehen;
    if (sprung && t === 0) komp.Velocity.y = -sprung;
    system.update(world, [1], 1000 / 60);
    minY = Math.min(minY, komp.Position.y);
  }
  return { schaden, dx: komp.Position.x - 200, dy: komp.Position.y - y0, minY };
}

test('Grube: bis Fassung 7 ertrinkt die Figur, ab 8 nicht', () => {
  assert.ok(grube(BIOMREGELN_STURZFLUT).schaden > 20, 'Fassung 7: Ertrinken');
  assert.equal(grube(BIOMREGELN_TREIBSAND).schaden, 0);
});

test('Grube: gehen bringt kaum voran, Sinken ist langsamer, ein Sprung hebt heraus', () => {
  const alt = grube(BIOMREGELN_STURZFLUT, { gehen: 1.2 });
  const neu = grube(BIOMREGELN_TREIBSAND, { gehen: 1.2 });
  assert.ok(neu.dx < alt.dx * 0.5, `Weg ${neu.dx} gegen ${alt.dx}`);
  assert.ok(neu.dx > 0, 'aber nicht ganz fest');
  assert.ok(grube(BIOMREGELN_TREIBSAND).dy < grube(BIOMREGELN_STURZFLUT).dy, 'sinkt langsamer');
  const sprungNeu = grube(BIOMREGELN_TREIBSAND, { sprung: 8 });
  assert.ok(sprungNeu.minY < 120 - 5, `Sprung hebt die Figur (${sprungNeu.minY})`);
});
