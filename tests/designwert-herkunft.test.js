/**
 * DESIGNWERT-1: Die Herkunft jedes Schadenswerts ist bewusst festgelegt.
 *
 * 97 Waffen tragen einen Designwert aus der Quelldatei, 38 einen aus der Kategorie abgeleiteten
 * (`derivePlaceholderDamage`), 15 Werkzeuge keinen Schaden. Begründung und Liste:
 * `docs/waffenbalance-2026-11-09/DESIGNWERT-1-HERKUNFT.md`. Dieser Test lässt keine Waffe
 * stillschweigend die Gruppe wechseln.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { WEAPONS } from '../src/shared/config/weapons.js';

const OHNE_SCHADEN = [
  'pa_032', 'pa_087', 'pa_088', 'pa_111', 'pa_112', 'pa_114', 'pa_115', 'pa_119',
  'pa_122', 'pa_125', 'pa_126', 'pa_127', 'pa_128', 'pa_130', 'pa_131',
];
const ABGELEITET = [
  'pa_011', 'pa_012', 'pa_013', 'pa_014', 'pa_015', 'pa_016', 'pa_017', 'pa_019', 'pa_020', 'pa_021',
  'pa_024', 'pa_025', 'pa_027', 'pa_033', 'pa_034', 'pa_036', 'pa_042', 'pa_043', 'pa_045', 'pa_047',
  'pa_050', 'pa_051', 'pa_076', 'pa_084', 'pa_089', 'pa_092', 'pa_093', 'pa_094', 'pa_095', 'pa_096',
  'pa_097', 'pa_099', 'pa_100', 'pa_101', 'pa_107', 'pa_109', 'pa_110', 'pa_149',
];

const gruppe = art => WEAPONS.filter(w => w.damageSource === art).map(w => w.id).sort();

test('Aufteilung: 97 Designwerte, 38 abgeleitet, 15 ohne Schaden', () => {
  assert.equal(WEAPONS.length, 150);
  assert.equal(gruppe('source').length, 97);
  assert.deepEqual(gruppe('derived'), [...ABGELEITET].sort(), 'Gruppe „abgeleitet" hat sich verändert');
  assert.deepEqual(gruppe('none'), [...OHNE_SCHADEN].sort(), 'Gruppe „ohne Schaden" hat sich verändert');
  assert.equal(WEAPONS.filter(w => !['source', 'derived', 'none'].includes(w.damageSource)).length, 0,
    'unbekannte Herkunft (z. B. Platzhalter 25 ungeprüft übernommen)');
});

test('Werkzeuge ohne Schaden haben wirklich keinen, abgeleitete und Designwerte einen positiven', () => {
  for (const w of WEAPONS) {
    if (w.damageSource === 'none') assert.equal(w.damage, 0, `${w.id} ${w.displayName}`);
    else assert.ok(w.damage > 0, `${w.id} ${w.displayName}: Schaden ${w.damage}`);
  }
});

test('Kein abgeleiteter Wert ist der alte Einheitsplatzhalter für die ganze Gruppe', () => {
  const werte = new Set(ABGELEITET.map(id => WEAPONS.find(w => w.id === id).damage));
  assert.ok(werte.size >= 20, `nur ${werte.size} verschiedene Werte — Ableitung wieder flach?`);
});
