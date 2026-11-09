/**
 * BAL-12: die reale Treffer- und Kollisionsmatrix bleibt reproduzierbar.
 *
 * Der Beleg `docs/waffenbalance-2026-11-09/kollisionsmatrix.json` wird vom
 * Werkzeug `tools/waffenbalance-kollisionsmatrix.mjs` mit einem echten
 * `fire()`/`step()`-Lauf erzeugt. Dieser Test spielt für JEDE der 150 Waffen
 * genau die aufgezeichneten Eingaben (Entfernung, Winkel, Kraft) erneut gegen
 * den Motor und prüft, dass Kollision, Ziel und Schaden/Nutzwert unverändert
 * entstehen. Damit ist die Matrix kein eingefrorenes Protokoll, sondern ein
 * Test des aktuellen Codes.
 *
 * Zusaetzlich festgehalten:
 *  - 112 Angriffswaffen, 38 Selbstwirkungen — die Aufteilung kommt aus dem Motor
 *    (`buildEffect`/`SELF_TARGET_KINDS`), nicht aus einer Namensliste.
 *  - Ein kontrollierter `wendeExplosionAn`-Aufruf erzeugt Schaden, aber KEIN
 *    Kollisionsereignis; er darf keinen Beleg ersetzen.
 *  - Die drei Waffen mit 0 im alten Luftzielaufbau (pa_039, pa_065, pa_066)
 *    haben hier einen echten Steilfeuer-Treffer.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { WEAPONS } from '../src/shared/config/weapons.js';
import { getWaffe, WAFFEN_STANDARD } from '../src/shared/config/waffen-fassung.js';
import { KLASSEN_STANDARD } from '../src/shared/config/klassen-fassung.js';
import { buildEffect, SELF_TARGET_KINDS } from '../src/engine/specials.js';
import {
  SEED, trefferProbe, selbstProbe, kontrollfall, rollenDistanz,
} from '../tools/kollisionsmatrix-kern.mjs';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const DATEI = path.join(HIER, '..', 'docs', 'waffenbalance-2026-11-09', 'kollisionsmatrix.json');
const matrix = JSON.parse(fs.readFileSync(DATEI, 'utf8'));
const nach = id => matrix.waffen.find(w => w.id === id);

const nah = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

test('BAL-12: Matrix deckt 150 Waffen, 112 Angriff und 38 Selbstwirkung ab', () => {
  assert.equal(matrix.ticket, 'BAL-12');
  assert.equal(matrix.seed, SEED);
  assert.equal(matrix.versions.waffen, WAFFEN_STANDARD);
  assert.equal(matrix.versions.klassen, KLASSEN_STANDARD);
  assert.equal(matrix.summary.waffen, 150);
  assert.equal(matrix.summary.angriff, 112);
  assert.equal(matrix.summary.selbst, 38);
  assert.equal(matrix.summary.angriffMitKollision, 112);
  assert.equal(matrix.summary.selbstMitNutzen, 38);

  // Dieselben IDs in derselben Reihenfolge wie der Katalog — keine Lücke, kein Doppel.
  assert.deepEqual(matrix.waffen.map(w => w.id), WEAPONS.map(w => w.id));
  assert.equal(new Set(matrix.waffen.map(w => w.id)).size, 150);
});

test('BAL-12: die Aufteilung Angriff/Selbst kommt aus dem Motor', () => {
  let angriff = 0;
  let selbst = 0;
  for (const eintrag of matrix.waffen) {
    const waffe = getWaffe(eintrag.id);
    const effekt = buildEffect(waffe);
    const istSelbst = Boolean(effekt && SELF_TARGET_KINDS.has(effekt.kind));
    assert.equal(eintrag.art, istSelbst ? 'selbst' : 'angriff', `${eintrag.id}: Art weicht vom Motor ab`);
    if (istSelbst) selbst += 1; else angriff += 1;
  }
  assert.equal(angriff, 112);
  assert.equal(selbst, 38);
});

test('BAL-12: jede Angriffswaffe trifft ihr Ziel in einem erneuten echten Schuss', () => {
  const angriffe = matrix.waffen.filter(w => w.art === 'angriff');
  assert.equal(angriffe.length, 112);
  for (const eintrag of angriffe) {
    const probe = eintrag.probe;
    assert.ok(probe, `${eintrag.id}: Beleg fehlt`);
    assert.equal(probe.quelle, 'fire+step', `${eintrag.id}: kein echter Schuss`);
    assert.equal(probe.kontrollierteExplosion, false, `${eintrag.id}: Explosionsaufruf statt Kollision`);

    const waffe = getWaffe(eintrag.id);
    const neu = trefferProbe(waffe, { distance: probe.distance, angle: probe.angle, power: probe.power });
    assert.equal(neu.ok, true, `${eintrag.id}: Schuss wurde abgelehnt: ${neu.errors.join(', ')}`);
    assert.ok(neu.kollision, `${eintrag.id}: keine Kollision mehr (${neu.ereignisArten.join(', ')})`);
    assert.equal(neu.kollision.art, probe.kollision.art, `${eintrag.id}: Kollisionsart geändert`);
    assert.equal(neu.kollision.target, neu.targetId, `${eintrag.id}: Kollision trifft nicht das Ziel`);
    assert.ok(neu.schaden.ereignisse >= 0);

    if (eintrag.id === 'pa_047') {
      /* Handgranate: Kollision ja, Schaden nein — offene Entscheidung GP-1
       * (Radius 0 vs. Art). Diese Ausnahme ist eng: NUR pa_047 darf hier 0
       * Schaden haben, und nur über eine Armierung im freien Flug. */
      assert.equal(neu.kollision.art, 'fuse_armed');
      assert.equal(neu.kollision.imFreien, true, 'pa_047: Armierung nicht im freien Flug');
      assert.equal(neu.schaden.ereignisse, 0);
    } else {
      assert.ok(neu.schaden.ereignisse > 0,
        `${eintrag.id}: kein Schaden am Ziel (${neu.schaden.ereignisse})`);
      assert.ok(nah(neu.schaden.ereignisse, probe.schaden.ereignisse),
        `${eintrag.id}: Schaden ${neu.schaden.ereignisse} statt ${probe.schaden.ereignisse}`);
    }
    assert.equal(neu.spawn?.homing ?? 0, probe.spawn?.homing ?? 0, `${eintrag.id}: homing geändert`);
  }
  const ohneSchaden = angriffe.filter(w => (w.probe?.schaden.ereignisse ?? 0) === 0).map(w => w.id);
  assert.deepEqual(ohneSchaden, ['pa_047'],
    'außer pa_047 darf keine Angriffswaffe ohne Schaden bleiben');
});

