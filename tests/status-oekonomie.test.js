/**
 * BAL-13: Status-, Schild-, Heil- und Buffökonomie mit ECHTEN Klassenleben.
 *
 * Die bisherigen Messungen in `tests/schadensarten.test.js` setzen das Ziel
 * bewusst auf 1000 LP, damit der direkte Schaden unbeschnitten bleibt. Genau
 * das verändert aber den 20-%-DoT-Deckel (200 statt 14/20/26) und lässt
 * Schild- sowie Heilsummen im Verhältnis zum Leben klein aussehen. Diese Datei
 * misst deshalb gegen die drei tatsächlichen Lebensgrößen:
 *
 *   okkultist 70, fernkampf 100, nahkampf 130.
 *
 * Jeder Abnahmepunkt aus BAL-13 hat eine Gegenprobe: Schild ohne Schild,
 * Rüstung ohne Rüstung, Verstärkung vor/nach Ablauf, ein/zwei Urheber.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MatchController } from '../src/engine/match.js';
import { KIT_FLAECHE } from '../src/shared/config/loadouts.js';
import { KISTEN_OFT } from '../src/shared/config/kisten.js';
import { KLASSEN_NEU } from '../src/shared/config/klassen-fassung.js';
import { SPECIAL_DEFAULTS } from '../src/engine/specials.js';
import { DAMAGE_TYPE_IDS } from '../src/engine/damageTypes.js';

const LEBEN = Object.freeze({ okkultist: 70, fernkampf: 100, nahkampf: 130 });
const KOERPER = DAMAGE_TYPE_IDS.indexOf('physical');

/** Ein Match mit zwei Spielern; die Klasse bestimmt das echte Leben. */
function aufbau(klasse = 'fernkampf', { playersPerTeam = 1, klassen = [null, null] } = {}) {
  const match = new MatchController({
    seed: 20261109,
    teams: 2,
    playersPerTeam,
    preset: 'open',
    turnDurationMs: 1_000_000,
    kit: KIT_FLAECHE,
    schaden: 2,
    kisten: KISTEN_OFT,
    waffen: 17,
    klassen: KLASSEN_NEU,
    loadouts: Array.from({ length: playersPerTeam * 2 }, (_, i) => ({ classId: klassen[i] ?? klasse })),
  });
  match.start();
  const schuetze = match.activePlayerId;
  const opfer = match.getState().entities.find(e => e.entityId !== schuetze).entityId;
  return { match, schuetze, opfer };
}

const hp = (match, id) => match.world.getComponent(id, 'Health', 'current');
const maxHp = (match, id) => match.world.getComponent(id, 'Health', 'max');

/** Wartet, bis der Spieler wirklich am Zug ist (maximal eine Runde). */
function warteBisAmZug(match, playerId) {
  let schritte = 0;
  while (match.status === 'playing' && match.activePlayerId !== playerId && schritte < 12) {
    match.endTurn();
    schritte += 1;
  }
  return match.status === 'playing' && match.activePlayerId === playerId;
}

/** Setzt eine Figur auf den festen Messplatz (flach, trocken). */
function setzePlatz(match, id, x) {
  match.world.setComponent(id, 'Position', 'x', x);
  match.world.setComponent(id, 'Position', 'y', match.surfaceYAt(x) - 12);
}

/** Benutzt eine Selbstwirkung als echter Schuss (Inventar, Munition, Cooldown). */
function selbstwirkung(match, playerId, weaponId) {
  assert.ok(warteBisAmZug(match, playerId), `${weaponId}: kein Zug`);
  match.inventory.grantWeapon(playerId, weaponId);
  match.inventory.grantAmmo(playerId, weaponId, 5);
  match.inventory.selectWeapon(playerId, weaponId);
  const ergebnis = match.fire(playerId, 0.5, 50, weaponId);
  assert.ok(ergebnis.ok, `${weaponId}: ${ergebnis.errors?.join(', ')}`);
  match.consumeEvents();
  return ergebnis;
}

