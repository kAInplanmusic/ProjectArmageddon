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
import { eachCraterCell, mische32 } from './terrain/collisionMask.js';
import { PLAYER_HALF_HEIGHT, PLAYER_HALF_WIDTH } from '../shared/config/player.js';
import { WEAPONS } from '../shared/config/weapons.js';
import {
  SUCH_BUDGET_PRO_TICK, INSEL_GRAVITATION, ZERSTOERUNG_GELAENDE, ZERSTOERUNG_BRUCH, suchGrenzen,
  INSEL_TEMPO_MAX, INSEL_QUETSCH_SCHADEN, OBJEKT_GRAVITATION,
  aufprallStaerke, WEICH_AB_STAERKE, WEICH_MIN_FALL, WEICH_MIN_ZELLEN, SCHUTT_MAX_JE_LANDUNG, SCHUTT_MAX_GESAMT,
  SCHUTT_GRAVITATION, SCHUTT_LEBEN, BRUCH_AB_STAERKE, BRUCH_MIN_ZELLEN, BRUCH_MIN_FALL, BRUCH_MIN_UEBERSTAND,
  BEBEN_MAX_RADIUS, BEBEN_MIN_RADIUS, BEBEN_RAND, BEBEN_STEILHEIT, BEBEN_MAX_ZUEGE, SPLITTER_MIN, SPLITTER_SPANNE, RUTSCH_SCHUB, RUTSCH_MIN_RADIUS,
  charakterDerWaffe, ZERSTOERUNG_STOFF, ZERSTOERUNG_HANG, ZERSTOERUNG_FEIN,
  HANG_MIN_RADIUS, HANG_RADIUS_FAKTOR, HANG_MIN_WIRKRADIUS, HANG_MAX_WIRKRADIUS, HANG_STEILHEIT,
} from '../shared/config/zerstoerung.js';
import { stoffWirkung, wirkgruppe, bebenWirkt, stoffById, MIN_KRATER_RADIUS } from '../shared/config/stoffe.js';
import { stoffAmEinschlag, stoffAm } from '../shared/stoffkarte.js';

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

/** Zufall aus ganzen Zahlen (0 <= z < 1): nur `Math.imul` und Verschiebungen, überall gleich. */
function zufall(a, b = 0, c = 0) {
  return mische32(Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663) ^ Math.imul(c | 0, 83492791) ^ 0x5bd1e995) / 4294967296;
}

/** Zerstörungscharakter nach Waffenindex (`Projectile.weaponId`), einmal aus dem Katalog aufgebaut. */
let charakterTabelle = null;
/** Wirkgruppe (Feuer, Eis, Säure ...) nach Waffenindex. */
let gruppeTabelle = null;
function gruppeFuerIndex(index) {
  if (!gruppeTabelle) {
    gruppeTabelle = new Map();
    for (const waffe of WEAPONS) gruppeTabelle.set(waffe.index, wirkgruppe(waffe.damageType));
  }
  return gruppeTabelle.get(index) ?? 'wucht';
}

export function charakterFuerIndex(index) {
  if (!charakterTabelle) {
    charakterTabelle = new Map();
    for (const waffe of WEAPONS) charakterTabelle.set(waffe.index, charakterDerWaffe(waffe));
  }
  return charakterTabelle.get(index) ?? 'sprengung';
}

