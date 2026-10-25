/**
 * Optik für Feuer, Lava und Ragnarök (Feuerfassung 2, `engine/systems/feuerSystem.js`).
 *
 * Der Client rechnet nichts Autoritatives und bekommt keine Teilchen übers Netz: Er kennt nur die
 * Zellenlisten der Ereignisse (`feuer_schritt`, `feuer_lava`, `lava_erstarrt`) und baut daraus
 * Flammen, Rauch, Funken und Lavaglühen selbst. Die Teilchen liegen in einem festen Ringpuffer
 * (`MAX_TEILCHEN`, keine Zuweisung im Bild), das Glühen ist ein einmal gemaltes Sprite, das mit
 * `lighter` gestempelt wird. Die Zahl der neu entstehenden Teilchen je Bild ist begrenzt
 * (`BUDGET_JE_BILD`), unabhängig von der Zahl brennender Zellen. Wer „reduzierte Bewegung" eingestellt
 * hat, sieht Glühen und Asche, aber keine bewegten Teilchen.
 *
 * Zufall: nur Anzeige (`Math.random` ist im Client erlaubt, `src/engine` und `src/shared` nutzen ihn nie).
 *
 * @module feuerOptik
 */
import { FEUER_ZELLE as ZELLE } from '../shared/config/feuer.js';
import { STOFF } from '../shared/config/stoffe.js';

export const MAX_TEILCHEN = 280;
export const BUDGET_JE_BILD = 14;
/** Animierte Flammenringe (Sprite-Atlas) je Bild; zählt zu den Sprite-Effekten, nicht zu den Teilchen. */
export const MAX_RINGE = 6;

const FLAMME = 0;
const FUNKE = 1;
const RAUCH = 2;
const BLASE = 3;

/** Farben der Überdeckung erstarrter Zellen und der Asche (r, g, b, Deckkraft). */
export const ZELLFARBE = Object.freeze({
  [STOFF.ASCHE]: 'rgba(70, 66, 68, 0.82)',
  [STOFF.BASALT]: 'rgba(52, 48, 56, 0.9)',
  [STOFF.OBSIDIAN]: 'rgba(30, 26, 40, 0.92)',
});

/**
 * Malt Zellen in einer Farbe NUR über vorhandene Geländepixel (`source-atop`).
 * @param {CanvasRenderingContext2D} ctx - Geländeebene
 * @param {number[]} indizes - Zellnummern
 * @param {number} spalten
 * @param {string} farbe
 */
export function faerbeZellen(ctx, indizes, spalten, farbe) {
  if (!ctx || indizes.length === 0) return;
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = farbe;
  for (const idx of indizes) ctx.fillRect((idx % spalten) * ZELLE, Math.floor(idx / spalten) * ZELLE, ZELLE, ZELLE);
  ctx.restore();
}

function baueGluehen(groesse, innen, aussen) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = groesse;
  c.height = groesse;
  const g = c.getContext('2d');
  if (!g) return null;
  const v = g.createRadialGradient(groesse / 2, groesse / 2, 0, groesse / 2, groesse / 2, groesse / 2);
  v.addColorStop(0, innen);
  v.addColorStop(1, aussen);
  g.fillStyle = v;
  g.fillRect(0, 0, groesse, groesse);
  return c;
}

export class FeuerOptik {
  constructor() {
    this.flammen = new Map();
    this.lava = new Set();
    this.ragnarok = false;
    this.spalten = 0;
    this.breite = 0;
    this.hoehe = 0;
    this.reduziert = false;
    this.takt = 0;
    this.x = new Float32Array(MAX_TEILCHEN);
    this.y = new Float32Array(MAX_TEILCHEN);
    this.vx = new Float32Array(MAX_TEILCHEN);
    this.vy = new Float32Array(MAX_TEILCHEN);
    this.rest = new Float32Array(MAX_TEILCHEN);
    this.dauer = new Float32Array(MAX_TEILCHEN);
    this.art = new Uint8Array(MAX_TEILCHEN);
    this.gr = new Float32Array(MAX_TEILCHEN);
    this.naechster = 0;
    this.aktiv = 0;
    this.rundlauf = 0;
    this.gluehen = null;
    this.lavaGluehen = null;
    this.glut = 0;
    /** Sprite-Atlas (`effektSheets.SheetEffekte`) für animierte Flammenringe; fehlt er, bleibt es beim Glühen. */
    this.ringe = null;
    this.ids = [];
    this.idsStand = 0;
    this.idsGeaendert = true;
  }

