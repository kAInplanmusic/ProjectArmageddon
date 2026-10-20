/**
 * Tests: Schadensarten und ihre Mali (`config.schaden`, Fassung 2).
 *
 * Fassung 1 bleibt bitgleich (Goldhashes, gemessen auf main, Stand 1273330 + Merge);
 * Fassung 2 ist deterministisch, rundlaufend im Replay und hält die Obergrenzen ein.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MatchController } from '../src/engine/match.js';
import { ReplayRecorder } from '../src/engine/replay.js';
import { KIT_FLAECHE } from '../src/shared/config/loadouts.js';
import { DAMAGE_TYPE_IDS } from '../src/engine/damageTypes.js';
import {
  SCHADEN_ALT, SCHADEN_STATUS, SCHADEN_STANDARD, normalisiereSchaden, MALUS, MALUS_SCHLUESSEL, OBERGRENZEN,
  ART_REGEL, FAMILIE_VON_ART, ZAHL_FAMILIE, maliMaske, maskeZuMali, maliMarken, resistenzFaktor, dauerAbzug,
  MALI_LEITUNGSMARKE,
} from '../src/shared/config/schaden.js';
import { findeZahlen } from '../src/client/schadenszahlen.js';

function aufbau(fassung = SCHADEN_STATUS, extra = {}) {
  const match = new MatchController({
    seed: 31337, teams: 2, playersPerTeam: 1, preset: 'open', turnDurationMs: 1_000_000, kit: KIT_FLAECHE, schaden: fassung,
    loadouts: [0, 1].map(() => ({ classId: 'scout', archetypeId: 'brawler' })), ...extra,
  });
  match.start();
  const schuetze = match.activePlayerId;
  const opfer = match.getState().entities.find(e => e.entityId !== schuetze).entityId;
  const boden = match.surfaceYAt(300);
  match.world.setComponent(schuetze, 'Position', 'x', 300);
  match.world.setComponent(schuetze, 'Position', 'y', boden - 12);
  match.world.setComponent(opfer, 'Position', 'x', 330);
  match.world.setComponent(opfer, 'Position', 'y', boden - 12);
  match.world.setComponent(opfer, 'Health', 'max', 1000);
  match.world.setComponent(opfer, 'Health', 'current', 1000);
  return { match, schuetze, opfer };
}

function schuss(match, schuetze, id) {
  match.inventory.grantWeapon(schuetze, id);
  match.inventory.grantAmmo(schuetze, id, 99);
  match.inventory.selectWeapon(schuetze, id);
  assert.ok(match.fire(schuetze, 0.05, 80, id).ok, id);
  let g = 0;
  while (match.activeProjectileCount > 0 && g < 900) { match.step(); g += 1; }
  for (let i = 0; i < 20; i += 1) match.step();
}

const hp = (match, id) => match.world.getComponent(id, 'Health', 'current');

/** Lässt `n` Zugbeginne des Opfers vergehen und sammelt alle Ereignisse. */
function zuegeDesOpfers(match, opfer, n) {
  const ereignisse = [];
  let gezaehlt = 0;
  for (let i = 0; i < 40 && gezaehlt < n; i += 1) {
    match.endTurn();
    for (const e of match.consumeEvents()) {
      ereignisse.push(e);
      if ((e.type === 'turn_start' || e.type === 'turn_skipped') && e.payload.playerId === opfer) gezaehlt += 1;
    }
  }
  return ereignisse;
}

// ------------------------------------------------------------ Fassungen

test('Fassungen: Standard ist 2, unbekannte Werte fallen auf den Standard', () => {
  assert.equal(SCHADEN_STANDARD, SCHADEN_STATUS);
  assert.equal(normalisiereSchaden(1), SCHADEN_ALT);
  assert.equal(normalisiereSchaden(2), SCHADEN_STATUS);
  assert.equal(normalisiereSchaden(undefined), SCHADEN_STANDARD);
  assert.equal(normalisiereSchaden(9), SCHADEN_STANDARD);
});

