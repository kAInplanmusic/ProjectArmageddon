/**
 * Zerstörung ab `ZERSTOERUNG_GELAENDE`: raue Krater und nachstürzendes Gelände.
 *
 * ## Was hier geschieht
 *
 * 1. `krater()` stanzt einen Krater mit rauer Form (`kraterForm` in
 *    `terrain/collisionMask.js`) und meldet ihn als `terrain_destroyed` samt Tiefe.
 * 2. Danach wird die Umgebung geprüft: Jedes feste Stück Gelände, das der Krater
 *    vom Rest getrennt hat und das nicht bis an den Kartenrand reicht, ist eine
 *    freischwebende INSEL (ein Überhang, eine gekappte Brücke). Gesucht wird nur
 *    an den Rändern des frischen Kraters — Inseln, die der Kartengenerator
 *    absichtlich schweben lässt, bleiben, bis jemand sie anschießt.
 * 3. Eine Insel fällt: Sie wird aus der Maske genommen, sinkt mit
 *    `INSEL_GRAVITATION` und wird beim Aufsetzen wieder eingesetzt. Figuren,
 *    Kisten und Geschütze, die auf ihr stehen, fahren mit.
 * 4. Lose Objekte (liegende Kisten, Geschütze), denen der Boden fehlt, fallen
 *    ebenfalls (`#objekteFallen`). Figuren fallen über das `CharacterSystem`.
 *
 * ## Kostenbudget
 *
 * Die Inselsuche besucht je Tick höchstens `SUCH_BUDGET_PRO_TICK` Zellen und
 * setzt im nächsten Tick fort. Eine Masse über der Obergrenze der Fassung
 * (`suchGrenzen`: 6000 Zellen in Fassung 2, 60 000 in Fassung 3) gilt als
 * gewachsener Fels (verankert); je Krater werden höchstens `faktor` solche
 * Massen angefangen. In Fassung 2 wird eine Masse in einem Tick zu Ende gefüllt
 * (ein Tick kostet dann bis zu Budget + Obergrenze); ab Fassung 3 hält auch die
 * Füllung an der Budgetgrenze an und läuft im nächsten Tick weiter — ein Tick
 * kostet nie mehr als das Budget. Das Fallen kostet je Tick nur
 * die untere Kante der Insel; die Maske wird beim Start und beim Aufsetzen
 * einmal beschrieben.
 *
 * ## Determinismus und Client
 *
 * Alles hier ist eine Funktion von Maske, Weltzustand und Tick — keine Zufallszahl,
 * keine Winkelfunktion. Der Client rechnet die Suche NICHT nach: Er bekommt das
 * Ergebnis als Ereignis (`terrain_detached` zur Anzeige, `terrain_settled` als
 * Zustand) und im Log der Maske (`['s', dy, ...Spaltenläufe]`), und spielt es in
 * derselben Reihenfolge ab wie die Krater.
 *
 * @module zerstoerung
 */
import { COMPONENT_SIGNATURES } from './ecs/world.js';
import { eachCraterCell } from './terrain/collisionMask.js';
import { PLAYER_HALF_HEIGHT } from '../shared/config/player.js';
import {
  SUCH_BUDGET_PRO_TICK, INSEL_GRAVITATION, ZERSTOERUNG_GELAENDE, suchGrenzen,
  INSEL_TEMPO_MAX, INSEL_QUETSCH_SCHADEN, OBJEKT_GRAVITATION,
} from '../shared/config/zerstoerung.js';

/** Krater unter diesem Radius lösen nichts ab. */
const MIN_RADIUS_NACHRUTSCH = 6;
/** Wartende Krater (ein Schuss mit Splittern kann viele auf einmal setzen). */
const MAX_AUFTRAEGE = 256;
/** Abstand zwischen Geschützposition und Standfläche (siehe `freierPlatz`). */
const GESCHUETZ_FUSS = 6;
/**
 * Kisten sind 14 px hoch und um ihre Mitte gezeichnet: ihre Unterkante liegt 7 px
 * unter `y`. Rundenkisten stehen 14 px über dem Boden, abgeworfene auf der
 * Oberfläche selbst — beides gilt als gestützt, solange Boden in den nächsten
 * `KISTE_STUETZ` Zeilen liegt.
 */
