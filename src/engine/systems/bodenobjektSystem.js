/**
 * Bodenobjekte: Minen (Bodenobjektfassung 2, `config/bodenobjekte.js`).
 *
 * ## Regeln (Auftraggeber, 2026-10-29)
 *
 * - Jede Mine ist sofort scharf — abgeworfen, abgelegt oder liegend vom Kartenaufbau.
 * - Sie löst aus, sobald eine Figur (auch eine eigene, auch der Werfer) in den Auslöseradius kommt.
 * - Je Auslösung entscheidet EINE Zufallszahl aus dem Seed-Zweig `BODENOBJEKTE`: 80 % normale Explosion,
 *   5 % Superexplosion (doppelter Schaden), 15 % Blindgänger (wirkungslos, löst nie wieder aus).
 * - Explosionen lösen Minen in ihrem Wirkradius aus (Kettenreaktion).
 *
 * ## Bauweise
 *
 * Das System hält schlichte Einträge, keine ECS-Entities — wie die Geschütze (`match.js#deployTurret`). Es kennt
 * die Welt nur über die Abfragen `q` und über `world` für die Explosionswirkung (`engine/explosion.js`, dieselbe
 * wie beim Geschoss). Alles läuft in Takten; es gibt weder Wanduhr noch `Math.random`.
 *
 * ## Determinismus
 *
 * Mine nach Kennung aufsteigend, Figur nach Entity-ID aufsteigend, eine Zufallszahl je Auslösung in dieser
 * Reihenfolge. Die Kette arbeitet eine Warteschlange in fester Reihenfolge ab und ist je Takt begrenzt
 * (`MINEN.kettenProTakt`); der Rest bleibt als `ausgeloest` markiert und läuft im nächsten Takt weiter.
 *
 * @module BodenobjektSystem
 */
import { COMPONENT_SIGNATURES } from '../ecs/world.js';
import { MINEN, FAESSER, MINEN_AUSGANG, minenAusgang } from '../../shared/config/bodenobjekte.js';
import { damageTypeId } from '../damageTypes.js';
import { wendeExplosionAn } from '../explosion.js';
import { freierPlatz } from '../turret.js';

/** Herkunft einer Mine (steht im Zustand und im Ereignis, die Anzeige kann sie unterscheiden). */
export const MINEN_ART = Object.freeze({ ABGEWORFEN: 'abgeworfen', ABGELEGT: 'abgelegt', LIEGEND: 'liegend' });

/** Art des Bodenobjekts. */
export const OBJEKT_TYP = Object.freeze({ MINE: 'mine', FASS: 'fass' });

export class BodenobjektSystem {
  #rng;
  #world;
  #events;
  #q;
  #faesser;
  #abwurf;
  #minen = new Map();
  #naechsteId = 1;

  /**
   * @param {object} optionen
   * @param {object} optionen.rng - Seed-Zweig `BODENOBJEKTE`
   * @param {object} optionen.world - ECS-Welt (für Figuren und Explosionswirkung)
   * @param {object} optionen.events - Ereigniswarteschlange des Matches
   * @param {boolean} [optionen.abwurf=false] - Bodenobjektfassung 4: Fässer fallen wie Kisten vom Himmel (`rundenWurf`)
   * @param {boolean} [optionen.faesser=false] - Bodenobjektfassung 3: liegende Fässer und Explosionsketten über Fässer
   * @param {object} optionen.q - Abfragen: `breite`, `surfaceYAt(x)`, `bodenNahe(x, y)`, `waterLevelAt(x, y)`,
   *   `startplaetze()` → [{x, y}] (Mindestabstand zu liegenden Minen)
   */
  constructor({ rng, world, events, q, faesser = false, abwurf = false }) {
    this.#faesser = faesser;
    this.#abwurf = abwurf;
    this.#rng = rng;
    this.#world = world;
    this.#events = events;
    this.#q = q;
  }

