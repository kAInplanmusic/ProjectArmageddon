/**
 * Clientseitige Vorhersage des eigenen Schusses.
 *
 * Warum es dieses Modul gibt
 * --------------------------
 * Der Server ist autoritativ: Ein Schuss wird erst sichtbar, wenn der Server
 * ihn bestätigt — bei 60 ms Latenz also rund 120 ms nach dem Klick plus die
 * Wartezeit bis zum nächsten Snapshot (50 ms). Zusammen mit der Bildrate fühlt
 * sich der eigene Schuss dadurch verzögert an, obwohl Eingabe und Simulation
 * lokal längst fertig sind.
 *
 * Die Vorhersage schließt diese Lücke NICHT, indem sie den Server ersetzt,
 * sondern indem sie die Bahn sofort zeichnet und sie danach durch die
 * Serverwahrheit ERSETZT (Rollback). Damit gilt weiterhin:
 *
 *  - Es gibt keine Client-Autorität. Der Server entscheidet weiterhin, ob der
 *    Schuss gültig war, welche Waffe verbraucht wurde und was getroffen wurde.
 *  - Die Vorhersage ist rein ANZEIGEND. Sie verändert keinen Spielzustand,
 *    sendet nichts und trifft keine Entscheidung.
 *
 * Sie ist deshalb bewusst als eigenes Modul gebaut und nicht in den Renderer
 * eingewoben: Die Rechnung („welche Bahn ergibt Winkel und Kraft?") ist
 * prüfbar, während die Darstellung es nicht ist.
 *
 * Rechenweg
 * ---------
 * Dieselben Konstanten und dieselbe Schleife wie `MatchController.aimPreview`
 * bzw. das `ProjectileSystem`: Schwerkraft, Wind, Luftwiderstand, Abbruch beim
 * ersten festen Pixel. Beide Seiten rechnen mit denselben Zahlen; würde hier
 * ein eigener Satz stehen, zeigte die Vorhersage eine Bahn, die die Waffe nicht
 * fliegt — genau der Fehler, den die Waffenwerte schon einmal hatten
 * (`gravityScale` in Abschnitt 14 des Codeaudits).
 *
 * Bewusste Grenzen
 * ----------------
 *  - Treffer werden NICHT vorhergesagt. Wer getroffen wurde, hängt von
 *    Zuständen ab (Schild, Rüstung, Schaden über Zeit), die im Besitz des
 *    Servers sind. Die Vorhersage zeigt den Weg, nicht das Ergebnis.
 *  - Für Waffen ohne Geschoss (Selbstwirkung) gibt es keine Bahn; sie liefern
 *    eine leere Vorhersage. Das ist kein Fehler, sondern die richtige Antwort.
 *
 * @module shotPrediction
 */

import { combatProfile, CLASS_IDS, ARCHETYPE_IDS } from '../shared/config/classes.js';

/** Schwerkraft der Geschosse — identisch zu `ProjectileSystem`. */
export const PREDICTION_GRAVITY = 0.32;
/** Luftwiderstand je Tick — identisch zu `ProjectileSystem`. */
export const PREDICTION_DRAG = 0.995;
/**
 * Kraft → Geschwindigkeit. Identisch zu `POWER_TO_SPEED` im MatchController.
 * Der Faktor ist dort eine private Konstante; hier steht er als geteilter
 * Export, und ein Test vergleicht beide Werte gegen die Quelldatei.
 */
export const PREDICTION_POWER_TO_SPEED = 0.14;
/** Größte Zahl an Schritten, die eine Vorhersage rechnet (5 s bei 60 Hz). */
export const MAX_PREDICTION_STEPS = 300;

