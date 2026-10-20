import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FigurPosen, fallPose, FALL_DAUER, schussKurve, trefferKurve, NEIGUNG_MAX,
} from '../src/client/figurAnimation.js';
import { PARAMETER } from '../src/client/figurTypen.js';
import { FigurEffekte, MAX_TEILCHEN } from '../src/client/figurEffekte.js';

const figur = (x, y) => ({ entityId: 1, x, y });

const ruhe = (typ, opt = {}, sekunden = 4) => {
  const p = new FigurPosen();
  const par = PARAMETER[typ];
  let t = 0;
  let pose;
  let minDy = 0; let maxDy = -1e9; let minSy = 9; let maxSy = 0;
  for (let i = 0; i < sekunden * 60; i += 1) {
    t += 1 / 60;
    pose = p.pose(figur(100, 50), t, { params: par, typ, ...opt });
    minDy = Math.min(minDy, pose.dy); maxDy = Math.max(maxDy, pose.dy);
    minSy = Math.min(minSy, pose.sy); maxSy = Math.max(maxSy, pose.sy);
  }
  return { p, pose, minDy, maxDy, minSy, maxSy, t };
};

test('Idle je Typ: Schweber schweben, Wesen pulsieren, Fahrzeuge vibrieren, alle bleiben beschränkt', () => {
  const sw = ruhe('schweber');
  assert.ok(sw.maxDy < -0.8, 'Schweber hängt über dem Boden');
  assert.ok(sw.maxDy - sw.minDy > 1.5, 'schwebt auf und ab');
  const we = ruhe('wesen');
  assert.ok(we.maxSy - we.minSy > 0.04, 'pulsiert');
  const fz = ruhe('fahrzeug');
  assert.ok(fz.maxDy - fz.minDy > 0.3 && fz.maxDy - fz.minDy < 1.5, 'vibriert klein');
  for (const typ of Object.keys(PARAMETER)) {
    const r = ruhe(typ);
    assert.ok(r.minSy > 0.9 && r.maxSy < 1.1, `${typ} bleibt im Rahmen`);
  }
});

test('Der Verlauf ist deterministisch (gleiche Eingabe, gleiche Pose)', () => {
  const a = ruhe('tier', { winkel: 0.4 }).pose;
  const b = ruhe('tier', { winkel: 0.4 }).pose;
  assert.deepEqual({ ...a }, { ...b });
});

test('Laufen: Humanoide wippen, Schweber nur sanft, Fahrzeuge rollen', () => {
  const messe = (typ) => {
    const p = new FigurPosen();
    let min = 0; let max = -9;
    let t = 0;
    for (let i = 0; i < 150; i += 1) {
      t += 1 / 60;
      const pose = p.pose(figur(100 + t * 90, 50), t, { params: PARAMETER[typ], typ });
      if (i > 60) { min = Math.min(min, pose.dy); max = Math.max(max, pose.dy); }
    }
    return max - min;
  };
  assert.ok(messe('humanoid') > 1.2);
  assert.ok(messe('schweber') < 3.5);
  assert.ok(messe('fahrzeug') < messe('humanoid'));
});

test('Schusskurve: Ausholen, Rückstoß, Rückkehr in Ruhe', () => {
  assert.equal(schussKurve(0), 0);
  assert.equal(schussKurve(1), 0);
  assert.ok(schussKurve(0.06) < 0, 'Anticipation');
  assert.ok(schussKurve(0.3) > 0.95, 'Rückstoß');
  assert.ok(Math.abs(schussKurve(0.99)) < 0.01);
  const p = new FigurPosen();
  let t = 0;
  let maxDx = 0;
  for (let i = 0; i < 90; i += 1) {
    t += 1 / 60;
    const pose = p.pose(figur(100, 50), t, { winkel: 0, feuer: i === 10 ? 1 : 0 });
    maxDx = Math.max(maxDx, Math.abs(pose.dx));
  }
  assert.ok(maxDx > 0.8, 'Rückstoß sichtbar');
  const ende = p.pose(figur(100, 50), t + 0.01, { winkel: 0 });
  assert.ok(Math.abs(ende.rot) < 0.01, 'Pose kehrt zur Ruhe zurück');
});

test('Treffer: Zucken in Stoßrichtung, weißer Blitz, dann Teamfarbe, danach Ruhe', () => {
  assert.ok(trefferKurve(0) > 0.9);
  assert.equal(trefferKurve(0.5), 0);
  const p = new FigurPosen();
  let t = 0;
  p.pose(figur(100, 50), t, { winkel: 0 });
  t += 0.02;
  const pose = p.pose(figur(100, 50), t, { winkel: 0, treffer: 1 });
  assert.ok(pose.flash > 0.8);
  assert.ok(pose.dx < 0, 'Stoß von vorn drückt zurück (Blick nach rechts)');
  t += 0.2;
  const spaet = p.pose(figur(100, 50), t, { winkel: 0, treffer: 0 });
  assert.ok(spaet.tint > 0 && spaet.flash === 0);
  t += 0.6;
  assert.equal(p.pose(figur(100, 50), t, { winkel: 0 }).tint, 0);
});