/** Schuss auf das Ziel; liefert alle Ereignisse des Treffers. */
function schussAufZiel(match, schuetze, opfer, weaponId) {
  assert.ok(warteBisAmZug(match, schuetze), `${weaponId}: kein Zug`);
  setzePlatz(match, schuetze, 300);
  setzePlatz(match, opfer, 330);
  match.world.setComponent(opfer, 'Health', 'current', maxHp(match, opfer));
  match.statuses.remove(opfer);
  match.inventory.grantWeapon(schuetze, weaponId);
  match.inventory.grantAmmo(schuetze, weaponId, 99);
  match.inventory.selectWeapon(schuetze, weaponId);
  const ergebnis = match.fire(schuetze, 0.05, 80, weaponId);
  assert.ok(ergebnis.ok, `${weaponId}: ${ergebnis.errors?.join(', ')}`);
  for (let i = 0; i < 900 && match.activeProjectileCount > 0; i += 1) match.step();
  for (let i = 0; i < 20; i += 1) match.step();
  return match.consumeEvents();
}

/** Direkter Schaden über den Produktivpfad (inkl. Schild, Rüstung, Resistenz). */
function direkterSchaden(match, ziel, betrag, attackerId = null, art = KOERPER) {
  const vorher = hp(match, ziel);
  match.world.getSystem('damage').applyDamage(match.world, ziel, betrag, attackerId, { damageType: art });
  return vorher - hp(match, ziel);
}

/** Ereignisse, bis das Opfer das nächste Mal am Zug war. */
function naechsterZugDesOpfers(match, opfer) {
  const ereignisse = [];
  for (let i = 0; i < 80; i += 1) {
    match.endTurn();
    for (const e of match.consumeEvents()) {
      ereignisse.push(e);
      if ((e.type === 'turn_start' || e.type === 'turn_skipped') && e.payload.playerId === opfer) {
        return ereignisse;
      }
    }
  }
  assert.fail('Opfer war nicht am Zug');
}

// --------------------------------------------------------------- echte LP

test('echte LP: 70/100/130 aus dem Klassenvertrag, direkter Schaden wirkt unverändert', () => {
  for (const [klasse, leben] of Object.entries(LEBEN)) {
    const { match, opfer } = aufbau(klasse);
    assert.equal(maxHp(match, opfer), leben, `${klasse}: Maximalleben`);
    assert.equal(hp(match, opfer), leben, `${klasse}: Startleben`);
    assert.equal(direkterSchaden(match, opfer, 10), 10, `${klasse}: 10 Schaden`);
    assert.equal(hp(match, opfer), leben - 10, `${klasse}: Restleben`);
  }
});

// ---------------------------------------------------------------- Heilung

test('Heilgrenze: Heilung füllt nie über das echte Maximum, auch nicht umsonst', () => {
  for (const [klasse, leben] of Object.entries(LEBEN)) {
    const { match, schuetze } = aufbau(klasse);
    // 40 Heilung bei nur 10 fehlenden LP: es kommen genau 10 an.
    const fehlt = 10;
    match.world.setComponent(schuetze, 'Health', 'current', leben - fehlt);
    const r = selbstwirkung(match, schuetze, 'pa_092');
    assert.equal(r.special.healed, fehlt, `${klasse}: nur der fehlende Rest`);
    assert.equal(hp(match, schuetze), leben, `${klasse}: Maximum gehalten`);

    // Am vollen Leben verpufft dieselbe Heilung vollständig.
    const voll = selbstwirkung(match, schuetze, 'pa_092');
    assert.equal(voll.special.healed, 0, `${klasse}: nichts zu heilen`);
    assert.equal(hp(match, schuetze), leben, `${klasse}: kein Überlauf`);
  }
});

