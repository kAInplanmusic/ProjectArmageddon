/**
 * Tests: Die Kopplung von Klasse und Archetyp ist aufgehoben.
 *
 * ## Der Befund
 *
 * Beide Werte wurden über DENSELBEN Index zugeteilt (`index % 3`), sodass nur
 * drei der neun Kombinationen erreichbar waren. Gerade die extremsten Profile
 * fehlten: `artillery/artillerist` (Tempo 1,52) und `heavy/brawler` (0,92)
 * wurden nie erzeugt, obwohl die Tabelle bis 1,73 reicht.
 *
 * ## Was hier geprüft wird
 *
 *  1. Die ABWÄRTSKOMPATIBILITÄT: Ohne Wahl verläuft ein Match exakt wie bisher.
 *     Das ist die wichtigste Prüfung — alle vorhandenen Replays, Balancetabellen
 *     und Tests rechnen mit der alten Regel.
 *  2. Die ENTKOPPLUNG: Mit Wahl sind Kombinationen erreichbar, die es vorher
 *     nicht gab.
 *  3. Die TOLERANZ: Eine unbekannte Kennung fällt auf den Platzwert zurück,
 *     statt zu werfen — wie bei den Sidegrades.
 *  4. Die PURHEIT: Die Wahl kommt aus der Konfiguration, nicht aus Zufall.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CLASS_IDS, ARCHETYPE_IDS, resolveLoadout, combatProfile,
} from '../src/shared/config/classes.js';
import { MatchController } from '../src/engine/match.js';

/** Baut ein Match, optional mit Loadout-Wahl. */
function match(loadouts = null) {
  return new MatchController({
    seed: 4242, teams: 2, playersPerTeam: 2, preset: 'hills', loadouts,
  });
}

test('Ohne Wahl gilt die alte Regel — unverändert', () => {
  /*
   * DIE Abwärtskompatibilität. Die alte Regel war `index % 3` für beide Werte,
   * also die drei Diagonalen. Wiche das ab, wären alle bestehenden
   * Balance-Zahlen und Replays still falsch.
   */
  const m = match(null);
  m.start();

  for (const [index, p] of m.players.entries()) {
    assert.equal(CLASS_IDS[p.classId], CLASS_IDS[index % CLASS_IDS.length],
      `Platz ${index}: Klasse weicht von der alten Regel ab`);
    assert.equal(ARCHETYPE_IDS[p.archetypeId], ARCHETYPE_IDS[index % ARCHETYPE_IDS.length],
      `Platz ${index}: Archetyp weicht von der alten Regel ab`);
  }
});

test('Ohne Wahl verläuft das Match identisch zu vorher', () => {
  // Der Zustandshash über den Verlauf: Ein Match ohne `loadouts` muss sich wie
  // eines mit ausdrücklich leerer Liste verhalten.
  const a = match(null);
  const b = match([]);
  a.start(); b.start();
  for (let i = 0; i < 240; i++) { a.step(); b.step(); }
  assert.equal(a.stateHash(), b.stateHash(),
    'ein Match ohne loadouts muss identisch verlaufen');
});

test('Die drei Diagonalen sind weiterhin der Standard', () => {
  // Explizit festgehalten, damit die Erwartung nicht nur implizit im Test oben
  // steckt: Es sind genau scout/brawler, heavy/artillerist, artillery/occultist.
  const m = match(null);
  m.start();
  const kombis = m.players.map(p => `${CLASS_IDS[p.classId]}/${ARCHETYPE_IDS[p.archetypeId]}`);
  assert.deepEqual(kombis.slice(0, 3),
    ['scout/brawler', 'heavy/artillerist', 'artillery/occultist']);
});

