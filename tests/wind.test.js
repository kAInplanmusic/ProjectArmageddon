/**
 * Tests: Windfassung (`config.wind`, AERO + ENG-1).
 *
 * Die Zusagen:
 *  1. `windFactor` 0 ist WIND FREI (Konvention seit Fassung 2), `undefined` = 1.
 *  2. Der Faktor skaliert die Abweichung; 0 verhält sich wie Windstille.
 *  3. Ab Fassung 2 würfelt der Wind JEDEN ZUG aus einem eigenen Strom.
 *  4. Wurf/Abwurf (ENG-1) und Wind teilen sich den Strom NICHT mehr: eine
 *     Windänderung verschiebt die Kiste nicht.
 *  5. Wasser setzt den Windfaktor 0.
 *  6. Alte Köpfe ohne `wind` laufen als Fassung 1 (Wind je Runde, Faktor 1,
 *     geteilter Strom) und sind bitgleich.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { MatchController } from '../src/engine/match.js';
import { ReplayRecorder, playReplay } from '../src/engine/replay.js';
import { integrateStep, simulateFlight } from '../src/shared/ballistics.js';
import { COMPONENT_SIGNATURES } from '../src/engine/ecs/componentStore.js';
import { windFaktorFuerWaffe } from '../src/engine/shooting.js';
import { rolleWurf } from '../src/engine/kistenWurf.js';
import { windFaktorImMedium } from '../src/engine/systems/projectileSystem.js';
import { WEAPONS, WINDFAKTOR_JE_WAFFE } from '../src/shared/config/weapons.js';
import { getWaffe, WAFFEN_KLASSE, WAFFEN_SICHT, WAFFEN_STANDARD, WAFFEN_TEMPO, WAFFEN_TREFFER, WAFFEN_WIND } from '../src/shared/config/waffen-fassung.js';
import {
  MAX_WIND, WIND_ALT, WIND_FAKTOR_MAX, WIND_JE_ZUG, WIND_STANDARD, normalisiereWind, windSegmente,
} from '../src/shared/config/wind.js';

const KOPF = { seed: 4242, teams: 2, playersPerTeam: 2, preset: 'hills', turnDurationMs: 1_000_000, maxRounds: 50 };

function match(extra = {}) {
  const m = new MatchController({ ...KOPF, ...extra });
  m.start();
  return m;
}

/** Windwerte der Zugbeginne, gesammelt über `anzahl` Züge. */
function windJeZug(m, anzahl) {
  const werte = [m.wind];
  for (let i = 0; i < anzahl; i += 1) {
    m.endTurn();
    const start = m.consumeEvents().find(e => e.type === 'turn_start');
    if (start) werte.push(start.payload.wind);
  }
  return werte;
}

test('normalisiereWind: bekannte Fassungen bleiben, Unbekanntes fällt auf den Standard', () => {
  assert.equal(WIND_STANDARD, WIND_JE_ZUG);
  assert.equal(normalisiereWind(WIND_ALT), WIND_ALT);
  assert.equal(normalisiereWind(WIND_JE_ZUG), WIND_JE_ZUG);
  assert.equal(normalisiereWind(undefined), WIND_STANDARD);
  assert.equal(normalisiereWind(9), WIND_STANDARD);
});

test('integrateStep: ausdrückliche 0 ist windfrei, nicht gesetzt ist 1', () => {
  const wind = 0.04;
  const frei = integrateStep({ vx: 10, vy: 0, gravity: 0, wind, windFactor: 0 });
  const still = integrateStep({ vx: 10, vy: 0, gravity: 0, wind: 0 });
  assert.equal(frei.vx, still.vx, 'Faktor 0 darf keinen Wind sehen');
  const ohne = integrateStep({ vx: 10, vy: 0, gravity: 0, wind, windFactor: undefined });
  const eins = integrateStep({ vx: 10, vy: 0, gravity: 0, wind, windFactor: 1 });
  assert.equal(ohne.vx, eins.vx);
  const zwei = integrateStep({ vx: 10, vy: 0, gravity: 0, wind, windFactor: 2 });
  const ohneWind = integrateStep({ vx: 10, vy: 0, gravity: 0, wind: 0 });
  assert.ok(
    Math.abs((zwei.vx - ohneWind.vx) - 2 * (eins.vx - ohneWind.vx)) < 1e-12,
    'Faktor skaliert linear gegenüber Windstille',
  );
});

test('simulateFlight: Faktor skaliert die Abweichung, 0 = Windstille', () => {
  const basis = { x: 100, y: 100, angle: 0.6, power: 60, wind: 0.05, sampleEvery: 1 };
  const ende = (extra) => simulateFlight({ ...basis, ...extra }).points.at(-1);
  const p0 = ende({ windFactor: 0 });
  const p1 = ende({ windFactor: 1 });
  const p2 = ende({ windFactor: 2 });
  const still = ende({ wind: 0, windFactor: 1 });
  assert.ok(Math.abs(p0.x - still.x) < 1e-9 && Math.abs(p0.y - still.y) < 1e-9, 'Faktor 0 = Windstille');
  assert.notEqual(p1.x, p0.x);
  assert.ok(Math.abs((p2.x - p0.x) - 2 * (p1.x - p0.x)) < 1e-6, 'doppelter Faktor weicht doppelt so weit ab');
});

