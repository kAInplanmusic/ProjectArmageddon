import assert from 'node:assert/strict';
import test from 'node:test';

import { MatchController } from '../src/engine/match.js';
import { MatchStats, PlayerProfile, lieblingswaffe, beschreibe } from '../src/shared/stats.js';

/**
 * Spielerkennzahlen.
 *
 * Die Kennzahlen kommen aus den Ereignissen des Matches, nicht aus einer zweiten
 * Buchführung. Hier wird deshalb beides geprüft: dass die Auswertung stimmt, und
 * dass die Ereignisse tatsächlich alles liefern, was sie liefern sollen.
 *
 * Anlass war ein fehlendes Ereignis: Für Projektile gab es `projectile_spawn`,
 * für Treffer `hitscan`/`projectile_impact` — aber nichts für einen Schuss, der
 * weder trifft noch ein Projektil erzeugt. Die Trefferquote (Treffer / Schüsse)
 * ließ sich damit nicht rechnen. Das Ereignis `shot` wurde ergänzt; ein Test
 * hier hält fest, dass JEDER abgegebene Schuss gemeldet wird.
 */

/** Ein Match mit aufgezeichneten Ereignissen. */
function matchMitEreignissen({ seed = 4242, teams = 2, playersPerTeam = 2, runden = 4, schussJedeRunde = true } = {}) {
  const match = new MatchController({ seed, teams, playersPerTeam, turnDurationMs: 400, maxRounds: runden });
  match.start();

  const teamsVon = new Map(match.getState().entities.map(e => [e.entityId, e.teamId]));
  const stats = new MatchStats({ teams: teamsVon });

  let schutz = 0;
  while (match.status === 'playing' && schutz < 20_000) {
    const zustand = match.getState();
    if (schussJedeRunde && zustand.activePlayerId !== null && zustand.turnElapsedMs < 20) {
      match.fire(zustand.activePlayerId, Math.PI / 4 + (schutz % 5) * 0.03, 62 + (schutz % 4) * 7);
    }
    match.step();
    stats.feedAll(match.consumeEvents());
    stats.tick = match.world.tickCount;
    schutz += 1;
  }
  stats.feedAll(match.consumeEvents());
  stats.tick = match.world.tickCount;

  return { match, stats, teamsVon };
}

test('Jeder Schuss erzeugt ein Ereignis — auch ohne Treffer', () => {
  /*
   * Der Grund für das Ereignis `shot`: Ein Schuss, der ins Gelände geht, erzeugt
   * kein `hitscan` und keinen Treffer. Ohne ein eigenes Ereignis wäre er
   * unsichtbar, und die Trefferquote hätte keinen Nenner.
   *
   * Geprüft wird gegen die Rückgabe von `fire()`: Jeder Aufruf, der `ok` meldet,
   * muss genau ein `shot`-Ereignis ergeben.
   */
  const match = new MatchController({ seed: 777, teams: 2, playersPerTeam: 2, turnDurationMs: 300, maxRounds: 3 });
  match.start();

  let gemeldeteSchuesse = 0;
  let erfolgreicheSchuesse = 0;
  let schutz = 0;
  while (match.status === 'playing' && schutz < 12000) {
    const zustand = match.getState();
    if (zustand.activePlayerId !== null && zustand.turnElapsedMs < 20) {
      // Absichtlich ins Gelände zielen: Diese Schüsse treffen nichts.
      const ergebnis = match.fire(zustand.activePlayerId, Math.PI * 0.05, 30);
      if (ergebnis.ok) erfolgreicheSchuesse += 1;
    }
    match.step();
    for (const e of match.consumeEvents()) if (e.type === 'shot') gemeldeteSchuesse += 1;
    schutz += 1;
  }

  assert.ok(erfolgreicheSchuesse > 0, 'Der Testaufbau muss Schüsse erzeugen');
  assert.equal(gemeldeteSchuesse, erfolgreicheSchuesse,
    `${erfolgreicheSchuesse} erfolgreiche Schüsse, aber ${gemeldeteSchuesse} gemeldete`);
});

