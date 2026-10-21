/**
 * Kulisse des Planeten-Bioms: Kosmos-Himmel mit der Exoplanet-Szene und Planetenkugeln.
 *
 * Gezeichnet wird als Teil des generativen Himmels (`sceneryPainter.drawSky`, Himmelskörper `planet`):
 * die Szene (Sterne, Nebel, roter Zwergstern) füllt als cover-Zuschnitt (`kulissenZuschnitt.js`, Hoch- und
 * Querformat) die Fläche, darauf steht die Kugel der Planetenart (`kugel` in `config/biome-planet.js`) und
 * eine kleinere zweite. Die Bilder (`assets/planeten-kulisse/`) laden erst, wenn eine Planetenkarte sie
 * braucht; bis sie da sind, bleibt der dunkle Himmelsverlauf stehen und `beiBereit` meldet die Ankunft.
 *
 * Reine Darstellung; Lage und Größe folgen der Kulisse (`scenery.celestial`, aus dem Seed).
 *
 * @module planetenKulisse
 */
import { coverZuschnitt } from './kulissenZuschnitt.js';
import { PLANET_BIOME } from '../shared/config/biome-planet.js';

/** Zweite Kugel neben der Hauptkugel: nach dem Zug der Kulisse eine der beiden bunten. */
const NEBENKUGELN = Object.freeze(['bunt', 'blaurost']);

export class PlanetenBilder {
  constructor() {
    this.urls = {};
    this.bilder = new Map();
    this.hoerer = new Set();
  }

  setzeUrls(urls) { this.urls = { ...urls }; }

  /** Stößt das Laden an (einmal je Bild) und ruft `fn` bei jedem fertigen Bild. */
  vorladen(fn = null) {
    if (fn) this.hoerer.add(fn);
    if (typeof globalThis.Image !== 'function') return;
    for (const [name, url] of Object.entries(this.urls)) {
      if (this.bilder.has(name)) continue;
      const bild = new globalThis.Image();
      const eintrag = { bild, bereit: false };
      this.bilder.set(name, eintrag);
      bild.onload = () => {
        eintrag.bereit = true;
        for (const h of this.hoerer) { try { h(name); } catch { /* Anzeige darf nicht werfen */ } }
      };
      bild.src = url;
    }
  }

  /** Das fertige Bild oder `null`. */
  bild(name) {
    const e = this.bilder.get(name);
    return e?.bereit ? e.bild : null;
  }
}

export const planetenBilder = new PlanetenBilder();

/**
 * Lage der Kugeln für eine Kulisse: Hauptkugel am Himmelskörper, Nebenkugel gegenüber.
 * Reine Rechnung (prüfbar ohne Bild).
 *
 * @param {{x:number, y:number, size:number, phase?:number}} koerper
 * @param {string} biomId - `planet_*`
 * @param {number} breite
 * @param {number} hoehe
 * @returns {Array<{name:string, x:number, y:number, r:number}>}
 */
export function kugelLage(koerper, biomId, breite, hoehe) {
  const haupt = PLANET_BIOME[biomId]?.kugel ?? 'stein';
  const r = Math.min(0.13, Math.max(0.07, koerper.size * 1.5)) * Math.min(breite, hoehe * 1.8);
  const links = koerper.x < 0.5;
  const neben = NEBENKUGELN[Math.floor((koerper.phase ?? 0) * NEBENKUGELN.length) % NEBENKUGELN.length];
  return [
    { name: haupt, x: koerper.x * breite, y: Math.min(koerper.y, 0.3) * hoehe + r * 0.4, r },
    { name: neben, x: (links ? 0.82 : 0.16) * breite, y: 0.14 * hoehe + r * 0.1, r: r * 0.38 },
  ];
}

/**
 * Zeichnet die Planeten-Kulisse (statt der üblichen Himmelskörper).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {{celestial:object, biomeId:string}} scenery
 * @param {PlanetenBilder} [bilder]
 * @returns {boolean} ob die Szene gezeichnet werden konnte (Bild geladen)
 */
export function zeichnePlanetenHimmel(ctx, breite, hoehe, scenery, bilder = planetenBilder) {
  const szene = bilder.bild('szene');
  if (szene) {
    const z = coverZuschnitt(szene.naturalWidth, szene.naturalHeight, breite, hoehe, 0.5);
    ctx.drawImage(szene, z.sx, z.sy, z.sb, z.sh, 0, 0, breite, hoehe);
  }
  let alles = Boolean(szene);
  for (const k of kugelLage(scenery.celestial, scenery.biomeId, breite, hoehe)) {
    const bild = bilder.bild(k.name);
    if (!bild) { alles = false; continue; }
    // Schein hinter der Kugel, dann die Kugel; eine Schattenseite gibt das Kugelgefühl.
    const schein = ctx.createRadialGradient(k.x, k.y, k.r * 0.9, k.x, k.y, k.r * 1.5);
    schein.addColorStop(0, 'rgba(160, 190, 255, 0.22)');
    schein.addColorStop(1, 'rgba(160, 190, 255, 0)');
    ctx.fillStyle = schein;
    ctx.beginPath();
    ctx.arc(k.x, k.y, k.r * 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.drawImage(bild, k.x - k.r, k.y - k.r, k.r * 2, k.r * 2);
    const schatten = ctx.createRadialGradient(k.x - k.r * 0.45, k.y - k.r * 0.45, k.r * 0.2, k.x - k.r * 0.45, k.y - k.r * 0.45, k.r * 1.6);
    schatten.addColorStop(0, 'rgba(0, 0, 0, 0)');
    schatten.addColorStop(1, 'rgba(0, 0, 8, 0.7)');
    ctx.save();
    ctx.beginPath();
    ctx.arc(k.x, k.y, k.r * 0.99, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = schatten;
    ctx.fillRect(k.x - k.r, k.y - k.r, k.r * 2, k.r * 2);
    ctx.restore();
  }
  return alles;
}
