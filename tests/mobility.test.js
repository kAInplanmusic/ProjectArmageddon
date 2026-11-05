/**
 * Tests: Wirkt die Beweglichkeit der Klasse im MATCH?
 *
 * `counterplay.test.js` prüft die Ableitung, `class-profile.test.js` die
 * Verrechnung — hier wird geprüft, dass die Bewegung wirklich anders ausfällt.
 * Seit Klassenfassung 3 ist der Nahkampf der beweglichste Charakter
 * (`speed: 1.2`), der Okkultist der unbeweglichste (`0.8`).
 *
 * Gemessen wird die SPRUNGHÖHE, nicht ein Zwischenwert: Eine Figur, die höher
 * springt, kommt auf Stellungen, die anderen verschlossen bleiben.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MatchController } from '../src/engine/match.js';
import { CLASS_IDS, combatProfile } from '../src/shared/config/classes.js';
import { KLASSEN_STANDARD } from '../src/shared/config/klassen-fassung.js';

/**
 * Misst die Sprunghöhe einer Klasse in Fassung 3.
 *
 * Die Figur muss dafür am ZUG sein — nur der aktive Spieler kann springen — und
 * vorher landen. Deshalb wird das Match laufen gelassen, bis die gesuchte
 * Klasse dran ist.
 */
function sprungHoehe(klasseName) {
  const m = new MatchController({
    seed: 4242, teams: 2, playersPerTeam: 3, preset: 'hills', klassen: KLASSEN_STANDARD,
  });
  m.start();

  let schutz = 0;
  while (schutz++ < 20_000) {
    const aktiv = m.activePlayerId;
    if (aktiv !== null) {
      const p = m.players.find(e => e.entityId === aktiv);
      if (CLASS_IDS[p.classId] === klasseName) {
        // Erst landen lassen — in der Luft ist kein erster Sprung möglich.
        let g = 0;
        while (!m.isGrounded(aktiv) && g++ < 600) m.step();

        const y0 = m.world.getComponent(aktiv, 'Position', 'y');
        const r = m.jump(aktiv, 0);
        if (!r.ok) return null;

        let minY = y0;
        for (let i = 0; i < 240; i++) {
          m.step();
          const y = m.world.getComponent(aktiv, 'Position', 'y');
          if (typeof y === 'number' && y < minY) minY = y;
        }
        return { hoehe: y0 - minY, impuls: r.impulse };
      }
    }
    m.step();
  }
  return null;
}

test('Der Nahkampf springt höher als Fernkampf und Okkultist', () => {
  /*
   * DIE Kernaussage: `speed` wirkt auf den Absprung. Vor dem Verdrahten sprang
   * jede Klasse gleich hoch — der Wert existierte nur auf dem Papier.
   */
  const nah = sprungHoehe('nahkampf');
  const fern = sprungHoehe('fernkampf');
  const okkult = sprungHoehe('okkultist');

  assert.ok(nah && fern && okkult, 'nicht alle Klassen gemessen');
  assert.ok(nah.hoehe > fern.hoehe,
    `Der Nahkampf muss höher springen als der Fernkampf (${nah.hoehe.toFixed(1)} px `
    + `gegen ${fern.hoehe.toFixed(1)} px)`);
  assert.ok(nah.hoehe > okkult.hoehe,
    `Der Nahkampf muss höher springen als der Okkultist (${nah.hoehe.toFixed(1)} px `
    + `gegen ${okkult.hoehe.toFixed(1)} px)`);
});

test('Der Sprungunterschied ist spürbar, aber nicht kartensprengend', () => {
  /*
   *  - spürbar: Die Stärke muss sich lohnen.
   *  - nicht kartensprengend: Der Nahkampf darf nicht über das Gelände hinweg
   *    kommen. Gemessen wird gegen die hills-Amplitude (rund 151 px).
   *
   * Die Schwellen sind bewusst mit Abstand gesetzt und nicht auf die gemessenen
   * Werte gepinnt: Eine kleine Balance-Korrektur soll diesen Test nicht rot
   * machen, eine Verdreifachung der Sprunghöhe schon.
   */
  const nah = sprungHoehe('nahkampf');
  const okkult = sprungHoehe('okkultist');

  const aufschlag = (nah.hoehe / okkult.hoehe - 1) * 100;
  assert.ok(aufschlag >= 10,
    `Der Aufschlag von ${aufschlag.toFixed(1)} % ist zu klein — die Stärke wäre nicht spürbar`);
  assert.ok(aufschlag <= 80,
    `Der Aufschlag von ${aufschlag.toFixed(1)} % ist zu groß — der Nahkampf käme über das Gelände hinweg`);

  assert.ok(nah.hoehe < 151,
    `Der Nahkampf springt ${nah.hoehe.toFixed(1)} px — über den Höhenunterschied von `
    + 'hills (rund 151 px). Die Karte verlöre ihre Form.');
});

test('Die Sprunghöhe folgt der Beweglichkeit im Kampfprofil', () => {
  const werte = CLASS_IDS.map(k => ({
    klasse: k,
    beweglichkeit: combatProfile(k, null, null, KLASSEN_STANDARD).mobilityMultiplier,
    hoehe: sprungHoehe(k)?.hoehe ?? 0,
  }));

  const nachProfil = [...werte].sort((a, b) => b.beweglichkeit - a.beweglichkeit);
  const nachHoehe = [...werte].sort((a, b) => b.hoehe - a.hoehe);

  assert.deepEqual(nachHoehe.map(w => w.klasse), nachProfil.map(w => w.klasse),
    'Die Reihenfolge der Sprunghöhen weicht von der Beweglichkeit im Profil ab — '
    + `Profil: ${nachProfil.map(w => `${w.klasse} ${w.beweglichkeit}`).join(', ')} | `
    + `Höhe: ${nachHoehe.map(w => `${w.klasse} ${w.hoehe.toFixed(1)}`).join(', ')}`);
});

test('Die Beweglichkeit ist deterministisch', () => {
  const a = sprungHoehe('nahkampf');
  const b = sprungHoehe('nahkampf');
  assert.equal(a.hoehe, b.hoehe,
    'Die Sprunghöhe ist nicht reproduzierbar — der Motor rechnet nicht pur');
});

test('Ein Match mit dem Sprungverhalten ist reproduzierbar', () => {
  function laufen() {
    const m = new MatchController({
      seed: 777, teams: 2, playersPerTeam: 2, preset: 'hills', klassen: KLASSEN_STANDARD,
    });
    m.start();
    for (let i = 0; i < 300; i++) {
      // Gelegentlich springen, damit der Faktor in den Verlauf eingeht.
      if (i % 60 === 0 && m.activePlayerId !== null && m.isGrounded(m.activePlayerId)) {
        m.jump(m.activePlayerId, i % 120 === 0 ? 1 : 0);
      }
      m.step();
    }
    return m.stateHash();
  }
  assert.equal(laufen(), laufen(), 'das Match mit Sprüngen ist nicht reproduzierbar');
});
