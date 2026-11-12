/**
 * N-10: eigene Schussbewegung je Nahkampf-Familie (stoßen, schneiden, schlagen, sägen, ziehen).
 * Reine Posenrechnung ohne Canvas. Prüft Zuordnung, Unterscheidbarkeit, stetiges Auslaufen (kein Ruck am
 * Ende der Geste), die Zeitbindung an den Abwurf und Reduced Motion.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { WEAPONS } from '../src/shared/config/weapons.js';
import {
  NAHKAMPF_ARTEN, NAHKAMPF_JE_WAFFE, parameterFuerWaffe, waffenPose, neuePose, neueZeiten,
} from '../src/client/waffenAnimation.js';

const MELEE = WEAPONS.filter(w => w.category === 'melee');
const DING = { form: 'objekt', projektilInfo: { art: 'ding', spin: true } };
const parVon = w => parameterFuerWaffe(w, DING);

function pose(par, t, reduziert = false) {
  const p = neuePose();
  waffenPose(par, { ...neueZeiten(), seitSchuss: t }, reduziert, p);
  return p;
}

test('Alle 21 Nahkampfwaffen haben eine Familie, und jede Familie hat mindestens eine Waffe', () => {
  assert.equal(MELEE.length, 21);
  for (const w of MELEE) assert.ok(NAHKAMPF_ARTEN[NAHKAMPF_JE_WAFFE[w.id]], `${w.id}: keine Familie`);
  const benutzt = new Set(MELEE.map(w => NAHKAMPF_JE_WAFFE[w.id]));
  assert.deepEqual([...benutzt].sort(), Object.keys(NAHKAMPF_ARTEN).sort());
  assert.deepEqual(Object.keys(NAHKAMPF_JE_WAFFE).filter(id => !MELEE.some(w => w.id === id)), []);
});

test('Die Waffe bekommt die Schussart ihrer Familie, auch als Wurfwaffe', () => {
  for (const w of MELEE) assert.equal(parVon(w).art, NAHKAMPF_ARTEN[NAHKAMPF_JE_WAFFE[w.id]].art, w.id);
  // Fernkampf bleibt unberührt.
  const gewehr = WEAPONS.find(w => w.category === 'ranged');
  assert.equal(parameterFuerWaffe(gewehr, null).art, 'kurz');
});

test('Die fünf Familien bewegen sich unterscheidbar (Kurve über die Schusszeit)', () => {
  const kurven = new Map();
  for (const [name, a] of Object.entries(NAHKAMPF_ARTEN)) {
    const w = MELEE.find(x => NAHKAMPF_JE_WAFFE[x.id] === name);
    const par = parVon(w);
    const k = [];
    for (let t = 0.02; t < par.schussDauer; t += 0.02) {
      const p = pose(par, t);
      k.push(`${p.vor.toFixed(1)}|${p.hoch.toFixed(1)}|${p.drehung.toFixed(2)}`);
    }
    kurven.set(name, k.join(','));
    assert.equal(par.schussDauer, a.schussDauer);
  }
  assert.equal(new Set(kurven.values()).size, 5);
});

test('Jede Geste läuft stetig aus: kurz vor dem Ende ist die Pose nahe der Ruhe, kein Ruck beim Abschalten', () => {
  for (const w of MELEE) {
    const par = parVon(w);
    const ruhe = pose(par, 9);
    const ende = pose(par, par.schussDauer - 1e-4);
    assert.ok(Math.abs(ende.vor - ruhe.vor) < 0.1, `${w.id}: vor springt am Ende (${ende.vor})`);
    assert.ok(Math.abs(ende.hoch - ruhe.hoch) < 0.1, `${w.id}: hoch springt am Ende`);
    assert.ok(Math.abs(ende.drehung - ruhe.drehung) < 0.05, `${w.id}: drehung springt am Ende`);
    assert.ok(Math.abs(ende.skala - ruhe.skala) < 0.01, `${w.id}: skala springt am Ende`);
  }
});

test('Die Pose ist über die ganze Geste endlich und ohne Sprünge größer als 4,6 px pro 1/60 s (Stich: 9,5 px in 4 Bildern)', () => {
  for (const w of MELEE) {
    const par = parVon(w);
    let vorher = pose(par, 0);
    for (let t = 1 / 60; t < par.schussDauer; t += 1 / 60) {
      const p = pose(par, t);
      for (const k of ['vor', 'hoch', 'drehung', 'skala']) assert.ok(Number.isFinite(p[k]), `${w.id} ${k}`);
      assert.ok(Math.abs(p.vor - vorher.vor) < 4.6, `${w.id}: vor springt bei t=${t.toFixed(3)}`);
      assert.ok(Math.abs(p.hoch - vorher.hoch) < 3.2, `${w.id}: hoch springt bei t=${t.toFixed(3)}`);
      assert.ok(Math.abs(p.drehung - vorher.drehung) < 0.75, `${w.id}: drehung springt bei t=${t.toFixed(3)}`);
      vorher = p;
    }
  }
});

test('Zeitbindung an den Abwurf: die Geste ist in den ersten 130 ms im Gang, der Blitz fällt in das Durchziehen', () => {
  for (const [name, a] of Object.entries(NAHKAMPF_ARTEN)) {
    const w = MELEE.find(x => NAHKAMPF_JE_WAFFE[x.id] === name);
    const par = parVon(w);
    const ruhe = pose(par, 9);
    let max = 0;
    for (let t = 0.005; t <= 0.13; t += 0.005) {
      const p = pose(par, t);
      max = Math.max(max, Math.abs(p.vor - ruhe.vor), Math.abs(p.hoch - ruhe.hoch), Math.abs(p.drehung - ruhe.drehung) * 10);
    }
    assert.ok(max > 1, `${name}: nach dem Abwurf kaum Bewegung`);
    if (a.blitzForm !== 'keiner') {
      assert.ok(a.treffAb <= 0.13, `${name}: Blitz zu spät`);
      assert.equal(pose(par, a.treffAb - 0.01).blitz, 0, `${name}: Blitz vor dem Durchziehen`);
      assert.ok(pose(par, a.treffAb + 0.01).blitz > 0.5, `${name}: kein Blitz beim Durchziehen`);
      assert.equal(pose(par, a.treffAb + 0.01).blitzForm, a.blitzForm);
    }
  }
});

test('Reduced Motion: keine Bewegung der Waffe, aber der Blitz als Aussage bleibt', () => {
  for (const [name, a] of Object.entries(NAHKAMPF_ARTEN)) {
    const w = MELEE.find(x => NAHKAMPF_JE_WAFFE[x.id] === name);
    const par = parVon(w);
    const ruhe = pose(par, 9, true);
    for (let t = 0.01; t < par.schussDauer; t += 0.01) {
      const p = pose(par, t, true);
      assert.equal(p.vor, ruhe.vor);
      assert.equal(p.hoch, ruhe.hoch);
      assert.equal(p.drehung, ruhe.drehung);
    }
    if (a.blitzForm !== 'keiner') assert.ok(pose(par, a.treffAb + 0.01, true).blitz > 0.5, `${name}: Blitz fehlt bei reduzierter Bewegung`);
  }
});

test('Gleiche Zeit, gleiche Pose (deterministisch, ohne Zufall)', () => {
  for (const w of MELEE) {
    const par = parVon(w);
    assert.deepEqual(pose(par, 0.137), pose(par, 0.137));
  }
});