test('Tabelle: jede der 27 Schadensarten hat Regel und Familie; Mali verweisen auf bekannte Einträge', () => {
  assert.equal(DAMAGE_TYPE_IDS.length, 27);
  for (const art of DAMAGE_TYPE_IDS) {
    assert.ok(ART_REGEL[art], `${art}: Regel fehlt`);
    assert.ok(ZAHL_FAMILIE[FAMILIE_VON_ART[art]], `${art}: Familie fehlt`);
    const malus = ART_REGEL[art].malus;
    assert.ok(malus === null || MALUS[malus], `${art}: unbekannter Malus ${malus}`);
    if (malus === null) assert.ok(ART_REGEL[art].grund, `${art}: kein Malus braucht einen Grund`);
  }
  assert.equal(new Set(MALUS_SCHLUESSEL.map(k => MALUS[k].bit)).size, MALUS_SCHLUESSEL.length);
  assert.deepEqual(maskeZuMali(maliMaske({ brand: {}, nass: {} })), { brand: {}, nass: {} });
  assert.ok(MALI_LEITUNGSMARKE > maliMaske(Object.fromEntries(MALUS_SCHLUESSEL.map(k => [k, {}]))));
});

// ---------------------------------------------- Fassung 1 bitgleich (Gold)

const GOLD_F1 = {
  pa_072: ['75e71a93', 69.7], pa_071: ['236894be', 21.8], pa_070: ['bf0bd24b', 79.1],
  pa_097: ['e1f7aceb', 38], pa_129: ['3d465279', 48],
};

function szenario(id, fassung) {
  const { match, schuetze, opfer } = aufbau(fassung);
  schuss(match, schuetze, id);
  for (let i = 0; i < 6; i += 1) match.endTurn();
  return { hash: match.stateHash(), verloren: Math.round((1000 - hp(match, opfer)) * 10) / 10 };
}

test('Fassung 1 (Altkopf): Feuer, Eis, Gift, Schlaf und Kettenblitz wirken Bit für Bit wie auf main', () => {
  for (const [id, [hash, verloren]] of Object.entries(GOLD_F1)) {
    const r = szenario(id, SCHADEN_ALT);
    assert.equal(r.hash, hash, `${id}: Hash`);
    assert.equal(r.verloren, verloren, `${id}: Schaden`);
  }
});

test('Fassung 1: das Schadensereignis trägt keine neuen Felder, Fassung 2 trägt sie', () => {
  for (const [fassung, erwartet] of [[SCHADEN_ALT, false], [SCHADEN_STATUS, true]]) {
    const { match, schuetze } = aufbau(fassung);
    schuss(match, schuetze, 'pa_072');
    const damage = match.consumeEvents().find(e => e.type === 'damage' && e.payload.entityId !== schuetze);
    assert.ok(damage);
    assert.equal('isCritical' in damage.payload, erwartet);
    if (erwartet) {
      assert.equal(damage.payload.isCritical, false);
      assert.equal(damage.payload.selfDamage, false);
      assert.equal(damage.payload.targetEntityId, damage.payload.entityId);
      assert.equal(damage.payload.sourceEntityId, schuetze);
      assert.ok(Number.isFinite(damage.payload.x) && Number.isFinite(damage.payload.y));
    }
  }
});

test('Fassung 2: Selbstschaden (Quelle = Ziel) wird gekennzeichnet, ein Treffer auf den Gegner nicht', () => {
  const { match, schuetze, opfer } = aufbau();
  const system = match.world.getSystem('damage');
  system.applyDamage(match.world, schuetze, 5, schuetze, { damageType: 0 });
  system.applyDamage(match.world, opfer, 5, schuetze, { damageType: 0 });
  const [eigen, fremd] = match.consumeEvents().filter(e => e.type === 'damage');
  assert.equal(eigen.payload.selfDamage, true);
  assert.equal(fremd.payload.selfDamage, false);
});

// ------------------------------------------------ Determinismus und Replay

