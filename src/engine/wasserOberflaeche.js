/**
 * Oberfläche und Wasserstand — Abfragen über eine Quelle.
 *
 * ## Warum dieses Modul existiert
 *
 * `surfaceYAt` (mit seinem Spalten-Merker), `waterLevelAt`, `setWaterLevelAt` und
 * `floodArea` standen samt langen Begründungen in `MatchController`. Das Modul
 * folgt dem Muster von `turret.js`/`kistenWurf.js`: Die Wasserfunktionen lesen
 * eine **Quelle**; der Spalten-Merker ist eine kleine Klasse, die ihren Zustand
 * selbst hält. Das Match behält die öffentlichen Methoden als Einzeiler.
 *
 * ## Die Quelle der Wasserfunktionen
 *
 *   water                         - das `WaterField` (oder `null`)
 *   width, height                 - Kartenmaße in Weltpixeln
 *   skala                         - Kantenlänge einer Wasserzelle (`WATER_SCALE` in `match.js`)
 *   waterLevelAt(x, y)            - nur für `flutBereich`: die öffentliche Abfrage des Matches
 *   setWaterLevelAt(x, y, level)  - nur für `flutBereich`: das öffentliche Setzen
 *
 * @module wasserOberflaeche
 */
import { clampWaterLevel } from '../shared/config/water.js';

/** Marke im Oberflächen-Cache: Spalte noch nicht abgetastet. */
const OBERFLAECHE_UNBEKANNT = -2;

/**
 * Merker der Oberflächenhöhe je Spalte.
 *
 * Gilt, solange sich die Maske nicht ändert (`version`); jede Änderung verwirft
 * ihn ganz.
 */
export class OberflaechenCache {
  /** Oberflächenhöhe je Spalte (`OBERFLAECHE_UNBEKANNT` = noch nicht gesucht). */
  #hoehe;
  /** `version` der Maske, zu der der Merker gehört. */
  #version = -1;
  #breite;

  constructor(breite) {
    this.#breite = breite;
    this.#hoehe = new Int32Array(breite).fill(OBERFLAECHE_UNBEKANNT);
  }

