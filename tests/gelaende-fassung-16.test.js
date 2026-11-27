/**
 * Geländefassung 16 (TODO 2.3b): Startfairness (`engine/startFairness.js`).
 *
 * Geprüft wird: Versionsmarke; die Verteilung an gebauten Plätzen (unfaire Reihe wird umverteilt, faire bleibt, mehr als zwei
 * Teams und zu viele Plätze bleiben); im Match bleiben die Karten die der Fassung 15, die Plätze dieselben (nur anders verteilt),
 * und eine schon faire Partie ist Bit für Bit dieselbe. Die Schwellen (150 px, 1,6, 120 px) sind gemessen, nicht Gegenstand.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { GELAENDE_DURCHGANG, GELAENDE_START, GELAENDE_STANDARD, normalisiereGelaende } from '../src/shared/config/gelaende.js';
import { MAX_PLAETZE, startKosten, verteileStartplaetze } from '../src/engine/startFairness.js';
import { neuesMatch } from '../scripts/bot-partien.mjs';

test('Marke: 16 ist gültig (Standard 19), 15 bleibt gültig', () => {
  assert.equal(GELAENDE_START, 16);
  assert.equal(GELAENDE_STANDARD, GELAENDE_START + 3, 'Standard ist 19 (Zonengewichte)');
  assert.equal(normalisiereGelaende(16), 16);
  assert.equal(normalisiereGelaende(15), GELAENDE_DURCHGANG);
});

test('Verteilung: Team 0 oben auf dem Berg, Team 1 im Tal → umverteilt; das Ergebnis ist fair und gemischt', () => {
  // Abwechselnde Reihe: gerade Plätze 300 px höher (Team 0 steht immer oben).
  const plaetze = [0, 1, 2, 3, 4, 5].map(i => ({ x: 200 + i * 300, y: i % 2 === 0 ? 400 : 700 }));
  const vorher = plaetze.map((_, i) => i % 2);
  assert.ok(startKosten(plaetze, vorher) > 1, 'vorher unfair');
  const platzVon = verteileStartplaetze(plaetze, 2);
  assert.deepEqual([...platzVon].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5], 'jeder Platz genau einmal');
  const team = new Array(6);
  platzVon.forEach((platz, spieler) => { team[platz] = spieler % 2; });
  assert.ok(startKosten(plaetze, team) <= 1, `nachher fair (${startKosten(plaetze, team)})`);
});

test('Verteilung: eine faire Reihe, drei Teams und zu viele Plätze bleiben unverändert', () => {
  const eben = [0, 1, 2, 3, 4, 5].map(i => ({ x: 200 + i * 300, y: 500 }));
  assert.deepEqual(verteileStartplaetze(eben, 2), [0, 1, 2, 3, 4, 5]);
  const berg = [0, 1, 2, 3, 4, 5].map(i => ({ x: 200 + i * 300, y: i % 2 === 0 ? 400 : 700 }));
  assert.deepEqual(verteileStartplaetze(berg, 3), [0, 1, 2, 3, 4, 5], 'drei Teams');
  const viele = Array.from({ length: MAX_PLAETZE + 2 }, (_, i) => ({ x: 100 + i * 150, y: i % 2 ? 400 : 700 }));
  assert.deepEqual(verteileStartplaetze(viele, 2), viele.map((_, i) => i), 'über MAX_PLAETZE');
});

const plaetzeVon = m => m.getState().entities.filter(e => e.teamId !== undefined).map(e => ({ x: e.x, y: e.y, teamId: e.teamId }));
const partie = (seed, gelaende) => { const m = neuesMatch(seed, 4, { teams: 2, proTeam: 3, extra: { gelaende } }); m.start(); return m; };
const hash = buf => createHash('sha1').update(buf).digest('hex').slice(0, 12);

test('Match: Karten wie Fassung 15, Plätze dieselben; umverteilte Partien werden fair, faire bleiben gleich', () => {
  let umverteilt = 0; let gleich = 0;
  for (let seed = 1; seed <= 24; seed += 1) {
    const alt = partie(seed, GELAENDE_DURCHGANG);
    const neu = partie(seed, GELAENDE_START);
    assert.equal(hash(neu.bitmap), hash(alt.bitmap), `Seed ${seed}: Karte`);
    const a = plaetzeVon(alt); const n = plaetzeVon(neu);
    const schluessel = p => `${Math.round(p.x)}|${Math.round(p.y)}`;
    assert.deepEqual(n.map(schluessel).sort(), a.map(schluessel).sort(), `Seed ${seed}: dieselben Plätze`);
    const kostenAlt = startKosten(a, a.map(p => p.teamId));
    if (kostenAlt <= 1) {
      assert.deepEqual(n, a, `Seed ${seed}: fair → unverändert`);
      gleich += 1;
    } else {
      assert.ok(startKosten(n, n.map(p => p.teamId)) <= kostenAlt, `Seed ${seed}: nicht schlechter`);
      umverteilt += 1;
    }
  }
  assert.ok(gleich > 0 && umverteilt > 0, `beide Fälle vorgekommen (${gleich} gleich, ${umverteilt} umverteilt)`);
});
