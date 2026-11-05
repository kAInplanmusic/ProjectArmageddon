/**
 * Tests: Klassenwahl je Spielerplatz und die Fassungen.
 *
 * Seit Klassenfassung 3 (`docs/anforderungen-2026-11-05.md` §6) gibt es drei
 * Klassen ohne Archetypen. Diese Datei prüft:
 *
 *  1. den STANDARD: Fassung 3 vergibt `nahkampf`/`fernkampf`/`okkultist` über
 *     den Listenindex, ohne Archetyp,
 *  2. die ABWÄRTSKOMPATIBILITÄT: Fassungen 1 und 2 behalten Klasse × Archetyp
 *     und die alte Zuteilung (Altreplays),
 *  3. die TOLERANZ: Eine unbekannte Kennung fällt auf den Platzwert zurück,
 *     statt zu werfen — wie bei den Sidegrades,
 *  4. die PURHEIT: Die Wahl kommt aus der Konfiguration, nicht aus Zufall.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CLASS_IDS, LEGACY_CLASS_IDS, ARCHETYPE_IDS, resolveLoadout,
} from '../src/shared/config/classes.js';
import { KLASSEN_ALT, KLASSEN_SCOUT, KLASSEN_STANDARD } from '../src/shared/config/klassen-fassung.js';
import { MatchController } from '../src/engine/match.js';

/** Baut ein Match, optional mit Loadout-Wahl und Klassenfassung. */
function match(loadouts = null, klassen = KLASSEN_STANDARD) {
  return new MatchController({
    seed: 4242, teams: 2, playersPerTeam: 2, preset: 'hills', loadouts, klassen,
  });
}

test('Fassung 3: Ohne Wahl greift die Klassenreihenfolge — kein Archetyp', () => {
  const m = match(null);
  m.start();

  for (const [index, p] of m.players.entries()) {
    assert.equal(CLASS_IDS[p.classId], CLASS_IDS[index % CLASS_IDS.length],
      `Platz ${index}: Klasse weicht von der Reihenfolge ab`);
    assert.equal(p.archetypeId, 0, `Platz ${index}: Fassung 3 führt keinen Archetyp`);
  }
});

test('Fassung 3: Ohne Wahl verläuft das Match identisch zu leerer Liste', () => {
  const a = match(null);
  const b = match([]);
  a.start(); b.start();
  for (let i = 0; i < 240; i++) { a.step(); b.step(); }
  assert.equal(a.stateHash(), b.stateHash(),
    'ein Match ohne loadouts muss identisch verlaufen');
});

test('Fassung 1/2: Die alte Regel (index % 3 für Klasse und Archetyp) bleibt', () => {
  /*
   * DIE Abwärtskompatibilität: ein Replay aus der Zeit vor dem Umbau spielt
   * dieselben Kombinationen — scout/brawler, heavy/artillerist,
   * artillery/occultist.
   */
  for (const fassung of [KLASSEN_ALT, KLASSEN_SCOUT]) {
    const m = match(null, fassung);
    m.start();
    const kombis = m.players.map(p => `${LEGACY_CLASS_IDS[p.classId]}/${ARCHETYPE_IDS[p.archetypeId]}`);
    assert.deepEqual(kombis.slice(0, 3),
      ['scout/brawler', 'heavy/artillerist', 'artillery/occultist']);
  }
});

test('Fassung 3: Mit Wahl ist jede Klasse erzeugbar', () => {
  const m = new MatchController({
    seed: 7, teams: 4, playersPerTeam: 2, preset: 'hills',
    klassen: KLASSEN_STANDARD,
    loadouts: CLASS_IDS.map(classId => ({ classId })),
  });
  m.start();
  const erzeugt = m.players.slice(0, 3).map(p => CLASS_IDS[p.classId]);
  assert.deepEqual(erzeugt, ['nahkampf', 'fernkampf', 'okkultist']);
  assert.ok(m.players.every(p => p.archetypeId === 0), 'keine Archetypen in Fassung 3');
});

test('resolveLoadout: Fassung 3 wählt die Klasse, der Archetyp bleibt null', () => {
  const nurKlasse = resolveLoadout(0, { classId: 'okkultist' });
  assert.equal(nurKlasse.classId, 'okkultist');
  assert.equal(nurKlasse.archetypeId, null);
  assert.equal(nurKlasse.gewaehlt, true);

  const nichts = resolveLoadout(2, null);
  assert.equal(nichts.classId, CLASS_IDS[2]);
  assert.equal(nichts.archetypeId, null);
  assert.equal(nichts.gewaehlt, false, 'ohne Wahl darf gewaehlt false sein');

  // Ein alter Archetyp in der Wahl wird ignoriert, nicht übernommen.
  const mitArchetyp = resolveLoadout(1, { archetypeId: 'occultist' });
  assert.equal(mitArchetyp.classId, CLASS_IDS[1]);
  assert.equal(mitArchetyp.archetypeId, null);
});

