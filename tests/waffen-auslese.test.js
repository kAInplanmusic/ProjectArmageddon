/**
 * Tests: Auslese-Angleichung des Waffenkatalogs (2026-10-28, `docs/balance-auslese/*.md`).
 *
 * Die Auslese ändert Leistungswert, Stufe, Beutegewicht und Texte, NICHT das Gefecht. Belegt wird das auf
 * fünf Wegen:
 *  1. Die geänderten Katalogfelder sind genau die der Auslese-Tabellen (kein Ableitungsfeld wie Reichweite,
 *     Abklingzeit oder Zünder bewegt sich),
 *  2. Wirkungen (`buildEffect`) sind vor und nach der Auslese gleich, auch bei Selbstwirkungen mit Schaden 0,
 *  3. ein Schuss jeder geänderten Waffe in Fassung 4 und 5 ergibt dieselben Zustandshashes wie vorher (Gold,
 *     gemessen am Stand e26f660),
 *  4. die Start-Kits (Fassung 1 bis 4) wählen dieselben Waffen wie vorher (Gold, 4800 Plätze),
 *  5. die Strahlwaffen der Auslese tragen keinen Umkreis, den der Strahl nicht liest.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';

import { MatchController } from '../src/engine/match.js';
import { WEAPONS, WEAPONS_BY_ID } from '../src/shared/config/weapons.js';
import {
  WAFFEN_F4_WERTE, WAFFEN_F5_WERTE, WAFFEN_FEIN, WAFFEN_FAIR, getWaffe, waffeVorAuslese,
} from '../src/shared/config/waffen-fassung.js';
import { KIT_FLAECHE, getStartWaffen, getStartMunition, getClassLoadoutDetail } from '../src/shared/config/loadouts.js';
import { KISTEN_ALT } from '../src/shared/config/kisten.js';
import { buildEffect, SELF_TARGET_KINDS } from '../src/engine/specials.js';
import { AUSLESE_KORREKTUREN, KATALOG_F5_SCHADEN, computePowerScore, tierForScore } from '../scripts/build-weapon-catalog.mjs';

const sha = text => createHash('sha256').update(text).digest('hex');

/** Felder, die die Auslese im Katalog bewegen darf (alles andere ist Spielwert oder Ableitung davon). */
const ERLAUBT = new Set(['damage', 'damageSource', 'blastRadius', 'knockback', 'aoe', 'terrainDamage', 'elemental', 'powerScore', 'powerTier']);
const HOMING_ZIELSUCHE = ['pa_044', 'pa_133'];

test('Die Altwerte-Tabelle deckt genau die Waffen der Auslese und nur erlaubte Felder', () => {
  const erwartet = new Set([...Object.keys(KATALOG_F5_SCHADEN), ...Object.keys(AUSLESE_KORREKTUREN), ...HOMING_ZIELSUCHE]);
  assert.deepEqual(Object.keys(WAFFEN_F4_WERTE).sort(), [...erwartet].sort());
  for (const [id, alt] of Object.entries(WAFFEN_F4_WERTE)) {
    for (const [feld, wert] of Object.entries(alt)) {
      assert.ok(ERLAUBT.has(feld), `${id}: Feld ${feld} darf die Auslese nicht bewegen`);
      assert.notDeepEqual(WEAPONS_BY_ID[id][feld], wert, `${id}.${feld}: Altwert gleich Katalogwert`);
    }
    assert.ok('powerScore' in alt, `${id}: Leistungswert fehlt`);
  }
});

test('Katalogschaden gleich Spielwert der Fassung 5 (zehn Waffen)', () => {
  assert.equal(Object.keys(KATALOG_F5_SCHADEN).length, 10);
  assert.deepEqual(
    Object.fromEntries(Object.entries(WAFFEN_F5_WERTE).map(([id, f5]) => [id, f5.damage])),
    KATALOG_F5_SCHADEN,
    'Generator-Tabelle und WAFFEN_F5_WERTE müssen übereinstimmen',
  );
  for (const [id, schaden] of Object.entries(KATALOG_F5_SCHADEN)) {
    assert.equal(WEAPONS_BY_ID[id].damage, schaden, id);
    assert.equal(getWaffe(id, WAFFEN_FAIR).damage, schaden, id);
    assert.equal(WEAPONS_BY_ID[id].powerScore, computePowerScore(WEAPONS_BY_ID[id]), id);
    assert.equal(WEAPONS_BY_ID[id].powerTier, tierForScore(WEAPONS_BY_ID[id].powerScore), id);
  }
  // Die Fassungen 1 bis 4 sehen weiter die alten Werte.
  assert.equal(getWaffe('pa_055', WAFFEN_FEIN).damage, 65);
  assert.equal(getWaffe('pa_041', WAFFEN_FEIN).damage, 22);
});

test('Selbstwirkungen: Schaden 0, Wirkung unverändert; Zielsuche zählt 0,5 statt 5', () => {
  const selbst = ['pa_115', 'pa_122', 'pa_125', 'pa_126', 'pa_127', 'pa_128', 'pa_130', 'pa_131'];
  for (const id of selbst) {
    const w = WEAPONS_BY_ID[id];
    assert.equal(w.damage, 0, id);
    assert.equal(w.damageSource, 'none', id);
    assert.equal(w.powerScore, 0, id);
    assert.ok(SELF_TARGET_KINDS.has(buildEffect(w).kind), `${id}: keine Selbstwirkung`);
  }
  assert.equal(WEAPONS_BY_ID.pa_126.terrainDamage, 0);
  assert.equal(WEAPONS_BY_ID.pa_124.damage, 38, 'Wachgeschütz: der Katalogschaden speist das Geschütz');
  const blut = WEAPONS_BY_ID.pa_116;
  assert.deepEqual([blut.blastRadius, blut.aoe, blut.elemental.poison, blut.damage], [0, false, 0, 50]);
  for (const id of HOMING_ZIELSUCHE) assert.equal(WEAPONS_BY_ID[id].powerTier, 'epic', id);
  const leer = { damage: 0, blastRadius: 0, terrainDamage: 0, knockback: 0, aoe: false, piercing: 0, homing: 10, bounces: 0, elemental: {}, maxAmmo: 0, cooldown: 0, requiresLineOfSight: false };
  assert.equal(computePowerScore(leer), 5, 'Zielsuche 10 zählt mit Gewicht 0,5');
});

