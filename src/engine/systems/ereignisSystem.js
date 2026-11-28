/**
 * Ereignisse und Besucher (Ereignisfassung 2, TODO 2.13; Regeln in `shared/config/ereignisse.js`).
 *
 * Der Motor ruft `rundenbeginn` direkt nach `round_start` (`match.js#onRoundStart`); gezogen wird aus dem eigenen Zweig `EREIGNISSE`. Wirkung nur über die
 * Handgriffe des Motors (Heilen, Schaden, Krater, Stoß), damit Schilde, Mali und Ereignisse wie bei jedem Treffer laufen.
 * Jedes Ereignis meldet sich als `ereignis` mit `art` (Anzeige im Client, `client/ereignisse.js`).
 *
 * @module systems/ereignisSystem
 */
import { COMPONENT_SIGNATURES } from '../ecs/world.js';
import { EREIGNISSE } from '../../shared/config/ereignisse.js';

export class EreignisSystem {
  #match;
  #rng;
  #regeln;

  /**
   * @param {object} match - MatchController (Welt, Gelände, Ereignisse, Handgriffe)
   * @param {{next: () => number}} rng - Zweig `EREIGNISSE`
   * @param {object} [regeln] - Werte (Vorgabe `EREIGNISSE`)
   */
  constructor(match, rng, regeln = EREIGNISSE) {
    this.#match = match;
    this.#rng = rng;
    this.#regeln = regeln;
  }

  #zahl(min, max) { return min + Math.floor(this.#rng.next() * (max - min + 1)); }

  /** Lebende Figuren, Entity-ID aufsteigend. */
  #figuren() {
    const welt = this.#match.world;
    const ids = [...welt.getEntitiesBySignature(COMPONENT_SIGNATURES.POSITION | COMPONENT_SIGNATURES.HEALTH)].sort((a, b) => a - b);
    return ids.filter(id => welt.isActive(id) && this.#match.isPlayerAlive(id))
      .map(id => ({ id, x: welt.getComponent(id, 'Position', 'x') ?? 0, y: welt.getComponent(id, 'Position', 'y') ?? 0 }));
  }

  /** Schaden, der nie tötet (Naturereignis ohne Schützen): mindestens 1 Leben bleibt. */
  #nichtToedlich(h, id, betrag) {
    const echt = Math.min(betrag, Math.max(0, h.leben(id) - 1));
    if (echt > 0) h.schaden(id, echt);
    return echt;
  }

  /** Zu Rundenbeginn: höchstens ein Ereignis. Liefert die Art oder `null`. */
  rundenbeginn(runde) {
    const r = this.#regeln;
    if (runde < r.abRunde || this.#match.status !== 'playing') return null;
    if (this.#rng.next() >= r.chance) return null;
    const arten = Object.keys(r.gewichte);
    const summe = arten.reduce((s, a) => s + r.gewichte[a], 0);
    let rest = this.#rng.next() * summe;
    let art = arten[arten.length - 1];
    for (const a of arten) { rest -= r.gewichte[a]; if (rest < 0) { art = a; break; } }
    const figuren = this.#figuren();
    if (figuren.length === 0) return null;
    const h = this.#match.tierKontext;
    if (art === 'blondine') this.#blondine(h, figuren);
    else if (art === 'gewitter') this.#gewitter(h, figuren);
    else this.#erdbeben(h, figuren);
    return art;
  }

  #blondine(h, figuren) {
    const r = this.#regeln;
    const ziel = figuren[Math.floor(this.#rng.next() * figuren.length)];
    const [kuss, lachen] = r.kussZuAuslachen;
    if (this.#rng.next() * (kuss + lachen) < kuss) {
      const vorher = h.leben(ziel.id);
      h.heile(ziel.id, this.#zahl(r.kussMin, r.kussMax)); // nie über die Höchstlebenspunkte (`damageSystem.heal`)
      this.#match.events.emit('ereignis', { art: 'blondine', ausgang: 'kuss', playerId: ziel.id, betrag: h.leben(ziel.id) - vorher, x: ziel.x, y: ziel.y });
    } else {
      h.schaden(ziel.id, r.auslachen);
      this.#match.events.emit('ereignis', { art: 'blondine', ausgang: 'auslachen', playerId: ziel.id, betrag: r.auslachen, x: ziel.x, y: ziel.y });
    }
  }

  #gewitter(h, figuren) {
    const r = this.#regeln;
    const breite = this.#match.width;
    const blitze = [];
    const anzahl = this.#zahl(r.blitzMin, r.blitzMax);
    for (let i = 0; i < anzahl; i += 1) {
      let x = 0;
      let y = Infinity;
      for (let k = 0; k < 3; k += 1) {
        const kx = Math.round(20 + this.#rng.next() * (breite - 40));
        const ky = h.surfaceYAt(kx);
        if (ky < y) { x = kx; y = ky; }
      }
      const schaden = this.#zahl(r.blitzSchadenMin, r.blitzSchadenMax);
      const getroffen = [];
      for (const f of figuren) {
        if (Math.hypot(f.x - x, f.y - y) > r.blitzRadius || !this.#match.isPlayerAlive(f.id)) continue;
        getroffen.push({ playerId: f.id, betrag: this.#nichtToedlich(h, f.id, schaden) });
      }
      h.krater(x, y, r.blitzKrater, 100);
      blitze.push({ x, y, getroffen });
    }
    this.#match.events.emit('ereignis', { art: 'gewitter', blitze });
  }

  #erdbeben(h, figuren) {
    const r = this.#regeln;
    const getroffen = [];
    for (const f of figuren) {
      getroffen.push({ playerId: f.id, betrag: this.#nichtToedlich(h, f.id, r.bebenSchaden) });
      h.stosse(f.id, (this.#rng.next() * 2 - 1) * r.bebenStoss, -r.bebenStoss * 0.6);
    }
    this.#match.events.emit('ereignis', { art: 'erdbeben', getroffen });
  }
}
