import test from 'node:test';
import assert from 'node:assert/strict';

import { blattBauen, waehleRolle, frameFuer, MODUS } from '../src/client/figurSheets.js';
import { FigurPosen } from '../src/client/figurAnimation.js';

/** Falsche Leinwand: merkt sich nur die Quellzelle. */
const leinwand = () => ({ getContext: () => ({ drawImage() {} }) });
const blattBild = { width: 1024, height: 512 };
const eintrag = {
  gehen: [0, 1, 2, 3, 4, 5, 5, 7],
  rollen: { idle: [0, 1], luft: 2, hocke: 3, treffer: 5, tod: 7 },
};

test('blattBauen: Frames je Rolle, ersetzte Walk-Zellen teilen den Frame', () => {
  const b = blattBauen(eintrag, blattBild, blattBild, leinwand);
  assert.equal(b.walk.length, 8);
  assert.equal(b.walk[5], b.walk[6]);
  assert.equal(b.idle.length, 2);
  assert.ok(b.luft && b.hocke && b.treffer && b.tod);
  assert.equal(b.walk[0].stufen.length, 5);
});

test('blattBauen: falsche Blattgröße oder fehlende Rollen ergeben null (Fallback)', () => {
  const falsch = blattBauen(eintrag, { width: 512, height: 512 }, { width: 100, height: 100 }, leinwand);
  assert.equal(falsch.walk, null);
  assert.equal(falsch.idle, null);
  const luecke = blattBauen({ gehen: eintrag.gehen, rollen: { idle: [0, 1] } }, blattBild, blattBild, leinwand);
  assert.equal(luecke.luft, null);
  assert.equal(luecke.tod, null);
});

test('waehleRolle: Treffer vor Luft vor Hocke vor Gehen, sonst Stehen; fehlende Rolle -> Seitenbild', () => {
  const b = blattBauen(eintrag, blattBild, blattBild, leinwand);
  assert.equal(waehleRolle(b, 0), 'idle');
  assert.equal(waehleRolle(b, MODUS.GEHEN), 'walk');
  assert.equal(waehleRolle(b, MODUS.LUFT), 'luft');
  assert.equal(waehleRolle(b, MODUS.HOCKE), 'hocke');
  assert.equal(waehleRolle(b, MODUS.TREFFER | MODUS.GEHEN), 'treffer');
  assert.equal(waehleRolle(null, 0), null);
  const ohne = blattBauen({ gehen: eintrag.gehen, rollen: { idle: [0, 1] } }, blattBild, blattBild, leinwand);
  assert.equal(waehleRolle(ohne, MODUS.LUFT), null, 'Sprung ohne Frame: Seitenbild + Prozedur');
  assert.equal(waehleRolle(ohne, MODUS.TREFFER), 'idle', 'Treffer ohne Frame ändert das Stehbild nicht');
});

test('frameFuer: Gehzyklus ohne Zufall, 8 Frames je Zyklus, Idle nach Schalter', () => {
  const b = blattBauen(eintrag, blattBild, blattBild, leinwand);
  const folge = [0, 0.13, 0.26, 0.38, 0.51, 0.63, 0.76, 0.88].map(z => frameFuer(b, 'walk', z, 0));
  assert.deepEqual(folge, b.walk);
  assert.equal(frameFuer(b, 'walk', 1.13, 0), b.walk[1], 'periodisch');
  assert.equal(frameFuer(b, 'walk', -0.13, 0), b.walk[6], 'rückwärts');
  assert.equal(frameFuer(b, 'idle', 0, 1), b.idle[1]);
});

const figur = (x, y) => ({ entityId: 7, x, y });

test('Pose mit Blatt: Stand -> Idle, Laufen -> Gehzyklus gekoppelt an die Strecke, Treffer -> Treffer-Frame', () => {
  const b = blattBauen(eintrag, blattBild, blattBild, leinwand);
  const posen = new FigurPosen();
  let t = 0;
  const schritt = (x, opt = {}) => { t += 1 / 60; posen.pose(figur(x, 50), t, { blatt: b, ...opt }); return posen.zustand(7); };
  let z;
  for (let i = 0; i < 20; i += 1) z = schritt(100);
  assert.equal(z.rolle, 'idle');
  assert.ok(b.idle.includes(z.frame));
  const gesehen = new Set();
  for (let i = 0; i < 120; i += 1) { z = schritt(100 + i * 1.5); if (z.rolle === 'walk') gesehen.add(z.frame); }
  assert.equal(z.rolle, 'walk');
  assert.ok(gesehen.size >= 6, `Walk-Frames im Lauf: ${gesehen.size}`);
  z = schritt(100 + 120 * 1.5, { treffer: 1, haerte: 0.8 });
  assert.equal(z.rolle, 'treffer');
  assert.equal(z.frame, b.treffer);
});

test('Pose ohne Blatt: kein Frame (Seitenbild + Prozedur wie bisher)', () => {
  const posen = new FigurPosen();
  for (let i = 1; i < 30; i += 1) posen.pose(figur(100 + i * 3, 50), i / 60, {});
  const z = posen.zustand(7);
  assert.equal(z.frame, null);
  assert.equal(z.rolle, null);
});

test('Pose mit Blatt: Sprung in der Luft zeigt den Luft-Frame', () => {
  const b = blattBauen(eintrag, blattBild, blattBild, leinwand);
  const posen = new FigurPosen();
  let z;
  for (let i = 0; i < 20; i += 1) posen.pose(figur(100, 50), i / 60, { blatt: b });
  for (let i = 20; i < 40; i += 1) { posen.pose(figur(100, 50 - (i - 20) * 4), i / 60, { blatt: b }); z = posen.zustand(7); }
  assert.equal(z.rolle, 'luft');
  assert.equal(z.frame, b.luft);
});
