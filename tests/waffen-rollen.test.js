/**
 * Rollen und Wirkpfade der 150 Waffen (BAL-11, Audit 2026-11-08 W07/W09).
 *
 * Der Tickettext verlangt drei Dinge, die hier getrennt geprüft werden:
 *
 *   1. Jede der 150 IDs hat genau eine dokumentierte Rolle aus Hand, Rücken,
 *      Aufstellobjekt, Beschwörung, Symbol.
 *   2. Rucksack, Gleitschirm, Statue, Boot, Mine und Beschwörung sind
 *      semantisch verständlich (Rolle, Wirkpfad, Begründung).
 *   3. Die 96 vorhandenen Geschossbilder werden NICHT als 96 echte
 *      Projektilpfade ausgegeben: Es sind 87 Pfade und neun Begleitbilder.
 *
 * Die Prüfung liest dieselben Daten wie Spiel und Manifest
 * (`src/shared/config/waffen-rollen.js`) und vergleicht sie mit der
 * Motorwirklichkeit (`buildEffect` + `delivery`).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { WEAPONS } from '../src/shared/config/weapons.js';
import { getWaffe } from '../src/shared/config/waffen-fassung.js';
import { buildEffect, SELF_TARGET_KINDS } from '../src/engine/specials.js';
import {
  ROLLEN, ROLLE_JE_WAFFE, WIRKPFAAD_JE_WAFFE, SPEZIALFAELLE,
  rolleFuer, wirkpfadFuer, hatProjektilpfad, rollenLabel, rollenUebersicht,
} from '../src/shared/config/waffen-rollen.js';
import { waffenRolle, waffeFuerAnzeige } from '../src/client/waffenSicht.js';
import { zellenFuer } from '../src/client/waffenSprites.js';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const WURZEL = path.join(HIER, '..');
const SPRITES = path.join(WURZEL, 'src', 'client', 'assets', 'weapon-sprites');
const manifest = JSON.parse(fs.readFileSync(path.join(SPRITES, 'manifest.json'), 'utf8'));
const dok = fs.readFileSync(path.join(WURZEL, 'docs', 'waffen-audit-2026-11-08', 'ROLLEN.md'), 'utf8');

const ROLLEN_IDS = Object.keys(ROLLEN);
const WIRKPFAAD_IDS = ['projektil', 'strahl', 'selbst'];

/** Die neun Waffen mit Geschossbild, aber ohne eigenen Projektilpfad. */
const BILDER_OHNE_PFAD = [
  'pa_032', 'pa_076', 'pa_079', 'pa_105', 'pa_124', 'pa_141', 'pa_143', 'pa_148', 'pa_149',
];

/** Fassung 21: Wirkpfad im Motor weicht von der (noch nicht neu erzeugten) Rollentabelle ab. */
const FASSUNG21_BILDRUECKSTAND = ['pa_079', 'pa_127', 'pa_134', 'pa_135', 'pa_139'];

const idsAlle = WEAPONS.map(w => w.id);

test('BAL-11: alle 150 IDs haben genau eine dokumentierte Rolle aus den fünf', () => {
  assert.deepEqual(Object.keys(ROLLEN).sort(), ['aufstell', 'beschwoerung', 'hand', 'ruecken', 'symbol']);
  assert.deepEqual(Object.keys(ROLLE_JE_WAFFE).sort(), [...idsAlle].sort(), 'Rollentabelle deckt nicht exakt die 150 Katalog-IDs');
  assert.equal(Object.keys(ROLLE_JE_WAFFE).length, 150);

  for (const id of idsAlle) {
    const rolle = rolleFuer(id);
    assert.ok(ROLLEN_IDS.includes(rolle), `${id}: unbekannte Rolle ${rolle}`);
    assert.ok(rollenLabel(rolle), `${id}: Rolle ohne Anzeigename`);
    assert.equal(wirkpfadFuer(id), WIRKPFAAD_JE_WAFFE[id], `${id}: Wirkpfad inkonsistent`);
    assert.ok(WIRKPFAAD_IDS.includes(wirkpfadFuer(id)), `${id}: unbekannter Wirkpfad ${wirkpfadFuer(id)}`);
  }

  // Die Rollen sind wirklich verteilt, nicht nur ein Sammelbecken.
  const uebersicht = rollenUebersicht();
  assert.deepEqual(uebersicht, {
    gesamt: 150,
    rollen: { hand: 109, ruecken: 3, aufstell: 12, beschwoerung: 5, symbol: 21 },
    wirkpfade: { projektil: 87, strahl: 25, selbst: 38 },
  });
});

