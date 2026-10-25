/**
 * Cookie, der Kater des Weltuntergangs — frei liegender NPC (Fassung 2).
 *
 * Er schläft oder frisst. Sein Hunger wächst; je größer, desto lauter das Miauen
 * (leise → laut → Hungerwut). Der Spieler kann ihn füttern (Berühren im Laufen,
 * eine Kiste in den Futternapf-Bereich legen) und kuscheln (still danebenstehen).
 * Wird er nicht satt, tobt er und zerstört Gelände, Kisten und trifft Figuren.
 * Sehr selten spielt er — dann geht eine kosmische Schockwelle über die Karte.
 *
 * Das System entscheidet allein und meldet Ereignisse; die Wirkungen auf die Welt
 * laufen über die Handgriffe aus `engine/tierKontext.js`. Zufall nur über den
 * eigenen Teilgenerator `COOKIE`.
 *
 * @module cookieSystem
 */
import {
  COOKIE_HUNGER, cookieWut, cookieHunger, COOKIE_SPIELEN, COOKIE_IDENTITY,
  cookieStufe, cookiePflege, COOKIE_KATER,
} from '../../shared/config/cookie.js';

export class CookieSystem {
  #rng;
  #x;
  #y = 0;
  #richtung = 1;
  #hunger;
  #pose = 'schlafen';
  /** Erzwungene Pose `{name, ticks}` (Fressen, Putzen, Kuscheln, Strecken, Spielen, Erschöpfung). */
  #zwang = null;
  #stufe = 'schlaf';
  #rufTimer = 0;
  #runde = 0;
  #tick = 0;
  /** Tick der Wut seit Beginn (0 = nicht in Wut). */
  #wutTicks = 0;
  #spielenRest = 0;
  #seitenlage = false;
  #fuetterSperre = 0;
  /** Spieler -> Tick, bis zu dem er nicht erneut kuscheln kann. */
  #kuschelSperre = new Map();
  /** Spieler -> Anzahl Ticks regungslos in Reichweite. */
  #still = new Map();
  /** Spieler -> Tick, bis zu dem er nicht erneut getroffen wird. */
  #schlagSperre = new Map();
  #letztePosition = new Map();
  #gefuettert = 0;
  #gekuschelt = 0;
  #gewuetet = 0;
  #gespielt = 0;
  /** Pflegewerte der Fassung (ab 3 gemäßigt). */
  #pf;
  /** Tick, ab dem der Futternapf wieder eine Kiste frisst (Fassung 3). */
  #napfSperre = 0;
  #wut;
  #hu;
  /** Wie oft ein Spieler schon mit Cookie gekuschelt hat (Fassung 3: Höchstzahl `kuschelnMax`). */
  #kuschelZahl = new Map();

  constructor({ rng, width, height, fassung = COOKIE_KATER }) {
    if (!rng || typeof rng.next !== 'function') throw new TypeError('CookieSystem benötigt einen RNG mit next()');
    this.#rng = rng;
    this.#pf = cookiePflege(fassung);
    this.#wut = cookieWut(fassung);
    this.#hu = cookieHunger(fassung);
    this.width = width;
    this.height = height;
    // Feste Reihenfolge der Ziehungen: Ort, Starthunger, Seitenlage.
    this.#x = Math.round(width * (0.35 + rng.next() * 0.3));
    this.#hunger = rng.nextInt(COOKIE_HUNGER.start[0], COOKIE_HUNGER.start[1]);
    this.#seitenlage = rng.nextBoolean(0.5);
    this.#stufe = cookieStufe(this.#hunger);
    this.#rufTimer = COOKIE_HUNGER.rufTakt.leise;
  }

