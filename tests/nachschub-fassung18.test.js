/**
 * BAL-05: Nachschub füllt sich nie selbst (Waffenfassung 18).
 *
 * ## Der Befund
 *
 * `restoreAmmo` füllte von der ersten endlichen Waffe an auf — auch die Nachschubwaffe selbst.
 * Bei sonst vollem Inventar bekam sie die gerade verbrauchte Ladung sofort zurück und war damit
 * unerschöpflich (`docs/waffenbalance-2026-11-09/BAL-13-ABNAHME.md`, „Befund zur
 * Nachschub-Ökonomie“). Stand sie im Inventar VOR der Waffe, die sie auffüllen sollte, verbrauchte
 * sie zudem einen Teil der Wirkung für sich.
 *
 * ## Die Entscheidung (Auftraggeber, 2026-11-09)
 *
 * „Füllt sich nie selbst“: Die Nachschubwaffe füllt nur ANDERE endliche Waffen auf.
 *
 * ## Was hier geprüft wird
 *
 *  - Je Nachschubwaffe (pa_119, pa_122, pa_125) zehn Anwendungen bei vollem Inventar, zusammen 30:
 *    der eigene Vorrat sinkt mit jeder Anwendung um eins und ist nach fünf leer.
 *  - Die volle Wirkung kommt bei der anderen Waffe an, unabhängig von der Reihenfolge im Inventar.
 *  - Fassung 17 verhält sich wie bisher (Gegenprobe), und derselbe Ablauf ergibt in Fassung 17 und
 *    18 denselben Zustandshash, solange keine Nachschubwaffe benutzt wird.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MatchController } from '../src/engine/match.js';
import { KIT_FLAECHE } from '../src/shared/config/loadouts.js';
import { KISTEN_OFT } from '../src/shared/config/kisten.js';
import { KLASSEN_NEU } from '../src/shared/config/klassen-fassung.js';
import {
  WAFFEN_KLASSE, WAFFEN_NACHSCHUB, WAFFEN_STANDARD, normalisiereWaffen,
} from '../src/shared/config/waffen-fassung.js';

const NACHSCHUB = Object.freeze([['pa_119', 2], ['pa_122', 3], ['pa_125', 4]]);

function aufbau(waffen) {
  const match = new MatchController({
    seed: 20261109, teams: 2, playersPerTeam: 1, preset: 'open', turnDurationMs: 1_000_000,
    kit: KIT_FLAECHE, schaden: 2, kisten: KISTEN_OFT, waffen, klassen: KLASSEN_NEU,
    loadouts: [{ classId: 'fernkampf' }, { classId: 'fernkampf' }],
  });
  match.start();
  return { match, schuetze: match.activePlayerId };
}

function warteBisAmZug(match, playerId) {
  for (let i = 0; i < 12 && match.status === 'playing' && match.activePlayerId !== playerId; i += 1) match.endTurn();
  return match.status === 'playing' && match.activePlayerId === playerId;
}

function wende(match, schuetze, waffe) {
  assert.ok(warteBisAmZug(match, schuetze), `${waffe}: kein Zug`);
  match.inventory.selectWeapon(schuetze, waffe);
  const r = match.fire(schuetze, 0.5, 50, waffe);
  match.consumeEvents();
  return r;
}

test('Fassung 18 ist der Standard und folgt direkt auf Fassung 17', () => {
  assert.equal(WAFFEN_NACHSCHUB, WAFFEN_KLASSE + 1);
  assert.equal(WAFFEN_STANDARD, WAFFEN_NACHSCHUB);
  assert.equal(normalisiereWaffen(17), WAFFEN_KLASSE, 'Fassung 17 bleibt eine gültige Marke (alte Replays)');
  assert.equal(normalisiereWaffen(18), WAFFEN_NACHSCHUB);
});

test('Fassung 18: 30 Anwendungen bei vollem Inventar — der eigene Vorrat geht zur Neige', () => {
  let anwendungen = 0;
  for (const [waffe] of NACHSCHUB) {
    const { match, schuetze } = aufbau(WAFFEN_NACHSCHUB);
    match.inventory.register(schuetze, ['pa_072', waffe], { ammoPerWeapon: 5 });
    for (let i = 1; i <= 10; i += 1) {
      const r = wende(match, schuetze, waffe);
      anwendungen += 1;
      if (i <= 5) {
        assert.ok(r.ok, `${waffe} Anwendung ${i}: ${r.errors?.join(', ')}`);
        assert.equal(r.special.restored, 0, `${waffe} Anwendung ${i}: bei vollem Inventar gibt es nichts aufzufüllen`);
        assert.equal(match.inventory.getAmmo(schuetze, waffe), 5 - i, `${waffe} Anwendung ${i}: eigener Vorrat`);
      } else {
        assert.equal(r.ok, false, `${waffe} Anwendung ${i}: ohne Ladung darf sie nicht mehr wirken`);
        assert.equal(match.inventory.getAmmo(schuetze, waffe), 0, `${waffe}: bleibt leer`);
      }
      assert.equal(match.inventory.getAmmo(schuetze, 'pa_072'), 5, `${waffe}: die volle Waffe bleibt voll`);
    }
  }
  assert.equal(anwendungen, 30, 'BAL-05 verlangt mindestens 20 belegte Anwendungen');
});

test('Fassung 18: die ganze Wirkung kommt bei der anderen Waffe an, in jeder Inventar-Reihenfolge', () => {
  for (const [waffe, menge] of NACHSCHUB) {
    for (const reihenfolge of [['pa_072', waffe], [waffe, 'pa_072']]) {
      const { match, schuetze } = aufbau(WAFFEN_NACHSCHUB);
      match.inventory.register(schuetze, reihenfolge, { ammoPerWeapon: 1 });
      const kapazitaet = match.inventory.kapazitaet('pa_072');
      const r = wende(match, schuetze, waffe);
      assert.ok(r.ok, `${waffe} ${reihenfolge}`);
      const erwartet = Math.min(menge, kapazitaet - 1);
      assert.equal(r.special.restored, erwartet, `${waffe} ${reihenfolge}: aufgefüllt`);
      assert.equal(match.inventory.getAmmo(schuetze, 'pa_072'), 1 + erwartet, `${waffe} ${reihenfolge}: Vorrat der anderen Waffe`);
      assert.equal(match.inventory.getAmmo(schuetze, waffe), 0, `${waffe} ${reihenfolge}: eigene Ladung verbraucht`);
    }
  }
});

test('Gegenprobe Fassung 17: der Nachschub stellt seine eigene Ladung wieder her (Altverhalten)', () => {
  for (const [waffe] of NACHSCHUB) {
    const { match, schuetze } = aufbau(WAFFEN_KLASSE);
    match.inventory.register(schuetze, ['pa_072', waffe], { ammoPerWeapon: 5 });
    for (let i = 1; i <= 7; i += 1) {
      const r = wende(match, schuetze, waffe);
      assert.ok(r.ok, `${waffe} Anwendung ${i}: in Fassung 17 unerschöpflich`);
      assert.equal(r.special.restored, 1, `${waffe} Anwendung ${i}: die eigene Ladung`);
      assert.equal(match.inventory.getAmmo(schuetze, waffe), 5, `${waffe} Anwendung ${i}: wieder voll`);
    }
  }
});

test('Ohne Nachschubwaffe sind Fassung 17 und 18 bitgleich', () => {
  const lauf = (waffen) => {
    const { match } = aufbau(waffen);
    let schuesse = 0;
    for (let zug = 0; zug < 6 && match.status === 'playing'; zug += 1) {
      const id = match.activePlayerId;
      // Ausdrücklich eine Schadenswaffe: Das Start-Kit legt sonst von selbst eine Nachschubwaffe in die Hand.
      match.inventory.grantWeapon(id, 'pa_072');
      match.inventory.grantAmmo(id, 'pa_072', 5);
      match.inventory.selectWeapon(id, 'pa_072');
      const r = match.fire(id, 0.6 + zug * 0.05, 70, 'pa_072');
      if (r.ok) schuesse += 1; // Abklingzeit: der Zug wird dann nur beendet
      for (let i = 0; i < 900 && match.activeProjectileCount > 0; i += 1) match.step();
      for (let i = 0; i < 30; i += 1) match.step();
      if (match.activePlayerId === id) match.endTurn();
    }
    assert.ok(schuesse >= 3, `nur ${schuesse} Schüsse — der Vergleich wäre leer`);
    return match.stateHash();
  };
  assert.equal(lauf(WAFFEN_NACHSCHUB), lauf(WAFFEN_KLASSE));
});
