/**
 * Restmängel der Biome 15 bis 20 (2026-11-11), alles reine Client-Optik:
 * schwarze Kulissenbalken (15), unregelmäßige Facetten (16), Tempel-Zierfries (17), Seegras-Höhe (18),
 * Fantasywald-Deko (20), Spiegelsymmetrie gespiegelt gekachelter Stofftexturen.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gradeBiom, voronoiFacetten, zeichneSeegras, SEEGRAS_MAX } from '../src/client/biomGrading.js';
import { plaziereFantasyDeko, zeichneFantasyNebel, zeichneFeenlichter, FANTASYWALD_BIOM } from '../src/client/fantasywaldDeko.js';
import { plazierePflanzen, zeichnePflanze } from '../src/client/pflanzen.js';
import { NEUE_ARTEN } from '../src/client/pflanzenNeu.js';
import { texturProbe, SPIEGEL_MITTE } from '../src/client/stoffOptik.js';
import { variantenTabellen, VARIANTEN_MAX } from '../src/client/stoffVarianten.js';
import { TEXTUR_GROESSE } from '../src/client/stoffTexturen.js';

const HIER = path.dirname(fileURLToPath(import.meta.url));

// ------------------------------------------------------------------ 15: Kulissenbalken

/** Breite und Höhe aus dem WebP-Kopf (nur die verlustbehaftete Art `VP8 `, wie sie die Kulissen haben). */
function webpMasse(datei) {
  const p = fs.readFileSync(datei);
  assert.equal(p.toString('ascii', 8, 12), 'WEBP');
  assert.equal(p.toString('ascii', 12, 16), 'VP8 ', `${datei}: unerwartete WebP-Art`);
  return { b: p.readUInt16LE(26) & 0x3fff, h: p.readUInt16LE(28) & 0x3fff };
}

test('Kulissen 15 bis 20: die Querbilder mit schwarzen Balken sind zugeschnitten', () => {
  // Die Quellbilder (1536 x 672) hatten oben und unten 36 bis 80 px reines Schwarz; es erschien als schwarzer Streifen am
  // Kartenrand (Schlackeschmiede). Zugeschnitten auf den Bildinhalt (3 px Sicherheitsrand); die übrigen Querbilder haben keine Balken.
  const zugeschnitten = {
    'dimensionsriss_dunkel': 569, 'kristallwald_dunkel': 561, 'kristallwald_ragnarok': 594,
    'schlackeschmiede_dunkel': 506, 'schlackeschmiede_hell': 526, 'schlackeschmiede_hoehle': 574,
    'tempelstadt_ragnarok': 563, 'tiefsee_dunkel': 546, 'tiefsee_ragnarok': 529,
  };
  const ordner = path.join(HIER, '..', 'src', 'client', 'assets', 'backdrops-neu');
  const quer = fs.readdirSync(ordner).filter(f => f.endsWith('.webp') && !f.endsWith('_h.webp'));
  assert.equal(quer.length, 24);
  for (const f of quer) {
    const m = webpMasse(path.join(ordner, f));
    const name = f.replace('.webp', '');
    assert.equal(m.b, 1536, `${f}: Breite`);
    assert.equal(m.h, zugeschnitten[name] ?? 672, `${f}: Höhe (Zuschnitt der schwarzen Balken)`);
  }
});

// ------------------------------------------------------------------ 16: Facetten

test('Kristallarchipel: Facetten sind unregelmäßig (Voronoi), kein Raster', () => {
  const B = 600; const H = 400; const g = 46;
  const f = voronoiFacetten(7, B, H, g);
  // Kantenabstände entlang vieler Zeilen: bei einem Raster wären sie fast gleich, bei Voronoi streuen sie breit.
  const laeufe = [];
  for (let y = 10; y < H; y += 7) {
    let letzte = null;
    for (let x = 0; x < B; x += 1) {
      const e = f(x, y).kante > 0.5;
      if (e && (letzte === null || x - letzte > 4)) { if (letzte !== null) laeufe.push(x - letzte); letzte = x; }
    }
  }
  assert.ok(laeufe.length > 200, `Fugen gefunden: ${laeufe.length}`);
  const mittel = laeufe.reduce((s, v) => s + v, 0) / laeufe.length;
  const streu = Math.sqrt(laeufe.reduce((s, v) => s + (v - mittel) ** 2, 0) / laeufe.length) / mittel;
  assert.ok(mittel > 15 && mittel < 70, `mittlerer Fugenabstand ${mittel.toFixed(1)} px`);
  assert.ok(streu > 0.4, `Streuung der Fugenabstände ${streu.toFixed(2)} (Raster wäre < 0,2)`);
  // Viele verschiedene Zellhelligkeiten, deterministisch.
  const werte = new Set();
  for (let y = 0; y < H; y += 9) for (let x = 0; x < B; x += 9) werte.add(f(x, y).hell.toFixed(3));
  assert.ok(werte.size > 150, `Helligkeitswerte: ${werte.size}`);
  const f2 = voronoiFacetten(7, B, H, g);
  assert.equal(f2(123, 77).hell, f(123, 77).hell);
  assert.notEqual(voronoiFacetten(8, B, H, g)(123, 77).hell, f(123, 77).hell);
});