test('Heilgrenze Gegenprobe: 70 Heilung heilt an der echten Grenze, nicht darüber', () => {
  for (const [klasse, leben] of Object.entries(LEBEN)) {
    const { match, schuetze } = aufbau(klasse);
    const start = Math.max(1, leben - 80);
    match.world.setComponent(schuetze, 'Health', 'current', start);
    const r = selbstwirkung(match, schuetze, 'pa_094');
    assert.equal(r.special.healed, Math.min(70, leben - start), `${klasse}: nur bis zum Maximum`);
    assert.equal(hp(match, schuetze), Math.min(leben, start + 70), `${klasse}: exakt am Maximum`);
  }
});

test('Heilung unter Gift: zwei Stapel halbieren, einer nicht — mit Gegenprobe', () => {
  const heilungMit = (stapel) => {
    const { match, schuetze, opfer } = aufbau('okkultist');
    for (let i = 0; i < stapel; i += 1) match.mali.wende(opfer, 'gift', { dmg: 10, by: schuetze });
    return match.mali.heilung(opfer, 40);
  };
  assert.equal(heilungMit(0), 40, 'ohne Gift volle Heilung');
  assert.equal(heilungMit(1), 30, 'ein Stapel: 25 % Abzug');
  assert.equal(heilungMit(2), 20, 'zwei Stapel: 50 % Abzug');

  const { match, schuetze, opfer } = aufbau('okkultist');
  for (let i = 0; i < 20; i += 1) match.mali.wende(opfer, 'gift', { dmg: 10, by: schuetze });
  assert.equal(match.statuses.maliLesen(opfer).gift.length, 2, 'kein dritter Stapel');
});

// ----------------------------------------------------------------- Schild

test('Schild: pa_093/pa_101/pa_148 liefern exakt 40/55/75 Punkte', () => {
  for (const [waffe, punkte] of [['pa_093', 40], ['pa_101', 55], ['pa_148', 75]]) {
    const { match, schuetze } = aufbau('fernkampf');
    const r = selbstwirkung(match, schuetze, waffe);
    assert.equal(r.special.shield, punkte, `${waffe}: Schildwert`);
    assert.equal(match.statuses.shieldOf(schuetze), punkte, `${waffe}: gespeicherter Schild`);
  }
});

test('Schild Gegenprobe: fängt echten Schaden, ohne Schild geht er voll durch', () => {
  const mit = aufbau('fernkampf');
  selbstwirkung(mit.match, mit.schuetze, 'pa_093');
  assert.equal(direkterSchaden(mit.match, mit.schuetze, 30), 0, '40er Schild fängt 30');
  assert.equal(mit.match.statuses.shieldOf(mit.schuetze), 10, 'Rest 10');

  const ohne = aufbau('fernkampf');
  assert.equal(direkterSchaden(ohne.match, ohne.schuetze, 30), 30, 'ohne Schild voller Schaden');
});

test('Schild-Überlappung: 40+55=95, 55+75 wird auf 120 gedeckelt, nicht addiert', () => {
  const a = aufbau('fernkampf');
  selbstwirkung(a.match, a.schuetze, 'pa_093');
  selbstwirkung(a.match, a.schuetze, 'pa_101');
  assert.equal(a.match.statuses.shieldOf(a.schuetze), 95, '40 + 55');

  const b = aufbau('fernkampf');
  selbstwirkung(b.match, b.schuetze, 'pa_101');
  selbstwirkung(b.match, b.schuetze, 'pa_148');
  assert.equal(b.match.statuses.shieldOf(b.schuetze), SPECIAL_DEFAULTS.maxShield, '55 + 75 = 130 → 120');
  assert.equal(b.match.statuses.shieldOf(b.schuetze), 120, 'Obergrenze 120');
});

