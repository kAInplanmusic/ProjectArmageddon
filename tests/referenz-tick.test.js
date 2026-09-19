/**
 * Tests für `referenzTick` — der Tick, den eine Eingabe mitführt.
 *
 * Warum das geprüft gehört: Der Tick entscheidet, ob der Server den Schuss
 * annimmt. Wird der rohe Snapshot-Tick gesendet, verpufft auf einem langsamen
 * Rechner jeder gültige Schuss (gemessen: 34 Ticks Rückstand gegen ein Fenster
 * von 12). Die Fortschreibung ist die Behebung — und sie muss KONSERVATIV
 * bleiben: nie in die Zukunft.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { referenzTick, TICK_MS } from '../src/client/networkClient.js';

test('Frischer Snapshot: der Tick bleibt unverändert', () => {
  const jetzt = 1_000_000;
  assert.equal(referenzTick({ snapshotTick: 500, empfangenAt: jetzt, jetzt }), 500);
});

test('Rückstand wird in Ticks fortgeschrieben (gemessener Fall: 570 ms)', () => {
  const jetzt = 1_000_000;
  const tick = referenzTick({ snapshotTick: 235, empfangenAt: jetzt - 570, jetzt });
  // 570 ms / 16,67 ms = 34,2 -> 34 Ticks. Das ist genau der gemessene Rückstand.
  assert.equal(tick, 235 + 34);
});

test('Ohne Snapshot gibt es keinen Tick', () => {
  assert.equal(referenzTick({ snapshotTick: undefined, empfangenAt: 1, jetzt: 2 }), 0);
  assert.equal(referenzTick({}), 0);
  assert.equal(referenzTick(), 0);
});

test('Ohne Empfangszeit wird nicht fortgeschrieben', () => {
  assert.equal(referenzTick({ snapshotTick: 42, empfangenAt: 0, jetzt: 999_999 }), 42);
  assert.equal(referenzTick({ snapshotTick: 42, jetzt: 999_999 }), 42);
});

test('Eine rückwärts gestellte Uhr zieht die Eingabe nicht in die Vergangenheit', () => {
  const jetzt = 1_000_000;
  assert.equal(referenzTick({ snapshotTick: 500, empfangenAt: jetzt + 5_000, jetzt }), 500);
});

test('Der Deckel greift erst nach Sekunden ohne Snapshot', () => {
  const jetzt = 1_000_000;
  // 2 s Rückstand: 120 Ticks — genau der Deckel.
  assert.equal(referenzTick({ snapshotTick: 10, empfangenAt: jetzt - 2_000, jetzt }), 10 + 120);
  // 30 s Rückstand: der Deckel hält, es wird nicht blind weitergerechnet.
  assert.equal(referenzTick({ snapshotTick: 10, empfangenAt: jetzt - 30_000, jetzt }), 10 + 120);
});

test('Die Tick-Dauer ist die der Simulation, nicht die Snapshot-Rate', () => {
  // 60 Hz Simulation, 20 Hz Snapshots. Wer hier 50 ms einsetzt, macht aus 570 ms
  // nur 11 Ticks — und der Schuss fällt wieder aus dem Fenster.
  assert.equal(TICK_MS, 1000 / 60);
  const jetzt = 1_000_000;
  assert.equal(referenzTick({ snapshotTick: 0, empfangenAt: jetzt - 1_000, jetzt }), 60);
});
