import assert from 'node:assert/strict';
import test from 'node:test';
import { WaterField } from '../src/engine/waterField.js';
import { MatchController, MAP_WIDTH, MAP_HEIGHT, WATER_SCALE } from '../src/engine/match.js';
import { CharacterSystem } from '../src/engine/systems/characterSystem.js';
import { EventBus } from '../src/engine/events.js';
import { createGameWorld } from '../src/engine/init.js';

/** Baut ein Becken: Wände links/rechts + Boden, gefüllt bis zu einer Höhe. */
function makeBasin({ width = 20, height = 12, floorRow = 10, waterTop = 3 } = {}) {
  const solid = (x, y) => y >= floorRow || x === 0 || x === width - 1;
  const field = new WaterField({ width, height, isSolid: solid, worldScale: 1 });
  for (let y = waterTop; y < floorRow; y++) {
    for (let x = 1; x < width - 1; x++) field.setLevel(x, y, 1);
  }
  return { field, solid, width, height, floorRow };
}

test('Wasser fließt in einen neuen Krater nach', () => {
  const { field, width } = makeBasin({ waterTop: 5 });
  const before = field.totalVolume();

  // Ein Krater im Boden: die Zellen werden nicht mehr als solide gemeldet.
  const craterX = 10;
  const craterDepth = 2;
  let solid = true;

  // Der Krater entsteht erst nach einigen Schritten.
  const dynamicIsSolid = (x, y) => {
    if (!solid && y >= 10 && y < 10 + craterDepth && Math.abs(x - craterX) <= 2) return false;
    return y >= 10 || x === 0 || x === width - 1;
  };

  // Feld mit dynamischem Boden neu aufbauen (gleiche Füllung).
  const dynamicField = new WaterField({ width: 20, height: 12, isSolid: dynamicIsSolid, worldScale: 1 });
  for (let y = 5; y < 10; y++) {
    for (let x = 1; x < 19; x++) dynamicField.setLevel(x, y, 1);
  }

  // Vor dem Krater: Wasser steht auf dem Boden.
  for (let i = 0; i < 5; i++) dynamicField.step();
  const levelInCraterBefore = dynamicField.getLevel(craterX, 10);
  assert.equal(levelInCraterBefore, 0, 'Vor dem Krater darf dort kein Wasser sein');

  // Krater öffnen und nachfließen lassen.
  solid = false;
  for (let i = 0; i < 30; i++) dynamicField.step();

  const levelInCraterAfter = dynamicField.getLevel(craterX, 10);
  assert.ok(levelInCraterAfter > 0.05, `Wasser muss in den Krater fließen, ist aber ${levelInCraterAfter}`);
  assert.ok(dynamicField.getLevel(craterX, 11) > 0.05, 'Wasser muss auch in die unterste Kraterzeile');

  // Massenerhaltung bleibt gewahrt.
  const after = dynamicField.totalVolume();
  assert.ok(Math.abs(after - before) < before * 0.1, `Volumen driftet: ${before} → ${after}`);
});

test('Explosion verdrängt Wasser und erhält die Menge', () => {
  const { field } = makeBasin({ waterTop: 6 });
  const before = field.totalVolume();
  const centerLevelBefore = field.getLevel(10, 7);
  assert.ok(centerLevelBefore > 0, 'Testaufbau: Zentrum muss Wasser haben');

  const displaced = field.displace(10, 7, 3, 0.8);

  assert.ok(displaced > 0, 'Es muss Wasser verdrängt werden');
  assert.ok(field.getLevel(10, 7) < centerLevelBefore, 'Zentrum muss Wasser verlieren');

  const after = field.totalVolume();
  // Verdrängung verschiebt Wasser, sie vernichtet es nicht (bis auf Sättigung).
  assert.ok(after <= before + 1e-6, 'Es darf kein Wasser entstehen');
  assert.ok(after > before * 0.85, `Zu viel Wasser verloren: ${before} → ${after}`);
});

test('Verdrängung ohne Ausweichplatz verliert kein Wasser', () => {
  // Einzelne gefüllte Zelle, vollständig von soliden Zellen umschlossen.
  const solid = (x, y) => !(x === 5 && y === 5);
  const field = new WaterField({ width: 11, height: 11, isSolid: solid, worldScale: 1 });
  field.setLevel(5, 5, 1);
  const before = field.totalVolume();

  const displaced = field.displace(5, 5, 1, 1);

  assert.equal(displaced, 0, 'Ohne Platz darf nichts verdrängt werden');
  assert.ok(Math.abs(field.totalVolume() - before) < 1e-6, 'Wasser muss unverändert bleiben');
});

