/**
 * Die EINE Ballistik des Spiels: Konstanten, Integrationsschritt, Segment-Strahl
 * und Vorwärtssimulation.
 *
 * ## Warum dieses Modul existiert
 *
 * Der Integrationsschritt (Gravitation, Wind, Drag, Position) stand vorher an
 * mehreren Stellen: im `ProjectileSystem` (der Motor), in `MatchController
 * .aimPreview`, in der clientseitigen Vorhersage (`shotPrediction.js`) und im
 * Geschütz-Pfad. Jede dieser Kopien konnte für sich verrutschen — und ist es
 * auch schon: Der Geschütz-Pfad las `currentStrength` statt `wind` und draggte
 * nur eine Achse (Befund in `tests/turret-ballistics.test.js`). Genau das ist
 * der Fehler, den die Recherche (`docs/recherche/npc-ki.md`, Punkt 4.1) als
 * ersten nennt: „Physik in eine einzige geteilte Funktion auslagern, die sowohl
 * Spiel als auch KI benutzt."
 *
 * Hier steht deshalb:
 *
 *  1. `integrateStep()` — EIN Tick Projektilphysik. Wer ein Projektil bewegt,
 *     ruft das hier auf. Es gibt keine zweite Fassung dieser vier Zeilen.
 *  2. `raycastSegment()` — der pixelgenaue Strahl entlang einer Flugstrecke
 *     gegen Terrain und Trefferfelder. Dieselbe Abtastung nutzt der Motor
 *     (`ProjectileSystem`) und die Vorausberechnung (Bot, Vorhersage).
 *  3. `simulateFlight()` — die Vorwärtssimulation eines ganzen Schusses. Sie
 *     ist die „Wahrheit" für Vorhersage und KI: `FORMEL = Startpunkt,
 *     SIMULATION = Wahrheit, SCORE = Auswahl` (Recherche, Punkt 4.3).
 *  4. Die drei Konstanten, aus denen alle Seiten lesen.
 *
 * ## Reihenfolge der Operationen ist Teil der Regel
 *
 * Der Motor rechnet in genau dieser Folge: erst Gravitation und Wind auf die
 * Geschwindigkeit, dann Drag auf BEIDE Achsen, dann Position. Wer die Folge
 * ändert, ändert die Bahn — auch wenn die Formel „gleich" aussieht. Deshalb
 * steht sie nur hier.
 *
 * ## Abgrenzung zu `src/engine/physics/ballistics.js`
 *
 * Dort liegt der Trefferstrahl für HITSCAN-Waffen (`computeTrajectory`,
 * `ccdRaycast`): gerade Linie, keine Gravitation. Das ist eine andere Aussage
 * über eine andere Sache und bleibt bestehen.
 *
 * Das Modul ist frei von Node-Builtins und von Engine-Importen — es läuft im
 * Browser wie im Server (`tests/source-boundaries.test.js`).
 *
 * @module ballistics
 */

/** Kraft in Geschwindigkeit (px/Tick je Krafteinheit). */
export const POWER_TO_SPEED = 0.14;
/** Schwerkraft je Tick auf ein Geschoss. */
export const PROJECTILE_GRAVITY = 0.32;
/** Luftwiderstand je Tick (Faktor auf beide Achsen). */
export const PROJECTILE_DRAG = 0.995;
/** Größte Zahl an Schritten einer Simulation (600 Ticks = 10 s bei 60 Hz). */
export const MAX_FLIGHT_STEPS = 600;
/**
 * Höchste Kraft, die ein Schuss haben kann.
 *
 * Sie steht im Client (`Math.min(100, …)`), in der Turmsteuerung und in der
 * Eingabevalidierung (`INPUT_LIMITS.powerMax`). Hier steht sie als Zahl, weil
 * die Simulation ihre Schranken kennen muss, um zu prüfen, was erreichbar ist.
 */
export const MAX_POWER = 100;