test('BAL-12: die drei alten Nulltreffer haben ein Steilfeuer-Szenario', () => {
  for (const id of ['pa_039', 'pa_065', 'pa_066']) {
    const eintrag = nach(id);
    assert.ok(eintrag?.probe?.kollision, `${id}: keine Kollision`);
    assert.ok(eintrag.probe.schaden.ereignisse > 0, `${id}: kein Schaden`);
    assert.equal(getWaffe(id).strikeStyle, 'sky', `${id}: kein Steilfeuer`);
    assert.ok(eintrag.probe.spawn.y < 100, `${id}: Geschoss startet nicht oberhalb des Ziels`);
  }
});

test('BAL-12: jede Selbstwirkung hat einen erneuten positiven Nutzwert, kein Geschoss', () => {
  const selbst = matrix.waffen.filter(w => w.art === 'selbst');
  assert.equal(selbst.length, 38);
  for (const eintrag of selbst) {
    assert.ok(eintrag.probe?.nutzen, `${eintrag.id}: Nutzwert fehlt im Beleg`);
    const neu = selbstProbe(getWaffe(eintrag.id));
    assert.equal(neu.ok, true, `${eintrag.id}: Anwendung abgelehnt: ${neu.errors.join(', ')}`);
    assert.equal(neu.projectileId, null, `${eintrag.id}: Selbstwirkung erzeugte ein Geschoss`);
    assert.ok(neu.nutzen, `${eintrag.id}: kein positiver Nutzwert mehr`);
    assert.equal(neu.nutzen.art, eintrag.probe.nutzen.art, `${eintrag.id}: Nutzart geändert`);
    assert.ok(neu.nutzen.wert > 0, `${eintrag.id}: Nutzwert ${neu.nutzen.wert}`);
  }
});

test('BAL-12: kontrollierter Explosionsaufruf erzeugt Schaden, aber keine Kollision', () => {
  const k = kontrollfall();
  assert.ok(k.schaden > 0, 'Kontrollfall richtete keinen Schaden an');
  assert.equal(k.kollisionsEreignisse, 0,
    'wendeExplosionAn meldete ein Kollisionsereignis — dann wäre der Kontrollfall kein Gegenfall');
  assert.equal(k.zaehltAlsKollision, false);
  assert.ok(!k.ereignisArten.includes('projectile_impact'));
  assert.ok(!k.ereignisArten.includes('hitscan'));

  // Und kein einziger Matrix-Beleg darf sich auf diesen Weg berufen.
  for (const eintrag of matrix.waffen.filter(w => w.art === 'angriff')) {
    assert.equal(eintrag.probe.kontrollierteExplosion, false, eintrag.id);
    assert.equal(eintrag.probe.quelle, 'fire+step', eintrag.id);
  }
});

test('BAL-12: Rollenentfernung ist dokumentiert und für den Beleg nachvollziehbar', () => {
  for (const eintrag of matrix.waffen.filter(w => w.art === 'angriff')) {
    const waffe = getWaffe(eintrag.id);
    assert.equal(eintrag.rollenDistanz, rollenDistanz(waffe), `${eintrag.id}: Rollenentfernung`);
    assert.ok(eintrag.probe.distance > 0);
    assert.ok(eintrag.probe.distance <= eintrag.reichweite + 1,
      `${eintrag.id}: Beleg ${eintrag.probe.distance} px über der Reichweite ${eintrag.reichweite}`);
  }
  /* Die Rückfälle sind ehrlich ausgewiesen: 101/112 treffen in der
   * Rollenentfernung, 11 in einer kleineren, aber noch rollennahen Entfernung. */
  assert.equal(matrix.summary.rollenDistanzErreicht, 101);
});

test('BAL-12: Zwei-Ziele-, Wand-, Rand- und Zielsuche-Szenario sind echt belegt', () => {
  const s = matrix.szenarien;
  assert.ok(s.zweiZiele.durchschlag.erstes > 0 && s.zweiZiele.durchschlag.zweites > 0,
    'Durchschlag traf das zweite Ziel nicht');
  assert.ok(s.zweiZiele.normal.erstes > 0);
  assert.equal(s.zweiZiele.normal.zweites, 0, 'Normalschuss verletzte das zweite Ziel');

  assert.equal(s.wanddeckung.abgelehnt, true, 'Wanddeckung sperrte den Schuss nicht');
  assert.equal(s.wanddeckung.schaden, 0);

  assert.ok(s.randtreffer.schaden > 0, 'Randtreffer verursachte keinen Schaden');

  assert.ok(s.zielsuche.homing > 0, 'Zielsuche: kein homing am Geschoss');
  assert.ok(s.zielsuche.schaden > 0, 'Zielsuche: versetztes Ziel wurde nicht getroffen');
});