test('Das Ereignis „shot" trägt Spieler, Waffe, Winkel und Kraft', () => {
  const match = new MatchController({ seed: 4242, teams: 2, playersPerTeam: 1, turnDurationMs: 400, maxRounds: 2 });
  match.start();
  const spieler = match.activePlayerId;
  match.fire(spieler, 1.1, 73);

  const ereignis = match.consumeEvents().find(e => e.type === 'shot');
  assert.ok(ereignis, 'Kein shot-Ereignis');
  assert.equal(ereignis.payload.playerId, spieler);
  assert.equal(typeof ereignis.payload.weaponId, 'string');
  assert.ok(Math.abs(ereignis.payload.angle - 1.1) < 1e-9);
  assert.equal(ereignis.payload.power, 73);
});

test('Schüsse, Treffer und Schaden werden je Spieler gezählt', () => {
  const { stats, teamsVon } = matchMitEreignissen();

  const figuren = stats.alle();
  assert.ok(figuren.length >= 2, `Nur ${figuren.length} Spieler erfasst`);

  for (const figur of figuren) {
    assert.equal(figur.teamId, teamsVon.get(figur.playerId));
    assert.ok(figur.schuesse > 0, `Spieler ${figur.playerId} hat keine Schüsse`);
    // Treffer können nicht mehr sein als Schüsse — die Zuordnung darf nicht
    // mehrfach zählen.
    assert.ok(figur.treffer <= figur.schuesse,
      `Spieler ${figur.playerId}: ${figur.treffer} Treffer bei ${figur.schuesse} Schüssen`);
    assert.ok(figur.schaden >= 0);
    if (figur.trefferquote !== null) {
      assert.ok(figur.trefferquote >= 0 && figur.trefferquote <= 1);
    }
    assert.ok(figur.zuege > 0, `Spieler ${figur.playerId} war nie am Zug`);
  }

  // Die Summe der Einzelschäden muss dem Gesamtschaden entsprechen.
  const summe = figuren.reduce((a, f) => a + f.schaden, 0);
  assert.equal(stats.zusammenfassung().schadenGesamt, summe);
});

test('Schaden an Verbündeten und ohne Angreifer zählt nicht', () => {
  /*
   * Drei Fälle, die die Zählung verfälschen würden:
   *  - Schaden am eigenen Team (Flächenwaffe),
   *  - Schaden ohne Angreifer (Sturz, Ertrinken, Günther),
   *  - Schaden an sich selbst.
   */
  const teams = new Map([[1, 0], [2, 0], [3, 1]]);
  const stats = new MatchStats({ teams });

  stats.feed({ type: 'shot', payload: { playerId: 1, weaponId: 'pa_001' } });
  // Eigener Teamkamerad: zählt nicht.
  stats.feed({ type: 'damage', payload: { entityId: 2, attackerId: 1, amount: 50 } });
  // Ohne Angreifer: zählt nicht.
  stats.feed({ type: 'damage', payload: { entityId: 3, attackerId: null, amount: 30 } });
  // An sich selbst: zählt nicht.
  stats.feed({ type: 'damage', payload: { entityId: 1, attackerId: 1, amount: 20 } });
  // Gegner: zählt.
  stats.feed({ type: 'damage', payload: { entityId: 3, attackerId: 1, amount: 40 } });

  const figur = stats.fuer(1);
  assert.equal(figur.schaden, 40, 'Es wurde fremder Schaden mitgezählt');
  assert.equal(figur.treffer, 1);
});

test('Ein Treffer wird nur einmal je Schuss gezählt', () => {
  /*
   * Eine Flächenwaffe kann mehrere Gegner treffen. Gezählt wird EIN Treffer —
   * der Schuss hat getroffen, nicht drei. Sonst wäre die Trefferquote > 100 %.
   */
  const teams = new Map([[1, 0], [2, 1], [3, 1], [4, 1]]);
  const stats = new MatchStats({ teams });

  stats.feed({ type: 'shot', payload: { playerId: 1, weaponId: 'pa_063' } });
  for (const ziel of [2, 3, 4]) {
    stats.feed({ type: 'damage', payload: { entityId: ziel, attackerId: 1, amount: 20 } });
  }

  const figur = stats.fuer(1);
  assert.equal(figur.schuesse, 1);
  assert.equal(figur.treffer, 1, `${figur.treffer} Treffer für einen Schuss`);
  assert.equal(figur.schaden, 60);
  assert.equal(figur.trefferquote, 1);
});

