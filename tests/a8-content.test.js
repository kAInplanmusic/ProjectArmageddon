/**
 * A8 — Content-Daten: Lieblingsnation je Platz, exklusive Waffe, Turret-Prüfung.
 *
 * Die drei Punkte teilen sich eine Eigenschaft: Sie sind DATEN und Regeln, die
 * man ohne laufendes Match prüfen kann. Die Tests bauen deshalb keinen
 * vollständigen Motor auf, sondern prüfen die Verträge an ihren Grenzen:
 *
 *  - **LIEBLING-1:** Der Platz (die Figur) trägt seine Fraktion; das Profil
 *    verbucht sie einmal je Partie. Alte Aufrufer ohne Fraktion bleiben gültig.
 *  - **EXKL-1:** Eine exklusive Waffe ist eine Zuordnung Charakter → vorhandene
 *    Katalogwaffe. Sie fällt nur auf `legendary` und nur für ihren Charakter.
 *  - **TURRET-1:** Es gibt genau EINE Waffe mit `special: 'auto_target'` —
 *    aber ZWEI Waffen mit der Turm-MECHANIK. Die Content-Frage „ist das genug?"
 *    wird damit sichtbar, statt in einer Zahl unterzugehen.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { MatchStats, PlayerProfile } from '../src/shared/stats.js';
import { WEAPONS } from '../src/shared/config/weapons.js';
import { EFFECT_KIND, SELF_TARGET_KINDS, effectFor } from '../src/engine/specials.js';
import {
  EXKLUSIV_DROP_STUFE,
  darfAlsExklusivDrop,
  exklusivwaffeFuer,
  istExklusivwaffe,
  istNormalloot,
  pruefeExklusivdaten,
  EXKLUSIV_ZUORDNUNGEN,
} from '../src/shared/config/exklusiv-waffen.js';

// --------------------------------------------------------------- LIEBLING-1

/** Eine beendete Partie mit drei Figuren, optional mit Fraktion je Platz. */
function partei({ fraktionen = null } = {}) {
  const teams = new Map([[10, 0], [11, 0], [20, 1]]);
  const stats = new MatchStats({ teams, fraktionen });
  stats.setTick(0);
  for (const playerId of [10, 11, 20]) {
    stats.feed({ type: 'shot', payload: { playerId, weaponId: 'pa_001' } });
  }
  stats.feed({ type: 'match_over', payload: { winnerTeamId: 0, rounds: 1, ticks: 60 } });
  return stats;
}

test('Die Fraktion hängt am PLATZ, nicht am Team (LIEBLING-1)', () => {
  /*
   * Zwei Figuren im selben Team dürfen verschiedene Nationen tragen. Genau das
   * macht „je Platz" aus: Die Team-Zeile im Menü reicht dafür nicht.
   */
  const stats = partei({
    fraktionen: new Map([[10, 'xeno'], [11, 'koenige'], [20, 'mensch']]),
  });

  const zehn = stats.fuer(10);
  const elf = stats.fuer(11);
  assert.equal(zehn.teamId, elf.teamId, 'Testaufbau: beide müssen in Team 0 sein');
  assert.equal(zehn.fraktion, 'xeno');
  assert.equal(elf.fraktion, 'koenige');
  assert.equal(stats.fuer(20).fraktion, 'mensch');

  const eigene = stats.zusammenfassung([10, 11]).eigener;
  assert.deepEqual(eigene.fraktionen, ['koenige', 'xeno']);
  // Rückwärtskompatibel: `fraktion` nennt weiterhin genau eine (die erste Figur).
  assert.equal(eigene.fraktion, 'xeno');
});