test('Fassung 2: zwei Läufe mit gleichem Seed ergeben denselben Hash, und Mali verändern ihn', () => {
  for (const id of ['pa_072', 'pa_071', 'pa_070', 'pa_097', 'pa_129']) {
    assert.equal(szenario(id, SCHADEN_STATUS).hash, szenario(id, SCHADEN_STATUS).hash, id);
  }
  assert.notEqual(szenario('pa_072', SCHADEN_STATUS).hash, szenario('pa_072', SCHADEN_ALT).hash);
});

test('Replay: neue Aufzeichnung trägt schaden 2, eine Datei ohne das Feld ist Fassung 1', () => {
  const neu = new ReplayRecorder({ seed: 4242, teams: 2, playersPerTeam: 1, preset: 'hills', maxRounds: 5 });
  assert.equal(neu.toJSON().config.schaden, SCHADEN_STANDARD);
  neu.finalize(300);
  assert.equal(ReplayRecorder.fromJSON(neu.serialize()).config.schaden, SCHADEN_STATUS);
  const alt = JSON.parse(neu.serialize());
  delete alt.config.schaden;
  assert.equal(ReplayRecorder.fromJSON(alt).config.schaden, SCHADEN_ALT);
});

test('Replay-Rundlauf Fassung 2: Live-Lauf und Wiedergabe enden im selben Hash', async () => {
  const { ReplayPlayer } = await import('../src/engine/replay.js');
  for (const fassung of [SCHADEN_ALT, SCHADEN_STATUS]) {
    const live = new MatchController({ seed: 4242, teams: 2, playersPerTeam: 2, preset: 'hills', maxRounds: 5, schaden: fassung });
    live.start();
    const rec = new ReplayRecorder({
      seed: 4242, teams: 2, playersPerTeam: 2, preset: 'hills', maxRounds: 5, turnDurationMs: live.turnDurationMs,
      kit: live.kit, schaden: fassung, zerstoerung: live.zerstoerung, waffen: live.waffen, kisten: live.kisten,
    });
    let schuesse = 0;
    for (let tick = 0; tick < 2400; tick += 1) {
      if (live.activeProjectileCount === 0 && tick % 120 === 0) {
        const id = live.activePlayerId;
        const winkel = 0.5 + (schuesse % 9) * 0.15;
        const kraft = 40 + (schuesse * 13) % 50;
        const waffe = live.inventory.getActiveWeaponId(id);
        const ergebnis = live.fire(id, winkel, kraft, waffe);
        if (ergebnis.ok) rec.recordInput({ tick: live.world.tickCount, playerId: id, angle: winkel, power: kraft, weaponId: waffe });
        schuesse += 1;
      }
      live.step();
      live.consumeEvents();
    }
    rec.finalize(live.world.tickCount);
    const spieler = new ReplayPlayer(ReplayRecorder.fromJSON(rec.serialize()));
    assert.equal(spieler.match.schaden, fassung);
    while (!spieler.finished) spieler.advance?.() ?? spieler.step?.();
    assert.equal(spieler.match.stateHash(), live.stateHash(), `Fassung ${fassung}`);
  }
});

// ---------------------------------------------------------------- Brand

test('Brand: Dauer, Tick am Zugbeginn, kein Stapeln, Ablauf mit Meldung', () => {
  const { match, schuetze, opfer } = aufbau();
  match.mali.wende(opfer, 'brand', { dmg: 15, by: schuetze, dauer: 3 });
  match.mali.wende(opfer, 'brand', { dmg: 15, by: schuetze, dauer: 3 });
  assert.equal(match.statuses.maliLesen(opfer).brand.dmg, 12, 'ein Eintrag, 15 × 0,8');
  const vorher = hp(match, opfer);
  const ereignisse = zuegeDesOpfers(match, opfer, 4);
  const ticks = ereignisse.filter(e => e.type === 'dot_tick');
  assert.equal(ticks.length, 3, 'drei Zugbeginne mit Schaden');
  assert.ok(ticks.every(t => t.payload.damage === 12));
  assert.equal(Math.round(vorher - hp(match, opfer)), 36);
  assert.ok(ereignisse.some(e => e.type === 'malus_beendet' && e.payload.art === 'brand' && e.payload.grund === 'ablauf'));
  assert.equal(match.mali.hat(opfer, 'brand'), false);
});