test('Ein späterer Schaden wird nicht einem alten Schuss zugerechnet', () => {
  /*
   * Ein Projektil fliegt über viele Takte. Ohne Zeitfenster würde Schaden, der
   * zwanzig Züge später ankommt, den längst vergessenen Schuss zum „Treffer"
   * machen — die Quote wäre zu hoch.
   */
  const teams = new Map([[1, 0], [2, 1]]);
  const stats = new MatchStats({ teams });

  stats.feed({ type: 'shot', payload: { playerId: 1, weaponId: 'pa_001' } });
  stats.tick = 100_000; // weit außerhalb des Fensters
  stats.feed({ type: 'damage', payload: { entityId: 2, attackerId: 1, amount: 30 } });

  const figur = stats.fuer(1);
  assert.equal(figur.schaden, 30, 'Schaden muss trotzdem zählen');
  assert.equal(figur.treffer, 0, 'Der alte Schuss wurde als Treffer gewertet');
});

test('Die Spielzeit kommt aus den Takten des Matches, nicht aus einer Uhr', () => {
  /*
   * Sonst hinge die Statistik davon ab, wie schnell der Rechner war. 60 Takte
   * sind eine Sekunde, unabhängig davon, wie lange gerechnet wurde.
   */
  const { stats } = matchMitEreignissen();
  const zusammenfassung = stats.zusammenfassung();

  assert.ok(zusammenfassung.ticks > 0);
  assert.ok(Math.abs(zusammenfassung.dauerSekunden - zusammenfassung.ticks / 60) < 1e-9);
  assert.ok(zusammenfassung.schadenProMinute >= 0);
});

test('Sieg und Niederlage werden aus dem Match-Ende abgeleitet', () => {
  const { stats, teamsVon } = matchMitEreignissen();
  const zusammenfassung = stats.zusammenfassung();
  assert.equal(zusammenfassung.entschieden, true, 'Das Match muss entschieden sein');
  assert.ok(zusammenfassung.gewinnerTeamId !== null);

  let sieger = 0;
  let verlierer = 0;
  for (const figur of stats.alle()) {
    const sieg = stats.fuer(figur.playerId).sieg;
    assert.equal(typeof sieg, 'boolean', 'Sieg muss bestimmt sein');
    if (sieg) { sieger += 1; assert.equal(teamsVon.get(figur.playerId), zusammenfassung.gewinnerTeamId); }
    else verlierer += 1;
  }
  assert.ok(sieger > 0, 'Kein Sieger erfasst');
  assert.ok(verlierer > 0, 'Kein Verlierer erfasst');
});

test('Vor dem Match-Ende ist der Sieg unbestimmt', () => {
  // Wichtig für die Anzeige: Ein laufendes Match darf nicht als Niederlage gelten.
  const teams = new Map([[1, 0], [2, 1]]);
  const stats = new MatchStats({ teams });
  stats.feed({ type: 'shot', payload: { playerId: 1, weaponId: 'pa_001' } });
  assert.equal(stats.fuer(1).sieg, null, 'Ein laufendes Match meldet einen Sieg');
  assert.equal(stats.zusammenfassung().entschieden, false);
});

test('Das Profil summiert Partien und pflegt die Serie', () => {
  const profil = new PlayerProfile({ name: 'Ada' });

  const partie = sieg => ({
    dauerSekunden: 60,
    eigener: { schuesse: 10, treffer: 4, schaden: 100, absorbierterSchaden: 20, zuege: 5, sieg },
  });

  profil.merge(partie(true));
  profil.merge(partie(true));
  profil.merge(partie(false));
  profil.merge(partie(true));

  assert.equal(profil.partien, 4);
  assert.equal(profil.siege, 3);
  assert.equal(profil.niederlagen, 1);
  assert.equal(profil.schuesse, 40);
  assert.equal(profil.treffer, 16);
  assert.equal(profil.schaden, 400);
  assert.equal(profil.spielzeitSekunden, 240);
  assert.equal(profil.trefferquote, 0.4);
  assert.equal(profil.schadenProMinute, 100);
  assert.equal(profil.siegquote, 0.75);

  // Serie: zwei Siege, eine Niederlage, ein Sieg → aktuell +1, Bestwert 2.
  assert.equal(profil.serie, 1);
  assert.equal(profil.serieRekord, 2);
});

test('Die Serie wird auch bei Niederlagen fortgeschrieben', () => {
  const profil = new PlayerProfile();
  const partie = sieg => ({ dauerSekunden: 30, eigener: { schuesse: 1, treffer: 0, schaden: 0, zuege: 1, sieg } });

  profil.merge(partie(false));
  profil.merge(partie(false));
  profil.merge(partie(false));
  assert.equal(profil.serie, -3, 'Drei Niederlagen in Folge');
  assert.equal(profil.serieRekord, 0, 'Niederlagen dürfen den Siegrekord nicht erhöhen');

  profil.merge(partie(true));
  assert.equal(profil.serie, 1, 'Der Sieg beginnt eine neue Serie');
});

