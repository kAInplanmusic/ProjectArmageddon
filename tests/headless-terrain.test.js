import assert from 'node:assert/strict';
import test from 'node:test';
import { HeadlessRuntime } from '../src/engine/headless.js';
import { terrainMaskFromRows } from '../src/engine/terrain/terrainLoader.js';
import { COMPONENT_SIGNATURES } from '../src/engine/ecs/componentStore.js';
import { createGameWorld } from '../src/engine/init.js';

test('World exposes component membership for systems', () => {
  const world = createGameWorld();
  const entity = world.createEntity();
  world.addComponent(entity, 'Position', { x: 1, y: 2 });
  assert.equal(world.hasComponent(entity, 'Position'), true);
  assert.equal(world.hasComponent(entity, 'Velocity'), false);
  assert.equal(world.getEntitiesBySignature(COMPONENT_SIGNATURES.POSITION)[0], entity);
});

test('HeadlessRuntime applies queued inputs on deterministic ticks', () => {
  const first = new HeadlessRuntime({ matchSeed: 42, turnDuration: 1000 });
  const second = new HeadlessRuntime({ matchSeed: 42, turnDuration: 1000 });
  for (const runtime of [first, second]) {
    const entity = runtime.world.createEntity();
    runtime.world.addComponent(entity, 'Input', { angle: 0, power: 0 });
    runtime.addPlayer('p1', entity);
    runtime.start();
    runtime.enqueueInput({ playerId: 'p1', tick: 0, angle: 1.5, power: 80 });
    runtime.run(3);
  }
  assert.deepEqual(first.serialize(), second.serialize());
  assert.equal(first.tick, 3);
  assert.equal(first.world.getComponent(1, 'Input', 'angle'), 1.5);
  assert.equal(first.world.getComponent(1, 'Input', 'power'), 80);
});

test('HeadlessRuntime rejects invalid lifecycle and input data', () => {
  const runtime = new HeadlessRuntime({ matchSeed: 1 });
  assert.throws(() => runtime.step(), /nicht gestartet/);
  runtime.addPlayer('p1');
  assert.throws(() => runtime.addPlayer('p1'), /bereits registriert/);
  runtime.start();
  assert.throws(() => runtime.addPlayer('p2'), /Lobby/);
  assert.throws(() => runtime.enqueueInput({ playerId: 'p1', angle: NaN, power: 1 }), /endliche Zahlen/);
  assert.throws(() => runtime.enqueueInput({ playerId: 'p1', tick: -1, angle: 1, power: 1 }), /nichtnegative Ganzzahl/);
});

test('terrainMaskFromRows loads rows and handles the 32-bit boundary', () => {
  const mask = terrainMaskFromRows([
    '#..............................#',
    '................................',
  ]);
  assert.equal(mask.width, 32);
  assert.equal(mask.height, 2);
  assert.equal(mask.isSolid(0, 0), true);
  assert.equal(mask.isSolid(31, 0), true);
  assert.equal(mask.isSolid(30, 0), false);
  assert.equal(mask.isSolid(0, 1), false);
  assert.equal(mask.isSolid(-1, 0), true);
});

test('terrainMaskFromRows rejects malformed input', () => {
  assert.throws(() => terrainMaskFromRows([]), /nichtleeres Array/);
  assert.throws(() => terrainMaskFromRows(['##', '#']), /dieselbe positive Breite/);
});
