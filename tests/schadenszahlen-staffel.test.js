/**
 * Gestaffelte Schadenszahlen (TODO 2.9, `client/schadenszahlen.js`): Trifft eine Figur kurz nacheinander mehrmals, stapelt sich
 * die neue Zahl über den frischen derselben Figur; große Treffer werden größer, und jede Zahl springt kurz auf (nicht bei
 * Bewegungsreduktion).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { ergaenzeZahlen, schreiteZahlenFort, zahlFaktor, STAFFEL_ABSTAND, findeZahlen } from '../src/client/schadenszahlen.js';

test('Stapel: zwei Treffer kurz nacheinander an derselben Figur stehen übereinander, an einer anderen nicht', () => {
  let liste = ergaenzeZahlen([], [{ x: 100, y: 50, text: '-30', art: 'schaden', id: 1, wert: 30 }]);
  for (let i = 0; i < 10; i += 1) liste = schreiteZahlenFort(liste, true);
  liste = ergaenzeZahlen(liste, [{ x: 100, y: 50, text: '-12', art: 'schaden', id: 1, wert: 12 }, { x: 300, y: 50, text: '-8', art: 'schaden', id: 2, wert: 8 }]);
  const zweite = liste.find(z => z.text === '-12');
  const andere = liste.find(z => z.text === '-8');
  assert.equal(zweite.y, 50 - STAFFEL_ABSTAND, 'über der frischen Zahl derselben Figur');
  assert.equal(andere.y, 50, 'andere Figur: kein Versatz nach oben');
});

test('Stapel: eine alte (verblassende) Zahl schiebt nicht mehr', () => {
  let liste = ergaenzeZahlen([], [{ x: 0, y: 50, text: '-30', art: 'schaden', id: 1, wert: 30 }]);
  for (let i = 0; i < 40; i += 1) liste = schreiteZahlenFort(liste, true); // Leben unter 0,55
  liste = ergaenzeZahlen(liste, [{ x: 0, y: 50, text: '-5', art: 'schaden', id: 1, wert: 5 }]);
  assert.equal(liste.at(-1).y, 50);
});

test('Größe: großer Schaden größer (gedeckelt), Aufsprung nur zu Beginn und nicht bei Bewegungsreduktion', () => {
  const klein = { wert: 10, life: 0.5 };
  const gross = { wert: 120, life: 0.5 };
  const riesig = { wert: 999, life: 0.5 };
  assert.ok(zahlFaktor(gross) > zahlFaktor(klein));
  assert.equal(zahlFaktor(riesig), 1.5, 'höchstens +50 %');
  assert.ok(zahlFaktor({ wert: 10, life: 1 }) > zahlFaktor(klein), 'springt beim Erscheinen auf');
  assert.equal(zahlFaktor({ wert: 10, life: 1 }, true), zahlFaktor(klein, true), 'reduziert: kein Aufsprung');
  assert.equal(zahlFaktor({ life: 0.5 }), 1, 'Heilung und Schild ohne Wert: normale Größe');
});

test('findeZahlen trägt den Schaden als Wert und die Figur als Kennung', () => {
  const vorher = findeZahlen(new Map(), [{ entityId: 7, health: 100, maxHealth: 100, x: 1, y: 1 }]);
  const nachher = findeZahlen(vorher.zustand, [{ entityId: 7, health: 60, maxHealth: 100, x: 1, y: 1 }]);
  assert.deepEqual([nachher.neu[0].wert, nachher.neu[0].id], [40, 7]);
});