/**
 * Ballistische Bahn eines Schusses.
 *
 * @param {object} optionen
 * @param {number} optionen.x - Mündungspunkt (Weltkoordinate)
 * @param {number} optionen.y
 * @param {number} optionen.angle - Winkel im Bogenmaß
 * @param {number} optionen.power - Kraft 0..100
 * @param {number} [optionen.speedMultiplier=1] - Klassen-/Waffenfaktor zusammen
 * @param {number} [optionen.gravityScale=1] - Schwerkraftfaktor der Waffe
 * @param {number} [optionen.wind=0] - Wind im Matchzustand
 * @param {number} [optionen.width=Infinity] - Kartenbreite (Abbruchgrenze)
 * @param {number} [optionen.height=Infinity] - Kartenhöhe
 * @param {number} [optionen.steps] - Höchstzahl der Schritte
 * @param {(x:number,y:number)=>boolean} [optionen.isSolid=null] - Terrainprüfung.
 *   Fehlt sie, endet die Bahn nur an den Kartengrenzen — dann ist sie eine
 *   reine Flugkurve ohne Einschlag. Das ist der Fall, wenn ein Client das
 *   Terrain noch nicht rekonstruiert hat.
 * @param {number} [optionen.sampleEvery=3] - jeder n-te Punkt wird übernommen
 * @returns {{points:{x:number,y:number}[], impact:{x:number,y:number}|null,
 *   steps:number, truncated:boolean}} `truncated` heißt: Die Bahn endete am
 *   Schrittlimit, ohne einzuschlagen.
 */
export function predictTrajectory({
  x,
  y,
  angle,
  power,
  speedMultiplier = 1,
  gravityScale = 1,
  wind = 0,
  width = Infinity,
  height = Infinity,
  steps = MAX_PREDICTION_STEPS,
  isSolid = null,
  sampleEvery = 3,
} = {}) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return { points: [], impact: null, steps: 0, truncated: false };
  }
  if (!Number.isFinite(angle) || !Number.isFinite(power)) {
    return { points: [], impact: null, steps: 0, truncated: false };
  }
  const schritte = Math.max(1, Math.min(MAX_PREDICTION_STEPS, Math.round(steps)));
  const abstand = Math.max(1, Math.round(sampleEvery));

  const speed = power * PREDICTION_POWER_TO_SPEED * speedMultiplier;
  let vx = Math.cos(angle) * speed;
  let vy = -Math.sin(angle) * speed;
  let px = x;
  let py = y;
  const points = [{ x: px, y: py }];

  for (let step = 0; step < schritte; step++) {
    vy += PREDICTION_GRAVITY * gravityScale;
    vx += wind;
    vx *= PREDICTION_DRAG;
    vy *= PREDICTION_DRAG;
    px += vx;
    py += vy;

    if (step % abstand === 0) points.push({ x: px, y: py });

    // Kartenränder zuerst: außerhalb der Karte gibt es kein Terrain mehr, und
    // eine Bahn, die aus dem Bild läuft, soll dort enden.
    if (px < 0 || px > width || py > height || py < 0) {
      points.push({ x: px, y: py });
      return { points, impact: { x: px, y: py }, steps: step + 1, truncated: false };
    }
    if (typeof isSolid === 'function' && isSolid(Math.floor(px), Math.floor(py))) {
      points.push({ x: px, y: py });
      return { points, impact: { x: px, y: py }, steps: step + 1, truncated: false };
    }
  }

  return { points, impact: null, steps: schritte, truncated: true };
}

/**
 * Geschwindigkeitsfaktor eines Schusses aus Klasse, Archetyp und Waffe.
 *
 * Dieselbe Verrechnung wie `MatchController.#launchVector`. Sie steht hier
 * getrennt, damit die Vorhersage sie nutzen kann, ohne den MatchController zu
 * besitzen — im Online-Modus gibt es keinen lokalen Match, aus dem man sie
 * ziehen könnte.
 *
 * @param {object} optionen
 * @param {number|null} [optionen.classId]
 * @param {number|null} [optionen.archetypeId]
 * @param {object|null} [optionen.weapon] - Waffeneintrag aus dem Katalog
 * @param {string|null} [optionen.sidegradeId] - Kennung des Sidegrades. Muss
 *   mitgegeben werden, sobald der Spieler einen gewählt hat: Das Sidegrade
 *   verändert die Abschussgeschwindigkeit, und ohne es zeigte die Vorhersage
 *   eine Bahn, die der Server anders rechnet.
 * @returns {number} Faktor, mit dem `power * PREDICTION_POWER_TO_SPEED`
 *   multipliziert wird
 */
