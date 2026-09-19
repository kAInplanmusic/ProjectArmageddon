/**
 * Bot-KI für nicht besetzte Lobby-Plätze.
 *
 * Der Bot nutzt exakt denselben Abschussweg wie ein Mensch: Er wählt Winkel und
 * Kraft und ruft `MatchController.fire()`. Dadurch bleibt er deterministisch und
 * kann nicht mehr als ein Client.
 *
 * ## Verfahren (Recherche: `docs/recherche/npc-ki.md`)
 *
 * Die alte Fassung schätzte den Winkel mit `atan2` und addierte Zufall — eine
 * grobe Heuristik ohne Bezug zum Gelände. Sie traf schlecht und aus dem falschen
 * Grund (sie kannte das Terrain nicht).
 *
 * Die neue Fassung arbeitet in drei Stufen (Punkte 4.3/4.4 der Recherche):
 *
 *  1. **Kandidaten aus (Winkel, Kraft) vorwärts simulieren** — mit der ECHTEN
 *     Ballistik (`src/shared/ballistics.js`, dieselbe Funktion wie der Motor)
 *     gegen das ECHTE Terrain (`terrain.isSolid`) und die ECHTEN Trefferfelder.
 *     Die Formel liefert nur den Startpunkt; die Simulation ist die Wahrheit.
 *     Simuliert wird ab der MÜNDUNG (`launchOrigin`) und nur so lange, wie das
 *     Geschoss lebt (`projectileLifetime`) — sonst plant der Bot Bögen, deren
 *     Geschoss mitten im Flug verfällt (Fund, siehe `#bewerte`).
 *  2. **Den besten Kandidaten verfeinern**: ein Muster-Suchlauf mit halbierten
 *     Schritten (Winkel/Kraft), bis die Auflösung weit unter der
 *     Tick-Diskretisierung liegt. Bewertet wird der AUFPRALLPUNKT, nicht der
 *     nächste Bahnpunkt — der „Bodensatz"-Fehler der Recherche (Punkt 1.4/1.5),
 *     bei dem ein Solver „residual 0.000" meldet und trotzdem 4,78 px daneben
 *     liegt. Der Aufprallpunkt wird auf der Strecke interpoliert.
 *  3. **Menschlichkeit** (Punkte 4.5/4.6): Zielwahl mit Temperatur (softmax),
 *     Gauss-Streuung auf Winkel und Kraft (Box-Muller, Exponent 1.5 auf
 *     `1 - skill`), plus rund 3 % „vertippt"-Aussetzer.
 *
 * ## Determinismus
 *
 * Der Suchlauf zieht KEINE Zufallszahlen — er ist eine reine Funktion des
 * Matchzustands. Aller Zufall kommt aus dem übergebenen `rng` (ein
 * `SeededRandom` des Matchs, siehe `MatchSeedManager.getSubRng`). Kein
 * `Math.random()`, kein `Date.now()`, keine Reihenfolge von `Map`-Einträgen.
 * Gleicher Seed und gleicher Matchzustand ergeben exakt denselben Schuss.
 *
 * ## Was dieses Modul NICHT tut
 *
 *  - **Keine Waffenwahl.** Der Bot schießt mit der Waffe, die der Platz führt
 *    (`inventory.getActiveWeaponId`). Eine eigene Waffenregel wäre eine zweite
 *    Balance-Regel neben dem Aufgebot — bewusst nicht gebaut (siehe Bericht).
 *  - **Keine Trefferprognose.** Ob ein Treffer Schaden macht, entscheidet der
 *    Motor (Schild, Rüstung, Effekte).
 *
 * @module BotController
 */

import {
  MAX_POWER,
  PROJECTILE_DRAG,
  PROJECTILE_GRAVITY,
  raycastSegment,
  simulateFlight,
} from '../shared/ballistics.js';
import { launchSpeedMultiplier } from '../shared/launchSpeed.js';
import { getWeapon } from '../shared/config/weapons.js';
import { PLAYER_HALF_HEIGHT, PLAYER_HALF_WIDTH } from '../engine/systems/projectileSystem.js';

