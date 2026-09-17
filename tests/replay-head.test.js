/**
 * Tests: Der Replay-Kopf trägt die vollständige Match-Konfiguration.
 *
 * ## Der Befund
 *
 * Ein Code-Audit fand: `ReplayRecorder.forMatch()` hatte **null Aufrufer** und
 * kopierte `sidegrades` und `loadouts` nicht in den Kopf — die beiden Felder,
 * die laut Kopf-Kommentar dazugehören, „sonst spielte die Wiedergabe ein anderes
 * Match". Die Methode wurde **entfernt** statt repariert: Der Server baut seinen
 * Recorder direkt (`gameServer.js:92`) und übergibt die volle Konfiguration.
 *
 * ## Das Datenformat (eine Falle beim Schreiben dieser Tests)
 *
 * `sidegrades` und `loadouts` sind **Arrays je Spielerplatz**, keine Objekte mit
 * Spieler-IDs:
 *
 * ```
 * sidegrades: ['gepanzert', null, 'kompakt', null]   ← richtig
 * sidegrades: { 1: 'gepanzert', 3: 'kompakt' }       ← wird STILL verworfen
 * ```
 *
 * Der erste Anlauf dieser Datei übergab Objekte. Beide Klassen prüfen mit
 * `Array.isArray`; ein Objekt fällt durch und wird **ohne Fehlermeldung**
 * weggelassen — die Wiedergabe hätte stillschweigend ohne Nebenwirkungen
 * gespielt. Die Tests sind deshalb auf das Array-Format umgestellt **und** um
 * eine Prüfung dieses Verhaltens ergänzt: Wer ein Objekt übergibt, soll den
 * Grund im Quelltext finden.
 *
 * ## Was hier geprüft wird
 *
 * Dass der Replay-Kopf vollständig ist — auf dem Weg, den der Server tatsächlich
 * geht — und dass Nebenwirkungen den Weg Aufzeichnung → Wiedergabe überleben.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ReplayRecorder, playReplay } from '../src/engine/replay.js';
import { MatchController } from '../src/engine/match.js';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HIER, '..');

/** Die Felder, die ein Replay-Kopf tragen MUSS. */
const PFLICHTFELDER = ['teams', 'playersPerTeam', 'preset', 'maxRounds', 'turnDurationMs'];

test('Die entfernte Abkürzung `forMatch` ist weg', () => {
  /*
   * Ein Abwesenheitstest mit Grund: Die Methode war eine Falle (sah bequem aus,
   * war unvollständig). Käme sie zurück, wäre dieselbe Falle wieder da.
   */
  assert.equal(typeof ReplayRecorder.forMatch, 'undefined',
    '`ReplayRecorder.forMatch` existiert wieder. Falls das Absicht ist: Sie MUSS '
    + '`sidegrades` und `loadouts` in den Kopf übernehmen — sonst spielt die '
    + 'Wiedergabe ein anderes Match.');
});

test('Der Kopf trägt alle Pflichtfelder', () => {
  const recorder = new ReplayRecorder({
    seed: 4242,
    teams: 2,
    playersPerTeam: 2,
    preset: 'hills',
    maxRounds: 5,
    turnDurationMs: 30_000,
  });

  const json = recorder.toJSON();
  assert.ok(json.config, 'der Kopf hat keinen config-Bereich');
  assert.equal(json.seed, 4242, 'der Seed steht im Kopf (nicht in config)');

  for (const feld of PFLICHTFELDER) {
    assert.ok(feld in json.config,
      `Das Pflichtfeld "${feld}" fehlt im Replay-Kopf`);
  }
});

test('Sidegrades (Array je Platz) stehen im Kopf', () => {
  const recorder = new ReplayRecorder({
    seed: 4242, teams: 2, playersPerTeam: 2, preset: 'open',
    sidegrades: ['gepanzert', null, 'kompakt', null],
  });

  const json = JSON.parse(JSON.stringify(recorder.toJSON()));
  assert.deepEqual(json.config.sidegrades, ['gepanzert', null, 'kompakt', null],
    'Die Sidegrades müssen im Kopf stehen — sonst spielt die Wiedergabe '
    + 'ohne Nebenwirkungen');

  assert.ok(playReplay(json), 'die Wiedergabe muss ein Match ergeben');
});

test('Loadouts (Array je Platz) stehen im Kopf', () => {
  const recorder = new ReplayRecorder({
    seed: 777, teams: 2, playersPerTeam: 2, preset: 'mountains',
    loadouts: [{ classId: 'heavy', archetypeId: 'occultist' }, null, null, null],
  });

  const json = JSON.parse(JSON.stringify(recorder.toJSON()));
  assert.deepEqual(json.config.loadouts,
    [{ classId: 'heavy', archetypeId: 'occultist' }, null, null, null]);

  assert.ok(playReplay(json).match, 'die Wiedergabe muss ein Match ergeben');
});

