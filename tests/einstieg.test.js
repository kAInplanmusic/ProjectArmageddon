/**
 * Einstieg (TODO 2.11, `client/einstieg.js`): vier Schritte, jeder endet mit der Handlung; Zündzeit ohne Zünderwaffe nach kurzer
 * Zeit; höchstens 60 s; Überspringen; danach merkt der Speicher es sich.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Einstieg, EinstiegAnzeige, HOECHSTDAUER_MS, SCHLUESSEL, SCHRITTE, ZUENDZEIT_ZEIGEN_MS, einstiegFaellig } from '../src/client/einstieg.js';

const b = (jetzt, extra = {}) => ({ jetzt, winkel: 0.8, waffe: 'pa_001', ...extra });

test('Schritte: Zielen, Feuern, Waffe, Zündzeit, jeder endet mit der Handlung', () => {
  const e = new Einstieg();
  e.beobachte(b(0));
  assert.equal(e.schritt.id, 'zielen');
  e.beobachte(b(100, { winkel: 0.85 }));
  assert.equal(e.schritt.id, 'zielen', 'zu kleine Winkeländerung');
  e.beobachte(b(200, { winkel: 1.0 }));
  assert.equal(e.schritt.id, 'feuern');
  e.beobachte(b(300, { winkel: 1.0, geschossen: true }));
  assert.equal(e.schritt.id, 'waffe');
  e.beobachte(b(400, { winkel: 1.0, waffe: 'pa_002' }));
  assert.equal(e.schritt.id, 'zuendzeit');
  e.beobachte(b(500, { winkel: 1.0, waffe: 'pa_002', zuenderwaffe: true }));
  assert.equal(e.aktiv, true, 'Zünderwaffe gewählt: wartet auf Z');
  e.beobachte(b(600, { winkel: 1.0, waffe: 'pa_002', zuenderwaffe: true, zuendzeitGestellt: true }));
  assert.equal(e.aktiv, false);
  assert.equal(SCHRITTE.length, 4);
});

test('Zündzeit ohne Zünderwaffe endet nach kurzer Zeit; die ganze Führung nach 60 s; Überspringen sofort', () => {
  const e = new Einstieg();
  e.beobachte(b(0));
  e.beobachte(b(1, { winkel: 1.2 }));
  e.beobachte(b(2, { winkel: 1.2, geschossen: true }));
  e.beobachte(b(3, { winkel: 1.2, waffe: 'pa_009' }));
  e.beobachte(b(3 + ZUENDZEIT_ZEIGEN_MS - 1, { winkel: 1.2, waffe: 'pa_009' }));
  assert.equal(e.aktiv, true);
  e.beobachte(b(3 + ZUENDZEIT_ZEIGEN_MS, { winkel: 1.2, waffe: 'pa_009' }));
  assert.equal(e.aktiv, false);
  const lang = new Einstieg();
  lang.beobachte(b(0));
  lang.beobachte(b(HOECHSTDAUER_MS));
  assert.equal(lang.aktiv, false, 'nach 60 s vorbei');
  const weg = new Einstieg();
  weg.ueberspringen();
  assert.equal(weg.aktiv, false);
});

test('Anzeige: zeigt Schritt und Zähler, merkt sich das Ende im Speicher', () => {
  const speicher = new Map();
  const lager = { getItem: k => speicher.get(k) ?? null, setItem: (k, v) => speicher.set(k, v) };
  const el = id => ({ id, hidden: true, textContent: '', dataset: {}, addEventListener: (t, f) => { el.klick = f; } });
  const felder = { einstieg: el('einstieg'), 'einstieg-text': el('t'), 'einstieg-schritt': el('s'), 'einstieg-ueberspringen': el('u') };
  const doc = { getElementById: id => felder[id] ?? null };
  assert.equal(einstiegFaellig(lager), true);
  const a = new EinstiegAnzeige({ doc, speicher: lager });
  assert.equal(felder.einstieg.hidden, false);
  assert.equal(felder['einstieg-schritt'].textContent, '1 / 4');
  assert.match(felder['einstieg-text'].textContent, /Zielen/);
  a.logik.ueberspringen();
  a.schritt(b(0));
  el.klick?.();
  assert.equal(felder.einstieg.hidden, true);
  assert.equal(speicher.get(SCHLUESSEL), '1');
  assert.equal(einstiegFaellig(lager), false, 'danach nie wieder');
});