test('Brand: Nässe wehrt ab, Wasser löscht, Heilung ab 20 löscht, Eis und Feuer heben einander auf', () => {
  const { match, schuetze, opfer } = aufbau();
  match.mali.wende(opfer, 'nass', { by: schuetze });
  assert.equal(match.mali.wende(opfer, 'brand', { dmg: 10, by: schuetze }), null);
  assert.ok(match.consumeEvents().some(e => e.type === 'malus_abgewehrt' && e.payload.grund === 'nass'));

  const b = aufbau();
  b.match.mali.wende(b.opfer, 'brand', { dmg: 10, by: b.schuetze });
  b.match.mali.wende(b.opfer, 'nass', { by: b.schuetze });
  assert.equal(b.match.mali.hat(b.opfer, 'brand'), false, 'Wasser löscht');

  const c = aufbau();
  c.match.mali.wende(c.opfer, 'brand', { dmg: 10, by: c.schuetze });
  assert.equal(c.match.world.getSystem('damage').heal(c.match.world, c.opfer, 25) > 0, true);
  assert.equal(c.match.mali.hat(c.opfer, 'brand'), false, 'Heilung löscht');

  const d = aufbau();
  d.match.mali.wende(d.opfer, 'brand', { dmg: 10, by: d.schuetze });
  d.match.mali.wende(d.opfer, 'frost', { by: d.schuetze });
  assert.equal(d.match.mali.hat(d.opfer, 'brand'), false, 'Eis löscht Brand');
  d.match.mali.wende(d.opfer, 'brand', { dmg: 10, by: d.schuetze });
  assert.equal(d.match.mali.hat(d.opfer, 'frost'), false, 'Feuer taut Frost');
});

// ----------------------------------------------------------------- Gift

test('Gift: höchstens zwei Stapel, Heilung gemindert, große Heilung entfernt einen Stapel', () => {
  const { match, opfer, schuetze } = aufbau();
  for (let i = 0; i < 5; i += 1) match.mali.wende(opfer, 'gift', { dmg: 10, by: schuetze });
  assert.equal(match.statuses.maliLesen(opfer).gift.length, 2);
  assert.equal(match.mali.heilung(opfer, 0), 0);
  match.world.setComponent(opfer, 'Health', 'current', 500);
  const geheilt = match.world.getSystem('damage').heal(match.world, opfer, 30);
  assert.equal(geheilt, 515, 'zwei Stapel: halbe Heilung (15)');
  assert.equal(match.statuses.maliLesen(opfer).gift.length, 1, 'Heilung ab 20 entfernt einen Stapel');
});

// ---------------------------------------------------------------- Fluch

test('Fluch: halbe Heilung, 15 % weniger eigener Schaden, nur sehr große Heilung bricht ihn; Heiliges trifft härter', () => {
  const { match, opfer, schuetze } = aufbau();
  match.mali.wende(opfer, 'fluch', { dmg: 0, by: schuetze });
  assert.equal(match.statuses.damageMultiplier(opfer), 0.85);
  assert.equal(match.mali.heilung(opfer, 30), 15);
  assert.equal(match.mali.hat(opfer, 'fluch'), true, '30 bricht den Fluch nicht');
  match.mali.heilung(opfer, 45);
  assert.equal(match.mali.hat(opfer, 'fluch'), false);

  match.mali.wende(opfer, 'fluch', { dmg: 0, by: schuetze });
  const heilig = DAMAGE_TYPE_IDS.indexOf('holy');
  const koerper = DAMAGE_TYPE_IDS.indexOf('void');
  const a = match.mali.schaden(opfer, 100, heilig).amount;
  const b = match.mali.schaden(opfer, 100, koerper).amount;
  assert.ok(a > b);
});

