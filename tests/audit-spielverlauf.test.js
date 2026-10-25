import { test } from 'node:test';
import assert from 'node:assert/strict';

import { zaehleVorSturm } from '../tools/audit-mcp/lib/dynamisch.mjs';

/*
 * Der Audit-Bericht meldete bis 2026-10-25 den Fund
 * „Matchdauer im Verhältnis zum Mahlstrom-Breakpoint prüfen — 0 von 5 Partien
 * endeten VOR Runde 8". Diese Zahl war keine Aussage über das Spiel, sondern
 * über eine stehengebliebene Konstante im Werkzeug:
 *
 *     // ACHTUNG: Valhalla beginnt seit 2026-10-13 zufällig nach 6–12 Minuten
 *     // Spielzeit, nicht mehr ab einer festen Runde. Die Runde 8 ist hier nur
 *     // noch eine NÄHERUNG ...
 *     const abbruch = 8;
 *
 * `npm run check:maelstrom` misst den echten Sturmbeginn: Runde 15 bis 20.
 * Gegen Runde 8 verglichen kann keine Partie „vorher" enden — der Fund war
 * zwangsläufig immer rot und sagte nichts.
 *
 * `zaehleVorSturm` vergleicht deshalb jede Partie mit IHREM eigenen Sturmbeginn.
 */

/** Eine Partie, wie `spielverlauf()` sie in `parteien` ablegt. */
function partei(runden, sturmRunde) {
  return { runden, sturmRunde };
}

test('Partie vor ihrem eigenen Sturm zählt, Partie danach nicht', () => {
  const ergebnis = zaehleVorSturm([
    partei(11, 15), // Sturm wäre bei 15 gekommen, Partie war bei 11 vorbei
    partei(23, 17), // Sturm kam bei 17, Partie lief bis 23
  ]);

  assert.equal(ergebnis.vorSturm, 1);
  assert.equal(ergebnis.nachSturm, 1);
  assert.equal(ergebnis.gesamt, 2);
});

test('Ohne Sturmbeginn hat die Partie ihn nicht erlebt — das zählt als vorher', () => {
  // Kommt der Sturm nie, war die Partie in jedem Fall vor ihm zu Ende.
  const ergebnis = zaehleVorSturm([
    partei(11, null),
    partei(9, null),
  ]);

  assert.equal(ergebnis.vorSturm, 2);
  assert.equal(ergebnis.nachSturm, 0);
});

test('Der Grenzfall: Ende genau in der Sturmrunde ist NICHT vor dem Sturm', () => {
  // In dieser Runde ist der Sturm bereits aktiv — die Partie hat ihn erlebt.
  const ergebnis = zaehleVorSturm([partei(15, 15)]);

  assert.equal(ergebnis.vorSturm, 0);
  assert.equal(ergebnis.nachSturm, 1);
});

test('Die alte Runde-8-Regel wird NICHT mehr angewandt', () => {
  /*
   * Genau dieser Fall machte den alten Fund falsch: eine Partie endet in Runde
   * 11, der Sturm wäre erst in Runde 18 gekommen. Nach der alten Regel
   * (`runden < 8`) zählte sie als „nicht vor dem Sturm" — obwohl sie den Sturm
   * nie erlebt hat.
   */
  const ergebnis = zaehleVorSturm([partei(11, 18)]);

  assert.equal(ergebnis.vorSturm, 1,
    'Runde 11 vor Sturmrunde 18 muss als „vor dem Sturm" zählen');
});

test('Leere Messung ergibt Nullen und keine Division durch null', () => {
  const ergebnis = zaehleVorSturm([]);

  assert.equal(ergebnis.vorSturm, 0);
  assert.equal(ergebnis.nachSturm, 0);
  assert.equal(ergebnis.gesamt, 0);
  assert.equal(ergebnis.anteil, 0);
});

test('Anteil ist auf zwei Nachkommastellen gerundet', () => {
  const ergebnis = zaehleVorSturm([
    partei(11, 15), partei(12, 15), partei(30, 17),
  ]);

  assert.equal(ergebnis.gesamt, 3);
  assert.equal(ergebnis.anteil, 0.67);
});