test('Zielen kippt den Oberkörper nach hinten bei Blick nach oben, gespiegelt bei Winkel über 90 Grad', () => {
  const kipp = (winkel) => ruhe('humanoid', { winkel }, 1).pose.rot;
  assert.ok(kipp(1.2) < -0.02, 'rechts, nach oben: nach hinten');
  assert.ok(kipp(Math.PI - 1.2) > 0.02, 'links, nach oben: gespiegelt');
  assert.ok(Math.abs(kipp(0)) < 0.02);
});

test('Hangneigung ist auf 12 Grad begrenzt und wirkt auch bei reduzierter Bewegung', () => {
  const p = new FigurPosen();
  const pose = p.pose(figur(0, 0), 1, { neigung: 1, reduziert: true });
  assert.ok(Math.abs(pose.neigung - NEIGUNG_MAX) < 1e-9);
  assert.ok(Math.abs(NEIGUNG_MAX - 12 * Math.PI / 180) < 1e-9);
});

test('Zugbeginn löst einmalig die Aufmerksamkeit aus; reduzierte Bewegung nie', () => {
  const p = new FigurPosen();
  let t = 0;
  let zug = 0;
  for (let i = 0; i < 120; i += 1) {
    t += 1 / 60;
    if (p.pose(figur(100, 50), t, { aktiv: true, winkel: 0 }).zug > 0) zug += 1;
  }
  assert.ok(zug > 20 && zug < 60, `Dauer ${zug}`);
  const q = new FigurPosen();
  assert.equal(q.pose(figur(100, 50), 1, { aktiv: true, reduziert: true }).zug, 0);
});

test('Landung ruft den Staub-Rückruf; Sieger hüpft, Verlierer sackt', () => {
  const p = new FigurPosen();
  let gerufen = 0;
  p.beiLandung = () => { gerufen += 1; };
  let t = 0;
  for (let i = 0; i < 10; i += 1) { t += 1 / 60; p.pose(figur(100, 50), t, {}); }
  let y = 50;
  for (let i = 0; i < 16; i += 1) { t += 1 / 60; y += 8 + i; p.pose(figur(100, y), t, {}); }
  for (let i = 0; i < 8; i += 1) { t += 1 / 60; p.pose(figur(100, y), t, {}); }
  assert.equal(gerufen, 1);
  assert.ok(ruhe('humanoid', { ergebnis: 1 }, 2).minDy < -2, 'Jubel-Hüpfer');
  assert.ok(ruhe('humanoid', { ergebnis: -1 }, 2).maxSy < 1, 'Verlierer duckt sich');
});

test('Lebensbalken: Verzögerungsleiste hält kurz und schmilzt dann auf den Istwert', () => {
  const p = new FigurPosen();
  let t = 0;
  p.pose(figur(0, 0), t, { hp: 1 });
  t += 1 / 60;
  p.pose(figur(0, 0), t, { hp: 0.4 });
  t += 0.2;
  assert.ok(p.pose(figur(0, 0), t, { hp: 0.4 }).hpVerz > 0.95, 'hält');
  for (let i = 0; i < 180; i += 1) { t += 1 / 60; p.pose(figur(0, 0), t, { hp: 0.4 }); }
  assert.ok(Math.abs(p.pose(figur(0, 0), t + 1 / 60, { hp: 0.4 }).hpVerz - 0.4) < 1e-6);
});

test('Tod je Typ: endet nach FALL_DAUER, bleibt endlich; reduziert blendet nur aus', () => {
  for (const tod of ['kippen', 'explodieren', 'stuerzen', 'zerfallen', 'zerstieben']) {
    const fall = { t0: 0, ertrinkt: false, blick: 1, vx: 50, tod };
    for (let t = 0; t < FALL_DAUER; t += 0.05) {
      const f = fallPose(fall, t, false);
      for (const v of Object.values(f)) assert.ok(Number.isFinite(v), `${tod} ${t}`);
      assert.ok(f.alpha >= 0 && f.alpha <= 1);
    }
    assert.equal(fallPose(fall, FALL_DAUER, false), null);
    const r = fallPose(fall, FALL_DAUER / 2, true);
    assert.equal(r.rot, 0);
    assert.equal(r.sx, 1);
  }
  assert.ok(fallPose({ t0: 0, blick: 1, vx: 0, tod: 'kippen' }, 0.45, false).rot > 1.2, 'liegt');
});

test('Partikelvorrat: fester Speicher, Teilchen laufen aus, Tod erzeugt Teamfarbe', () => {
  const e = new FigurEffekte();
  assert.equal(e.max, MAX_TEILCHEN);
  e.tod('kippen', 10, 10, '#ff0000');
  e.staub(10, 10, 1);
  e.blasen(10, 10);
  assert.ok(e.aktiv > 20);
  assert.ok(e.farben.includes('#ff0000'));
  for (let i = 0; i < 100; i += 1) e.aktualisiere(1 / 30);
  assert.equal(e.aktiv, 0);
  for (let i = 0; i < 40; i += 1) e.tod('zerstieben', 0, 0, '#00ff00');
  assert.ok(e.aktiv <= MAX_TEILCHEN);
});