test('Eine Partie ohne eigenen Zug verändert das Profil nicht', () => {
  // Zuschauer, sofortiges Ende, Verbindungsabbruch: Es gibt nichts zu verbuchen.
  const profil = new PlayerProfile();
  profil.merge({ dauerSekunden: 60, eigener: null });
  profil.merge(null);
  assert.equal(profil.partien, 0);
  assert.equal(profil.spielzeitSekunden, 0);
});

test('Lieblingswaffe und Lieblingsfraktion werden aus den Zählern bestimmt', () => {
  assert.equal(lieblingswaffe(new Map()), null);
  assert.deepEqual(lieblingswaffe(new Map([['pa_001', 3], ['pa_002', 7]])), { waffeId: 'pa_002', anzahl: 7 });
  // Gleichstand: stabil die kleinere Kennung — sonst wäre das Ergebnis von der
  // Einfügereihenfolge abhängig und ein Test flackerte.
  assert.deepEqual(lieblingswaffe(new Map([['pa_009', 2], ['pa_003', 2]])), { waffeId: 'pa_003', anzahl: 2 });

  const profil = new PlayerProfile();
  profil.spieleMit('schatten');
  profil.spieleMit('schatten');
  profil.spieleMit('koenige');
  profil.benutzeWaffen(new Map([['pa_001', 2]]));
  profil.benutzeWaffen(new Map([['pa_001', 3], ['pa_002', 1]]));

  assert.deepEqual(profil.lieblingsfraktion, { fraktion: 'schatten', partien: 2 });
  assert.deepEqual(profil.lieblingswaffe, { waffeId: 'pa_001', anzahl: 5 });
});

test('Das Profil überlebt Speichern und Laden', () => {
  /*
   * Die Kennzahlen liegen im Browser (localStorage) — dafür muss das Profil
   * schlicht serialisierbar sein. Karten (Map) überleben JSON nicht; deshalb
   * gibt es `toJSON`/`fromJSON`.
   */
  const profil = new PlayerProfile({ name: 'Ada', fraktion: 'schatten' });
  profil.merge({ dauerSekunden: 90, eigener: { schuesse: 8, treffer: 3, schaden: 210, zuege: 4, sieg: true } });
  profil.benutzeWaffen(new Map([['pa_001', 8]]));
  profil.spieleMit('schatten');

  const wieder = PlayerProfile.fromJSON(JSON.parse(JSON.stringify(profil)));
  assert.equal(wieder.name, 'Ada');
  assert.equal(wieder.partien, 1);
  assert.equal(wieder.schaden, 210);
  assert.equal(wieder.spielzeitSekunden, 90);
  assert.deepEqual(wieder.lieblingswaffe, { waffeId: 'pa_001', anzahl: 8 });
  assert.deepEqual(wieder.lieblingsfraktion, { fraktion: 'schatten', partien: 1 });
  assert.equal(wieder.trefferquote, profil.trefferquote);
});

test('Die Beschreibung formatiert alle Kennzahlen lesbar', () => {
  const profil = new PlayerProfile({ name: 'Ada' });
  profil.merge({
    dauerSekunden: 125,
    eigener: { schuesse: 10, treffer: 4, schaden: 250, zuege: 6, sieg: true },
  });
  profil.benutzeWaffen(new Map([['pa_001', 10]]));

  const text = beschreibe(profil);
  assert.equal(text.partien, '1');
  assert.equal(text.bilanz, '1 S / 0 N');
  assert.equal(text.siegquote, '100 %');
  assert.equal(text.serie, '1 Siege in Folge');
  assert.equal(text.trefferquote, '40 %');
  assert.equal(text.spielzeit, '2 min 5 s');
  assert.equal(text.schadenProMinute, '120 / min');
  assert.equal(text.lieblingswaffe, 'pa_001 (10×)');

  // Ohne Partien bleibt nichts leer — es steht ein Strich da.
  const leer = beschreibe(new PlayerProfile());
  assert.equal(leer.trefferquote, '—');
  assert.equal(leer.siegquote, '—');
  assert.equal(leer.serie, '—');
  assert.equal(leer.lieblingswaffe, '—');
  assert.equal(leer.spielzeit, '0 s');
});
