/**
 * Klassenfassung (`config.klassen`, `config/klassen-fassung.js`).
 *
 * Drei Fassungen, alle lesbar:
 *   - Fassung 1: alte Klassen `scout`/`heavy`/`artillery` + Archetypen (Werte von `LEGACY_CLASS_DEFINITIONS`).
 *   - Fassung 2: wie 1, Scout angehoben (power 0,85, health 0,95).
 *   - Fassung 3: DREI Klassen ohne Archetypen (`nahkampf`, `fernkampf`, `okkultist`) — Standard.
 *
 * Die Goldwerte der Fassung 1 (Hash `GOLD_F1`, Scout 96 Leben) wurden VOR der Änderung am Stand
 * `3f824de` gemessen (Seed 4242, 2x3, hills, drei Schüsse zu je 900 Takten). `GOLD_F3` wurde nach
 * dem Klassenumbau am 2026-11-05 mit demselben Ablauf gemessen; `platz` und `classId` fließen
 * nicht in den Hash ein (siehe `hashState`), die Werte stehen im Test darunter.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { MatchController } from '../src/engine/match.js';
import { ReplayRecorder, ReplayPlayer } from '../src/engine/replay.js';
import {
  combatProfile, CLASS_DEFINITIONS, LEGACY_CLASS_DEFINITIONS, CLASS_IDS, LEGACY_CLASS_IDS,
  classCounterplay, uebersichtFuerHilfe, allCombatProfiles,
} from '../src/shared/config/classes.js';
import { launchSpeedMultiplier } from '../src/shared/launchSpeed.js';
import {
  KLASSEN_ALT, KLASSEN_SCOUT, KLASSEN_NEU, KLASSEN_STANDARD, normalisiereKlassen, klassenWerte,
} from '../src/shared/config/klassen-fassung.js';

const GOLD_F1 = 'b8bfca73';
const GOLD_F3 = 'fca0dcaf';
const KOPF = { seed: 4242, teams: 2, playersPerTeam: 3, preset: 'hills', turnDurationMs: 1_000_000, maxRounds: 99 };

function spiele(extra = {}) {
  const m = new MatchController({ ...KOPF, waffen: 10, kisten: 3, ...extra }); // Goldwert gilt für Waffenfassung 10 und Kistenfassung 3 (Fassung 11 ändert Inventar und Kisten)
  m.start();
  for (let i = 0; i < 3; i += 1) {
    m.fire(m.activePlayerId, Math.PI / 4 + i * 0.1, 30);
    for (let t = 0; t < 900; t += 1) m.step();
  }
  return m;
}

test('Marke: Standard ist Fassung 3, 1/2/3 sind gültig, Unbekanntes fällt auf 3, der Motor ohne Angabe bleibt bei 1', () => {
  assert.equal(KLASSEN_NEU, 3);
  assert.equal(KLASSEN_STANDARD, KLASSEN_NEU);
  assert.equal(normalisiereKlassen(1), KLASSEN_ALT);
  assert.equal(normalisiereKlassen(2), KLASSEN_SCOUT);
  assert.equal(normalisiereKlassen(3), KLASSEN_NEU);
  assert.equal(normalisiereKlassen(undefined), KLASSEN_STANDARD);
  assert.equal(normalisiereKlassen('x'), KLASSEN_STANDARD);
  assert.equal(normalisiereKlassen(99), KLASSEN_STANDARD);
  /*
   * Der Motor ohne Option bleibt Fassung 1: Eine Aufzeichnung OHNE `klassen` im
   * Kopf stammt aus der Zeit davor und muss bitgleich bleiben (GOLD_F1).
   */
  assert.equal(new MatchController(KOPF).klassen, KLASSEN_ALT);
});

test('Fassung 3: drei Klassen, keine Archetypen, gleiche Summe der wirksamen Faktoren', () => {
  assert.deepEqual([...CLASS_IDS], ['nahkampf', 'fernkampf', 'okkultist'],
    'CLASS_IDS ist der Snapshot-Vertrag — die Reihenfolge darf sich nicht ändern');
  const profile = allCombatProfiles(KLASSEN_STANDARD);
  assert.equal(profile.length, 3);
  assert.ok(profile.every(p => p.archetypeId === null), 'Fassung 3 führt keine Archetypen');

  const summe = p => p.healthMultiplier + p.damageMultiplier
    + p.launchSpeedMultiplier + p.mobilityMultiplier;
  for (const p of profile) {
    assert.equal(summe(p).toFixed(9), '4.000000000', `${p.classId}: Summe nicht 4,00`);
  }

  // Rollen wie gefordert: Nahkampf viel Leben, Okkultist viel Schaden, Fernkampf Mitte.
  const p = Object.fromEntries(profile.map(x => [x.classId, x]));
  assert.ok(p.nahkampf.healthMultiplier > p.fernkampf.healthMultiplier
    && p.fernkampf.healthMultiplier > p.okkultist.healthMultiplier, 'Leben: Nahkampf > Fernkampf > Okkultist');
  assert.ok(p.okkultist.damageMultiplier > p.fernkampf.damageMultiplier
    && p.fernkampf.damageMultiplier > p.nahkampf.damageMultiplier, 'Schaden: Okkultist > Fernkampf > Nahkampf');
  assert.ok(p.nahkampf.mobilityMultiplier > p.fernkampf.mobilityMultiplier
    && p.fernkampf.mobilityMultiplier > p.okkultist.mobilityMultiplier, 'Beweglichkeit: Nahkampf > Fernkampf > Okkultist');
});

