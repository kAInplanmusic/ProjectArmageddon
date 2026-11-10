/**
 * Feuerwesen (Waffenfassung 20, `pa_118`): ein kleiner Feuergnom, der geradeaus läuft, springt und bei Berührung mit
 * einer Figur in fünf Feuerkugeln zerbirst. Entscheidung des Auftraggebers vom 2026-11-10.
 *
 * ## Regeln
 *
 * - Der Schuss setzt den Gnom vor der Figur ab (Blickrichtung = Seite des Zielwinkels). Er läuft geradeaus über das
 *   Gelände: Unebenheiten bis `stufe` px steigt er, an Kanten fällt er.
 * - Er hüpft alle `hopserTakte` Takte ein wenig (`hopserHoehe`). Ein Hindernis bis `sprungHoehe` überspringt er; ein
 *   höheres ist eine Wand, und er kehrt um. Stößt er im Sprung gegen eine Wand, kehrt er nach der Landung um.
 * - Berührt er IRGENDEINE lebende Figur (auch die eigene, wie bei der Mine), zerbirst er. Der Werfer ist nur so lange
 *   ausgenommen, wie der Gnom ihn seit dem Absetzen ununterbrochen berührt (Absetzen an einer Wand).
 * - Nach `laufzeitTakte` zerbirst er an Ort und Stelle. Im Wasser erlischt er, über den Kartenrand hinaus verschwindet
 *   er — beides ohne Kugeln.
 * - Zerbersten: genau fünf Feuerkugeln in festem Fächer (`engine/shooting.js`, `feuerkugeln`), gewöhnliche Geschosse.
 * - Solange ein Gnom läuft, zählt er als „unterwegs" (`MatchController.activeProjectileCount`): Der Zug endet erst,
 *   wenn Gnom und Kugeln aufgelöst sind.
 *
 * ## Bauweise und Determinismus
 *
 * Schlichte Einträge wie bei den Minen (`systems/bodenobjektSystem.js`), keine ECS-Entities. Alles in Takten und
 * Pixeln, kein Zufall, keine Uhr. Gnome nach Kennung aufsteigend, Figuren nach Entity-ID aufsteigend. Die Lage ist
 * der Fußpunkt: `(x, y)` ist frei, `(x, y + 1)` trägt, wenn er steht.
 *
 * @module feuerwesen
 */
import { PLAYER_HALF_HEIGHT, PLAYER_HALF_WIDTH } from '../shared/config/player.js';
import { PROJECTILE_GRAVITY } from '../shared/ballistics.js';
import { WET_LEVEL } from '../shared/config/water.js';
import { feuerkugeln } from './shooting.js';

/** Schwerkraft des Gnoms: dieselbe wie bei Geschossen (px/Takt²). */
const SCHWERE = PROJECTILE_GRAVITY;

/** Anfangsgeschwindigkeit nach oben für eine Sprunghöhe `h` (px): v = √(2·g·h). */
const absprung = h => Math.sqrt(2 * SCHWERE * h);

export class FeuerwesenSystem {
  #match;
  #schussQuelle;
  /** @type {Map<number, object>} */
  #gnome = new Map();
  #naechsteId = 1;

  /**
   * @param {object} match - der `MatchController` (öffentliche Abfragen: `world`, `events`, `terrain`, `width`,
   *   `height`, `players`, `isPlayerAlive`, `waterLevelAt`)
   * @param {() => object} schussQuelle - die Quelle von `engine/shooting.js` (für die Feuerkugeln)
   */
  constructor(match, schussQuelle) {
    this.#match = match;
    this.#schussQuelle = schussQuelle;
  }

