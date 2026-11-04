/**
 * Feuer- und Lavazellen im Online-Abgleich (EREIGNIS-1, Rest „Feuer-/Lava-Zellen nicht im Snapshot").
 *
 * Vorher kannte der Online-Client brennende Zellen und ruhende Lava nur aus gekappten Ereignislisten
 * (`maxZellenJeEreignis` 48); ein später Beitritt sah sie nie. Jetzt trägt `terrain_hash` (alle ~2 s mit dem
 * Vollsnapshot) den sichtbaren Stand als Abstandsliste (`shared/feuerStand.js`). Geprüft: Kodierung samt
 * Grenze und Eingabeprüfung, der Stand des Servers kommt beim Client gleich an, und das Lesen ändert den
 * Zustands-Hash nicht (keine Versionsmarke nötig).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LobbyManager } from '../src/server/lobby.js';
import { LobbySession } from '../src/server/gameServer.js';
import { MatchController } from '../src/engine/match.js';
import { FeuerOptik } from '../src/client/feuerOptik.js';
import { stoffById } from '../src/shared/config/stoffe.js';
import { FEUER_ENTFACHT } from '../src/shared/config/feuer.js';
import {
  MAX_FEUER_STAND_ZELLEN, packeZellen, entpackeZellen, feuerStandNutzlast, leseFeuerStand,
} from '../src/shared/feuerStand.js';

/** Brennbare Zellen der Stoffkarte (Mitten in Pixeln). */
function brennbareZellen(karte) {
  const orte = [];
  for (let i = 0; i < karte.feld.length; i += 1) {
    if (stoffById(karte.feld[i]).brennbar) {
      orte.push({ x: (i % karte.spalten) * karte.zelle + karte.zelle / 2, y: Math.floor(i / karte.spalten) * karte.zelle + karte.zelle / 2 });
    }
  }
  return orte;
}

/** Entzündet Brennbares (Hitze-Einschläge, bis etwas brennt) und lässt das Feuer ein paar Takte wachsen. */
function entzuende(match, takte = 40) {
  const orte = brennbareZellen(match.stoffkarte);
  assert.ok(orte.length > 0, 'Karte hat Brennbares');
  for (let i = 0; i < orte.length && match.feuerSystem.brennendeZellen === 0; i += 97) {
    match.feuerSystem.einschlag(orte[i].x, orte[i].y, 40, 'hitze');
  }
  assert.ok(match.feuerSystem.brennendeZellen > 0, 'entzündet');
  for (let i = 0; i < takte; i += 1) match.step();
  match.consumeEvents();
}

test('Abstandskodierung: Rundlauf, Grenze, und der Client verwirft Ungültiges', () => {
  const zellen = [3, 4, 5, 300, 301, 9000];
  const gepackt = packeZellen(zellen);
  assert.deepEqual(gepackt, [3, 1, 1, 295, 1, 8699]);
  assert.deepEqual(entpackeZellen(gepackt), zellen);

  const viele = Array.from({ length: MAX_FEUER_STAND_ZELLEN + 40 }, (_, i) => i * 2);
  const nutzlast = feuerStandNutzlast({ brennt: viele, lava: [] });
  assert.equal(nutzlast.brennt.length, MAX_FEUER_STAND_ZELLEN, 'gekappt');
  assert.equal(nutzlast.voll, false, 'gekappt heißt nicht vollständig');
  assert.ok(JSON.stringify(nutzlast).length < 4 * MAX_FEUER_STAND_ZELLEN, 'die Zeile bleibt klein');

  for (const schlecht of [null, 5, {}, { brennt: [1.5], lava: [] }, { brennt: [-1], lava: [] }, { brennt: [1], lava: 'x' },
    { brennt: Array(MAX_FEUER_STAND_ZELLEN + 1).fill(1), lava: [] }]) {
    assert.equal(leseFeuerStand(schlecht), null, JSON.stringify(schlecht)?.slice(0, 40));
  }
  assert.equal(leseFeuerStand({ brennt: [10], lava: [] }, 10), null, 'Zelle außerhalb der Karte');
});

test('Server-Meldung terrain_hash trägt den Feuerstand, der Client übernimmt ihn genau', () => {
  const manager = new LobbyManager();
  const { lobby } = manager.create({ teams: 2, unitsPerPlayer: 1, seed: 1, kartentyp: 'autonom' });
  const session = new LobbySession(manager.get(lobby.id));
  session.syncSeats();
  assert.ok(session.match.feuerSystem, 'Server läuft mit Feuerfassung 2');
  entzuende(session.match);

  const erwartet = session.match.feuerSystem.sichtStand();
  assert.ok(erwartet.brennt.length > 0, 'es brennt');
  const meldung = JSON.parse(JSON.stringify(session.terrainStand(false)));
  assert.ok(meldung.feuer, 'Feld feuer in terrain_hash');

  // Ein Client, der beitritt, nachdem das Feuer entstand: er kennt kein einziges Ereignis.
  const optik = new FeuerOptik();
  optik.flammen.set(1, 1); // veraltete Flamme, deren `aus` gekappt wurde
  optik.lava.add(2);
  assert.equal(optik.uebernimmMeldung(meldung.feuer, session.match.stoffkarte), true);
  assert.deepEqual([...optik.flammen.keys()].sort((a, b) => a - b), erwartet.brennt);
  assert.deepEqual([...optik.lava].sort((a, b) => a - b), erwartet.lava);

  // Fehlt das Feld (alter Server, FEUER_ALT), bleibt alles, wie es ist.
  assert.equal(optik.uebernimmMeldung(undefined, session.match.stoffkarte), false);
  assert.equal(optik.flammen.size, erwartet.brennt.length);
});

test('sichtStand liest nur: Zustands-Hash mit und ohne Abfrage gleich (Brand und Vulkanlava)', () => {
  const lauf = (abfragen, { seed, biom = null, takte, brand }) => {
    const m = new MatchController({ seed, teams: 2, playersPerTeam: 1, kartentyp: 'autonom', biom, maxRounds: 3, feuer: FEUER_ENTFACHT });
    m.start();
    if (brand) entzuende(m, 0);
    let brennt = 0;
    let lava = 0;
    for (let i = 0; i < takte; i += 1) {
      m.step();
      m.consumeEvents();
      if (abfragen && i % 10 === 0) {
        const s = m.feuerSystem.sichtStand();
        const zustand = m.feuerSystem.zustand();
        assert.deepEqual(s.brennt, [...zustand.brennt].sort((a, b) => a - b));
        const alle = new Set(zustand.lava);
        for (const idx of s.lava) assert.ok(alle.has(idx), 'nur echte Lavazellen');
        brennt += s.brennt.length;
        lava += s.lava.length;
      }
    }
    return { hash: m.stateHash(), brennt, lava };
  };
  const brand = { seed: 1, takte: 400, brand: true };
  const mitBrand = lauf(true, brand);
  assert.ok(mitBrand.brennt > 0, 'es hat gebrannt');
  assert.equal(mitBrand.hash, lauf(false, brand).hash);
  // Der erste Ausbruch kommt frühestens nach 2700 Takten (`FEUER.lava`).
  const vulkan = { seed: 21, biom: 'vulkan', takte: 3000, brand: false };
  const mitLava = lauf(true, vulkan);
  assert.ok(mitLava.lava > 0, 'ruhende Lava gesehen');
  assert.equal(mitLava.hash, lauf(false, vulkan).hash);
});
