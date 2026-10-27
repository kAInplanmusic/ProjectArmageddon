import test from 'node:test';
import assert from 'node:assert/strict';

import { blattBauen, emotionBauen, waehleEmotion, EMOTIONEN } from '../src/client/figurSheets.js';
import { FigurPosen } from '../src/client/figurAnimation.js';

const leinwand = () => ({ getContext: () => ({ drawImage() {} }) });
const blattBild = { width: 1024, height: 512 };
const eintrag = { gehen: [0, 1, 2, 3, 4, 5, 6, 7], rollen: { idle: [0, 1], luft: 2, hocke: 3, treffer: 5, tod: 7 } };
const figur = (x, y) => ({ entityId: 7, x, y });
const ruhig = { ergebnis: 0, hp: 1, aktiv: false, winkelSin: 0, zeit: 1, id: 7 };

test('emotionBauen: acht Frames in fester Reihenfolge, falsches Maß ergibt null', () => {
  const e = emotionBauen(blattBild, leinwand);
  assert.deepEqual(Object.keys(e), [...EMOTIONEN]);
  assert.equal(EMOTIONEN.length, 8);
  assert.equal(new Set(Object.values(e)).size, 8, 'jede Pose ist ein eigener Frame');
  assert.equal(emotionBauen({ width: 512, height: 512 }, leinwand), null);
  assert.equal(emotionBauen(null, leinwand), null);
});

test('waehleEmotion: Jubel vor Zittern vor Blick vor Blinzeln, sonst nichts', () => {
  assert.equal(waehleEmotion({ ...ruhig, ergebnis: 1, hp: 0.1 }), 'jubel');
  assert.equal(waehleEmotion({ ...ruhig, ergebnis: -1 }), 'zittern');
  assert.equal(waehleEmotion({ ...ruhig, hp: 0.2, aktiv: true, winkelSin: 0.9 }), 'zittern');
  assert.equal(waehleEmotion({ ...ruhig, aktiv: true, winkelSin: 0.9 }), 'blickHoch');
  assert.equal(waehleEmotion({ ...ruhig, aktiv: true, winkelSin: -0.5 }), 'blickRunter');
  assert.equal(waehleEmotion({ ...ruhig, aktiv: false, winkelSin: 0.9 }), null, 'nur die aktive Figur zielt');
  assert.equal(waehleEmotion({ ...ruhig, aktiv: true, winkelSin: 0.1 }), null);
  assert.equal(waehleEmotion({ ...ruhig, hp: 0 }), null, 'Tote zittern nicht');
});

test('waehleEmotion: Blinzeln kurz und wiederkehrend, je Figur versetzt', () => {
  const an = (zeit, id) => waehleEmotion({ ...ruhig, zeit, id }) === 'blinzeln';
  let n = 0;
  for (let t = 0; t < 44; t += 0.02) if (an(t, 3)) n += 1;
  assert.ok(n > 0 && n < 44 * 50 * 0.06, `Blinzelanteil ${n}`);
  assert.ok(an(0.05, 0) && !an(0.05, 3), 'Figuren blinzeln nicht gleichzeitig');
});

test('Pose: stehende Figur mit Emotions-Blatt zeigt Jubel (Sieger) und blickt beim Zielen nach oben', () => {
  const b = blattBauen(eintrag, blattBild, blattBild, leinwand);
  b.emotion = emotionBauen(blattBild, leinwand);
  const posen = new FigurPosen();
  let z;
  for (let i = 0; i < 20; i += 1) { posen.pose(figur(100, 50), i / 60, { blatt: b, ergebnis: 1 }); z = posen.zustand(7); }
  assert.equal(z.rolle, 'idle');
  assert.equal(z.frame, b.emotion.jubel);
  assert.equal(z.emotion, 'jubel');
  for (let i = 20; i < 40; i += 1) { posen.pose(figur(100, 50), 0.4 + i / 60, { blatt: b, aktiv: true, winkel: 1.0 }); z = posen.zustand(7); }
  assert.equal(z.frame, b.emotion.blickHoch);
});

test('Pose: Laufen und Springen behalten ihre Frames, ohne Emotionsblatt bleibt alles wie vorher', () => {
  const b = blattBauen(eintrag, blattBild, blattBild, leinwand);
  const posen = new FigurPosen();
  for (let i = 0; i < 20; i += 1) posen.pose(figur(100, 50), i / 60, { blatt: b, ergebnis: 1 });
  assert.ok(b.idle.includes(posen.zustand(7).frame), 'ohne Emotionsblatt: Idle');
  assert.equal(posen.zustand(7).emotion, null);
  b.emotion = emotionBauen(blattBild, leinwand);
  const luft = new FigurPosen();
  for (let i = 0; i < 20; i += 1) luft.pose(figur(100, 50), i / 60, { blatt: b, ergebnis: 1 });
  let z;
  for (let i = 20; i < 40; i += 1) { luft.pose(figur(100, 50 - (i - 20) * 4), i / 60, { blatt: b, ergebnis: 1 }); z = luft.zustand(7); }
  assert.equal(z.rolle, 'luft');
  assert.equal(z.frame, b.luft, 'in der Luft gilt der Luft-Frame, nicht die Emotion');
});