test('Ein leeres Feld wird NICHT aufgenommen (kein Rauschen im Kopf)', () => {
  /*
   * Die andere Seite: Ein Kopf ohne Nebenwirkungen soll auch kein leeres Feld
   * tragen — sonst wären alte und neue Aufzeichnungen ohne Grund verschieden.
   */
  const recorder = new ReplayRecorder({
    seed: 1, teams: 2, playersPerTeam: 2, preset: 'open',
    sidegrades: [null, null, null, null],
    loadouts: [null, null, null, null],
  });

  const json = recorder.toJSON();
  assert.ok(!('sidegrades' in json.config),
    'ein leeres Sidegrade-Feld gehört nicht in den Kopf');
  assert.ok(!('loadouts' in json.config),
    'ein leeres Loadout-Feld gehört nicht in den Kopf');
});

test('Ein OBJEKT statt eines Arrays wird still verworfen — das ist dokumentiert', () => {
  /*
   * Diese Prüfung hält das Verhalten fest, das beim Schreiben der Tests zwei
   * Fehlschläge verursacht hat: `{ 1: 'gepanzert' }` ist KEIN gültiges Format.
   * Beide Klassen prüfen mit `Array.isArray` und lassen ein Objekt ohne Meldung
   * durchfallen.
   *
   * Der Test dokumentiert das — nicht als Wunschverhalten, sondern als
   * Tatsache, damit der nächste Leser den Grund sofort sieht statt zu rätseln,
   * warum seine Nebenwirkungen verschwinden.
   */
  const recorder = new ReplayRecorder({
    seed: 9, teams: 2, playersPerTeam: 2, preset: 'open',
    sidegrades: { 1: 'gepanzert' },   // ABSICHTLICH falsches Format
  });

  assert.ok(!('sidegrades' in recorder.toJSON().config),
    'Ein Objekt ist kein gültiges Format — es wird verworfen. '
    + 'Richtig ist ein Array je Spielerplatz: ["gepanzert", null, ...]');
});

test('Ein Match mit Nebenwirkungen lässt sich wiederherstellen', () => {
  /*
   * Der Ende-zu-Ende-Beleg: Ein Match mit Sidegrade wird gespielt, aufgezeichnet
   * und wiedergegeben — die Figur muss dieselben Werte haben.
   */
  const match = new MatchController({
    seed: 4242, teams: 2, playersPerTeam: 2, preset: 'open',
    turnDurationMs: 1_000_000,
    sidegrades: ['gepanzert', null, null, null],
  });
  match.start();

  const spieler = match.getState().entities[0];
  assert.equal(spieler.sidegradeId, 'gepanzert',
    'Testannahme: das Sidegrade liegt am Spieler');

  const recorder = new ReplayRecorder({
    seed: match.seedManager.baseSeed,
    teams: match.teams,
    playersPerTeam: match.playersPerTeam,
    preset: match.preset,
    maxRounds: match.maxRounds,
    turnDurationMs: match.turnDurationMs,
    sidegrades: match.sidegrades,
    loadouts: match.loadouts,
  });

  for (let i = 0; i < 30; i += 1) {
    match.step();
    match.consumeEvents();
  }
  recorder.recordRound(1, match.getState().tick);

  const json = JSON.parse(JSON.stringify(recorder.toJSON()));
  assert.deepEqual(json.config.sidegrades, ['gepanzert', null, null, null]);

  /*
   * `playReplay` liefert ein ERGEBNIS-Objekt (`{match, appliedInputs, ticks,
   * rejected}`), nicht das Match selbst. Ein erster Anlauf rief
   * `wieder.getState()` auf und scheiterte an `not a function`.
   */
  const ergebnis = playReplay(json);
  assert.ok(ergebnis.match, 'die Wiedergabe muss ein Match liefern');

  const nachher = ergebnis.match.getState().entities[0];
  assert.ok(nachher, 'die Wiedergabe muss Figuren haben');
  assert.equal(nachher.sidegradeId, 'gepanzert',
    'Die Wiedergabe muss dasselbe Sidegrade anwenden');
  assert.equal(Math.round(nachher.maxHealth), Math.round(spieler.maxHealth),
    'und damit dasselbe maximale Leben ergeben');
});

test('Der Kopf-Kommentar nennt die beiden heiklen Felder', () => {
  /*
   * Der Kommentar im Quelltext begründet, warum `sidegrades` in den Kopf
   * gehört. Dieser Test hält fest, dass die Begründung nicht verschwindet — sie
   * ist der Grund, warum die Felder überhaupt dort stehen.
   */
  const text = fs.readFileSync(path.join(ROOT, 'src', 'engine', 'replay.js'), 'utf8');
  assert.match(text, /sidegrades/, 'der Kopf-Kommentar erwähnt sidegrades nicht');
  assert.match(text, /loadouts/, 'der Kopf-Kommentar erwähnt loadouts nicht');
});
