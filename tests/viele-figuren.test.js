/**
 * Tests: Der Motor trägt viele Figuren.
 *
 * ## Warum diese Datei existiert
 *
 * Die Matcharten nennen bis zu **40 Figuren** (Krieg: 8 Spieler × 5 Einheiten).
 * Eine frühere Hochrechnung in dieser Sitzung sagte daraus „115 % eines Kerns"
 * voraus — indem sie die gemessene Last von 4 Figuren linear fortsetzte.
 *
 * Die **Messung** (`npm run measure:figures`) zeigte: 40 Figuren kosten
 * **1,9 %** eines Kerns. Die Hochrechnung lag um Faktor 60 daneben, weil ein
 * großer Teil der Arbeit je Tick nicht an den Figuren hängt (Wasser, Mahlstrom,
 * Zeitgeber).
 *
 * Dieser Test hält zwei Dinge fest, die dabei zählen:
 *
 *   1. Der Motor trägt 40 Figuren überhaupt (alle gesetzt, Partie läuft).
 *   2. Der Determinismus hält dabei — gleicher Seed, gleicher Hash.
 *
 * Die Laufzeit wird NICHT festgeschrieben (sie hängt an der Maschine), sondern
 * nur die **Machbarkeit**.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MatchController } from '../src/engine/match.js';

/** Eine Konfiguration aus der Matchart-Tabelle. */
function match(teams, playersPerTeam, seed = 4242) {
  const m = new MatchController({
    seed, teams, playersPerTeam, preset: 'hills', turnDurationMs: 200, maxRounds: 8,
  });
  m.start();
  return m;
}

test('Die kleinste Matchart: 2 Spieler mit 3 Einheiten', () => {
  /*
   * „klein" beginnt bei 2 Spielern mit je 3 Einheiten — das sind 6 Figuren.
   * Der Motor kennt heute eine Figur je Spieler; 3 Einheiten je Spieler sind
   * drei Spielerplätze in einem Team. Deshalb wird hier mit teams × players
   * gerechnet, nicht mit Einheiten.
   */
  const m = match(2, 3);
  assert.equal(m.getState().entities.length, 6,
    '2 Teams × 3 Plätze = 6 Figuren');
});

test('Die größte Matchart: 40 Figuren laufen', () => {
  /*
   * „Krieg" nennt 8 Spieler mit 5 Einheiten = 40 Figuren. Das ist die Zahl,
   * für die gemessen wurde.
   *
   * Geprüft wird die MACHTBARKEIT, nicht die Laufzeit: Alle Figuren werden
   * gesetzt, alle Teams stehen, die Partie läuft.
   */
  const m = match(4, 10);
  const zustand = m.getState();

  assert.equal(zustand.entities.length, 40, '4 Teams × 10 Plätze = 40 Figuren');

  const teams = new Set(zustand.entities.map(e => e.teamId));
  assert.equal(teams.size, 4, 'alle vier Teams müssen besetzt sein');

  // Die Partie läuft — nicht nur der Aufbau.
  for (let i = 0; i < 200; i += 1) {
    m.step();
    m.consumeEvents();
    if (i % 7 === 0) m.endTurn();
  }
  assert.equal(m.status, 'playing', 'die Partie muss laufen');
});

test('Der Determinismus hält bei 40 Figuren', () => {
  /*
   * DIE Prüfung, die bei vielen Figuren zählt. Mehr Figuren heißen mehr
   * Zustand — wenn der Hash dann auseinanderläuft, ist ein Replay nicht mehr
   * belegbar.
   *
   * Der Hash wird über den spielrelevanten Zustand gebildet (Figuren, Kisten,
   * Geschütze, Zustandswerte). Läuft er bei 40 Figuren auseinander, wäre das
   * der Grund, die Figurenzahl zu begrenzen.
   */
  const lauf = () => {
    const m = match(4, 10);
    for (let i = 0; i < 300; i += 1) {
      m.step();
      m.consumeEvents();
      if (i % 7 === 0) m.endTurn();
    }
    return m.stateHash();
  };

  assert.equal(lauf(), lauf(),
    'Zwei Läufe mit demselben Seed müssen denselben Zustandshash ergeben');
});

test('Verschiedene Seeds ergeben verschiedene Zustände — auch bei 40 Figuren', () => {
  /*
   * Die Gegenprobe. Ein Hash, der bei 40 Figuren für JEDEN Seed gleich wäre,
   * würde „Determinismus" nur vortäuschen: Er wäre konstant und damit nutzlos.
   */
  const lauf = (seed) => {
    const m = match(4, 10, seed);
    for (let i = 0; i < 200; i += 1) {
      m.step();
      m.consumeEvents();
      if (i % 7 === 0) m.endTurn();
    }
    return m.stateHash();
  };

  assert.notEqual(lauf(4242), lauf(9999),
    'verschiedene Seeds müssen verschiedene Zustände ergeben');
});

test('Alle Matcharten der Tabelle sind spielbar', () => {
  /*
   * Die Tabelle aus dem Auftrag, Zeile für Zeile:
   *
   *     klein    2–4 Spieler   je 3 Einheiten
   *     groß     4 Spieler     je 4 Einheiten
   *     Krieg    6–8 Spieler   je 5 Einheiten
   *
   * Solange der Motor eine Figur je Spieler kennt, wird mit `teams × players`
   * gerechnet. Diese Prüfung hält fest, dass alle genannten Größen LAUFEN —
   * unabhängig davon, wie die Einheiten später heißen.
   */
  const faelle = [
    { name: 'klein (2×3)', teams: 2, players: 3 },
    { name: 'klein (4×3)', teams: 4, players: 3 },
    { name: 'groß (4×4)', teams: 4, players: 4 },
    { name: 'Krieg (3×10)', teams: 3, players: 10 },
    { name: 'Krieg (4×10)', teams: 4, players: 10 },
  ];

  for (const fall of faelle) {
    const m = match(fall.teams, fall.players);
    const figuren = m.getState().entities.length;
    assert.equal(figuren, fall.teams * fall.players,
      `${fall.name}: ${figuren} Figuren statt ${fall.teams * fall.players}`);

    for (let i = 0; i < 100; i += 1) {
      m.step();
      m.consumeEvents();
      if (i % 7 === 0) m.endTurn();
    }
    assert.equal(m.status, 'playing', `${fall.name}: die Partie muss laufen`);
  }
});