test('Schildrückwirkung: Eis, Blitz und Feuer belegen den Angreifer, Gegenprobe ohne Schild nicht', () => {
  for (const [waffe, malus, art] of [['pa_101', 'frost', 'ice'], ['pa_093', 'schock', 'electric'], ['pa_148', 'brand', 'fire']]) {
    const { match, schuetze, opfer } = aufbau('fernkampf');
    selbstwirkung(match, schuetze, waffe);
    direkterSchaden(match, schuetze, 10, opfer, DAMAGE_TYPE_IDS.indexOf(art));
    assert.equal(match.mali.hat(opfer, malus), true, `${waffe}: ${malus} auf den Angreifer`);
    const eintrag = match.statuses.maliLesen(opfer)[malus];
    assert.equal(Array.isArray(eintrag) ? eintrag[0].by : eintrag.by, schuetze, `${waffe}: Urheber ist das Schild`);

    const gegen = aufbau('fernkampf');
    direkterSchaden(gegen.match, gegen.schuetze, 10, gegen.opfer, DAMAGE_TYPE_IDS.indexOf(art));
    assert.equal(gegen.match.mali.hat(gegen.opfer, malus), false, `${waffe}: ohne Schild keine Rückwirkung`);
  }
});

// --------------------------------------------------------------- Rüstung

test('Rüstung: pa_130 senkt um 20 %, pa_126 um 35 % — am echten Leben gemessen', () => {
  for (const [waffe, satz] of [['pa_130', 0.2], ['pa_126', 0.35]]) {
    const { match, schuetze } = aufbau('okkultist');
    selbstwirkung(match, schuetze, waffe);
    assert.equal(match.statuses.armorOf(schuetze), satz, `${waffe}: Rüstungswert`);
    assert.equal(direkterSchaden(match, schuetze, 40), 40 * (1 - satz), `${waffe}: 40 × (1 − ${satz})`);
  }

  const ohne = aufbau('okkultist');
  assert.equal(direkterSchaden(ohne.match, ohne.schuetze, 40), 40, 'ohne Rüstung voller Schaden');
});

test('Rüstungs-Überlappung: der stärkere Satz bleibt, 20 % überschreibt 35 % nicht', () => {
  for (const reihenfolge of [['pa_130', 'pa_126'], ['pa_126', 'pa_130'], ['pa_126', 'pa_126']]) {
    const { match, schuetze } = aufbau('fernkampf');
    for (const waffe of reihenfolge) selbstwirkung(match, schuetze, waffe);
    assert.equal(match.statuses.armorOf(schuetze), reihenfolge.includes('pa_126') ? 0.35 : 0.2,
      `${reihenfolge.join(' → ')}: stärkster Wert`);
  }
});

// ------------------------------------------------------------------ Buff

test('Verstärkung: 1,7 wirkt auf echten Treffer und läuft danach sicher ab', () => {
  const baseline = aufbau('nahkampf');
  const ohne = schussAufZiel(baseline.match, baseline.schuetze, baseline.opfer, 'pa_083')
    .filter(e => e.type === 'damage' && e.payload.entityId === baseline.opfer && e.payload.dot !== true);
  const ohneSumme = ohne.reduce((s, e) => s + e.payload.amount, 0);
  assert.ok(ohneSumme > 0, 'Basisschuss trifft');

  const { match, schuetze, opfer } = aufbau('nahkampf');
  selbstwirkung(match, schuetze, 'pa_084');
  assert.equal(match.statuses.damageMultiplier(schuetze), 1.7, 'Verstärkung 1,7');
  const mit = schussAufZiel(match, schuetze, opfer, 'pa_083')
    .filter(e => e.type === 'damage' && e.payload.entityId === opfer && e.payload.dot !== true);
  const mitSumme = mit.reduce((s, e) => s + e.payload.amount, 0);
  assert.ok(Math.abs(mitSumme - ohneSumme * 1.7) < 0.01, `1,7×: ${mitSumme} gegen ${ohneSumme * 1.7}`);

  // Eigene Züge verstreichen lassen, bis die Verstärkung abgelaufen ist.
  assert.ok(warteBisAmZug(match, schuetze));
  assert.equal(match.statuses.damageMultiplier(schuetze), 1, 'nach dem Buff wieder 1,0');
  assert.equal(match.statuses.snapshot()[schuetze].boostTurns, 0, 'keine Restdauer');

  const danach = schussAufZiel(match, schuetze, opfer, 'pa_083')
    .filter(e => e.type === 'damage' && e.payload.entityId === opfer && e.payload.dot !== true);
  const danachSumme = danach.reduce((s, e) => s + e.payload.amount, 0);
  assert.ok(Math.abs(danachSumme - ohneSumme) < 0.01, `nach Ablauf wieder Basis: ${danachSumme} gegen ${ohneSumme}`);
});

