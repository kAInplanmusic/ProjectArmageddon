import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findeKanten, zeichneDetails } from '../src/client/gelaendeDetails.js';

const B = 600;
const H = 400;
const SAUM = { hell: [150, 200, 80], mittel: [90, 140, 50], tief: [40, 80, 30] };
const PALETTE = { surface: [96, 140, 60], deep: [60, 50, 40] };

/** Boden ab y=250 mit einem Überhang (Platte y 100–130, x 200–400). */
function karte() {
  const m = new Uint8Array(B * H);
  for (let y = 250; y < H; y += 1) for (let x = 0; x < B; x += 1) m[y * B + x] = 1;
  for (let y = 100; y < 130; y += 1) for (let x = 200; x < 400; x += 1) m[y * B + x] = 1;
  return m;
}

function zaehlCtx() {
  const aufrufe = { ellipse: 0, fill: 0 };
  const noop = () => {};
  const ctx = new Proxy({}, {
    get: (o, k) => (k === 'ellipse' || k === 'fill' ? () => { aufrufe[k] += 1; } : o[k] ?? noop),
    set: (o, k, v) => { o[k] = v; return true; },
  });
  return { ctx, aufrufe };
}

test('Kanten: Oberkante des Bodens und der Platte, Unterkante der Platte', () => {
  const { oben, unten } = findeKanten(karte(), B, H);
  assert.ok(oben.some(k => k.y === 250));
  assert.ok(oben.some(k => k.y === 100 && k.x >= 200 && k.x < 400));
  assert.ok(unten.some(k => k.y === 129 && k.x >= 200 && k.x < 400));
  assert.ok(!unten.some(k => k.y === 250), 'der Boden hat unten den Kartenrand, keine Luft');
});

test('Details: deterministisch, nur mit Kanten, für jede Bodenart ohne Fehler', () => {
  const m = karte();
  for (const art of ['gras', 'schnee', 'sand', 'fels', 'asche']) {
    const a = zaehlCtx();
    const b = zaehlCtx();
    const na = zeichneDetails(a.ctx, m, B, H, art, SAUM, PALETTE, 5);
    const nb = zeichneDetails(b.ctx, m, B, H, art, SAUM, PALETTE, 5);
    assert.equal(na, nb, art);
    assert.ok(na > 0, art);
    assert.deepEqual(a.aufrufe, b.aufrufe, art);
  }
  const leer = zaehlCtx();
  assert.equal(zeichneDetails(leer.ctx, new Uint8Array(B * H), B, H, 'gras', SAUM, PALETTE, 5), 0);
});

test('Details: anderer Seed, andere Verteilung', () => {
  const m = karte();
  const a = zaehlCtx(); const b = zaehlCtx();
  zeichneDetails(a.ctx, m, B, H, 'gras', SAUM, PALETTE, 1);
  zeichneDetails(b.ctx, m, B, H, 'gras', SAUM, PALETTE, 2);
  assert.notDeepEqual(a.aufrufe, b.aufrufe);
});

test('Details: Aufbau auf voller Kartengröße bleibt schnell', () => {
  const Bg = 2560; const Hg = 1440;
  const m = new Uint8Array(Bg * Hg);
  for (let x = 0; x < Bg; x += 1) { const y0 = 800 + Math.round(60 * Math.sin(x / 90)); for (let y = y0; y < Hg; y += 1) m[y * Bg + x] = 1; }
  const t0 = performance.now();
  const { ctx } = zaehlCtx();
  zeichneDetails(ctx, m, Bg, Hg, 'gras', SAUM, PALETTE, 3);
  assert.ok(performance.now() - t0 < 400, `${Math.round(performance.now() - t0)} ms`);
});
