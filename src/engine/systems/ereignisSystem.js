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
import { EREIGNISSE, EREIGNISSE_FEUER_RISSE, EREIGNISSE_HEILER, EREIGNISSE_REGEN, EREIGNISSE_STRICKOMA } from '../../shared/config/ereignisse.js';

export class EreignisSystem {
  #match;
  #rng;
  #regeln;

  /**
   * @param {object} match - MatchController (Welt, Gelände, Ereignisse, Handgriffe)
   * @param {{next: () => number}} rng - Zweig `EREIGNISSE`
   * @param {object} [regeln] - Werte (Vorgabe `EREIGNISSE`)
   */
  #fassung;

  constructor(match, rng, regeln = EREIGNISSE, fassung = EREIGNISSE_FEUER_RISSE) {
    this.#fassung = fassung;
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
    const gewichte = this.#fassung >= EREIGNISSE_STRICKOMA && r.gewichte6 ? r.gewichte6
      : this.#fassung >= EREIGNISSE_REGEN && r.gewichte5 ? r.gewichte5
      : this.#fassung >= EREIGNISSE_HEILER && r.gewichte4 ? r.gewichte4 : r.gewichte;
    const arten = Object.keys(gewichte);
    const summe = arten.reduce((s, a) => s + gewichte[a], 0);
    let rest = this.#rng.next() * summe;
    let art = arten[arten.length - 1];
    for (const a of arten) { rest -= gewichte[a]; if (rest < 0) { art = a; break; } }
    const figuren = this.#figuren();
    if (figuren.length === 0) return null;
    const h = this.#match.tierKontext;
    if (art === 'blondine') this.#blondine(h, figuren);
    else if (art === 'gewitter') this.#gewitter(h, figuren);
    else if (art === 'heiler') this.#heiler(h, figuren);
    else if (art === 'regen') this.#regen(h);
    else if (art === 'strickoma') this.#strickoma(h, figuren);
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
      if (this.#fassung >= EREIGNISSE_FEUER_RISSE) this.#match.feuerSystem?.einschlag(x, y, r.blitzKrater, 'hitze'); // Fassung 3: Blitz entzündet
      blitze.push({ x, y, getroffen });
    }
    this.#match.events.emit('ereignis', { art: 'gewitter', blitze });
  }

  /** Fassung 4: Dr. Stilzchen-Rumpel heilt alle im Umkreis eines zufälligen Bodenpunkts (nahe einer Figur, sonst sinnlos). */
  #heiler(h, figuren) {
    const r = this.#regeln;
    const nahe = figuren[Math.floor(this.#rng.next() * figuren.length)];
    const x = Math.round(Math.max(20, Math.min(this.#match.width - 20, nahe.x + (this.#rng.next() * 2 - 1) * r.heilerRadius * 0.6)));
    const y = h.surfaceYAt(x);
    const geheilt = [];
    for (const f of figuren) {
      if (Math.hypot(f.x - x, f.y - y) > r.heilerRadius) continue;
      const vorher = h.leben(f.id);
      h.heile(f.id, this.#zahl(r.heilerMin, r.heilerMax));
      geheilt.push({ playerId: f.id, betrag: h.leben(f.id) - vorher });
    }
    this.#match.events.emit('ereignis', { art: 'heiler', x, y, geheilt });
  }

  /** Fassung 5: Starkregen löscht jeden Brand und lässt Wasser auf den Boden fallen, das in Mulden zusammenläuft. */
  #regen(h) {
    const r = this.#regeln;
    const breite = this.#match.width;
    const feuer = this.#match.feuerSystem;
    if (feuer) for (let x = 40; x < breite; x += 80) feuer.einschlag(x, h.surfaceYAt(x), 90, 'nass');
    const wasser = this.#match.water;
    let tropfen = 0;
    if (wasser) {
      const s = wasser.worldScale;
      for (let i = 0; i < r.regenTropfen; i += 1) {
        const x = Math.round(20 + this.#rng.next() * (breite - 40));
        const y = h.surfaceYAt(x);
        if (!Number.isFinite(y) || y >= this.#match.height - 2) continue;
        const gx = Math.floor(x / s);
        const gy = Math.floor(y / s);
        for (let k = 1; k <= r.regenHoehe; k += 1) wasser.setLevel(gx, gy - k, 1);
        wasser.wecke(x, y, s * (r.regenHoehe + 2));
        tropfen += 1;
      }
    }
    this.#match.events.emit('ereignis', { art: 'regen', tropfen });
  }

  /** Fassung 6: Die Strickoma verteilt Gummibärchen, strickt Figuren ein oder lässt sie husten. */
  #strickoma(h, figuren) {
    const r = this.#regeln;
    const nahe = figuren[Math.floor(this.#rng.next() * figuren.length)];
    const x = Math.round(Math.max(20, Math.min(this.#match.width - 20, nahe.x + (this.#rng.next() * 2 - 1) * r.omaRadius * 0.5)));
    const y = h.surfaceYAt(x);
    const statuses = this.#match.statuses;
    const wirkung = [];
    for (const f of figuren) {
      if (Math.hypot(f.x - x, f.y - y) > r.omaRadius) continue;
      const z = this.#rng.next();
      if (z < r.omaAnteile[0]) {
        const vorher = h.leben(f.id);
        h.heile(f.id, r.omaGummibaer);
        wirkung.push({ playerId: f.id, was: 'gummibaer', betrag: h.leben(f.id) - vorher });
      } else if (z < r.omaAnteile[0] + r.omaAnteile[1]) {
        statuses?.freeze(f.id, r.omaStrickZuege);
        wirkung.push({ playerId: f.id, was: 'eingestrickt', betrag: r.omaStrickZuege });
      } else {
        statuses?.addDot(f.id, { damagePerTurn: r.omaHusten, turns: r.omaHustenZuege, element: 'neutral' });
        wirkung.push({ playerId: f.id, was: 'husten', betrag: r.omaHusten });
      }
    }
    this.#match.events.emit('ereignis', { art: 'strickoma', x, y, wirkung });
  }

  #erdbeben(h, figuren) {
    const r = this.#regeln;
    const getroffen = [];
    for (const f of figuren) {
      getroffen.push({ playerId: f.id, betrag: this.#nichtToedlich(h, f.id, r.bebenSchaden) });
      h.stosse(f.id, (this.#rng.next() * 2 - 1) * r.bebenStoss, -r.bebenStoss * 0.6);
    }
    const risse = [];
    if (this.#fassung >= EREIGNISSE_FEUER_RISSE) {
      // Fassung 3: kleine Risse in der Oberfläche; trennt einer einen Überhang ab, bricht er (Inselsuche der Zerstörung).
      for (let i = 0; i < r.bebenRisse; i += 1) {
        const x = Math.round(20 + this.#rng.next() * (this.#match.width - 40));
        const y = h.surfaceYAt(x);
        if (!Number.isFinite(y) || y >= this.#match.height - 2) continue;
        h.krater(x, y + r.bebenRissRadius * 0.5, r.bebenRissRadius, 100);
        risse.push({ x, y });
      }
    }
    this.#match.events.emit('ereignis', { art: 'erdbeben', getroffen, risse });
  }
}