test('Die Wirkung jeder Waffe ist vor und nach der Auslese gleich', () => {
  for (const w of WEAPONS) {
    assert.deepEqual(buildEffect(w), buildEffect(waffeVorAuslese(w)), `${w.id} ${w.displayName}`);
  }
});

test('Strahlwaffen der Auslese tragen keinen Umkreis, Rückstoß oder Geländeabtrag', () => {
  const strahl = Object.keys(AUSLESE_KORREKTUREN).filter(id => !['pa_115', 'pa_122', 'pa_125', 'pa_126', 'pa_127', 'pa_128', 'pa_130', 'pa_131', 'pa_116'].includes(id));
  assert.equal(strahl.length, 21);
  for (const id of strahl) {
    const w = WEAPONS_BY_ID[id];
    assert.equal(w.delivery, 'hitscan', `${id} ist kein Strahl`);
    assert.equal(w.blastRadius, 0, id);
    assert.equal(w.knockback, 0, id);
    assert.equal(w.aoe, false, id);
    assert.equal(w.terrainDamage, 0, id);
  }
  // Brand, Fluch und Zug des Strahls bleiben: nur die Umkreisfelder sind weg.
  assert.equal(WEAPONS_BY_ID.pa_139.elemental.fire, 48);
  assert.equal(WEAPONS_BY_ID.pa_106.elemental.fire, 25);
});

/** Ein Schuss auf einen Nachbarn (gleiche Aufstellung wie bei der Messung am Stand e26f660). */
function schuss(id, waffen, winkel, kraft, abstand) {
  const m = new MatchController({
    seed: 31337, teams: 2, playersPerTeam: 1, preset: 'open', turnDurationMs: 1e6, kit: KIT_FLAECHE, kisten: KISTEN_ALT, schaden: 1, waffen,
  });
  m.start();
  const a = m.activePlayerId;
  const z = m.getState().entities.find(e => e.entityId !== a);
  const b = m.surfaceYAt(300);
  m.world.setComponent(a, 'Position', 'x', 300); m.world.setComponent(a, 'Position', 'y', b - 12);
  m.world.setComponent(z.entityId, 'Position', 'x', 300 + abstand); m.world.setComponent(z.entityId, 'Position', 'y', b - 12);
  m.world.setComponent(z.entityId, 'Health', 'max', 1000); m.world.setComponent(z.entityId, 'Health', 'current', 1000);
  m.world.setComponent(a, 'Health', 'max', 1000); m.world.setComponent(a, 'Health', 'current', 500);
  m.inventory.grantWeapon(a, id); m.inventory.selectWeapon(a, id);
  const r = m.fire(a, winkel, kraft, id);
  let g = 0; while (m.activeProjectileCount > 0 && g < 900) { m.step(); g += 1; }
  for (let i = 0; i < 40; i += 1) m.step();
  const ev = m.consumeEvents().map(e => e.type).join(',');
  return [r.ok, 1000 - m.world.getComponent(z.entityId, 'Health', 'current'), m.world.getComponent(a, 'Health', 'current'), m.stateHash(), ev.length];
}

test('Gefecht unverändert: je ein Schuss der 42 geänderten Waffen in Fassung 4 und 5 (Gold)', () => {
  const liste = [];
  for (const id of Object.keys(WAFFEN_F4_WERTE).sort()) {
    for (const f of [4, 5]) {
      for (const [wi, kr, ab] of [[0.05, 80, 30], [0.4, 60, 120], [Math.PI - 0.05, 90, 80]]) {
        liste.push([`${id}|${f}|${wi.toFixed(2)}`, schuss(id, f, wi, kr, ab)]);
      }
    }
  }
  assert.equal(liste.length, 252);
  assert.equal(sha(JSON.stringify(liste)), '0b594456890f8d7683347974a308c6e8240131cf7878a5bd5525a7d198bbf184');
});

test('Start-Kits unverändert: dieselben Startwaffen und Munition wie vor der Auslese (Gold)', () => {
  const kits = {};
  for (const kit of [1, 2, 3, 4]) {
    for (let seed = 1; seed <= 300; seed += 1) {
      for (let platz = 0; platz < 4; platz += 1) {
        const w = getStartWaffen('scout', kit, { seed, platz });
        kits[`${kit}|${seed}|${platz}`] = [w, getStartMunition(kit, w)];
      }
    }
  }
  assert.equal(sha(JSON.stringify(kits)), '884e3274666d8261682991279cc903ff3a2c67f55e88aec7bc67b558bc6e13b3');
  const klassen = {};
  for (const k of ['scout', 'heavy', 'artillery']) for (const n of [3, 4, 5, 6]) klassen[`${k}|${n}`] = getClassLoadoutDetail(k, n);
  assert.equal(sha(JSON.stringify(klassen)), '276bbd1294ff1202af54ba2f542944df669c0f20a49e04893334866e4fe19c88');
});
