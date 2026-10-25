/**
 * FeuerSystem: Brand, Lava und die Eskalation des Weltuntergangs (`config.feuer` 2, `config/feuer.js`).
 *
 * ## Zustand
 *
 * Alles liegt auf dem Gitter der Stoffkarte (Zellen zu 8 px, `shared/stoffkarte.js`); die Stoffkarte
 * selbst bleibt unverändert (ihr Hash wird mit dem Client verglichen). Was sich ändert, steht in
 * `karte.ueber` (Überlagerung: Kennung + 1, 0 = keine): ausgebrannte Zellen werden Asche, erstarrte
 * Lava Basalt oder Obsidian. `stoffAm` liest die Überlagerung zuerst.
 *
 *   - `#brennt`  Zelle → `{rest, luft}`; `luft` = Flamme ohne Brennstoff (Flammenwand)
 *   - `#nass`    Zelle → Restschritte, in denen sie nicht brennt
 *   - `#lava`    Zelle → `{alter, leben, fliessen, ruhe}`
 *
 * ## Zufall und Reihenfolge
 *
 * Nur der Seed-Zweig `FEUER` (`rng`); Karten (`Map`) laufen in Einfügereihenfolge, jede Ziehung hängt an
 * einer festen Stelle. Der Takt ist der Tick des Systems, nicht die Uhr.
 *
 * ## Netz
 *
 * Es gehen nur Änderungen als kurze Zellenlisten (`feuer_schritt`, `feuer_lava`, `lava_erstarrt`) und
 * einzelne Marken (`lava_ausbruch`, `flammenwand`, `ragnarok_riss`) hinaus; der Client baut Flammen, Rauch,
 * Funken und Lavaglühen aus diesen Ereignissen und der Stoffkarte (`client/feuerOptik.js`).
 *
 * @module FeuerSystem
 */
import { STOFF, stoffById } from '../../shared/config/stoffe.js';
import { FEUER, FEUER_ZELLE as ZELLE, feuerfestFaktor } from '../../shared/config/feuer.js';
import { WET_LEVEL } from '../../shared/config/water.js';
import { ARCHETYPE_IDS } from '../../shared/config/classes.js';
import { geschuetztAm } from '../../shared/stoffkarte.js';
import { damageTypeId } from '../damageTypes.js';

const FEUER_ART = damageTypeId('fire');

/** Nachbarn (dx, dy, Faktor auf die Ausbreitung); oben ist y kleiner. */
const NACHBARN = Object.freeze([
  [0, -1, FEUER.aufwaerts], [-1, 0, 1], [1, 0, 1], [0, 1, 0.6],
  [-1, -1, FEUER.diagonal * FEUER.aufwaerts], [1, -1, FEUER.diagonal * FEUER.aufwaerts],
  [-1, 1, FEUER.diagonal * 0.6], [1, 1, FEUER.diagonal * 0.6],
]);
const VIER = Object.freeze([[0, 1], [-1, 0], [1, 0], [0, -1]]);

const zwischen = (rng, [lo, hi]) => lo + Math.floor(rng.next() * (hi - lo + 1));

export class FeuerSystem {
  #rng;

  #karte;

  #terrain;

  #events;

  #zerstoerung;

  #q;

  #brennt = new Map();

  #nass = new Map();

  #lava = new Map();

  #tick = 0;

  #nachsterAusbruch;

  #ragnarokAb = -1;

  #ragnarokZaehler = 0;

  #nachsteRagnarok = 0;

  /**
   * @param {object} o
   * @param {object} o.rng - Seed-Zweig `FEUER`
   * @param {object} o.karte - Stoffkarte
   * @param {object} o.terrain - Kollisionsmaske
   * @param {object} o.events - Ereignispuffer
   * @param {object|null} o.zerstoerung - für Löcher durch Durchbrand und Schmelzen
   * @param {string|null} o.sonderbiom
   * @param {object} o.q - Abfragen: `figuren()`, `waterLevelAt(x,y)`, `surfaceYAt(x)`, `ragnarok()`, `schaden(id,betrag)`, `mali(id)`
   */
  constructor({ rng, karte, terrain, events, zerstoerung = null, sonderbiom = null, q }) {
    this.#rng = rng;
    this.#karte = karte;
    this.#terrain = terrain;
    this.#events = events;
    this.#zerstoerung = zerstoerung;
    this.#q = q;
    this.vulkan = sonderbiom === 'vulkan';
    this.#nachsterAusbruch = FEUER.lava.ersterAusbruch + zwischen(rng, FEUER.lava.pauseTicks);
    if (!karte.ueber) karte.ueber = new Uint8Array(karte.feld.length);
  }

