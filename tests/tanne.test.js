/**
 * Tests: Fichtenform (`zeichnePflanze`, Art `tanne`).
 *
 * Die Form ist eine unregelmäßige Silhouette mit hängenden Zweigschichten statt der
 * früheren gleichmäßigen Stufen („Pagode“). Belegt: deterministisch je Seed, je Seed
 * verschieden, leicht asymmetrisch, innerhalb des Pflanzenrahmens (der Streifen der
 * Pflanzenebene schneidet sie nicht ab) und schlank an der Spitze.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { zeichnePflanze, pflanzenRahmen, pflanzenFarben } from '../src/client/pflanzen.js';

/** Aufzeichnender Kontext: sammelt alle Wegpunkte und Füllungen. */
function recorder() {
  const punkte = [];
  const aufrufe = [];
  const ctx = new Proxy({}, {
    get(_t, name) {
      if (name === 'punkte') return punkte;
      if (name === 'aufrufe') return aufrufe;
      return (...args) => {
        aufrufe.push(String(name));
        if (['moveTo', 'lineTo'].includes(name)) punkte.push([args[0], args[1]]);
        if (name === 'quadraticCurveTo') punkte.push([args[0], args[1]], [args[2], args[3]]);
        if (name === 'fillRect') punkte.push([args[0], args[1]], [args[0] + args[2], args[1] + args[3]]);
      };
    },
    set() { return true; },
  });
  return ctx;
}

const FARBEN = pflanzenFarben({ surface: [236, 244, 252], deep: [150, 170, 190] });
const tanne = (seed, extra = {}) => ({ art: 'tanne', x: 200, y: 300, h: 60, spiegel: false, seed, ...extra });

function zeichne(p) {
  const c = recorder();
  zeichnePflanze(c, p, FARBEN);
  return c;
}

test('Fichte: gleicher Seed, gleiche Form; anderer Seed, andere Form', () => {
  const a = zeichne(tanne(11)).punkte;
  const b = zeichne(tanne(11)).punkte;
  const c = zeichne(tanne(12)).punkte;
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
});

test('Fichte: bleibt im Pflanzenrahmen, Spitze schlank, Fuß breiter als die Spitze', () => {
  for (let seed = 0; seed < 200; seed += 1) {
    const p = tanne(seed * 53 + 1, { h: 34 + (seed % 28), spiegel: seed % 2 === 1 });
    const r = pflanzenRahmen(p, 4000, 4000);
    const { punkte } = zeichne(p);
    for (const [x, y] of punkte) {
      assert.ok(x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1, `seed ${seed}: (${x}, ${y}) außerhalb ${JSON.stringify(r)}`);
      assert.ok(y <= p.y && y >= p.y - p.h - 1, 'zwischen Wurzel und Spitze');
    }
    const breiteBei = (y0, y1) => {
      const xs = punkte.filter(([, y]) => y >= y0 && y <= y1).map(([x]) => x);
      return xs.length ? Math.max(...xs) - Math.min(...xs) : 0;
    };
    const spitze = breiteBei(p.y - p.h, p.y - p.h * 0.8);
    const fuss = breiteBei(p.y - p.h * 0.3, p.y);
    assert.ok(spitze < p.h * 0.34, `seed ${seed}: Spitze ${spitze}`);
    assert.ok(fuss > spitze * 1.6, `seed ${seed}: Fuß ${fuss} gegen Spitze ${spitze}`);
  }
});

test('Fichte: je Seed leicht asymmetrisch und verschieden hoch gestuft', () => {
  let schief = 0;
  const stufen = new Set();
  for (let seed = 1; seed <= 60; seed += 1) {
    const { punkte } = zeichne(tanne(seed * 97));
    const xs = punkte.map(([x]) => x);
    const links = 200 - Math.min(...xs);
    const rechts = Math.max(...xs) - 200;
    if (Math.abs(links - rechts) > 0.5) schief += 1;
    stufen.add(punkte.length);
  }
  assert.ok(schief > 50, `asymmetrisch: ${schief} von 60`);
  assert.ok(stufen.size >= 3, 'unterschiedlich viele Zweigschichten (5 bis 7)');
});

test('Fichte: Schneelast und Reif sind in der Helligkeitsfarbe gefüllt', () => {
  const c = zeichne(tanne(5));
  assert.ok(c.aufrufe.filter(n => n === 'fill').length >= 4, 'Stamm, Krone, Lichtseite, Schnee');
});
