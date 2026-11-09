/**
 * Regressionstests zu den Dubletten- und Klärungspunkten der Engine (docs/TODO-SSOT.md, 2026-11-02):
 *
 *  - N-19:  `match.js` führt keine eigene Geschoss-Schwerkraft mehr (nur `PROJECTILE_GRAVITY`).
 *  - ENG-3: Kistenmaße stehen als Namen in `config/kisten.js`; die Seltenheitsfarben des Renderers
 *           kommen aus `LOOT_DROP_RULES.rarityColors` (keine zweite Farbliste mehr).
 *  - ENG-2: Helfer, die der Generator als CODE und als TEXT (Vorlage von `weapons.js`) führt, sind
 *           gleich: drei mit gleichem Rumpf, zwei mit gleichem Ergebnis für jede Katalogwaffe.
 *  - ENG-8: `effectMagnitude` ist begründet ohne Motorleser; die Weite der vier Geräte trägt ab
 *           Waffenfassung 10 `wirkung.distance`, und die Paare halten dort ihre Zusage.
 *  - TER-1: Ab Waffenfassung 5 trägt keine Hitscan-Waffe `terrainDamage`; in 1 bis 4 die drei alten
 *           Einträge (Feld ohne Leser, deshalb unverändert gelassen: alte Replays bitgleich).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { WEAPONS } from '../src/shared/config/weapons.js';
import * as katalog from '../src/shared/config/weapons.js';
import * as generator from '../scripts/build-weapon-catalog.mjs';
import { getWaffe, WAFFEN_SPREIZUNG, WAFFEN_STANDARD } from '../src/shared/config/waffen-fassung.js';
import { KISTE_KANTE, KISTE_RANDABSTAND } from '../src/shared/config/kisten.js';
import { buildEffect } from '../src/engine/specials.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lies = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('N-19: match.js hat keine eigene Schwerkraft-Konstante', () => {
  const quelle = lies('src/engine/match.js');
  assert.doesNotMatch(quelle, /const\s+GRAVITY\s*=/, 'Alias GRAVITY ist zurück');
  assert.doesNotMatch(quelle, /=\s*0\.32\s*;/, 'eine abgeschriebene 0.32 steht wieder in match.js');
  assert.match(quelle, /PROJECTILE_GRAVITY \* \(waffe\.gravityScale/, 'der Geschützpfad liest PROJECTILE_GRAVITY');
});

test('ENG-3: Kistenmaße als Namen, keine Literale 14/12 an den Ablagestellen', () => {
  assert.equal(KISTE_KANTE, 14);
  assert.equal(KISTE_RANDABSTAND, 12);
  for (const rel of ['src/engine/kistenWurf.js', 'src/engine/systems/lootSystem.js', 'src/engine/systems/guentherSystem.js']) {
    const quelle = lies(rel);
    assert.doesNotMatch(quelle, /\)\s*-\s*14\)?;|[Yy]\s*-\s*14\b/, `${rel}: Ablagehöhe wieder als Literal 14`);
    assert.match(quelle, /KISTE_KANTE/, `${rel}: liest KISTE_KANTE nicht`);
  }
  assert.doesNotMatch(lies('src/engine/kistenWurf.js'), /width\s*-\s*12\b|Math\.max\(12,/, 'Randabstand wieder als Literal 12');
});

test('ENG-3: der Renderer führt keine eigene Seltenheitsfarbliste', () => {
  // A5/ENG-12: Die Kistenlogik liegt jetzt in `rendererLogik.js`, damit sie ohne
  // Canvas/`import.meta.glob` prüfbar ist. Die Zusage bleibt dieselbe: EINE Farbe
  // aus `config/loot.js`, keine zweite Liste — nur an ihrem neuen Ort geprüft.
  const quelle = lies('src/client/renderer.js');
  assert.doesNotMatch(quelle, /RARITY_COLORS|CRATE_COLORS/, 'eine eigene Farbliste ist zurück');
  assert.match(quelle, /import \{ kistenFarbe, kistenMarke \} from '\.\/rendererLogik\.js';/,
    'Renderer nutzt nicht die gemeinsame Kistenlogik');
  const logik = lies('src/client/rendererLogik.js');
  assert.doesNotMatch(logik, /RARITY_COLORS|CRATE_COLORS/, 'eine eigene Farbliste ist zurück');
  assert.match(logik, /LOOT_DROP_RULES\.rarityColors\[RARITY_IDS\[/, 'Farbe nicht aus config/loot.js');
  assert.match(quelle, /const size = KISTE_KANTE;/, 'Kistenkante nicht aus config/kisten.js');
});

/** Normalisierter Rumpf einer `export function name(` ab Textstelle (Kommentare und Leerraum entfernt). */
function rumpf(quelle, name) {
  const i = quelle.indexOf(`export function ${name}(`);
  if (i < 0) return null;
  let j = quelle.indexOf('{', quelle.indexOf(')', i));
  for (let tiefe = 0; j < quelle.length; j += 1) {
    if (quelle[j] === '{') tiefe += 1;
    else if (quelle[j] === '}' && --tiefe === 0) break;
  }
  return quelle.slice(i, j + 1).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').replace(/\s+/g, '');
}