test('Das Profil verbucht jede gespielte Nation einmal je Partie (LIEBLING-1)', () => {
  const profil = new PlayerProfile();
  const erste = partei({
    fraktionen: new Map([[10, 'xeno'], [11, 'koenige'], [20, 'mensch']]),
  }).zusammenfassung([10, 11]);
  profil.merge(erste);

  assert.equal(profil.fraktionen.get('xeno'), 1);
  assert.equal(profil.fraktionen.get('koenige'), 1);
  assert.equal(profil.fraktionen.get('mensch'), undefined, 'Gegner darf nicht zählen');
  assert.deepEqual(profil.lieblingsfraktion, { fraktion: 'koenige', partien: 1 });

  // Zweite Partie: beide eigenen Plätze spielen dieselbe Nation → nur EIN Zähler.
  const zweite = partei({
    fraktionen: new Map([[10, 'xeno'], [11, 'xeno'], [20, 'koenige']]),
  }).zusammenfassung([10, 11]);
  profil.merge(zweite);
  assert.equal(profil.fraktionen.get('xeno'), 2);
  assert.deepEqual(profil.lieblingsfraktion, { fraktion: 'xeno', partien: 2 });
});

test('Ohne Fraktionsangabe bleibt das Profil unverändert — Altdaten laufen weiter', () => {
  /*
   * Altreplays und ältere Aufrufer übergeben kein `fraktionen`. Das darf weder
   * werfen noch eine erfundene Nation eintragen. Ein gespeichertes Profil ohne
   * das Feld bleibt ebenfalls lesbar.
   */
  const alt = new PlayerProfile({ partien: 3, siege: 2, fraktionen: {} });
  const vorher = JSON.stringify(alt.toJSON());
  alt.merge(partei().zusammenfassung([10, 11]));
  assert.equal(alt.partien, 4, 'die Partie muss trotzdem zählen');
  assert.equal(alt.fraktionen.size, 0);
  assert.equal(alt.lieblingsfraktion, null);
  assert.notEqual(JSON.stringify(alt.toJSON()), vorher); // nur die Zähler ändern sich

  const geladen = PlayerProfile.fromJSON({
    partien: 1, siege: 1, fraktionen: { xeno: 1 }, erfolge: ['muster_erste_partie'],
  });
  assert.deepEqual(geladen.lieblingsfraktion, { fraktion: 'xeno', partien: 1 });
  assert.deepEqual(geladen.toJSON().fraktionen, { xeno: 1 });
});

test('Eine ausdrückliche Fraktionswahl hat Vorrang vor der Partieangabe', () => {
  const profil = new PlayerProfile();
  const eigene = partei({ fraktionen: new Map([[10, 'xeno']]) }).zusammenfassung([10]);
  profil.merge(eigene, { fraktion: 'koenige' });
  assert.equal(profil.fraktionen.get('koenige'), 1);
  assert.equal(profil.fraktionen.get('xeno'), undefined);
});

// -------------------------------------------------------------------- EXKL-1

test('Die Zuordnungstabelle ist strukturell gültig — auch wenn sie leer ist', () => {
  /*
   * Die Inhaltsentscheidung (welche Figur führt welche Katalogwaffe?) steht
   * beim Auftraggeber. Geprüft wird die FORM: keine unbekannten Kennungen,
   * keine doppelt vergebene Waffe. Eine leere Tabelle ist ausdrücklich gültig.
   */
  assert.deepEqual(pruefeExklusivdaten(), []);
  assert.equal(EXKLUSIV_DROP_STUFE, 'legendary');
  assert.equal(typeof EXKLUSIV_ZUORDNUNGEN, 'object');
});

test('Eine exklusive Waffe fällt nur legendär und nur für ihren Charakter', () => {
  /*
   * Beispielzuordnung im Test, NICHT in den Produktivdaten: `Enterhaken` ist
   * der einzige Superwaffen-Name, der wörtlich im Katalog vorkommt. Er belegt
   * die Mechanik, ohne eine Inhaltsentscheidung vorwegzunehmen.
   */
  const zuordnung = Object.freeze({ 'iron-hook-harry': 'pa_111' });

  const eintrag = exklusivwaffeFuer('iron-hook-harry', zuordnung);
  assert.ok(eintrag, 'die Zuordnung muss auflösen');
  assert.equal(eintrag.waffeId, 'pa_111');
  assert.equal(eintrag.waffe.displayName, 'Enterhaken');
  assert.equal(eintrag.dropStufe, 'legendary');

  assert.equal(exklusivwaffeFuer('sgt-acid-xeno', zuordnung), null);
  assert.equal(exklusivwaffeFuer('gibt-es-nicht', zuordnung), null);

  assert.equal(darfAlsExklusivDrop('pa_111', 'iron-hook-harry', 'legendary', zuordnung), true);
  assert.equal(darfAlsExklusivDrop('pa_111', 'iron-hook-harry', 'epic', zuordnung), false,
    'exklusiv heißt: nicht auf einer niedrigeren Stufe');
  assert.equal(darfAlsExklusivDrop('pa_111', 'sgt-acid-xeno', 'legendary', zuordnung), false,
    'eine fremde Figur darf die Waffe nicht exklusiv ziehen');
  assert.equal(darfAlsExklusivDrop('pa_001', 'iron-hook-harry', 'legendary', zuordnung), false);
});

