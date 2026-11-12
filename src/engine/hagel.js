/**
 * Hagel (Hagelfassung 2, HAGEL-1): Hagellagen und einzelne große Körner, die leichten Schaden machen.
 *
 * Regeln, Zahlen und Begründungen stehen in `shared/config/hagel.js`. Hier steht nur der Ablauf.
 *
 * ## Ablauf je Takt (`update`, nach der Physik)
 *
 * 1. Lagen: Die Zeit ist in Scheiben geteilt. Zu jeder Scheibe zieht der Zweig `HAGEL` genau drei Zahlen (Hagel ja/nein,
 *    Beginn, Dauer) — auch ohne Hagel, damit die Folge nicht davon abhängt. Fällt Hagel, melden `hail_start` und `hail_ende`
 *    Anfang und Ende.
 * 2. Körner: Solange eine Lage läuft, setzt der Zweig `HAGEL_KORN` im Abstand von `abstandMin` bis `abstandMax` Takten ein
 *    Korn. Je Korn werden IMMER dieselben sieben Zahlen gezogen (Folge unabhängig von Figuren und Gelände). Ort und Flugzeit
 *    stehen beim Start fest (`hail_korn`).
 * 3. Aufschlag: Nach der Flugzeit wird der Ort an Figuren und Gelände von DIESEM Takt geprüft: Eine Figur wird getroffen,
 *    wenn die Spalte des Korns ihre Körperbreite (plus Kornradius) schneidet UND von ihrem Kopf senkrecht bis zum
 *    Kartenrand kein festes Gelände liegt. Unter Dach (Höhle, Kammer, Überhang) passiert nichts. Das Gelände nimmt keinen
 *    Schaden. Es meldet `hail_aufprall` (Ort, Treffer) und bei einem Treffer `hail_hit`.
 *
 * ## Bauweise und Determinismus
 *
 * Schlichte Einträge wie bei den Minen, keine ECS-Entities, keine Uhr, kein `Math.random`. Zufall nur aus den beiden
 * Zweigen des Seeds. Figuren nach Entity-ID aufsteigend. Der Zustand (`snapshot`) geht in den Zustandshash, solange eine
 * Lage ansteht, läuft oder ein Korn fliegt; sonst ist er `null` und ändert den Schlüsselsatz nicht.
 *
 * Das Korn ist KEIN Geschoss: es zählt nicht für das Zugende (`activeProjectileCount`) und trägt keinen Urheber.
 *
 * @module hagel
 */
import { PLAYER_HALF_HEIGHT, PLAYER_HALF_WIDTH } from '../shared/config/player.js';
import { HAGEL } from '../shared/config/hagel.js';
import { COMPONENT_SIGNATURES } from './ecs/componentStore.js';

export class HagelSystem {
  #match;
  #rngLage;
  #rngKorn;
  /** Nächste Zeitscheibe, über die noch nicht entschieden wurde. */
  #naechsteScheibe = 0;
  /** Die aktuelle oder anstehende Lage: `{ von, bis, gemeldet }` oder `null`. */
  #lage = null;
  #naechstesKorn = 0;
  #naechsteId = 1;
  /** @type {{id:number, x:number, y:number, start:number, auf:number, schaden:number}[]} */
  #koerner = [];

  /**
   * @param {object} match - der `MatchController` (öffentlich: `world`, `events`, `terrain`, `width`, `height`)
   * @param {{lage: object, korn: object}} rngs - die Zweige `HAGEL` und `HAGEL_KORN` des Seeds
   */
  constructor(match, rngs) {
    this.#match = match;
    this.#rngLage = rngs.lage;
    this.#rngKorn = rngs.korn;
  }