  get hunger() { return this.#hunger; }
  get stufe() { return this.#stufe; }
  get pose() { return this.#pose; }
  get position() { return { x: this.#x, y: this.#y }; }

  /** Setzt Cookie an eine Stelle — nur für Messungen und Tests (LOOK-4). */
  setzePosition(x, y) {
    this.#x = x;
    this.#y = y;
  }
  get tobt() { return this.#wutTicks > 0; }

  /** Rundenwechsel: hier wird (extrem selten) gespielt. */
  setRunde(runde) {
    if (runde === this.#runde) return;
    this.#runde = runde;
    // Genau EIN Wurf je Rundenwechsel — unabhängig davon, ob er gerade spielen könnte.
    const wurf = this.#rng.next();
    if (wurf < COOKIE_SPIELEN.chanceProRunde && this.#spielenRest === 0 && this.#wutTicks === 0) {
      this.#spielenRest = COOKIE_SPIELEN.ticks;
      this.#zwang = null;
      this.#gespielt += 1;
    }
  }

  /** Erzwingt das Spielen (nur für Tests und Werkzeuge). */
  erzwingeSpielen() {
    this.#spielenRest = COOKIE_SPIELEN.ticks;
    this.#zwang = null;
    this.#wutTicks = 0;
    this.#gespielt += 1;
  }

  #zwinge(name, ticks) { this.#zwang = { name, ticks }; }

  #naechster(world, ids) {
    let best = null;
    let bestD = Infinity;
    for (const id of ids) {
      if (!world.isActive(id)) continue;
      const d = Math.hypot((world.getComponent(id, 'Position', 'x') ?? 0) - this.#x, (world.getComponent(id, 'Position', 'y') ?? 0) - this.#y);
      if (d < bestD) { bestD = d; best = id; }
    }
    return best;
  }

  #fuettere(menge, wie, kontext, spielerId) {
    this.#hunger = Math.max(0, this.#hunger - menge);
    this.#gefuettert += 1;
    this.#wutTicks = 0;
    kontext.melde('cookie_gefuettert', { wie, playerId: spielerId, hunger: Math.round(this.#hunger), x: this.#x, y: this.#y });
  }

  /**
   * Ein Simulationsschritt.
   *
   * @param {object} world
   * @param {object} kontext - wie bei Günther (`spielerIds`, `aktiverSpieler`, `surfaceYAt`, `melde`)
   *   plus die Handgriffe aus `baueTierKontext`.
   */
  update(world, kontext) {
    this.#tick += 1;
    const ids = kontext.spielerIds ?? [];

    // --- Hunger ----------------------------------------------------------
    const schlaeft = this.#pose === 'schlafen' || this.#pose === 'schlafen_seite';
    this.#hunger = Math.min(COOKIE_HUNGER.max, this.#hunger + this.#hu.proTick * (schlaeft ? COOKIE_HUNGER.schlafFaktor : 1));

    // --- Spielen: kosmische Schockwelle -------------------------------------
    if (this.#spielenRest > 0) {
      const vergangen = COOKIE_SPIELEN.ticks - this.#spielenRest;
      if (vergangen === 0) kontext.melde('cookie_spielt', { x: this.#x, y: this.#y });
      if (vergangen === COOKIE_SPIELEN.wirkung) this.#schockwelle(world, ids, kontext);
      this.#spielenRest -= 1;
      this.#pose = 'spielen';
      this.#bodenFolgen(kontext);
      this.#positionen(world, ids);
      return;
    }

    // --- Futter und Zuwendung ----------------------------------------------
    if (this.#fuetterSperre > 0) this.#fuetterSperre -= 1;
    this.#pflege(world, ids, kontext);

    // --- Stufe und Rufe -----------------------------------------------------
    const stufe = cookieStufe(this.#hunger);
    if (stufe !== this.#stufe) {
      const vorher = this.#stufe;
      this.#stufe = stufe;
      if (vorher === 'schlaf' && stufe === 'leise') this.#zwinge('strecken', 50);
      if (stufe !== 'schlaf') this.#rufTimer = 0;
    }
    if (this.#stufe !== 'schlaf' && !(this.#zwang && this.#zwang.name === 'fressen')) {
      this.#rufTimer -= 1;
      if (this.#rufTimer <= 0) {
        this.#rufTimer = COOKIE_HUNGER.rufTakt[this.#stufe];
        kontext.melde('cookie_miau', {
          stufe: this.#stufe, pegel: COOKIE_HUNGER.pegel[this.#stufe], hunger: Math.round(this.#hunger),
          x: this.#x, y: this.#y,
        });
      }
    }

    // --- Toben --------------------------------------------------------------
    if (this.#stufe === 'wut' && !this.#zwang) {
      if (this.#wutTicks === 0) {
        this.#gewuetet += 1;
        kontext.melde('cookie_tobt', { x: this.#x, y: this.#y, hunger: Math.round(this.#hunger) });
      }
      this.#wutTicks += 1;
      this.#toben(world, ids, kontext);
      if (this.#wutTicks >= this.#wut.maxTicks) {
        this.#wutTicks = 0;
        this.#hunger = this.#wut.erschoepftHunger;
        this.#stufe = cookieStufe(this.#hunger);
        this.#zwinge('liegen', this.#wut.erschoepftTicks);
        kontext.melde('cookie_erschoepft', { x: this.#x, y: this.#y });
      }
    } else {
      this.#wutTicks = 0;
      this.#geht = false;
      if (this.#stufe === 'laut' && !this.#zwang) this.#zurKiste(kontext);
    }

    // --- Pose ---------------------------------------------------------------
    this.#waehlePose();
    this.#bodenFolgen(kontext);
    this.#positionen(world, ids);
  }

  #waehlePose() {
    if (this.#zwang) {
      this.#pose = this.#zwang.name;
      if (--this.#zwang.ticks <= 0) {
        const fertig = this.#zwang.name;
        this.#zwang = null;
        // Nach dem Fressen wird geputzt, danach (satt) gelegen.
        if (fertig === 'fressen' || fertig === 'brot') this.#zwinge('putzen', this.#pf.putzenTicks);
        else if (fertig === 'putzen' && this.#stufe === 'schlaf') this.#zwinge('liegen', 80);
        else if (fertig === 'liegen' && this.#stufe === 'schlaf') this.#seitenlage = !this.#seitenlage;
      }
      return;
    }
    switch (this.#stufe) {
      case 'wut': this.#pose = 'hungerwut'; break;
      case 'laut': this.#pose = this.#geht ? 'gehen' : 'miau_laut'; break;
      case 'leise': this.#pose = 'miau_leise'; break;
      default: this.#pose = this.#seitenlage ? 'schlafen_seite' : 'schlafen';
    }
  }

  #geht = false;

  /** Bei „laut" geht er zu einer Kiste in Reichweite und frisst sie (Futternapf). */
  #zurKiste(kontext) {
    const suchweite = this.#pf.kistenSuchAnteil * this.width;
    let ziel = null;
    let best = Infinity;
    for (const k of kontext.kisten?.() ?? []) {
      const d = Math.abs(k.x - this.#x);
      if (d <= suchweite && d < best) { best = d; ziel = k; }
    }
    if (!ziel) return;
    if (best > this.#pf.napfRadius * 0.5) {
      this.#richtung = ziel.x >= this.#x ? 1 : -1;
      this.#x += this.#richtung * this.#pf.gehTempoAnteil * this.width;
      this.#geht = true;
    }
  }

  #pflege(world, ids, kontext) {
    // Futternapf: eine liegende Kiste in der Nähe wird gefressen.
    if ((!this.#zwang || this.#zwang.name !== 'fressen') && this.#napfSperre <= this.#tick) {
      for (const k of kontext.kisten?.() ?? []) {
        if (Math.hypot(k.x - this.#x, k.y - this.#y) > this.#pf.napfRadius) continue;
        if (this.#hunger < (this.#pf.napfAbHunger ?? COOKIE_HUNGER.stufen.leise)) break; // satt: lässt sie liegen
        kontext.kisteVerzehren?.(k.id);
        this.#napfSperre = this.#tick + (this.#pf.napfSperre ?? 0);
        this.#fuettere(this.#pf.napfHunger, 'napf', kontext, null);
        this.#zwinge('brot', this.#pf.fressenTicks);
        break;
      }
    }
    const aktiv = kontext.aktiverSpieler ?? null;
    for (const id of ids) {
      if (!world.isActive(id)) continue;
      const x = world.getComponent(id, 'Position', 'x') ?? 0;
      const y = world.getComponent(id, 'Position', 'y') ?? 0;
      const vorher = this.#letztePosition.get(id);
      const bewegt = vorher ? Math.hypot(x - vorher.x, y - vorher.y) : 0;
      const abstand = Math.hypot(x - this.#x, y - this.#y);

      // Füttern: beim Laufen berührt (wie Günthers Rad).
      if (id === aktiv && this.#fuetterSperre === 0 && abstand <= this.#pf.fuetternRadius
        && bewegt >= this.#pf.fuetternMinBewegung && this.#hunger >= COOKIE_HUNGER.stufen.leise) {
        this.#fuetterSperre = this.#pf.fuetternSperre;
        this.#fuettere(this.#pf.fuetternHunger, 'hand', kontext, id);
        this.#zwinge('fressen', this.#pf.fressenTicks);
        kontext.heile?.(id, this.#pf.fuetternHeilung);
        continue;
      }
      // Kuscheln: still danebenstehen, solange er nicht tobt.
      if (abstand <= this.#pf.kuschelnRadius && bewegt < this.#pf.fuetternMinBewegung && this.#wutTicks === 0 && !this.#zwang) {
        const still = (this.#still.get(id) ?? 0) + 1;
        this.#still.set(id, still);
        const genug = (this.#kuschelZahl.get(id) ?? 0) >= (this.#pf.kuschelnMax ?? Infinity);
        if (still >= this.#pf.kuschelnStillTicks && !genug && (this.#kuschelSperre.get(id) ?? 0) <= this.#tick) {
          this.#kuschelZahl.set(id, (this.#kuschelZahl.get(id) ?? 0) + 1);
          this.#kuschelSperre.set(id, this.#tick + this.#pf.kuschelnSperre);
          this.#still.set(id, 0);
          this.#gekuschelt += 1;
          this.#hunger = Math.max(0, this.#hunger - this.#pf.kuschelnHunger);
          this.#zwinge('kuscheln', this.#pf.kuschelnTicks);
          kontext.heile?.(id, this.#pf.kuschelnHeilung);
          kontext.melde('cookie_kuschelt', { playerId: id, amount: this.#pf.kuschelnHeilung, x: this.#x, y: this.#y });
        }
      } else {
        this.#still.set(id, 0);
      }
    }
  }

  /** Toben: auf den nächsten Spieler zu, alles auf dem Weg zerstören. */
  #toben(world, ids, kontext) {
    const ziel = this.#naechster(world, ids);
    if (ziel !== null) {
      const zx = world.getComponent(ziel, 'Position', 'x') ?? this.#x;
      this.#richtung = zx >= this.#x ? 1 : -1;
    }
    this.#x += this.#richtung * this.#wut.tempoAnteil * this.width;
    this.#x = Math.max(40, Math.min(this.width - 40, this.#x));
    this.#bodenFolgen(kontext);
    if (this.#wutTicks % this.#wut.kraterTakt === 0) {
      kontext.krater?.(this.#x, this.#y - 12, this.#wut.kraterRadius, this.#wut.kraterTiefe);
      const n = kontext.zerstoereObjekte?.(this.#x, this.#y - 12, this.#wut.objektRadius) ?? 0;
      kontext.melde('cookie_zerstoert', { x: this.#x, y: this.#y, radius: this.#wut.kraterRadius, objekte: n });
    }
    for (const id of ids) {
      if (!world.isActive(id)) continue;
      const px = world.getComponent(id, 'Position', 'x') ?? 0;
      const py = world.getComponent(id, 'Position', 'y') ?? 0;
      if (Math.hypot(px - this.#x, py - this.#y) > this.#wut.schlagRadius) continue;
      if ((this.#schlagSperre.get(id) ?? 0) > this.#tick) continue;
      this.#schlagSperre.set(id, this.#tick + this.#wut.schlagSperre);
      kontext.schaden?.(id, this.#wut.schlagSchaden);
      kontext.stosse?.(id, (px >= this.#x ? 1 : -1) * this.#wut.stossX, this.#wut.stossY);
      kontext.melde('cookie_schlag', { playerId: id, amount: this.#wut.schlagSchaden, x: px, y: py });
    }
  }

  /** Kosmische Schockwelle: Krater-Ringe, Stoß und (nie tödlicher) Schaden in großem Umkreis. */
  #schockwelle(world, ids, kontext) {
    const radius = COOKIE_SPIELEN.radiusAnteil * this.width;
    for (const faktor of COOKIE_SPIELEN.ringe) {
      const x = this.#x + faktor * COOKIE_SPIELEN.kraterRadius;
      if (x < 0 || x >= this.width) continue;
      const spalte = Math.round(x);
      const boden = kontext.bodenNahe?.(spalte, this.#y) ?? kontext.surfaceYAt?.(spalte) ?? this.#y;
      kontext.krater?.(x, boden + 4, COOKIE_SPIELEN.kraterRadius, COOKIE_SPIELEN.kraterTiefe);
    }
    let getroffen = 0;
    for (const id of ids) {
      if (!world.isActive(id)) continue;
      const px = world.getComponent(id, 'Position', 'x') ?? 0;
      const py = world.getComponent(id, 'Position', 'y') ?? 0;
      const d = Math.hypot(px - this.#x, py - this.#y);
      if (d > radius) continue;
      const nah = 1 - d / radius;
      const schaden = COOKIE_SPIELEN.schadenMin + (COOKIE_SPIELEN.schadenMax - COOKIE_SPIELEN.schadenMin) * nah;
      kontext.schadenNichtToedlich?.(id, schaden);
      kontext.stosse?.(id, (px >= this.#x ? 1 : -1) * COOKIE_SPIELEN.stossX * (0.4 + nah), COOKIE_SPIELEN.stossY * (0.4 + nah));
      getroffen += 1;
    }
    kontext.zerstoereObjekte?.(this.#x, this.#y, radius * 0.5);
    kontext.melde('cookie_schockwelle', { x: this.#x, y: this.#y, radius: Math.round(radius), getroffen });
  }

  #bodenFolgen(kontext) {
    this.#x = Math.max(40, Math.min(this.width - 40, this.#x));
    const spalte = Math.round(this.#x);
    /*
     * LOOK-4 Stufe 1 (2026-10-25): Boden um die BISHERIGE Hoehe suchen, nicht
     * die Oberflaeche nehmen — sonst sitzt Cookie ueber dem Hohlraum, in dem
     * der Spieler steht. Ohne durchgereichte Abfrage bleibt es beim Alten.
     */
    const boden = kontext.bodenNahe?.(spalte, this.#y) ?? kontext.surfaceYAt?.(spalte) ?? 0;
    if (boden > 0) this.#y = boden;
  }

  #positionen(world, ids) {
    for (const id of ids) {
      if (!world.isActive(id)) continue;
      this.#letztePosition.set(id, { x: world.getComponent(id, 'Position', 'x') ?? 0, y: world.getComponent(id, 'Position', 'y') ?? 0 });
    }
  }

  /** Serialisierbare Momentaufnahme (Replay-Hash und Anzeige). */
  snapshot() {
    return {
      aktiv: true,
      x: Number(this.#x.toFixed(1)),
      y: Number(this.#y.toFixed(1)),
      richtung: this.#richtung,
      hunger: Math.round(this.#hunger),
      stufe: this.#stufe,
      pose: this.#pose,
      tobt: this.tobt,
      gefuettert: this.#gefuettert,
      gekuschelt: this.#gekuschelt,
      gewuetet: this.#gewuetet,
      gespielt: this.#gespielt,
      identity: COOKIE_IDENTITY,
    };
  }
}

export default CookieSystem;