test('Exklusive Waffen sind kein normales Loot — ohne Zuordnung ändert sich nichts', () => {
  const zuordnung = Object.freeze({ 'iron-hook-harry': 'pa_111' });
  assert.equal(istExklusivwaffe('pa_111', zuordnung), true);
  assert.equal(istNormalloot('pa_111', zuordnung), false);
  assert.equal(istNormalloot('pa_001', zuordnung), true);

  // Leere Produktivtabelle: Alles bleibt normales Loot, kein Verhalten ändert sich.
  assert.equal(istExklusivwaffe('pa_111'), false);
  assert.equal(istNormalloot('pa_111'), true);
});

test('Die Prüfung findet unbekannte Kennungen und doppelte Waffen', () => {
  const fehler = pruefeExklusivdaten({
    'iron-hook-harry': 'pa_111',
    'stalker-predax': 'pa_111', // dieselbe Waffe ein zweites Mal
    'gibt-es-nicht': 'pa_001',
    'sgt-acid-xeno': 'pa_9999',
  });
  assert.ok(fehler.some(f => f.includes('doppelt zugeordnet')), fehler.join(' | '));
  assert.ok(fehler.some(f => f.includes('unbekannter Charakter')), fehler.join(' | '));
  assert.ok(fehler.some(f => f.includes('unbekannte Waffe')), fehler.join(' | '));
});

// ------------------------------------------------------------------- TURRET-1

test('Nur EINE Waffe trägt `auto_target` — die Content-Frage bleibt sichtbar', () => {
  /*
   * TA §4 fragt, ob eine einzige Auto-Ziel-Waffe genug ist. Der Test beantwortet
   * nicht die Geschmacksfrage, sondern hält den BESTAND fest: genau `pa_124`
   * (Wachgeschütz). Kommt eine zweite dazu, wird dieser Test rot und die
   * Entscheidung muss bewusst fallen.
   */
  const auto = WEAPONS.filter(w => w.special === 'auto_target');
  assert.equal(auto.length, 1);
  assert.equal(auto[0].id, 'pa_124');
  assert.equal(auto[0].displayName, 'Wachgeschütz');
});

test('Zwei Waffen nutzen die Turm-MECHANIK — nicht nur eine', () => {
  /*
   * FUND: `auto_target` ist nicht der einzige Weg zum Turm. `summon_warrior`
   * (Astralkrieger, `pa_141`) erzeugt denselben Effekt `EFFECT_KIND.TURRET`.
   * Wer nur `special === 'auto_target'` zählt, unterschätzt den Bestand um die
   * Hälfte. Beide Wege müssen selbstzielend sein, sonst würde ein Projektil
   * verschossen, statt ein Turm aufgestellt.
   */
  const türme = WEAPONS.filter(w => effectFor(w.special)?.kind === EFFECT_KIND.TURRET);
  assert.deepEqual(türme.map(w => w.id), ['pa_124', 'pa_141']);
  assert.deepEqual(türme.map(w => w.special), ['auto_target', 'summon_warrior']);
  assert.equal(SELF_TARGET_KINDS.has(EFFECT_KIND.TURRET), true);
  for (const waffe of türme) {
    assert.equal(effectFor(waffe.special).kind, EFFECT_KIND.TURRET, waffe.id);
  }
});