// ---------------------------------------------------- Säure, Rüstung, Schild

test('Säure zersetzt die Rüstung; Magie durchdringt die Hälfte; Energie bricht Schilde', () => {
  const { match, opfer, schuetze } = aufbau();
  match.statuses.addArmor(opfer, 0.4);
  const koerper = DAMAGE_TYPE_IDS.indexOf('physical');
  const magie = DAMAGE_TYPE_IDS.indexOf('arcane');
  const normal = match.mali.schaden(opfer, 100, undefined).amount;
  assert.equal(Math.round(normal), 60);
  const art = match.mali.schaden(opfer, 100, magie).amount;
  assert.ok(art > normal, 'Magie: weniger Rüstung wirksam');
  match.mali.wende(opfer, 'saeure', { by: schuetze });
  const zersetzt = match.mali.schaden(opfer, 100, undefined).amount;
  assert.equal(Math.round(zersetzt), 85, 'Rüstung 0,4 − 0,25 = 0,15');
  void koerper;

  const b = aufbau();
  b.match.statuses.addShield(b.opfer, 100);
  const energie = DAMAGE_TYPE_IDS.indexOf('energy');
  const rest = b.match.mali.schaden(b.opfer, 40, energie).amount;
  assert.equal(Math.round(rest), 22, 'ein Schild fängt nur die Hälfte (Späher: Energie ×1,1)');
});

// ---------------------------------------------- Frost, Betäubung, Schock

test('Frost: Tempo 70 %, zweiter Treffer betäubt, Betäubung trifft nie zwei Züge hintereinander', () => {
  const { match, opfer, schuetze } = aufbau();
  match.mali.wende(opfer, 'frost', { by: schuetze });
  assert.equal(match.mali.langsamFaktor(opfer), 0.7);
  assert.equal(match.statuses.isFrozen(opfer), false);
  match.mali.wende(opfer, 'frost', { by: schuetze });
  assert.equal(match.statuses.isFrozen(opfer), true, 'durchgefroren');

  const ereignisse = zuegeDesOpfers(match, opfer, 1);
  assert.ok(ereignisse.some(e => e.type === 'turn_skipped' && e.payload.playerId === opfer));
  assert.equal(match.mali.betaeube(opfer, schuetze), null, 'Schutzzug');
  assert.equal(match.statuses.isFrozen(opfer), false);
  assert.ok(match.consumeEvents().some(e => e.type === 'malus_abgewehrt' && e.payload.grund === 'schutz'));

  zuegeDesOpfers(match, opfer, 1);
  assert.ok(match.mali.betaeube(opfer, schuetze), 'danach wieder möglich');
});

test('Dauerbetäubung: Eisschlag im Dauerbeschuss setzt Fassung 1 jeden Zug aus, Fassung 2 höchstens jeden zweiten', () => {
  const zaehle = (fassung) => {
    const { match, schuetze, opfer } = aufbau(fassung);
    let ausgesetzt = 0;
    let zuege = 0;
    for (let i = 0; i < 12; i += 1) {
      if (match.activePlayerId === schuetze && match.cooldownFor(schuetze, 'pa_071') === 0) schuss(match, schuetze, 'pa_071');
      for (let k = 0; k < 4; k += 1) {
        for (const e of match.consumeEvents()) {
          if ((e.type === 'turn_start' || e.type === 'turn_skipped') && e.payload.playerId === opfer) {
            zuege += 1;
            if (e.type === 'turn_skipped') ausgesetzt += 1;
          }
        }
        match.endTurn();
        if (match.activePlayerId === schuetze) break;
      }
    }
    return { ausgesetzt, zuege };
  };
  const alt = zaehle(SCHADEN_ALT);
  const neu = zaehle(SCHADEN_STATUS);
  assert.ok(alt.ausgesetzt >= alt.zuege - 1, `Fassung 1 sperrt dauerhaft (${alt.ausgesetzt}/${alt.zuege})`);
  assert.ok(neu.ausgesetzt * 2 <= neu.zuege, `Fassung 2 höchstens jeder zweite (${neu.ausgesetzt}/${neu.zuege})`);
});