export function launchSpeedMultiplier({
  classId = null, archetypeId = null, weapon = null, sidegradeId = null,
} = {}) {
  /*
   * `classId`/`archetypeId` sind INDIZES, keine Namen.
   *
   * Fund (belegt): `MatchController` speichert `index % CLASS_IDS.length`, und
   * `CLASS_IDS` ist die Liste der NAMEN (`['scout','heavy','artillery']`). Im
   * Motor wird deshalb durchgehend konvertiert (`CLASS_IDS[classId]`), bevor
   * `combatProfile` aufgerufen wird.
   *
   * Wer den Index unkonvertiert weitergibt, bekommt kein Ergebnis, sondern
   * STILL den Rückfall: `combatProfile(0, 0)` sucht `CLASS_DEFINITIONS[0]`,
   * findet nichts (die Schlüssel heißen 'scout', 'heavy', 'artillery') und
   * liefert für JEDE Klasse dasselbe Profil. Gemessen: Faktor 0,6417 für
   * Index 0, 1 und 2 — die Klassen waren damit wirkungslos.
   *
   * Genau dieser Fehler steckte im ersten Anlauf dieses Moduls. Er ist
   * unsichtbar, weil kein Wert fehlt und nichts wirft — nur die Zahlen sind
   * für alle gleich.
   *
   * Deshalb wird hier anhand des TYPS entschieden, nicht anhand eines
   * Bereichs: eine Zahl ist ein Index, eine Zeichenkette ist bereits ein Name.
   */
  const klasse = typeof classId === 'number' ? CLASS_IDS[classId] : classId;
  const archetyp = typeof archetypeId === 'number' ? ARCHETYPE_IDS[archetypeId] : archetypeId;
  // Der Sidegrade geht in dieselbe Verrechnung — nicht als eigene Multiplikation
  // hier, sonst stünde die Regel an zwei Stellen.
  const profil = combatProfile(klasse, archetyp, sidegradeId);
  return profil.launchSpeedMultiplier * (weapon?.speedFactor ?? 1);
}

/**
 * Verwaltet die Vorhersagen des eigenen Schusses.
 *
 * Lebenszyklus einer Vorhersage:
 *  1. Der Spieler feuert → `begin()` legt eine Vorhersage an (sofort sichtbar).
 *  2. Kurz darauf bestätigt oder verwirft der Server → `resolve()` bzw.
 *     `discard()`. Danach zählt wieder der Serverzustand.
 *  3. Kommt keine Antwort (Paketverlust), läuft sie nach `timeoutMs` aus.
 *
 * Die Klasse hält KEINE Simulationsdaten — nur die Anzeigebahn samt
 * Eingabewerten, damit ein Test die Vorhersage gegen die tatsächliche Bahn
 * stellen kann.
 */
export class ShotPredictor {
  #timeoutMs;
  #now;
  #aktuell = null;
  #zaehler = 0;
  #verlauf = [];

  /**
   * @param {object} [optionen]
   * @param {number} [optionen.timeoutMs=1000] - nach so langer Zeit ohne
   *   Serverantwort gilt die Vorhersage als erledigt. 1 s liegt deutlich über
   *   einem Roundtrip und darunter, dass eine hängende Bahn auffiele.
   * @param {() => number} [optionen.now] - Zeitquelle (für Tests injizierbar)
   */
  constructor({ timeoutMs = 1000, now = () => Date.now() } = {}) {
    this.#timeoutMs = timeoutMs;
    this.#now = now;
  }