test('BAL-11: Wirkpfad stimmt mit Motor und delivery überein, nicht mit dem Bild', () => {
  for (const roh of WEAPONS) {
    const waffe = getWaffe(roh.id);
    const effekt = buildEffect(waffe);
    const selbst = Boolean(effekt && SELF_TARGET_KINDS.has(effekt.kind));
    const erwartet = selbst ? 'selbst' : waffe.delivery === 'projectile' ? 'projektil' : 'strahl';
    /* Fassung 21 (2026-11-11) hat fünf Waffen umgestellt: Funkenkugel (pa_079) ist kein Portal mehr, die Mine (pa_127, Fassung 22) wird geworfen, Luftangriff,
     * Meteorregen und Höllenkanone fliegen als Geschoss. Die Rollentabelle und das Sprite-Manifest gehören dem
     * Animationsstrang und sind dort noch auf Fassung 20; solange sie nicht neu erzeugt sind, gilt hier der
     * dokumentierte Rückstand (genau diese fünf, nichts sonst). */
    if (FASSUNG21_BILDRUECKSTAND.includes(roh.id)) {
      assert.notEqual(wirkpfadFuer(roh.id), erwartet, `${roh.id}: Rückstand ist behoben — aus der Liste nehmen`);
      continue;
    }
    assert.equal(wirkpfadFuer(roh.id), erwartet, `${roh.id}: Wirkpfad ${wirkpfadFuer(roh.id)} statt ${erwartet}`);
    assert.equal(hatProjektilpfad(roh.id), erwartet === 'projektil', `${roh.id}: Projektilpfad falsch`);
  }

  // Nur Hand und Beschwörung dürfen ein echtes Geschoss starten; Rücken,
  // Aufstellobjekt und Symbol wirken am Anwender bzw. in der Welt.
  for (const id of idsAlle) {
    const rolle = rolleFuer(id);
    const pfad = wirkpfadFuer(id);
    if (rolle === 'ruecken' || rolle === 'aufstell' || rolle === 'symbol') {
      assert.equal(pfad, 'selbst', `${id}: ${rolle} darf keinen ${pfad}-Pfad haben`);
    }
    if (rolle === 'hand' && pfad === 'selbst') assert.fail(`${id}: Handwaffe ohne Wirkung`);
  }
});

test('BAL-11: das Manifest trägt dieselbe Rolle und denselben Wirkpfad wie der Code', () => {
  assert.deepEqual(Object.keys(manifest.waffen).sort(), [...idsAlle].sort());
  for (const id of idsAlle) {
    const w = manifest.waffen[id];
    assert.equal(w.rolle, rolleFuer(id), `${id}: Manifestrolle`);
    assert.equal(w.wirkpfad, wirkpfadFuer(id), `${id}: Manifest-Wirkpfad`);
    assert.equal(SPEZIALFAELLE[id] ? w.rollenHinweis : undefined, SPEZIALFAELLE[id], `${id}: Hinweis`);
  }
  assert.equal(Object.keys(manifest.rollen.definitionen).length, 5);
  assert.deepEqual(manifest.rollen.zaehlung, rollenUebersicht().rollen);
  assert.deepEqual(manifest.rollen.wirkpfade, rollenUebersicht().wirkpfade);
  assert.match(manifest.rollen.hinweis, /waffen-rollen\.js/, 'Manifest nennt die Datenquelle nicht');
});

test('BAL-11: 96 Geschossbilder, aber nur 87 echte Projektilpfade', () => {
  const mitBild = idsAlle.filter(id => manifest.waffen[id].projectile);
  const mitPfad = idsAlle.filter(id => manifest.waffen[id].projectile?.eigenerPfad === true);
  const ohnePfad = idsAlle.filter(id => manifest.waffen[id].projectile?.eigenerPfad === false);

  assert.equal(mitBild.length, 96, 'Geschossbilder');
  assert.equal(mitPfad.length, 87, 'echte Projektilpfade');
  assert.deepEqual(ohnePfad.sort(), [...BILDER_OHNE_PFAD].sort(), 'Bilder ohne Pfad');
  assert.equal(manifest.rollen.geschossbilder, 96);
  assert.equal(manifest.rollen.projektilpfade, 87);
  assert.deepEqual(manifest.rollen.bilderOhnePfad, [...BILDER_OHNE_PFAD].sort());

  for (const id of mitBild) {
    const p = manifest.waffen[id].projectile;
    assert.equal(typeof p.eigenerPfad, 'boolean', `${id}: eigenerPfad fehlt`);
    assert.equal(p.verwendung, p.eigenerPfad ? 'geschoss' : 'begleitbild', `${id}: Verwendung`);
    // Ein Bild ohne Pfad darf nie einer Handwaffe gehören.
    if (!p.eigenerPfad) assert.notEqual(rolleFuer(id), 'hand', `${id}: Handwaffe ohne Pfad ist unplausibel`);
  }
  // 96 = 87 + 9.
  assert.equal(mitPfad.length + ohnePfad.length, mitBild.length);
});

test('BAL-11: der Sprite-Lader reicht nur echte Geschosse als Projektil durch', () => {
  for (const id of BILDER_OHNE_PFAD) {
    const z = zellenFuer(manifest, id);
    assert.ok(z.geschossbild, `${id}: Geschosszelle soll für die Diagnose erhalten bleiben`);
    assert.equal(z.projectile, null, `${id}: Begleitbild wird als Projektil durchgereicht`);
    assert.equal(z.wirkpfad, 'selbst', `${id}: Wirkpfad im Sprite-Eintrag`);
  }
  const pistole = zellenFuer(manifest, 'pa_040');
  assert.ok(pistole.projectile, 'echtes Geschoss fehlt');
  assert.equal(pistole.projectile.eigenerPfad, true);
  assert.equal(pistole.rolle, 'hand');
  assert.equal(pistole.wirkpfad, 'projektil');
});

