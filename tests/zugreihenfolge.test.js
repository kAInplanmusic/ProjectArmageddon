/**
 * Tests: Die Zugreihenfolge und die Wurfweite.
 *
 * ## Die Zugreihenfolge — die Regel des klassischen Artillerie-Spiels
 *
 *     S1 E1, S2 E1, S3 E1, S4 E1, S1 E2, S2 E2, S3 E2, S4 E2, dann Runde 2
 *
 * Also: **erst alle Spieler mit ihrer ersten Einheit, dann alle mit ihrer
 * zweiten.** Ein Spieler zieht zweimal je Runde, aber nicht hintereinander —
 * zwischen seinen Einheiten liegen die Züge aller anderen.
 *
 * Das ist nicht dasselbe wie „jede Figur ist ein eigener Spieler": Bei drei
 * Einheiten je Spieler und vier Spielern ergäbe das zwölf Züge, bei denen
 * niemand weiß, wann er wieder dran ist. Die Regel oben gibt jedem Spieler
 * einen festen Platz.
 *
 * ## Die Wurfweite — warum die Rechnung „Abstand der äußersten Figuren" falsch war
 *
 * FUND (belegt, eigener Denkfehler): Eine erste Fassung verglich die Wurfweite
 * mit dem Abstand der **äußersten** Figuren (1536 px auf einer 2560er Karte)
 * und schloss daraus, die Waffen reichten zu kurz.
 *
 * Das war falsch gedacht: Figur 1 muss nicht Figur 4 erreichen, sondern den
 * **nächsten Gegner**. Gemessen:
 *
 *     Figur bei x=512:  nächster Gegner  513 px  = 0,73× Wurfweite
 *     Figur bei x=1536: nächster Gegner  545 px  = 0,77× Wurfweite
 *
 * Die Figuren sterben außerdem im Verlauf einer Partie, und die Aufstellung
 * rückt nach. Der Abstand zum NÄCHSTEN Gegner ist die Zahl, die zählt.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MatchController } from '../src/engine/match.js';

/** Startet ein Match und liefert den Controller. */
function match(optionen = {}) {
  const m = new MatchController({
    seed: 4242, teams: 2, playersPerTeam: 2, kartentyp: 'autonom',
    turnDurationMs: 2000, maxRounds: 3, ...optionen,
  });
  m.start();
  m.consumeEvents();
  return m;
}

/** Die nächsten Züge als Liste von Spielernummern. */
function zugfolge(m, anzahl) {
  const folge = [];
  for (let i = 0; i < anzahl; i += 1) {
    const s = m.getState();
    const e = s.entities.find(x => x.entityId === s.activePlayerId);
    folge.push({ zug: i + 1, figur: s.activePlayerId, team: e?.teamId, runde: s.round });
    m.endTurn();
  }
  return folge;
}

test('Zwei Teams wechseln sich ab', () => {
  /*
   * Die einfachste Form: Bei zwei Teams wechselt jeder Zug die Seite, damit
   * kein Team zwei Schüsse hintereinander hat.
   */
  const m = match({ teams: 2, playersPerTeam: 2 });
  const folge = zugfolge(m, 8);

  for (let i = 1; i < folge.length; i += 1) {
    assert.notEqual(folge[i].team, folge[i - 1].team,
      `Zug ${i + 1}: Team ${folge[i].team} folgt auf Team ${folge[i - 1].team} — `
      + 'dasselbe Team darf nicht zweimal hintereinander ziehen');
  }
});

test('Vier Teams: jeder kommt einmal, bevor einer zweimal kommt', () => {
  /*
   * Die Regel des klassischen Spiels. Bei vier Teams und zwei Einheiten je
   * Spieler muss die Reihenfolge sein:
   *
   *     T0 T1 T2 T3 | T0 T1 T2 T3 | (Runde 2)
   *
   * Also: Der erste Durchlauf enthält JEDES Team genau einmal.
   */
  const m = match({ teams: 4, playersPerTeam: 2 });
  const folge = zugfolge(m, 4);

  const teams = folge.map(z => z.team);
  assert.deepEqual(teams, [0, 1, 2, 3],
    `Die erste Runde ergibt die Reihenfolge ${teams.join(', ')} — `
    + 'erwartet wird jedes Team genau einmal');
});

