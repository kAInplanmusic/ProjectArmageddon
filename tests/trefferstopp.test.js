/**
 * Trefferstopp (TODO 2.9, `client/trefferstopp.js`): Dauer je Treffer, Schwelle, Höchstdauer, keine Verlängerung durch viele
 * kleine Treffer, Abschalten, Bewegungsreduktion. Reine Darstellung; die Spielschleife nutzt nur `aktiv`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { trefferstopp, stoppDauer, SCHADEN_AB, GRUND_MS, MAX_MS } from '../src/client/trefferstopp.js';

test('Dauer: unter der Schwelle keine, darüber Grunddauer plus Schaden, gedeckelt; reduziert halb', () => {
  assert.equal(stoppDauer(SCHADEN_AB - 1), 0, 'Ertrinken, Splitter (6), Hagelkorn: kein Stopp');
  assert.equal(stoppDauer(20), GRUND_MS + 20);
  assert.equal(stoppDauer(500), MAX_MS);
  assert.equal(stoppDauer(40, { reduziert: true }), Math.round((GRUND_MS + 40) / 2));
});

test('Ablauf: Stopp läuft bis zur Dauer, ein zweiter Treffer verlängert nicht über den längsten', () => {
  trefferstopp.zuruecksetzen();
  trefferstopp.ausloesen(40, 1000); // 100 ms
  assert.equal(trefferstopp.aktiv(1050), true);
  trefferstopp.ausloesen(20, 1020); // 80 ms → bis 1100, gleich wie vorher
  assert.equal(trefferstopp.aktiv(1099), true);
  assert.equal(trefferstopp.aktiv(1100), false);
});

test('Abschaltbar: aus löscht einen laufenden Stopp und nimmt keine neuen an', () => {
  trefferstopp.zuruecksetzen();
  trefferstopp.ausloesen(40, 0);
  trefferstopp.aus = true;
  assert.equal(trefferstopp.aktiv(10), false);
  trefferstopp.ausloesen(40, 20);
  assert.equal(trefferstopp.aktiv(30), false);
  trefferstopp.zuruecksetzen();
});
