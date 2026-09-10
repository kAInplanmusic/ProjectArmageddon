import assert from 'node:assert/strict';
import test from 'node:test';
import { CollisionMask } from '../src/engine/terrain/collisionMask.js';
import { ccdRaycast, computeTrajectory } from '../src/engine/physics/ballistics.js';

test('computeTrajectory is deterministic for identical parameters', () => {
  const params = { startX: 1, startY: 2, velocityX: 8, velocityY: -1, drag: 0.98, gravity: 0.5, maxSteps: 20 };
  assert.deepEqual(computeTrajectory(params), computeTrajectory(params));
});

test('ccdRaycast detects a thin terrain barrier between trajectory samples', () => {
  const mask = CollisionMask.fromBitmap(
    Array.from({ length: 20 * 10 }, (_, index) => index % 20 === 7 ? 1 : 0),
    20,
    10,
  );
  const result = ccdRaycast({
    startX: 0,
    startY: 5,
    velocityX: 10,
    velocityY: 0,
    drag: 1,
    gravity: 0,
    maxSteps: 2,
  }, (x, y) => mask.isSolid(Math.round(x), Math.round(y)));
  assert.equal(result.hit, true);
  assert.equal(Math.round(result.hitX), 7);
});

test('CollisionMask handles word boundaries and out-of-bounds as solid', () => {
  const bitmap = new Uint8Array(65);
  bitmap[31] = 1;
  bitmap[32] = 1;
  bitmap[64] = 1;
  const mask = CollisionMask.fromBitmap(bitmap, 65, 1);
  assert.equal(mask.isSolid(31, 0), true);
  assert.equal(mask.isSolid(32, 0), true);
  assert.equal(mask.isSolid(64, 0), true);
  assert.equal(mask.isSolid(30, 0), false);
  assert.equal(mask.isSolid(65, 0), true);
});