test('Schock: halbes Tempo; bei Nässe Betäubung und Leitung auf nasse Gegner', () => {
  const { match, opfer, schuetze } = aufbau();
  match.mali.wende(opfer, 'schock', { by: schuetze });
  assert.equal(match.mali.langsamFaktor(opfer), 0.5);
  assert.equal(match.statuses.isFrozen(opfer), false);

  const b = aufbau(SCHADEN_STATUS, { playersPerTeam: 2 });
  const ziele = b.match.getState().entities.filter(e => e.teamId !== b.match.getState().entities.find(x => x.entityId === b.schuetze).teamId);
  const [erstes, zweites] = ziele.map(z => z.entityId);
  b.match.world.setComponent(zweites, 'Position', 'x', b.match.world.getComponent(erstes, 'Position', 'x') + 40);
  b.match.world.setComponent(zweites, 'Position', 'y', b.match.world.getComponent(erstes, 'Position', 'y'));
  b.match.mali.wende(erstes, 'nass', { by: b.schuetze });
  b.match.mali.wende(zweites, 'nass', { by: b.schuetze });
  const vorher = hp(b.match, zweites);
  b.match.mali.wende(erstes, 'schock', { by: b.schuetze, waffe: { damage: 50 } });
  assert.equal(b.match.statuses.isFrozen(erstes), true, 'nass: betäubt');
  assert.equal(b.match.mali.hat(zweites, 'schock'), true, 'Leitung');
  assert.equal(vorher - hp(b.match, zweites) > 0, true);
});

// ------------------------------------------------------------- Obergrenzen

test('Obergrenzen: höchstens drei Mali; der kürzeste weicht, ein kürzerer neuer wird abgewehrt', () => {
  const { match, opfer, schuetze } = aufbau();
  match.mali.wende(opfer, 'brand', { dmg: 10, by: schuetze, dauer: 3 });
  match.mali.wende(opfer, 'gift', { dmg: 10, by: schuetze, dauer: 3 });
  match.mali.wende(opfer, 'saeure', { by: schuetze, dauer: 1 });
  assert.equal(match.mali.wende(opfer, 'fluch', { by: schuetze, dauer: 1 }) !== null, true, 'gleich kurz: ersetzt');
  const lebende = MALUS_SCHLUESSEL.filter(k => k !== 'nass' && match.mali.hat(opfer, k));
  assert.equal(lebende.length, OBERGRENZEN.maxMali);
  assert.equal(match.mali.wende(opfer, 'frost', { by: schuetze, dauer: 1 }) !== null, true);
  assert.equal(MALUS_SCHLUESSEL.filter(k => k !== 'nass' && match.mali.hat(opfer, k)).length, 3);
});

test('Obergrenzen: Schaden über Zeit je Zugbeginn höchstens 20 % der Maximalgesundheit', () => {
  const { match, opfer, schuetze } = aufbau();
  match.world.setComponent(opfer, 'Health', 'max', 100);
  match.world.setComponent(opfer, 'Health', 'current', 100);
  match.mali.wende(opfer, 'brand', { dmg: 100, by: schuetze, dauer: 3 });
  match.mali.wende(opfer, 'gift', { dmg: 100, by: schuetze, dauer: 3 });
  match.mali.wende(opfer, 'gift', { dmg: 100, by: schuetze, dauer: 3 });
  const tick = zuegeDesOpfers(match, opfer, 1).find(e => e.type === 'dot_tick');
  assert.ok(tick.payload.damage <= 20.01, `${tick.payload.damage}`);
  assert.equal(tick.payload.gedeckelt, true);
});

test('Schaden über Zeit meldet den Tod', () => {
  const { match, opfer, schuetze } = aufbau();
  match.world.setComponent(opfer, 'Health', 'current', 3);
  match.mali.wende(opfer, 'brand', { dmg: 10, by: schuetze, dauer: 3 });
  const tick = zuegeDesOpfers(match, opfer, 1).find(e => e.type === 'dot_tick');
  assert.equal(tick.payload.lethal, true);
});

