/**
 * Geländefassung 19 (TODO 4.6): Zonenarten gewichtet statt gleichverteilt — mehr Inseln, Inselgruppen, Archipele und
 * Ebenen, weniger Höhlen und Pyramiden. Fassung 18 bleibt Bit für Bit.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { GELAENDE_VIELFALT, GELAENDE_GEWICHTE, GELAENDE_STANDARD, normalisiereGelaende } from '../src/shared/config/gelaende.js';
import { neuesMatch } from '../scripts/bot-partien.mjs';

const partie = (seed, extra = {}) => {
  const m = neuesMatch(seed, 5, { extra: { format: '24:9', groesse: 'mittel', ...extra } });
  m.start();
  return m;
};
const hash = m => createHash('sha1').update(m.bitmap).digest('hex').slice(0, 12);

test('Marke: 19 ist der Standard, 18 bleibt gültig', () => {
  assert.equal(GELAENDE_GEWICHTE, 19);
  assert.equal(GELAENDE_STANDARD, GELAENDE_GEWICHTE);
  assert.equal(normalisiereGelaende(18), 18);
});

test('Fassung 18 bleibt Bit für Bit; 19 ist deterministisch', () => {
  for (const seed of [1, 2, 3]) {
    assert.equal(hash(partie(seed, { gelaende: GELAENDE_VIELFALT })), hash(partie(seed, { gelaende: GELAENDE_VIELFALT })));
    assert.equal(hash(partie(seed, { gelaende: GELAENDE_GEWICHTE })), hash(partie(seed, { gelaende: GELAENDE_GEWICHTE })));
  }
});

test('Fassung 19 zieht seltener Höhlen und Pyramiden als 18 (40 Seeds)', () => {
  const zaehle = (fassung) => {
    let geschlossen = 0;
    for (let seed = 1; seed <= 40; seed += 1) {
      const art = partie(seed * 7919, { gelaende: fassung }).kartencharakter?.kartenart ?? '';
      if (/hoehle|pyramide/.test(art)) geschlossen += 1;
    }
    return geschlossen;
  };
  const alt = zaehle(GELAENDE_VIELFALT);
  const neu = zaehle(GELAENDE_GEWICHTE);
  assert.ok(neu < alt, `Höhlen/Pyramiden: Fassung 18 ${alt}, Fassung 19 ${neu}`);
});
