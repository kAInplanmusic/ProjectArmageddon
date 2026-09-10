import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameWorld } from '../src/engine/init.js';

test('DamageSystem emits one deterministic death and cleans up the entity', () => {
  const world = createGameWorld({ turnDuration: 1000 });
  const entity = world.createEntity();
  world.addComponent(entity, 'Health', { current: 10, max: 10 });
  const damage = world.getSystem('damage');
  const deaths = [];
  damage.onDeath((_world, id) => deaths.push(id));

  damage.applyDamage(world, entity, 10, 99);
  world.step();
  world.step();

  assert.deepEqual(deaths, [entity]);
  assert.equal(world.isActive(entity), false);
  assert.deepEqual(damage.killFeed, [{ target: entity, attacker: 99, damage: 10, tick: 0 }]);
});