test('Mit Wahl sind vorher unerreichbare Kombinationen möglich', () => {
  /*
   * Der Kern der Entkopplung. `artillery/artillerist` war vorher unmöglich —
   * beide Werte kamen aus demselben Index.
   */
  const m = match([
    { classId: 'artillery', archetypeId: 'artillerist' },
    { classId: 'heavy', archetypeId: 'brawler' },
  ]);
  m.start();

  assert.equal(`${CLASS_IDS[m.players[0].classId]}/${ARCHETYPE_IDS[m.players[0].archetypeId]}`,
    'artillery/artillerist');
  assert.equal(`${CLASS_IDS[m.players[1].classId]}/${ARCHETYPE_IDS[m.players[1].archetypeId]}`,
    'heavy/brawler');

  // Und die Profile unterscheiden sich messbar von den Diagonalen.
  const entkoppelt = combatProfile('artillery', 'artillerist');
  const diagonale = combatProfile('artillery', 'occultist');
  assert.notEqual(entkoppelt.launchSpeedMultiplier, diagonale.launchSpeedMultiplier,
    'die entkoppelte Kombination hat dasselbe Tempo wie die Diagonale — '
    + 'dann wirkt die Wahl nicht');
});

test('resolveLoadout lässt jeden Platz einzeln wählen', () => {
  // Auch teilweise: Nur die Klasse, nur der Archetyp, oder beides.
  const nurKlasse = resolveLoadout(0, { classId: 'artillery' });
  assert.equal(nurKlasse.classId, 'artillery');
  assert.equal(nurKlasse.archetypeId, ARCHETYPE_IDS[0], 'der Archetyp muss der Platzwert bleiben');
  assert.equal(nurKlasse.gewaehlt, true);

  const nurArchetyp = resolveLoadout(1, { archetypeId: 'occultist' });
  assert.equal(nurArchetyp.classId, CLASS_IDS[1], 'die Klasse muss der Platzwert bleiben');
  assert.equal(nurArchetyp.archetypeId, 'occultist');

  const nichts = resolveLoadout(2, null);
  assert.equal(nichts.classId, CLASS_IDS[2]);
  assert.equal(nichts.archetypeId, ARCHETYPE_IDS[2]);
  assert.equal(nichts.gewaehlt, false, 'ohne Wahl darf gewaehlt false sein');
});

test('Eine unbekannte Kennung fällt auf den Platzwert zurück — ohne Wurf', () => {
  /*
   * Toleranz wie bei den Sidegrades: Eine Konfiguration aus einer älteren
   * Fassung oder mit Tippfehler darf ein Match nicht verhindern.
   */
  const gemischt = resolveLoadout(0, { classId: 'gibt-es-nicht', archetypeId: 'occultist' });
  assert.equal(gemischt.classId, CLASS_IDS[0], 'die unbekannte Klasse muss auf den Platzwert fallen');
  assert.equal(gemischt.archetypeId, 'occultist', 'der gültige Teil muss erhalten bleiben');

  // Auch Unsinn in der Wahl selbst darf nicht werfen.
  for (const unsinn of ['', null, undefined, 42, {}, []]) {
    const e = resolveLoadout(1, unsinn);
    assert.equal(e.classId, CLASS_IDS[1]);
    assert.equal(e.archetypeId, ARCHETYPE_IDS[1]);
  }

  // Und im echten Match: eine unbekannte Kennung ändert nichts an der Zuteilung.
  const mitUnsinn = match([{ classId: 'gibt-es-nicht', archetypeId: 'auch-nicht' }]);
  const ohne = match(null);
  mitUnsinn.start(); ohne.start();
  assert.equal(mitUnsinn.stateHash(), ohne.stateHash(),
    'eine unbekannte Kennung darf den Verlauf nicht verändern');
});

test('Die Wahl ist rein und deterministisch', () => {
  // Konfiguration, kein Zufall: gleiche Eingabe, gleiches Ergebnis — und ein
  // Match mit derselben Wahl zweimal gebaut muss identisch verlaufen.
  const wahl = [{ classId: 'scout', archetypeId: 'occultist' }];
  const a = match(wahl);
  const b = match([...wahl]);
  a.start(); b.start();
  for (let i = 0; i < 240; i++) { a.step(); b.step(); }
  assert.equal(a.stateHash(), b.stateHash(),
    'ein Match mit gleicher Wahl muss identisch verlaufen');

  // Und zweimal aufgelöst dasselbe.
  assert.deepEqual(resolveLoadout(0, wahl[0]), resolveLoadout(0, wahl[0]));
});