test('Verstärkungs-Überlappung: stärkster Multiplikator, längste Dauer, nie über 5 Züge', () => {
  const { match, schuetze } = aufbau('fernkampf');
  for (let i = 0; i < 20; i += 1) match.statuses.addBoost(schuetze, 1.7, 2, 'fire');
  let zustand = match.statuses.snapshot()[schuetze];
  assert.equal(zustand.boostMultiplier, 1.7, 'kein Summenstapel');
  assert.equal(zustand.boostTurns, 2, 'keine unendliche Dauer');

  match.statuses.addBoost(schuetze, 1.2, 5, 'ice');
  zustand = match.statuses.snapshot()[schuetze];
  assert.equal(zustand.boostMultiplier, 1.7, 'schwacher Buff senkt den stärkeren nicht');
  assert.equal(zustand.boostTurns, SPECIAL_DEFAULTS.maxTurns, 'längste Dauer, gedeckelt auf 5');

  match.statuses.addBoost(schuetze, 1.3, 4, 'electric');
  zustand = match.statuses.snapshot()[schuetze];
  assert.equal(zustand.boostMultiplier, 1.7, 'weiterhin der stärkste Wert');
  assert.equal(zustand.boostTurns, SPECIAL_DEFAULTS.maxTurns, 'Dauer bleibt gedeckelt');

  for (let i = 0; i < SPECIAL_DEFAULTS.maxTurns; i += 1) match.statuses.advanceTurn(schuetze);
  zustand = match.statuses.snapshot()[schuetze];
  assert.equal(zustand.boostMultiplier, 1, 'nach 5 Zügen abgelaufen');
  assert.equal(zustand.boostTurns, 0, 'keine Restdauer');
});

// ------------------------------------------------------- Stapel und Betäubung

test('kein Dauerstun: zwei Urheber treffen nie zwei Züge hintereinander (20 Züge, 70 LP)', () => {
  const { match } = aufbau('okkultist', { playersPerTeam: 2 });
  const entities = match.getState().entities;
  const opfer = entities.find(e => e.teamId === 1).entityId;
  const angreifer = entities.filter(e => e.teamId === 0).map(e => e.entityId);
  const folge = [];
  const angewendet = [];

  for (let i = 0; i < 20; i += 1) {
    match.world.setComponent(opfer, 'Health', 'current', 70);
    const r = match.mali.betaeube(opfer, angreifer[i % angreifer.length], 'bal-13');
    angewendet.push(Boolean(r));
    const ereignisse = naechsterZugDesOpfers(match, opfer);
    folge.push(ereignisse.some(e => e.type === 'turn_skipped' && e.payload.playerId === opfer) ? 'S' : 'T');
    assert.equal(match.statuses.isFrozen(opfer), false, 'nach dem Zug nicht mehr eingefroren');
  }

  assert.equal(folge.join(''), 'STSTSTSTSTSTSTSTSTST', 'jede zweite Anwendung ist durch Schutz abgewehrt');
  assert.equal(folge.filter(x => x === 'S').length, 10, 'zehn Aussetzer in zwanzig Zügen');
  assert.equal(folge.some((x, i) => x === 'S' && folge[i + 1] === 'S'), false, 'kein Dauerstun');
  assert.deepEqual(angewendet.filter(Boolean).length, 10, 'Schutz blockiert die Wiederholung');
});