// ------------------------------------------------------------------ 17: Zierfries

test('Tempelstadt: Zierfriese in den meisten Bändern, 40 px hoch, goldenes Zickzack', () => {
  const B = 256; const H = 160 * 10;
  const bitmap = new Uint8Array(B * H).fill(1);
  const d = new Uint8ClampedArray(B * H * 4);
  for (let i = 0; i < B * H; i += 1) { d[i * 4] = 150; d[i * 4 + 1] = 120; d[i * 4 + 2] = 80; d[i * 4 + 3] = 255; }
  gradeBiom(d, bitmap, B, H, 'tempelstadt', 5);
  let baenderMitFries = 0; const hoehen = [];
  const zeilenRot = (y) => { let r = 0; for (let x = 0; x < B; x += 1) r += d[(y * B + x) * 4]; return r / B; };
  const mitte = Array.from({ length: H }, (_, y) => zeilenRot(y)).sort((a, b) => a - b)[H >> 1];
  for (let band = 0; band < 10; band += 1) {
    let gold = 0; const dunkel = [];
    for (let y = band * 160; y < band * 160 + 160; y += 1) {
      for (let x = 0; x < B; x += 1) {
        const o = (y * B + x) * 4;
        if (d[o] > 215 && d[o + 1] > 160 && d[o + 2] < 110) gold += 1;
      }
      if (zeilenRot(y) < mitte * 0.6) dunkel.push(y - band * 160); // Fugenzeile
    }
    if (gold > 300) { baenderMitFries += 1; hoehen.push(Math.max(...dunkel) - Math.min(...dunkel) + 1); }
  }
  assert.ok(baenderMitFries >= 6, `Bänder mit Fries: ${baenderMitFries} von 10 (vorher etwa 4 mit nur 25 px)`);
  assert.ok(hoehen.every(h => h === 40), `Friesehöhen (Fuge oben bis Fuge unten): ${hoehen.join(', ')}`);
});

// ------------------------------------------------------------------ 18: Seegras

test('Tiefsee: Seegras bleibt niedriger als die Figurenbox und liegt in der Gelände-Ebene (hinter den Figuren)', () => {
  const B = 600; const H = 300;
  const bitmap = new Uint8Array(B * H);
  for (let y = 150; y < H; y += 1) bitmap.fill(1, y * B, y * B + B);
  let minY = Infinity;
  const ctx = new Proxy({}, { get: (_, k) => {
    if (k === 'moveTo' || k === 'lineTo') return (x, y) => { minY = Math.min(minY, y); };
    if (k === 'quadraticCurveTo') return (cx, cy, x, y) => { minY = Math.min(minY, y); };
    if (k === 'arc') return (x, y, r) => { minY = Math.min(minY, y - r); };
    return () => {};
  }, set: () => true });
  const wedel = zeichneSeegras(ctx, bitmap, B, H, 9);
  assert.ok(wedel >= 10);
  assert.ok(150 - minY <= SEEGRAS_MAX + 3, `höchster Punkt ${150 - minY} px über der Kante (Grenze ${SEEGRAS_MAX} + Kopf)`);
  assert.ok(SEEGRAS_MAX <= 20, 'nicht höher als 2 x PLAYER_HALF_HEIGHT');
  // Reihenfolge im Renderer: Gelände vor Figuren.
  const quelle = fs.readFileSync(path.join(HIER, '..', 'src', 'client', 'renderer.js'), 'utf8');
  assert.ok(quelle.indexOf('this.ctx.drawImage(this.terrainLayer, 0, 0)') < quelle.indexOf('this.#drawEntities(state.entities'), 'Gelände wird vor den Figuren gezeichnet');
});