const KISTE_FUSS = 7;
const KISTE_STUETZ = 16;

/** Zellschlüssel, spaltenweise: `x * Höhe + y`. Aufsteigend sortiert liegen Spaltenläufe zusammen. */
const schluessel = (x, y, hoehe) => x * hoehe + y;

/** Binärsuche in einem aufsteigend sortierten `Int32Array`. */
function enthaelt(geordnet, wert) {
  let lo = 0;
  let hi = geordnet.length - 1;
  while (lo <= hi) {
    const mitte = (lo + hi) >> 1;
    const v = geordnet[mitte];
    if (v === wert) return true;
    if (v < wert) lo = mitte + 1; else hi = mitte - 1;
  }
  return false;
}

/**
 * Spaltenläufe einer Zellmenge: flach `[x, yOben, yUnten, x, yOben, yUnten, ...]`.
 * Die Eingabe muss aufsteigend sortiert sein (`schluessel`).
 */
export function spaltenlaeufe(geordnet, hoehe) {
  const lauf = [];
  let i = 0;
  while (i < geordnet.length) {
    const x = Math.floor(geordnet[i] / hoehe);
    const oben = geordnet[i] - x * hoehe;
    let unten = oben;
    while (i + 1 < geordnet.length && geordnet[i + 1] === geordnet[i] + 1) { i += 1; unten += 1; }
    lauf.push(x, oben, unten);
    i += 1;
  }
  return lauf;
}

export class Zerstoerung {
  #terrain;
  #world;
  #events;
  #turrets;
  #breite;
  #hoehe;
  #auftraege = [];
  #job = null;
  #inseln = [];
  #naechsteId = 1;
  /** Fallgeschwindigkeit loser Objekte, Schlüssel `k<id>` (Kiste) / `g<id>` (Geschütz). */
  #objektTempo = new Map();
  /** Objekte, die gerade auf einer fallenden Insel fahren (sie stehen nicht auf der Maske). */
  #getragen = new Set();
  #maskenStand = -1;
  #suchkosten = 0;
  #grenzen;

  /**
   * @param {object} quelle
   * @param {import('./terrain/collisionMask.js').CollisionMask} quelle.terrain
   * @param {object} quelle.world - ECS-Welt
   * @param {object} quelle.events - Ereigniswarteschlange
   * @param {Map<number, object>} quelle.turrets - Geschütze des Matches (`x`, `y` werden bewegt)
   * @param {number} [quelle.fassung] - Zerstörungsfassung (`config.zerstoerung`), bestimmt die Suchgrenzen
   */
  constructor({ terrain, world, events, turrets, fassung = ZERSTOERUNG_GELAENDE }) {
    this.#grenzen = suchGrenzen(fassung);
    this.#terrain = terrain;
    this.#world = world;
    this.#events = events;
    this.#turrets = turrets;
    this.#breite = terrain.width;
    this.#hoehe = terrain.height;
  }

