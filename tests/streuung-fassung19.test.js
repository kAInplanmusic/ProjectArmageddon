/**
 * BAL-16: Die Schrotflinte streut (Waffenfassung 19).
 *
 * ## Der Befund
 *
 * `pa_054` hieß Schrotflinte und trug `special: 'spread_shot'`, verschoss aber EIN Geschoss: Kein
 * Stück Motor las `spread_shot` (`docs/waffenbalance-2026-11-09/BAL-16-NAME-MECHANIK.md`).
 *
 * ## Die Entscheidung (Auftraggeber, 2026-11-10)
 *
 * Die Schrotflinte bekommt eine echte Streuung; die anderen fünf Verdachtsfälle bekommen ehrliche
 * Namen und Texte (Katalog, keine Regeländerung).
 *
 * ## Was hier geprüft wird
 *
 *  - Fassung 19 verschießt fünf Geschosse in einem festen, symmetrischen Fächer von 12 Grad; jedes
 *    trägt ein Fünftel von Schaden, Rückstoß und Geländeschaden.
 *  - Aus der Nähe treffen alle fünf und richten zusammen denselben Schaden an wie der Einzelschuss
 *    der Fassung 18; auf Distanz trifft nur ein Teil.
 *  - Ohne Zufall: zwei gleiche Schüsse ergeben denselben Zustandshash.
 *  - Fassung 18 verschießt weiter genau ein Geschoss (Gegenprobe), und ein Ablauf ohne Schrotflinte
 *    ist in Fassung 18 und 19 hashgleich.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MatchController } from '../src/engine/match.js';
import { streuWinkel } from '../src/engine/shooting.js';
import {
  WAFFEN_NACHSCHUB, WAFFEN_STREU, WAFFEN_STANDARD, getWaffe, normalisiereWaffen,
} from '../src/shared/config/waffen-fassung.js';
import { KLASSEN_STANDARD } from '../src/shared/config/klassen-fassung.js';
import { SCHADEN_STANDARD } from '../src/shared/config/schaden.js';
import { WIND_STANDARD } from '../src/shared/config/wind.js';
import { BODENOBJEKTE_STANDARD } from '../src/shared/config/bodenobjekte.js';

const SCHROT = 'pa_054';
const ZIEL_LP = 1000;

function stand(waffen, waffeId, abstand) {
  const m = new MatchController({
    seed: 31337, teams: 2, playersPerTeam: 1, preset: 'open', turnDurationMs: 1_000_000,
    klassen: KLASSEN_STANDARD, waffen, schaden: SCHADEN_STANDARD, wind: WIND_STANDARD,
    bodenobjekte: BODENOBJEKTE_STANDARD, kisten: 0,
    loadouts: [{ classId: 'fernkampf', archetypeId: null }, { classId: 'fernkampf', archetypeId: null }],
  });
  m.start();
  const [a, b] = m.getState().entities;
  const schuetze = a.entityId;
  const ziel = b.entityId;
  const orte = new Map([[schuetze, { x: 400, y: 100 }], [ziel, { x: 400 + abstand, y: 100 }]]);
  const halte = () => {
    for (const [id, p] of orte) {
      if (!m.world.isActive(id)) continue;
      for (const achse of ['x', 'y']) {
        m.world.setComponent(id, 'Position', achse, p[achse]);
        m.world.setComponent(id, 'Velocity', achse, 0);
      }
    }
  };
  halte();
  m.world.setComponent(ziel, 'Health', 'max', ZIEL_LP);
  m.world.setComponent(ziel, 'Health', 'current', ZIEL_LP);
  m.inventory.register(schuetze, [waffeId]);
  m.inventory.selectWeapon(schuetze, waffeId);
  m.consumeEvents();
  return { m, schuetze, ziel, halte };
}

/** Bester Winkel und Kraft auf das Ziel nach der Zielvorschau (wie `tools/kollisionsmatrix-kern.mjs`). */
function zielung(waffen, waffeId, abstand) {
  const { m, schuetze } = stand(waffen, waffeId, abstand);
  const w = getWaffe(waffeId, waffen);
  let best = { d: Infinity, winkel: 0, kraft: 100 };
  for (let winkel = -0.2; winkel <= 1.2; winkel += 0.02) {
    for (const kraft of [40, 60, 80, 100]) {
      const bahn = m.aimPreview(schuetze, winkel, kraft, 600, w);
      let d = Infinity;
      for (const q of bahn) d = Math.min(d, Math.hypot(q.x - 400 - abstand, q.y - 100));
      if (d < best.d) best = { d, winkel, kraft };
    }
  }
  return best;
}

function schuss(waffen, waffeId, abstand) {
  const { winkel, kraft } = zielung(waffen, waffeId, abstand);
  const { m, schuetze, ziel, halte } = stand(waffen, waffeId, abstand);
  const r = m.fire(schuetze, winkel, kraft, waffeId);
  assert.ok(r.ok, `${waffeId} feuert nicht: ${r.errors}`);
  const ereignisse = [...m.consumeEvents()];
  const ids = r.projectileIds ?? [r.projectileId];
  const kugeln = ids.map(id => ({
    damage: m.world.getComponent(id, 'Projectile', 'damage'),
    knockback: m.world.getComponent(id, 'Projectile', 'knockback'),
    terrainDamage: m.world.getComponent(id, 'Projectile', 'terrainDamage'),
    vx: m.world.getComponent(id, 'Velocity', 'x'),
    vy: m.world.getComponent(id, 'Velocity', 'y'),
  }));
  for (let t = 0; t < 900 && m.activeProjectileCount > 0; t += 1) { halte(); m.step(); halte(); ereignisse.push(...m.consumeEvents()); }
  for (let t = 0; t < 12; t += 1) { halte(); m.step(); halte(); ereignisse.push(...m.consumeEvents()); }
  const treffer = ereignisse.filter(e => e.type === 'projectile_impact' && e.payload.target === ziel).length;
  const schaden = ereignisse
    .filter(e => e.type === 'damage' && e.payload.entityId === ziel && e.payload.attackerId === schuetze && e.payload.dot !== true)
    .reduce((s, e) => s + e.payload.amount, 0);
  const spawns = ereignisse.filter(e => e.type === 'projectile_spawn').length;
  return { r, kugeln, treffer, schaden, spawns, hash: m.stateHash(), m };
}