// ------------------------------------------------------------------ 20: Fantasywald

/** Minimaler Canvas-Ersatz, damit die Glüh- und Nebelsprites in Node entstehen. */
function mitDom(f) {
  const alt = globalThis.document;
  const ctx2d = () => new Proxy({}, { get: (_, k) => (k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {}), set: () => true });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: ctx2d }) };
  try { return f(); } finally { globalThis.document = alt; }
}
function aufzeichner() {
  const bilder = [];
  const ctx = new Proxy({}, { get: (_, k) => (k === 'drawImage' ? (b, x, y, w, h) => bilder.push([x, y, w, h]) : () => {}), set: () => true });
  return { ctx, bilder };
}
function flach(B = 1200, H = 500, y0 = 300) {
  const bitmap = new Uint8Array(B * H);
  for (let y = y0; y < H; y += 1) bitmap.fill(1, y * B, y * B + B);
  return { bitmap, B, H };
}

test('Fantasywald-Deko: Orte deterministisch, über dem Boden, Seed-abhängig', () => {
  const { bitmap, B, H } = flach();
  const a = plaziereFantasyDeko(bitmap, B, H, 3); const b = plaziereFantasyDeko(bitmap, B, H, 3);
  assert.deepEqual(a, b);
  assert.notDeepEqual(plaziereFantasyDeko(bitmap, B, H, 4), a);
  assert.ok(a.nebel.length >= 3 && a.lichter.length >= 8, `${a.nebel.length} Bänke, ${a.lichter.length} Lichter`);
  assert.ok(a.nebel.every(n => n.y < 300 && n.alpha > 0.2 && n.alpha < 0.6), 'Nebelbänke schweben über dem Boden');
  assert.ok(a.lichter.every(l => l.y < 300 && l.x > 0 && l.x < B), 'Feenlichter schweben über dem Boden');
  assert.equal(FANTASYWALD_BIOM, 'kristallwald');
});

test('Fantasywald-Deko: Reduced Motion hält alles still, Grafikstufe lässt Lichter weg', () => mitDom(() => {
  const { bitmap, B, H } = flach();
  const deko = plaziereFantasyDeko(bitmap, B, H, 3);
  const pos = (zeit, reduziert, dichte = 1) => { const r = aufzeichner(); const n = zeichneFeenlichter(r.ctx, deko, zeit, reduziert, dichte); return { n, bilder: r.bilder }; };
  const still1 = pos(1, true); const still2 = pos(40, true);
  assert.deepEqual(still1.bilder, still2.bilder, 'reduziert: gleiche Orte zu jeder Zeit');
  const bewegt1 = pos(1, false); const bewegt2 = pos(40, false);
  assert.notDeepEqual(bewegt1.bilder, bewegt2.bilder, 'animiert: Lichter schweben');
  assert.equal(still1.n, deko.lichter.length);
  assert.ok(pos(1, true, 0.5).n < still1.n && pos(1, true, 0.5).n > 0, 'Grafikstufe 0,5 lässt einen Teil weg');
  const nebel = (zeit, reduziert) => { const r = aufzeichner(); zeichneFantasyNebel(r.ctx, deko, zeit, reduziert); return r.bilder; };
  assert.deepEqual(nebel(1, true), nebel(90, true), 'Nebel steht bei Reduced Motion still');
  assert.notDeepEqual(nebel(1, false), nebel(90, false));
  assert.ok(nebel(1, true).length >= deko.nebel.length);
  assert.equal(zeichneFeenlichter(aufzeichner().ctx, null, 1, false), 0);
}));