  /** Läuft gerade eine unbestätigte Vorhersage? */
  get active() { return this.#aktuell !== null; }

  /** Die laufende Vorhersage (oder null). Nur zum Lesen gedacht. */
  get pending() { return this.#aktuell; }

  /** Wie viele Vorhersagen bestätigt bzw. verworfen wurden (Diagnose). */
  get stats() {
    const bestaetigt = this.#verlauf.filter(e => e.status === 'confirmed').length;
    const verworfen = this.#verlauf.filter(e => e.status === 'discarded').length;
    return {
      predictions: this.#verlauf.length,
      confirmed: bestaetigt,
      discarded: verworfen,
      timedOut: this.#verlauf.filter(e => e.status === 'timeout').length,
    };
  }

  /** Protokoll der abgeschlossenen Vorhersagen (neueste zuletzt). */
  get history() { return [...this.#verlauf]; }

  /**
   * Legt eine Vorhersage an.
   *
   * Eine noch laufende Vorhersage wird verworfen und als `superseded`
   * protokolliert: Ein zweiter Schuss im selben Zug ist laut Regelwerk nicht
   * möglich, und wenn doch einer ankommt, ist die neuere Eingabe die gültige.
   *
   * @returns {object} die angelegte Vorhersage
   */
  begin({ playerId, angle, power, weaponId = null, trajectory = null, tick = null } = {}) {
    if (this.#aktuell) this.#abschluss('superseded');
    this.#zaehler += 1;
    this.#aktuell = {
      id: this.#zaehler,
      playerId,
      angle,
      power,
      weaponId,
      tick,
      trajectory,
      startedAt: this.#now(),
    };
    return this.#aktuell;
  }

  /**
   * Bestätigt die laufende Vorhersage durch die Serverwahrheit.
   *
   * `truth` beschreibt, was der Server tatsächlich gerechnet hat — beim
   * Hitscan der Einschlagpunkt, beim Projektil der Startpunkt. Daraus entsteht
   * die Abweichung, die im Protokoll steht; liegen die Punkte auseinander,
   * war die Vorhersage falsch (z. B. weil sich das Terrain geändert hat).
   *
   * @param {{impact?:{x:number,y:number}|null}} [truth]
   * @returns {{status:'none'|'confirmed', deviation:number|null}}
   */
  resolve(truth = {}) {
    const laufend = this.#aktuell;
    if (!laufend) return { status: 'none', deviation: null };

    const erwartet = laufend.trajectory?.impact ?? null;
    const tatsaechlich = truth?.impact ?? null;
    let deviation = null;
    if (erwartet && tatsaechlich) {
      deviation = Math.hypot(erwartet.x - tatsaechlich.x, erwartet.y - tatsaechlich.y);
    }

    this.#abschluss('confirmed', { expected: erwartet, actual: tatsaechlich, deviation });
    return { status: 'confirmed', deviation };
  }

  /** Verwirft die laufende Vorhersage, weil der Server sie abgelehnt hat. */
  discard(grund = 'rejected') {
    if (!this.#aktuell) return { status: 'none' };
    this.#abschluss('discarded', { reason: grund });
    return { status: 'discarded' };
  }

  /**
   * Beendet abgelaufene Vorhersagen. Wird je Bild aufgerufen; der Zeitgeber ist
   * bewusst nachsichtig — eine zu spät aufgeräumte Bahn ist harmlos, eine zu
   * früh verschwundene dagegen sichtbar.
   *
   * @returns {boolean} true, wenn dabei etwas aufgeräumt wurde
   */
  expire() {
    if (!this.#aktuell) return false;
    if (this.#now() - this.#aktuell.startedAt < this.#timeoutMs) return false;
    this.#abschluss('timeout');
    return true;
  }

  /** Setzt alles zurück (Betriebsartwechsel, Matchende). */
  reset() {
    this.#aktuell = null;
    this.#verlauf = [];
    this.#zaehler = 0;
    return this;
  }

  #abschluss(status, extra = {}) {
    if (!this.#aktuell) return;
    this.#verlauf.push({
      id: this.#aktuell.id,
      playerId: this.#aktuell.playerId,
      weaponId: this.#aktuell.weaponId,
      angle: this.#aktuell.angle,
      power: this.#aktuell.power,
      status,
      durationMs: this.#now() - this.#aktuell.startedAt,
      ...extra,
    });
    if (this.#verlauf.length > 50) this.#verlauf.shift();
    this.#aktuell = null;
  }
}

/**
 * Stellt einem Zustand die laufende Vorhersage als Anzeigebahn bei.
 *
 * Bewusst eine reine Funktion und keine Methode am Renderer: Der Renderer
 * zeichnet, diese Funktion entscheidet, ob es etwas zu zeichnen gibt.
 *
 * @param {object|null} zustand - Ansichtszustand (aus currentState())
 * @param {ShotPredictor} predictor
 * @returns {{points:{x:number,y:number}[], impact:{x:number,y:number}|null}|null}
 */
export function pendingTrajectory(zustand, predictor) {
  if (!zustand || !predictor?.active) return null;
  const laufend = predictor.pending;
  // Eine Vorhersage für einen anderen Spieler wäre falsch: sie würde die Bahn
  // eines Gegners mit eigenen Werten zeichnen.
  if (laufend.playerId !== undefined && zustand.activePlayerId !== undefined
      && laufend.playerId !== zustand.activePlayerId) {
    return null;
  }
  return laufend.trajectory ?? null;
}

export default ShotPredictor;
