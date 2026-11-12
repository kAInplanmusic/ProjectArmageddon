// FIGUREN-B (B4): Tod-Epilog Stufe 1 — Spruch je Fraktion, höchstens 1,2 s, überspringbar, reine Darstellung.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FACTIONS } from '../src/shared/config/factions.js';
import { SPRUECHE, spruchFuer, EPILOG_DAUER, starteEpilog, beendeEpilog, weltZuFenster } from '../src/client/todEpilog.js';

test('Jede Fraktion hat einen eigenen Spruch, unbekannte bekommen einen neutralen', () => {
  const texte = new Set();
  for (const f of FACTIONS) {
    assert.ok(SPRUECHE[f.id], `${f.id}: Spruch fehlt`);
    assert.ok(SPRUECHE[f.id].length <= 40, `${f.id}: Spruch zu lang für die Blase`);
    texte.add(SPRUECHE[f.id]);
  }
  assert.equal(texte.size, FACTIONS.length, 'keine doppelten Sprüche');
  assert.ok(spruchFuer('gibt-es-nicht').length > 0);
  assert.equal(Object.keys(SPRUECHE).length, FACTIONS.length, 'keine Sprüche für unbekannte Fraktionen');
});

test('Die Dauer ist auf 1,2 s begrenzt (Vorgabe des Auftraggebers)', () => {
  assert.equal(EPILOG_DAUER, 1.2);
});

test('weltZuFenster rechnet Kamera, Leinwandlage und CSS-Faktor ein', () => {
  const kamera = { transformation: () => ({ skalierung: 2, versatzX: -100, versatzY: 40 }) };
  const leinwand = { getBoundingClientRect: () => ({ left: 10, top: 20 }) };
  const p = weltZuFenster(kamera, leinwand, 300, 200, 0.5);
  assert.deepEqual(p, { x: 10 + (300 * 2 - 100) * 0.5, y: 20 + (200 * 2 + 40) * 0.5 });
  assert.equal(weltZuFenster(null, leinwand, 1, 1), null);
});

test('Epilog: legt ein Overlay an, Eingabe überspringt es sofort, Ablauf entfernt es; Fehler brechen das Spiel nicht', async () => {
  const kinder = [];
  const ereignisse = new Map();
  const knoten = () => ({
    style: {}, dataset: {}, children: [], offsetWidth: 100, offsetHeight: 40,
    setAttribute() {}, append(...k) { this.children.push(...k); }, remove() { const i = kinder.indexOf(this); if (i >= 0) kinder.splice(i, 1); },
    set textContent(t) { this._t = t; }, get textContent() { return this._t; }, set innerHTML(h) { this._h = h; },
  });
  const alt = { document: globalThis.document, addEventListener: globalThis.addEventListener, removeEventListener: globalThis.removeEventListener, raf: globalThis.requestAnimationFrame, caf: globalThis.cancelAnimationFrame };
  globalThis.document = { createElement: knoten, body: { append(k) { kinder.push(k); } } };
  globalThis.addEventListener = (n, f) => ereignisse.set(n, f);
  globalThis.removeEventListener = (n) => ereignisse.delete(n);
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  try {
    assert.equal(starteEpilog({ fraktionId: 'pixel', ort: () => ({ x: 50, y: 80 }) }), true);
    assert.equal(kinder.length, 1);
    assert.equal(kinder[0].children[0].textContent, SPRUECHE.pixel);
    assert.ok(ereignisse.has('keydown') && ereignisse.has('pointerdown'), 'Taste und Klick überspringen');
    ereignisse.get('keydown')();
    assert.equal(kinder.length, 0, 'übersprungen');
    assert.equal(ereignisse.size, 0, 'Lauscher entfernt');
    // zweiter Epilog ersetzt den ersten
    starteEpilog({ fraktionId: 'xeno', ort: () => null });
    starteEpilog({ fraktionId: 'undead', ort: () => null });
    assert.equal(kinder.length, 1);
    await new Promise(r => setTimeout(r, EPILOG_DAUER * 1000 + 80));
    assert.equal(kinder.length, 0, 'nach 1,2 s weg');
    assert.equal(starteEpilog({ fraktionId: 'xeno' }), false, 'ohne Ortsfunktion kein Epilog');
  } finally {
    beendeEpilog();
    for (const [k, v] of Object.entries({ document: alt.document, addEventListener: alt.addEventListener, removeEventListener: alt.removeEventListener, requestAnimationFrame: alt.raf, cancelAnimationFrame: alt.caf })) {
      if (v === undefined) delete globalThis[k]; else globalThis[k] = v;
    }
  }
});