  get anzahl() { return this.#minen.size; }

  /**
   * Die Mine der Waffenfassung 12: vor die Figur legen oder weiter weg werfen (Entfernung nach der Kraft).
   *
   * Entfernung = `kraft * MINEN.wurfWeite`, mindestens `MINEN.ablegeAbstand` und höchstens `MINEN.wurfMax`. Sie ist
   * größer als der Auslöseradius, damit „ablegen“ nicht „sich selbst sprengen“ heißt. Der Ort ist der Boden an dieser Stelle
   * (freier, trockener Platz in der Nähe, wie beim Geschütz); es gibt keine Flugbahn.
   *
   * @param {number} figurX
   * @param {number} figurY
   * @param {number} seite - −1 links, 1 rechts
   * @param {number} kraft - Schusskraft in Punkten (0 bis 100)
   * @returns {object|null} der Eintrag, `null` ohne freien Platz oder bei voller Karte
   */
  wirf(figurX, figurY, seite, kraft, { ownerId = null, teamId = null } = {}) {
    const abstand = Math.min(MINEN.wurfMax, Math.max(MINEN.ablegeAbstand, (Number(kraft) || 0) * MINEN.wurfWeite));
    const platz = freierPlatz({
      breite: this.#q.breite,
      surfaceYAt: x => this.#q.surfaceYAt(x),
      bodenNahe: (x, y) => this.#q.bodenNahe(x, y),
      waterLevelAt: (x, y) => this.#q.waterLevelAt(x, y),
    }, figurX + (seite < 0 ? -1 : 1) * abstand, figurY);
    if (!platz) return null;
    return this.lege(platz.x, platz.y, {
      ownerId, teamId, art: abstand > MINEN.ablegeAbstand ? MINEN_ART.ABGEWORFEN : MINEN_ART.ABGELEGT,
    });
  }

  /** Zustand für Anzeige, Hash und Netz: feste Reihenfolge (Kennung aufsteigend), nur Zahlen und Kennworte. */
  snapshot() {
    return [...this.#minen.values()]
      .sort((a, b) => a.id - b.id)
      .map(m => ({
        id: m.id, typ: m.typ, x: m.x, y: m.y, ownerId: m.ownerId, teamId: m.teamId, art: m.art,
        blindgaenger: m.blindgaenger, ausgeloest: m.ausgeloest, fallend: Boolean(m.fallend),
      }));
  }

  /**
   * Legt eine Mine. Sie ist sofort scharf.
   *
   * @returns {object|null} der Eintrag, `null` bei voller Karte
   */
  lege(x, y, { ownerId = null, teamId = null, art = MINEN_ART.ABGELEGT, typ = OBJEKT_TYP.MINE, landetBeiTick = null } = {}) {
    if (this.#minen.size >= MINEN.maximum) return null;
    const mine = {
      id: this.#naechsteId, typ, x: Math.round(x), y: Math.round(y), ownerId, teamId, art,
      blindgaenger: false, ausgeloest: false, fallend: landetBeiTick !== null, landetBeiTick,
    };
    this.#naechsteId += 1;
    this.#minen.set(mine.id, mine);
    if (typ === OBJEKT_TYP.FASS && landetBeiTick !== null) {
      this.#events.emit('fass_abgeworfen', { fassId: mine.id, x: mine.x, y: mine.y, flugTicks: FAESSER.flugTicks });
    } else if (typ === OBJEKT_TYP.FASS) {
      this.#events.emit('fass_placed', { fassId: mine.id, x: mine.x, y: mine.y });
    } else {
      this.#events.emit('mine_placed', {
        mineId: mine.id, x: mine.x, y: mine.y, ownerId, teamId, art,
      });
    }
    return mine;
  }

  /**
   * Eine Explosion irgendwo (Geschoss, Mine, Fass): Objekte, die sie erreicht, lösen mit aus (Kettenreaktion).
   * Aufgerufen von `engine/explosion.js` für JEDE Explosion der Partie. Ein Blindgänger und ein schon ausgelöstes Objekt bleiben unberührt.
   * Fässer lösen nur mit Bodenobjektfassung 3 aus; Minen ab Fassung 2.
   */
  explosionBei(x, y, radius) {
    for (const objekt of this.#minen.values()) {
      if (objekt.blindgaenger || objekt.ausgeloest || objekt.fallend) continue; // ein fliegendes Fass ist nicht sprengbar
      if (objekt.typ === OBJEKT_TYP.FASS && !this.#faesser) continue;
      const reichweite = radius + (objekt.typ === OBJEKT_TYP.FASS ? FAESSER.halbeBreite : 0);
      if (Math.hypot(objekt.x - x, objekt.y - y) <= reichweite) objekt.ausgeloest = true;
    }
  }

  /**
   * Liegende Minen des Kartenaufbaus: Anzahl und Orte aus dem Seed.
   *
   * Je Mine eine feste Zahl von Ziehungen (`VERSUCHE`), damit der Zufallsstrom unabhängig vom Erfolg gleich
   * viel verbraucht. Abstand zu Startplätzen und untereinander, nur trockener Boden.
   */
  setzeLiegende() {
    const anzahl = MINEN.liegendMin + this.#rng.nextIntBelow(MINEN.liegendMax - MINEN.liegendMin + 1);
    const VERSUCHE = 12;
    const start = this.#q.startplaetze();
    for (let i = 0; i < anzahl; i += 1) {
      let gesetzt = false;
      for (let versuch = 0; versuch < VERSUCHE; versuch += 1) {
        const zufall = this.#rng.next(); // immer gezogen, auch nach dem Erfolg
        if (gesetzt) continue;
        const x = Math.round(zufall * this.#q.breite);
        const platz = freierPlatz({
          breite: this.#q.breite,
          surfaceYAt: sx => this.#q.surfaceYAt(sx),
          bodenNahe: null,
          waterLevelAt: (sx, sy) => this.#q.waterLevelAt(sx, sy),
        }, x, null);
        if (!platz) continue;
        const nahBeiStart = start.some(s => Math.abs(s.x - platz.x) < MINEN.liegendAbstandStart);
        const nahBeiMine = [...this.#minen.values()].some(m => Math.abs(m.x - platz.x) < MINEN.liegendAbstandUntereinander);
        if (nahBeiStart || nahBeiMine) continue;
        if (this.lege(platz.x, platz.y, { art: MINEN_ART.LIEGEND })) gesetzt = true;
      }
    }
    if (this.#faesser) this.#setzeFaesser(start);
  }

  /** Liegende Fässer (Bodenobjektfassung 3): wie die liegenden Minen, mit eigener Anzahl und denselben Abständen. */
  #setzeFaesser(start) {
    const anzahl = FAESSER.liegendMin + this.#rng.nextIntBelow(FAESSER.liegendMax - FAESSER.liegendMin + 1);
    const VERSUCHE = 12;
    for (let i = 0; i < anzahl; i += 1) {
      let gesetzt = false;
      for (let versuch = 0; versuch < VERSUCHE; versuch += 1) {
        const zufall = this.#rng.next();
        if (gesetzt) continue;
        const platz = freierPlatz({
          breite: this.#q.breite,
          surfaceYAt: sx => this.#q.surfaceYAt(sx),
          bodenNahe: null,
          waterLevelAt: (sx, sy) => this.#q.waterLevelAt(sx, sy),
        }, Math.round(zufall * this.#q.breite), null);
        if (!platz) continue;
        const nahBeiStart = start.some(s => Math.abs(s.x - platz.x) < MINEN.liegendAbstandStart);
        const nahBeiAnderem = [...this.#minen.values()].some(m => Math.abs(m.x - platz.x) < MINEN.liegendAbstandUntereinander);
        if (nahBeiStart || nahBeiAnderem) continue;
        if (this.lege(platz.x, platz.y, { art: MINEN_ART.LIEGEND, typ: OBJEKT_TYP.FASS })) gesetzt = true;
      }
    }
  }

  /**
   * Abwurf (Bodenobjektfassung 4): je Runde mit `FAESSER.abwurfChance` fällt ein Fass wie eine Kiste vom Himmel.
   * Aufgerufen zum Rundenbeginn. Der Landeplatz steht sofort fest (freier, trockener Boden); bis zur Landung
   * (`FAESSER.flugTicks`) ist das Fass nicht sprengbar. Zwei Ziehungen je Runde, unabhängig vom Erfolg (fester Zufallsstrom).
   */
  rundenWurf() {
    if (!this.#abwurf) return;
    const chance = this.#rng.next();
    const zufallX = this.#rng.next();
    if (chance >= FAESSER.abwurfChance) return;
    if ([...this.#minen.values()].filter(o => o.typ === OBJEKT_TYP.FASS).length >= FAESSER.maximum) return;
    const links = FAESSER.abwurfRand;
    const x = Math.round(links + zufallX * (this.#q.breite - 2 * links));
    const platz = freierPlatz({
      breite: this.#q.breite,
      surfaceYAt: sx => this.#q.surfaceYAt(sx),
      bodenNahe: null,
      waterLevelAt: (sx, sy) => this.#q.waterLevelAt(sx, sy),
    }, x, null);
    if (!platz) return;
    this.lege(platz.x, platz.y, {
      art: MINEN_ART.LIEGEND, typ: OBJEKT_TYP.FASS, landetBeiTick: this.#world.tickCount + FAESSER.flugTicks,
    });
  }

  /** Ein Takt: Landungen, dann Figuren im Auslöseradius; die Kette läuft in fester Reihenfolge ab. */
  update() {
    if (this.#minen.size === 0) return;

    // 0. Abgeworfene Fässer, deren Flugzeit um ist, stehen jetzt (sprengbar ab diesem Takt).
    for (const objekt of this.#sortierte()) {
      if (objekt.fallend && this.#world.tickCount >= objekt.landetBeiTick) {
        objekt.fallend = false;
        this.#events.emit('fass_gelandet', { fassId: objekt.id, x: objekt.x, y: objekt.y });
      }
    }

    // 1. Neue Auslösungen durch Figuren (Mine nach Kennung, Figur nach Entity-ID).
    const figuren = this.#figuren();
    if (figuren.length > 0) {
      for (const mine of this.#sortierte()) {
        if (mine.typ === OBJEKT_TYP.FASS || mine.blindgaenger || mine.ausgeloest) continue; // Fässer lösen nur durch Explosionen aus
        const r = MINEN.ausloeseRadius;
        if (figuren.some(f => Math.abs(f.x - mine.x) <= r && Math.abs(f.y - mine.y) <= r)) mine.ausgeloest = true;
      }
    }

    // 2. Warteschlange abarbeiten (auch Reste aus dem vorigen Takt), höchstens `kettenProTakt` Auslösungen.
    let bearbeitet = 0;
    for (;;) {
      const naechste = this.#sortierte().find(m => m.ausgeloest && !m.blindgaenger);
      if (!naechste || bearbeitet >= MINEN.kettenProTakt) break;
      this.#ausloesen(naechste);
      bearbeitet += 1;
    }
  }

  #sortierte() {
    return [...this.#minen.values()].sort((a, b) => a.id - b.id);
  }

  #figuren() {
    const welt = this.#world;
    const ids = welt.getEntitiesBySignature(COMPONENT_SIGNATURES.POSITION | COMPONENT_SIGNATURES.HEALTH);
    return [...ids].sort((a, b) => a - b)
      .filter(id => welt.isActive(id) && (welt.getComponent(id, 'Health', 'current') || 0) > 0)
      .map(id => ({ id, x: welt.getComponent(id, 'Position', 'x') || 0, y: welt.getComponent(id, 'Position', 'y') || 0 }));
  }

  /** Eine Auslösung: Ausgang würfeln, Blindgänger markieren oder explodieren lassen und die Kette weitergeben. */
  #ausloesen(mine) {
    if (mine.typ === OBJEKT_TYP.FASS) { this.#sprengeFass(mine); return; }
    const ausgang = minenAusgang(this.#rng.next());
    if (ausgang === MINEN_AUSGANG.BLINDGAENGER) {
      mine.blindgaenger = true;
      mine.ausgeloest = false;
      this.#events.emit('mine_dud', { mineId: mine.id, x: mine.x, y: mine.y });
      return;
    }
    this.#minen.delete(mine.id);
    const faktor = ausgang === MINEN_AUSGANG.SUPER ? MINEN.superFaktor : 1;
    const damage = MINEN.schaden * faktor;
    const damageType = damageTypeId(MINEN.schadensart);
    const material = wendeExplosionAn(this.#world, {
      x: mine.x, y: mine.y, damage, blastRadius: MINEN.radius, knockback: MINEN.rueckstoss,
      terrainDamage: MINEN.gelaendeSchaden, owner: mine.ownerId, damageType,
      // Zerstörungscharakter „Sprengung“ (kein Katalogindex).
      weaponId: 'sprengung',
    });
    this.#events.emit('mine_exploded', {
      mineId: mine.id, x: mine.x, y: mine.y, ausgang, ownerId: mine.ownerId, teamId: mine.teamId,
    });
    this.#events.emit('explosion', {
      x: mine.x, y: mine.y, radius: MINEN.radius, damage, owner: mine.ownerId, projectile: null, damageType, material,
    });
    // Die Kette (Minen und Fässer im Wirkradius) läuft über `explosionBei`, das `wendeExplosionAn` für jede Explosion aufruft.
  }

  /** Ein Fass explodiert: immer, ohne Zufall; löst Nachbarn über `explosionBei` aus. */
  #sprengeFass(fass) {
    this.#minen.delete(fass.id);
    const damageType = damageTypeId(FAESSER.schadensart);
    const material = wendeExplosionAn(this.#world, {
      x: fass.x, y: fass.y, damage: FAESSER.schaden, blastRadius: FAESSER.radius, knockback: FAESSER.rueckstoss,
      terrainDamage: FAESSER.gelaendeSchaden, owner: null, damageType, weaponId: 'sprengung',
    });
    this.#events.emit('fass_exploded', { fassId: fass.id, x: fass.x, y: fass.y });
    this.#events.emit('explosion', {
      x: fass.x, y: fass.y, radius: FAESSER.radius, damage: FAESSER.schaden, owner: null, projectile: null, damageType, material,
    });
  }
}

export default BodenobjektSystem;