  /** Besuchte Zellen der Inselsuche im letzten Tick (Kostenbudget, für Tests und Messung). */
  get suchkosten() { return this.#suchkosten; }

  /** Anzahl der Inseln im Fall. Solange sie > 0 ist, weicht die Maske vom Log ab. */
  get faellt() { return this.#inseln.length; }

  /** Stanzt einen rauen Krater, meldet ihn und merkt die Umgebung zur Prüfung vor. */
  krater(x, y, radius, tiefe) {
    this.#terrain.punchCrater(x, y, radius, tiefe);
    this.#events.emit('terrain_destroyed', { x, y, radius, tiefe });
    if (radius < MIN_RADIUS_NACHRUTSCH) return;
    if (this.#auftraege.length >= MAX_AUFTRAEGE) this.#auftraege.shift();
    this.#auftraege.push({ x, y, radius, tiefe });
  }

  /** Ein Tick: Inselsuche (budgetiert), fallende Inseln, lose Objekte. */
  schritt() {
    this.#suchkosten = 0;
    if (this.#auftraege.length > 0 || this.#job) this.#suche();
    if (this.#inseln.length > 0) this.#bewegeInseln();
    this.#objekteFallen();
  }

  // ------------------------------------------------------------- Inselsuche

  #suche() {
    let budget = SUCH_BUDGET_PRO_TICK;
    while (budget > 0) {
      if (!this.#job) {
        const auftrag = this.#auftraege.shift();
        if (!auftrag) return;
        this.#job = this.#neuerJob(auftrag);
      }
      const job = this.#job;
      // Eine angefangene Füllung geht vor (nur Fassung 3 hält mitten in einer Masse an).
      if (job.fuellung) {
        const besucht = this.#fuelle(job, null, budget);
        budget -= besucht;
        this.#suchkosten += besucht;
      }
      while (!job.fuellung && job.pos < job.saat.length && budget > 0 && job.rest > 0) {
        const start = job.saat[job.pos];
        job.pos += 1;
        if (job.besucht.has(start)) continue;
        const besucht = this.#fuelle(job, start, budget);
        budget -= besucht;
        this.#suchkosten += besucht;
      }
      if (job.fuellung) return; // Budget verbraucht: im nächsten Tick weiter
      if (job.pos >= job.saat.length || job.rest <= 0) {
        for (const insel of job.inseln) this.#starte(insel);
        this.#job = null;
      }
    }
  }

  /** Saat der Suche: feste Zellen, die an eine Kraterzelle grenzen (8er-Nachbarschaft). */
  #neuerJob({ x, y, radius, tiefe }) {
    const breite = this.#breite;
    const hoehe = this.#hoehe;
    const xs = [];
    const ys = [];
    eachCraterCell(breite, hoehe, x, y, radius, (px, py) => { xs.push(px); ys.push(py); }, tiefe);
    const saat = [];
    if (xs.length > 0) {
      let x0 = Infinity; let x1 = -Infinity; let y0 = Infinity; let y1 = -Infinity;
      for (let i = 0; i < xs.length; i++) {
        if (xs[i] < x0) x0 = xs[i];
        if (xs[i] > x1) x1 = xs[i];
        if (ys[i] < y0) y0 = ys[i];
        if (ys[i] > y1) y1 = ys[i];
      }
      const gb = x1 - x0 + 1;
      const gh = y1 - y0 + 1;
      const raster = new Uint8Array(gb * gh);
      for (let i = 0; i < xs.length; i++) raster[(xs[i] - x0) * gh + (ys[i] - y0)] = 1;
      const gesehen = new Set();
      for (let i = 0; i < xs.length; i++) {
        for (let ddx = -1; ddx <= 1; ddx++) {
          for (let ddy = -1; ddy <= 1; ddy++) {
            if (ddx === 0 && ddy === 0) continue;
            const nx = xs[i] + ddx;
            const ny = ys[i] + ddy;
            if (nx < 0 || ny < 0 || nx >= breite || ny >= hoehe) continue;
            const gx = nx - x0;
            const gy = ny - y0;
            if (gx >= 0 && gy >= 0 && gx < gb && gy < gh && raster[gx * gh + gy] === 1) continue;
            const k = schluessel(nx, ny, hoehe);
            if (gesehen.has(k)) continue;
            gesehen.add(k);
            if (this.#terrain.isSolid(nx, ny)) saat.push(k);
          }
        }
      }
    }
    return {
      saat, pos: 0, besucht: new Map(), stati: [], inseln: [], ankerAb: new Map(),
      rest: this.#grenzen.maxZellen * this.#grenzen.faktor, fuellung: null,
    };
  }

  /**
   * Füllt eine zusammenhängende Masse (8er-Nachbarschaft).
   * Verankert ist sie, wenn sie den Kartenrand berührt, größer als die Obergrenze
   * der Fassung ist oder an eine schon als verankert erkannte Masse grenzt.
   *
   * Fassung 2 füllt breit (Warteschlange) und die Masse am Stück. Ab Fassung 3 füllt
   * die Suche TIEF und nach unten zuerst (Stapel): Gewachsener Fels erreicht so den
   * Kartenboden nach wenigen hundert Zellen, statt erst nach 60 000 als „zu groß" zu
   * gelten — eine echte Insel muss ohnehin ganz durchsucht werden, dort ist die
   * Reihenfolge gleichgültig. Die Füllung hält nach `limit` bearbeiteten Zellen an
   * (`job.fuellung` bleibt gesetzt) und wird mit `start === null` fortgesetzt.
   *
   * @param {number|null} start - Startzelle, `null` setzt `job.fuellung` fort
   * @param {number} limit - Zellen, die dieser Aufruf höchstens bearbeitet (nur Fassung 3)
   * @returns {number} besuchte Zellen (für das Budget)
   */
  #fuelle(job, start, limit) {
    const breite = this.#breite;
    const hoehe = this.#hoehe;
    const terrain = this.#terrain;
    const { maxZellen, fortsetzen } = this.#grenzen;
    let f = job.fuellung;
    if (start !== null) {
      const id = job.stati.length;
      job.stati.push('insel');
      // Schnellweg: Reicht fester Boden senkrecht bis zum Kartenrand, ist die Masse verankert.
      if (this.#senkrechtVerankert(job, start)) {
        job.stati[id] = 'anker';
        job.besucht.set(start, id);
        return 1;
      }
      f = { id, zellen: [start], i: 0, verankert: false, stapel: fortsetzen ? [0] : null };
      job.besucht.set(start, id);
    }
    const { id, zellen, stapel } = f;
    const von = f.i;
    const bis = fortsetzen ? von + Math.max(1, limit) : Infinity;
    const offen = () => (stapel ? stapel.length > 0 : f.i < zellen.length);
    const pruefe = (nx, ny) => {
      if (!terrain.isSolid(nx, ny)) return;
      const zelle = nx * hoehe + ny;
      const fremd = job.besucht.get(zelle);
      if (fremd === undefined) {
        job.besucht.set(zelle, id);
        zellen.push(zelle);
        if (stapel) stapel.push(zellen.length - 1);
      } else if (fremd !== id && job.stati[fremd] === 'anker') {
        f.verankert = true;
      }
    };
    for (; offen() && !f.verankert && f.i < bis; f.i++) {
      const k = stapel ? zellen[stapel.pop()] : zellen[f.i];
      const x = Math.floor(k / hoehe);
      const y = k - x * hoehe;
      if (x === 0 || y === 0 || x === breite - 1 || y === hoehe - 1 || zellen.length > maxZellen) {
        f.verankert = true;
        break;
      }
      if (stapel) {
        // Oben zuerst einstellen, unten zuletzt: der Stapel gibt die untere Nachbarzelle als erste heraus.
        for (let ddy = -1; ddy <= 1 && !f.verankert; ddy++) {
          for (let ddx = -1; ddx <= 1 && !f.verankert; ddx++) {
            if (ddx !== 0 || ddy !== 0) pruefe(x + ddx, y + ddy);
          }
        }
      } else {
        for (let ddx = -1; ddx <= 1 && !f.verankert; ddx++) {
          for (let ddy = -1; ddy <= 1; ddy++) {
            if (ddx === 0 && ddy === 0) continue;
            pruefe(x + ddx, y + ddy);
            if (f.verankert) break;
          }
        }
      }
    }
    if (!f.verankert && offen()) {
      // Nur Fassung 3: Budget verbraucht, die Füllung geht im nächsten Tick weiter.
      job.fuellung = f;
      return f.i - von;
    }
    job.fuellung = null;
    job.rest -= zellen.length;
    if (f.verankert) job.stati[id] = 'anker';
    else job.inseln.push(Int32Array.from(zellen).sort());
    return fortsetzen ? Math.max(1, f.i - von) : zellen.length;
  }

  /** Fester Boden von der Zelle senkrecht nach unten bis zum Kartenrand? (Je Spalte merkt sich der Job den Fund.) */
  #senkrechtVerankert(job, start) {
    const hoehe = this.#hoehe;
    const x = Math.floor(start / hoehe);
    const y0 = start - x * hoehe;
    const bekannt = job.ankerAb.get(x) ?? Infinity;
    for (let y = y0; y < hoehe; y++) {
      if (y >= bekannt) break;
      if (!this.#terrain.isSolid(x, y)) return false;
    }
    job.ankerAb.set(x, Math.min(bekannt, y0));
    return true;
  }

  // ------------------------------------------------------------ Inselfall

  #starte(roh) {
    const hoehe = this.#hoehe;
    const terrain = this.#terrain;
    const feste = roh.filter(k => {
      const x = Math.floor(k / hoehe);
      return terrain.isSolid(x, k - x * hoehe);
    });
    if (feste.length === 0) return;
    const unten = [];
    for (let i = 0; i < feste.length; i++) {
      if (i === feste.length - 1 || feste[i + 1] !== feste[i] + 1) unten.push(feste[i]);
    }
    const traeger = this.#findeTraeger(feste);
    for (const k of feste) {
      const x = Math.floor(k / hoehe);
      terrain.setPixel(x, k - x * hoehe, false);
    }
    const insel = {
      id: this.#naechsteId, zellen: feste, unten: Int32Array.from(unten),
      runs: spaltenlaeufe(feste, hoehe), versatz: 0, hoehe: 0, tempo: 0, traeger,
    };
    this.#naechsteId += 1;
    for (const t of traeger) this.#getragen.add(t.name);
    this.#inseln.push(insel);
    this.#events.emit('terrain_detached', { id: insel.id, runs: insel.runs });
  }

  /** Wer steht auf der Insel? Figuren, liegende Kisten, Geschütze. */
  #findeTraeger(zellen) {
    const hoehe = this.#hoehe;
    const world = this.#world;
    const liste = [];
    const steht = (spalte, fussReihe, spielraum) => {
      for (let r = fussReihe - 1; r <= fussReihe + spielraum; r++) {
        if (enthaelt(zellen, schluessel(spalte, r, hoehe))) return true;
      }
      return false;
    };
    for (const id of world.getEntitiesBySignature(COMPONENT_SIGNATURES.POSITION | COMPONENT_SIGNATURES.HEALTH)) {
      if (!world.isActive(id) || (world.getComponent(id, 'Health', 'current') ?? 0) <= 0) continue;
      const x = world.getComponent(id, 'Position', 'x') ?? 0;
      const y = world.getComponent(id, 'Position', 'y') ?? 0;
      if (steht(Math.floor(x), Math.round(y + PLAYER_HALF_HEIGHT), 2)) liste.push({ art: 'f', id, name: `f${id}`, basis: y });
    }
    for (const id of world.getEntitiesBySignature(COMPONENT_SIGNATURES.CRATE | COMPONENT_SIGNATURES.POSITION)) {
      if (!this.#kisteLiegt(id)) continue;
      const x = world.getComponent(id, 'Position', 'x') ?? 0;
      const y = world.getComponent(id, 'Position', 'y') ?? 0;
      if (steht(Math.round(x), Math.round(y) + 1, KISTE_STUETZ - 1)) liste.push({ art: 'k', id, name: `k${id}`, basis: y });
    }
    for (const turret of this.#turrets.values()) {
      if (steht(Math.round(turret.x), Math.round(turret.y) + GESCHUETZ_FUSS, 1)) {
        liste.push({ art: 'g', id: turret.entityId, name: `g${turret.entityId}`, basis: turret.y });
      }
    }
    return liste;
  }

  #kisteLiegt(id) {
    const world = this.#world;
    return world.isActive(id)
      && world.getComponent(id, 'Crate', 'inFlight') !== 1
      && world.getComponent(id, 'Crate', 'picked') !== 1;
  }

  #setzeY(t, y) {
    const world = this.#world;
    if (t.art === 'f' || t.art === 'k') {
      if (!world.isActive(t.id)) return;
      world.setComponent(t.id, 'Position', 'y', y);
      if (t.art === 'f') world.setComponent(t.id, 'Velocity', 'y', 0);
      else world.setComponent(t.id, 'Crate', 'crateY', y);
    } else {
      const turret = this.#turrets.get(t.id);
      if (turret) turret.y = y;
    }
  }

