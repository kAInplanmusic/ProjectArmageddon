import { test } from 'node:test';
import assert from 'node:assert/strict';
import { waehleStufe, messeGeraet, liesWahl, schreibeWahl, loeseGrafik, GRENZEN, GRAFIK_SCHLUESSEL } from '../src/client/grafikStufe.js';

const GUT = { webgl2: true, uniformVektoren: 1024, software: false, kerne: 8, speicherGB: 8 };

test('Auto: gutes Gerät bekommt Ultra, mit Grund', () => {
  const r = waehleStufe('auto', GUT);
  assert.equal(r.stufe, 'ultra');
  assert.ok(r.grund.length > 0);
});

test('Auto: jede Schwäche begrenzt auf Lite und nennt den Grund', () => {
  assert.match(waehleStufe('auto', { ...GUT, webgl2: false }).grund, /WebGL2/);
  assert.match(waehleStufe('auto', { ...GUT, software: true }).grund, /Software/);
  assert.match(waehleStufe('auto', { ...GUT, uniformVektoren: 64 }).grund, /Shader-Speicher/);
  assert.match(waehleStufe('auto', { ...GUT, kerne: 2 }).grund, /Rechenkerne/);
  assert.match(waehleStufe('auto', { ...GUT, speicherGB: 2 }).grund, /Arbeitsspeicher/);
  for (const m of [{ ...GUT, webgl2: false }, { ...GUT, software: true }, { ...GUT, uniformVektoren: 64 }, { ...GUT, kerne: 2 }, { ...GUT, speicherGB: 2 }]) assert.equal(waehleStufe('auto', m).stufe, 'lite');
});

test('Unbekannte Messwerte sperren Ultra nicht (null = unbekannt)', () => {
  assert.equal(waehleStufe('auto', { webgl2: true, uniformVektoren: null, software: false, kerne: null, speicherGB: null }).stufe, 'ultra');
});

test('Ultra gewählt, aber nicht möglich: Lite mit Grund; Lite gewählt bleibt Lite', () => {
  const r = waehleStufe('ultra', { ...GUT, webgl2: false });
  assert.equal(r.stufe, 'lite');
  assert.match(r.grund, /Ultra nicht möglich/);
  assert.equal(waehleStufe('ultra', GUT).stufe, 'ultra');
  assert.equal(waehleStufe('lite', GUT).stufe, 'lite');
});

test('Grenzen: Lite ist strenger als Ultra, Fläche bleibt unter der iOS-Canvas-Grenze', () => {
  assert.ok(GRENZEN.lite.gpuStoffe < GRENZEN.ultra.gpuStoffe);
  assert.ok(GRENZEN.lite.partikelDichte < GRENZEN.ultra.partikelDichte);
  assert.equal(GRENZEN.lite.gelaendeGpu, false);
  assert.equal(GRENZEN.ultra.gelaendeGpu, true);
  assert.ok(GRENZEN.ultra.flaechenBudgetMio < 16.7);
});

test('Messung ohne Browser wirft nicht und meldet kein WebGL2', () => {
  const m = messeGeraet({});
  assert.equal(m.webgl2, false);
  assert.equal(m.software, false);
});

test('Messung liest Uniform-Grenze und erkennt Software-Rasterung', () => {
  const gl = (renderer) => ({
    MAX_FRAGMENT_UNIFORM_VECTORS: 37,
    getExtension: () => ({ UNMASKED_RENDERER_WEBGL: 7 }),
    getParameter: (p) => (p === 7 ? renderer : 224),
  });
  const win = (renderer) => ({ document: { createElement: () => ({ getContext: () => gl(renderer) }) }, navigator: { hardwareConcurrency: 4, deviceMemory: 4 } });
  assert.equal(messeGeraet(win('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device)')).software, true);
  const echt = messeGeraet(win('Apple GPU'));
  assert.equal(echt.software, false);
  assert.equal(echt.webgl2, true);
  assert.equal(echt.uniformVektoren, 224);
  assert.equal(echt.kerne, 4);
});

test('Wahl wird gespeichert und gelesen; Unsinn und fehlender Speicher fallen auf auto', () => {
  const speicher = new Map();
  const win = { localStorage: { getItem: (k) => speicher.get(k) ?? null, setItem: (k, v) => speicher.set(k, v) } };
  assert.equal(liesWahl(win), 'auto');
  assert.equal(schreibeWahl('lite', win), true);
  assert.equal(liesWahl(win), 'lite');
  assert.equal(schreibeWahl('mega', win), false);
  speicher.set(GRAFIK_SCHLUESSEL, 'unsinn');
  assert.equal(liesWahl(win), 'auto');
  assert.equal(liesWahl({}), 'auto');
  assert.equal(liesWahl({ localStorage: { getItem() { throw new Error('gesperrt'); } } }), 'auto');
});

test('loeseGrafik liefert Wahl, Stufe, Grund und Grenzen zusammen', () => {
  const g = loeseGrafik({ win: {}, wahl: 'auto', messung: GUT });
  assert.equal(g.stufe, 'ultra');
  assert.equal(g.grenzen, GRENZEN.ultra);
  assert.equal(g.wahl, 'auto');
});
