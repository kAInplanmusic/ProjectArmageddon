/**
 * Startausrüstung ab Kit-Fassung 5 (TODO 2.17, Entscheidung 2026-11-25): feste Startwaffen, Seil und Gleitschirm,
 * eine Spezialwaffe je Figur (Stufe legendär/stark/normal, je Fraktion 1/2/6).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

import { MatchController } from '../src/engine/match.js';
import { ReplayRecorder, playReplay } from '../src/engine/replay.js';
import { WEAPONS, FALLBACK_WEAPON_ID } from '../src/shared/config/weapons.js';
import { FACTIONS, CHARACTERS } from '../src/shared/config/factions.js';
import { KIT_AUSRUESTUNG, KIT_STANDARD } from '../src/shared/config/loadouts.js';
import {
  FESTE_STARTWAFFEN, GIMMICKS, SPEZIAL_MUNITION, LEGENDAERE_WAFFEN, spezialStufe, startAusruestung,
} from '../src/shared/config/ausruestung.js';
import { SPEZIAL_JE_FIGUR } from '../src/shared/config/ausruestung-spezial.js';
import { loeseFraktionen } from '../src/shared/config/darstellung.js';

const waffe = id => WEAPONS.find(w => w.id === id);

test('Kit 5 ist der Standard; feste Waffen und Gimmicks stehen im Katalog, das Seil ist der Enterhaken pa_111', () => {
  assert.equal(KIT_STANDARD, KIT_AUSRUESTUNG);
  assert.equal(FESTE_STARTWAFFEN.length, 5);
  assert.ok(FESTE_STARTWAFFEN.includes(FALLBACK_WEAPON_ID), 'die Reserve gehört zu den festen Waffen');
  for (const id of [...FESTE_STARTWAFFEN, ...Object.keys(GIMMICKS)]) assert.ok(waffe(id), id);
  assert.deepEqual(GIMMICKS, { pa_111: 5, pa_114: 5 });
  assert.equal(waffe('pa_111').displayName, 'Enterhaken');
});

test('Jede der 81 Figuren hat eine Spezialwaffe; je Fraktion 1 legendär, 2 stark, 6 normal; mindestens 10 legendäre', () => {
  assert.ok(LEGENDAERE_WAFFEN.length >= 10, 'Rückmeldung 2026-11-27: mindestens zehn legendäre');
  for (const id of LEGENDAERE_WAFFEN) assert.ok(waffe(id), id);
  assert.equal(Object.keys(SPEZIAL_JE_FIGUR).length, CHARACTERS.length);
  const ausgeschlossen = new Set([...FESTE_STARTWAFFEN, ...Object.keys(GIMMICKS)]);
  const alle = [];
  for (const f of FACTIONS) {
    const zaehler = { legendaer: 0, stark: 0, normal: 0 };
    for (const c of CHARACTERS.filter(x => x.faction === f.id)) {
      const id = SPEZIAL_JE_FIGUR[c.id];
      assert.ok(waffe(id), `${c.id}: ${id} im Katalog`);
      assert.ok(!ausgeschlossen.has(id), `${c.id}: keine feste Waffe und kein Gimmick`);
      const stufe = spezialStufe(waffe(id));
      zaehler[stufe] += 1;
      alle.push(id);
    }
    assert.deepEqual(zaehler, { legendaer: 1, stark: 2, normal: 6 }, f.id);
  }
  assert.equal(new Set(alle).size, alle.length, 'jede Spezialwaffe kommt nur einmal vor, auch die legendären');
});

test('Die Tabelle ist die Ausgabe des Zuordnungsskripts (nicht von Hand verändert)', () => {
  const aus = execFileSync(process.execPath, ['scripts/ausruestung-zuordnen.mjs', '--pruefen'], { encoding: 'utf8' });
  assert.match(aus, /aktuell/);
});

test('Startausrüstung: feste Waffen unbegrenzt, Gimmicks 5×, Spezialmunition nach Stufe', () => {
  for (const c of CHARACTERS) {
    const { waffen, munition } = startAusruestung(c.id);
    assert.equal(waffen.length, 8);
    for (const id of FESTE_STARTWAFFEN) assert.equal(munition[id], Infinity);
    const spezial = SPEZIAL_JE_FIGUR[c.id];
    assert.equal(munition[spezial], SPEZIAL_MUNITION[spezialStufe(waffe(spezial))]);
    assert.equal(munition.pa_111, 5);
    assert.equal(munition.pa_114, 5);
  }
  assert.equal(startAusruestung(null).waffen.length, 7, 'ohne Figur (klassisch) keine Spezialwaffe');
});

test('Im Motor: jede Figur trägt ihre Ausrüstung, Fraktion und Figur stehen im Zustand wie in der Anzeige', () => {
  const m = new MatchController({ seed: 31, teams: 2, playersPerTeam: 3, preset: 'hills', kit: KIT_AUSRUESTUNG, fraktionen: ['pirates', null] });
  m.start();
  const erwartet = loeseFraktionen(['pirates', null], 2, 31);
  assert.equal(erwartet[0], 'pirates');
  for (const e of m.getState().entities) {
    assert.equal(e.fraktionId, erwartet[e.teamId]);
    assert.ok(e.charakterId, `Figur für ${e.entityId}`);
    assert.equal(CHARACTERS.find(c => c.id === e.charakterId).faction, e.fraktionId);
    const { waffen, munition } = startAusruestung(e.charakterId);
    assert.deepEqual(m.inventory.getWeapons(e.entityId).slice().sort(), waffen.slice().sort());
    for (const id of waffen) assert.equal(m.inventory.getAmmo(e.entityId, id), munition[id]);
    assert.equal(m.inventory.getActiveWeaponId(e.entityId), FESTE_STARTWAFFEN[0], 'aktiv ist die erste feste Waffe');
  }
});

test('Klassisch (ohne Fraktion): keine Figur, keine Spezialwaffe', () => {
  const m = new MatchController({ seed: 31, teams: 2, playersPerTeam: 1, preset: 'hills', kit: KIT_AUSRUESTUNG, fraktionen: ['klassisch', 'klassisch'] });
  m.start();
  for (const e of m.getState().entities) {
    assert.equal(e.fraktionId, null);
    assert.equal(e.charakterId, null);
    assert.equal(m.inventory.getWeapons(e.entityId).length, 7);
  }
});

test('Replay: der Kopf trägt Kit 5 und die Fraktionswahl, die Wiedergabe ergibt dieselbe Ausrüstung und denselben Hash', () => {
  const kopf = { seed: 4242, teams: 2, playersPerTeam: 2, preset: 'hills', maxRounds: 5, kit: KIT_AUSRUESTUNG, fraktionen: ['xeno', 'machina'] };
  const live = new MatchController(kopf);
  const recorder = new ReplayRecorder(kopf);
  live.start();
  for (let t = 0; t < 600; t += 1) live.step();
  recorder.finalize(600);
  const json = recorder.toJSON();
  assert.equal(json.config.kit, KIT_AUSRUESTUNG);
  assert.deepEqual(json.config.fraktionen, ['xeno', 'machina']);
  const { match } = playReplay(ReplayRecorder.fromJSON(recorder.serialize()));
  assert.equal(match.stateHash(), live.stateHash());
  const a = live.getState().entities.map(e => e.charakterId);
  const b = match.getState().entities.map(e => e.charakterId);
  assert.deepEqual(b, a);
});
