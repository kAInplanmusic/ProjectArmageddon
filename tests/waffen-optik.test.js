/**
 * Waffenoptik (Audit 2026-10-30, N-07, N-08, N-09/N-10, N-11, N-13): Mündungsfeuer je Waffe,
 * Einschlag je Schadensart, Strahl je Art, Schweif je Geschossfamilie, und die Zuordnung der
 * Geschossarten (`GESCHOSS_ART` in `scripts/waffen-sprites.py`) ohne Doppelbelegung.
 *
 * Reine Darstellung: geprüft wird ohne Browser (Canvas als Attrappe). Die Bildfolgen selbst
 * (Frames unterscheiden sich, nichts angeschnitten) prüft `tests/e2e/effekt-sheets.spec.mjs`
 * im Browser, weil Node kein WebP lesen kann.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { WEAPONS } from '../src/shared/config/weapons.js';
import { DAMAGE_TYPE_IDS } from '../src/engine/damageTypes.js';
import {
  ART_FAMILIE, FAMILIEN, FAMILIEN_FARBEN, MUENDUNG_ZEILE, STRAHL_ARTEN, SCHWEIF_ARTEN,
  familieVonArt, familieVonWaffe, muendungsStil, strahlArt, schweifArt,
} from '../src/client/waffenOptik.js';
import { parameterFuerWaffe } from '../src/client/waffenAnimation.js';
import { SheetEffekte, SHEETS, RINGE_ZEILE, frameRechteck } from '../src/client/effektSheets.js';
import { ArtEinschlaege, ART_FAMILIEN, ART_DAUER, MAX_ART_EINSCHLAEGE } from '../src/client/einschlagArten.js';
import { zeichneStrahl, zeichneFamilienSchweif, zeichneMuendungsfeuer } from '../src/client/waffenOptikZeichnen.js';
import { erzeugeStrahl } from '../src/client/effects.js';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const WURZEL = path.join(HIER, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(WURZEL, 'src/client/assets/weapon-sprites/manifest.json'), 'utf8'));

/** Canvas-Attrappe, die jeden Zeichenaufruf mit Namen mitschreibt. */
function attrappe() {
  const aufrufe = [];
  const ctx = new Proxy({ aufrufe }, {
    get(ziel, name) {
      if (name in ziel) return ziel[name];
      if (name === 'createLinearGradient' || name === 'createRadialGradient') return () => ({ addColorStop() {} });
      return (...a) => { aufrufe.push([name, ...a]); };
    },
    set(ziel, name, wert) { ziel[name] = wert; if (typeof wert !== 'object') aufrufe.push(['=', name, wert]); return true; },
  });
  return ctx;
}

function sheetEffekte() {
  const e = new SheetEffekte({ bildBauer: () => ({ naturalWidth: 2048, naturalHeight: 2048 }) });
  e.setzeUrls(Object.fromEntries(Object.keys(SHEETS).map(n => [n, n])));
  e.vorladen();
  for (const eintrag of e.bilder.values()) eintrag.bereit = true;
  return e;
}