/**
 * EIN Integrationsschritt eines Geschosses.
 *
 * Reihenfolge und Vorzeichen sind die des `ProjectileSystem`:
 *
 *     vy += gravity * gravityScale
 *     vx += wind * windFactor
 *     vx *= drag
 *     vy *= drag
 *
 * Der Wind wirkt als konstante Beschleunigung (nicht als Geschwindigkeit) —
 * deshalb wird er VOR dem Drag addiert, wie im Motor.
 *
 * @param {object} schritt
 * @param {number} schritt.vx - Geschwindigkeit x
 * @param {number} schritt.vy - Geschwindigkeit y
 * @param {number} [schritt.gravity] - Schwerkraft je Tick
 * @param {number} [schritt.gravityScale=1] - Waffenfaktor (schwere Waffe > 1)
 * @param {number} [schritt.wind=0] - Wind im Matchzustand
 * @param {number} [schritt.windFactor=1] - Waffenfaktor auf den Wind
 * @param {number} [schritt.drag] - Luftwiderstand je Tick
 * @returns {{vx:number, vy:number}} die neue Geschwindigkeit
 */
export function integrateStep({
  vx, vy,
  gravity = PROJECTILE_GRAVITY,
  gravityScale = 1,
  wind = 0,
  windFactor = 1,
  drag = PROJECTILE_DRAG,
} = {}) {
  /*
   * `gravityScale || 1` und `windFactor === 0 ? 1 : windFactor` sind KEINE
   * Kosmetik: Der Motor liest diese Felder aus Komponenten
   * (`world.getComponent(...)`), und ein nicht gesetztes Feld kommt dort als 0
   * oder `undefined` zurück. Beide Male meint 0 „nicht gesetzt" und bedeutet
   * Faktor 1. Wer das hier „aufräumt", lässt Geschosse ohne Windfaktor still
   * geradeaus fliegen.
   */
  const skala = gravityScale || 1;
  const windFaktor = (windFactor === 0 || windFactor === null || windFactor === undefined) ? 1 : windFactor;
  const neuesVy = (vy + gravity * skala) * drag;
  const neuesVx = (vx + (wind || 0) * windFaktor) * drag;
  return { vx: neuesVx, vy: neuesVy };
}

/**
 * Anfangsgeschwindigkeit eines Schusses.
 *
 * `power * POWER_TO_SPEED * speedMultiplier` — dieselbe Rechnung wie
 * `MatchController.#launchVector`. Der Winkel wird gegen die Bildschirmachse
 * gemessen: 0 = rechts, π/2 = oben. Deshalb ist `vy` negativ.
 *
 * @param {object} schuss
 * @param {number} schuss.angle - Winkel im Bogenmaß
 * @param {number} schuss.power - Kraft 0..100
 * @param {number} [schuss.speed=null] - fertige Geschwindigkeit; überschreibt
 *   `power * POWER_TO_SPEED * speedMultiplier` (für aufgelöste Schüsse wie den
 *   Luftangriff, der nicht aus der Kraft entsteht)
 * @param {number} [schuss.speedMultiplier=1] - Klassen-, Archetyp- und
 *   Waffenfaktor zusammen
 * @returns {{vx:number, vy:number, speed:number}}
 */
export function launchVelocity({ angle, power, speed = null, speedMultiplier = 1 }) {
  const v = speed === null || speed === undefined ? power * POWER_TO_SPEED * speedMultiplier : speed;
  return { vx: Math.cos(angle) * v, vy: -Math.sin(angle) * v, speed: v };
}

/**
 * Pixelgenauer Strahl entlang einer Flugstrecke eines Ticks.
 *
 * Die Abtastung ist die des `ProjectileSystem.#raycast`: Die Strecke wird in
 * Schritten von höchstens einem Pixel Länge abgetastet, damit ein schnelles
 * Geschoss nicht durch eine ein Pixel dicke Terrainwand tunnelt. Je Abtastpunkt
 * gilt: erst Trefferfelder, dann festes Terrain.
 *
 * @param {number} startX
 * @param {number} startY
 * @param {number} endX
 * @param {number} endY
 * @param {object} [pruefer]
 * @param {(x:number,y:number)=>boolean} [pruefer.isSolid] - festes Terrain
 * @param {(x:number,y:number)=>any} [pruefer.hitTest] - Trefferfeld; ein
 *   Wahrheitswert beendet den Strahl und wird als `hit` zurückgegeben
 * @returns {{x:number,y:number,hit:any,terrain:boolean}|null} `null`, wenn die
 *   Strecke frei ist
 */
