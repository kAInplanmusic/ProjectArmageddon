/**
 * Biomregel-Fassung 9 (TODO 2.6, Welle 3 Baustein C): Bodenwirkung. Das Gehtempo hängt am Stoff unter den Füßen (`bremst`).
 *
 * Geprüft wird: Versionsmarke; der Faktor (halb wirksam, nach unten begrenzt, vor Fassung 9 immer 1); im Match geht eine Figur auf
 * bremsendem Boden in Fassung 9 kürzer als in 8, auf nicht bremsendem gleich weit. Die Stärke selbst ist ein erster Ansatz.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BIOMREGELN_BODEN, BIOMREGELN_STANDARD, BIOMREGELN_TREIBSAND, BODENWIRKUNG, bodenTempoFaktor, normalisiereBiomregeln,
} from '../src/shared/config/biomregeln.js';
import { stoffAm } from '../src/shared/stoffkarte.js';
import { stoffById } from '../src/shared/config/stoffe.js';
import { neuesMatch } from '../scripts/bot-partien.mjs';
import { wasserregelText } from '../src/client/biomregelAnzeige.js';

test('Marke: 9 ist der Standard, 8 bleibt gültig', () => {
  assert.equal(BIOMREGELN_BODEN, 9);
  assert.equal(BIOMREGELN_STANDARD, BIOMREGELN_BODEN);
  assert.equal(normalisiereBiomregeln(9), 9);
  assert.equal(normalisiereBiomregeln(8), BIOMREGELN_TREIBSAND);
});

test('Faktor: halb wirksam, nach unten begrenzt, vor Fassung 9 und ohne Bremsen 1', () => {
  assert.equal(bodenTempoFaktor(8, 0.35), 1);
  assert.equal(bodenTempoFaktor(9, 0), 1);
  assert.equal(bodenTempoFaktor(9, 0.35), 1 - BODENWIRKUNG.anteil * 0.35);
  assert.equal(bodenTempoFaktor(9, 0.6), Math.max(BODENWIRKUNG.minFaktor, 0.7));
  assert.equal(bodenTempoFaktor(9, 1), BODENWIRKUNG.minFaktor);
  assert.equal(wasserregelText('quicksand', 9) !== null, true, 'Treibsandhinweis bleibt');
});

/** Lässt die aktive Figur 15 Takte nach rechts gehen (kurz: weiter vorn stehen oft Hänge); liefert Weg, Tempo und `bremst` am Start. */
function gehe(seed, biom, biomregeln) {
  const m = neuesMatch(seed, 4, { teams: 2, proTeam: 1, extra: { biom, biomregeln } });
  if (m.status !== 'playing') m.start();
  for (let i = 0; i < 400 && m.turnPauseMs > 0; i += 1) m.step();
  const id = m.activePlayerId;
  for (let i = 0; i < 120 && !m.isGrounded(id); i += 1) m.step();
  const x0 = m.world.getComponent(id, 'Position', 'x');
  const y0 = m.world.getComponent(id, 'Position', 'y');
  const bremst = stoffById(stoffAm(m.stoffkarte, x0, y0 + 12))?.bremst ?? 0;
  const tempo = m.gehen.tempoFuer(id);
  for (let i = 0; i < 15; i += 1) { m.gehen.setzeRichtung(id, 1); m.step(); }
  return { weg: m.world.getComponent(id, 'Position', 'x') - x0, tempo, bremst };
}

test('Match: auf bremsendem Boden geht die Figur in Fassung 9 kürzer, auf festem gleich weit', () => {
  let bremsend = 0; let fest = 0;
  for (const [seed, biom] of [[1, 'duenen'], [2, 'duenen'], [3, 'vulkan'], [1, 'fabrik'], [2, 'burg']]) {
    const alt = gehe(seed, biom, BIOMREGELN_TREIBSAND);
    const neu = gehe(seed, biom, BIOMREGELN_BODEN);
    assert.equal(neu.bremst, alt.bremst, 'derselbe Boden');
    if (alt.bremst > 0) {
      assert.ok(Math.abs(neu.tempo - alt.tempo * bodenTempoFaktor(9, alt.bremst)) < 1e-9, `${biom} ${seed}: Tempo ${neu.tempo} gegen ${alt.tempo}`);
      assert.ok(neu.weg < alt.weg, `${biom} ${seed}: Weg ${neu.weg} gegen ${alt.weg} (bremst ${alt.bremst})`);
      bremsend += 1;
    } else {
      assert.equal(neu.tempo, alt.tempo);
      assert.equal(neu.weg, alt.weg, `${biom} ${seed}: ohne Bremsen gleich`);
      fest += 1;
    }
  }
  assert.ok(bremsend > 0 && fest > 0, `beide Fälle vorgekommen (${bremsend} bremsend, ${fest} fest)`);
});