  #bewegeInseln() {
    const hoehe = this.#hoehe;
    const terrain = this.#terrain;
    for (const insel of [...this.#inseln]) {
      insel.tempo = Math.min(INSEL_TEMPO_MAX, insel.tempo + INSEL_GRAVITATION);
      insel.hoehe += insel.tempo;
      const gewollt = Math.floor(insel.hoehe) - insel.versatz;
      let frei = gewollt;
      for (let i = 0; i < insel.unten.length && frei > 0; i++) {
        const k = insel.unten[i];
        const x = Math.floor(k / hoehe);
        const y = k - x * hoehe + insel.versatz;
        let n = 0;
        while (n < frei && !terrain.isSolid(x, y + n + 1)) n += 1;
        frei = n;
      }
      if (frei > 0) {
        insel.versatz += frei;
        for (const t of insel.traeger) this.#setzeY(t, t.basis + insel.versatz);
      }
      if (frei < gewollt) this.#lande(insel);
    }
  }

  #lande(insel) {
    const hoehe = this.#hoehe;
    const terrain = this.#terrain;
    const dy = insel.versatz;
    for (const k of insel.zellen) {
      const x = Math.floor(k / hoehe);
      terrain.setPixel(x, k - x * hoehe + dy, true);
    }
    this.#inseln.splice(this.#inseln.indexOf(insel), 1);
    for (const t of insel.traeger) this.#getragen.delete(t.name);
    this.#begrabe(insel);
    if (dy > 0) terrain.logEintrag(['s', dy, ...insel.runs]);
    this.#events.emit('terrain_settled', { id: insel.id, dy, runs: insel.runs });
  }

  /**
   * Wer unter der gelandeten Insel stand, wird nach oben auf sie gehoben;
   * Figuren nehmen dabei Schaden. (Wer mitgefahren ist, steht schon oben.)
   */
  #begrabe(insel) {
    const hoehe = this.#hoehe;
    const world = this.#world;
    const terrain = this.#terrain;
    const mitgefahren = new Set(insel.traeger.map(t => t.name));
    const neu = insel.versatz === 0 ? insel.zellen : insel.zellen.map(k => k + insel.versatz);
    const drin = (spalte, reihe) => enthaelt(neu, schluessel(spalte, reihe, hoehe));
    const hebe = (spalte, start) => {
      let reihe = start;
      while (reihe > 0 && terrain.isSolid(spalte, reihe)) reihe -= 1;
      return reihe + 1;
    };
    for (const id of world.getEntitiesBySignature(COMPONENT_SIGNATURES.POSITION | COMPONENT_SIGNATURES.HEALTH)) {
      if (mitgefahren.has(`f${id}`) || !world.isActive(id) || (world.getComponent(id, 'Health', 'current') ?? 0) <= 0) continue;
      const x = Math.floor(world.getComponent(id, 'Position', 'x') ?? 0);
      const y = world.getComponent(id, 'Position', 'y') ?? 0;
      const fuss = Math.round(y + PLAYER_HALF_HEIGHT);
      if (!drin(x, Math.floor(y)) && !drin(x, fuss)) continue;
      world.setComponent(id, 'Position', 'y', hebe(x, fuss) - PLAYER_HALF_HEIGHT);
      world.setComponent(id, 'Velocity', 'y', 0);
      world.getSystem('damage')?.applyDamage(world, id, INSEL_QUETSCH_SCHADEN, null);
    }
    for (const id of world.getEntitiesBySignature(COMPONENT_SIGNATURES.CRATE | COMPONENT_SIGNATURES.POSITION)) {
      if (mitgefahren.has(`k${id}`) || !this.#kisteLiegt(id)) continue;
      const x = Math.round(world.getComponent(id, 'Position', 'x') ?? 0);
      const y = Math.round(world.getComponent(id, 'Position', 'y') ?? 0);
      if (drin(x, y)) this.#setzeY({ art: 'k', id }, hebe(x, y));
    }
    for (const turret of this.#turrets.values()) {
      if (mitgefahren.has(`g${turret.entityId}`)) continue;
      const fuss = Math.round(turret.y) + GESCHUETZ_FUSS;
      if (drin(Math.round(turret.x), fuss)) turret.y = hebe(Math.round(turret.x), fuss) - GESCHUETZ_FUSS;
    }
  }

  // ---------------------------------------------------------- lose Objekte

  /**
   * Liegende Kisten und Geschütze fallen, sobald ihnen der Boden fehlt (Krater,
   * Mahlstrom, gelandete Insel). Geprüft wird nur, wenn sich die Maske geändert
   * hat oder schon etwas fällt.
   */
  #objekteFallen() {
    const terrain = this.#terrain;
    if (terrain.version === this.#maskenStand && this.#objektTempo.size === 0) return;
    this.#maskenStand = terrain.version;
    const world = this.#world;
    const gesehen = new Set();
    for (const id of world.getEntitiesBySignature(COMPONENT_SIGNATURES.CRATE | COMPONENT_SIGNATURES.POSITION)) {
      if (!this.#kisteLiegt(id) || this.#getragen.has(`k${id}`)) continue;
      gesehen.add(`k${id}`);
      const x = world.getComponent(id, 'Position', 'x') ?? 0;
      const y = world.getComponent(id, 'Position', 'y') ?? 0;
      const ay = Math.round(y);
      const neu = this.#fall(`k${id}`, x, ay + KISTE_FUSS, () => this.#gestuetzt(x, ay, ay + KISTE_STUETZ));
      if (neu !== null) this.#setzeY({ art: 'k', id }, neu - KISTE_FUSS);
    }
    for (const turret of this.#turrets.values()) {
      if (this.#getragen.has(`g${turret.entityId}`)) continue;
      gesehen.add(`g${turret.entityId}`);
      const fuss = Math.round(turret.y) + GESCHUETZ_FUSS;
      const neu = this.#fall(`g${turret.entityId}`, turret.x, fuss, () => this.#gestuetzt(turret.x, fuss, fuss + 1));
      if (neu !== null) turret.y = neu - GESCHUETZ_FUSS;
    }
    // Entities werden wiederverwendet: Wer verschwunden ist (aufgehoben, abgelaufen), fällt nicht weiter.
    for (const name of [...this.#objektTempo.keys()]) if (!gesehen.has(name)) this.#objektTempo.delete(name);
  }

  /** Liegt in den Zeilen `von..bis` einer der beiden Nachbarspalten von `x` (abgerundet / gerundet) Boden? */
  #gestuetzt(x, von, bis) {
    const links = Math.floor(x);
    const mitte = Math.round(x);
    for (const sp of links === mitte ? [mitte] : [links, mitte]) {
      for (let reihe = von; reihe <= bis; reihe++) if (this.#terrain.isSolid(sp, reihe)) return true;
    }
    return false;
  }

  /**
   * Ein Fallschritt für ein Objekt bei `x`, dessen Unterkante in Zeile `anker` liegt.
   * Es fällt erst, wenn `gestuetzt()` verneint (Kisten und Geschütze wurden mit
   * unterschiedlichen Rundungen und Höhen aufgestellt), und landet mit der
   * Unterkante auf der ersten festen Zeile darunter.
   * @returns {number|null} neue Zeile der Unterkante oder `null` (steht fest)
   */
  #fall(name, x, anker, gestuetzt) {
    const terrain = this.#terrain;
    const spalte = Math.round(x);
    const fuss = anker;
    let tempo = this.#objektTempo.get(name);
    if (tempo === undefined) {
      if (gestuetzt()) return null;
      tempo = 0;
    }
    tempo += OBJEKT_GRAVITATION;
    const ziel = fuss + Math.max(1, Math.floor(tempo));
    for (let reihe = fuss + 1; reihe <= ziel; reihe++) {
      if (reihe >= this.#hoehe || terrain.isSolid(spalte, reihe)) {
        this.#objektTempo.delete(name);
        return Math.min(reihe, this.#hoehe - 1);
      }
    }
    this.#objektTempo.set(name, tempo);
    return ziel;
  }
}

export default Zerstoerung;