  get signature() { return 0; }

  get brennendeZellen() { return this.#brennt.size; }

  get lavaZellen() { return this.#lava.size; }

  /** Stand für Werkzeuge und Tests. */
  zustand() {
    return { brennt: [...this.#brennt.keys()], lava: [...this.#lava.keys()], nass: this.#nass.size };
  }

  /* ----------------------------------------------------------- Zellen */

  #zelleAn(x, y) {
    const k = this.#karte;
    const gx = Math.floor(x / ZELLE);
    const gy = Math.floor(y / ZELLE);
    if (gx < 0 || gy < 0 || gx >= k.spalten || gy >= k.zeilen) return -1;
    return gy * k.spalten + gx;
  }

  #mitteX(idx) { return (idx % this.#karte.spalten) * ZELLE + ZELLE / 2; }

  #mitteY(idx) { return Math.floor(idx / this.#karte.spalten) * ZELLE + ZELLE / 2; }

  #nachbar(idx, dx, dy) {
    const k = this.#karte;
    const gx = (idx % k.spalten) + dx;
    const gy = Math.floor(idx / k.spalten) + dy;
    if (gx < 0 || gy < 0 || gx >= k.spalten || gy >= k.zeilen) return -1;
    return gy * k.spalten + gx;
  }

  #fest(idx) { return this.#terrain.isSolid(this.#mitteX(idx), this.#mitteY(idx)); }

  #unterWasser(idx) { return this.#q.waterLevelAt(this.#mitteX(idx), this.#mitteY(idx)) >= WET_LEVEL; }

  #stoff(idx) {
    const u = this.#karte.ueber[idx];
    return stoffById(u ? u - 1 : this.#karte.feld[idx]);
  }

  #brennbar(idx) {
    if (idx < 0 || this.#brennt.has(idx) || this.#lava.has(idx) || this.#nass.has(idx)) return false;
    if (this.#karte.ueber[idx] !== 0 || !stoffById(this.#karte.feld[idx]).brennbar) return false;
    if (geschuetztAm(this.#karte, this.#mitteX(idx), this.#mitteY(idx))) return false;
    return this.#fest(idx) && !this.#unterWasser(idx);
  }

  #entzuende(idx, neu) {
    if (this.#brennt.size >= FEUER.maxBrennend || !this.#brennbar(idx)) return false;
    this.#brennt.set(idx, { rest: zwischen(this.#rng, FEUER.brenndauer), luft: false });
    neu.push(idx);
    return true;
  }

  /* ----------------------------------------------------------- Einschlag */

  /**
   * Haken der Zerstörung: Ein Waffeneinschlag entzündet (Hitze) oder löscht (Nässe, Kälte).
   * @param {number} x
   * @param {number} y
   * @param {number} radius - Kraterradius vor dem Stoff
   * @param {string} gruppe - Wirkgruppe der Schadensart
   */
  einschlag(x, y, radius, gruppe) {
    if (gruppe !== 'hitze' && gruppe !== 'nass' && gruppe !== 'kaelte') return;
    const reich = gruppe === 'hitze' ? radius * FEUER.einschlagReichweite + ZELLE : radius * FEUER.loeschReichweite + ZELLE;
    const k = this.#karte;
    const gx0 = Math.max(0, Math.floor((x - reich) / ZELLE));
    const gx1 = Math.min(k.spalten - 1, Math.floor((x + reich) / ZELLE));
    const gy0 = Math.max(0, Math.floor((y - reich) / ZELLE));
    const gy1 = Math.min(k.zeilen - 1, Math.floor((y + reich) / ZELLE));
    const neu = [];
    const aus = [];
    for (let gy = gy0; gy <= gy1; gy += 1) {
      for (let gx = gx0; gx <= gx1; gx += 1) {
        const dx = gx * ZELLE + ZELLE / 2 - x;
        const dy = gy * ZELLE + ZELLE / 2 - y;
        if (dx * dx + dy * dy > reich * reich) continue;
        const idx = gy * k.spalten + gx;
        if (gruppe === 'hitze') {
          if (this.#brennbar(idx) && this.#rng.next() < FEUER.entzuendung) this.#entzuende(idx, neu);
        } else {
          if (this.#brennt.delete(idx)) aus.push(idx);
          if (gruppe === 'nass' && this.#karte.ueber[idx] === 0 && stoffById(k.feld[idx]).brennbar) this.#nass.set(idx, FEUER.nassSchritte);
        }
      }
    }
    this.#melde('feuer_schritt', { neu, aus, asche: [] });
  }

  #melde(typ, daten) {
    if (typ === 'feuer_schritt' && daten.neu.length + daten.aus.length + daten.asche.length === 0) return;
    const grenze = FEUER.maxZellenJeEreignis;
    if (typ === 'feuer_schritt') {
      for (const feld of ['neu', 'aus', 'asche']) if (daten[feld].length > grenze) daten[feld] = daten[feld].slice(0, grenze);
    }
    this.#events.emit(typ, daten);
  }

  /* ----------------------------------------------------------- Takt */

  /** Ein Tick. */
  update() {
    this.#tick += 1;
    if (this.#tick % FEUER.takt === 0) this.#feuerSchritt();
    if (this.#tick % FEUER.laveTakt === 0) this.#lavaSchritt();
    if (this.vulkan && this.#tick >= this.#nachsterAusbruch) {
      const ort = this.#ausbruchsort(FEUER.lava.abstandZuFiguren);
      this.#nachsterAusbruch = this.#tick + zwischen(this.#rng, FEUER.lava.pauseTicks);
      if (ort !== null) this.#ausbruch(ort, false);
    }
    if (this.#q.ragnarok()) this.#ragnarok();
  }

  #ausbruchsort(abstand) {
    const breite = this.#karte.breite;
    for (let versuch = 0; versuch < 8; versuch += 1) {
      const x = Math.round(breite * (0.08 + 0.84 * this.#rng.next()));
      const y = this.#q.surfaceYAt(x);
      if (!(y > 0) || y >= this.#karte.hoehe - 24) continue;
      if (this.#q.waterLevelAt(x, y - 4) >= WET_LEVEL) continue;
      if (this.#q.figuren().some(f => Math.abs(f.x - x) < abstand)) continue;
      return { x, y };
    }
    return null;
  }

  /* ----------------------------------------------------------- Feuer */

  #feuerSchritt() {
    const neu = [];
    const aus = [];
    const asche = [];
    for (const [idx, n] of this.#nass) {
      if (n <= 1) this.#nass.delete(idx);
      else this.#nass.set(idx, n - 1);
    }
    for (const [idx, z] of [...this.#brennt]) {
      if (this.#nass.has(idx) || (!z.luft && this.#unterWasser(idx))) {
        this.#brennt.delete(idx);
        aus.push(idx);
        continue;
      }
      z.rest -= 1;
      for (const [dx, dy, faktor] of NACHBARN) {
        const n = this.#nachbar(idx, dx, dy);
        if (n >= 0 && this.#brennbar(n) && this.#rng.next() < FEUER.ausbreitung * faktor) this.#entzuende(n, neu);
      }
      if (z.rest > 0) continue;
      this.#brennt.delete(idx);
      if (z.luft) { aus.push(idx); continue; }
      this.#karte.ueber[idx] = STOFF.ASCHE + 1;
      asche.push(idx);
      if (this.#zerstoerung && this.#karte.feld[idx] === STOFF.HOLZ && this.#rng.next() < FEUER.holzDurchbrand) {
        this.#zerstoerung.krater(this.#mitteX(idx), this.#mitteY(idx), FEUER.durchbrandRadius, 100, 'brand');
      }
    }
    this.#melde('feuer_schritt', { neu, aus, asche });
    this.#verbrenneFiguren();
  }

  #verbrenneFiguren() {
    if (this.#brennt.size === 0 && this.#lava.size === 0) return;
    for (const f of this.#q.figuren()) {
      const hoehen = [f.y + 4, f.y - 6];
      let lava = false;
      let flamme = false;
      for (const hy of hoehen) {
        const idx = this.#zelleAn(f.x, hy);
        if (idx < 0) continue;
        if (this.#lava.has(idx)) lava = true;
        else if (this.#brennt.has(idx)) flamme = true;
      }
      if (!lava && !flamme) continue;
      const betrag = (lava ? FEUER.schadenLava : FEUER.schadenFlamme) * feuerfestFaktor(ARCHETYPE_IDS[f.archetyp ?? 0]);
      this.#q.schaden(f.id, betrag, FEUER_ART);
      this.#q.mali(f.id);
      this.#events.emit('feuer_verbrennt', { playerId: f.id, lava, betrag: Math.round(betrag * 10) / 10, x: Math.round(f.x), y: Math.round(f.y) });
    }
  }

  /* ----------------------------------------------------------- Lava */

  /**
   * Lava-Ausbruch an einem Ort der Oberfläche. `riss`: Ragnarök-Riss (mit Marke für die Optik).
   * @param {{x:number,y:number}} ort
   * @param {boolean} riss
   */
  #ausbruch(ort, riss) {
    const k = this.#karte;
    const n = zwischen(this.#rng, FEUER.lava.ausbruchZellen);
    const gx0 = Math.floor(ort.x / ZELLE);
    const gy0 = Math.max(0, Math.floor(ort.y / ZELLE) - 2);
    let gesetzt = 0;
    for (let i = 0; i < n * 3 && gesetzt < n && this.#lava.size < FEUER.maxLava; i += 1) {
      const gx = gx0 + Math.floor((this.#rng.next() - 0.5) * 5);
      const gy = gy0 - (i >> 2);
      if (gx < 0 || gy < 0 || gx >= k.spalten) continue;
      const idx = gy * k.spalten + gx;
      if (this.#lava.has(idx) || this.#fest(idx)) continue;
      this.#lava.set(idx, { alter: 0, leben: zwischen(this.#rng, FEUER.lava.leben), fliessen: FEUER.lava.fliessen, ruhe: 0 });
      gesetzt += 1;
    }
    this.#events.emit('lava_ausbruch', { x: ort.x, y: ort.y, n: gesetzt, riss });
  }

  #frei(idx) { return idx >= 0 && !this.#lava.has(idx) && !this.#fest(idx); }

  #lavaSchritt() {
    if (this.#lava.size === 0) return;
    const an = [];
    const ab = [];
    for (const [idx, z] of [...this.#lava]) {
      z.alter += 1;
      const unten = this.#nachbar(idx, 0, 1);
      if (unten < 0) { this.#lava.delete(idx); ab.push(idx); continue; }
      if (this.#frei(unten) && this.#unterWasser(unten)) {
        z.leben = 0;
      } else {
        const ziel = this.#fliesseNach(idx, z, unten);
        if (ziel !== idx) {
          this.#lava.delete(idx);
          this.#lava.set(ziel, z);
          if (z.ruhe >= 2) ab.push(idx);
          z.ruhe = 0;
          continue;
        }
      }
      z.ruhe += 1;
      if (z.ruhe === 2) an.push(idx);
      if (z.alter >= z.leben) this.#erstarre(idx, ab);
      else if (z.ruhe > 0 && z.ruhe % FEUER.lava.nachbarIntervall === 0) this.#lavaNachbarn(idx);
    }
    if (an.length + ab.length > 0) this.#events.emit('feuer_lava', { an: an.slice(0, FEUER.maxZellenJeEreignis), ab: ab.slice(0, FEUER.maxZellenJeEreignis) });
  }

  /** Zielzelle der Lava: fallen, diagonal, seitwärts (mit Budget) oder bleiben (= `idx`). */
  #fliesseNach(idx, z, unten) {
    if (this.#frei(unten)) return unten;
    const seiten = this.#rng.next() < 0.5 ? [-1, 1] : [1, -1];
    for (const s of seiten) {
      const d = this.#nachbar(idx, s, 1);
      if (d >= 0 && this.#nachbar(idx, s, 0) >= 0 && this.#frei(d) && this.#frei(this.#nachbar(idx, s, 0))) return d;
    }
    if (z.fliessen > 0) {
      for (const s of seiten) {
        const n = this.#nachbar(idx, s, 0);
        if (n >= 0 && this.#frei(n) && this.#frei(this.#nachbar(n, 0, 1))) { z.fliessen -= 1; return n; }
      }
    }
    return idx;
  }

  /** Ruhende Lava: Schnee und Eis schmelzen, Brennbares fängt Feuer. */
  #lavaNachbarn(idx) {
    const neu = [];
    for (const [dx, dy] of VIER) {
      const n = this.#nachbar(idx, dx, dy);
      if (n < 0) continue;
      if (this.#brennbar(n)) this.#entzuende(n, neu);
      const s = this.#stoff(n);
      if (s.schmelzbar && this.#fest(n) && this.#zerstoerung) {
        this.#zerstoerung.krater(this.#mitteX(n), this.#mitteY(n), 6, 100, 'brand');
        this.#events.emit('feuer_schmilzt', { x: this.#mitteX(n), y: this.#mitteY(n), stoff: s.key });
      }
    }
    this.#melde('feuer_schritt', { neu, aus: [], asche: [] });
  }

  #erstarre(idx, ab) {
    const x = this.#mitteX(idx);
    const y = this.#mitteY(idx);
    const r = FEUER.figurRadius;
    if (this.#q.figuren().some(f => Math.abs(f.x - x) < r + ZELLE / 2 && Math.abs(f.y - y) < r + ZELLE)) {
      this.#lava.get(idx).leben += 3;
      return;
    }
    let nahWasser = false;
    for (const [dx, dy] of VIER) {
      const n = this.#nachbar(idx, dx, dy);
      if (n >= 0 && this.#unterWasser(n)) nahWasser = true;
    }
    const stoff = nahWasser ? STOFF.OBSIDIAN : STOFF.BASALT;
    const gx = idx % this.#karte.spalten;
    const gy = Math.floor(idx / this.#karte.spalten);
    const pixel = [];
    for (let py = gy * ZELLE; py < (gy + 1) * ZELLE; py += 1) {
      for (let px = gx * ZELLE; px < (gx + 1) * ZELLE; px += 1) {
        if (px >= this.#terrain.width || py >= this.#terrain.height || this.#terrain.isSolid(px, py)) continue;
        this.#terrain.setPixel(px, py, true);
        pixel.push(px, py);
      }
    }
    this.#lava.delete(idx);
    ab.push(idx);
    this.#karte.ueber[idx] = stoff + 1;
    this.#events.emit('lava_erstarrt', { zellen: [idx, stoff] });
    if (pixel.length > 0) {
      this.#terrain.logEintrag(['p', ...pixel]);
      this.#events.emit('terrain_added', { zellen: pixel });
    }
  }

  /* ----------------------------------------------------------- Ragnarök */

  #ragnarok() {
    if (this.#ragnarokAb < 0) {
      this.#ragnarokAb = this.#tick;
      this.#nachsteRagnarok = this.#tick + zwischen(this.#rng, FEUER.ragnarok.pauseTicks);
      this.#events.emit('ragnarok_beginnt', {});
    }
    if (this.#tick < this.#nachsteRagnarok) return;
    const R = FEUER.ragnarok;
    this.#nachsteRagnarok = this.#tick + Math.max(R.mindestPause, Math.round(zwischen(this.#rng, R.pauseTicks) * R.verkuerzung ** this.#ragnarokZaehler));
    const wand = this.#ragnarokZaehler % 2 === 0;
    this.#ragnarokZaehler += 1;
    const ort = this.#ausbruchsort(R.abstandZuFiguren);
    if (ort === null) return;
    if (wand) this.#flammenwand(ort);
    else this.#ausbruch(ort, true);
  }

  /** Flammenwand: Flammen ohne Brennstoff über einem Streifen der Oberfläche; sie entzünden Brennbares. */
  #flammenwand(ort) {
    const k = this.#karte;
    const breite = zwischen(this.#rng, FEUER.ragnarok.flammenwandBreite);
    const gx0 = Math.floor(ort.x / ZELLE) - (breite >> 1);
    const neu = [];
    for (let i = 0; i < breite; i += 1) {
      const gx = gx0 + i;
      if (gx < 0 || gx >= k.spalten) continue;
      const y = this.#q.surfaceYAt(gx * ZELLE + ZELLE / 2);
      if (!(y > 0)) continue;
      const gy = Math.floor(y / ZELLE) - 1;
      if (gy < 0) continue;
      const idx = gy * k.spalten + gx;
      if (this.#brennt.has(idx) || this.#fest(idx) || this.#brennt.size >= FEUER.maxBrennend) continue;
      this.#brennt.set(idx, { rest: FEUER.ragnarok.flammenwandSchritte, luft: true });
      neu.push(idx);
    }
    this.#events.emit('flammenwand', { x: ort.x, y: ort.y, breite: breite * ZELLE });
    this.#melde('feuer_schritt', { neu, aus: [], asche: [] });
  }
}

export default FeuerSystem;