  /** Gelände der Karte: Zellraster der Stoffkarte und Bildgröße. */
  setzeKarte(karte, breite, hoehe) {
    this.spalten = karte?.spalten ?? 0;
    this.breite = breite;
    this.hoehe = hoehe;
  }

  /** Alles vergessen (neue Partie). */
  leere() {
    this.flammen.clear();
    this.idsGeaendert = true;
    this.lava.clear();
    this.ragnarok = false;
    this.aktiv = 0;
    this.glut = 0;
  }

  get brennt() { return this.flammen.size; }

  get teilchen() { return this.aktiv; }

  #mitte(idx) {
    return [(idx % this.spalten) * ZELLE + ZELLE / 2, Math.floor(idx / this.spalten) * ZELLE + ZELLE / 2];
  }

  /** Flammenzellen als Liste: wird nur bei Änderung neu gebaut (kein Feldaufbau je Bild). */
  #flammenIds() {
    if (this.idsStand !== this.flammen.size || this.idsGeaendert) {
      this.ids = [...this.flammen.keys()];
      this.idsStand = this.flammen.size;
      this.idsGeaendert = false;
    }
    return this.ids;
  }

  /** Sichtbarer Weltausschnitt aus der aktuellen Transformation (mit Rand), sonst null (alles zeichnen). */
  #sicht(ctx, rand) {
    if (typeof ctx.getTransform !== 'function' || !ctx.canvas) return null;
    const m = ctx.getTransform();
    if (!m.a || !m.d || m.b || m.c) return null;
    const x0 = (0 - m.e) / m.a;
    const x1 = (ctx.canvas.width - m.e) / m.a;
    const y0 = (0 - m.f) / m.d;
    const y1 = (ctx.canvas.height - m.f) / m.d;
    return { x0: Math.min(x0, x1) - rand, x1: Math.max(x0, x1) + rand, y0: Math.min(y0, y1) - rand, y1: Math.max(y0, y1) + rand };
  }

  /** `feuer_schritt`: neue, gelöschte und ausgebrannte Zellen. */
  schritt({ neu = [], aus = [], asche = [] }) {
    for (const idx of neu) this.flammen.set(idx, 1);
    for (const idx of aus) this.flammen.delete(idx);
    this.idsGeaendert = true;
    for (const idx of asche) {
      this.flammen.delete(idx);
      if (!this.reduziert && this.spalten) {
        const [x, y] = this.#mitte(idx);
        this.#teilchen(RAUCH, x, y - 2, (Math.random() - 0.5) * 0.3, -0.5 - Math.random() * 0.3, 70 + Math.random() * 40, 5);
      }
    }
  }

  /** `feuer_lava`: Zellen, in denen Lava jetzt ruht / nicht mehr liegt. */
  lavaStand({ an = [], ab = [] }) {
    for (const idx of an) this.lava.add(idx);
    for (const idx of ab) this.lava.delete(idx);
  }

  /** `lava_ausbruch`: Fontäne aus Funken und Lavaspritzern. */
  ausbruch({ x, y, n = 12 }) {
    this.glut = 1;
    if (this.reduziert) return;
    for (let i = 0; i < Math.min(28, n * 2); i += 1) {
      this.#teilchen(FUNKE, x + (Math.random() - 0.5) * 12, y - 4, (Math.random() - 0.5) * 3.4, -2.5 - Math.random() * 4, 40 + Math.random() * 40, 2.4);
    }
  }

  /** `flammenwand`: kräftiger Funkenflug an der Wand. */
  wand({ x, y, breite = 40 }) {
    this.glut = 1;
    if (this.reduziert) return;
    for (let i = 0; i < 18; i += 1) {
      this.#teilchen(FUNKE, x + (Math.random() - 0.5) * breite, y - 6, (Math.random() - 0.5) * 1.6, -1.5 - Math.random() * 2.5, 36 + Math.random() * 30, 2);
    }
  }

  #teilchen(art, x, y, vx, vy, leben, gr) {
    const i = this.naechster;
    this.naechster = (this.naechster + 1) % MAX_TEILCHEN;
    this.x[i] = x; this.y[i] = y; this.vx[i] = vx; this.vy[i] = vy;
    this.rest[i] = leben; this.dauer[i] = leben; this.art[i] = art; this.gr[i] = gr;
    if (this.aktiv < MAX_TEILCHEN) this.aktiv += 1;
  }

  /** Ein Bild: neue Teilchen aus Flammen, Lava und Ragnarök-Glut; vorhandene weiterbewegen. */
  fortschreiben() {
    this.takt += 1;
    if (this.glut > 0) this.glut = Math.max(0, this.glut - 0.02);
    let lebende = 0;
    for (let i = 0; i < MAX_TEILCHEN; i += 1) {
      if (this.rest[i] <= 0) continue;
      lebende += 1;
      this.rest[i] -= 1;
      this.x[i] += this.vx[i];
      this.y[i] += this.vy[i];
      const a = this.art[i];
      if (a === FUNKE) { this.vy[i] += 0.09; this.vx[i] *= 0.99; } else if (a === FLAMME) { this.vy[i] *= 0.97; } else if (a === RAUCH) { this.vx[i] += (Math.random() - 0.5) * 0.04; this.gr[i] += 0.05; }
    }
    this.aktiv = lebende;
    if (this.reduziert || !this.spalten) return;
    let budget = BUDGET_JE_BILD;
    const flammenZellen = this.flammen.size;
    if (flammenZellen > 0) {
      const wunsch = Math.min(budget, Math.max(1, Math.ceil(flammenZellen / 6)));
      const ids = this.#flammenIds();
      for (let k = 0; k < wunsch; k += 1) {
        this.rundlauf = (this.rundlauf + 7) % ids.length;
        const [x, y] = this.#mitte(ids[this.rundlauf]);
        const r = Math.random();
        if (r < 0.55) this.#teilchen(FLAMME, x + (Math.random() - 0.5) * 6, y + 2, (Math.random() - 0.5) * 0.3, -0.7 - Math.random() * 0.5, 18 + Math.random() * 14, 4 + Math.random() * 3);
        else if (r < 0.8) this.#teilchen(RAUCH, x, y - 4, (Math.random() - 0.5) * 0.3, -0.6, 60 + Math.random() * 40, 4);
        else this.#teilchen(FUNKE, x, y - 2, (Math.random() - 0.5) * 1.4, -1.2 - Math.random() * 1.6, 26 + Math.random() * 20, 1.6);
        budget -= 1;
      }
    }
    if (this.lava.size > 0 && budget > 0 && this.takt % 3 === 0) {
      const ids = [...this.lava];
      const [x, y] = this.#mitte(ids[Math.floor(Math.random() * ids.length)]);
      if (Math.random() < 0.5) this.#teilchen(BLASE, x + (Math.random() - 0.5) * 6, y - 3, 0, -0.25, 22, 2 + Math.random() * 2);
      else this.#teilchen(RAUCH, x, y - 5, (Math.random() - 0.5) * 0.2, -0.5, 50, 4);
    }
    if (this.ragnarok && budget > 0 && this.takt % 2 === 0 && this.breite > 0) {
      this.#teilchen(FUNKE, Math.random() * this.breite, -4, -0.8 - Math.random() * 0.8, 0.7 + Math.random() * 1.2, 160, 1.6);
    }
  }

  /** Zeichnet Glühen, Lava, Flammen, Funken und Rauch (Weltkoordinaten, Kamera bereits gesetzt). */
  zeichne(ctx) {
    if (!ctx) return;
    if (this.flammen.size === 0 && this.lava.size === 0 && this.aktiv === 0) return;
    if (!this.gluehen) this.gluehen = baueGluehen(32, 'rgba(255,190,80,0.9)', 'rgba(255,90,20,0)');
    if (!this.lavaGluehen) this.lavaGluehen = baueGluehen(40, 'rgba(255,150,40,0.85)', 'rgba(220,40,10,0)');
    ctx.save();
    /*
     * LOOK-3 (2026-10-25): Bei „reduzierte Bewegung" steht die Glut still —
     * wie Partikel, Ringe und Rauch in dieser Datei. Vorher pulsierte die
     * Lavafüllung auch dann.
     */
    const puls = this.reduziert ? 0.9 : 0.8 + 0.2 * Math.sin(this.takt * 0.12);
    // Nur was im Bild liegt wird gemalt (Rand = Glühradius): gleiches Bild, Kosten nach Sichtfläche statt nach Zellenzahl.
    const sicht = this.#sicht(ctx, 24);
    const sp = this.spalten;
    if (this.lava.size > 0) {
      /*
       * LOOK-3: Die Fläche war pro Bild EIN Farbton — eine gleichförmige
       * Platte. Jetzt drei Stufen aus einem festen Zell-Hash: Basaltkruste,
       * glühender Stoff, heiße Ader. Der Hash hängt nur an der Zellnummer,
       * also flackert nichts und dieselbe Karte sieht immer gleich aus; die
       * Zeit steckt allein im gemeinsamen Puls. Drei Pfade statt drei
       * Durchläufe — die Zellen werden weiterhin nur EINMAL besucht.
       */
      ctx.globalCompositeOperation = 'source-over';
      const stufen = [
        `rgb(${Math.round(150 * puls)}, ${Math.round(52 + 26 * puls)}, 14)`,
        `rgb(${Math.round(236 * puls)}, ${Math.round(88 + 50 * puls)}, 20)`,
        `rgb(${Math.round(255 * puls)}, ${Math.round(170 + 40 * puls)}, 60)`,
      ];
      const wege = [new Path2D(), new Path2D(), new Path2D()];
      for (const idx of this.lava) {
        const x = (idx % sp) * ZELLE + ZELLE / 2;
        const y = Math.floor(idx / sp) * ZELLE + ZELLE / 2;
        if (sicht && (x < sicht.x0 || x > sicht.x1 || y < sicht.y0 || y > sicht.y1)) continue;
        const stufe = ((idx * 2654435761) >>> 0) % 3;
        wege[stufe].rect(x - ZELLE / 2, y - ZELLE / 2, ZELLE, ZELLE);
      }
      for (let i = 0; i < wege.length; i += 1) {
        ctx.fillStyle = stufen[i];
        ctx.fill(wege[i]);
      }
      if (this.lavaGluehen) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.5;
        const schritt = 1;
        const gr = 40;
        let n = 0;
        for (const idx of this.lava) {
          if (n++ % schritt) continue;
          const x = (idx % sp) * ZELLE + ZELLE / 2;
          const y = Math.floor(idx / sp) * ZELLE + ZELLE / 2;
          if (sicht && (x < sicht.x0 || x > sicht.x1 || y < sicht.y0 || y > sicht.y1)) continue;
          ctx.drawImage(this.lavaGluehen, x - gr / 2, y - gr / 2 - 2, gr, gr);
        }
      }
    }
    ctx.globalCompositeOperation = 'lighter';
    if (this.gluehen) {
      ctx.globalAlpha = 0.6 * puls;
      const schritt = 1;
      const gr = 28;
      let n = 0;
      for (const idx of this.flammen.keys()) {
        if (n++ % schritt) continue;
        const x = (idx % sp) * ZELLE + ZELLE / 2;
        const y = Math.floor(idx / sp) * ZELLE + ZELLE / 2;
        if (sicht && (x < sicht.x0 || x > sicht.x1 || y < sicht.y0 || y > sicht.y1)) continue;
        ctx.drawImage(this.gluehen, x - gr / 2, y - gr / 2 - 2, gr, gr);
      }
    }
    if (this.ringe && !this.reduziert && this.flammen.size > 0) {
      // Höchstens `MAX_RINGE` animierte Flammenringe, gleichmäßig über die brennenden Zellen verteilt.
      const ids = this.#flammenIds();
      const schritt = Math.max(1, Math.floor(ids.length / MAX_RINGE));
      for (let k = 0, n = 0; k < ids.length && n < MAX_RINGE; k += schritt, n += 1) {
        const [x, y] = this.#mitte(ids[k]);
        if (sicht && (x < sicht.x0 || x > sicht.x1 || y < sicht.y0 || y > sicht.y1)) continue;
        this.ringe.zeichneFeuerring(ctx, x, y - 4, 26, this.takt + k * 5);
      }
      ctx.globalCompositeOperation = 'lighter';
    }
    for (let i = 0; i < MAX_TEILCHEN; i += 1) {
      if (this.rest[i] <= 0) continue;
      const t = this.rest[i] / this.dauer[i];
      const a = this.art[i];
      if (a === RAUCH) continue;
      ctx.globalAlpha = a === FLAMME ? 0.75 * t : Math.min(1, t * 1.4);
      ctx.fillStyle = a === FLAMME ? (t > 0.5 ? '#ffd24a' : '#ff6a1a') : a === BLASE ? '#ffb347' : '#ffcf6a';
      const g = this.gr[i] * (a === FLAMME ? 0.4 + t * 0.6 : 1);
      ctx.fillRect(this.x[i] - g / 2, this.y[i] - g / 2, g, g);
    }
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < MAX_TEILCHEN; i += 1) {
      if (this.rest[i] <= 0 || this.art[i] !== RAUCH) continue;
      const t = this.rest[i] / this.dauer[i];
      ctx.globalAlpha = 0.28 * t;
      ctx.fillStyle = '#3a3638';
      const g = this.gr[i];
      ctx.fillRect(this.x[i] - g / 2, this.y[i] - g / 2, g, g);
    }
    ctx.restore();
  }
}

export default FeuerOptik;