test('N-13: GESCHOSS_ART im Sprite-Skript belegt jede Waffe höchstens einmal und stimmt mit dem Manifest überein', () => {
  const quelle = fs.readFileSync(path.join(WURZEL, 'scripts/waffen-sprites.py'), 'utf8');
  const block = quelle.slice(quelle.indexOf('GESCHOSS_ART = {'), quelle.indexOf('\n}\n', quelle.indexOf('GESCHOSS_ART = {')));
  assert.ok(block.length > 100, 'GESCHOSS_ART nicht gefunden');
  const zaehler = new Map();
  const zuordnung = new Map();
  // Bereiche wie {f"pa_{i:03d}": "ding" for i in range(1, 22)}
  for (const m of block.matchAll(/\{f"pa_\{i:03d\}": "(\w+)" for i in range\((\d+), (\d+)\)\}/g)) {
    for (let i = Number(m[2]); i < Number(m[3]); i += 1) {
      const id = `pa_${String(i).padStart(3, '0')}`;
      zaehler.set(id, (zaehler.get(id) ?? 0) + 1);
      zuordnung.set(id, m[1]);
    }
  }
  for (const m of block.matchAll(/"(pa_\d{3})": "(\w+)"/g)) {
    zaehler.set(m[1], (zaehler.get(m[1]) ?? 0) + 1);
    zuordnung.set(m[1], m[2]);
  }
  const doppelt = [...zaehler].filter(([, n]) => n > 1).map(([id]) => id);
  assert.deepEqual(doppelt, [], `doppelt belegt (Python überschreibt still): ${doppelt.join(', ')}`);
  assert.ok(zuordnung.size >= 90, `nur ${zuordnung.size} Geschossarten gelesen`);
  const korrekturen = JSON.parse(fs.readFileSync(path.join(WURZEL, 'scripts/waffen-sprites-korrekturen.json'), 'utf8'));
  for (const w of WEAPONS) {
    const p = manifest.waffen[w.id]?.projectile;
    if (!p) continue;
    const korr = korrekturen[w.id] ?? korrekturen.waffen?.[w.id] ?? {};
    const erwartet = korr.geschoss ?? zuordnung.get(w.id);
    if (erwartet === undefined) continue;
    // Kachel-Waffen werfen statt ihrer selbst einen Zauber-Orb.
    assert.ok(p.art === erwartet || (erwartet === 'ding' && p.art === 'zauber'), `${w.id}: Manifest ${p.art}, Skript ${erwartet}`);
  }
});

test('Jede Schadensart hat eine Familie mit Farben; unbekannte und physische Arten sind explosiv', () => {
  for (const art of DAMAGE_TYPE_IDS) {
    const f = familieVonArt(art);
    assert.ok(FAMILIEN.includes(f), `${art} → ${f}`);
    for (const t of ['kern', 'mitte', 'rand']) assert.equal(FAMILIEN_FARBEN[f][t].length, 3);
  }
  for (const f of Object.values(ART_FAMILIE)) assert.ok(FAMILIEN.includes(f));
  assert.equal(familieVonArt('physical'), 'explosiv');
  assert.equal(familieVonArt('gibtsnicht'), 'explosiv');
  assert.equal(familieVonArt(null), 'explosiv');
  assert.equal(familieVonArt(DAMAGE_TYPE_IDS.indexOf('ice')), 'eis', 'Kennung aus dem Ereignis');
  assert.equal(familieVonWaffe({ id: 'pa_099', damageType: 'time' }), 'eis', 'Frostsanduhr sieht nach Eis aus');
});