test('ENG-2: Generator-Helfer als Code und als Text haben denselben Rumpf', () => {
  const text = lies('scripts/build-weapon-catalog.mjs');
  const grenze = text.indexOf('const file = `/**');
  assert.ok(grenze > 0, 'Beginn der Vorlage nicht gefunden');
  const code = text.slice(0, grenze);
  const vorlage = text.slice(grenze);
  const doppelt = [...new Set([...code.matchAll(/export function (\w+)\(/g)].map(m => m[1]))]
    .filter(name => vorlage.includes(`export function ${name}(`)).sort();
  // Die Liste selbst ist Teil der Zusage: ein neuer doppelter Helfer muss hier eingetragen werden.
  assert.deepEqual(doppelt, ['hasFuse', 'iconUrlFor', 'identityFor', 'strikeStyleFor', 'subcategoryFor']);
  for (const name of ['identityFor', 'iconUrlFor', 'subcategoryFor']) {
    assert.equal(rumpf(code, name), rumpf(vorlage, name), `${name}: Code und Vorlage sind auseinandergelaufen`);
  }
});

test('ENG-2: strikeStyleFor und hasFuse (Set gegen Liste) liefern für jede Waffe dasselbe', () => {
  for (const waffe of WEAPONS) {
    assert.equal(katalog.strikeStyleFor(waffe), generator.strikeStyleFor(waffe), `${waffe.id}: strikeStyleFor`);
    for (const fuseIntent of [waffe.fuseIntent, 'impact', 'timed', null]) {
      const probe = { ...waffe, fuseIntent };
      assert.equal(katalog.hasFuse(probe), generator.hasFuse(probe), `${waffe.id} (${fuseIntent}): hasFuse`);
    }
  }
  assert.deepEqual([...generator.FUSE_SPECIALS], [...katalog.FUSE_SPECIALS]);
  assert.deepEqual([...generator.STRIKE_FROM_SKY], [...katalog.STRIKE_FROM_SKY]);
  assert.deepEqual([...generator.STRIKE_FROM_FLANK], [...katalog.STRIKE_FROM_FLANK]);
});

test('ENG-8: effectMagnitude ist begründet ohne Leser, die Weite kommt ab Fassung 10 aus wirkung.distance', () => {
  assert.ok('effectMagnitude' in generator.FELDER_OHNE_PRODUKTLESER_BEWUSST);
  assert.ok(!('effectMagnitude' in generator.FELDER_OHNE_PRODUKTLESER_OFFEN));
  const weite = (id, fassung) => buildEffect(getWaffe(id, fassung))?.distance;
  for (const fassung of [WAFFEN_SPREIZUNG, WAFFEN_STANDARD]) {
    // Paarzusagen: Gleitschirm weiter als Raketenrucksack, Dimensionsriss weiter als Dimensionssprung.
    assert.ok(weite('pa_114', fassung) > weite('pa_032', fassung), `Fassung ${fassung}: Gleitschirm nicht weiter`);
    assert.ok(weite('pa_088', fassung) > weite('pa_087', fassung), `Fassung ${fassung}: Riss nicht weiter`);
  }
  // Dieselbe Richtung wie die Design-Kennzahl.
  const mag = id => WEAPONS.find(w => w.id === id).effectMagnitude;
  assert.ok(mag('pa_114') > mag('pa_032') && mag('pa_088') > mag('pa_087'));
});

test('TER-1: Hitscan-Waffen tragen ab Fassung 5 keinen Geländeschaden', () => {
  const hitscanMitGelaende = fassung => WEAPONS.map(w => getWaffe(w.id, fassung))
    .filter(w => w.delivery === 'hitscan' && (w.terrainDamage ?? 0) > 0).map(w => w.id).sort();
  for (let fassung = 1; fassung <= 4; fassung += 1) {
    assert.deepEqual(hitscanMitGelaende(fassung), ['pa_113', 'pa_126', 'pa_136'], `Fassung ${fassung}`);
  }
  for (let fassung = 5; fassung <= WAFFEN_STANDARD; fassung += 1) {
    assert.deepEqual(hitscanMitGelaende(fassung), [], `Fassung ${fassung}`);
  }
});

/**
 * ENG-4 Nr. 7: Detektor für „fast gleiche" Rümpfe — gleicher Rechenweg, nur andere Zahlen.
 * Kommentare und Leerraum fallen weg, Zahlliterale werden zu `N` maskiert; zwei Rümpfe mit
 * derselben Maske sind eine Kopie mit abgewandelter Konstante (so entstanden Fund 1, 2 und 5).
 */
function fastGleicheRuempfe(dateien, mindestLaenge = 60) {
  const gruppen = new Map();
  for (const [ort, roh] of dateien) {
    const t = roh.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    const kopf = /(?:function\s+(\w+)|^\s*(#?\w+)\s*)\(([^()]*)\)\s*\{/gm;
    let m;
    while ((m = kopf.exec(t))) {
      const name = m[1] ?? m[2];
      if (['if', 'for', 'while', 'switch', 'catch', 'return'].includes(name)) continue;
      let j = kopf.lastIndex - 1;
      for (let tiefe = 0; j < t.length; j += 1) {
        if (t[j] === '{') tiefe += 1;
        else if (t[j] === '}' && --tiefe === 0) break;
      }
      const koerper = t.slice(kopf.lastIndex, j).replace(/\s+/g, '');
      if (koerper.length < mindestLaenge) continue;
      const maske = koerper.replace(/\b\d+(\.\d+)?\b/g, 'N');
      if (!gruppen.has(maske)) gruppen.set(maske, []);
      gruppen.get(maske).push(`${ort}:${name}`);
    }
  }
  return [...gruppen.values()].filter(g => g.length > 1);
}

test('ENG-4: der Detektor erkennt eine Kopie mit anderer Zahl (Mutationsprobe)', () => {
  const a = 'function f(x) {\n  const v = x * 0.32 + Math.max(12, x - 14);\n  return v / 2;\n}\n';
  const b = 'function g(y) {\n  const v = y * 0.30 + Math.max(12, y - 14);\n  return v / 2;\n}\n';
  // Verschiedene Parameternamen: keine Gruppe (der Detektor maskiert nur Zahlen).
  assert.equal(fastGleicheRuempfe([['a', a], ['b', b]], 10).length, 0);
  const c = b.replace(/y/g, 'x').replace('function g', 'function h');
  assert.equal(fastGleicheRuempfe([['a', a], ['c', c]], 10).length, 1);
});

test('ENG-4: in src/engine und src/shared gibt es keine fast gleichen Funktionsrümpfe', () => {
  const dateien = [];
  for (const ordner of ['src/engine', 'src/engine/systems', 'src/engine/physics', 'src/engine/terrain', 'src/engine/ecs', 'src/shared', 'src/shared/config']) {
    for (const f of fs.readdirSync(path.join(ROOT, ordner))) {
      if (f.endsWith('.js') && f !== 'weapons.js') dateien.push([`${ordner}/${f}`, lies(`${ordner}/${f}`)]);
    }
  }
  assert.ok(dateien.length > 40, 'zu wenige Dateien gelesen');
  assert.deepEqual(fastGleicheRuempfe(dateien), [],
    'Gleicher Rechenweg an zwei Stellen (nur Zahlen verschieden): eine Regel gehört an eine Stelle.');
});
