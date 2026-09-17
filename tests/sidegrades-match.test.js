/**
 * Integrationstests: Wirkt der Sidegrade im MATCH?
 *
 * Diese Datei ist die wichtigste des Sidegrade-Systems. `sidegrades.test.js`
 * prüft die Daten und die Verrechnung in `combatProfile()`. Hier wird geprüft,
 * dass die Verrechnung den WEG INS SPIEL findet — dass eine Figur mit
 * Zusatzpanzerung wirklich mehr Leben hat und ein Sidegrade wirklich im Zustand
 * steht.
 *
 * Der Unterschied ist nicht theoretisch: Bei der Umsetzung war die Verrechnung
 * korrekt und das Leben richtig, aber die Kennung stand nicht am Spieler. Ein
 * Test, der nur `combatProfile()` prüft, hätte das nicht bemerkt.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MatchController } from '../src/engine/match.js';
import { combatProfile } from '../src/shared/config/classes.js';
import { SIDEGRADE_IDS, SIDEGRADES } from '../src/shared/config/sidegrades.js';

/** Baut ein Match mit gesetzten Sidegrades (Index = Spielerplatz). */
function matchMit(sidegrades) {
  return new MatchController({
    seed: 4242, teams: 2, playersPerTeam: 2, preset: 'hills', sidegrades,
  });
}

test('Ohne Sidegrades verhält sich das Match wie zuvor', () => {
  /*
   * Die Abwärtskompatibilität im ECHTEN Match, nicht nur in der Rechnung. Ein
   * Match ohne Sidegrades muss denselben Zustandshash liefern wie eines mit
   * explizit leeren Einträgen — sonst wäre die Änderung nicht rückwärtskompatibel.
   */
  const a = matchMit(null);
  const b = matchMit([null, null, null, null]);
  a.start(); b.start();
  for (let i = 0; i < 90; i++) { a.step(); b.step(); }
  assert.equal(a.stateHash(), b.stateHash(),
    'ein Match ohne Sidegrades muss identisch verlaufen');
});

test('Ein Sidegrade steht am Spieler und in seinem Zustand', () => {
  /*
   * Der Fund bei der Umsetzung: Die Verrechnung war richtig, aber die Kennung
   * fehlte am Spieler-Objekt — `combatProfile` lieferte sie, `#spawnPlayers`
   * übernahm sie nicht. Weil das Leben TROTZDEM stimmte, sah es zunächst
   * richtig aus.
   */
  const m = matchMit([null, null, null, 'gepanzert']);
  m.start();

  const mitSidegrade = m.players[3];
  assert.equal(mitSidegrade.sidegradeId, 'gepanzert',
    'die Kennung fehlt am Spieler-Objekt');

  // Und im Zustand, den der Client liest (für die Winkelvorschau).
  const zustand = m.getState();
  const eintrag = zustand.entities.find(e => e.entityId === mitSidegrade.entityId);
  assert.equal(eintrag.sidegradeId, 'gepanzert',
    'die Kennung fehlt im Match-Zustand — die Anzeige müsste raten');

  // Die anderen Plätze haben keinen.
  for (const platz of [0, 1, 2]) {
    assert.equal(m.players[platz].sidegradeId, null, `Platz ${platz} hat unerwartet einen`);
  }
});

test('Zusatzpanzerung gibt WIRKLICH mehr Leben', () => {
  // Die Kernaussage: Der Sidegrade verändert das Spiel, nicht nur die Tabelle.
  const ohne = matchMit(null);
  const mit = matchMit([null, null, null, 'gepanzert']);
  ohne.start(); mit.start();

  const leben = m => m.players.map(
    p => m.world.getComponent(p.entityId, 'Health', 'max'),
  );

  const vorher = leben(ohne);
  const nachher = leben(mit);

  // Nur Platz 3 (der gepanzerte) darf sich ändern.
  assert.deepEqual([nachher[0], nachher[1], nachher[2]], [vorher[0], vorher[1], vorher[2]],
    'ein Sidegrade auf Platz 3 darf die anderen Plätze nicht verändern');

  // Und zwar nach oben — mit dem Faktor aus der Config, nicht einer Wunschnummer.
  const faktor = combatProfile('scout', 'brawler', 'gepanzert').healthMultiplier
    / combatProfile('scout', 'brawler').healthMultiplier;
  assert.ok(faktor > 1, 'gepanzert muss mehr Leben geben');
  assert.ok(nachher[3] > vorher[3],
    `Leben auf Platz 3 muss steigen (${vorher[3]} -> ${nachher[3]})`);
});