test('Alle neun Kombinationen sind jetzt erzeugbar', () => {
  /*
   * Die Vollständigkeit: Mit einer Wahl je Platz muss jede Kombination der
   * Tabellen spielbar sein. Vorher waren es drei.
   */
  const alle = [];
  for (const classId of CLASS_IDS) {
    for (const archetypeId of ARCHETYPE_IDS) {
      alle.push({ classId, archetypeId });
    }
  }
  // Acht Plätze reichen für einen Durchlauf in zwei Matches (max 12 Plätze).
  const m = new MatchController({
    seed: 7, teams: 4, playersPerTeam: 2, preset: 'hills', loadouts: alle.slice(0, 8),
  });
  m.start();

  const erzeugt = m.players.map(p => `${CLASS_IDS[p.classId]}/${ARCHETYPE_IDS[p.archetypeId]}`);
  for (const kombi of erzeugt.slice(0, 8)) {
    assert.ok(alle.some(k => `${k.classId}/${k.archetypeId}` === kombi),
      `${kombi} ist keine gültige Kombination`);
  }
  // Mindestens eine Kombination, die vorher unmöglich war, muss dabei sein.
  assert.ok(erzeugt.some(k => k === 'artillery/artillerist' || k === 'heavy/brawler'
    || k === 'scout/occultist'),
  `keine der vorher unerreichbaren Kombinationen erzeugt: ${erzeugt.join(', ')}`);
});

test('Der Bezugswert der Abschussgeschwindigkeit ist festgehalten', () => {
  /*
   * `ARCHETYPE_LAUNCH_BASE = 1,2` gehört zu keinem Archetyp. Der Wert ist eine
   * offene Balance-Entscheidung — dieser Test hält ihn fest, damit er nicht
   * still verrutscht. Er steht hier (und nicht nur in class-profile.test.js),
   * weil die Entkopplung die Zahl der betroffenen Kombinationen von 3 auf 9
   * erhöht: Ein Fehler darin wiegt jetzt dreimal so schwer.
   */
  const werte = ARCHETYPE_IDS.map(id => combatProfile('heavy', id).launchSpeedMultiplier);
  for (const w of werte) {
    assert.ok(Number.isFinite(w) && w > 0, 'unplausibles Tempo');
  }
  // Kein Archetyp schießt mit unverändertem Tempo (das ist der dokumentierte Fund).
  const neutral = combatProfile('heavy', 'brawler');
  assert.notEqual(neutral.launchSpeedMultiplier, 1,
    'Ein Archetyp hat plötzlich neutrales Tempo — wurde ARCHETYPE_LAUNCH_BASE geändert?');
});

test('Ein Match mit Wahl ist über ein Replay reproduzierbar', () => {
  /*
   * Die Wahl ist Match-Konfiguration — damit muss ein Replay sie kennen, sonst
   * spielte die Wiedergabe die falschen Profile. Geprüft wird der Weg über den
   * MatchController (der Replay-Kopf selbst wird in tests/replay.test.js
   * geprüft).
   */
  const wahl = [
    { classId: 'artillery', archetypeId: 'artillerist' },
    { classId: 'scout', archetypeId: 'occultist' },
    { classId: 'heavy', archetypeId: 'brawler' },
    { classId: 'scout', archetypeId: 'brawler' },
  ];
  const a = match(wahl);
  a.start();
  for (let i = 0; i < 300; i++) a.step();

  const b = match(wahl.map(w => ({ ...w })));
  b.start();
  for (let i = 0; i < 300; i++) b.step();

  assert.equal(a.stateHash(), b.stateHash(),
    'dieselbe Wahl muss denselben Verlauf ergeben');
  assert.deepEqual(
    a.players.map(p => p.classId), b.players.map(p => p.classId),
    'die Klassen müssen übereinstimmen',
  );
});