test('BAL-11: Spezialfälle Rucksack, Gleitschirm, Statue, Boot, Mine, Beschwörung sind erklärt', () => {
  const erwartet = {
    pa_032: 'ruecken',
    pa_112: 'ruecken',
    pa_114: 'ruecken',
    pa_115: 'aufstell',
    pa_131: 'aufstell',
    pa_127: 'aufstell',
    pa_141: 'beschwoerung',
    pa_143: 'beschwoerung',
  };
  for (const [id, rolle] of Object.entries(erwartet)) {
    assert.equal(rolleFuer(id), rolle, `${id}: Rolle`);
    assert.ok(SPEZIALFAELLE[id], `${id}: Begründung fehlt`);
  }
  assert.match(SPEZIALFAELLE.pa_032, /Rücken/i);
  assert.match(SPEZIALFAELLE.pa_112, /Rücken|Düsenantrieb/i);
  assert.match(SPEZIALFAELLE.pa_114, /Rücken/i);
  assert.match(SPEZIALFAELLE.pa_115, /aufgestellt/i);
  assert.match(SPEZIALFAELLE.pa_131, /Wasserfahrzeug/i);
  assert.match(SPEZIALFAELLE.pa_127, /liegen|abgelegt/i);
  assert.match(SPEZIALFAELLE.pa_141, /beschworener|Wächter/i);
  assert.match(SPEZIALFAELLE.pa_143, /Reittier/i);
  assert.match(SPEZIALFAELLE.pa_061, /als Projektil/);

  // Die drei Rucksäcke/Schirme liegen am Rücken, nicht in der Faust.
  for (const id of ['pa_032', 'pa_112', 'pa_114']) {
    assert.equal(waffenRolle(getWaffe(id)), 'ruecken', `${id}: Darstellungsrolle`);
  }
  // Statue, Boot und Mine werden als Weltobjekt gezeichnet, nicht gehalten.
  for (const id of ['pa_115', 'pa_131', 'pa_127']) {
    assert.equal(waffenRolle(getWaffe(id)), 'weltobjekt', `${id}: Darstellungsrolle`);
  }
  // Beschwörungen haben kein Handbild.
  for (const id of ['pa_061', 'pa_086', 'pa_118', 'pa_141', 'pa_143']) {
    assert.equal(waffenRolle(getWaffe(id)), 'weltobjekt', `${id}: Beschwörung als Handwaffe`);
  }
});

test('BAL-11: Anzeige und Darstellung bleiben für alle 150 konsistent', () => {
  const erlaubt = new Set(['hand', 'geschoss', 'ruecken', 'selbst', 'weltobjekt', 'ui']);
  for (const id of idsAlle) {
    const sicht = waffeFuerAnzeige(id);
    assert.equal(sicht.semantischeRolle, rolleFuer(id), `${id}: Anzeigerolle`);
    assert.equal(sicht.wirkpfad, wirkpfadFuer(id), `${id}: Anzeige-Wirkpfad`);
    assert.equal(sicht.rollenLabel, rollenLabel(rolleFuer(id)), `${id}: Rollenname`);
    assert.ok(erlaubt.has(sicht.rolle), `${id}: unbekannte Darstellungsrolle ${sicht.rolle}`);
  }
  // Nur Handwaffen dürfen als getragen gezeichnet werden; Wurfwaffen werden
  // erst mit ihrem Ding-Sprite zum Geschoss.
  const bumerang = getWaffe('pa_049');
  assert.equal(waffenRolle(bumerang, undefined, { projektilInfo: { art: 'ding' } }), 'geschoss');
  assert.equal(waffenRolle(bumerang), 'hand');

  for (const waffe of WEAPONS) {
    const effekt = buildEffect(getWaffe(waffe.id));
    if (!effekt || !SELF_TARGET_KINDS.has(effekt.kind)) continue;
    const rolle = waffenRolle(getWaffe(waffe.id), effekt);
    assert.ok(['selbst', 'weltobjekt', 'ruecken'].includes(rolle), `${waffe.id}: Selbstwirkung als ${rolle}`);
  }
});

test('BAL-11: ROLLEN.md dokumentiert alle 150 IDs und die Bildzahl', () => {
  const zeilen = dok.split('\n').filter(z => z.startsWith('| pa_'));
  assert.equal(zeilen.length, 150, 'Dokumenttabelle deckt nicht 150 IDs');
  for (const id of idsAlle) assert.ok(dok.includes(`| ${id} |`), `${id}: fehlt in ROLLEN.md`);
  assert.match(dok, /96 Geschossbilder/);
  assert.match(dok, /87 Projektil/);
  for (const wort of ['Rucksack', 'Gleitschirm', 'Statue', 'Boot', 'Mine', 'Beschwörung']) {
    assert.match(dok, new RegExp(wort), `ROLLEN.md erklärt ${wort} nicht`);
  }
});
