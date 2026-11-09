import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HDR_KETTE,
  HDR_FARBRAUM,
  waehleHdrPfad,
  liesDynamikBereich,
  pruefeCanvasFarbraum,
} from '../src/client/hdrPfad.js';

/**
 * A21: HDR ist ein optionaler Pfad mit SDR-Rückfall. Der Test hält die
 * wichtigste Regel fest: 4K, DPR oder Display-P3 allein ergeben kein HDR.
 */

const VOLL = Object.freeze({
  inhalt10Bit: true,
  uebertragung: 'pq',
  canvasErweitert: true,
  dynamikBereich: 'high',
  optIn: true,
});

test('Vollständige Kette und Opt-in ergeben den HDR-Pfad', () => {
  const r = waehleHdrPfad(VOLL);
  assert.equal(r.pfad, 'hdr-p3');
  assert.equal(r.farbraum, HDR_FARBRAUM);
  assert.equal(r.tonemapping, 'reinhard');
  assert.deepEqual(r.gruende, []);
  assert.deepEqual(Object.keys(r.kette), [...HDR_KETTE]);
  assert.ok(Object.values(r.kette).every(Boolean));
});

test('Jedes fehlende Glied fällt auf SDR zurück und nennt den Grund', () => {
  const faelle = [
    ['ohne Inhalt', { ...VOLL, inhalt10Bit: false }, 'inhalt'],
    ['ohne Übertragung', { ...VOLL, uebertragung: null }, 'uebertragung'],
    ['unbekannte Übertragung', { ...VOLL, uebertragung: 'srgb' }, 'uebertragung'],
    ['ohne Compositing', { ...VOLL, canvasErweitert: false }, 'compositing'],
    ['ohne HDR-Anzeige', { ...VOLL, dynamikBereich: 'standard' }, 'anzeige'],
  ];
  for (const [name, werte, glied] of faelle) {
    const r = waehleHdrPfad(werte);
    assert.equal(r.pfad, 'sdr', name);
    assert.equal(r.farbraum, 'srgb', name);
    assert.ok(r.gruende.some(g => g.includes(glied)), `${name}: Grund fehlt (${r.gruende})`);
  }
});

test('Ohne Opt-in kein HDR, auch bei fähigem Gerät', () => {
  const r = waehleHdrPfad({ ...VOLL, optIn: false });
  assert.equal(r.pfad, 'sdr');
  assert.match(r.gruende.join(' '), /Opt-in/);
});

test('P3-Farbraum und 4K/DPR allein sind kein HDR', () => {
  // Bewusst nur die Fakten, die ein 4K-Display mit P3 liefern würde.
  const p3 = waehleHdrPfad({ canvasErweitert: true, dynamikBereich: 'standard' });
  assert.equal(p3.pfad, 'sdr');
  assert.equal(p3.farbraum, 'srgb');
  assert.match(p3.gruende.join(' '), /anzeige/);
});

test('HLG ist zulässig, Großschreibung egal', () => {
  assert.equal(waehleHdrPfad({ ...VOLL, uebertragung: 'HLG' }).pfad, 'hdr-p3');
});

test('Anzeige-Abfrage: Fehler und Ausnahmen gelten als Standard', () => {
  assert.equal(liesDynamikBereich(q => q === '(dynamic-range: high)'), 'high');
  assert.equal(liesDynamikBereich(() => false), 'standard');
  assert.equal(liesDynamikBereich(() => { throw new Error('gesperrt'); }), 'standard');
  assert.equal(liesDynamikBereich(null), 'standard');
});

test('Canvas-Farbraum wird zurückgelesen, nicht angenommen', () => {
  const p3Doc = {
    createElement: () => ({
      getContext: () => ({ getContextAttributes: () => ({ colorSpace: 'display-p3' }) }),
    }),
  };
  assert.deepEqual(pruefeCanvasFarbraum(p3Doc), { verfuegbar: true, farbraum: 'display-p3' });

  const sdrDoc = {
    createElement: () => ({
      // Browser, der die Option still ignoriert: liefert sRGB zurück.
      getContext: () => ({ getContextAttributes: () => ({ colorSpace: 'srgb' }) }),
    }),
  };
  assert.deepEqual(pruefeCanvasFarbraum(sdrDoc), { verfuegbar: false, farbraum: 'srgb' });

  const kaputt = { createElement: () => { throw new Error('kein Canvas'); } };
  assert.deepEqual(pruefeCanvasFarbraum(kaputt), { verfuegbar: false, farbraum: 'srgb' });
});
