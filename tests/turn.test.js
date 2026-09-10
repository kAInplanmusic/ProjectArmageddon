import assert from 'node:assert/strict';
import test from 'node:test';
import { MatchController } from '../src/engine/match.js';

/**
 * Zugzeit und Zugwechsel ohne Spielereingabe.
 *
 * Wichtig für den Mehrspielerbetrieb: Die Zeitmessung muss auf dem Server
 * laufen. Täte sie das nicht, könnte ein Spieler, der einfach nicht feuert, das
 * Match dauerhaft blockieren — die anderen warteten endlos.
 */

test('Der Zug wechselt nach Ablauf der Zugzeit auch ohne Schuss', () => {
  // Kurze Zugzeit, damit der Test schnell läuft: 200 ms entsprechen 12 Ticks.
  const match = new MatchController({
    seed: 4242, teams: 2, playersPerTeam: 2, turnDurationMs: 200,
  });
  match.start();

  const ersterSpieler = match.activePlayerId;
  assert.ok(ersterSpieler > 0, 'Es muss einen aktiven Spieler geben');

  let letzter = ersterSpieler;
  let wechsel = 0;
  let ticks = 0;
  const grenze = 60 * 30; // 30 Sekunden Spielzeit als Sicherheitsnetz

  while (ticks < grenze && wechsel < 6) {
    match.step();
    match.consumeEvents();
    ticks += 1;
    if (match.activePlayerId !== letzter) {
      wechsel += 1;
      letzter = match.activePlayerId;
    }
  }

  assert.ok(
    wechsel >= 6,
    `Der Zug muss ohne Schuss weiterlaufen: nur ${wechsel} Wechsel in ${ticks} Ticks`,
  );
  assert.equal(match.status, 'playing', 'Das Match darf dabei nicht enden');
});

test('Nach einem Zugwechsel beginnt ein frischer Zug', () => {
  const match = new MatchController({
    seed: 777, teams: 2, playersPerTeam: 1, turnDurationMs: 120,
  });
  match.start();

  const erster = match.activePlayerId;
  const zugzeit = match.getState().turnDurationMs;

  // Bis kurz vor Ablauf simulieren.
  for (let i = 0; i < 3; i++) {
    match.step();
    match.consumeEvents();
  }
  const vorAblauf = match.getState();
  assert.ok(vorAblauf.turnElapsedMs > 0, 'Die Zugzeit muss voranschreiten');
  assert.ok(
    vorAblauf.turnElapsedMs < zugzeit,
    `Die Zugzeit darf noch nicht abgelaufen sein: ${vorAblauf.turnElapsedMs}/${zugzeit}`,
  );

  // Über den Ablauf hinaus simulieren.
  let gewechselt = false;
  for (let i = 0; i < 60 && !gewechselt; i++) {
    match.step();
    match.consumeEvents();
    if (match.activePlayerId !== erster) gewechselt = true;
  }
  assert.ok(gewechselt, 'Nach Ablauf muss der Zug wechseln');

  // Der neue Zug startet bei nahezu null, nicht beim alten Stand.
  const nachWechsel = match.getState();
  assert.ok(
    nachWechsel.turnElapsedMs < zugzeit,
    `Der neue Zug muss frisch beginnen: ${nachWechsel.turnElapsedMs}/${zugzeit}`,
  );
});

test('setTurnDuration wirkt sofort auf die laufende Zeitmessung', () => {
  const match = new MatchController({
    seed: 99, teams: 2, playersPerTeam: 1, turnDurationMs: 10_000,
  });
  match.start();

  const erster = match.activePlayerId;
  match.setTurnDuration(120);
  assert.equal(match.turnDurationMs, 120);

  // Bei 120 ms Zugzeit muss der Wechsel binnen weniger Ticks erfolgen.
  let gewechselt = false;
  for (let i = 0; i < 30 && !gewechselt; i++) {
    match.step();
    match.consumeEvents();
    if (match.activePlayerId !== erster) gewechselt = true;
  }
  assert.ok(gewechselt, 'Die verkürzte Zugzeit muss greifen');
});

test('Ein Schuss beendet den Zug sofort', () => {
  // Gegenstück zum Timeout: Wer feuert, gibt den Zug direkt ab.
  const match = new MatchController({
    seed: 606, teams: 2, playersPerTeam: 1, turnDurationMs: 60_000,
  });
  match.start();

  const erster = match.activePlayerId;
  const result = match.fire(erster, Math.PI / 4, 60);
  assert.equal(result.ok, true, `Schuss abgelehnt: ${result.errors?.join(', ')}`);

  let gewechselt = false;
  for (let i = 0; i < 900 && !gewechselt; i++) {
    match.step();
    match.consumeEvents();
    if (match.activePlayerId !== erster) gewechselt = true;
  }
  assert.ok(gewechselt, 'Nach dem Schuss muss der Zug wechseln');
});
