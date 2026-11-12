/**
 * Waffenfassung 21 (Entscheidungen des Auftraggebers vom 2026-11-11, GP-1/GP-2): je Entscheidungsnummer ein Beleg.
 * Fassungen 1 bis 20 bleiben bitgleich (Goldwerte unten, gemessen vor der Änderung am Stand 670fede + Arbeitsbaum).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';

import { MatchController } from '../src/engine/match.js';
import { ReplayRecorder } from '../src/engine/replay.js';
import { WEAPONS } from '../src/shared/config/weapons.js';
import {
  WAFFEN_FEUERWESEN, WAFFEN_ENTSCHEIDUNG, WAFFEN_STANDARD, normalisiereWaffen, getWaffe,
} from '../src/shared/config/waffen-fassung.js';
import {
  ZUENDZEITEN, istZuendzeit, nutzwertVon, NUTZEN_JE_WAFFE, STUFEN_SCHWELLEN, KATEGORIE_NACH_WIRKUNG,
} from '../src/shared/config/waffen-f21.js';
import { POWER_TIERS } from '../scripts/build-weapon-catalog.mjs';
import { normalizeInput } from '../src/shared/validation.js';
import { KIT_FLAECHE } from '../src/shared/config/loadouts.js';
import { KISTEN_ALT } from '../src/shared/config/kisten.js';
import { kistenInhalt } from '../src/engine/kistenSicht.js';
import { kistenBeschriftung, kistenMitInhalt } from '../src/client/kistenSichtAnzeige.js';
import { ZuendzeitSteuerung } from '../src/client/zuendzeitSteuerung.js';
import { KLASSEN_STANDARD } from '../src/shared/config/klassen-fassung.js';
import { launchSpeedMultiplier } from '../src/shared/launchSpeed.js';
import { POWER_TO_SPEED, PROJECTILE_GRAVITY } from '../src/shared/ballistics.js';
import { CONTROL } from '../src/shared/protocol.js';

const F20 = WAFFEN_FEUERWESEN;
const F21 = WAFFEN_ENTSCHEIDUNG;

function match({ waffen = F21, seed = 31337 } = {}) {
  const m = new MatchController({ seed, teams: 2, playersPerTeam: 1, preset: 'open', turnDurationMs: 1e9, kisten: 0, schaden: 1, waffen });
  m.start();
  return m;
}

function aufbau(m, id, abstand) {
  const a = m.activePlayerId;
  const z = m.getState().entities.find(e => e.entityId !== a);
  m.world.setComponent(a, 'Position', 'x', 300);
  m.world.setComponent(a, 'Position', 'y', m.surfaceYAt(300) - 12);
  m.world.setComponent(z.entityId, 'Position', 'x', 300 + abstand);
  m.world.setComponent(z.entityId, 'Position', 'y', m.surfaceYAt(300 + abstand) - 12);
  m.world.setComponent(z.entityId, 'Health', 'max', 1000);
  m.world.setComponent(z.entityId, 'Health', 'current', 1000);
  m.inventory.grantWeapon(a, id);
  m.inventory.selectWeapon(a, id);
  return { a, z: z.entityId };
}

function lauf(m, takte = 600) {
  const ereignisse = [];
  for (let i = 0; i < takte; i += 1) { m.step(); for (const e of m.consumeEvents()) ereignisse.push({ ...e, takt: i }); }
  return ereignisse;
}

test('Fassung 21 ist Standard; 20 und älter bleiben wählbar', () => {
  assert.equal(WAFFEN_STANDARD, F21);
  assert.equal(F21, F20 + 1);
  assert.equal(normalisiereWaffen(21), 21);
  assert.equal(normalisiereWaffen(20), 20);
  assert.equal(normalisiereWaffen(99), F21);
});

test('Fassung 20 bleibt bitgleich: ein Schuss jeder der 150 Waffen (Gold)', () => {
  const zeilen = [];
  const schuss = (id, winkel, kraft, abstand) => {
    const m = new MatchController({ seed: 31337, teams: 2, playersPerTeam: 1, preset: 'open', turnDurationMs: 1e9, kit: KIT_FLAECHE, kisten: KISTEN_ALT, schaden: 1, waffen: F20 });
    m.start();
    const { a, z } = aufbau(m, id, abstand);
    const r = m.fire(a, winkel, kraft, id);
    let g = 0;
    while (m.activeProjectileCount > 0 && g < 900) { m.step(); g += 1; }
    for (let i = 0; i < 400; i += 1) m.step();
    m.consumeEvents();
    return `${id}:${r.ok}:${1000 - m.world.getComponent(z, 'Health', 'current')}:${m.stateHash()}`;
  };
  for (const w of WEAPONS) { zeilen.push(schuss(w.id, 0.05, 80, 30)); zeilen.push(schuss(w.id, 0.6, 70, 200)); }
  assert.equal(createHash('sha256').update(zeilen.join('\n')).digest('hex'),
    'ee313694a37d6c4d2f49df5410434dba0274ae65e2c8600f3c1dbfe42d3200fc');
});

test('Katalog bleibt 150 Waffen mit eindeutigen Kennungen, auch in Fassung 21', () => {
  assert.equal(WEAPONS.length, 150);
  const f21 = WEAPONS.map(w => getWaffe(w.id, F21));
  assert.equal(new Set(f21.map(w => w.id)).size, 150);
  assert.equal(new Set(f21.map(w => w.displayName)).size, 150, 'Anzeigenamen eindeutig');
});

test('(8) Zielsuche zählt 0,5: Superschaf und Phönixschlag sind epic, nicht legendary', () => {
  for (const id of ['pa_133', 'pa_044']) {
    const w = getWaffe(id, F21);
    assert.equal(w.powerTier, 'epic', id);
    assert.equal(w.powerScore, WEAPONS.find(x => x.id === id).powerScore, `${id}: Katalogwert (Gewicht 0,5)`);
  }
});

test('(9) Nutzwert: Waffen ohne Schaden bekommen eine Bewertung; Stufen folgen den Schwellen des Generators', () => {
  assert.deepEqual(STUFEN_SCHWELLEN.map(s => [s.tier, s.min]), POWER_TIERS.map(s => [s.tier, s.min]));
  assert.ok(Object.keys(NUTZEN_JE_WAFFE).length >= 15);
  for (const id of Object.keys(NUTZEN_JE_WAFFE)) {
    const w = getWaffe(id, F21);
    assert.ok(w.nutzwert > 0, `${id}: Nutzwert`);
    assert.equal(w.powerScore, w.nutzwert, id);
  }
  assert.equal(nutzwertVon('pa_088'), 74.25, 'Dimensionsriss: 165 px × 0,5 × 0,9');
  assert.equal(getWaffe('pa_088', F21).powerTier, 'uncommon');
  assert.equal(getWaffe('pa_088', F20).powerScore, 0, 'Fassung 20 sieht den Nutzwert nicht');
});

test('(10, 21) Zünderwaffen: +15 % Schaden (Grenze 79), sonst Radius; Zündzeit 1, 3 oder 5 s einstellbar', () => {
  const zuender = WEAPONS.filter(w => w.fuseTime > 0).map(w => w.id);
  assert.equal(zuender.length, 11);
  for (const id of zuender) {
    const alt = getWaffe(id, F20);
    const neu = getWaffe(id, F21);
    const mehr = neu.damage > alt.damage || neu.blastRadius > alt.blastRadius;
    assert.ok(mehr, `${id}: Schaden oder Radius angehoben`);
    if (neu.category !== 'ultimate') assert.ok(neu.damage <= 79, `${id}: kein Ein-Treffer-Kill`);
    assert.equal(neu.fuseTime, alt.fuseTime, `${id}: Katalogzünder bleibt`);
  }
  assert.deepEqual([...ZUENDZEITEN], [1, 3, 5]);
  assert.equal(istZuendzeit(2), false);

  const ticks = new Map();
  for (const z of [1, 3, 5]) {
    const m = match();
    const { a } = aufbau(m, 'pa_046', 400);
    assert.equal(m.fire(a, 1.0, 60, 'pa_046', z).ok, true);
    ticks.set(z, lauf(m, 900).find(e => e.type === 'fuse_expired')?.takt);
  }
  assert.equal(ticks.get(1), 59);
  assert.equal(ticks.get(3), 179);
  assert.equal(ticks.get(5), 299);
  // Ungültig oder nicht gewählt: abgelehnt bzw. Katalogwert
  const m = match();
  const { a } = aufbau(m, 'pa_046', 400);
  assert.equal(m.fire(a, 1.0, 60, 'pa_046', 2).ok, false);
  assert.equal(m.fire(a, 1.0, 60, 'pa_046', 4.5).ok, false);
  // Fassung 20 ignoriert eine gültige Zündzeit (Zünder bleibt 3 s)
  const m20 = match({ waffen: F20 });
  const s20 = aufbau(m20, 'pa_046', 400);
  assert.equal(m20.fire(s20.a, 1.0, 60, 'pa_046', 5).ok, true);
  assert.equal(lauf(m20, 900).find(e => e.type === 'fuse_expired')?.takt, 179);
});

test('(10) Zündzeit: Server-Validierung, Replay-Eintrag, Bedienung', () => {
  assert.equal(normalizeInput({ angle: 1, power: 50, zuendzeit: 5 }).valid, true);
  assert.equal(normalizeInput({ angle: 1, power: 50, zuendzeit: 5 }).input.zuendzeit, 5);
  for (const schlecht of [2, 0, -1, '3', true, NaN, [3], {}]) {
    assert.equal(normalizeInput({ angle: 1, power: 50, zuendzeit: schlecht }).valid, false, `abgelehnt: ${JSON.stringify(schlecht)}`);
  }
  assert.equal(normalizeInput({ angle: 1, power: 50 }).input.zuendzeit, undefined, 'ohne Angabe bleibt das Feld weg');

  const rek = new ReplayRecorder({ seed: 1, config: {} });
  rek.recordInput({ tick: 5, playerId: 1, angle: 1, power: 50, weaponId: 'pa_046', zuendzeit: 1 });
  rek.recordInput({ tick: 6, playerId: 1, angle: 1, power: 50, weaponId: 'pa_001' });
  const eintraege = rek.toJSON().entries;
  assert.equal(eintraege[0].zuendzeit, 1);
  assert.equal('zuendzeit' in eintraege[1], false, 'alte Eintragsform bleibt unverändert');

  const st = new ZuendzeitSteuerung();
  const waffe = getWaffe('pa_046', F21);
  assert.equal(st.wert(waffe, F21), 3, 'ohne Wahl: Katalogwert');
  assert.equal(st.weiter(waffe, F21), 5);
  assert.equal(st.weiter(waffe, F21), 1);
  assert.equal(st.weiter(waffe, F21), 3);
  assert.equal(st.fuerSchuss(getWaffe('pa_001', F21), F21), null, 'Waffe ohne Zünder');
  assert.equal(st.fuerSchuss(getWaffe('pa_046', F20), F20), null, 'Fassung 20 kennt die Einstellung nicht');
  assert.equal(st.text(waffe, F21), 'Zünder 3 s');
});

test('(11) Kategorien nach Wirkung; Menügruppe folgt', () => {
  for (const [id, kategorie] of Object.entries(KATEGORIE_NACH_WIRKUNG)) {
    assert.equal(getWaffe(id, F21).category, kategorie, id);
    assert.notEqual(getWaffe(id, F20).category, kategorie, `${id}: Fassung 20 behält die alte Kategorie`);
  }
  assert.equal(getWaffe('pa_113', F21).category, 'tech');
  assert.equal(getWaffe('pa_113', F21).subcategory, 'special');
  assert.equal(getWaffe('pa_134', F21).subcategory, 'guns');
});

test('(12) Kaktusbombe: Gift als Schadensart', () => {
  assert.equal(getWaffe('pa_028', F20).damageType, 'physical');
  assert.equal(getWaffe('pa_028', F21).damageType, 'poison');
});

test('(13, 20) Handgranate: echter Radius, zwei Abpraller bleiben', () => {
  assert.equal(getWaffe('pa_047', F20).blastRadius, 0);
  assert.ok(getWaffe('pa_047', F21).blastRadius >= 40);
  assert.equal(getWaffe('pa_047', F21).bounces, 2);
  assert.equal(getWaffe('pa_047', F21).bounces, getWaffe('pa_047', F20).bounces);
});

test('(14) Allsehendes Auge: Kisteninhalt nur mit laufender Wirkung, nur lebende Kisten', () => {
  const m = new MatchController({ seed: 4242, teams: 2, playersPerTeam: 1, preset: 'open', turnDurationMs: 1e9, waffen: F21 });
  m.start();
  const a = m.activePlayerId;
  const gegner = m.getState().entities.find(e => e.entityId !== a).entityId;
  for (const [x, art, waffe] of [[500, 0, 1], [700, 3, 0], [900, 2, 0]]) {
    const k = m.world.createEntity();
    m.world.addComponent(k, 'Position', { x, y: m.surfaceYAt(x) - 8 });
    m.world.addComponent(k, 'Velocity', { x: 0, y: 0 });
    m.world.addComponent(k, 'Crate', { crateType: art, crateX: x, crateY: 0, rarity: 0, weaponId: waffe, picked: 0, ammo: 0, inFlight: 0, flightTicks: 0 });
  }
  assert.equal(m.getState().crates.length >= 3, true, 'Prüfstand braucht Kisten');
  assert.deepEqual(kistenInhalt(m.world, m.statuses, a), [], 'ohne Wirkung sieht niemand etwas');
  m.statuses.reveal(a, 2);
  const inhalt = kistenInhalt(m.world, m.statuses, a);
  assert.equal(inhalt.length, m.getState().crates.length, 'alle liegenden Kisten');
  assert.ok(inhalt.every(k => typeof k.art === 'string'));
  assert.ok(inhalt.some(k => k.weaponId) || inhalt.every(k => k.art !== 'weapon'), 'Waffenkisten nennen die Waffe');
  assert.deepEqual(kistenInhalt(m.world, m.statuses, gegner), [], 'der Gegner sieht nichts');
  // Anzeige
  const mit = kistenMitInhalt(m.getState().crates, inhalt);
  assert.ok(mit.every(k => k.inhalt));
  assert.equal(kistenBeschriftung({ art: 'weapon', weaponId: 'pa_001' }, F21), getWaffe('pa_001', F21).displayName);
  assert.equal(kistenBeschriftung({ art: 'trap', weaponId: null }, F21), 'Falle');
  const roh = m.getState().crates;
  assert.equal(kistenMitInhalt(roh, []), roh);
  assert.equal(CONTROL.KISTEN_SICHT, 'kisten_sicht');
});

test('(16, 22) Luftangriff, Meteorregen, Höllenkanone: Projektil mit Anflug, genau EIN Treffer', () => {
  for (const id of ['pa_134', 'pa_135', 'pa_139']) {
    const alt = getWaffe(id, F20);
    const neu = getWaffe(id, F21);
    assert.equal(alt.delivery, 'hitscan');
    assert.equal(neu.delivery, 'projectile', id);
    assert.ok(neu.blastRadius > 0 && neu.projectileSpeed > 0, id);
    assert.equal(neu.strikeStyle, alt.strikeStyle, `${id}: Anflug bleibt`);

    const m = match();
    const { a, z } = aufbau(m, id, 541);
    const r = m.fire(a, 0, 30, id);
    assert.equal(r.ok, true);
    assert.ok(Number.isInteger(r.projectileId), `${id}: sichtbares Geschoss`);
    const ev = lauf(m, 400);
    assert.ok(ev.some(e => e.type === 'projectile_spawn'), `${id}: Geschoss entsteht`);
    assert.ok(!ev.some(e => e.type === 'hitscan'), `${id}: kein Strahl`);
    const treffer = ev.filter(e => e.type === "damage" && e.payload.entityId === z && !e.payload.dot);
    assert.ok(treffer.length <= 1, `${id}: höchstens ein Schadensereignis je Ziel (${treffer.length})`);
    assert.equal(treffer.length, 1, `${id}: trifft`);
  }
  // Himmelsschlag-Waffen des Katalogs: derselbe Vorstrahl macht keinen Schaden mehr (seit Fassung 9)
  for (const id of ['pa_039', 'pa_065', 'pa_066']) {
    const m = match();
    const { a, z } = aufbau(m, id, 541);
    m.fire(a, 0, 30, id);
    const treffer = lauf(m, 400).filter(e => e.type === 'damage' && e.payload.entityId === z);
    assert.ok(treffer.length <= 1, `${id}: kein Doppeltreffer (${treffer.length})`);
    if (id === 'pa_066') assert.equal(treffer.length, 1);
  }
});

test('(16) Das Geschoss des Luftangriffs trifft Deckung auf dem Weg', () => {
  const m = match();
  const { a, z } = aufbau(m, 'pa_135', 600);
  // Mauer zwischen Schütze und Ziel, hoch genug für den Flug von oben
  for (let x = 560; x < 600; x += 1) for (let y = 0; y < m.surfaceYAt(600) + 200; y += 1) m.terrain.setPixel(x, y, true);
  m.fire(a, 0, 30, 'pa_135');
  const ev = lauf(m, 400);
  const einschlag = ev.find(e => e.type === 'projectile_impact');
  assert.ok(einschlag, 'schlägt ein');
  assert.ok(Math.abs(einschlag.payload.x - 580) < 60 || einschlag.payload.target === null, 'Gelände hält das Geschoss auf');
  assert.ok(m.world.getComponent(z, 'Health', 'current') >= 900, 'das Ziel hinter der Wand bleibt (fast) unversehrt');
});

test('(17) Astralkugel und Gedankensturm: Abklingzeit 2 statt 3', () => {
  for (const id of ['pa_091', 'pa_102']) {
    assert.equal(getWaffe(id, F20).cooldown, 3);
    assert.equal(getWaffe(id, F21).cooldown, 2);
  }
});

test('(18) Portale zusammengeführt, 150 Waffen bleiben: neue Waffe auf dem frei gewordenen Platz', () => {
  const portal = getWaffe('pa_076', F21);
  assert.equal(portal.displayName, 'Portal');
  assert.equal(portal.special, 'portal');
  const neu = getWaffe('pa_079', F21);
  assert.notEqual(neu.special, 'portal_field');
  assert.equal(neu.displayName, 'Funkenkugel');
  assert.equal(neu.delivery, 'projectile');
  assert.ok(neu.damage > 0);
  const namen = WEAPONS.map(w => getWaffe(w.id, F21).displayName);
  assert.ok(!namen.includes('Kosmisches Portal') && !namen.includes('Portalring'));
  assert.equal(getWaffe('pa_079', F20).displayName, 'Kosmisches Portal', 'Fassung 20 behält beide Portale');
  // Die neue Waffe schießt und trifft
  const m = match();
  const { a, z } = aufbau(m, 'pa_079', 40);
  assert.equal(m.fire(a, 0.03, 60, 'pa_079').ok, true);
  lauf(m, 300);
  assert.ok(m.world.getComponent(z, 'Health', 'current') < 1000);
});

test('(19) Giftwolke und Tentakelgift: Gift auf dem Deckel (Summe 36 = 18 je Zug)', () => {
  for (const id of ['pa_070', 'pa_073']) {
    assert.ok(getWaffe(id, F20).elemental.poison > 36);
    assert.equal(getWaffe(id, F21).elemental.poison, 36);
  }
  assert.equal(getWaffe('pa_062', F21).elemental.fire, getWaffe('pa_062', F20).elemental.fire, 'Flammenwerfer liegt schon unter dem Deckel');
});

test('(25) Lebensdauer: kein Geschoss verfällt vor dem Ende seiner Flugbahn über ebenem Grund', () => {
  let zuKurz20 = 0;
  let zuKurz21 = 0;
  let geprueft = 0;
  for (const klasse of ['nahkampf', 'fernkampf', 'okkultist']) {
    const loadouts = [{ classId: klasse, archetypeId: null }, { classId: klasse, archetypeId: null }];
    const m20 = new MatchController({ seed: 5, teams: 2, playersPerTeam: 1, preset: 'open', turnDurationMs: 1e9, waffen: F20, klassen: KLASSEN_STANDARD, loadouts });
    const m21 = new MatchController({ seed: 5, teams: 2, playersPerTeam: 1, preset: 'open', turnDurationMs: 1e9, waffen: F21, klassen: KLASSEN_STANDARD, loadouts });
    m20.start(); m21.start();
    for (const w0 of WEAPONS) {
      const w = getWaffe(w0.id, F21);
      if (w.delivery !== 'projectile' || !(w.projectileSpeed > 0) || w.strikeStyle !== 'self') continue;
      geprueft += 1;
      const v = 100 * POWER_TO_SPEED * launchSpeedMultiplier({ classId: klasse, archetypeId: null, weapon: w, kartenbreite: m21.width, klassen: KLASSEN_STANDARD });
      const flug = (2 * v * Math.sin(Math.PI / 4)) / (PROJECTILE_GRAVITY * (w.gravityScale || 1));
      const l20 = m20.projectileLifetime(m20.activePlayerId, Math.PI / 4, 100, getWaffe(w0.id, F20));
      const l21 = m21.projectileLifetime(m21.activePlayerId, Math.PI / 4, 100, w);
      assert.ok(l21 >= l20, `${w0.id}: der Deckel wird nie kürzer`);
      if (l20 < flug) zuKurz20 += 1;
      if (l21 < flug) zuKurz21 += 1;
    }
  }
  assert.ok(geprueft > 100);
  assert.ok(zuKurz20 > 0, 'in Fassung 20 war der Deckel bei einem Teil der Kombinationen zu kurz');
  assert.equal(zuKurz21, 0, 'in Fassung 21 deckt der Deckel jede Flugbahn');
});