test('Waffenfassung 14 trägt windFactor 0..2,5; Fassung 13 sieht ihn nicht', () => {
  const werte = Object.values(WINDFAKTOR_JE_WAFFE);
  assert.equal(werte.length, 150);
  assert.equal(Object.keys(WINDFAKTOR_JE_WAFFE).length, WEAPONS.length);
  assert.ok(werte.every(v => Number.isFinite(v) && v >= 0 && v <= WIND_FAKTOR_MAX), 'alle Werte im Band 0..2,5');
  // Strahlen sind ausdrücklich windfrei (echte 0, nicht „nicht gesetzt").
  for (const id of ['pa_098', 'pa_129', 'pa_139']) assert.equal(getWaffe(id, WAFFEN_WIND).windFactor, 0, id);
  assert.equal(getWaffe('pa_063', WAFFEN_WIND).windFactor, 0, 'Wasserwerfer: Wasser ist windstill');
  assert.ok(getWaffe('pa_075', WAFFEN_WIND).windFactor > 1.5, 'Tornado ist windanfällig');
  assert.ok(getWaffe('pa_037', WAFFEN_WIND).windFactor >= 1.6, 'Raketenwerfer');
  assert.equal(getWaffe('pa_047', WAFFEN_WIND).windFactor, 0.6, 'Handgranate');
  assert.ok(!('windFactor' in getWaffe('pa_037', WAFFEN_SICHT)), 'Fassung 13 kennt das Feld nicht');
  assert.equal(WAFFEN_STANDARD, WAFFEN_KLASSE + 4); // Fassung 21 (Entscheidungen)
  assert.equal(WAFFEN_KLASSE, WAFFEN_TREFFER + 1);
  assert.equal(WAFFEN_TREFFER, WAFFEN_TEMPO + 1);
});

test('windFaktorFuerWaffe: Fassung 1 immer 1, Fassung 2 nimmt den Katalogwert (gedeckelt)', () => {
  const waffe = getWaffe('pa_075', WAFFEN_WIND);
  assert.equal(windFaktorFuerWaffe(waffe, WIND_ALT), 1);
  assert.equal(windFaktorFuerWaffe(waffe, WIND_JE_ZUG), waffe.windFactor);
  assert.equal(windFaktorFuerWaffe({ windFactor: 9 }, WIND_JE_ZUG), WIND_FAKTOR_MAX, 'gedeckelt');
  assert.equal(windFaktorFuerWaffe({}, WIND_JE_ZUG), 1, 'fehlt der Wert, gilt 1');
});

test('Fassung 2 würfelt den Wind je Zug, Fassung 1 behält ihn je Runde', () => {
  const neu = windJeZug(match({ wind: WIND_JE_ZUG }), 6);
  assert.ok(new Set(neu).size >= 2, `Wind muss sich innerhalb der Züge ändern: ${neu}`);
  const alt = match({ wind: WIND_ALT });
  const altWerte = windJeZug(alt, 3); // 4 Spieler: noch keine neue Runde
  assert.equal(new Set(altWerte).size, 1, `Fassung 1 hält den Rundenwind: ${altWerte}`);
});

test('ENG-1: Wurf zieht aus eigenem Strom, nicht aus dem Wind', () => {
  const zaehler = { kisten: 0, match: 0 };
  const rng = (name) => ({
    nextBoolean() { zaehler[name] += 1; return true; },
    nextFloat(a, b) { zaehler[name] += 1; return (a + b) / 2; },
  });
  const wurf = rolleWurf({ rng: rng('match'), kistenRng: rng('kisten') });
  assert.ok(Number.isFinite(wurf.vx) && Number.isFinite(wurf.vy));
  assert.equal(zaehler.kisten, 3, 'zwei Weiten/Höhe-Ziehungen und die Richtung');
  assert.equal(zaehler.match, 0, 'der Match-Strom bleibt unberührt');
});

test('ENG-1: eine Windänderung verschiebt den Kistenwurf nicht mehr', () => {
  const a = match({ wind: WIND_JE_ZUG });
  const b = match({ wind: WIND_JE_ZUG });
  // Nur A verbraucht Windwürfe — der Kistenwurf darf davon nichts merken.
  const windStrom = a.seedManager.getSubRng('WIND');
  for (let i = 0; i < 7; i += 1) windStrom.next();
  const waffe = a.inventory.getActiveWeaponId(a.activePlayerId);
  const idA = a.dropWeapon(a.activePlayerId, waffe);
  const idB = b.dropWeapon(b.activePlayerId, waffe);
  assert.ok(idA.ok && idB.ok);
  assert.equal(idA.vx, idB.vx);
  assert.equal(idA.vy, idB.vy);
});