  /**
   * Die Oberfläche, wie sie JETZT ist — aus der Kollisionsmaske `terrain`.
   *
   * @returns {number} Höhe der obersten festen Zeile; -1 bei ungültiger Spalte
   */
  hoeheAn(terrain, x) {
    /*
     * Die Oberfläche, wie sie JETZT ist — aus der Kollisionsmaske, nicht aus der
     * Karte des Aufbaus.
     *
     * FUND (belegt, Audit 2026-10-09, zuerst falsch eingeordnet): Hier stand die
     * Suche in `#bitmap`, der Karte AUS DEM AUFBAU. Krater gehen aber nur in die
     * Maske (`#terrain`); die Bitmap bleibt unverändert. Folge: Alles, was sich an
     * der Oberfläche ausrichtet, sah Boden, den ein Krater längst entfernt hatte.
     * Gemessen: bei 9 Einschlägen lag `surfaceYAt` in 7 Kratermitten bis zu 20 px
     * über dem echten Boden; eine Kiste, die über einem Krater (r = 40) landete,
     * blieb 41 px über dem Boden in der Luft stehen und war 300 Ticks später noch
     * dort (die Physik überspringt Kisten). Dasselbe gilt für Günther (läuft auf
     * dieser Höhe), die Bahnplanung der Geschütze, das Versetzen von Figuren und
     * den Kistenabwurf einer Runde.
     *
     * Die Höhe je Spalte wird gemerkt. Der Merker gilt, solange sich die Maske nicht
     * ändert (`version`); jede Änderung (Krater, Mahlstrom) verwirft ihn ganz —
     * Änderungen sind selten (ein Einschlag, eine Runde), Abfragen sehr häufig (die
     * Geschützsuche fragt zigtausendmal, siehe Tick-Spitzen 25–38 ms).
     */
    if (this.#version !== terrain.version) {
      this.#hoehe.fill(OBERFLAECHE_UNBEKANNT);
      this.#version = terrain.version;
    }
    const spalte = Math.max(0, Math.min(this.#breite - 1, Math.floor(x)));
    if (Number.isNaN(spalte)) return -1;
    let boden = this.#hoehe[spalte];
    if (boden === OBERFLAECHE_UNBEKANNT) {
      boden = terrain.topSolidY(spalte);
      this.#hoehe[spalte] = boden;
    }
    return boden;
  }
}

/**
 * Füllstand des Wassers an einer Weltposition (0..1).
 *
 * Die Abfrage stand vorher an zwei Stellen inline (Abwurf und Figurenphysik)
 * — mit unterschiedlichen Ersatzwegen, falls das Feld die Methode nicht
 * anbietet. Hier gebündelt, damit die Anzeige denselben Wert sieht wie die
 * Simulation.
 */
export function wasserstandAn(q, worldX, worldY) {
  if (!q.water) return 0;
  const x = Math.max(0, Math.min(q.width - 1, worldX ?? 0));
  const y = Math.max(0, Math.min(q.height - 1, worldY ?? 0));
  const roh = typeof q.water.levelAtWorld === 'function'
    ? q.water.levelAtWorld(x, y)
    : q.water.getLevel(Math.floor(x), Math.floor(y));
  return clampWaterLevel(roh);
}

/**
 * Setzt den Wasserstand an einer Weltposition (Gegenstück zu `waterLevelAt`).
 *
 * Gedacht für Tests, Kulissenbau und Diagnose: Wassertiefe ist sonst nur über
 * das interne Raster erreichbar, was jede Prüfung an die Rasterrechnung
 * koppelt. Die Zelle wird begrenzt, außerhalb der Karte passiert nichts.
 *
 * @returns {boolean} true, wenn der Wert gesetzt wurde
 */
export function setzeWasserstandAn(q, worldX, worldY, level) {
  if (!q.water) return false;
  const zelle = typeof q.water.toGrid === 'function'
    ? q.water.toGrid(worldX, worldY)
    : { x: Math.floor(worldX / q.skala), y: Math.floor(worldY / q.skala) };
  if (!Number.isFinite(zelle.x) || !Number.isFinite(zelle.y)) return false;
  if (zelle.x < 0 || zelle.x >= q.water.width) return false;
  if (zelle.y < 0 || zelle.y >= q.water.height) return false;
  q.water.setLevel(zelle.x, zelle.y, clampWaterLevel(level));
  return true;
}

/**
 * Flutet einen kleinen Bereich um einen Punkt.
 *
 * ## Warum nicht eine einzelne Zelle
 *
 * Fund (belegt): Ein Wasserschub, der genau eine Zelle flutet, wirkt für die
 * Anzeige NICHT. Das Wasserfeld ist ein Raster aus 4 px großen Zellen
 * (q.skala), und zwei Dinge fallen auseinander:
 *
 *   - Der Zustand einer Figur liest `waterLevelAt(figur.x, figur.y)` — die
 *     MITTE der Figur.
 *   - Die Figur steht auf `Boden - HALF_HEIGHT` (10 px), ihr Fuß also zehn
 *     Pixel unter der abgefragten Stelle.
 *
 * Bei 4-px-Zellen liegen Zentrum und Fuß in verschiedenen Zellen. Wird nur die
 * Bodenzelle geflutet, meldet der Zustand weiter 0 — und die Ertrinkgefahr im
 * CharacterSystem greift nie. Gemessen: `waterLevelAt(600, 420)` = 0,5,
 * `state.waterLevel` = 0.
 *
 * Deshalb wird ein Bereich geflutet, der Zentrum UND Fuß abdeckt. Der Bereich
 * ist bewusst klein (Standard: 16 × 20 px): Es soll ein Wasserloch entstehen,
 * kein See.
 *
 * Der vorhandene Füllstand wird nie verringert — mehrfaches Treffen macht die
 * Stelle tiefer, ein Schuss in trockenes Gelände hebt sie auf das Niveau der
 * Waffe.
 *
 * @param {number} worldX
 * @param {number} worldY - Bezugspunkt (Mitte der Figur)
 * @param {number} level - Ziel-Füllstand
 * @param {object} [optionen]
 * @returns {{zellen:number, hoechster:number}} geflutete Zellen und Höchststand
 */
export function flutBereich(q, worldX, worldY, level, { radiusX = 8, radiusY = 10 } = {}) {
  if (!q.water) return { zellen: 0, hoechster: 0 };
  let zellen = 0;
  let hoechster = 0;
  for (let dx = -radiusX; dx <= radiusX; dx += q.skala) {
    for (let dy = -radiusY; dy <= radiusY; dy += q.skala) {
      const x = worldX + dx;
      const y = worldY + dy;
      const vorher = q.waterLevelAt(x, y);
      const ziel = clampWaterLevel(Math.max(vorher, level));
      if (ziel > vorher && q.setWaterLevelAt(x, y, ziel)) zellen += 1;
      if (ziel > hoechster) hoechster = ziel;
    }
  }
  return { zellen, hoechster };
}
