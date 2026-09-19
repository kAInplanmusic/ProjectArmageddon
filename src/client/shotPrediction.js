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
 * Der Abschussweg (Konstanten, Integrationsschritt, Streckenabtastung) steht in
 * `src/shared/ballistics.js` — DERSELBEN Quelle, aus der auch der Motor
 * (`ProjectileSystem`), die Zielvorschau des MatchControllers und die Bot-KI
 * lesen. Eine eigene Kopie der Schleife wäre genau der Fehler, den die
 * Waffenwerte schon einmal hatten (`gravityScale` in Abschnitt 14 des
 * Codeaudits): Die Vorhersage zeigte dann eine Bahn, die die Waffe nicht fliegt.
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

import {
  POWER_TO_SPEED,
  PROJECTILE_DRAG,
  PROJECTILE_GRAVITY,
  simulateFlight,
} from '../shared/ballistics.js';

/*
 * Die Vorhersage liest ihre Konstanten aus der gemeinsamen Ballistik. Sie
 * bleiben hier als Namen erhalten, weil sie die öffentliche Schnittstelle
 * dieses Moduls sind (und weil `tests/shot-prediction.test.js` sie gegen die
 * Motorwerte stellt). Keiner dieser Namen trägt eine eigene ZAHL.
 */
/** Schwerkraft der Geschosse — identisch zu `ProjectileSystem`. */
export const PREDICTION_GRAVITY = PROJECTILE_GRAVITY;
/** Luftwiderstand je Tick — identisch zu `ProjectileSystem`. */
export const PREDICTION_DRAG = PROJECTILE_DRAG;
/**
 * Kraft → Geschwindigkeit. Identisch zu `POWER_TO_SPEED` im MatchController —
 * beide lesen dieselbe Konstante aus `src/shared/ballistics.js`.
 */
export const PREDICTION_POWER_TO_SPEED = POWER_TO_SPEED;
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

  const bahn = simulateFlight({
    x,
    y,
    angle,
    power,
    speedMultiplier,
    gravityScale,
    wind,
    steps: schritte,
    sampleEvery,
    isSolid,
    /*
     * Die Kartenränder werden ZUERST geprüft (wie bisher): Außerhalb der Karte
     * gibt es kein Terrain mehr, und eine Bahn, die aus dem Bild läuft, soll
     * dort enden. Deshalb endet sie oben (`minY: 0`) wie unten.
     */
    bounds: { minX: 0, maxX: width, minY: 0, maxY: height },
  });

  return {
    points: bahn.points,
    impact: bahn.impact,
    steps: bahn.steps,
    truncated: bahn.terminatedBy === 'steps',
  };
}

/*
 * Der Geschwindigkeitsfaktor stand früher hier. Er ist nach
 * `src/shared/launchSpeed.js` gewandert, weil ihn die Bot-KI (Server) und der
 * Motor ebenso brauchen. Der Name bleibt hier exportiert, damit die
 * öffentliche Schnittstelle dieses Moduls unverändert ist.
 */
export { launchSpeedMultiplier } from '../shared/launchSpeed.js';

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
