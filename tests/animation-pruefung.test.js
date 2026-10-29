/**
 * Prüfmechanismus für Animationen (reine Daten, ohne Browser): Jede Waffe hat eine endliche, sichtbar
 * bewegte Pose; jede Effektfolge hat Datei und gültiges Raster; jede Figur hat ihre Sheets und mindestens
 * eine freigegebene Emotionszelle. Fängt Lücken, die kein Auge sofort sieht (fehlende Datei, NaN, stehende Waffe).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { WEAPONS } from '../src/shared/config/weapons.js';
import { waffenParameter, waffenPose, neuePose, neueZeiten } from '../src/client/waffenAnimation.js';
import { SHEETS } from '../src/client/effektSheets.js';

const ASSETS = resolve(import.meta.dirname, '../src/client/assets');

const ENDLICH = ['vor', 'hoch', 'drehung', 'skala', 'glanz', 'blitz', 'weiss', 'dunkel', 'ladung'];

/** Größte Abweichung einer Pose-Größe über Idle-Zeit, Ziehen und Schuss gegen die Ruhepose. */
function bewegung(par) {
  const ruhe = neuePose();
  waffenPose(par, { ...neueZeiten(), idle: 0 }, false, ruhe);
  let max = 0;
  const zeiten = [
    { ...neueZeiten(), idle: 0.4 }, { ...neueZeiten(), idle: 1.1 },
    { ...neueZeiten(), seitZiehen: 0.05 }, { ...neueZeiten(), seitSchuss: 0.03 }, { ...neueZeiten(), seitSchuss: 0.1 },
  ];
  for (const z of zeiten) {
    const p = neuePose();
    waffenPose(par, z, false, p);
    for (const k of ENDLICH) {
      assert.ok(Number.isFinite(p[k]), `${k} ist nicht endlich`);
      max = Math.max(max, Math.abs(p[k] - ruhe[k]));
    }
  }
  return max;
}

test('Waffen: jede der 150 Waffen hat Parameter, endliche Posen und bewegt sich beim Schuss sichtbar', () => {
  assert.equal(WEAPONS.length, 150);
  const stehend = [];
  for (const w of WEAPONS) {
    const par = waffenParameter(w.category, w.id, w.damage === 0, '', (w.fuseTime ?? 0) > 0);
    assert.ok(par && typeof par === 'object', `${w.id}: keine Parameter`);
    if (bewegung(par) < 1e-6) stehend.push(w.id);
  }
  assert.deepEqual(stehend, [], `Waffen ohne jede Bewegung: ${stehend.join(', ')}`);
});

test('Effektfolgen: Datei vorhanden, Frames liegen im Raster', () => {
  for (const [name, s] of Object.entries(SHEETS)) {
    assert.ok(existsSync(resolve(ASSETS, 'effekt-sheets', s.datei)), `${name}: ${s.datei} fehlt`);
    const zellen = s.spalten * s.zeilen;
    assert.ok(s.frames.length > 0 && s.frames.every(f => Number.isInteger(f) && f >= 0 && f < zellen), `${name}: Frame außerhalb des Rasters`);
    assert.ok(s.takt >= 1 && s.kern > 0 && s.kern <= 1, `${name}: takt/kern`);
  }
});

test('Figuren: Sheets vorhanden, Emotionen mit mindestens einer freigegebenen Zelle', () => {
  const sheets = JSON.parse(readFileSync(resolve(ASSETS, 'sprite-sheets/manifest.json'), 'utf8')).figuren;
  const emotion = JSON.parse(readFileSync(resolve(ASSETS, 'sprite-sheets-emotion/manifest.json'), 'utf8')).figuren;
  const keys = Object.keys(sheets);
  assert.equal(keys.length, 81);
  for (const k of keys) {
    for (const art of ['walk', 'aktion', 'zustand']) {
      assert.ok(sheets[k][art], `${k}: kein ${art}-Eintrag`);
      assert.ok(existsSync(resolve(ASSETS, 'sprite-sheets', sheets[k][art])), `${k}: ${art}-Datei fehlt`);
    }
    assert.ok(emotion[k], `${k}: kein Emotionseintrag`);
    assert.ok(existsSync(resolve(ASSETS, 'sprite-sheets-emotion', emotion[k].datei)), `${k}: Emotions-Datei fehlt`);
    assert.ok(emotion[k].gueltig.length >= 1, `${k}: keine gültige Emotionszelle`);
  }
});