/** Richtungen der Splitterstreuung (Bildschirmkoordinaten, y nach unten): vorberechnet, keine Winkelfunktion. */
const SPLITTER_RICHTUNGEN = [
  [1, 0], [0.906, 0.423], [0.643, 0.766], [0.259, 0.966], [-0.259, 0.966],
  [-0.643, 0.766], [-0.906, 0.423], [-1, 0], [0.94, -0.342], [-0.94, -0.342],
];

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
  #fassung;
  /** Fassung 4: Nacharbeit gelandeter Inseln, fliegender Schutt, Erdbeben-Aufträge. */
  #bruch;
  /** Fassung 5: Stoffkarte (`shared/stoffkarte.js`) oder `null`. */
  #stoff;
  #stoffAmKrater = 0;
  /** Fassung 6: lose Stoffe (Sand, Schnee, Asche) rutschen nach einem Einschlag nach. */
  #hang;
  #fein;
  #tick = 0;
  #nacharbeit = [];
  #partikel = [];
  #beben = [];
  #nachkosten = 0;
  /** Feuerfassung 2: ruft bei jedem Waffeneinschlag `(x, y, radius, wirkgruppe)` (entzündet oder löscht). */
  #einschlagHaken = null;

  /**
   * @param {object} quelle
   * @param {import('./terrain/collisionMask.js').CollisionMask} quelle.terrain
   * @param {object} quelle.world - ECS-Welt
   * @param {object} quelle.events - Ereigniswarteschlange
   * @param {Map<number, object>} quelle.turrets - Geschütze des Matches (`x`, `y` werden bewegt)
   * @param {number} [quelle.fassung] - Zerstörungsfassung (`config.zerstoerung`), bestimmt die Suchgrenzen
   */
  constructor({ terrain, world, events, turrets, fassung = ZERSTOERUNG_GELAENDE, stoffe = null }) {
    this.#stoff = fassung >= ZERSTOERUNG_STOFF && stoffe ? stoffe : null;
    if (this.#stoff) terrain.setzeSchutz(stoffe);
    this.#hang = fassung >= ZERSTOERUNG_HANG && this.#stoff !== null;
    this.#fein = fassung >= ZERSTOERUNG_FEIN;
    this.#grenzen = suchGrenzen(fassung);
    this.#fassung = fassung;
    this.#bruch = fassung >= ZERSTOERUNG_BRUCH;
    this.#terrain = terrain;
    this.#world = world;
    this.#events = events;
    this.#turrets = turrets;
    this.#breite = terrain.width;
    this.#hoehe = terrain.height;
  }

  /** Besuchte Zellen der Inselsuche im letzten Tick (Kostenbudget, für Tests und Messung). */
  get suchkosten() { return this.#suchkosten; }

  /** Zerstörungsfassung dieser Einheit. */
  get fassung() { return this.#fassung; }

  /** Bearbeitete Zellen der Nacharbeit (Zerbröseln, Bruch, Schutt) im letzten Tick; getrennt vom Suchbudget. */
  get nachkosten() { return this.#nachkosten; }

  /** Fliegende Partikel-Zellen (Fassung 4). */
  get schutt() { return this.#partikel.length; }

  /**
   * Anzahl der Dinge im Fall (Inseln, ab Fassung 4 auch fliegender Schutt, wartende Nacharbeit und
   * Erdbeben). Solange sie > 0 ist, weicht die Maske vom Log ab.
   */
  get faellt() { return this.#inseln.length + this.#partikel.length + this.#nacharbeit.length + this.#beben.length; }

  /**
   * Stanzt einen rauen Krater, meldet ihn und merkt die Umgebung zur Prüfung vor.
   *
   * @param {number|string|null} [quelle] - nur Fassung 4: Waffenindex oder Zerstörungscharakter
   *   (`charakterDerWaffe`); ältere Fassungen ignorieren ihn.
   */
  krater(x, y, radius, tiefe, quelle = null) {
    const art = this.#bruch ? (typeof quelle === 'number' ? charakterFuerIndex(quelle) : (quelle ?? 'sprengung')) : null;
    let zusatz = null;
    let nebenbrueche = 0;
    if (this.#stoff) {
      const stoffId = stoffAmEinschlag(this.#stoff, this.#terrain, x, y, radius);
      const gruppe = typeof quelle === 'number' ? gruppeFuerIndex(quelle) : 'wucht';
      const w = stoffWirkung(stoffId, art, gruppe, this.#fein);
      this.#einschlagHaken?.(x, y, radius, gruppe);
      const key = stoffById(stoffId).key;
      this.#stoffAmKrater = stoffId;
      if (Math.round(radius * w.radius) < MIN_KRATER_RADIUS) {
        this.#events.emit('terrain_resisted', { x, y, radius, stoff: key });
        return;
      }
      radius = Math.round(radius * w.radius);
      tiefe = radius > 5 ? Math.max(40, Math.round(tiefe * w.tiefe)) : 100;
      nebenbrueche = w.nebenbrueche;
      zusatz = w.reaktion ? { stoff: key, reaktion: w.reaktion } : { stoff: key };
    }
    this.#terrain.punchCrater(x, y, radius, tiefe);
    this.#events.emit('terrain_destroyed', art ? { x, y, radius, tiefe, art, ...zusatz } : { x, y, radius, tiefe });
    if (art) this.#charakter(x, y, radius, art, nebenbrueche);
    if (radius < MIN_RADIUS_NACHRUTSCH) return;
    const letzter = this.#auftraege[this.#auftraege.length - 1];
    if (art === 'durchschlag' && letzter && letzter.art === art && letzter.tick === this.#tick) {
      // Ein Bohrtunnel ist EIN Auftrag: Die Inselsuche startet an allen Löchern gemeinsam.
      letzter.kreise.push({ x, y, radius, tiefe });
      return;
    }
    if (this.#auftraege.length >= MAX_AUFTRAEGE) this.#auftraege.shift();
    this.#auftraege.push({ kreise: [{ x, y, radius, tiefe }], art, tick: this.#tick });
  }

  /** @param {function|null} haken Feuerfassung 2: wird bei jedem Waffeneinschlag gerufen. */
  setzeEinschlagHaken(haken) { this.#einschlagHaken = haken; }

  /** Ein Tick: Inselsuche (budgetiert), fallende Inseln, lose Objekte. */
  schritt() {
    this.#suchkosten = 0;
    this.#tick += 1;
    if (this.#auftraege.length > 0 || this.#job) this.#suche();
    if (this.#inseln.length > 0) this.#bewegeInseln();
    if (this.#bruch) this.#bruchSchritt();
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
  #neuerJob({ kreise }) {
    const breite = this.#breite;
    const hoehe = this.#hoehe;
    const xs = [];
    const ys = [];
    if (kreise.length === 1) {
      const { x, y, radius, tiefe } = kreise[0];
      eachCraterCell(breite, hoehe, x, y, radius, (px, py) => { xs.push(px); ys.push(py); }, tiefe);
    } else {
      // Mehrere Löcher (Bohrtunnel): überlappende Zellen nur einmal, in der Reihenfolge des ersten Auftretens.
      const bekannt = new Set();
      for (const { x, y, radius, tiefe } of kreise) {
        eachCraterCell(breite, hoehe, x, y, radius, (px, py) => {
          const k = schluessel(px, py, hoehe);
          if (bekannt.has(k)) return;
          bekannt.add(k);
          xs.push(px);
          ys.push(py);
        }, tiefe);
      }
    }
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

  #starte(roh, gebrochen = false) {
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
      runs: spaltenlaeufe(feste, hoehe), versatz: 0, hoehe: 0, tempo: 0, traeger, gebrochen,
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
    if (this.#bruch && dy > 0) this.#merkeAufprall(insel, dy);
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

  // ------------------------------------------------------- Fassung 4: Bruch

  /** Ein Tick der Fassung 4: eine Nacharbeit, fliegender Schutt, Erdbeben (mit dem Rest des Suchbudgets). */
  #bruchSchritt() {
    this.#nachkosten = 0;
    if (this.#nacharbeit.length > 0) this.#nachArbeit(this.#nacharbeit.shift());
    if (this.#partikel.length > 0) this.#schuttSchritt();
    if (this.#beben.length > 0) this.#bebenSchritt(Math.max(0, SUCH_BUDGET_PRO_TICK - this.#suchkosten));
  }

  /** Lebende Figuren als Mittelpunkte (für „nichts in eine Figur hinein setzen"). */
  #figurBoxen() {
    const world = this.#world;
    const liste = [];
    for (const id of world.getEntitiesBySignature(COMPONENT_SIGNATURES.POSITION | COMPONENT_SIGNATURES.HEALTH)) {
      if (!world.isActive(id) || (world.getComponent(id, 'Health', 'current') ?? 0) <= 0) continue;
      liste.push({ id, x: world.getComponent(id, 'Position', 'x') ?? 0, y: world.getComponent(id, 'Position', 'y') ?? 0 });
    }
    return liste;
  }

  /** Liegt die Zelle im Körper einer Figur (mit einem Pixel Rand)? */
  #inFigur(cx, cy, boxen) {
    for (const b of boxen) {
      if (Math.abs(cx + 0.5 - b.x) <= PLAYER_HALF_WIDTH + 1 && cy >= b.y - PLAYER_HALF_HEIGHT - 1 && cy <= b.y + PLAYER_HALF_HEIGHT) return true;
    }
    return false;
  }

  /** Figuren, die in frisch gesetztem Gelände stecken, stehen wieder auf der Oberfläche (höchstens 6 px). */
  #hebeFiguren(x0, x1) {
    const world = this.#world;
    const terrain = this.#terrain;
    for (const b of this.#figurBoxen()) {
      const spalte = Math.floor(b.x);
      if (spalte < x0 || spalte > x1) continue;
      let y = b.y;
      for (let i = 0; i < 6 && terrain.isSolid(spalte, Math.floor(y + PLAYER_HALF_HEIGHT) - 1); i++) y -= 1;
      if (y !== b.y) {
        world.setComponent(b.id, 'Position', 'y', y);
        world.setComponent(b.id, 'Velocity', 'y', 0);
      }
    }
  }

  /** Zerstörungscharakter am Einschlag: Splitterstreuung, Erdbeben, Rutschen der Figuren am Rand. */
  #charakter(x, y, radius, art, nebenbrueche = 0) {
    if (art === 'splitter' && radius >= 12) this.#splitter(x, y, radius, nebenbrueche || null);
    else if (nebenbrueche > 0 && art === 'sprengung' && radius >= 12) this.#splitter(x, y, radius, nebenbrueche);
    if (art === 'beben' && (!this.#stoff || bebenWirkt(this.#stoffAmKrater))) this.#startBeben(x, y, radius);
    if (radius >= RUTSCH_MIN_RADIUS) this.#rutschNach(x, y, radius);
    if (this.#hang && art !== 'beben' && radius >= HANG_MIN_RADIUS) this.#startHang(x, y, radius);
  }

  /** Nebenlöcher rund um den Hauptkrater: kleine Dellen an Stellen, die wirklich Boden sind. */
  #splitter(x, y, radius, anzahl = null) {
    const terrain = this.#terrain;
    const n = anzahl ?? SPLITTER_MIN + Math.floor(zufall(x, y, radius) * SPLITTER_SPANNE);
    const sr = Math.max(3, Math.round(radius * 0.26));
    for (let i = 0; i < n; i++) {
      const d = radius * (1.05 + 0.55 * zufall(i, x, y));
      const r = SPLITTER_RICHTUNGEN[Math.floor(zufall(i, y, x + 99) * SPLITTER_RICHTUNGEN.length)];
      const sx = Math.round(x + r[0] * d);
      const sy = Math.round(y + r[1] * d);
      if (sx < 0 || sy < 0 || sx >= this.#breite || sy >= this.#hoehe || !terrain.isSolid(sx, sy)) continue;
      terrain.punchCrater(sx, sy, sr, 100);
      this.#events.emit('terrain_destroyed', { x: sx, y: sy, radius: sr, tiefe: 100, art: 'splitter' });
    }
  }

  /**
   * Figuren am Kraterrand verlieren den Halt und rutschen in den Krater: ein kleiner Schub zum
   * Loch hin, wenn der Boden dorthin abfällt. Den Rest tut die Schwerkraft des CharacterSystems.
   */
  #rutschNach(x, y, radius) {
    const world = this.#world;
    const terrain = this.#terrain;
    for (const b of this.#figurBoxen()) {
      const fuss = b.y + PLAYER_HALF_HEIGHT;
      const abstand = Math.abs(b.x - x);
      if (abstand < radius * 0.55 || abstand > radius * 1.3) continue;
      if (fuss < y - radius * 0.6 || fuss > y + radius * 0.4) continue;
      const richtung = x > b.x ? 1 : -1;
      const spalte = Math.floor(b.x);
      const reihe = Math.floor(fuss);
      if (!terrain.isSolid(spalte, reihe)) continue;
      // Fällt der Boden zum Krater hin ab (4 oder 10 px weiter liegt die Oberfläche mindestens 4 px tiefer)?
      let tiefer = -99;
      for (const weite of [4, 10]) {
        for (let r = reihe - 8; r < reihe + 40; r++) {
          if (terrain.isSolid(spalte + richtung * weite, r)) { tiefer = Math.max(tiefer, r - reihe); break; }
        }
      }
      if (tiefer < 4) continue;
      const vx = world.getComponent(b.id, 'Velocity', 'x') ?? 0;
      world.setComponent(b.id, 'Velocity', 'x', vx + richtung * RUTSCH_SCHUB * (0.6 + 0.4 * Math.min(1, radius / 50)));
    }
  }

  // ----------------------------------------------------- Aufprall der Insel

  /** Merkt eine gelandete Insel zur Nacharbeit vor, wenn sie hart genug aufgeschlagen ist. */
  #merkeAufprall(insel, dy) {
    const n = insel.zellen.length;
    const staerke = aufprallStaerke(n, dy);
    const weich = staerke >= WEICH_AB_STAERKE && dy >= WEICH_MIN_FALL && n >= WEICH_MIN_ZELLEN;
    // Fassung 5: Eis und Kristall brechen früher (größerer Inselbruch).
    const sproede = this.#stoff && insel.runs?.length > 1 && stoffById(stoffAm(this.#stoff, insel.runs[0], insel.runs[1])).bruechig >= 3;
    const bruch = !insel.gebrochen && staerke >= BRUCH_AB_STAERKE * (sproede ? 0.7 : 1) && n >= BRUCH_MIN_ZELLEN * (sproede ? 0.5 : 1) && dy >= BRUCH_MIN_FALL;
    if ((!weich && !bruch) || this.#nacharbeit.length >= 16) return;
    this.#nacharbeit.push({ insel, dy, staerke, weich, bruch });
  }

  /** Nimmt Zellen ersatzlos aus der Maske, loggt sie (`['x', ...]`) und meldet sie. */
  #entferne(keys, art) {
    const hoehe = this.#hoehe;
    for (const k of keys) {
      const x = Math.floor(k / hoehe);
      this.#terrain.setPixel(x, k - x * hoehe, false);
    }
    const runs = spaltenlaeufe(Int32Array.from(keys).sort(), hoehe);
    this.#terrain.logEintrag(['x', ...runs]);
    this.#events.emit('terrain_removed', { runs, art });
  }

  #nachArbeit({ insel, dy, staerke, weich, bruch }) {
    const runs = insel.runs;
    this.#nachkosten += runs.length / 3;
    if (weich) this.#zerbroesele(insel, dy, staerke);
    if (bruch) this.#brich(insel, dy);
  }

  /**
   * Der Rand der gelandeten Insel zerbröselt: kleine Brocken platzen ab und fliegen als einzelne
   * Zellen davon (Partikel-Zellen), die sich am Boden als Schutt wieder absetzen. Gewählt wird nur
   * an den äußeren Spalten (Oberkante und Fuß), deterministisch aus der Insel-Nummer.
   */
  #zerbroesele(insel, dy, staerke) {
    const hoehe = this.#hoehe;
    const terrain = this.#terrain;
    const runs = insel.runs;
    const platz = SCHUTT_MAX_GESAMT - this.#partikel.length;
    const n = insel.zellen.length;
    const ziel = Math.min(platz, SCHUTT_MAX_JE_LANDUNG, Math.round(Math.sqrt(n) * staerke * 1.1));
    if (ziel <= 0) return;
    let minX = Infinity;
    let maxX = -Infinity;
    let unterkante = 0;
    for (let i = 0; i < runs.length; i += 3) {
      minX = Math.min(minX, runs[i]);
      maxX = Math.max(maxX, runs[i]);
      unterkante = Math.max(unterkante, runs[i + 2]);
    }
    const band = Math.max(4, Math.round((maxX - minX + 1) * 0.18));
    const mitte = (minX + maxX) / 2;
    const kandidaten = [];
    for (let i = 0; i < runs.length; i += 3) {
      const x = runs[i];
      if (x - minX < band || maxX - x < band || (i / 3) % 7 === 0) {
        kandidaten.push(x, runs[i + 1] + dy, 1); // Oberkante: Brocken reichen nach unten
        kandidaten.push(x, runs[i + 2] + dy, -1); // Fuß: Brocken reichen nach oben
      }
    }
    const anzahl = kandidaten.length / 3;
    if (anzahl === 0) return;
    this.#nachkosten += anzahl;
    const neu = insel.zellen.map(k => k + dy); // aufsteigend wie `zellen`
    const weg = [];
    const teile = [];
    const gewaehlt = new Set();
    for (let i = 0; weg.length < ziel && i < ziel * 3; i++) {
      const c = Math.floor(zufall(insel.id, i, 7) * anzahl) * 3;
      const sx = kandidaten[c];
      const sy = kandidaten[c + 1];
      const senkrecht = kandidaten[c + 2];
      const seite = sx < mitte ? -1 : sx > mitte ? 1 : (i & 1 ? 1 : -1);
      const w = 1 + Math.floor(zufall(insel.id, i, 11) * 3);
      const h = 1 + Math.floor(zufall(insel.id, i, 13) * 3);
      for (let a = 0; a < w && weg.length < ziel; a++) {
        for (let b = 0; b < h && weg.length < ziel; b++) {
          const cx = sx - seite * a;
          const cy = sy + senkrecht * b;
          if (cx < 0 || cy < 0 || cx >= this.#breite || cy >= hoehe) continue;
          const k = cx * hoehe + cy;
          if (gewaehlt.has(k) || !terrain.isSolid(cx, cy) || !enthaelt(neu, k)) continue;
          gewaehlt.add(k);
          weg.push(k);
          const j = weg.length;
          teile.push(
            cx + 0.5, cy + 0.5,
            seite * (0.4 + 1.6 * zufall(insel.id, j, 17)) * (0.6 + 0.8 * staerke),
            -(0.3 + 1.9 * zufall(insel.id, j, 19)) * (0.5 + staerke) * (senkrecht > 0 ? 1 : 0.4),
          );
        }
      }
    }
    this.#nachkosten += weg.length;
    if (weg.length === 0) return;
    this.#entferne(weg, 'abplatz');
    for (let i = 0; i < teile.length; i += 4) {
      this.#partikel.push({ x: teile[i], y: teile[i + 1], vx: teile[i + 2], vy: teile[i + 3], alter: 0 });
    }
    this.#events.emit('terrain_crumble', { id: insel.id, staerke, x: Math.round(mitte), y: unterkante + dy, teile });
  }

  /**
   * Eine große Insel bricht beim harten Aufprall: ein gezackter Riss, an der Kante der Auflage.
   * Was darüber hinausragt, löst sich (neue Insel, fällt weiter); ragt nichts weit genug über,
   * bleibt es beim Riss. Eine schon gebrochene Insel bricht nicht noch einmal.
   */
  #brich(insel, dy) {
    const hoehe = this.#hoehe;
    const terrain = this.#terrain;
    const runs = insel.runs;
    let minX = Infinity;
    let maxX = -Infinity;
    for (let i = 0; i < runs.length; i += 3) { minX = Math.min(minX, runs[i]); maxX = Math.max(maxX, runs[i]); }
    let c0 = Infinity;
    let c1 = -Infinity;
    for (const k of insel.unten) {
      const x = Math.floor(k / hoehe);
      const y = k - x * hoehe + dy;
      if (terrain.isSolid(x, y + 1)) { c0 = Math.min(c0, x); c1 = Math.max(c1, x); }
    }
    this.#nachkosten += insel.unten.length;
    if (c0 > c1) return;
    const links = c0 - minX;
    const rechts = maxX - c1;
    const jitter = Math.floor(zufall(insel.id, 3, 5) * 4);
    let seite = 0;
    let xs;
    if (Math.max(links, rechts) >= BRUCH_MIN_UEBERSTAND) {
      seite = links >= rechts ? -1 : 1;
      xs = seite < 0 ? c0 - 1 - jitter : c1 + 1 + jitter;
    } else {
      xs = Math.floor((minX + maxX) / 2) + Math.floor(zufall(insel.id, 4, 6) * 7) - 3;
    }
    // Der Riss verläuft senkrecht (Spalten gehören ganz zu einem Teil, sonst verhakten sich die Hälften beim Fallen);
    // gezackt wirkt er durch die wechselnde Breite von 1 bis 3 Zellen.
    const lo = () => xs;
    const breit = y => 1 + Math.floor(zufall(y >> 1, insel.id, 29) * 3);
    const fuge = [];
    const abfall = [];
    const anderer = [];
    for (let i = 0; i < runs.length; i += 3) {
      const x = runs[i];
      for (let y = runs[i + 1] + dy; y <= runs[i + 2] + dy; y++) {
        if (!terrain.isSolid(x, y)) continue;
        const l = lo();
        const k = x * hoehe + y;
        if (x >= l && x < l + breit(y)) fuge.push(k);
        else if (seite === 0) (x < l ? abfall : anderer).push(k);
        else if ((x < l) === (seite < 0)) abfall.push(k);
        else anderer.push(k);
      }
    }
    this.#nachkosten += fuge.length + abfall.length + anderer.length;
    if (seite !== 0 ? abfall.length < 60 : Math.min(abfall.length, anderer.length) < 300) return;
    this.#entferne(fuge, 'bruch');
    if (seite !== 0) this.#starte(Int32Array.from(abfall), true);
  }

  // ------------------------------------------------------------- Schutt

  /** Fliegende Partikel-Zellen: Schwerkraft, Flug in Einzelschritten, Landung als Schutt. */
  #schuttSchritt() {
    const terrain = this.#terrain;
    const breite = this.#breite;
    const hoehe = this.#hoehe;
    const boxen = this.#figurBoxen();
    const gesetzt = [];
    const uebrig = [];
    for (const p of this.#partikel) {
      p.alter += 1;
      p.vy += SCHUTT_GRAVITATION;
      const schritte = Math.max(1, Math.ceil(Math.max(Math.abs(p.vx), Math.abs(p.vy))));
      let lx = Math.floor(p.x);
      let ly = Math.floor(p.y);
      let landet = false;
      let weg = false;
      for (let s = 1; s <= schritte; s++) {
        const cx = Math.floor(p.x + p.vx * s / schritte);
        const cy = Math.floor(p.y + p.vy * s / schritte);
        this.#nachkosten += 1;
        if (cx < 0 || cx >= breite || cy >= hoehe) { weg = true; break; }
        if (cy >= 0 && terrain.isSolid(cx, cy)) { landet = true; break; }
        lx = cx;
        ly = cy;
      }
      if (weg || (!landet && p.alter >= SCHUTT_LEBEN)) continue;
      if (!landet) {
        p.x += p.vx;
        p.y += p.vy;
        uebrig.push(p);
        continue;
      }
      // Aufprall: Ist unter der Zelle noch Luft (Decke getroffen, Wand gestreift), fällt sie weiter statt in der Luft zu hängen.
      if (ly + 1 < hoehe && !terrain.isSolid(lx, ly + 1)) {
        p.x = lx + 0.5;
        p.y = ly + 0.5;
        p.vx *= 0.3;
        p.vy = Math.max(0, p.vy * 0.2);
        uebrig.push(p);
        continue;
      }
      // Landung: höchstens vier Schritte die Böschung hinab (Schüttwinkel).
      for (let rutsch = 0; rutsch < 4; rutsch++) {
        const reihenfolge = (lx + ly) & 1 ? [-1, 1] : [1, -1];
        let bewegt = false;
        for (const d of reihenfolge) {
          if (lx + d < 0 || lx + d >= breite || ly + 1 >= hoehe) continue;
          if (!terrain.isSolid(lx + d, ly) && !terrain.isSolid(lx + d, ly + 1)) {
            lx += d;
            ly += 1;
            while (ly + 1 < hoehe && !terrain.isSolid(lx, ly + 1) && ly < hoehe - 1) ly += 1;
            bewegt = true;
            break;
          }
        }
        if (!bewegt) break;
      }
      this.#nachkosten += 1;
      if (ly < 0 || terrain.isSolid(lx, ly) || this.#inFigur(lx, ly, boxen)) continue; // wird zu Staub
      terrain.setPixel(lx, ly, true);
      gesetzt.push(lx, ly);
    }
    this.#partikel = uebrig;
    if (gesetzt.length > 0) {
      terrain.logEintrag(['p', ...gesetzt]);
      this.#events.emit('terrain_added', { zellen: gesetzt });
      let x0 = Infinity;
      let x1 = -Infinity;
      for (let i = 0; i < gesetzt.length; i += 2) { x0 = Math.min(x0, gesetzt[i]); x1 = Math.max(x1, gesetzt[i]); }
      this.#hebeFiguren(x0, x1);
    }
  }

  // ------------------------------------------------------------ Erdbeben

  #startBeben(x, y, radius) {
    const r = Math.max(BEBEN_MIN_RADIUS, Math.min(BEBEN_MAX_RADIUS, Math.round(radius * 1.1)));
    this.#events.emit('terrain_quake', { x, y, radius: r, staerke: Math.min(1, radius / 90) });
    if (this.#beben.length >= 4) return;
    const mx = Math.round(x);
    this.#beben.push({ y: Math.round(y), r, x0: mx - r, spalte: 0, tops: new Int32Array(2 * r + 1).fill(-1) });
  }

  /** Hangrutsch (Fassung 6): wie das Beben ein Abtastauftrag, aber ohne Erschütterung und nur für lose Stoffe. */
  #startHang(x, y, radius) {
    if (this.#beben.length >= 4) return;
    const r = Math.max(HANG_MIN_WIRKRADIUS, Math.min(HANG_MAX_WIRKRADIUS, Math.round(radius * HANG_RADIUS_FAKTOR)));
    const mx = Math.round(x);
    this.#beben.push({ y: Math.round(y), r, x0: mx - r, spalte: 0, hang: true, tops: new Int32Array(2 * r + 1).fill(-1) });
  }

  /** Ab welchem Höhenunterschied rutscht die oberste Zelle der Spalte `spalte`? (Beben: überall gleich; Hang: je Stoff, sonst nie.) */
  #steilheit(job, spalte) {
    if (!job.hang) return BEBEN_STEILHEIT;
    return HANG_STEILHEIT[stoffById(stoffAm(this.#stoff, job.x0 + spalte, job.tops[spalte])).key] ?? Infinity;
  }

  /** Oberflächen der Spalten abtasten (mit dem Rest des Suchbudgets); danach setzt sich das Gelände. */
  #bebenSchritt(rest) {
    const job = this.#beben[0];
    const terrain = this.#terrain;
    const yLo = Math.max(0, job.y - job.r - BEBEN_RAND);
    const yHi = Math.min(this.#hoehe - 1, job.y + job.r + BEBEN_RAND);
    while (job.spalte < job.tops.length && rest > 0) {
      const cx = job.x0 + job.spalte;
      let top = -1;
      if (cx >= 1 && cx < this.#breite - 1 && !terrain.isSolid(cx, yLo)) {
        for (let yy = yLo; yy <= yHi; yy++) {
          rest -= 1;
          this.#suchkosten += 1;
          if (terrain.isSolid(cx, yy)) { top = yy; break; }
        }
      } else {
        rest -= 1;
        this.#suchkosten += 1;
      }
      job.tops[job.spalte] = top;
      job.spalte += 1;
    }
    if (job.spalte < job.tops.length) return;
    this.#beben.shift();
    this.#setze(job);
  }

  /** Setzrutsch: Wo zwei Nachbarspalten steiler stehen als `BEBEN_STEILHEIT`, rutscht die oberste Zelle nach unten. */
  #setze(job) {
    const tops = job.tops;
    const n = tops.length;
    const boxen = this.#figurBoxen();
    const zuege = [];
    const zug = (von, nach) => {
      const xa = job.x0 + von;
      const xb = job.x0 + nach;
      const ya = tops[von];
      const yb = tops[nach] - 1;
      if (yb < 0 || !this.#terrain.isSolid(xa, ya + 1) || this.#terrain.isSolid(xb, yb) || this.#inFigur(xb, yb, boxen)) return;
      this.#terrain.setPixel(xa, ya, false);
      this.#terrain.setPixel(xb, yb, true);
      tops[von] = ya + 1;
      tops[nach] = yb;
      zuege.push(xa, ya, xb, yb);
    };
    for (let durchgang = 0; durchgang < 3; durchgang++) {
      for (let k = 0; k < n - 1 && zuege.length < BEBEN_MAX_ZUEGE * 4; k++) {
        const i = durchgang % 2 === 0 ? k : n - 2 - k;
        if (tops[i] < 0 || tops[i + 1] < 0) continue;
        const d = tops[i + 1] - tops[i];
        if (d >= this.#steilheit(job, i)) zug(i, i + 1);
        else if (-d >= this.#steilheit(job, i + 1)) zug(i + 1, i);
      }
    }
    this.#nachkosten += n * 3;
    if (zuege.length === 0) return;
    this.#terrain.logEintrag(['r', ...zuege]);
    this.#events.emit('terrain_slumped', { zuege });
    this.#hebeFiguren(job.x0, job.x0 + n);
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