test('Die zweite Einheit folgt nach allen ersten Einheiten', () => {
  /*
   * DIE Prüfung des Schemas. Bei zwei Einheiten je Spieler und vier Teams:
   *
   *     Zug 1–4:  S1E1 S2E1 S3E1 S4E1
   *     Zug 5–8:  S1E2 S2E2 S3E2 S4E2
   *
   * Die Teams der Züge 5–8 sind also DIESELBE Folge wie die der Züge 1–4.
   */
  const m = match({ teams: 4, playersPerTeam: 2 });
  const folge = zugfolge(m, 8);

  const ersteRunde = folge.slice(0, 4).map(z => z.team);
  const zweiteHaelfte = folge.slice(4, 8).map(z => z.team);

  assert.deepEqual(zweiteHaelfte, ersteRunde,
    `Nach dem ersten Durchlauf (${ersteRunde.join(', ')}) folgt `
    + `${zweiteHaelfte.join(', ')} — erwartet wird dieselbe Folge`);

  // Und alle acht Züge liegen in derselben Runde.
  const runden = new Set(folge.map(z => z.runde));
  assert.equal(runden.size, 1,
    `Die acht Züge verteilen sich auf ${runden.size} Runden — erwartet wird eine`);
});

test('Nach allen Einheiten beginnt die nächste Runde', () => {
  /*
   * Zwei Teams, zwei Einheiten = vier Züge je Runde. Der fünfte Zug muss in
   * Runde 2 liegen.
   */
  const m = match({ teams: 2, playersPerTeam: 2 });
  const folge = zugfolge(m, 5);

  assert.equal(folge[3].runde, 1, 'der vierte Zug gehört noch zur ersten Runde');
  assert.equal(folge[4].runde, 2, 'der fünfte Zug muss Runde 2 sein');
});

test('Der nächste Gegner ist in Wurfweite', () => {
  /*
   * ## Der Denkfehler, den dieser Test ersetzt
   *
   * Eine erste Fassung verglich die Wurfweite mit dem Abstand der ÄUSSERSTEN
   * Figuren (1536 px bei einer 2560er Karte) und schloss auf zu kurze Waffen.
   *
   * Falsch: Figur 1 muss nicht Figur 4 erreichen, sondern den NÄCHSTEN Gegner.
   * Das ist die Hälfte der Strecke — und sie passt.
   *
   * Geprüft wird deshalb: Jede Figur hat mindestens einen Gegner in
   * Reichweite. Sonst wäre sie beim ersten Zug handlungsunfähig.
   */
  const m = match({ teams: 2, playersPerTeam: 2 });
  const weite = m.erreichbarkeit.wurfweite;
  const figuren = m.getState().entities;

  assert.ok(weite > 0, 'die Wurfweite muss berechnet sein');

  for (const eigene of figuren) {
    let naechster = Infinity;
    for (const andere of figuren) {
      if (andere.teamId === eigene.teamId) continue;
      const d = Math.hypot(andere.x - eigene.x, andere.y - eigene.y);
      if (d < naechster) naechster = d;
    }

    assert.ok(naechster <= weite,
      `Figur bei x=${Math.round(eigene.x)} hat den nächsten Gegner in `
      + `${Math.round(naechster)} px, die Wurfweite beträgt aber nur `
      + `${Math.round(weite)} px — sie könnte nicht schießen`);
  }
});

test('Jede Figur hat einen eigenen Zug', () => {
  /*
   * Bei zwei Teams und zwei Einheiten sind vier Figuren im Spiel — und jede
   * kommt in der ersten Runde genau einmal dran.
   */
  const m = match({ teams: 2, playersPerTeam: 2 });
  const folge = zugfolge(m, 4);

  const figuren = folge.map(z => z.figur);
  assert.equal(new Set(figuren).size, 4,
    `In vier Zügen kamen ${new Set(figuren).size} verschiedene Figuren dran — `
    + 'erwartet werden vier');
});