test('kein unendliches Stapeln: Gift bleibt bei 2, Brand bei 1, Mali bei 3', () => {
  const { match, schuetze, opfer } = aufbau('okkultist');
  for (let i = 0; i < 50; i += 1) match.mali.wende(opfer, 'gift', { dmg: 10, by: schuetze });
  assert.equal(match.statuses.maliLesen(opfer).gift.length, 2, 'Gift höchstens zwei Stapel');

  for (let i = 0; i < 50; i += 1) match.mali.wende(opfer, 'brand', { dmg: 10, by: schuetze });
  assert.equal(Array.isArray(match.statuses.maliLesen(opfer).brand), false, 'Brand bleibt ein Eintrag');
  assert.equal(match.statuses.maliLesen(opfer).brand.dmg, 8, '10 × 0,8, nicht 50 × 10');

  // Gegenprobe: die erste Anwendung wirkt, weitere Arten sind begrenzt.
  assert.equal(match.mali.hat(opfer, 'gift'), true);
  match.mali.wende(opfer, 'saeure', { by: schuetze });
  match.mali.wende(opfer, 'frost', { by: schuetze });
  match.mali.wende(opfer, 'fluch', { by: schuetze });
  const laufend = ['brand', 'gift', 'fluch', 'saeure', 'frost'].filter(k => match.mali.hat(opfer, k));
  assert.equal(laufend.length, 3, `höchstens drei Mali, gemessen ${laufend.join(',')}`);
});

// -------------------------------------------------- zwei Urheber und DoT-Deckel

test('DoT-Deckel mit echten LP: 14/20/26 je Zug, zwei Urheber teilen sich den Deckel', () => {
  for (const [klasse, leben] of Object.entries(LEBEN)) {
    const { match, schuetze, opfer } = aufbau(klasse);
    match.mali.wende(opfer, 'brand', { dmg: 100, by: schuetze, dauer: 3 });
    match.mali.wende(opfer, 'gift', { dmg: 100, by: schuetze, dauer: 3 });
    match.mali.wende(opfer, 'gift', { dmg: 100, by: schuetze, dauer: 3 });
    const tick = naechsterZugDesOpfers(match, opfer).find(e => e.type === 'dot_tick');
    assert.ok(tick, `${klasse}: DoT-Tick`);
    assert.equal(tick.payload.damage, Math.round(leben * 0.2), `${klasse}: 20 % von ${leben}`);
    assert.equal(tick.payload.gedeckelt, true, `${klasse}: Deckel greift`);
  }

  const { match, a, b, ziel } = (() => {
    const m = aufbau('okkultist', { playersPerTeam: 2 }).match;
    const entities = m.getState().entities;
    const [aId, bId] = entities.filter(e => e.teamId === 0).map(e => e.entityId);
    return { match: m, a: aId, b: bId, ziel: entities.find(e => e.teamId === 1).entityId };
  })();
  match.world.setComponent(ziel, 'Health', 'max', 70);
  match.world.setComponent(ziel, 'Health', 'current', 70);
  match.mali.wende(ziel, 'gift', { dmg: 100, by: a, dauer: 3 });
  match.mali.wende(ziel, 'gift', { dmg: 100, by: b, dauer: 3 });
  const tick = naechsterZugDesOpfers(match, ziel).find(e => e.type === 'dot_tick');
  assert.equal(tick.payload.damage, 14, '20 % von 70');
  assert.deepEqual(tick.payload.eintraege.map(e => e.by).sort(), [a, b].sort(), 'beide Urheber');
  assert.deepEqual(tick.payload.eintraege.map(e => e.schaden), [7, 7], 'je 7, nicht je 18');
});

test('DoT Gegenprobe: unter dem Deckel bleibt der volle Schaden stehen', () => {
  const { match, schuetze, opfer } = aufbau('okkultist');
  match.mali.wende(opfer, 'gift', { dmg: 10, by: schuetze, dauer: 3 });
  const tick = naechsterZugDesOpfers(match, opfer).find(e => e.type === 'dot_tick');
  assert.equal(tick.payload.damage, 10, '10 bleiben 10');
  assert.equal(tick.payload.gedeckelt, false, 'kein Deckel nötig');
});

// ------------------------------------------------------- Reinigung und Wasser

