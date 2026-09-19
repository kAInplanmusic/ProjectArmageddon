/**
 * Die EINE Regel für die Abschussgeschwindigkeit eines Schusses.
 *
 * ## Warum diese Datei existiert
 *
 * „Wie schnell fliegt dieser Schuss?" wurde an drei Stellen beantwortet:
 * inline in `MatchController.#launchVector` (der echte Schuss), in der
 * clientseitigen Vorhersage (`shotPrediction.js`) und — beim Umbau der Bot-KI —
 * gebraucht vom Server. Drei Lesestellen derselben Verrechnung sind genau die
 * Doppelregel, die dieses Projekt schon mehrfach teuer bezahlt hat: Wer die
 * Klassenbalance ändert, muss alle drei finden.
 *
 * Die Verrechnung selbst bleibt in `combatProfile()` (`config/classes.js`) —
 * dort steht die Balance. Hier steht nur, WIE sie auf einen Schuss angewandt
 * wird: Klassenfaktor × Archetyp-Faktor × Sidegrade × Waffenfaktor.
 *
 * ## Die Falle, die hier bereits zugeschnappt ist
 *
 * `classId`/`archetypeId` sind in `MatchController` INDIZES, in `combatProfile`
 * aber NAMEN. Wer den Index unkonvertiert weitergibt, bekommt keinen Fehler,
 * sondern still das Rückfall-Profil (Faktor 0,6417 für JEDE Klasse) — die
 * Klassen wären damit wirkungslos. Deshalb wird hier anhand des TYPS
 * entschieden: Zahl = Index, Zeichenkette = Name. `tests/shot-prediction.test.js`
 * hält den Unterschied fest.
 *
 * @module launchSpeed
 */

import { combatProfile, CLASS_IDS, ARCHETYPE_IDS } from './config/classes.js';
import { geschwindigkeitsFaktor } from './reichweite.js';

/**
 * Geschwindigkeitsfaktor eines Schusses aus Klasse, Archetyp, Waffe — und der
 * Karte.
 *
 * ## Warum die Karte hier hineingehört (FUND 2026-09-19)
 *
 * Der Kartenfaktor stand zuletzt NEBEN dieser Funktion an jeder Aufrufstelle:
 * im Motor, im Bot und in der Client-Vorhersage. Genau so entstand der Fehler,
 * den `tests/reichweite-konsistenz.test.js` jetzt festhält — der Spielerschuss
 * vergaß ihn, das Geschütz nicht, und beide hielten sich für richtig.
 *
 * Wer die Kartenbreite kennt, gibt sie hier mit. Dann gibt es nur EINEN Weg zu
 * einer Abschussgeschwindigkeit, und Vergessen ist keine Option mehr.
 *
 * @param {object} optionen
 * @param {number|string|null} [optionen.classId] - Index ODER Name
 * @param {number|string|null} [optionen.archetypeId] - Index ODER Name
 * @param {object|null} [optionen.weapon] - Waffeneintrag aus dem Katalog
 * @param {string|null} [optionen.sidegradeId] - Kennung des Sidegrades; muss
 *   mitgegeben werden, sobald einer gewählt ist, sonst fliegt die Rechnung mit
 *   dem Standardprofil
 * @param {number|null} [optionen.kartenbreite] - Breite der Karte in Pixeln.
 *   Fehlt sie, wird OHNE Kartenskalierung gerechnet (Faktor 1) — das ist nur
 *   für Rechnungen richtig, die keine Karte kennen.
 * @returns {number} Faktor, mit dem `power * POWER_TO_SPEED` multipliziert wird
 */
export function launchSpeedMultiplier({
  classId = null, archetypeId = null, weapon = null, sidegradeId = null, kartenbreite = null,
} = {}) {
  const klasse = typeof classId === 'number' ? CLASS_IDS[classId] : classId;
  const archetyp = typeof archetypeId === 'number' ? ARCHETYPE_IDS[archetypeId] : archetypeId;
  // Der Sidegrade geht in dieselbe Verrechnung — nicht als eigene Multiplikation
  // hier, sonst stünde die Regel an zwei Stellen.
  const profil = combatProfile(klasse, archetyp, sidegradeId);
  const karte = Number.isFinite(kartenbreite) && kartenbreite > 0
    ? geschwindigkeitsFaktor(kartenbreite)
    : 1;
  return profil.launchSpeedMultiplier * (weapon?.speedFactor ?? 1) * karte;
}

export default launchSpeedMultiplier;
