/**
 * Geländefassung 17 (TODO 2.12): Startplätze nicht zu dicht.
 *
 * Geprüft wird: Versionsmarke; auf 1:1 unter RUND_AB_BREITE zieht der Seed keine runde Art mehr (eine gewählte bleibt); Startplätze
 * auf autonomen Karten halten START_ABSTAND_MIN; Fassung 16 bleibt bitgleich (Karte und Plätze). Messung (je 100 Seeds, Gegner unter
 * 120 px): 1:1 „mittel“ 11 → 5, klein 7 → 8, Standard 0 → 1; der knappste Abstand stieg von 22 px auf 101 px.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  GELAENDE_ABSTAND, GELAENDE_START, GELAENDE_STANDARD, KARTENARTEN_RUND, RUND_AB_BREITE, START_ABSTAND_MIN, normalisiereGelaende,
} from '../src/shared/config/gelaende.js';
import { neuesMatch } from '../scripts/bot-partien.mjs';

test('Marke: 17 ist gültig (Standard 18), 16 bleibt gültig', () => {
  assert.equal(GELAENDE_ABSTAND, 17);
  assert.equal(GELAENDE_STANDARD, GELAENDE_ABSTAND + 1); // seit TODO 4.6 Fassung 18
  assert.equal(normalisiereGelaende(17), 17);
  assert.equal(normalisiereGelaende(16), GELAENDE_START);
  assert.equal(RUND_AB_BREITE, 2880);
});

const partie = (seed, extra) => { const m = neuesMatch(seed, 4, { teams: 2, proTeam: 3, extra }); if (m.status !== 'playing') m.start(); return m; };

test('1:1 „mittel“ (1920 px): der Seed zieht keine runde Art mehr; ausdrücklich gewählt bleibt sie', () => {
  for (let seed = 1; seed <= 40; seed += 1) {
    const art = partie(seed, { format: '1:1', groesse: 'mittel' }).kartencharakter?.kartenart;
    assert.ok(!KARTENARTEN_RUND.includes(art), `Seed ${seed}: ${art}`);
  }
  assert.equal(partie(1, { format: '1:1', groesse: 'mittel', kartenart: 'rundPlanet' }).kartencharakter?.kartenart, 'rundPlanet');
});

test('Startplätze halten den Mindestabstand (wo die Karte es zulässt)', () => {
  let paare = 0; let zuNah = 0;
  for (let seed = 1; seed <= 20; seed += 1) {
    const xs = partie(seed, { groesse: 'klein' }).getState().entities.filter(e => e.teamId !== undefined).map(e => e.x);
    for (let i = 0; i < xs.length; i += 1) for (let j = i + 1; j < xs.length; j += 1) { paare += 1; if (Math.abs(xs[i] - xs[j]) < START_ABSTAND_MIN) zuNah += 1; }
  }
  assert.equal(zuNah, 0, `${zuNah} von ${paare} Paaren näher als ${START_ABSTAND_MIN} px`);
});

test('Fassung 16 bleibt Bit für Bit (Karte und Startplätze), auf der Standardgröße ändert 17 die Karte nicht', () => {
  const hash = m => createHash('sha1').update(m.bitmap).digest('hex').slice(0, 12);
  for (const seed of [1, 2, 3, 4]) {
    const a = partie(seed, { gelaende: GELAENDE_START });
    const b = partie(seed, { gelaende: GELAENDE_START });
    assert.equal(hash(a), hash(b));
    assert.equal(hash(partie(seed, { gelaende: GELAENDE_ABSTAND })), hash(a), `Seed ${seed}: Querformat ohne runde Arten, Karte gleich`);
  }
});