  /** Laufende Gnome — sie zählen für das Zugende wie Geschosse. */
  get anzahl() { return this.#gnome.size; }

  /**
   * Fest im Sinne des Gnoms. Die Kollisionsmaske nennt alles außerhalb der Karte fest (Rand als Wand). Für den Gnom
   * ist jenseits des Seitenrands und unter dem Boden der Karte Leere: er läuft über die Kante hinaus und wird dort
   * entfernt (wie ein Geschoss, das die Karte verlässt), statt an einer unsichtbaren Wand umzukehren.
   */
  #fest(x, y) {
    const sx = Math.floor(x);
    const sy = Math.floor(y);
    if (sx < 0 || sx >= this.#match.width || sy >= this.#match.height) return false;
    return this.#match.terrain.isSolid(sx, sy);
  }

  /** Ist der Körper (Spalte der Vorderkante und Mitte, Füße bis Kopf) an `(x, y)` frei? */
  #frei(x, y, w) {
    for (const dx of [-w.breite, 0, w.breite]) {
      for (let k = 0; k < w.hoehe; k += 2) if (this.#fest(x + dx, y - k)) return false;
      if (this.#fest(x + dx, y - w.hoehe + 1)) return false;
    }
    return true;
  }

  #traegt(x, y) { return this.#fest(x, y + 1); }

  /**
   * Setzt einen Gnom vor die Figur. Kein Platz vorn: hinter die Figur (er läuft dann dorthin). Auch dort keiner: an
   * die Figur selbst (der Werfer ist ausgenommen, bis der Gnom ihn verlassen hat).
   *
   * @param {number} ownerId
   * @param {number} angle - Zielwinkel (nur die Seite zählt)
   * @param {object} werte - `getWaffe('pa_118', 20).laeufer`
   * @param {object} waffe - die Waffe der Fassung (für die Kugeln)
   * @returns {object} der Eintrag
   */
  setze(ownerId, angle, werte, waffe) {
    const world = this.#match.world;
    const fx = world.getComponent(ownerId, 'Position', 'x') ?? 0;
    const fy = world.getComponent(ownerId, 'Position', 'y') ?? 0;
    const fuss = Math.floor(fy + PLAYER_HALF_HEIGHT) - 1;
    const blick = Math.cos(angle) >= 0 ? 1 : -1;
    const abstand = PLAYER_HALF_WIDTH + werte.breite + werte.absetzAbstand;
    let platz = null;
    for (const richtung of [blick, -blick]) {
      const x = fx + richtung * abstand;
      for (let d = 0; d <= werte.sprungHoehe && !platz; d += 1) {
        if (this.#frei(x, fuss - d, werte)) platz = { x, y: fuss - d, richtung };
      }
      if (platz) break;
    }
    platz ??= { x: fx, y: fuss, richtung: blick };
    const gnom = {
      id: this.#naechsteId, ownerId, x: platz.x, y: platz.y, richtung: platz.richtung, vy: 0,
      luft: !this.#traegt(platz.x, platz.y), alter: 0, naechsterHopser: werte.hopserTakte, sprungVonX: null,
      werferBeruehrt: true, werte, waffe,
    };
    this.#naechsteId += 1;
    this.#gnome.set(gnom.id, gnom);
    gnom.werferBeruehrt = this.#beruehrt(gnom, ownerId);
    this.#match.events.emit('feuerwesen_gesetzt', {
      id: gnom.id, ownerId, x: gnom.x, y: gnom.y, richtung: gnom.richtung, laufzeitTakte: werte.laufzeitTakte,
    });
    return gnom;
  }

  /** Ein Takt für alle Gnome (nach dem Physikschritt der Welt). */
  update() {
    if (this.#gnome.size === 0) return;
    for (const id of [...this.#gnome.keys()].sort((a, b) => a - b)) {
      const gnom = this.#gnome.get(id);
      if (gnom) this.#schritt(gnom);
    }
  }

  #schritt(g) {
    const w = g.werte;
    g.alter += 1;
    if (g.alter >= w.laufzeitTakte) return this.#zerbirst(g, 'laufzeit', null);
    if (g.luft) this.#fliege(g, w);
    else this.#laufe(g, w);

    // Kartenrand und Wasser: sauber entfernen, ohne Kugeln.
    if (g.x < 0 || g.x >= this.#match.width || g.y > this.#match.height) return this.#erlischt(g, 'kartenrand');
    if (this.#match.waterLevelAt(g.x, g.y - 2) > WET_LEVEL) return this.#erlischt(g, 'wasser');

    // Berührung: Figuren nach Entity-ID aufsteigend.
    const figuren = this.#match.players.filter(p => this.#match.isPlayerAlive(p.entityId))
      .map(p => p.entityId).sort((a, b) => a - b);
    if (g.werferBeruehrt && !this.#beruehrt(g, g.ownerId)) g.werferBeruehrt = false;
    for (const fid of figuren) {
      if (fid === g.ownerId && g.werferBeruehrt) continue;
      if (this.#beruehrt(g, fid)) return this.#zerbirst(g, 'beruehrung', fid);
    }
    if (g.alter % w.meldeTakte === 0) {
      this.#match.events.emit('feuerwesen_lauf', {
        id: g.id, x: g.x, y: g.y, richtung: g.richtung, luft: g.luft, alter: g.alter,
      });
    }
    return undefined;
  }

  /** Am Boden: hüpfen, steigen, abwärts gehen, springen oder umkehren. */
  #laufe(g, w) {
    if (g.alter >= g.naechsterHopser) {
      g.naechsterHopser = g.alter + w.hopserTakte;
      g.vy = -absprung(w.hopserHoehe);
      g.luft = true;
      this.#match.events.emit('feuerwesen_sprung', { id: g.id, x: g.x, y: g.y, art: 'hopser' });
      this.#fliege(g, w); // derselbe Takt: der Hopser geht vorwärts, er bleibt nicht stehen
      return;
    }
    const nx = g.x + g.richtung * w.tempo;
    if (this.#frei(nx, g.y, w)) {
      // Eben oder abwärts: Boden bis `stufe` tiefer suchen, sonst fällt er von der Kante.
      for (let d = 0; d <= w.stufe; d += 1) {
        if (this.#traegt(nx, g.y + d) && this.#frei(nx, g.y + d, w)) { g.x = nx; g.y += d; return; }
      }
      g.x = nx;
      g.vy = 0;
      g.luft = true;
      return;
    }
    // Aufwärts ohne Sprung.
    for (let d = 1; d <= w.stufe; d += 1) {
      if (this.#frei(nx, g.y - d, w)) { g.x = nx; g.y -= d; return; }
    }
    // Sprung, wenn das Hindernis niedrig genug ist; sonst Wand: umkehren.
    for (let d = w.stufe + 1; d <= w.sprungHoehe; d += 1) {
      if (this.#frei(nx, g.y - d, w)) {
        g.vy = -absprung(d + 2);
        g.luft = true;
        g.sprungVonX = g.x;
        this.#match.events.emit('feuerwesen_sprung', { id: g.id, x: g.x, y: g.y, art: 'sprung' });
        this.#fliege(g, w);
        return;
      }
    }
    this.#kehreUm(g);
  }

  /**
   * In der Luft: vorwärts, sofern frei, und pixelweise fallen oder steigen (kein Durchtunneln). Ein Hang, der den Weg
   * versperrt, wird nach der Landung vom Laufen entschieden (steigen, springen, umkehren). Brachte ein Sprung keinen
   * Fortschritt (Überhang über der Kante), kehrt er nach der Landung um — sonst spränge er bis zum Laufzeitende.
   */
  #fliege(g, w) {
    const nx = g.x + g.richtung * w.tempo;
    if (this.#frei(nx, g.y, w)) g.x = nx;
    g.vy = Math.min(w.fallMax, g.vy + SCHWERE);
    const schritte = Math.ceil(Math.abs(g.vy));
    const teil = g.vy / Math.max(1, schritte);
    for (let i = 0; i < schritte; i += 1) {
      if (teil > 0 && this.#traegt(g.x, g.y)) {
        g.y = Math.floor(g.y);
        g.vy = 0;
        g.luft = false;
        if (g.sprungVonX !== null && Math.abs(g.x - g.sprungVonX) < w.tempo) this.#kehreUm(g);
        g.sprungVonX = null;
        return;
      }
      if (teil < 0 && !this.#frei(g.x, g.y + teil, w)) { g.vy = 0; return; }
      g.y += teil;
    }
  }

  #kehreUm(g) {
    g.richtung = -g.richtung;
    this.#match.events.emit('feuerwesen_lauf', { id: g.id, x: g.x, y: g.y, richtung: g.richtung, luft: g.luft, alter: g.alter });
  }

  /** Überlappen Gnomkörper und Trefferfeld der Figur? */
  #beruehrt(g, figurId) {
    const world = this.#match.world;
    const px = world.getComponent(figurId, 'Position', 'x') ?? 0;
    const py = world.getComponent(figurId, 'Position', 'y') ?? 0;
    if (Math.abs(px - g.x) > PLAYER_HALF_WIDTH + g.werte.breite) return false;
    return g.y >= py - PLAYER_HALF_HEIGHT && g.y - g.werte.hoehe <= py + PLAYER_HALF_HEIGHT;
  }

  #zerbirst(g, grund, target) {
    this.#gnome.delete(g.id);
    const mitte = g.y - g.werte.hoehe / 2;
    const kugeln = feuerkugeln(this.#schussQuelle(), g, g.x, mitte);
    this.#match.events.emit('feuerwesen_zerbirst', {
      id: g.id, ownerId: g.ownerId, x: g.x, y: mitte, grund, target, kugeln,
    });
  }

  #erlischt(g, grund) {
    this.#gnome.delete(g.id);
    this.#match.events.emit('feuerwesen_erloschen', { id: g.id, ownerId: g.ownerId, x: g.x, y: g.y, grund });
  }

  /**
   * Zustand für Anzeige und Hash: `null`, solange kein Gnom läuft (der Schlüsselsatz alter Partien bleibt gleich).
   * @returns {object[]|null}
   */
  snapshot() {
    if (this.#gnome.size === 0) return null;
    return [...this.#gnome.values()].sort((a, b) => a.id - b.id).map(g => ({
      id: g.id, ownerId: g.ownerId, x: g.x, y: g.y, richtung: g.richtung, luft: g.luft, alter: g.alter,
      laufzeitTakte: g.werte.laufzeitTakte,
    }));
  }
}
