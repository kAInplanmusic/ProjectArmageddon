/**
 * Online-Kennzahlen (TODO 2.16, UI-6): Servermeldungen (`{t, round, ...payload}`) füllen `MatchStats` wie lokal die
 * Engine-Ereignisse. Vorher blieben die Kennzahlen online leer.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fuettereOnlineKennzahl } from '../src/client/onlineKennzahlen.js';

const zustand = tick => ({ tick, entities: [{ entityId: 1, teamId: 0 }, { entityId: 2, teamId: 1 }, { entityId: 3, teamId: 1 }] });

test('Servermeldungen ergeben dieselben Kennzahlen wie lokale Ereignisse', () => {
  assert.equal(fuettereOnlineKennzahl(null, { t: 'turn_start', round: 1, playerId: 1 }, null), null, 'ohne Teams noch keine Erfassung');
  assert.equal(fuettereOnlineKennzahl(null, { t: 'turn_start' }, { entities: [] }), null);

  let stats = fuettereOnlineKennzahl(null, { t: 'turn_start', round: 1, playerId: 1, wind: 2 }, zustand(10));
  assert.ok(stats, 'erste Meldung mit bekannten Teams legt die Kennzahlen an');
  const gleiche = stats;
  stats = fuettereOnlineKennzahl(stats, { t: 'shot', round: 1, playerId: 1, weaponId: 'pa_001' }, zustand(20));
  stats = fuettereOnlineKennzahl(stats, { t: 'damage', round: 1, attackerId: 1, entityId: 2, amount: 30 }, zustand(60));
  stats = fuettereOnlineKennzahl(stats, { t: 'damage', round: 1, attackerId: 2, entityId: 3, amount: 99 }, zustand(61));
  stats = fuettereOnlineKennzahl(stats, { kaputt: true }, zustand(70));
  assert.equal(stats, gleiche, 'dieselben Kennzahlen über die ganze Partie');

  const z = stats.zusammenfassung([1]);
  assert.equal(z.runden, 1);
  assert.equal(z.ticks, 61, 'Takt aus dem Ansichtszustand (die kaputte Meldung zählt nicht)');
  assert.equal(z.eigener.schuesse, 1);
  assert.equal(z.eigener.treffer, 1, 'Treffer im Fenster nach dem Schuss');
  assert.equal(z.eigener.zuege, 1);
  assert.equal(z.eigener.schaden, 30, 'Teamschaden (2 → 3) zählt nicht, Schaden am Gegner schon');
});