test('Reinigung: Heilzauber nimmt Frost, Heilspritze Schock, Wasser löscht Brand', () => {
  const a = aufbau('fernkampf');
  a.match.mali.wende(a.schuetze, 'frost', { by: a.opfer });
  assert.equal(a.match.mali.hat(a.schuetze, 'frost'), true);
  selbstwirkung(a.match, a.schuetze, 'pa_092');
  assert.equal(a.match.mali.hat(a.schuetze, 'frost'), false, 'pa_092 reinigt Frost');

  const b = aufbau('fernkampf');
  b.match.mali.wende(b.schuetze, 'schock', { by: b.opfer });
  selbstwirkung(b.match, b.schuetze, 'pa_094');
  assert.equal(b.match.mali.hat(b.schuetze, 'schock'), false, 'pa_094 reinigt Schock');

  const c = aufbau('fernkampf');
  c.match.mali.wende(c.schuetze, 'brand', { dmg: 10, by: c.opfer });
  assert.equal(c.match.mali.hat(c.schuetze, 'brand'), true, 'trocken brennt');
  c.match.mali.wende(c.schuetze, 'nass', { by: c.opfer });
  assert.equal(c.match.mali.hat(c.schuetze, 'brand'), false, 'Wasser löscht');
});

test('Heilung räumt ab 20 Brand/Säure/einen Giftstapel, ab 40 Fluch und alles Gift', () => {
  const { match, schuetze, opfer } = aufbau('okkultist');
  match.mali.wende(opfer, 'brand', { dmg: 10, by: schuetze });
  match.mali.wende(opfer, 'saeure', { by: schuetze });
  match.mali.wende(opfer, 'gift', { dmg: 10, by: schuetze });
  match.mali.wende(opfer, 'gift', { dmg: 10, by: schuetze });
  match.mali.heilung(opfer, 20);
  assert.equal(match.mali.hat(opfer, 'brand'), false, 'Brand weg');
  assert.equal(match.mali.hat(opfer, 'saeure'), false, 'Säure weg');
  assert.equal(match.statuses.maliLesen(opfer).gift.length, 1, 'genau ein Giftstapel weg');

  match.mali.wende(opfer, 'fluch', { dmg: 0, by: schuetze });
  match.mali.wende(opfer, 'gift', { dmg: 10, by: schuetze });
  assert.equal(match.statuses.maliLesen(opfer).gift.length, 2, 'wieder zwei Stapel');
  match.mali.heilung(opfer, 40);
  assert.equal(match.mali.hat(opfer, 'fluch'), false, 'Fluch gebrochen');
  assert.equal(match.mali.hat(opfer, 'gift'), false, 'alles Gift weg');
});

// ---------------------------------------------------------- Nachschub

test('Nachschub mit echtem Inventar: füllt die endliche Waffe, nie über die Kapazität', () => {
  for (const [waffe, menge] of [['pa_119', 2], ['pa_122', 3], ['pa_125', 4]]) {
    const { match, schuetze } = aufbau('fernkampf');
    match.inventory.register(schuetze, ['pa_072', waffe], { ammoPerWeapon: 1 });
    match.inventory.selectWeapon(schuetze, waffe);
    const kapazitaet = match.inventory.kapazitaet('pa_072');
    const r = match.fire(schuetze, 0.5, 50, waffe);
    assert.ok(r.ok, waffe);
    assert.equal(r.special.restored, menge, `${waffe}: ${menge} Ladungen`);
    assert.equal(match.inventory.getAmmo(schuetze, 'pa_072'), 1 + menge, `${waffe}: Vorrat der endlichen Waffe`);
    assert.ok(match.inventory.getAmmo(schuetze, 'pa_072') <= kapazitaet, `${waffe}: nicht über ${kapazitaet}`);
    assert.equal(match.inventory.getAmmo(schuetze, waffe), 0, `${waffe}: eigene Ladung verbraucht, nicht unendlich`);
  }
});