test('Fassung 19 ist der Standard und folgt direkt auf Fassung 18', () => {
  assert.equal(WAFFEN_STREU, WAFFEN_NACHSCHUB + 1);
  assert.equal(WAFFEN_STANDARD, WAFFEN_STREU);
  assert.equal(normalisiereWaffen(19), WAFFEN_STREU);
  assert.equal(normalisiereWaffen(18), WAFFEN_NACHSCHUB);
  assert.deepEqual(getWaffe(SCHROT, WAFFEN_STREU).streuung, { anzahl: 5, faecherGrad: 12 });
  assert.equal(getWaffe(SCHROT, WAFFEN_NACHSCHUB).streuung, undefined, 'Fassung 18 darf keine Streuung kennen');
});

test('Der Fächer: fünf Winkel, symmetrisch, einer genau auf dem Ziel, 12 Grad breit', () => {
  const w = streuWinkel({ anzahl: 5, faecherGrad: 12 });
  assert.equal(w.length, 5);
  assert.equal(w[2], 0);
  for (let i = 0; i < 5; i += 1) assert.ok(Math.abs(w[i] + w[4 - i]) < 1e-12, 'nicht symmetrisch');
  assert.ok(Math.abs((w[4] - w[0]) * 180 / Math.PI - 12) < 1e-9);
  assert.deepEqual(streuWinkel({ anzahl: 1, faecherGrad: 12 }), [0]);
});

test('Fassung 19: fünf Kugeln mit je einem Fünftel; Fassung 18: ein Geschoss mit dem Ganzen', () => {
  const alt = schuss(WAFFEN_NACHSCHUB, SCHROT, 120);
  const neu = schuss(WAFFEN_STREU, SCHROT, 120);
  assert.equal(alt.kugeln.length, 1);
  assert.equal(alt.spawns, 1);
  assert.equal(neu.kugeln.length, 5);
  assert.equal(neu.spawns, 5);
  const ganz = alt.kugeln[0];
  // Der Komponentenspeicher führt 32-Bit-Gleitkommazahlen: Vergleich mit dessen Genauigkeit.
  const gleich = (a, b) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b));
  for (const k of neu.kugeln) {
    assert.ok(gleich(k.damage, ganz.damage / 5), `Kugelschaden ${k.damage} statt ${ganz.damage / 5}`);
    assert.ok(gleich(k.knockback, ganz.knockback / 5), `Rückstoß ${k.knockback}`);
    assert.ok(gleich(k.terrainDamage, ganz.terrainDamage / 5), `Geländeschaden ${k.terrainDamage}`);
  }
  // Die Kugeln fliegen wirklich in verschiedene Richtungen.
  const richtungen = new Set(neu.kugeln.map(k => Math.atan2(k.vy, k.vx).toFixed(4)));
  assert.equal(richtungen.size, 5);
  // Ein Schuss, eine Munition, eine Nachladezeit.
  const munition = f => f.m.inventory.getAmmo(f.m.getState().entities[0].entityId, SCHROT);
  assert.equal(munition(neu), munition(alt), 'ein Streuschuss verbraucht genau eine Ladung');
});

test('Aus der Nähe trifft alles (voller Schaden), auf Distanz nur ein Teil', () => {
  const nahAlt = schuss(WAFFEN_NACHSCHUB, SCHROT, 120);
  const nah = schuss(WAFFEN_STREU, SCHROT, 120);
  assert.equal(nahAlt.treffer, 1, 'Testaufbau: der Einzelschuss trifft aus der Nähe');
  assert.equal(nah.treffer, 5, `aus 120 px trafen nur ${nah.treffer} von 5 Kugeln`);
  assert.ok(Math.abs(nah.schaden - nahAlt.schaden) <= 1e-4 * Math.max(1, nahAlt.schaden),
    `Nahschaden ${nah.schaden} weicht vom Einzelschuss ${nahAlt.schaden} ab`);

  const weit = schuss(WAFFEN_STREU, SCHROT, 600);
  const weitAlt = schuss(WAFFEN_NACHSCHUB, SCHROT, 600);
  assert.equal(weitAlt.treffer, 1, 'Testaufbau: der Einzelschuss trifft auch auf 600 px');
  assert.ok(weit.treffer >= 1 && weit.treffer < 5, `auf 600 px trafen ${weit.treffer} von 5 Kugeln`);
  assert.ok(weit.schaden < weitAlt.schaden, 'auf Distanz muss die Streuung weniger Schaden bringen');
});

test('Ohne Zufall: zwei gleiche Streuschüsse sind hashgleich', () => {
  assert.equal(schuss(WAFFEN_STREU, SCHROT, 200).hash, schuss(WAFFEN_STREU, SCHROT, 200).hash);
});

test('Ohne Schrotflinte sind Fassung 18 und 19 hashgleich', () => {
  for (const waffe of ['pa_040', 'pa_037', 'pa_072']) {
    assert.equal(schuss(WAFFEN_NACHSCHUB, waffe, 200).hash, schuss(WAFFEN_STREU, waffe, 200).hash, waffe);
  }
});
