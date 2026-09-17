/**
 * Tests: Wirkt die Beweglichkeit der Klasse im MATCH?
 *
 * Diese Datei ist der eigentliche Beweis für die Behebung des Befunds „Der
 * Scout hat keine wirksame Stärke". `counterplay.test.js` prüft die Ableitung,
 * `class-profile.test.js` die Verrechnung — hier wird geprüft, dass die
 * Bewegung wirklich anders ausfällt.
 *
 * Gemessen wird die SPRUNGHÖHE, nicht ein Zwischenwert: Eine Figur, die höher
 * springt, kommt auf Stellungen, die anderen verschlossen bleiben. Das ist die
 * Stärke, um die es geht.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MatchController } from '../src/engine/match.js';
import { CLASS_IDS, combatProfile } from '../src/shared/config/classes.js';

/**
 * Misst die Sprunghöhe einer Klasse.
 *
 * Die Figur muss dafür am ZUG sein — nur der aktive Spieler kann springen — und
 * vorher landen. Deshalb wird das Match laufen gelassen, bis die gesuchte
 * Klasse dran ist.
 */
function sprungHoehe(klasseName) {
  const m = new MatchController({ seed: 4242, teams: 2, playersPerTeam: 3, preset: 'hills' });
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

test('Der Scout springt höher als Heavy und Artillery', () => {
  /*
   * DIE Kernaussage der Behebung. Vorher sprang jede Klasse gleich hoch — der
   * `speed`-Wert existierte nur auf dem Papier.
   */
  const scout = sprungHoehe('scout');
  const heavy = sprungHoehe('heavy');
  const artillery = sprungHoehe('artillery');

  assert.ok(scout && heavy && artillery, 'nicht alle Klassen gemessen');
  assert.ok(scout.hoehe > heavy.hoehe,
    `Der Scout muss höher springen als der Heavy (${scout.hoehe.toFixed(1)} px `
    + `gegen ${heavy.hoehe.toFixed(1)} px)`);
  assert.ok(scout.hoehe > artillery.hoehe,
    `Der Scout muss höher springen als die Artillery (${scout.hoehe.toFixed(1)} px `
    + `gegen ${artillery.hoehe.toFixed(1)} px)`);
});

test('Der Sprungunterschied ist spürbar, aber nicht kartensprengend', () => {
  /*
   * Die Dämpfung (JUMP_SPEED_INFLUENCE_ABOVE) soll zweierlei leisten:
   *
   *  - spürbar: Die Stärke muss sich lohnen. Ohne eine Untergrenze wäre die
   *    Verdrahtung bloß Formsache.
   *  - nicht kartensprengend: Der Scout darf nicht über das Gelände hinweg
   *    kommen. Gemessen wird gegen die hills-Amplitude (rund 151 px
   *    Höhenunterschied) — bleibt der Sprung darunter, ist die Karte intakt.
   *
   * Die Schwellen sind bewusst mit Abstand gesetzt und nicht auf die gemessenen
   * Werte gepinnt: Eine kleine Balance-Korrektur soll diesen Test nicht rot
   * machen, eine Verdreifachung der Sprunghöhe schon.
   */
  const scout = sprungHoehe('scout');
  const heavy = sprungHoehe('heavy');

  const aufschlag = (scout.hoehe / heavy.hoehe - 1) * 100;
  assert.ok(aufschlag >= 10,
    `Der Aufschlag von ${aufschlag.toFixed(1)} % ist zu klein — die Stärke wäre `
    + 'nicht spürbar');
  assert.ok(aufschlag <= 80,
    `Der Aufschlag von ${aufschlag.toFixed(1)} % ist zu groß — der Scout käme über `
    + 'das Gelände hinweg');

  // Und die absolute Grenze: unter der hills-Amplitude.
  assert.ok(scout.hoehe < 151,
    `Der Scout springt ${scout.hoehe.toFixed(1)} px — über den Höhenunterschied von `
    + 'hills (rund 151 px). Die Karte verlöre ihre Form.');
});

test('Die Sprunghöhe folgt der Beweglichkeit im Kampfprofil', () => {
  /*
   * Die Verbindung zwischen Config und Motor: Die Reihenfolge der Sprunghöhen
   * muss der Reihenfolge der `mobilityMultiplier` entsprechen. Damit ist
   * belegt, dass der Motor den Wert aus dem Profil liest — und nicht einen
   * eigenen, zweiten Wert.
   */
  const werte = CLASS_IDS.map(k => ({
    klasse: k,
    beweglichkeit: combatProfile(k, 'brawler').mobilityMultiplier,
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
  /*
   * Voraussetzung für reproduzierbare Replays: Die Sprunghöhe darf allein von
   * der Klasse abhängen, nicht von Zufall oder Zustand. Zweimal gemessen muss
   * sie gleich sein.
   */
  const a = sprungHoehe('scout');
  const b = sprungHoehe('scout');
  assert.equal(a.hoehe, b.hoehe,
    'Die Sprunghöhe ist nicht reproduzierbar — der Motor rechnet nicht pur');
});

test('Ein Match mit dem Sprungverhalten ist reproduzierbar', () => {
  /*
   * Der Zustandshash über den ganzen Verlauf: Die Verdrahtung darf die
   * Reproduzierbarkeit nicht brechen. Zwei identische Matches mit Sprüngen
   * müssen denselben Hash haben.
   */
  function laufen() {
    const m = new MatchController({ seed: 777, teams: 2, playersPerTeam: 2, preset: 'hills' });
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
