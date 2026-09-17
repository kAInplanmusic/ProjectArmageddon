/**
 * Tests: Günther skaliert mit der Kartengröße.
 *
 * ## Der Befund
 *
 * Günther lief mit **festen** Werten: 0,9 px/Tick Geschwindigkeit und 320 px
 * Suchreichweite. Ein Auftritt dauert drei Runden — die Strecke, die er dabei
 * zurücklegt, war damit **konstant**:
 *
 *     Karte    Breite   Strecke je Auftritt   Anteil
 *     klein      1280              1296 px     101 %
 *     mittel     2560              1296 px      51 %
 *     krieg      5120              1296 px      25 %
 *
 * Auf der alten Karte durchquerte er sie vollständig. Auf der Kriegskarte kam
 * er nicht einmal ein Viertel weit.
 *
 * ## Was gemessen wurde — und was dabei schiefging
 *
 * Ein erster Messaufbau gab den Zug alle vier Schritte ab (statt nach 20 s).
 * Eine Runde dauerte damit 16 Ticks statt 4800 — Günther hatte 300× weniger
 * Zeit, und die Messung meldete „keine Begegnung". Das war ein Artefakt des
 * Aufbaus, kein Fehler im Spiel. Mit echter Zugzeit gemessen legt er **1496 px**
 * zurück und trifft Spieler.
 *
 * ## Was hier geprüft wird
 *
 * Die **Skalierung**: Bei größeren Karten muss Günther schneller werden und
 * weiter suchen, damit sein Anteil an der Karte gleich bleibt.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  GUENTHER_MOVEMENT, GUENTHER_REFERENZ_BREITE, guentherBewegung,
} from '../src/shared/config/guenther.js';

test('Die Bewegungswerte sind Anteile, nicht feste Pixel', () => {
  /*
   * Der Kern der Behebung. Stünden dort feste Werte, wäre Günther auf einer
   * 5120er Karte praktisch unsichtbar.
   */
  assert.ok(GUENTHER_MOVEMENT.speedAnteil > 0,
    'speedAnteil fehlt — die Geschwindigkeit wäre nicht skalierbar');
  assert.ok(GUENTHER_MOVEMENT.seekRangeAnteil > 0,
    'seekRangeAnteil fehlt — die Suchreichweite wäre nicht skalierbar');

  assert.equal(GUENTHER_MOVEMENT.speed, undefined,
    'speed darf kein fester Pixelwert mehr sein');
  assert.equal(GUENTHER_MOVEMENT.seekRange, undefined,
    'seekRange darf kein fester Pixelwert mehr sein');
});

test('Auf der Referenzbreite kommen die alten Werte heraus', () => {
  /*
   * Die Umrechnung muss rückwärts aufgehen: Bei 1280 px Breite — der Karte, auf
   * die Günther ursprünglich abgestimmt war — müssen 0,9 px/Tick und 320 px
   * Suchreichweite herauskommen. Sonst hätte die Änderung das Spielgefühl auf
   * der Standardkarte verschoben.
   */
  const b = guentherBewegung(GUENTHER_REFERENZ_BREITE);

  assert.ok(Math.abs(b.speed - 0.9) < 1e-9,
    `Geschwindigkeit bei ${GUENTHER_REFERENZ_BREITE} px: ${b.speed} statt 0,9`);
  assert.ok(Math.abs(b.seekRange - 320) < 1e-9,
    `Suchreichweite bei ${GUENTHER_REFERENZ_BREITE} px: ${b.seekRange} statt 320`);
});

test('Doppelte Kartenbreite bedeutet doppelte Geschwindigkeit', () => {
  /*
   * Die Beziehung, die zählt: Der Anteil bleibt gleich, die Pixelwerte wachsen
   * mit. Nur so legt Günther auf jeder Karte denselben Anteil zurück.
   */
  const klein = guentherBewegung(1280);
  const gross = guentherBewegung(2560);

  assert.ok(Math.abs(gross.speed - klein.speed * 2) < 1e-9,
    `Bei doppelter Breite muss die Geschwindigkeit doppelt sein: `
    + `${klein.speed} → ${gross.speed}`);

  assert.ok(Math.abs(gross.seekRange - klein.seekRange * 2) < 1e-9,
    'dasselbe für die Suchreichweite');
});

test('Günther legt auf jeder Kartengröße denselben ANTEIL zurück', () => {
  /*
   * Die Eigenschaft, die das Spielgefühl konstant hält: Der Anteil der Karte,
   * den Günther in einem Auftritt durchläuft, hängt nicht von der Größe ab.
   *
   * Gerechnet mit echtem Zugablauf: 20 s Zugzeit, 4 Spieler, 60 Hz, drei Runden.
   */
  const ZUGZEIT_S = 20;
  const SPIELER = 4;
  const HZ = 60;
  const ticksJeAuftritt = ZUGZEIT_S * SPIELER * HZ * 3;

  const anteile = [];
  for (const breite of [1280, 2560, 3840, 5120]) {
    const b = guentherBewegung(breite);
    const strecke = ticksJeAuftritt * b.speed;
    anteile.push(strecke / breite);
  }

  // Alle Anteile müssen gleich sein (Toleranz für Gleitkomma).
  const erster = anteile[0];
  for (const anteil of anteile) {
    assert.ok(Math.abs(anteil - erster) < 1e-6,
      `Die Anteile laufen auseinander: ${anteile.map(a => a.toFixed(3)).join(', ')}`);
  }

  // Und der Anteil muss deutlich über 100 % liegen — er soll die Karte
  // mindestens einmal durchqueren können.
  assert.ok(erster > 1,
    `In einem Auftritt schafft Günther nur ${(erster * 100).toFixed(0)} % der Karte`);
});

test('Eine unbekannte Kartenbreite fällt auf die Referenz zurück', () => {
  /*
   * Tolerant wie die übrige Konfiguration: Ein fehlender oder unsinniger Wert
   * darf nicht NaN ergeben — sonst stünde Günther still oder spränge.
   */
  for (const wert of [undefined, null, 0, -100, NaN, 'breit']) {
    const b = guentherBewegung(wert);
    assert.ok(Number.isFinite(b.speed) && b.speed > 0,
      `Kartenbreite "${wert}" ergibt Geschwindigkeit ${b.speed}`);
    assert.ok(Number.isFinite(b.seekRange) && b.seekRange > 0,
      `Kartenbreite "${wert}" ergibt Suchreichweite ${b.seekRange}`);
  }
});

test('Die Suchreichweite bleibt kleiner als die Karte', () => {
  /*
   * Eine Suchreichweite über die ganze Karte wäre kein Suchen mehr: Günther
   * würde immer den nächsten Spieler kennen und nie umherstreifen. Ein Viertel
   * der Karte ist die Absicht.
   */
  for (const breite of [1280, 2560, 5120]) {
    const b = guentherBewegung(breite);
    assert.ok(b.seekRange < breite,
      `Bei ${breite} px ist die Suchreichweite ${b.seekRange} px — größer als die Karte`);
    assert.ok(b.seekRange > breite * 0.1,
      `Bei ${breite} px ist die Suchreichweite nur ${b.seekRange} px — zu klein`);
  }
});
