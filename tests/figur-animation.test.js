import test from 'node:test';
import assert from 'node:assert/strict';

import { FigurPosen, fallPose, FALL_DAUER } from '../src/client/figurAnimation.js';

const figur = (x, y) => ({ entityId: 1, x, y });
const lauf = (posen, schritte, dt, f, opt = {}) => {
  let t = 0;
  let pose;
  for (let i = 0; i < schritte; i += 1) {
    t += dt;
    pose = posen.pose(f(i, t), t, opt);
  }
  return { pose, t };
};

test('Ohne Bewegungsanimation bleibt die Pose neutral (nur der Blitz wirkt)', () => {
  const p = new FigurPosen();
  const { pose } = lauf(p, 120, 1 / 60, (i, t) => figur(100 + t * 80, 50 + Math.sin(t * 9) * 30), { reduziert: true, treffer: 0.5 });
  assert.deepEqual({ ...pose }, { dx: 0, dy: 0, sx: 1, sy: 1, rot: 0, flash: 0.5, tint: 0, neigung: 0, zug: 0, hpVerz: 1 });
});

test('Im Stand atmet die Figur, beim Laufen neigt sie sich in Laufrichtung', () => {
  const p = new FigurPosen();
  const stand = lauf(p, 30, 1 / 60, () => figur(100, 50)).pose;
  assert.ok(Math.abs(stand.sy - 1) <= 0.017 && stand.rot === 0);
  const rechts = lauf(p, 60, 1 / 60, (i, t) => figur(100 + t * 90, 50)).pose;
  assert.ok(rechts.rot > 0.05, 'Neigung nach rechts');
  const q = new FigurPosen();
  const links = lauf(q, 60, 1 / 60, (i, t) => figur(500 - t * 90, 50)).pose;
  assert.ok(links.rot < -0.05, 'Neigung nach links');
});

test('Sprung streckt, Landung staucht kurz', () => {
  const p = new FigurPosen();
  lauf(p, 10, 1 / 60, () => figur(100, 50));
  // Aufstieg
  let y = 50;
  let t = 10 / 60;
  let pose;
  for (let i = 0; i < 6; i += 1) { t += 1 / 60; y -= 6; pose = p.pose(figur(100, y), t, {}); }
  assert.ok(pose.sy > 1.03, 'gestreckt in der Luft');
  // Fall mit hohem Tempo, dann Aufprall
  for (let i = 0; i < 14; i += 1) { t += 1 / 60; y += 6 + i * 1.2; pose = p.pose(figur(100, y), t, {}); }
  let minSy = 2;
  for (let i = 0; i < 8; i += 1) { t += 1 / 60; pose = p.pose(figur(100, y), t, {}); minSy = Math.min(minSy, pose.sy); }
  assert.ok(minSy < 0.97, `gestaucht nach der Landung (${minSy})`);
  for (let i = 0; i < 40; i += 1) { t += 1 / 60; pose = p.pose(figur(100, y), t, {}); }
  assert.ok(Math.abs(pose.sy - 1) < 0.02, 'Stauchung klingt ab');
});

test('Die Pose ist von der Bildrate unabhängig (30 gegen 120 Hz)', () => {
  const messe = hz => {
    const p = new FigurPosen();
    return lauf(p, hz, 1 / hz, (i, t) => figur(100 + t * 90, 50)).pose.rot;
  };
  assert.ok(Math.abs(messe(30) - messe(120)) < 0.03);
});

test('Fall-Effekt endet nach FALL_DAUER; Ertrinken sinkt ohne Drehung', () => {
  const fall = { t0: 0, ertrinkt: false, blick: 1, vx: 100 };
  assert.ok(fallPose(fall, FALL_DAUER * 0.5, false));
  assert.equal(fallPose(fall, FALL_DAUER + 0.01, false), null);
  const nass = fallPose({ ...fall, ertrinkt: true }, FALL_DAUER * 0.5, false);
  assert.equal(nass.rot, 0);
  assert.ok(nass.dy > 0);
  const still = fallPose(fall, FALL_DAUER * 0.5, true);
  assert.equal(still.rot, 0);
});
