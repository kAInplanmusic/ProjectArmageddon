/**
 * Feuer-Optik (`client/feuerOptik.js`): begrenzt, ohne Netz, aus Zellenlisten.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FeuerOptik, MAX_TEILCHEN, BUDGET_JE_BILD, faerbeZellen } from '../src/client/feuerOptik.js';

const karte = { spalten: 40 };

test('Flammen entstehen aus Zellenlisten, löschen und Asche entfernen sie', () => {
  const o = new FeuerOptik();
  o.setzeKarte(karte, 320, 160);
  o.schritt({ neu: [5, 6, 7], aus: [], asche: [] });
  assert.equal(o.brennt, 3);
  o.schritt({ neu: [], aus: [5], asche: [6] });
  assert.equal(o.brennt, 1);
});

test('Teilchen bleiben unter der Obergrenze, neue je Bild unter dem Budget', () => {
  const o = new FeuerOptik();
  o.setzeKarte(karte, 320, 160);
  o.schritt({ neu: Array.from({ length: 200 }, (_, i) => i), aus: [], asche: [] });
  o.ragnarok = true;
  let vorher = 0;
  for (let i = 0; i < 600; i += 1) {
    o.fortschreiben();
    assert.ok(o.teilchen <= MAX_TEILCHEN);
    if (i > 0) assert.ok(o.teilchen - vorher <= BUDGET_JE_BILD + 1, 'Zuwachs je Bild');
    vorher = o.teilchen;
  }
  assert.ok(o.teilchen > 20, 'es brennt sichtbar');
});

test('Reduzierte Bewegung: keine Teilchen, Zustand bleibt', () => {
  const o = new FeuerOptik();
  o.reduziert = true;
  o.setzeKarte(karte, 320, 160);
  o.schritt({ neu: [1, 2], aus: [], asche: [3] });
  o.ausbruch({ x: 10, y: 10, n: 20 });
  for (let i = 0; i < 30; i += 1) o.fortschreiben();
  assert.equal(o.teilchen, 0);
  assert.equal(o.brennt, 2);
});

test('Lava: ruhende Zellen kommen und gehen mit dem Ereignis', () => {
  const o = new FeuerOptik();
  o.setzeKarte(karte, 320, 160);
  o.lavaStand({ an: [10, 11], ab: [] });
  assert.equal(o.lava.size, 2);
  o.lavaStand({ an: [], ab: [10] });
  assert.equal(o.lava.size, 1);
  o.leere();
  assert.equal(o.lava.size, 0);
});

test('Zeichnen ohne Zustand und ohne Zeichenfläche wirft nicht', () => {
  const o = new FeuerOptik();
  o.zeichne(null);
  o.zeichne({ save() {}, restore() {} });
  faerbeZellen(null, [1], 40, 'red');
});
