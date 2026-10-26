/**
 * Tests der GPU-Materialmalerei (`gelaendeGpu.js`).
 *
 * Was hier prüfbar ist, wird hier geprüft: das Packen der Stoffkarte, die
 * Erkennung des Kontexts und die Shader-Quelle. Das Zeichnen selbst braucht
 * einen Browser und wird über `scripts/gelaende-optik.mjs` gemessen.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { packeStofffeld, erkenneWebGl2, STOFF_SHADER_GLSL, stoffFarben } from '../src/client/gelaendeGpu.js';
import { STOFFE } from '../src/shared/config/stoffe.js';

test('Das Stofffeld wird mit Überlagerung gepackt', () => {
  /*
   * Die Überlagerung (`karte.ueber`) trägt den Stoff, der durch Feuer oder
   * Erstarrung ENTSTANDEN ist — sie gewinnt gegen das Feld, genau wie in
   * `stoffAm`. Wer das hier falsch packt, malt den alten Stoff weiter.
   */
  const karte = {
    spalten: 3,
    zeilen: 2,
    feld: Uint8Array.from([0, 5, 5, 7, 0, 0]),
    ueber: Uint8Array.from([0, 0, 4, 0, 0, 0]),
  };
  const gepackt = packeStofffeld(karte);
  assert.equal(gepackt.spalten, 3);
  assert.equal(gepackt.zeilen, 2);
  assert.deepEqual([...gepackt.daten], [0, 5, 3, 7, 0, 0],
    'Zelle 2 muss den Stoff aus der Überlagerung tragen (4 - 1 = 3)');
});

test('Ohne Überlagerung bleibt das Feld, wie es ist', () => {
  const karte = { spalten: 2, zeilen: 2, feld: Uint8Array.from([1, 2, 3, 4]) };
  const gepackt = packeStofffeld(karte);
  assert.deepEqual([...gepackt.daten], [1, 2, 3, 4]);
});

test('Eine fehlende Stoffkarte wird verständlich abgelehnt', () => {
  assert.throws(() => packeStofffeld(null), /Stoffkarte/);
  assert.throws(() => packeStofffeld({ spalten: 0, zeilen: 0, feld: new Uint8Array(0) }), /Stoffkarte/);
});

test('Ohne DOM gibt es keinen WebGL2-Kontext — aber einen Grund', () => {
  /*
   * In Node gibt es kein `document`. Das ist kein Fehler, sondern der Regelfall
   * für Tests und Kopfbetrieb: Der Aufrufer soll den Grund melden können, statt
   * eine Ausnahme zu fangen.
   */
  const ergebnis = erkenneWebGl2({});
  assert.equal(ergebnis.kontext, null);
  assert.ok(ergebnis.grund.length > 0, 'ein Grund muss genannt werden');
  assert.match(ergebnis.grund, /document|Browser/);
});

test('Eine Leinwand ohne WebGL2 ergibt einen Grund statt einer Ausnahme', () => {
  const ergebnis = erkenneWebGl2({
    createElement: () => ({ getContext: () => null }),
  });
  assert.equal(ergebnis.kontext, null);
  assert.match(ergebnis.grund, /WebGL2/);
});

test('Eine werfende Leinwand wird abgefangen', () => {
  const ergebnis = erkenneWebGl2({
    createElement: () => { throw new Error('kein Canvas'); },
  });
  assert.equal(ergebnis.kontext, null);
  assert.match(ergebnis.grund, /kein Canvas|fehlgeschlagen/);
});

test('Der Shader enthält für jedes ausgebaute Material ein eigenes Schema', () => {
  /*
   * Acht Materialien bekommen eigenen Detail-Code (Entwurf §8.5). Der Test
   * hängt an den Markern im Quelltext: Wer ein Schema entfernt, ohne den
   * Entwurf zu ändern, soll hier stolpern.
   */
  for (const marke of ['erde', 'fels', 'sand', 'eis', 'basalt', 'kristall', 'holz', 'beton']) {
    assert.match(STOFF_SHADER_GLSL, new RegExp(`// schema:${marke}\\b`),
      `Schema ${marke} fehlt im Shader`);
  }
  // Der Domain-Warp und die Kontur sind Pflicht (Entwurf §8.2/§8.6).
  assert.match(STOFF_SHADER_GLSL, /verzerrung|warp/i);
  assert.match(STOFF_SHADER_GLSL, /kontur/i);
  // Und der Shader muss ein Fragment-Shader in GLSL ES 3.00 sein.
  assert.match(STOFF_SHADER_GLSL, /#version 300 es/);
});

test('Die Materialfarben stammen aus dem Katalog', () => {
  const farben = stoffFarben();
  assert.equal(farben.length, STOFFE.length * 3, 'je Stoff drei Kanäle');
  for (let id = 0; id < STOFFE.length; id += 1) {
    const st = STOFFE[id];
    if (!st) continue;
    assert.equal(farben[id * 3], st.farbe[0], `Rot von ${st.key}`);
    assert.equal(farben[id * 3 + 1], st.farbe[1], `Grün von ${st.key}`);
    assert.equal(farben[id * 3 + 2], st.farbe[2], `Blau von ${st.key}`);
  }
});