export function raycastSegment(startX, startY, endX, endY, { isSolid = null, hitTest = null } = {}) {
  const abstand = Math.max(Math.abs(endX - startX), Math.abs(endY - startY));
  const abtastungen = Math.max(1, Math.ceil(abstand));
  let letzterX = startX;
  let letzterY = startY;

  for (let i = 1; i <= abtastungen; i += 1) {
    const anteil = i / abtastungen;
    const x = startX + (endX - startX) * anteil;
    const y = startY + (endY - startY) * anteil;

    if (hitTest) {
      const treffer = hitTest(x, y);
      if (treffer) return { x, y, hit: treffer, terrain: false };
    }
    if (isSolid && isSolid(Math.floor(x), Math.floor(y))) {
      return { x, y, hit: null, terrain: true };
    }
    letzterX = x;
    letzterY = y;
  }

  /*
   * Segmentfallback für den unwahrscheinlichen Fall eines Sprungs: Der
   * Endpunkt liegt im Festen, ohne dass ein Abtastpunkt ihn traf. Dann meldet
   * der Strahl den letzten freien Punkt — genau wie im Motor.
   */
  if (isSolid && isSolid(Math.floor(endX), Math.floor(endY))) {
    return { x: letzterX, y: letzterY, hit: null, terrain: true };
  }
  return null;
}

/**
 * Vorwärtssimulation eines ganzen Schusses gegen das echte Terrain.
 *
 * @param {object} optionen
 * @param {number} optionen.x - Mündungspunkt
 * @param {number} optionen.y
 * @param {number} optionen.angle - Winkel im Bogenmaß
 * @param {number} optionen.power - Kraft
 * @param {number} [optionen.speed] - feste Geschwindigkeit statt Kraft
 * @param {number} [optionen.speedMultiplier=1]
 * @param {number} [optionen.gravity]
 * @param {number} [optionen.gravityScale=1]
 * @param {number} [optionen.wind=0]
 * @param {number} [optionen.windFactor=1]
 * @param {number} [optionen.drag]
 * @param {number} [optionen.steps] - Höchstzahl der Schritte
 * @param {number} [optionen.sampleEvery=1] - jeder n-te Bahnpunkt wird
 *   übernommen (die Bahn ist sonst zu fein zum Zeichnen)
 * @param {boolean} [optionen.includeStart=true] - ob der Startpunkt
 *   (Mündung) selbst im Ergebnis steht. `aimPreview` setzt das auf `false`:
 *   Seine Bahn beginnt mit dem ersten Schritt, und Aufrufer lesen `punkte[0]`
 *   als „erster Schritt" (siehe `tests/sidegrades-match.test.js`). Eine
 *   Änderung dort wäre eine stille Änderung der öffentlichen Schnittstelle.
 * @param {(x:number,y:number)=>boolean} [optionen.isSolid=null]
 * @param {(x:number,y:number)=>any} [optionen.hitTest=null] - Trefferfelder
 *   (Figuren). Ein Treffer beendet die Bahn und steht als `hit` im Ergebnis.
 * @param {{minX?:number,maxX?:number,minY?:number,maxY?:number}|null}
 *   [optionen.bounds=null] - Kartenränder; das Verlassen beendet die Bahn
 * @param {boolean} [optionen.exact=true] - `true` tastet die Strecke
 *   pixelgenau ab (wie der Motor). `false` prüft nur das Schrittende — billiger,
 *   aber es kann eine dünne Wand übersehen; nur für Grobsuchen gedacht.
 * @returns {{points:{x:number,y:number}[], impact:{x:number,y:number}|null,
 *   hit:any, steps:number, terminatedBy:string|null}}
 *   `terminatedBy`: `'terrain'`, `'hit'`, `'bounds'`, `'steps'` oder `null`
 */
