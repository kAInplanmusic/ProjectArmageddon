/**
 * BAL-03: Alte Archetypenboni in den neuen Klassen (Fassung 3).
 *
 * Befund vor der Änderung: `spawnManager.js` schreibt in Fassung 3 überall
 * `Class.archetypeId = 0`. `schadenMali.js` las diese Zahl als
 * `ARCHETYPE_IDS[0]` („brawler") und wandte dessen Zusatzregeln an — Gift
 * (3 Züge) und Säure (2 Züge) verloren je einen Zug, obwohl es in Fassung 3
 * keine Archetypen gibt.
 *
 * Die Entscheidung: Fassung 3 erbt bewusst KEINE Archetyp- und keine
 * Klassenresistenzen. Gift bleibt 3 Züge, Säure 2 Züge, Magie und Schatten
 * wirken mit Faktor 1,0. Fassungen 1 und 2 behalten ihre Boni unverändert.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { MatchController } from '../src/engine/match.js';
import { KIT_FLAECHE } from '../src/shared/config/loadouts.js';
import { KISTEN_OFT } from '../src/shared/config/kisten.js';
import { KLASSEN_ALT, KLASSEN_SCOUT, KLASSEN_NEU } from '../src/shared/config/klassen-fassung.js';
import { CLASS_IDS } from '../src/shared/config/classes.js';
import { MALUS, dauerAbzug, resistenzFaktor } from '../src/shared/config/schaden.js';
import { DAMAGE_TYPE_IDS } from '../src/engine/damageTypes.js';

/**
 * Ein Match mit zwei Spielern derselben Klasse; der nicht aktive Spieler ist das Opfer.
 *
 * @param {number} klassen - Klassenfassung
 * @param {object} loadout - `{classId, archetypeId?}`
 */
function aufbau(klassen, loadout) {
  const match = new MatchController({
    seed: 20261109, teams: 2, playersPerTeam: 1, preset: 'open', turnDurationMs: 1_000_000,
    kit: KIT_FLAECHE, schaden: 2, kisten: KISTEN_OFT, waffen: 4, klassen,
    loadouts: [{ ...loadout }, { ...loadout }],
  });
  match.start();
  const schuetze = match.activePlayerId;
  const opfer = match.getState().entities.find(e => e.entityId !== schuetze).entityId;
  return { match, schuetze, opfer };
}

// ------------------------------------------------- Fassung 3: Gift und Säure

test('Fassung 3: Gift bleibt 3 Züge und Säure 2 Züge — für alle drei neuen Klassen', () => {
  for (const classId of CLASS_IDS) {
    const { match, schuetze, opfer } = aufbau(KLASSEN_NEU, { classId });
    // Der Motor speichert den Platzhalter 0; er darf nicht als „brawler" gelten.
    assert.equal(match.world.getComponent(opfer, 'Class', 'archetypeId'), 0, `${classId}: Platzhalter`);

    match.mali.wende(opfer, 'gift', { dmg: 10, by: schuetze });
    match.mali.wende(opfer, 'saeure', { by: schuetze });

    const mali = match.statuses.maliLesen(opfer);
    assert.equal(mali.gift[0].turns, MALUS.gift.dauer, `${classId}: Gift ${MALUS.gift.dauer} Züge`);
    assert.equal(mali.gift[0].turns, 3, `${classId}: Gift 3 Züge`);
    assert.equal(mali.saeure.turns, MALUS.saeure.dauer, `${classId}: Säure ${MALUS.saeure.dauer} Züge`);
    assert.equal(mali.saeure.turns, 2, `${classId}: Säure 2 Züge`);
  }
});

test('Fassung 3: Gift wird nicht auf zwei Züge gekürzt, auch wenn der Treffer ihn auffrischt', () => {
  const { match, schuetze, opfer } = aufbau(KLASSEN_NEU, { classId: 'nahkampf' });
  match.mali.wende(opfer, 'gift', { dmg: 10, by: schuetze });
  match.mali.wende(opfer, 'gift', { dmg: 10, by: schuetze });
  assert.deepEqual(match.statuses.maliLesen(opfer).gift.map(e => e.turns), [3, 3]);
});

// ------------------------------- Fassung 3: Magie- und Schattenwiderstand

test('Fassung 3: Magie und Schatten wirken mit Faktor 1,0 — kein Okkultist-Erbe', () => {
  for (const classId of CLASS_IDS) {
    // Der Archetyp-Name wird bewusst mitgegeben: Fassung 3 muss ihn ignorieren.
    for (const art of ['arcane', 'astral', 'psychic', 'dark', 'void']) {
      assert.equal(resistenzFaktor(classId, 'occultist', art, KLASSEN_NEU), 1,
        `${classId}/${art}: kein Archetyp-Faktor in Fassung 3`);
    }
  }
});