test('Nachschub Gegenprobe: bei vollem Inventar bleibt jede Waffe auf der Obergrenze', () => {
  const { match, schuetze } = aufbau('fernkampf');
  match.inventory.register(schuetze, ['pa_072', 'pa_125'], { ammoPerWeapon: 5 });
  for (let i = 0; i < 5; i += 1) {
    if (!warteBisAmZug(match, schuetze)) break;
    match.inventory.selectWeapon(schuetze, 'pa_125');
    const r = match.fire(schuetze, 0.5, 50, 'pa_125');
    assert.ok(r.ok, `Anwendung ${i + 1}`);
    assert.ok(r.special.restored >= 0 && r.special.restored <= 1, 'nur die eigene Ladung, kein Stapel');
    assert.ok(match.inventory.getAmmo(schuetze, 'pa_072') <= 5, 'endliche Waffe bleibt gedeckelt');
    assert.ok(match.inventory.getAmmo(schuetze, 'pa_125') <= 5, 'Nachschub bleibt gedeckelt');
  }
});

// ------------------------------------------------------------- Turret

test('Turret mit echtem Ziel und Leben: feuert, trifft den Gegner, läuft ab', () => {
  const { match, schuetze, opfer } = aufbau('fernkampf', { klassen: ['fernkampf', 'nahkampf'] });
  setzePlatz(match, schuetze, 300);
  setzePlatz(match, opfer, 360);
  match.world.setComponent(opfer, 'Health', 'current', 130);
  match.inventory.grantWeapon(schuetze, 'pa_124');
  match.inventory.grantAmmo(schuetze, 'pa_124', 5);
  match.inventory.selectWeapon(schuetze, 'pa_124');
  const r = match.fire(schuetze, 0.5, 60, 'pa_124');
  assert.ok(r.ok);
  assert.ok(r.special.turretId > 0, 'Geschütz aufgestellt');

  let schuesse = 0;
  let treffer = 0;
  let ablauf = 0;
  let eigenschaden = 0;
  for (let runde = 0; runde < 10; runde += 1) {
    match.endTurn();
    for (let i = 0; i < 2000 && match.activeProjectileCount > 0; i += 1) match.step();
    for (const e of match.consumeEvents()) {
      if (e.type === 'turret_fired') schuesse += 1;
      if (e.type === 'turret_expired') ablauf += 1;
      if (e.type === 'damage' && e.payload.entityId === opfer) treffer += 1;
      if (e.type === 'damage' && e.payload.entityId === schuetze) eigenschaden += 1;
    }
  }
  assert.ok(schuesse >= 2, `Geschütz feuert (${schuesse})`);
  assert.ok(treffer >= 1, 'Geschoss trifft das echte Ziel');
  assert.ok(hp(match, opfer) < 130, `Ziel verliert Leben: ${hp(match, opfer)}`);
  assert.equal(eigenschaden, 0, 'kein Eigenschaden');
  assert.equal(ablauf, 1, 'Geschütz läuft genau einmal ab');
});

test('Turret Gegenprobe: ohne Ziel in Reichweite wird nicht geschossen', () => {
  const { match, schuetze, opfer } = aufbau('fernkampf', { klassen: ['fernkampf', 'nahkampf'] });
  setzePlatz(match, schuetze, 300);
  setzePlatz(match, opfer, 2200);
  match.inventory.grantWeapon(schuetze, 'pa_124');
  match.inventory.grantAmmo(schuetze, 'pa_124', 5);
  match.inventory.selectWeapon(schuetze, 'pa_124');
  assert.ok(match.fire(schuetze, 0.5, 60, 'pa_124').ok);
  let schuesse = 0;
  for (let runde = 0; runde < 8; runde += 1) {
    match.endTurn();
    for (let i = 0; i < 2000 && match.activeProjectileCount > 0; i += 1) match.step();
    schuesse += match.consumeEvents().filter(e => e.type === 'turret_fired').length;
  }
  assert.equal(schuesse, 0, 'kein Blindfeuer');
});
