/**
 * Replay-Kompatibilität: ALLE Altmarken gleichzeitig (= ältester Stand).
 *
 * Die Einzelgoldwerte je Marke stehen in den Fassungstests (`schadensarten`, `waffen-fassung`,
 * `kisten`, `zerstoerung*`, `loadout-choice`). Hier steht nur die Kombination:
 * zerstoerung 1, schaden 1, kit 1, waffen 1, kisten 1 zusammen — gegen EINEN einmal gemessenen Goldwert.
 * Neu-Köpfe schreiben die höchste exportierte Fassung (so nimmt der Test spätere Fassungen ohne Änderung mit).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { MatchController } from '../src/engine/match.js';
import { ReplayRecorder, ReplayPlayer } from '../src/engine/replay.js';
import * as zerstoerung from '../src/shared/config/zerstoerung.js';
import * as schaden from '../src/shared/config/schaden.js';
import * as loadouts from '../src/shared/config/loadouts.js';
import * as waffen from '../src/shared/config/waffen-fassung.js';
import * as kisten from '../src/shared/config/kisten.js';

/** Goldwert des Endhashs eines Altlaufs (Seed 4242, 2x2, hills, 2400 Ticks), einmal gemessen. */
const GOLD_ALLE_ALT = '7048db00';

const ALT = { kit: 1, zerstoerung: 1, schaden: 1, waffen: 1, kisten: 1 };
const KOPF = { seed: 4242, teams: 2, playersPerTeam: 2, preset: 'hills', maxRounds: 5 };

/** Höchste Fassungsnummer eines Konfigurationsmoduls (`PRAEFIX_*`-Exporte, ohne `_STANDARD`). */
function neueste(modul, praefix) {
  const nummern = Object.entries(modul)
    .filter(([name, wert]) => new RegExp(`^${praefix}_[A-Z]+$`).test(name) && name !== `${praefix}_STANDARD` && Number.isInteger(wert))
    .map(([, wert]) => wert);
  return Math.max(...nummern);
}

const NEUESTE = {
  kit: neueste(loadouts, 'KIT'),
  zerstoerung: neueste(zerstoerung, 'ZERSTOERUNG'),
  schaden: neueste(schaden, 'SCHADEN'),
  waffen: neueste(waffen, 'WAFFEN'),
  kisten: neueste(kisten, 'KISTEN'),
};

/** Spielt live und zeichnet auf; liefert Aufzeichnung (JSON) und Endhash. */
function aufzeichnen(fassungen) {
  const live = new MatchController({ ...KOPF, ...fassungen });
  live.start();
  const rec = new ReplayRecorder({
    ...KOPF, turnDurationMs: live.turnDurationMs, kit: live.kit, schaden: live.schaden,
    zerstoerung: live.zerstoerung, waffen: live.waffen, kisten: live.kisten,
  });
  let schuesse = 0;
  for (let tick = 0; tick < 2400; tick += 1) {
    if (live.activeProjectileCount === 0 && tick % 120 === 0) {
      const id = live.activePlayerId;
      const winkel = 0.5 + (schuesse % 9) * 0.15;
      const kraft = 40 + ((schuesse * 13) % 50);
      const waffe = live.inventory.getActiveWeaponId(id);
      if (live.fire(id, winkel, kraft, waffe).ok) {
        rec.recordInput({ tick: live.world.tickCount, playerId: id, angle: winkel, power: kraft, weaponId: waffe });
      }
      schuesse += 1;
    }
    live.step();
    live.consumeEvents();
  }
  rec.finalize(live.world.tickCount);
  return { json: rec.serialize(), hash: live.stateHash(), live };
}

function abspielen(json) {
  const spieler = new ReplayPlayer(ReplayRecorder.fromJSON(json));
  while (!spieler.finished) spieler.advance?.() ?? spieler.step?.();
  return spieler.match;
}

test('Altköpfe (alle Marken auf der ältesten Fassung): Aufzeichnung trägt sie, Wiedergabe endet im Live-Hash', () => {
  const { json, hash, live } = aufzeichnen(ALT);
  assert.deepEqual(
    { kit: live.kit, zerstoerung: live.zerstoerung, schaden: live.schaden, waffen: live.waffen, kisten: live.kisten }, ALT,
  );
  const kopf = JSON.parse(json).config;
  for (const [feld, wert] of Object.entries(ALT)) assert.equal(kopf[feld], wert, `Kopf ${feld}`);
  const match = abspielen(json);
  assert.equal(match.stateHash(), hash, 'Wiedergabe = Live-Lauf');
  assert.equal(hash, GOLD_ALLE_ALT, 'Goldwert des ältesten Stands');
});

test('Eine Datei ganz ohne Fassungsfelder spielt als ältester Stand und endet im selben Hash', () => {
  const { json } = aufzeichnen(ALT);
  const roh = JSON.parse(json);
  for (const feld of ['kit', 'zerstoerung', 'schaden', 'waffen', 'kisten']) delete roh.config[feld];
  const match = abspielen(JSON.stringify(roh));
  assert.equal(match.stateHash(), GOLD_ALLE_ALT);
});

test('Neu-Köpfe schreiben die jeweils neueste Fassung; sie ist zugleich der Standard', () => {
  const kopf = new ReplayRecorder({ ...KOPF }).toJSON().config;
  for (const [feld, wert] of Object.entries(NEUESTE)) assert.equal(kopf[feld], wert, `Neu-Kopf ${feld}`);
  assert.equal(new MatchController({ ...KOPF }).zerstoerung, NEUESTE.zerstoerung);
  const neu = aufzeichnen({});
  assert.notEqual(neu.hash, GOLD_ALLE_ALT, 'Die neuesten Regeln verändern den Verlauf — sonst wäre die Marke nutzlos');
  assert.equal(abspielen(neu.json).stateHash(), neu.hash, 'Auch der Neu-Kopf läuft rund');
});