test('Fassung 3: gleicher Magie- und Schattenschaden für alle drei Klassen', () => {
  const werte = CLASS_IDS.map(classId => {
    const { match, opfer } = aufbau(KLASSEN_NEU, { classId });
    const magie = match.mali.schaden(opfer, 100, DAMAGE_TYPE_IDS.indexOf('arcane')).amount;
    const schatten = match.mali.schaden(opfer, 100, DAMAGE_TYPE_IDS.indexOf('dark')).amount;
    return { classId, magie: Math.round(magie), schatten: Math.round(schatten) };
  });
  const erwartet = { magie: werte[0].magie, schatten: werte[0].schatten };
  // Magie durchdringt die Hälfte der Rüstung; ohne Rüstung bleiben 100.
  assert.deepEqual(erwartet, { magie: 100, schatten: 100 });
  for (const eintrag of werte) assert.deepEqual({ magie: eintrag.magie, schatten: eintrag.schatten }, erwartet, eintrag.classId);
});

test('Fassung 3: dauerAbzug ignoriert jeden Archetyp-Namen, Resistenzfaktor ebenfalls', () => {
  assert.equal(dauerAbzug('brawler', 'gift', KLASSEN_NEU), 0);
  assert.equal(dauerAbzug('brawler', 'saeure', KLASSEN_NEU), 0);
  assert.equal(dauerAbzug('artillerist', 'brand', KLASSEN_NEU), 0);
  assert.equal(dauerAbzug('occultist', 'fluch', KLASSEN_NEU), 0);
  assert.equal(resistenzFaktor('nahkampf', 'brawler', 'poison', KLASSEN_NEU), 1);
  assert.equal(resistenzFaktor('fernkampf', 'brawler', 'acid', KLASSEN_NEU), 1);
});

// ------------------------------------ Altklassen 1/2 behalten ihre Boni

test('Fassung 1 und 2: Archetyp-Abzüge und Klassenfaktoren bleiben unverändert', () => {
  for (const fassung of [KLASSEN_ALT, KLASSEN_SCOUT]) {
    assert.equal(dauerAbzug('brawler', 'gift', fassung), 1, `Fassung ${fassung}: Brawler kürzt Gift`);
    assert.equal(dauerAbzug('brawler', 'saeure', fassung), 1, `Fassung ${fassung}: Brawler kürzt Säure`);
    assert.equal(dauerAbzug('artillerist', 'brand', fassung), 1, `Fassung ${fassung}: Artillerist kürzt Brand`);
    assert.equal(dauerAbzug('occultist', 'fluch', fassung), 1, `Fassung ${fassung}: Okkultist kürzt Fluch`);
    assert.equal(resistenzFaktor('scout', 'brawler', 'poison', fassung), 0.85, `Fassung ${fassung}: Scout/Gift`);
    assert.equal(resistenzFaktor('heavy', 'brawler', 'electric', fassung), 1.15, `Fassung ${fassung}: Heavy/Elektro`);
    assert.equal(resistenzFaktor('artillery', 'artillerist', 'fire', fassung), 0.9, `Fassung ${fassung}: Artillery/Feuer`);
    assert.equal(resistenzFaktor('scout', 'occultist', 'arcane', fassung), 0.9, `Fassung ${fassung}: Okkultist/Magie`);
    assert.equal(resistenzFaktor('scout', 'occultist', 'dark', fassung), 0.9, `Fassung ${fassung}: Okkultist/Schatten`);
  }
});

test('Fassung 1 und 2 im Match: Brawler verkürzt Gift auf 2 Züge wie bisher', () => {
  for (const fassung of [KLASSEN_ALT, KLASSEN_SCOUT]) {
    const { match, schuetze, opfer } = aufbau(fassung, { classId: 'scout', archetypeId: 'brawler' });
    match.mali.wende(opfer, 'gift', { dmg: 10, by: schuetze });
    assert.equal(match.statuses.maliLesen(opfer).gift[0].turns, 2, `Fassung ${fassung}: Brawler-Giftbonus bleibt`);
  }
});

test('Fassung 1 und 2 im Match: Scout nimmt 15 % weniger Giftschaden', () => {
  for (const fassung of [KLASSEN_ALT, KLASSEN_SCOUT]) {
    const { match, opfer } = aufbau(fassung, { classId: 'scout', archetypeId: 'brawler' });
    assert.equal(Math.round(match.mali.schaden(opfer, 100, 18).amount), 85, `Fassung ${fassung}: Giftfaktor 0,85`);
  }
});