test('Wasserfeld rechnet Weltkoordinaten korrekt in Zellen um', () => {
  const field = new WaterField({ width: 10, height: 10, isSolid: () => false, worldScale: 4 });
  assert.equal(field.worldScale, 4);
  field.setLevel(2, 2, 0.9);
  // Zelle (2,2) entspricht Weltpixel (8..11, 8..11). Float32 speichert 0.9
  // nicht exakt, deshalb mit Toleranz vergleichen.
  assert.ok(Math.abs(field.levelAtWorld(9, 9) - 0.9) < 1e-6);
  assert.ok(Math.abs(field.levelAtWorld(11, 11) - 0.9) < 1e-6);
  assert.equal(field.levelAtWorld(4, 4), 0);
  assert.equal(field.levelAtWorld(12, 9), 0, 'Zellgrenze darf nicht überlaufen');
  assert.deepEqual(field.toGrid(9, 9), { x: 2, y: 2 });
});

test('Ertrinken verursacht Schaden unter der Wasseroberfläche', () => {
  const world = createGameWorld({ turnDuration: 1000 });
  const bus = new EventBus();
  world.services = { events: bus };

  const entity = world.createEntity();
  world.addComponent(entity, 'Position', { x: 50, y: 60 });
  world.addComponent(entity, 'Velocity', { x: 0, y: 0 });
  world.addComponent(entity, 'Health', { current: 100, max: 100 });

  // Wasser über der Figur: erhöhter Pegel an ihrer Position.
  // Feld muss die Weltkoordinaten der Figur abdecken.
  const water = new WaterField({ width: 100, height: 100, isSolid: () => false, worldScale: 1 });
  water.setLevel(50, 60, 1);
  world.services.water = water;

  const system = new CharacterSystem({ drownDamagePerSecond: 60 });
  const entities = [entity];

  const before = world.getComponent(entity, 'Health', 'current');
  // 60 Simulationsschritte bei 60 Hz ≈ eine Sekunde.
  for (let i = 0; i < 60; i++) {
    world.setComponent(entity, 'Position', 'x', 50);
    world.setComponent(entity, 'Position', 'y', 60);
    system.update(world, entities, 1000 / 60);
  }
  const after = world.getComponent(entity, 'Health', 'current');

  assert.ok(after < before, `Ertrinken muss Schaden verursachen: ${before} → ${after}`);
  // Rund eine Sekunde bei 60 HP/s: deutlich geschädigt, aber nicht sofort tot.
  assert.ok(before - after > 30, `Erwartete klaren Schaden, bekam ${before - after}`);
  assert.ok(after > 0, 'Figur darf in einer Sekunde nicht sterben');
});

test('Trockene Figur erleidet keinen Ertrinkungsschaden', () => {
  const world = createGameWorld({ turnDuration: 1000 });
  world.services = { events: new EventBus() };

  const entity = world.createEntity();
  world.addComponent(entity, 'Position', { x: 50, y: 60 });
  world.addComponent(entity, 'Velocity', { x: 0, y: 0 });
  world.addComponent(entity, 'Health', { current: 100, max: 100 });
  world.services.water = new WaterField({ width: 100, height: 100, isSolid: () => false, worldScale: 1 });

  const system = new CharacterSystem();
  for (let i = 0; i < 60; i++) {
    world.setComponent(entity, 'Position', 'x', 50);
    world.setComponent(entity, 'Position', 'y', 60);
    system.update(world, [entity], 1000 / 60);
  }
  assert.equal(world.getComponent(entity, 'Health', 'current'), 100);
});

test('Match verdrahtet Wasser, Terrain und Krater miteinander', () => {
  const match = new MatchController({ seed: 8080, teams: 2, playersPerTeam: 1 });
  match.start();

  // Wasserfeld nutzt dieselbe Skalierung wie das Match.
  assert.equal(match.water.worldScale, WATER_SCALE);
  assert.equal(match.water.width, Math.floor(MAP_WIDTH / WATER_SCALE));
  assert.equal(match.water.height, Math.floor(MAP_HEIGHT / WATER_SCALE));

  // Ein Einschlag im Wasserbereich muss die Wassermenge verschieben.
  const active = match.activePlayerId;
  const shooter = match.getState().entities.find(entity => entity.entityId === active);
  const volumeBefore = match.water.totalVolume();

  // Direkt unter den Schützen in den Boden feuern.
  const result = match.fire(active, Math.PI / 2, 90);
  assert.equal(result.ok, true);
  for (let i = 0; i < 200; i++) match.step();

  const volumeAfter = match.water.totalVolume();
  assert.ok(
    Math.abs(volumeAfter - volumeBefore) < volumeBefore * 0.05,
    `Wassermenge driftet im Match: ${volumeBefore} → ${volumeAfter}`,
  );
  assert.ok(shooter, 'Schütze muss im Zustand vorhanden sein');
});