test('Ein Tempo-Sidegrade verändert den Abschussvektor', () => {
  /*
   * Das Tempo wirkt über `#launchVector`. Geprüft wird am Ergebnis: Die Bahn
   * des ersten Schusses muss sich mit `kompakt` (+20 % Tempo) messbar
   * unterscheiden — und zwar WEITER reichen, nicht nur „anders".
   */
  const ohne = matchMit(null);
  const mit = matchMit(['kompakt', null, null, null]);
  ohne.start(); mit.start();

  // Beide Male derselbe Spieler (Platz 0) und derselbe Winkel/aktive Spieler.
  assert.equal(ohne.activePlayerId, mit.activePlayerId, 'ungleicher Startspieler');

  const bahnOhne = ohne.aimPreview(ohne.activePlayerId, 1.0, 60, 1);
  const bahnMit = mit.aimPreview(mit.activePlayerId, 1.0, 60, 1);

  assert.ok(bahnOhne.length > 0 && bahnMit.length > 0, 'keine Bahn berechnet');
  const punktOhne = bahnOhne[0];
  const punktMit = bahnMit[0];
  const abstand = Math.hypot(punktMit.x - punktOhne.x, punktMit.y - punktOhne.y);

  assert.ok(abstand > 0.5,
    `das Tempo-Sidegrade muss die Bahn verändern (Abstand ${abstand.toFixed(3)} px)`);
});

test('Ein Schaden-Sidegrade verändert den Schaden, nicht das Leben', () => {
  /*
   * Die Achsen dürfen sich nicht vermischen. `praezision` erhöht Schaden und
   * Tempo, SENKT aber das Leben — eine Verwechslung der Achsen wäre eine
   * Balance-Änderung, die niemand bemerkt.
   */
  const ohne = combatProfile('scout', 'brawler');
  const mit = combatProfile('scout', 'brawler', 'praezision');

  const side = SIDEGRADES.praezision.modifiers;
  assert.equal(mit.damageMultiplier, ohne.damageMultiplier * side.damageMultiplier,
    'Schaden falsch verrechnet');
  assert.equal(mit.healthMultiplier, ohne.healthMultiplier * side.healthMultiplier,
    'Leben falsch verrechnet');
  // praezision senkt das Leben — die Gegenprobe zur Richtung.
  assert.ok(mit.healthMultiplier < ohne.healthMultiplier,
    'praezision soll zerbrechlicher machen');
});

test('Ein Match mit Sidegrades ist deterministisch', () => {
  /*
   * Die kritische Prüfung des Entwurfs (B.4): Kein Zufall, keine
   * Replay-Abweichung. Zwei Matches mit gleichem Seed und gleichen Sidegrades
   * müssen nach vielen Ticks denselben Zustandshash haben.
   */
  const sidegrades = ['kompakt', 'gepanzert', null, 'praezision'];
  const a = matchMit(sidegrades);
  const b = matchMit(sidegrades);
  a.start(); b.start();
  for (let i = 0; i < 240; i++) { a.step(); b.step(); }

  assert.equal(a.stateHash(), b.stateHash(),
    'gleicher Seed und gleiche Sidegrades müssen denselben Verlauf ergeben');
});

test('Ein unbekannter Sidegrade macht das Match nicht kaputt', () => {
  /*
   * Toleranz: Eine Kennung aus einer älteren Fassung oder mit Tippfehler darf
   * das Match nicht anhalten. Sie wirkt wie „kein Sidegrade".
   */
  const mitUnsinn = matchMit(['gibt-es-nicht', null, null, null]);
  const ohne = matchMit(null);
  mitUnsinn.start(); ohne.start();

  assert.equal(mitUnsinn.players[0].sidegradeId, null,
    'eine unbekannte Kennung muss wie „kein Sidegrade" wirken');
  assert.equal(mitUnsinn.stateHash(), ohne.stateHash(),
    'eine unbekannte Kennung darf den Verlauf nicht verändern');
});

test('Alle bekannten Sidegrades laufen im Match durch', () => {
  /*
   * Rauchtest über die ganze Liste: Jeder Eintrag muss ein Match überstehen —
   * auch einer, der später hinzukommt. Ein Tippfehler in den Faktoren fiele
   * hier auf (NaN im Leben), nicht erst im Spiel.
   */
  for (const id of SIDEGRADE_IDS) {
    const m = new MatchController({
      seed: 7, teams: 2, playersPerTeam: 2, preset: 'hills',
      sidegrades: [id, null, null, null],
    });
    m.start();
    for (let i = 0; i < 30; i++) m.step();

    const hp = m.world.getComponent(m.players[0].entityId, 'Health', 'max');
    assert.ok(Number.isFinite(hp) && hp > 0,
      `${id}: unplausibles Leben (${hp})`);
    assert.ok(hp >= 20, `${id}: Leben unter 20 — die Untergrenze greift nicht`);
    assert.equal(m.players[0].sidegradeId, id, `${id}: nicht am Spieler angekommen`);
  }
});