test('Fassung 1: Kampfprofil liefert die alten Werte (Legacy-Tabelle unverändert)', () => {
  assert.deepEqual(
    { power: LEGACY_CLASS_DEFINITIONS.scout.power, health: LEGACY_CLASS_DEFINITIONS.scout.health, speed: LEGACY_CLASS_DEFINITIONS.scout.speed },
    { power: 0.7, health: 0.8, speed: 1.2 },
  );
  const alt = combatProfile('scout', 'brawler');
  assert.equal(alt.healthMultiplier, 0.8 * 1.2);
  assert.equal(alt.damageMultiplier, 0.7);
  assert.equal(combatProfile('scout', 'brawler', null, KLASSEN_ALT).damageMultiplier, 0.7);
  for (const k of ['heavy', 'artillery']) {
    assert.deepEqual(combatProfile(k, 'occultist', null, KLASSEN_SCOUT), combatProfile(k, 'occultist', null, KLASSEN_ALT));
  }
});

test('Fassung 2: nur der Scout ändert sich; Rolle bleibt (beweglichster, kleinste Wucht und Reichweite)', () => {
  const neu = combatProfile('scout', 'brawler', null, KLASSEN_SCOUT);
  assert.equal(neu.damageMultiplier, 0.85);
  assert.equal(neu.healthMultiplier, 0.95 * 1.2);
  assert.equal(neu.mobilityMultiplier, 1.2);
  assert.equal(klassenWerte(LEGACY_CLASS_DEFINITIONS, 'heavy', KLASSEN_SCOUT), LEGACY_CLASS_DEFINITIONS.heavy);
  const p = Object.fromEntries(LEGACY_CLASS_IDS.map(k => [k, combatProfile(k, 'brawler', null, KLASSEN_SCOUT)]));
  for (const k of ['heavy', 'artillery']) {
    assert.ok(p.scout.mobilityMultiplier > p[k].mobilityMultiplier);
    assert.ok(p.scout.damageMultiplier < p[k].damageMultiplier);
    assert.ok(p.scout.launchSpeedMultiplier < p[k].launchSpeedMultiplier);
  }
});

test('Fassung 2: Klassensumme des Scouts liegt zwischen 3,8 und 4,0, Spannweite höchstens 1,15', () => {
  const summe = (k, f) => ['brawler', 'artillerist', 'occultist'].map(a => {
    const p = combatProfile(k, a, null, f);
    return p.healthMultiplier + p.damageMultiplier + p.launchSpeedMultiplier + p.mobilityMultiplier;
  });
  const mittel = v => v.reduce((x, y) => x + y, 0) / v.length;
  assert.ok(Math.abs(mittel(summe('scout', KLASSEN_ALT)) - 3.42) < 0.01);
  const m2 = mittel(summe('scout', KLASSEN_SCOUT));
  assert.ok(m2 >= 3.8 && m2 <= 4.0, `Scout ${m2}`);
  const alle = LEGACY_CLASS_IDS.flatMap(k => summe(k, KLASSEN_SCOUT));
  assert.ok(Math.max(...alle) / Math.min(...alle) <= 1.15 + 1e-9);
});