test('Fantasywald: Riesenfarn und Leuchtpilz wachsen und lassen sich zeichnen; fremde Biome unverändert', () => {
  const { bitmap, B, H } = flach(6000, 500, 300);
  const liste = plazierePflanzen(bitmap, B, H, 5, FANTASYWALD_BIOM, 'gras');
  const arten = new Set(liste.map(p => p.art));
  assert.ok(arten.has('riesenfarn') && arten.has('leuchtpilz'), `Arten: ${[...arten].join(', ')}`);
  assert.ok(NEUE_ARTEN.riesenfarn[0] >= 50 && NEUE_ARTEN.leuchtpilz[0] >= 20);
  const befehle = { n: 0 };
  const ctx = new Proxy({}, { get: (_, k) => (k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => { befehle.n += 1; }), set: () => true });
  const farben = { blatt: '#0a0', dunkel: '#050', hell: '#4f4', stamm: '#640', kontur: '#000' };
  for (const art of ['riesenfarn', 'leuchtpilz']) {
    const vorher = befehle.n;
    zeichnePflanze(ctx, liste.find(p => p.art === art), farben, [70, 118, 76]);
    assert.ok(befehle.n - vorher > 10, `${art}: gezeichnet`);
  }
  // Andere Biome: nie die Fantasywald-Arten.
  const fremd = plazierePflanzen(bitmap, B, H, 5, 'forest', 'gras');
  assert.ok(fremd.every(p => p.art !== 'riesenfarn' && p.art !== 'leuchtpilz'));
});

// ------------------------------------------------------------------ Spiegelsymmetrie

test('Gespiegelte Stofftexturen: keine Symmetrie mehr an der Spiegelachse, stetig, im Wertebereich', () => {
  const n = TEXTUR_GROESSE;
  // Rauschtextur mit Gitterwerten (Zelle 6 px), damit Nachbarpixel verwandt sind.
  const tex = new Uint8ClampedArray(n * n * 4);
  const zelle = (i, j) => { let h = (Math.imul(i, 73856093) ^ Math.imul(j, 19349663)) >>> 0; h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0; return (h >>> 8) & 255; };
  for (let y = 0; y < n; y += 1) for (let x = 0; x < n; x += 1) { const v = zelle(x >> 3, y >> 3); const o = (y * n + x) * 4; tex[o] = v; tex[o + 1] = v; tex[o + 2] = v; tex[o + 3] = 255; }
  const { ganz, farbe } = variantenTabellen();
  const id = 9; const v = 0; // Variante 0: Lage 0, kein Versatz, Maßstab 256
  assert.equal(ganz[(id * VARIANTEN_MAX + v) * 4 + 3], 256);
  const p = (x, y) => texturProbe(tex, ganz, farbe, id, v, x, y, true)[0];
  // Vorher war p(512 + d, y) == p(511 - d, y) (Spiegelachse u = 511,5 ... 512). Jetzt: an denselben Punkten verschieden.
  let gleich = 0; let gesamt = 0;
  for (let d = 0; d < SPIEGEL_MITTE; d += 3) for (let y = 40; y < 440; y += 11) { gesamt += 1; if (Math.abs(p(512 + d, y) - p(511 - d, y)) < 1e-6) gleich += 1; }
  assert.ok(gleich / gesamt < 0.1, `symmetrische Proben: ${gleich} von ${gesamt}`);
  // Stetigkeit: Der mittlere Sprung zu Nachbarpixeln wächst nicht (im Bereich von 4 Achsen), Überblendung erzeugt keine Kanten.
  let sprungAlt = 0; let sprungNeu = 0; let k = 0;
  const roh = (x, y) => { const u = x & (2 * n - 1); const w = y & (2 * n - 1); const uu = u >= n ? 2 * n - 1 - u : u; const ww = w >= n ? 2 * n - 1 - w : w; return tex[(ww * n + uu) * 4]; };
  for (let y = 5; y < 1000; y += 13) for (let x = 5; x < 1000; x += 1) { sprungNeu += Math.abs(p(x + 1, y) - p(x, y)); sprungAlt += Math.abs(roh(x + 1, y) - roh(x, y)); k += 1; }
  assert.ok(sprungNeu / k < sprungAlt / k * 1.25, `mittlerer Nachbarsprung neu ${(sprungNeu / k).toFixed(2)} gegen alt ${(sprungAlt / k).toFixed(2)}`);
  // Werte bleiben im Bereich der Textur; ohne Spiegel (nahtlos) bleibt der Pfad unverändert.
  for (let x = 0; x < 1100; x += 7) { const r = p(x, x * 3); assert.ok(r >= 0 && r <= 255 * 1.2); }
  assert.deepEqual(texturProbe(tex, ganz, farbe, id, v, 100, 200, false), texturProbe(tex, ganz, farbe, id, v, 100 + n, 200 + n, false));
});
