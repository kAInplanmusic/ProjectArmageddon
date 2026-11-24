/**
 * TODO 2.1 WASSER-AUSBAU: Sturzflut (`config/biomregeln.js`, Fassung 7).
 *
 * Geprüft wird: Versionsmarke (Fassung 1 bis 6 behalten ihre Werte), die Werte im Match, und der Dammbruch aus
 * `scripts/messung-wasserlauf.mjs` als Spielzug: Fassung 6 schob die Figur kaum und ließ sie nie tief stehen;
 * Fassung 7 spült sie bei kleinem Stau weit fort ohne Schaden und drückt sie bei großem Stau an den Fels, wo sie
 * ertrinkt. Die genauen Weiten sind nicht Gegenstand, nur diese Wirkungen.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BIOMREGELN_STANDARD, BIOMREGELN_STURZFLUT, BIOMREGELN_TREIBEN, BIOMREGELN_WASSER, WASSERLAUF, WASSERLAUF_STURZFLUT,
  normalisiereBiomregeln, wasserSchubFuer, wasserTeilschritte,
} from '../src/shared/config/biomregeln.js';
import { lauf, werteFuer } from '../scripts/messung-wasserlauf.mjs';
import { neuesMatch } from '../scripts/bot-partien.mjs';

test('Fassungen: 7 bleibt gültig (Standard ist 9, Bodenwirkung); 6 und älter behalten Schub und Teilschritte', () => {
  assert.equal(BIOMREGELN_STANDARD, BIOMREGELN_STURZFLUT + 2);
  assert.equal(normalisiereBiomregeln(7), 7);
  assert.equal(normalisiereBiomregeln(undefined), 9);
  assert.deepEqual([wasserTeilschritte(BIOMREGELN_WASSER), wasserSchubFuer(BIOMREGELN_WASSER)], [0, 0], 'vor Fassung 5 kein Wasserlauf');
  for (const f of [5, BIOMREGELN_TREIBEN]) assert.deepEqual([wasserTeilschritte(f), wasserSchubFuer(f)], [1, WASSERLAUF.schub]);
  assert.deepEqual([wasserTeilschritte(7), wasserSchubFuer(7)], [WASSERLAUF_STURZFLUT.teilschritte, WASSERLAUF_STURZFLUT.schub]);
});

test('Match: der Schub der Fassung steht in den Diensten', () => {
  for (const f of [BIOMREGELN_TREIBEN, BIOMREGELN_STURZFLUT]) {
    const m = neuesMatch(20261111, 4, { teams: 2, proTeam: 1, extra: { biom: 'klassisch', biomregeln: f } });
    assert.equal(m.world.services.match.wasserSchub, wasserSchubFuer(f), `Fassung ${f}`);
  }
});

test('Dammbruch, Fassung 6: die Figur wird kaum geschoben, steht nie tief, nimmt keinen Schaden', () => {
  for (const stau of [80, 160]) {
    const r = lauf({ stau, startX: 340, ...werteFuer(BIOMREGELN_TREIBEN) });
    assert.ok(r.weg < 150, `Stau ${stau}: Weg ${r.weg}`);
    assert.equal(r.tief, false); assert.equal(r.schaden, 0); assert.equal(r.amFels, false);
  }
});

test('Dammbruch, Fassung 7: kleiner Stau spült weit fort ohne Schaden, großer drückt an den Fels und ertränkt', () => {
  const klein = lauf({ stau: 80, startX: 340, ...werteFuer(BIOMREGELN_STURZFLUT) });
  assert.ok(klein.weg > 150, `Weg ${klein.weg}`);
  assert.equal(klein.schaden, 0);
  assert.ok(klein.wasserAnFigurNachS < 5, `Wasser nach ${klein.wasserAnFigurNachS} s`);
  const gross = lauf({ stau: 160, startX: 340, ...werteFuer(BIOMREGELN_STURZFLUT) });
  assert.equal(gross.amFels, true, 'am Fels');
  assert.equal(gross.tief, true);
  assert.ok(gross.schaden > 100, `Schaden ${gross.schaden}`);
});