export function simulateFlight(optionen = {}) {
  const {
    x, y, angle, power,
    speed = null,
    speedMultiplier = 1,
    gravity = PROJECTILE_GRAVITY,
    gravityScale = 1,
    wind = 0,
    windFactor = 1,
    drag = PROJECTILE_DRAG,
    steps = MAX_FLIGHT_STEPS,
    sampleEvery = 1,
    includeStart = true,
    isSolid = null,
    hitTest = null,
    bounds = null,
    exact = true,
  } = optionen;

  const start = launchVelocity({ angle, power, speed, speedMultiplier });
  let vx = start.vx;
  let vy = start.vy;
  let px = x;
  let py = y;

  const punkte = includeStart ? [{ x: px, y: py }] : [];
  /** Übernimmt einen Punkt, ohne ihn doppelt zu führen. */
  const merke = (punkt) => {
    const letzter = punkte[punkte.length - 1];
    if (letzter && letzter.x === punkt.x && letzter.y === punkt.y) return;
    punkte.push(punkt);
  };

  const abtastung = Math.max(1, Math.round(sampleEvery));
  const schritte = Math.max(1, Math.round(steps));

  for (let schritt = 0; schritt < schritte; schritt += 1) {
    const naechsteGeschwindigkeit = integrateStep({ vx, vy, gravity, gravityScale, wind, windFactor, drag });
    vx = naechsteGeschwindigkeit.vx;
    vy = naechsteGeschwindigkeit.vy;

    const vonX = px;
    const vonY = py;
    const zielX = vonX + vx;
    const zielY = vonY + vy;

    const treffer = (exact && (isSolid || hitTest))
      ? raycastSegment(vonX, vonY, zielX, zielY, { isSolid, hitTest })
      : null;
    const grobTreffer = !treffer && !exact
      ? grobPruefen(vonX + vx, vonY + vy, { isSolid, hitTest })
      : null;
    const aufprall = treffer ?? grobTreffer;

    if (aufprall) {
      /*
       * Die Bahn endet am AUFPRALLPUNKT, nicht am Schrittende. Der Unterschied
       * ist die Tick-Diskretisierung: Bei Kraft 100 legt ein Tick rund 14 px
       * zurück, und genau diese Breite war der „Bodensatz"-Fehler der Recherche
       * (Punkt 1.5). Der interpolierte Punkt ist derselbe, den der Motor als
       * Treffer meldet.
       */
      const punkt = { x: aufprall.x, y: aufprall.y };
      merke(punkt);
      return {
        points: punkte,
        impact: punkt,
        hit: aufprall.hit ?? null,
        steps: schritt + 1,
        terminatedBy: aufprall.hit ? 'hit' : 'terrain',
      };
    }

    px = zielX;
    py = zielY;
    if (schritt % abtastung === 0) merke({ x: px, y: py });

    if (bounds && (px < bounds.minX || px > bounds.maxX || py < bounds.minY || py > bounds.maxY)) {
      merke({ x: px, y: py });
      return {
        points: punkte,
        impact: { x: px, y: py },
        hit: null,
        steps: schritt + 1,
        terminatedBy: 'bounds',
      };
    }
  }

  return { points: punkte, impact: null, hit: null, steps: schritte, terminatedBy: 'steps' };
}

/** Terrain-/Trefferprüfung ohne Streckenabtastung (Grobsuche). */
function grobPruefen(x, y, { isSolid, hitTest }) {
  if (hitTest) {
    const treffer = hitTest(x, y);
    if (treffer) return { x, y, hit: treffer, terrain: false };
  }
  if (isSolid && isSolid(Math.floor(x), Math.floor(y))) return { x, y, hit: null, terrain: true };
  return null;
}

export default { integrateStep, launchVelocity, raycastSegment, simulateFlight };
