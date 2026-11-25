/**
 * Asche und Basalt für späte Beitritte (TODO 2.16, ONLINE-KENNZAHLEN b).
 *
 * Die Überlagerung `karte.ueber` (Asche aus Feuer, Basalt/Obsidian aus Lava) kam online nur über Ereignisse;
 * wer später beitrat oder die Karte neu aufbaute, sah das alte Gelände. Jetzt tragen WELCOME und
 * `terrain_state` sie als Abstandslisten je Stoff (`shared/feuerStand.js`). Geprüft: Kodierung samt Grenze
 * und Eingabeprüfung, der Server liefert genau seine Überlagerung, `terrain_hash` bleibt ohne sie.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LobbyManager } from '../src/server/lobby.js';
import { LobbySession } from '../src/server/gameServer.js';
import { stoffById, STOFF } from '../src/shared/config/stoffe.js';
import { MAX_UEBER_STAND_ZELLEN, ueberStandNutzlast, leseUeberStand } from '../src/shared/feuerStand.js';

/** Baut aus der gelesenen Liste wieder eine Überlagerung (so, wie der Client sie färbt). */
function zurueck(liste, laenge) {
  const ueber = new Uint8Array(laenge);
  for (const { stoff, zellen } of liste) for (const idx of zellen) ueber[idx] = stoff + 1;
  return ueber;
}

test('Überlagerung: Rundlauf je Stoff, leere Karte ohne Feld, Grenze und Eingabeprüfung', () => {
  assert.equal(ueberStandNutzlast(null), null);
  assert.equal(ueberStandNutzlast(new Uint8Array(50)), null, 'nichts überlagert: kein Feld');

  const ueber = new Uint8Array(1000);
  for (const idx of [3, 4, 5, 700]) ueber[idx] = STOFF.ASCHE + 1;
  for (const idx of [10, 999]) ueber[idx] = STOFF.BASALT + 1;
  const nutzlast = JSON.parse(JSON.stringify(ueberStandNutzlast(ueber)));
  assert.equal(nutzlast.voll, true);
  assert.deepEqual(zurueck(leseUeberStand(nutzlast, ueber.length), ueber.length), ueber);

  const gross = new Uint8Array(MAX_UEBER_STAND_ZELLEN * 2).fill(STOFF.ASCHE + 1);
  const gekappt = ueberStandNutzlast(gross);
  assert.equal(gekappt.voll, false, 'gekappt heißt nicht vollständig');
  assert.equal(leseUeberStand(gekappt).reduce((n, e) => n + e.zellen.length, 0), MAX_UEBER_STAND_ZELLEN);

  for (const schlecht of [null, 7, {}, { stoffe: 'x' }, { stoffe: [[1]] }, { stoffe: [[1.5, [1]]] }, { stoffe: [[-1, [1]]] },
    { stoffe: [[300, [1]]] }, { stoffe: [[1, [-2]]] },
    { stoffe: [[1, Array(MAX_UEBER_STAND_ZELLEN).fill(0)], [2, [0]]] }]) {
    assert.equal(leseUeberStand(schlecht), null, JSON.stringify(schlecht)?.slice(0, 40));
  }
  assert.equal(leseUeberStand({ stoffe: [[1, [10]]] }, 10), null, 'Zelle außerhalb der Karte');
});

test('terrain_state trägt die Asche des Servers, terrain_hash nicht', () => {
  const manager = new LobbyManager();
  const { lobby } = manager.create({ teams: 2, unitsPerPlayer: 1, seed: 1, kartentyp: 'autonom' });
  const session = new LobbySession(manager.get(lobby.id));
  session.syncSeats();
  const match = session.match;
  assert.ok(match.feuerSystem, 'Server läuft mit Feuer');
  const karte = match.stoffkarte;
  // Wie `feuer-online-stand.test.js`: Hitze-Einschläge, bis etwas brennt, dann ausbrennen lassen.
  for (let i = 0; i < karte.feld.length && match.feuerSystem.brennendeZellen === 0; i += 97) {
    if (stoffById(karte.feld[i]).brennbar) {
      match.feuerSystem.einschlag((i % karte.spalten) * karte.zelle + karte.zelle / 2, Math.floor(i / karte.spalten) * karte.zelle + karte.zelle / 2, 40, 'hitze');
    }
  }
  assert.ok(match.feuerSystem.brennendeZellen > 0, 'entzündet');
  for (let t = 0; t < 1200 && !karte.ueber?.some(v => v !== 0); t += 1) match.step();
  match.consumeEvents();
  assert.ok(karte.ueber?.some(v => v === STOFF.ASCHE + 1), 'es liegt Asche');

  assert.equal(session.terrainStand(false).ueber, undefined, 'die 2-s-Meldung bleibt schlank');
  const stand = JSON.parse(JSON.stringify(session.terrainStand(true)));
  assert.ok(stand.ueber, 'Nachlieferung trägt die Überlagerung');
  assert.deepEqual(zurueck(leseUeberStand(stand.ueber, karte.feld.length), karte.feld.length), karte.ueber);
});
