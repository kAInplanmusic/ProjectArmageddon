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

import fs from 'node:fs';

test('emotionBauen: nur gültige Zellen werden gebaut, ohne gültige Zelle gibt es keine Emotionen', () => {
  const e = emotionBauen(blattBild, leinwand, [1, 3]);
  assert.deepEqual(Object.keys(e), ['blinzeln', 'jubel']);
  assert.equal(emotionBauen(blattBild, leinwand, []), null);
  assert.equal(emotionBauen(blattBild, leinwand, null) !== null, true, 'null = alle (Tests)');
});

test('Pose: fehlt die Emotion im Blatt (ungültige Zelle), bleibt der Idle-Frame', () => {
  const b = blattBauen(eintrag, blattBild, blattBild, leinwand);
  b.emotion = emotionBauen(blattBild, leinwand, [1]);
  const posen = new FigurPosen();
  let z;
  for (let i = 0; i < 20; i += 1) { posen.pose(figur(100, 50), i / 60, { blatt: b, ergebnis: 1 }); z = posen.zustand(7); }
  assert.ok(b.idle.includes(z.frame), 'Jubel-Zelle gesperrt: Idle');
  assert.equal(z.emotion, null);
});

test('Manifest der Emotions-Sheets: 81 geprüfte Figuren, gültige Zellen liegen in 0–7, die Verwandlungen sind gesperrt', () => {
  const pfad = new URL('../src/client/assets/sprite-sheets-emotion/', import.meta.url);
  const m = JSON.parse(fs.readFileSync(new URL('manifest.json', pfad), 'utf8'));
  const figuren = Object.entries(m.figuren);
  assert.equal(figuren.length, 81);
  for (const [k, e] of figuren) {
    assert.ok(fs.existsSync(new URL(e.datei, pfad)), `${k}: Datei fehlt`);
    assert.ok(e.gueltig.every((c) => Number.isInteger(c) && c >= 0 && c < 8), `${k}: gueltig`);
    assert.equal(e.abstand.length, 8, `${k}: abstand`);
  }
  // Bekannte Verwandlungen (Tier -> Mensch, gesehen am Kontaktbogen 2026-10-27): die Menschenzellen müssen gesperrt sein.
  // Danach mit Together neu erzeugte Zellen (emotion-neu.py), per Sichtprüfung freigegeben; die übrigen bleiben gesperrt.
  // 2026-10-28: Blick hoch/runter (5, 6) dieser drei Tiere sind mit dem strengeren Prompt neu erzeugt und per Sichtprüfung freigegeben.
  assert.deepEqual(m.figuren['beasts/01_shrew-quakes'].gueltig.filter((c) => c >= 1 && c <= 6), [1, 3, 4, 5, 6]);
  assert.deepEqual(m.figuren['beasts/12_magma-plate'].gueltig.filter((c) => [1, 3, 4, 5].includes(c)), [1, 3, 5]);
  assert.deepEqual(m.figuren['beasts/02_storm-talon'].gueltig.filter((c) => c >= 1 && c <= 6), [1, 3, 5, 6]);
});