test('Wasser setzt den Windfaktor 0 (nur ab Fassung 2)', () => {
  const nass = { levelAtWorld: () => 0.9 };
  const trocken = { levelAtWorld: () => 0 };
  assert.equal(windFaktorImMedium(2, { wasserWindStill: true }, nass, 10, 20), 0);
  assert.equal(windFaktorImMedium(2, { wasserWindStill: true }, trocken, 10, 20), 2);
  assert.equal(windFaktorImMedium(2, { wasserWindStill: false }, nass, 10, 20), 2, 'alte Fassung bleibt unberührt');
  assert.equal(windFaktorImMedium(0, { wasserWindStill: true }, nass, 10, 20), 0);
});

test('Bahnvorschau nutzt den Wind der Waffe', () => {
  const m = match({ wind: WIND_JE_ZUG });
  m.world.services.match.wind = MAX_WIND;
  const id = m.activePlayerId;
  const waffe = getWaffe('pa_037', WAFFEN_WIND);
  const bahn = (faktor) => m.aimPreview(id, 0.7, 60, 200, { ...waffe, windFactor: faktor });
  const ohne = bahn(0);
  const stark = bahn(2);
  assert.ok(ohne.length > 5 && stark.length > 5);
  assert.notDeepEqual(ohne.at(-1), stark.at(-1), 'der Windfaktor muss die Vorschau krümmen');
});

test('Der Motor schreibt den Windfaktor der Waffe ins Geschoss (Fassung 2)', () => {
  const m = match({ wind: WIND_JE_ZUG });
  const id = m.activePlayerId;
  const waffeId = 'pa_075'; // Tornado, Faktor 2,5
  m.inventory.register(id, [waffeId]);
  assert.ok(m.fire(id, 0.7, 40, waffeId).ok);
  const geschoss = m.world.getEntitiesBySignature(COMPONENT_SIGNATURES.PROJECTILE | COMPONENT_SIGNATURES.POSITION)[0];
  assert.ok(geschoss !== undefined);
  assert.equal(m.world.getComponent(geschoss, 'Projectile', 'windFactor'), 2.5);
});

test('Replay-Kopf: neu trägt die Fassung des Matches, alter Kopf ohne Feld ist Fassung 1 und läuft bitgleich', () => {
  // Ohne Angabe: Recorder und Motor stehen beide auf dem Altstand (kein stiller Unterschied).
  assert.equal(new ReplayRecorder({ seed: 99 }).toJSON().config.wind, WIND_ALT);
  assert.equal(new ReplayRecorder({ seed: 99, wind: WIND_JE_ZUG }).toJSON().config.wind, WIND_JE_ZUG);

  // Fassung 2: Rundlauf Live → Aufzeichnung → Wiedergabe.
  const live = match({ wind: WIND_JE_ZUG });
  const rec = new ReplayRecorder({ ...KOPF, wind: live.windFassung });
  for (let tick = 0; tick < 600; tick += 1) {
    if (tick === 60) {
      const schuss = { playerId: live.activePlayerId, angle: 0.8, power: 55 };
      if (live.fire(schuss.playerId, schuss.angle, schuss.power).ok) {
        rec.recordInput({ tick: live.world.tickCount, ...schuss });
      }
    }
    live.step();
  }
  rec.finalize(live.world.tickCount);
  assert.equal(JSON.parse(rec.serialize()).config.wind, WIND_JE_ZUG);
  assert.equal(playReplay(ReplayRecorder.fromJSON(rec.serialize())).match.stateHash(), live.stateHash());

  // Fassung 1 ohne Feld im Kopf: gleiche Partie, gleicher Hash.
  const alt = match({ wind: WIND_ALT });
  const altRec = new ReplayRecorder({ ...KOPF });
  for (let tick = 0; tick < 600; tick += 1) {
    if (tick === 60) {
      const schuss = { playerId: alt.activePlayerId, angle: 0.8, power: 55 };
      if (alt.fire(schuss.playerId, schuss.angle, schuss.power).ok) {
        altRec.recordInput({ tick: alt.world.tickCount, ...schuss });
      }
    }
    alt.step();
  }
  altRec.finalize(alt.world.tickCount);
  const roh = JSON.parse(altRec.serialize());
  delete roh.config.wind;
  const zurueck = ReplayRecorder.fromJSON(roh);
  assert.equal(zurueck.config.wind, WIND_ALT);
  assert.equal(playReplay(zurueck).match.stateHash(), alt.stateHash());
});

test('HUD-Anzeige in Segmenten', () => {
  assert.equal(windSegmente(0), '→ ▯▯▯▯▯');
  assert.equal(windSegmente(MAX_WIND), '→ ▮▮▮▮▮');
  assert.equal(windSegmente(-MAX_WIND), '← ▮▮▮▮▮');
  const halb = windSegmente(MAX_WIND / 2);
  assert.equal(halb, '→ ▮▮▮▯▯');
  assert.equal(windSegmente(MAX_WIND * 4), '→ ▮▮▮▮▮', 'gedeckelt');
});
