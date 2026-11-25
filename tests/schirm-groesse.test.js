/**
 * Zeichenfläche mit dem Seitenverhältnis der Anzeige (TODO 2.1): vorher kartengroß (24:9) und per CSS in 16:9 gestreckt.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { schirmGroesse, SCHIRM_MIN_BREITE, SCHIRM_MAX_BREITE } from '../src/client/schirmGroesse.js';

test('Seitenverhältnis der Anzeige, Auflösung zwischen 1920 und 3840 px Breite', () => {
  for (const [b, h, dpr] of [[1280, 720, 1], [604, 340, 3], [1080, 810, 2], [2560, 1440, 2], [800, 400, 1]]) {
    const g = schirmGroesse(b, h, dpr);
    assert.ok(Math.abs(g.b / g.h - b / h) < 0.01, `${b}x${h}: Seitenverhältnis bleibt`);
    assert.ok(g.b >= SCHIRM_MIN_BREITE - 1 && g.b <= SCHIRM_MAX_BREITE, `${b}x${h}: Breite ${g.b}`);
  }
  assert.deepEqual(schirmGroesse(1920, 1080, 1), { b: 1920, h: 1080 });
  assert.deepEqual(schirmGroesse(1920, 1080, 1.5), { b: 2880, h: 1620 });
  assert.equal(schirmGroesse(0, 100, 1), null);
  assert.equal(schirmGroesse(100, NaN, 1), null);
});