/** Kleinster/größter Abschusswinkel eines Bot-Schusses. */
const MIN_ANGLE = 0.02;
const MAX_ANGLE = Math.PI - 0.02;
/**
 * Kleinste Kraft eines Bot-Schusses.
 *
 * Sie ist NICHT 0, obwohl die Eingabevalidierung 0 erlaubt: Ein Bot, der mit
 * Kraft 3 vor die eigenen Füße schießt, ist kein Anfänger, sondern kaputt. Die
 * Schranke steht hier und nicht im Motor — sie ist eine Eigenschaft des Bots.
 */
const MIN_POWER = 20;
/** Flachster und steilster Winkel des Suchlaufs (gemessen ab der Waagerechten). */
const SCAN_ANGLE_MIN = 5 * (Math.PI / 180);
const SCAN_ANGLE_MAX = 85 * (Math.PI / 180);
/** Zahl der Winkel bzw. Kräfte im Grobraster. */
const COARSE_ANGLES = 18;
const COARSE_POWERS = 9;
/** Startschrittweite des Verfeinerungslaufs und Zahl der Halbierungen. */
const REFINE_ANGLE_STEP = 0.05;
const REFINE_POWER_STEP = 8;
const REFINE_ROUNDS = 12;

/** Streuung bei Skill 0: etwa 5,2° auf den Winkel, 7 % auf die Kraft. */
const SIGMA_ANGLE = 0.09;
const SIGMA_POWER = 0.07;
/** Exponent der Skill-Kurve: `(1 - skill) ** 1.5` — überlinear, siehe Recherche. */
const SKILL_EXPONENT = 1.5;
/** Anteil der Schüsse, bei denen der Bot „sich vertippt". */
const SLIP_CHANCE = 0.03;
/** Mindestgröße eines Aussetzers — er darf auch einem sehr guten Bot passieren. */
const SLIP_MIN_ANGLE = 0.05;
const SLIP_MIN_POWER = 0.06;
/** Zuschlag auf den Fehler, wenn die Bahn eine eigene Einheit trifft. */
const FRIENDLY_ERROR = 1e6;
/** Fehlerwert, wenn die Bahn das Terrain gar nicht trifft. */
const NO_IMPACT_ERROR = 1e5;
/** Ab diesem Fehler sucht der Bot auch für die anderen Ziele (Sicherheitsnetz). */
const FALLBACK_ERROR = 120;