// ------------------------------------------------- Resistenz nach Klasse

test('Resistenzen: Zusatztabelle nach Klasse und Archetyp, Klassenwerte unverändert', () => {
  assert.equal(resistenzFaktor('heavy', 'brawler', 'electric'), 1.15);
  assert.equal(resistenzFaktor('heavy', 'brawler', 'physical'), 0.9);
  assert.equal(resistenzFaktor('scout', 'occultist', 'arcane'), 0.9);
  assert.equal(resistenzFaktor('scout', 'brawler', 'poison'), 0.85);
  assert.equal(resistenzFaktor('artillery', 'artillerist', 'fire'), 0.9);
  assert.equal(dauerAbzug('artillerist', 'brand'), 1);
  assert.equal(dauerAbzug('brawler', 'brand'), 0);
});

test('Archetyp-Abzug kürzt die Dauer, aber nie unter einen Zug', () => {
  const { match, opfer, schuetze } = aufbau(SCHADEN_STATUS, { loadouts: [{ classId: 'scout', archetypeId: 'artillerist' }, { classId: 'scout', archetypeId: 'artillerist' }] });
  match.mali.wende(opfer, 'brand', { dmg: 10, by: schuetze, dauer: 3 });
  assert.equal(match.statuses.maliLesen(opfer).brand.turns, 2);
  match.mali.wende(opfer, 'brand', { dmg: 10, by: schuetze, dauer: 1 });
  assert.equal(match.statuses.maliLesen(opfer).brand.turns, 2, 'Auffrischen nimmt die längere');
});

// ------------------------------------------------------- Schadensarten

test('Schadensart wirkt: Eisschlag friert, Giftwolke vergiftet, Wasserblaster nässt (Fassung 2)', () => {
  for (const [id, malus] of [['pa_071', 'frost'], ['pa_070', 'gift'], ['pa_063', 'nass'], ['pa_072', 'brand']]) {
    const { match, schuetze, opfer } = aufbau();
    schuss(match, schuetze, id);
    assert.equal(match.mali.hat(opfer, malus), true, `${id} → ${malus}`);
  }
});

// -------------------------------------------------------------- Anzeige

test('Schadenszahlen: Farbe und Zeichen je Familie; Krit aus dem Ereignis; ohne Meldung unverändert', () => {
  const vorher = new Map([[1, { health: 100, schild: 0, x: 10, y: 10, maxHealth: 100 }]]);
  const nachher = [{ entityId: 1, health: 90, maxHealth: 100, x: 10, y: 10, alive: true }];

  const ohne = findeZahlen(vorher, nachher).neu[0];
  assert.deepEqual([ohne.text, ohne.art], ['-10', 'schaden']);

  const feuer = findeZahlen(vorher, nachher, new Map([[1, { name: 'fire' }]])).neu[0];
  assert.deepEqual([feuer.text, feuer.art], ['-10♨', 'schaden-feuer']);
  const gift = findeZahlen(vorher, nachher, new Map([[1, { name: 'poison' }]])).neu[0];
  assert.equal(gift.art, 'schaden-gift');

  const krit = findeZahlen(vorher, nachher, new Map([[1, { name: 'physical', krit: true }]])).neu[0];
  assert.deepEqual([krit.text, krit.art], ['-10!', 'kritisch']);
});

test('Anzeige der Mali: Marken mit Symbol, Farbe und Dauer; Leitungsmaske rundet', () => {
  const marken = maliMarken({ mali: { brand: { turns: 2 }, gift: [{ turns: 3 }, { turns: 1 }] } });
  assert.deepEqual(marken.map(m => m.schluessel), ['brand', 'gift']);
  assert.equal(marken[1].stapel, 2);
  assert.ok(marken.every(m => m.symbol && m.farbe && m.kurz));
  assert.deepEqual(maliMarken({}), []);
});