  /** Läuft gerade eine Hagellage? (Taktzähler `tick`.) */
  laeuft(tick = this.#match.world.tickCount) {
    return Boolean(this.#lage && tick >= this.#lage.von && tick < this.#lage.bis);
  }

  /** Fliegende Körner (Kopie, aufsteigend nach Kennung). */
  get koerner() { return this.#koerner.map(k => ({ ...k })); }

  /** Zustand für den Hash und die Anzeige, solange etwas ansteht, läuft oder fliegt; sonst `null`. */
  snapshot() {
    if (!this.#lage && this.#koerner.length === 0) return null;
    return {
      lage: this.#lage ? [this.#lage.von, this.#lage.bis] : null,
      naechstes: this.#lage ? this.#naechstesKorn : null,
      koerner: this.#koerner.map(k => [k.id, k.x, k.y, k.auf, k.schaden]),
    };
  }

  /** Ein Takt: Lagen entscheiden, Körner setzen, Aufschläge auflösen. */
  update() {
    const tick = this.#match.world.tickCount;
    // Erst das Ende der alten Lage, dann die Entscheidung der neuen Scheibe: sonst überschriebe sie die alte ohne `hail_ende`.
    if (this.#lage && tick >= this.#lage.bis) {
      this.#match.events.emit('hail_ende', { tick });
      this.#lage = null;
    }
    this.#entscheideLagen(tick);
    const lage = this.#lage;
    if (lage && !lage.gemeldet && tick >= lage.von) {
      lage.gemeldet = true;
      this.#naechstesKorn = tick + HAGEL.abstandMin;
      this.#match.events.emit('hail_start', { tick, dauer: lage.bis - tick });
    }
    if (lage && tick >= lage.von && tick < lage.bis && tick >= this.#naechstesKorn) this.#setzeKorn(tick, lage);
    if (this.#koerner.length > 0) this.#loeseAuf(tick);
  }

  /** Zu jeder begonnenen Scheibe genau drei Zahlen ziehen; eine Lage der Scheibe merken. */
  #entscheideLagen(tick) {
    const scheibe = Math.floor(tick / HAGEL.lageTakte);
    while (this.#naechsteScheibe <= scheibe) {
      const s = this.#naechsteScheibe;
      this.#naechsteScheibe += 1;
      const hagel = this.#rngLage.next() < HAGEL.anteilLagen;
      const start = this.#rngLage.nextInt(0, HAGEL.startMax);
      const dauer = this.#rngLage.nextInt(HAGEL.dauerMin, HAGEL.dauerMax);
      if (hagel) {
        const von = s * HAGEL.lageTakte + start;
        this.#lage = { von, bis: von + dauer, gemeldet: false };
      }
    }
  }

  /** Setzt ein Korn: sieben feste Ziehungen, Ort und Aufschlagpunkt zum Start, Meldung `hail_korn`. */
  #setzeKorn(tick, lage) {
    const r = this.#rngKorn;
    const gezielt = r.next() < HAGEL.gezielt;
    const spalte = r.next();
    const wahl = r.next();
    const streu = r.next();
    const fall = r.nextInt(HAGEL.fallMin, HAGEL.fallMax);
    const schaden = r.nextInt(HAGEL.schadenMin, HAGEL.schadenMax);
    const abstand = r.nextInt(HAGEL.abstandMin, HAGEL.abstandMax);
    this.#naechstesKorn = tick + abstand;
    const breite = this.#match.width;
    const ziele = gezielt ? this.#figuren() : [];
    const roh = ziele.length > 0
      ? ziele[Math.min(ziele.length - 1, Math.floor(wahl * ziele.length))].x + (streu * 2 - 1) * HAGEL.streuung
      : spalte * breite;
    const x = Math.round(Math.min(breite - HAGEL.radius, Math.max(HAGEL.radius, roh)));
    const opfer = this.#opfer(x);
    const y = opfer ? opfer.kopf : this.#bodenY(x);
    const korn = { id: this.#naechsteId, x, y, start: tick, auf: tick + fall, schaden };
    this.#naechsteId += 1;
    this.#koerner.push(korn);
    this.#match.events.emit('hail_korn', { id: korn.id, tick, x, y, fall, rest: Math.max(0, lage.bis - tick), gezielt: ziele.length > 0 });
  }

  /** Löst alle Körner auf, deren Aufschlagtakt erreicht ist (Kennung aufsteigend). */
  #loeseAuf(tick) {
    const bleibt = [];
    for (const korn of this.#koerner) {
      if (korn.auf > tick) { bleibt.push(korn); continue; }
      const opfer = this.#opfer(korn.x);
      const y = opfer ? opfer.kopf : this.#bodenY(korn.x);
      this.#match.events.emit('hail_aufprall', { id: korn.id, x: korn.x, y, treffer: opfer ? opfer.id : null });
      if (opfer) this.#trifft(korn, opfer, y);
    }
    this.#koerner = bleibt;
  }

  /** Lebende Figuren (Entity, Lage), Entity-ID aufsteigend. */
  #figuren() {
    const welt = this.#match.world;
    const ids = welt.getEntitiesBySignature(COMPONENT_SIGNATURES.POSITION | COMPONENT_SIGNATURES.HEALTH);
    const aus = [];
    for (const id of [...ids].sort((a, b) => a - b)) {
      if (!welt.isActive(id) || !this.#match.isPlayerAlive(id)) continue;
      aus.push({ id, x: welt.getComponent(id, 'Position', 'x') ?? 0, y: welt.getComponent(id, 'Position', 'y') ?? 0 });
    }
    return aus;
  }

  /** Erster Boden von oben in der Spalte `x` (Zeile des ersten festen Pixels) oder die Kartenhöhe. */
  #bodenY(x) {
    const t = this.#match.terrain;
    const h = this.#match.height;
    for (let y = 0; y < h; y += 1) if (t.isSolid(x, y)) return y;
    return h;
  }

  /** Von `y` senkrecht nach oben bis zum Kartenrand: liegt festes Gelände dazwischen? (Strahltest gegen die Maske.) */
  #ueberdacht(x, y) {
    const t = this.#match.terrain;
    for (let k = Math.min(y, this.#match.height) - 1; k >= 0; k -= 1) if (t.isSolid(x, k)) return true;
    return false;
  }

  /**
   * Die Figur, die ein Korn in der Spalte `x` jetzt träfe: Körperbreite plus Kornradius, unter freiem Himmel; bei
   * mehreren die oberste (kleinster Kopf), bei Gleichstand die kleinere Kennung.
   * @returns {{id:number, kopf:number}|null}
   */
  #opfer(x) {
    let best = null;
    for (const f of this.#figuren()) {
      if (Math.abs(f.x - x) > PLAYER_HALF_WIDTH + HAGEL.radius) continue;
      const kopf = f.y - PLAYER_HALF_HEIGHT;
      if (this.#ueberdacht(x, kopf)) continue;
      if (!best || kopf < best.kopf) best = { id: f.id, kopf };
    }
    return best;
  }

  /** Schaden anwenden: 1 bis 2 LP, nie unter 1 LP (`nieToedlich`), über den gewöhnlichen Schadensweg (Schild, Mali, Ereignis `damage`). */
  #trifft(korn, opfer, y) {
    const welt = this.#match.world;
    const leben = welt.getComponent(opfer.id, 'Health', 'current') ?? 0;
    const betrag = HAGEL.nieToedlich ? Math.max(0, Math.min(korn.schaden, leben - 1)) : korn.schaden;
    const schadenssystem = welt.getSystem('damage');
    if (betrag > 0 && schadenssystem) {
      schadenssystem.applyDamage(welt, opfer.id, betrag, null, { damageType: 'physical' });
      // Mali (Schadensfassung 2) können den Betrag erhöhen: die Regel „nie tödlich" gilt trotzdem.
      if (HAGEL.nieToedlich && welt.isActive(opfer.id) && (welt.getComponent(opfer.id, 'Health', 'current') ?? 0) < 1) {
        welt.setComponent(opfer.id, 'Health', 'current', 1);
      }
    }
    this.#match.events.emit('hail_hit', { id: korn.id, entityId: opfer.id, x: korn.x, y, damage: betrag });
  }
}