test('resolveLoadout: Fassungen ≤ 2 lösen weiterhin Klasse und Archetyp auf', () => {
  const nurKlasse = resolveLoadout(0, { classId: 'artillery' }, KLASSEN_ALT);
  assert.equal(nurKlasse.classId, 'artillery');
  assert.equal(nurKlasse.archetypeId, ARCHETYPE_IDS[0], 'der Archetyp muss der Platzwert bleiben');
  assert.equal(nurKlasse.gewaehlt, true);

  const nurArchetyp = resolveLoadout(1, { archetypeId: 'occultist' }, KLASSEN_SCOUT);
  assert.equal(nurArchetyp.classId, LEGACY_CLASS_IDS[1], 'die Klasse muss der Platzwert bleiben');
  assert.equal(nurArchetyp.archetypeId, 'occultist');

  const nichts = resolveLoadout(2, null, KLASSEN_ALT);
  assert.equal(nichts.classId, LEGACY_CLASS_IDS[2]);
  assert.equal(nichts.archetypeId, ARCHETYPE_IDS[2]);
});

test('Eine unbekannte Kennung fällt auf den Platzwert zurück — ohne Wurf', () => {
  /*
   * Toleranz wie bei den Sidegrades: Eine Konfiguration aus einer älteren
   * Fassung oder mit Tippfehler darf ein Match nicht verhindern.
   */
  const gemischt = resolveLoadout(0, { classId: 'gibt-es-nicht' });
  assert.equal(gemischt.classId, CLASS_IDS[0], 'die unbekannte Klasse muss auf den Platzwert fallen');

  // Auch Unsinn in der Wahl selbst darf nicht werfen.
  for (const unsinn of ['', null, undefined, 42, {}, []]) {
    const e = resolveLoadout(1, unsinn);
    assert.equal(e.classId, CLASS_IDS[1]);
    assert.equal(e.archetypeId, null);
  }

  // Und im echten Match: eine unbekannte Kennung ändert nichts an der Zuteilung.
  const mitUnsinn = match([{ classId: 'gibt-es-nicht', archetypeId: 'auch-nicht' }]);
  const ohne = match(null);
  mitUnsinn.start(); ohne.start();
  assert.equal(mitUnsinn.stateHash(), ohne.stateHash(),
    'eine unbekannte Kennung darf den Verlauf nicht verändern');
});

test('Die Wahl ist rein und deterministisch', () => {
  const wahl = [{ classId: 'okkultist' }];
  const a = match(wahl);
  const b = match([...wahl]);
  a.start(); b.start();
  for (let i = 0; i < 240; i++) { a.step(); b.step(); }
  assert.equal(a.stateHash(), b.stateHash(),
    'ein Match mit gleicher Wahl muss identisch verlaufen');

  assert.deepEqual(resolveLoadout(0, wahl[0]), resolveLoadout(0, wahl[0]));
});

test('Fassung 2: Ein Match mit Archetyp-Wahl bleibt reproduzierbar', () => {
  const wahl = [
    { classId: 'artillery', archetypeId: 'artillerist' },
    { classId: 'scout', archetypeId: 'occultist' },
    { classId: 'heavy', archetypeId: 'brawler' },
    { classId: 'scout', archetypeId: 'brawler' },
  ];
  const a = match(wahl, KLASSEN_SCOUT);
  a.start();
  for (let i = 0; i < 300; i++) a.step();

  const b = match(wahl.map(w => ({ ...w })), KLASSEN_SCOUT);
  b.start();
  for (let i = 0; i < 300; i++) b.step();

  assert.equal(a.stateHash(), b.stateHash(),
    'dieselbe Wahl muss denselben Verlauf ergeben');
  assert.deepEqual(a.players.map(p => p.classId), b.players.map(p => p.classId));
});

test('Ein Match mit Klassenwahl ist über ein Replay reproduzierbar', () => {
  const wahl = [{ classId: 'nahkampf' }, { classId: 'okkultist' }, { classId: 'fernkampf' }, { classId: 'nahkampf' }];
  const a = match(wahl);
  a.start();
  for (let i = 0; i < 300; i++) a.step();

  const b = match(wahl.map(w => ({ ...w })));
  b.start();
  for (let i = 0; i < 300; i++) b.step();

  assert.equal(a.stateHash(), b.stateHash(), 'dieselbe Wahl muss denselben Verlauf ergeben');
});