/** Normalverteilte Zahl aus dem übergebenen PRNG (Box-Muller). */
function gaussian(rng) {
  let u = 0;
  let v = 0;
  // `log(0)` wäre -Infinity: die beiden Null-Treffer aussortieren.
  while (u === 0) u = rng.next();
  while (v === 0) v = rng.next();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Die acht Nachbarrichtungen des Verfeinerungslaufs.
 *
 * Die REIHENFOLGE ist Teil der Regel: Ein Muster-Suchlauf nimmt das erste
 * gefundene bessere Feld, und „erstes" hängt an dieser Liste. Eine andere
 * Reihenfolge ergäbe bei gleichem Seed einen anderen Schuss.
 */
const NACHSCHARN = Object.freeze([
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [-1, -1], [1, -1], [-1, 1],
]);

function clamp(wert, min, max) {
  if (!Number.isFinite(wert)) return min;
  return Math.min(max, Math.max(min, wert));
}

export class BotController {
  #rng;
  #skill;
  #schuesse = 0;
  #aussetzer = 0;
  #letzterPlan = null;

  /**
   * @param {object} [optionen]
   * @param {{next:()=>number}} [optionen.rng] - PRNG des Matches. Ohne ihn
   *   schießt der Bot nicht (er könnte sonst nicht deterministisch sein).
   * @param {number} [optionen.skill=0.55] - Fähigkeit 0..1
   */
  constructor({ rng = null, skill = 0.55 } = {}) {
    this.#rng = rng ?? null;
    this.#skill = Number.isFinite(skill) ? Math.min(1, Math.max(0, skill)) : 0.55;
  }

  get skill() { return this.#skill; }

  /** Wie viele Schüsse der Bot geplant hat und wie viele davon Aussetzer waren. */
  get stats() {
    return {
      shots: this.#schuesse,
      slips: this.#aussetzer,
      slipRate: this.#schuesse > 0 ? this.#aussetzer / this.#schuesse : 0,
      lastPlan: this.#letzterPlan,
    };
  }

  /**
   * Wählt einen Schuss gegen ein Ziel der Gegenseite.
   *
   * @param {object} match - der MatchController (nicht nur sein Zustand: der
   *   Bot braucht Terrain, Wind, Aufgebot und die Mündung aus demselben Objekt,
   *   dessen `fire()` er gleich aufruft)
   * @param {number} botEntityId - die Figur, die der Bot steuert
   * @returns {{angle:number, power:number}|null}
   */
  chooseShot(match, botEntityId) {
    if (!this.#rng || !match) return null;
    const state = match.getState();
    const ich = state.entities.find(entity => entity.entityId === botEntityId);
    if (!ich || !ich.alive) return null;

    const gegner = state.entities
      .filter(entity => entity.alive && entity.teamId !== ich.teamId)
      .map(entity => ({
        entityId: entity.entityId,
        teamId: entity.teamId,
        x: entity.x,
        y: entity.y,
        distance: Math.hypot(entity.x - ich.x, entity.y - ich.y),
      }))
      // Deterministische Reihenfolge: Abstand, dann Entity-ID. Die Reihenfolge
      // der Zustandsliste ist schon stabil (Aufstellungsreihenfolge), aber eine
      // Entscheidung darf nicht davon abhängen, dass sie es bleibt.
      .sort((a, b) => (a.distance - b.distance) || (a.entityId - b.entityId));
    if (gegner.length === 0) return null;

    const ziel = this.#zielWaehlen(gegner, this.#skill);
    const solver = new AimSolver({ match, ich, alle: state.entities, wind: state.wind ?? 0 });

    let plan = solver.planFuer(ziel);
    /*
     * Sicherheitsnetz: Ist das gewählte Ziel nicht erreichbar (Wand davor, zu
     * weit), sucht der Bot auch für die anderen — aber ohne neuen Zufall und in
     * fester Reihenfolge. Ohne das würde ein niedriges Skill-Level den Zug
     * regelmäßig mit einem Schuss in die Wand verbrennen.
     */
    if (plan.error > FALLBACK_ERROR) {
      for (const kandidat of gegner) {
        if (kandidat.entityId === ziel.entityId) continue;
        const anderer = solver.planFuer(kandidat);
        if (anderer.error < plan.error) plan = anderer;
      }
    }

    const schuss = this.#menschlich(plan);
    this.#schuesse += 1;
    this.#letzterPlan = {
      targetId: plan.targetId,
      angle: plan.angle,
      power: plan.power,
      error: plan.error,
      impact: plan.impact,
      slip: schuss.slip,
      distance: ziel.distance,
      /*
       * Flugzeit des geplanten Schusses und die Lebensdauer des Geschosses.
       * Ohne den Vergleich der beiden plante der Bot Bögen, deren Geschoss
       * mitten im Flug verfiel (siehe `projectileLifetime`). Der Test
       * `tests/bot-ai.test.js` prüft, dass die Flugzeit hineinpasst.
       */
      steps: plan.steps ?? 0,
      endedBy: plan.endedBy ?? null,
      lifetime: match.projectileLifetime(botEntityId, plan.angle, plan.power),
    };
    return { angle: schuss.angle, power: schuss.power };
  }

  /** Setzt die Zähler des Bots zurück (neues Match). */
  reset() {
    this.#schuesse = 0;
    this.#aussetzer = 0;
    this.#letzterPlan = null;
    return this;
  }

  /**
   * Zielwahl mit Temperatur (softmax).
   *
   * Ein Anfänger wählt nicht immer den nächstgelegenen Gegner, ein Experte
   * schon. Die Temperatur fällt mit dem Skill: Bei 1 ist die Wahl praktisch
   * deterministisch, bei 0 fast gleichverteilt. Das ist die glaubwürdigste Form
   * von „Dummheit" — sie sieht wie eine Entscheidung aus, nicht wie ein Fehler.
   */
  #zielWaehlen(gegner, skill) {
    const temperatur = (1 - skill) * 2 + 0.01;
    let summe = 0;
    const gewichte = gegner.map(eintrag => {
      const gewicht = Math.exp((-(eintrag.distance / 100)) / temperatur);
      summe += gewicht;
      return gewicht;
    });

    let rest = this.#rng.next() * summe;
    for (let i = 0; i < gewichte.length; i += 1) {
      rest -= gewichte[i];
      if (rest <= 0) return gegner[i];
    }
    return gegner[gegner.length - 1];
  }

  /**
   * Legt die menschliche Streuung auf einen geplanten Schuss.
   *
   * Der Aussetzer ist bewusst NICHT proportional zur regulären Streuung: bei
   * Skill 1 ist die Streuung 0, ein „vertippt" muss aber trotzdem passieren —
   * sonst wäre Skill 1 ein Roboter und die 3 % wären eine Zahl ohne Wirkung.
   */
  #menschlich(plan) {
    const rng = this.#rng;
    const basis = (1 - this.#skill) ** SKILL_EXPONENT;
    const sigmaWinkel = basis * SIGMA_ANGLE;
    const sigmaKraft = basis * SIGMA_POWER;

    const winkelFehler = gaussian(rng) * sigmaWinkel;
    const kraftFehler = gaussian(rng) * sigmaKraft;
    const aussetzer = rng.next() < SLIP_CHANCE
      ? 2.5 * Math.sign(gaussian(rng))
      : 0;
    if (aussetzer !== 0) this.#aussetzer += 1;

    const aussetzerWinkel = aussetzer * Math.max(sigmaWinkel, SLIP_MIN_ANGLE);
    const aussetzerKraft = aussetzer * Math.max(sigmaKraft, SLIP_MIN_POWER) * 0.5;
    const winkel = clamp(plan.angle + winkelFehler + aussetzerWinkel, MIN_ANGLE, MAX_ANGLE);
    const kraft = clamp(plan.power * (1 + kraftFehler + aussetzerKraft), MIN_POWER, MAX_POWER);

    return { angle: winkel, power: kraft, slip: aussetzer };
  }
}

/**
 * Sucht den besten erreichbaren Schuss auf ein Ziel.
 *
 * Bewusst eine eigene, kleine Klasse: Sie braucht Terrain, Wind, Trefferfelder
 * und Aufgebot — Dinge, die für jeden Kandidaten gleich bleiben. Ein Objekt
 * hält sie einmal, statt sie durch jede Funktionskette zu reichen.
 */
class AimSolver {
  #match;
  #ich;
  #waffe;
  #einheiten;
  #speedMultiplier;
  #gravityScale;
  #wind;
  #bounds;

  constructor({ match, ich, alle, wind }) {
    this.#match = match;
    this.#ich = ich;
    this.#waffe = getWeapon(match.inventory.getActiveWeaponId(ich.entityId)) ?? null;
    const spieler = match.players.find(entry => entry.entityId === ich.entityId);
    this.#speedMultiplier = launchSpeedMultiplier({
      classId: spieler?.classId ?? 0,
      archetypeId: spieler?.archetypeId ?? 0,
      sidegradeId: spieler?.sidegradeId ?? null,
      weapon: this.#waffe,
    });
    this.#gravityScale = this.#waffe?.gravityScale || 1;
    this.#wind = wind;
    /*
     * ALLE anderen Figuren sind Trefferfelder — auch die eigenen. Nur so kann
     * der Bot erkennen, ob sein Schuss durch einen Verbündeten läuft.
     * Der Schütze selbst ist ausgenommen, genau wie im Motor
     * (`ProjectileSystem` schließt `owner` aus).
     */
    this.#einheiten = alle
      .filter(entity => entity.entityId !== ich.entityId)
      .map(entity => ({ entityId: entity.entityId, teamId: entity.teamId, x: entity.x, y: entity.y }));
    this.#bounds = {
      minX: -64,
      maxX: (match.terrain?.width ?? match.width) + 64,
      minY: -Infinity,
      maxY: (match.terrain?.height ?? match.height) + 64,
    };
  }

  /** Plant einen Schuss auf ein Ziel; liefert die beste gefundene Lösung. */
  planFuer(ziel) {
    if (this.#waffe?.delivery === 'hitscan') return this.#planGerade(ziel);

    const rechts = ziel.x >= this.#ich.x;
    const winkelVon = (a) => (rechts ? a : Math.PI - a);

    let bestes = { angle: winkelVon(SCAN_ANGLE_MIN), power: MIN_POWER, error: Infinity, impact: null };

    // Stufe 1 — Grobraster über Winkel und Kraft.
    for (let i = 0; i < COARSE_ANGLES; i += 1) {
      const a = SCAN_ANGLE_MIN + (SCAN_ANGLE_MAX - SCAN_ANGLE_MIN) * (i / (COARSE_ANGLES - 1));
      for (let j = 0; j < COARSE_POWERS; j += 1) {
        const kraft = MIN_POWER + (MAX_POWER - MIN_POWER) * (j / (COARSE_POWERS - 1));
        const ergebnis = this.#bewerte(winkelVon(a), kraft, ziel);
        if (ergebnis.error < bestes.error) {
          bestes = {
            angle: winkelVon(a), power: kraft, error: ergebnis.error, impact: ergebnis.impact,
            steps: ergebnis.steps, endedBy: ergebnis.endedBy,
          };
        }
      }
    }

    // Stufe 2 — verfeinern, bis die Schrittweite unter der Tick-Breite liegt.
    let schrittWinkel = REFINE_ANGLE_STEP;
    let schrittKraft = REFINE_POWER_STEP;
    for (let runde = 0; runde < REFINE_ROUNDS; runde += 1) {
      for (const [dw, dk] of NACHSCHARN) {
        const kandidat = {
          angle: clamp(bestes.angle + dw * schrittWinkel, MIN_ANGLE, MAX_ANGLE),
          power: clamp(bestes.power + dk * schrittKraft, MIN_POWER, MAX_POWER),
        };
        const ergebnis = this.#bewerte(kandidat.angle, kandidat.power, ziel);
        if (ergebnis.error < bestes.error) {
          bestes = {
            ...kandidat,
            error: ergebnis.error,
            impact: ergebnis.impact,
            steps: ergebnis.steps,
            endedBy: ergebnis.endedBy,
          };
        }
      }
      schrittWinkel *= 0.5;
      schrittKraft *= 0.5;
    }

    return { ...bestes, targetId: ziel.entityId };
  }

  /**
   * Gerade Sichtlinie für HITSCAN-Waffen.
   *
   * Diese Waffen schießen ohne Gravitation und ohne Wind
   * (`#resolveHitscan` im Motor). Die Vorwärtssimulation wäre hier die falsche
   * Rechnung, weil SIE das Ziel erst auf dem Boden sucht.
   */
  #planGerade(ziel) {
    const gerade = (winkel) => {
      const muendung = this.#match.launchOrigin(this.#ich.entityId, winkel);
      return Math.atan2(-(ziel.y - muendung.y), ziel.x - muendung.x);
    };
    // Die Mündung hängt vom Winkel ab — einmal nachrechnen genügt.
    const vorlaeufig = Math.atan2(-(ziel.y - this.#ich.y), ziel.x - this.#ich.x);
    const angle = clamp(gerade(vorlaeufig), MIN_ANGLE, MAX_ANGLE);
    const muendung = this.#match.launchOrigin(this.#ich.entityId, angle);
    const reichweite = this.#waffe?.maxRange ?? 2000;
    const treffer = raycastSegment(muendung.x, muendung.y,
      muendung.x + Math.cos(angle) * reichweite,
      muendung.y - Math.sin(angle) * reichweite,
      { isSolid: (x, y) => this.#match.terrain.isSolid(x, y), hitTest: (x, y) => this.#trefferfeld(x, y) });
    // Dasselbe Maß wie beim Projektilweg: der Abstand zum Zielmittelpunkt.
    // Ein Strahl, der an einer Wand endet, ist kein Treffer.
    const abstand = treffer
      ? Math.hypot(treffer.x - ziel.x, treffer.y - ziel.y)
      : NO_IMPACT_ERROR;
    return {
      angle,
      // Bei Hitscan bestimmt die Kraft KEINE Bahn (keine Gravitation, kein
      // Wind) — die Linie steht mit dem Winkel fest. 60 ist ein neutraler Wert
      // in der Mitte des erlaubten Bereichs, keine Balance-Aussage.
      power: 60,
      error: abstand,
      impact: treffer ? { x: treffer.x, y: treffer.y } : null,
      targetId: ziel.entityId,
    };
  }

  /**
   * Simuliert einen Kandidaten und bewertet den AUFPRALLPUNKT.
   *
   * ## Das Maß
   *
   * Es gibt genau EINES: den Abstand des Einschlags zum Mittelpunkt des Ziels.
   * Ein Treffer auf eine EIGENE Figur ist davon ausgenommen und wird hart
   * bestraft (Friendly Fire).
   *
   * ## Warum nicht „Treffer im Trefferfeld = Fehler 0"
   *
   * FUND (belegt, gemessen): Zuerst galt genau das. Damit genügte dem Suchlauf
   * ein Schuss, der das Trefferfeld am RAND streift — und der ist zerbrechlich.
   * Die Figuren stehen nicht still: In einem Match OHNE abgefeuerte Schüsse
   * schwankten alle vier Figuren über sechs Züge um rund ±4 px (gemessen,
   * 200 Ticks je Zug). Ein Streifschuss am Rand des Trefferfelds (±10 px in y)
   * verfehlt dann bei der nächsten Schwankung.
   *
   * Mit dem Abstand zum MITTELPUNKT als Maß liegt die Bahn in der Mitte des
   * Trefferfelds; die Schwankung von 4 px passt bequem hinein. Die A/B-Messung
   * (kontrollierte Lage, Ziel in Reichweite, Motor-Ereignisse) ergab: 40/40
   * Treffer mit dem Mittelpunkt-Maß gegen 39/40 mit dem Trefferfeld-Maß — kein
   * großer, aber ein echter Unterschied, und die Begründung ist geometrisch:
   * In der Mitte ist der Abstand zum Rand links wie rechts gleich.
   */
  #bewerte(angle, power, ziel) {
    const muendung = this.#match.launchOrigin(this.#ich.entityId, angle);
    const bahn = simulateFlight({
      x: muendung.x,
      y: muendung.y,
      angle,
      power,
      speedMultiplier: this.#speedMultiplier,
      gravityScale: this.#gravityScale,
      gravity: PROJECTILE_GRAVITY,
      drag: PROJECTILE_DRAG,
      wind: this.#wind,
      windFactor: 1,
      /*
       * Die Schrittgrenze ist die LEBENSDAUER des Geschosses, nicht eine runde
       * Zahl. FUND (belegt, gemessen): Ohne sie plante der Bot Bögen mit 83
       * Ticks Flugzeit für ein Geschoss, das nach 72 Ticks verfällt — der
       * Schuss verschwand vor dem Ziel. Die Lebensdauer kommt aus dem Motor
       * (`projectileLifetime`), damit hier keine zweite Regel entsteht.
       */
      steps: this.#match.projectileLifetime(this.#ich.entityId, angle, power, this.#waffe),
      isSolid: (x, y) => this.#match.terrain.isSolid(x, y),
      hitTest: (x, y) => this.#trefferfeld(x, y),
      bounds: this.#bounds,
    });

    /*
     * Ein Treffer auf eine EIGENE Figur ist kein Treffer, egal wie gut er
     * „trifft" — Friendly Fire wird hart bestraft.
     */
    if (bahn.hit && bahn.hit.teamId === this.#ich.teamId) {
      return { error: FRIENDLY_ERROR, impact: bahn.impact, hit: bahn.hit };
    }
    if (!bahn.impact) return { error: NO_IMPACT_ERROR, impact: null, hit: null };

    return {
      error: Math.hypot(bahn.impact.x - ziel.x, bahn.impact.y - ziel.y),
      impact: bahn.impact,
      hit: bahn.hit ?? null,
      steps: bahn.steps,
      endedBy: bahn.terminatedBy,
    };
  }

  /** Das Trefferfeld einer Figur (dieselbe Größe, die der Motor benutzt). */
  #trefferfeld(x, y) {
    for (const einheit of this.#einheiten) {
      if (Math.abs(x - einheit.x) <= PLAYER_HALF_WIDTH && Math.abs(y - einheit.y) <= PLAYER_HALF_HEIGHT) {
        return { entityId: einheit.entityId, teamId: einheit.teamId };
      }
    }
    return null;
  }
}

export default BotController;