test('N-07: Mündungsfeuer hängt an der Waffe, nicht an der Figur', () => {
  const zeilen = new Set();
  const formen = new Set();
  let keins = 0;
  for (const w of WEAPONS) {
    const stil = muendungsStil(w, parameterFuerWaffe(w, null));
    if (stil === null) { keins += 1; continue; }
    if (stil.quelle === 'sheet') {
      assert.ok(Object.values(MUENDUNG_ZEILE).includes(stil.zeile), `${w.id}: Zeile ${stil.zeile}`);
      assert.ok(stil.skala >= 0.75 && stil.skala <= 1.7);
      zeilen.add(stil.zeile);
    } else {
      assert.equal(stil.quelle, 'form');
      assert.ok(['stern', 'ring', 'funke'].includes(stil.form), `${w.id}: ${stil.form}`);
      assert.match(stil.farbe, /^rgba\(/);
      formen.add(stil.form);
    }
    // Gleiche Waffe, gleiches Feuer: kein Zufall, keine Figur im Spiel.
    assert.deepEqual(muendungsStil(w, parameterFuerWaffe(w, null)), stil);
  }
  assert.ok(zeilen.size >= 4, `nur ${zeilen.size} Mündungsarten genutzt`);
  assert.equal(formen.size, 3);
  assert.ok(keins >= 20, `Nahkampf und Bögen ohne Mündungsfeuer (${keins})`);
  const nahkampf = WEAPONS.find(w => w.category === 'melee');
  assert.equal(muendungsStil(nahkampf, parameterFuerWaffe(nahkampf, null)), null);
  const schrot = WEAPONS.find(w => w.id === 'pa_054');
  assert.equal(muendungsStil(schrot, parameterFuerWaffe(schrot, null)).zeile, MUENDUNG_ZEILE.schrot);
  const pistole = muendungsStil(WEAPONS.find(w => w.id === 'pa_057'), { blitzForm: 'kegel', blitzGroesse: 26 });
  const schwer = muendungsStil(WEAPONS.find(w => w.id === 'pa_043'), { blitzForm: 'kegel', blitzGroesse: 26 });
  assert.notEqual(pistole.zeile, schwer.zeile);
  assert.ok(muendungsStil({ id: 'x', category: 'ranged' }, { blitzForm: 'kegel', blitzGroesse: 28 }).skala > muendungsStil({ id: 'x', category: 'ranged' }, { blitzForm: 'kegel', blitzGroesse: 14 }).skala, 'Größe folgt blitzGroesse');
  assert.equal(muendungsStil(null, null).zeile, MUENDUNG_ZEILE.pistole, 'ohne Katalogwaffe der kleine Blitz');
});

test('N-07: zeichneMuendungsfeuer wählt Bildfolge, Form, Kegel oder nichts', () => {
  const sheets = sheetEffekte();
  const o = { x: 10, y: 20, winkel: 0.3, leben: 0.8, skala: 1, farbe: '#fff', spriteWaffe: false, feuer: { alpha: 1, length: 11, halfWidth: 4, coreRadius: 3 } };
  const ctx = attrappe();
  assert.equal(zeichneMuendungsfeuer(ctx, sheets, { ...o, waffe: WEAPONS.find(w => w.category === 'melee') }), 'keins');
  assert.equal(ctx.aufrufe.length, 0);
  assert.equal(zeichneMuendungsfeuer(ctx, sheets, { ...o, waffe: WEAPONS.find(w => w.id === 'pa_054') }), 'sheet');
  const zeile = ctx.aufrufe.find(a => a[0] === 'drawImage')[3];
  assert.equal(zeile, MUENDUNG_ZEILE.schrot * (2048 / SHEETS.muendung.zeilen), 'Zeile der Schrotflinte');
  const zauber = WEAPONS.find(w => w.category === 'magic' && w.damage > 0 && parameterFuerWaffe(w, null).blitzForm === 'ring');
  assert.equal(zeichneMuendungsfeuer(attrappe(), sheets, { ...o, waffe: zauber }), 'form');
  assert.equal(zeichneMuendungsfeuer(attrappe(), sheets, { ...o, waffe: zauber, spriteWaffe: true }), 'keins', 'das Sprite bringt seinen Blitz mit');
  sheets.reduziert = true;
  assert.equal(zeichneMuendungsfeuer(attrappe(), sheets, { ...o, waffe: WEAPONS.find(w => w.id === 'pa_054') }), 'kegel', 'reduzierte Bewegung: ruhiger Kegel statt Bildfolge');
});

test('N-08: Einschlag nach Schadensart, Explosion bleibt für Sprengstoff', () => {
  const arten = (art, radius = 40) => {
    const e = sheetEffekte();
    e.einschlag(100, 100, radius, art);
    return { sheets: e.liste.map(q => `${q.art}${q.art === 'ringe' ? `:${q.zeile}` : ''}`), teilchen: e.arten.liste.map(q => q.familie) };
  };
  assert.deepEqual(arten(null).sheets, ['explosion', 'glut', 'rauchring']);
  assert.deepEqual(arten('explosive').teilchen, []);
  assert.deepEqual(arten('ice'), { sheets: [`ringe:${RINGE_ZEILE.blau}`, 'rauchring'], teilchen: ['eis'] });
  assert.deepEqual(arten('water'), { sheets: [`ringe:${RINGE_ZEILE.blau}`], teilchen: ['wasser'] });
  assert.deepEqual(arten('poison'), { sheets: ['wirbel'], teilchen: ['gift'] });
  assert.deepEqual(arten('arcane'), { sheets: [`ringe:${RINGE_ZEILE.violett}`, 'funken'], teilchen: ['magie'] });
  assert.deepEqual(arten('holy'), { sheets: [`ringe:${RINGE_ZEILE.gelb}`, 'funken'], teilchen: ['heilig'] });
  assert.deepEqual(arten('electric'), { sheets: ['funken', 'flamme'], teilchen: ['blitz'] });
  assert.equal(arten('fire', 14).sheets[0], 'feuerball');
  assert.ok(arten('fire', 14).sheets.includes('glut'), 'Feuer glüht auch klein nach');
  assert.deepEqual(arten('fire', 14).teilchen, ['feuer']);
  assert.ok(arten('energy').sheets.includes('funken'));
  // Die Familien unterscheiden sich paarweise im Bild.
  const bilder = ['explosive', 'ice', 'water', 'poison', 'arcane', 'holy', 'electric', 'wind', 'fire', 'energy'].map(a => JSON.stringify(arten(a)));
  assert.equal(new Set(bilder).size, bilder.length);
  // Ohne Bilder bleiben die Teilchen (sie brauchen keins), bei reduzierter Bewegung nichts.
  const ohne = new SheetEffekte({ bildBauer: () => null });
  assert.equal(ohne.einschlag(1, 1, 30, 'ice'), true);
  assert.equal(ohne.arten.liste.length, 1);
  const ruhig = sheetEffekte();
  ruhig.reduziert = true;
  assert.equal(ruhig.einschlag(1, 1, 30, 'ice'), false);
  assert.equal(ruhig.liste.length + ruhig.arten.liste.length, 0);
});

test('N-08: Ringe wachsen über die Folge, die Zeile wählt die Farbe', () => {
  const r0 = frameRechteck('ringe', 0, 504, 432, RINGE_ZEILE.blau);
  assert.deepEqual(r0, { sx: 0, sy: RINGE_ZEILE.blau * 72, sw: 72, sh: 72 });
  assert.equal(frameRechteck('ringe', 6, 504, 432, 99).sy, 5 * 72, 'Zeile begrenzt');
  const e = sheetEffekte();
  e.starte('ringe', 100, 100, 80, { zeile: 2 });
  const groessen = [];
  for (let i = 0; i < SHEETS.ringe.frames.length * SHEETS.ringe.takt; i += SHEETS.ringe.takt) {
    const ctx = attrappe();
    e.zeichne(ctx);
    groessen.push(ctx.aufrufe.find(a => a[0] === 'drawImage')[8]);
    for (let k = 0; k < SHEETS.ringe.takt; k += 1) e.fortschreiben();
  }
  assert.ok(groessen.at(-1) > groessen[0] * 1.5, `Ring wächst: ${groessen.join(', ')}`);
});

test('N-08: Teilchen-Einschläge sind begrenzt, deterministisch und laufen ab', () => {
  const a = new ArtEinschlaege();
  for (let i = 0; i < 20; i += 1) a.starte(ART_FAMILIEN[i % ART_FAMILIEN.length], i * 10, 50, 30);
  assert.equal(a.liste.length, MAX_ART_EINSCHLAEGE);
  assert.ok(a.verworfen > 0);
  assert.equal(a.starte('explosiv', 1, 1, 30), false);
  const zeichnung = () => {
    const b = new ArtEinschlaege();
    for (const f of ART_FAMILIEN) b.starte(f, 300, 200, 40);
    b.liste.length = 0;
    const aus = [];
    for (const f of ART_FAMILIEN) {
      const c = new ArtEinschlaege();
      c.starte(f, 300, 200, 40);
      for (let i = 0; i < 6; i += 1) c.fortschreiben();
      const ctx = attrappe();
      c.zeichne(ctx);
      assert.ok(ctx.aufrufe.length > 3, `${f} zeichnet`);
      aus.push(JSON.stringify(ctx.aufrufe));
    }
    return aus;
  };
  const erst = zeichnung();
  assert.deepEqual(zeichnung(), erst, 'gleicher Einschlag, gleiches Bild');
  assert.equal(new Set(erst).size, ART_FAMILIEN.length, 'jede Familie zeichnet anders');
  for (let i = 0; i < ART_DAUER; i += 1) a.fortschreiben();
  assert.equal(a.liste.length, 0);
});

test('N-11: Hitscan-Strahlen haben je Familie eine eigene Zeichnung', () => {
  const hitscan = WEAPONS.filter(w => w.delivery === 'hitscan');
  assert.ok(hitscan.length >= 50);
  const genutzt = new Set(hitscan.map(strahlArt));
  for (const art of genutzt) assert.ok(STRAHL_ARTEN.includes(art), art);
  assert.ok(genutzt.size >= 7, `nur ${genutzt.size} Strahlarten bei ${hitscan.length} Hitscan-Waffen`);
  assert.equal(strahlArt(null), 'laser');
  const bilder = new Map();
  for (const art of STRAHL_ARTEN) {
    const zeichne = (reduziert) => {
      const ctx = attrappe();
      zeichneStrahl(ctx, { ...erzeugeStrahl(10, 20, 260, 80, { hit: true, art }), life: 0.6 }, reduziert);
      return ctx.aufrufe;
    };
    const a = zeichne(false);
    assert.ok(a.length >= 4, `${art}: ${a.length} Aufrufe`);
    assert.deepEqual(zeichne(false), a, `${art}: deterministisch`);
    assert.ok(!a.some(x => x[0] === 'setTransform'), `${art}: kein setTransform`);
    bilder.set(art, JSON.stringify(a));
  }
  assert.equal(new Set(bilder.values()).size, STRAHL_ARTEN.length, 'jede Strahlart sieht anders aus');
});

test('N-09/N-10: Geschosse bekommen je Familie einen eigenen Schweif', () => {
  const genutzt = new Set();
  for (const w of WEAPONS) {
    const p = manifest.waffen[w.id]?.projectile;
    if (!p) continue;
    const art = schweifArt(p.art, w);
    assert.ok(SCHWEIF_ARTEN.includes(art), `${w.id}: ${art}`);
    genutzt.add(art);
  }
  assert.ok(genutzt.size >= 7, `nur ${genutzt.size} Schweifarten: ${[...genutzt].join(', ')}`);
  assert.equal(schweifArt('rakete', { id: 'x', damageType: 'explosive' }), 'rauch');
  assert.equal(schweifArt('kugel', { id: 'x', damageType: 'physical' }), 'leuchtspur');
  const ring = { anzahl: 8, xAn: i => i * 6, yAn: i => 40 - i * 2 };
  const bilder = new Set();
  for (const art of SCHWEIF_ARTEN) {
    const ctx = attrappe();
    zeichneFamilienSchweif(ctx, ring, art, '#88ccff', 8, 1.25, false);
    assert.ok(ctx.aufrufe.length > 0, art);
    bilder.add(JSON.stringify(ctx.aufrufe));
  }
  assert.equal(bilder.size, SCHWEIF_ARTEN.length);
  const still = (z) => { const c = attrappe(); zeichneFamilienSchweif(c, ring, 'flamme', '#f00', 8, z, true); return JSON.stringify(c.aufrufe); };
  assert.equal(still(0.1), still(3.7), 'reduzierte Bewegung: kein Flackern');
});