test('Abschussgeschwindigkeit, Anzeige und Gegenspiel folgen der Fassung', () => {
  // Fassungen ≤ 2: der Scout wird schneller, Verhältnis ist genau power 0,85/0,70.
  const f1 = launchSpeedMultiplier({ classId: 0, archetypeId: 0 });
  const f2 = launchSpeedMultiplier({ classId: 0, archetypeId: 0, klassen: KLASSEN_SCOUT });
  assert.ok(f2 > f1);
  assert.ok(Math.abs(f2 / f1 - 0.85 / 0.7) < 1e-12);

  // Fassung 3: Index bildet auf die neuen Klassen ab, Tempo = power.
  const tempoNeu = launchSpeedMultiplier({ classId: 2, klassen: KLASSEN_NEU });
  assert.equal(tempoNeu, CLASS_DEFINITIONS.okkultist.power);

  // Hilfe und Gegenspiel lesen die Fassung.
  assert.equal(uebersichtFuerHilfe().klassen.find(k => k.id === 'okkultist').wirksam.schaden, 1.25);
  assert.equal(uebersichtFuerHilfe(KLASSEN_ALT).klassen.find(k => k.id === 'scout').wirksam.schaden, 0.7);
  assert.equal(classCounterplay(KLASSEN_ALT).scout.profil.wucht, 0.7);
  assert.equal(classCounterplay(KLASSEN_SCOUT).scout.profil.wucht, 0.85);
  assert.equal(classCounterplay(KLASSEN_NEU).nahkampf.profil.wucht, 0.75);
});

test('Fassung 3: Hilfe bietet nur die drei Klassen, keine Archetypen', () => {
  const u = uebersichtFuerHilfe(KLASSEN_STANDARD);
  assert.deepEqual(u.klassen.map(k => k.id), [...CLASS_IDS]);
  assert.deepEqual(u.archetypen, []);
  assert.match(u.kopplungHinweis, /drei Klassen/i);
  assert.doesNotMatch(u.kopplungHinweis, /neun/);
});

test('Spiel: Fassung 1 ist bitgleich zum Stand vor der Änderung, Fassung 2 spielt anders, Fassung 3 hat Goldwert', () => {
  const alt = spiele({ klassen: 1 });
  assert.equal(alt.stateHash(), GOLD_F1);
  assert.equal(spiele().stateHash(), GOLD_F1, 'ohne Option = Fassung 1');
  assert.equal(alt.getState().entities.find(e => e.classId === 0).maxHealth, 96);

  const neu = spiele({ klassen: 2 });
  assert.notEqual(neu.stateHash(), GOLD_F1);
  assert.equal(neu.getState().entities.find(e => e.classId === 0).maxHealth, 114);

  /*
   * Fassung 3: neuer Goldwert, gemessen nach dem Umbau. Die Leben sind
   * 130 / 100 / 70 — genau die Klassentabelle, ohne Archetyp-Faktor.
   */
  const f3 = spiele({ klassen: 3 });
  assert.equal(f3.stateHash(), GOLD_F3);
  assert.deepEqual(
    f3.getState().entities.slice(0, 3).map(e => [e.classId, e.archetypeId, e.maxHealth]),
    [[0, 0, 130], [1, 0, 100], [2, 0, 70]],
  );
});

test('Replay-Kopf: Altdatei ohne Feld = 1, neue Aufzeichnung trägt die gewählte Fassung, Rückspiel übernimmt sie', () => {
  const rec = new ReplayRecorder({ ...KOPF, klassen: KLASSEN_SCOUT });
  assert.equal(rec.toJSON().config.klassen, KLASSEN_SCOUT);
  assert.equal(new ReplayRecorder({ ...KOPF, klassen: KLASSEN_NEU }).toJSON().config.klassen, KLASSEN_NEU);
  assert.equal(new ReplayRecorder(KOPF).toJSON().config.klassen, KLASSEN_ALT);
  const dok = JSON.parse(JSON.stringify(rec.toJSON()));
  delete dok.config.klassen;
  const geladen = ReplayRecorder.fromJSON(dok);
  assert.equal(geladen.toJSON().config.klassen, KLASSEN_ALT);
  assert.equal(new ReplayPlayer(geladen.toJSON()).match.klassen, KLASSEN_ALT);
  assert.equal(new ReplayPlayer(ReplayRecorder.fromJSON(JSON.parse(JSON.stringify(rec.toJSON()))).toJSON()).match.klassen, KLASSEN_SCOUT);
});

test('Aufzeichnung mit Fassung 3 spielt exakt nach', () => {
  const kopf = { ...KOPF, klassen: KLASSEN_NEU };
  const m = new MatchController(kopf);
  m.start();
  const rec = new ReplayRecorder(kopf);
  const schuss = { tick: m.world.tickCount, playerId: m.activePlayerId, angle: Math.PI / 4, power: 30, weaponId: null };
  assert.equal(m.fire(schuss.playerId, schuss.angle, schuss.power).ok, true);
  rec.recordInput(schuss);
  for (let t = 0; t < 600; t += 1) m.step();
  rec.finalize(m.world.tickCount);
  const spieler = new ReplayPlayer(ReplayRecorder.fromJSON(JSON.parse(JSON.stringify(rec.toJSON()))).toJSON());
  while (spieler.step());
  assert.equal(spieler.match.stateHash(), m.stateHash());
});
