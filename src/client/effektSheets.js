/**
 * Sprite-Atlanten für Einschlag, Feuer und Leuchtgeschosse — reine Darstellung.
 *
 * Die Sheets (Vorlagen in `assets/material-texturen/`) liegen verkleinert als WebP unter
 * `assets/effekt-sheets/`: `explosion` (8×8 Frames, Feuerball bis Rauch), `glut` (8×8, Nachglühen
 * bis Funken), `feuerring` (8×8 Flammenring-Schleife) und `leuchtgeschosse` (Kometen in vier
 * Farben, per Rechteck aus dem Bogen geschnitten).
 *
 * Aus Ereignissen und Ort entsteht eine Bildfolge: Je Bild rückt jeder Effekt einen Frame vor.
 * Es gibt höchstens `MAX_SHEET_EFFEKTE` zugleich (unter der Teilchengrenze `MAX_PARTIKEL` der
 * Splitter, `effects.js`); weitere werden verworfen, nicht gestapelt. Wer „reduzierte Bewegung"
 * eingestellt hat, bekommt keine Bildfolgen. Nichts davon fließt in Hash, Replay oder Netz.
 *
 * Die Bilder laden erst bei `vorladen()` (beim ersten Match), ohne Bild bleibt alles wie vorher.
 *
 * @module effektSheets
 */

/** Gleichzeitige Bildfolgen; bleibt unter `MAX_PARTIKEL` (26). */
export const MAX_SHEET_EFFEKTE = 12;

/** Folge ganzer Zahlen von `von` bis `bis` einschließlich. */
const reihe = (von, bis) => Array.from({ length: bis - von + 1 }, (_, i) => von + i);

/** Raster der Sheets: Dateiname, Spalten/Zeilen, Frames in Abspielreihenfolge, Bilder je Frame. */
export const SHEETS = Object.freeze({
  explosion: Object.freeze({ datei: 'explosion.webp', spalten: 8, zeilen: 8, frames: reihe(1, 55), takt: 1, kern: 0.4 }),
  glut: Object.freeze({ datei: 'glut.webp', spalten: 8, zeilen: 8, frames: reihe(2, 63), takt: 2, kern: 0.35 }),
  feuerring: Object.freeze({ datei: 'feuerring.webp', spalten: 8, zeilen: 8, frames: reihe(0, 60), takt: 1, kern: 0.3 }),
});

/** Kometen im Bogen `leuchtgeschosse.webp` (Pixel): Farbe → Rechteck; die Längsachse steht senkrecht. */
export const LEUCHT_KOMETEN = Object.freeze({
  gruen: Object.freeze({ x: 16, y: 305, w: 50, h: 78 }),
  gelb: Object.freeze({ x: 79, y: 314, w: 35, h: 60 }),
  cyan: Object.freeze({ x: 139, y: 318, w: 46, h: 80 }),
  rot: Object.freeze({ x: 208, y: 310, w: 52, h: 91 }),
});

/** Schadensart (`engine/damageTypes.js`) → Kometenfarbe; alles andere gelb. */
export const LEUCHT_FARBE = Object.freeze({ fire: 'rot', explosive: 'rot', poison: 'gruen', acid: 'gruen', ice: 'cyan', water: 'cyan' });

/**
 * Rechteck eines Frames im Sheet.
 * @param {keyof typeof SHEETS} art
 * @param {number} index - Position in `frames` (wird begrenzt)
 * @param {number} breite - Pixelbreite des geladenen Bildes
 * @param {number} hoehe
 * @returns {{sx:number, sy:number, sw:number, sh:number}|null}
 */
export function frameRechteck(art, index, breite, hoehe) {
  const s = SHEETS[art];
  if (!s || !(breite > 0) || !(hoehe > 0)) return null;
  const nr = s.frames[Math.max(0, Math.min(s.frames.length - 1, Math.floor(index)))];
  const sw = breite / s.spalten;
  const sh = hoehe / s.zeilen;
  return { sx: (nr % s.spalten) * sw, sy: Math.floor(nr / s.spalten) * sh, sw, sh };
}

/** Wie viele Bilder eine Folge dauert. */
export function dauerBilder(art) {
  const s = SHEETS[art];
  return s ? s.frames.length * s.takt : 0;
}

export class SheetEffekte {
  /**
   * @param {{bildBauer?: () => any}} [optionen]
   */
  constructor({ bildBauer = null } = {}) {
    this.bildBauer = bildBauer ?? (() => (typeof globalThis.Image === 'function' ? new globalThis.Image() : null));
    this.urls = {};
    this.bilder = new Map();
    this.liste = [];
    this.reduziert = false;
    this.gestartet = 0;
    this.verworfen = 0;
  }

  /** Name (`explosion`, `glut`, `feuerring`, `leuchtgeschosse`) → URL. */
  setzeUrls(urls) { this.urls = { ...urls }; }

  /** Stößt das Laden aller Bilder an (einmal; Fehler heißen nur: kein Bild). */
  vorladen() {
    for (const [name, url] of Object.entries(this.urls)) {
      if (this.bilder.has(name)) continue;
      const bild = this.bildBauer();
      if (!bild) continue;
      const eintrag = { bild, bereit: false };
      this.bilder.set(name, eintrag);
      bild.onload = () => { eintrag.bereit = true; };
      bild.onerror = () => { eintrag.bereit = false; };
      bild.src = url;
    }
  }

  /** Ist das Bild des Sheets geladen? */
  bereit(name) {
    const e = this.bilder.get(name);
    return Boolean(e?.bereit && (e.bild.naturalWidth ?? e.bild.width) > 0);
  }

  /**
   * Startet eine Bildfolge. Ohne Bild, bei reduzierter Bewegung oder voller Liste: `false`.
   * @param {keyof typeof SHEETS} art
   * @param {number} groesse - Kantenlänge des ganzen Frames in Weltpixeln
   * @param {{verzoegerung?: number, alpha?: number}} [optionen] - Verzögerung in Bildern
   */
  starte(art, x, y, groesse, { verzoegerung = 0, alpha = 1 } = {}) {
    if (this.reduziert || !SHEETS[art] || !this.bereit(art)) return false;
    if (this.liste.length >= MAX_SHEET_EFFEKTE) { this.verworfen += 1; return false; }
    this.liste.push({ art, x, y, groesse, alter: -Math.max(0, verzoegerung), alpha });
    this.gestartet += 1;
    return true;
  }

  /**
   * Einschlag einer Explosion: Feuerball-Bildfolge, bei großem Radius mit verzögertem Nachglühen.
   * Der Frame ist größer als der Feuerball (`kern`): Die Kantenlänge folgt dem Explosionsradius.
   */
  einschlag(x, y, radius) {
    const g = Math.max(40, radius * 2 / SHEETS.explosion.kern);
    const ok = this.starte('explosion', x, y, g);
    if (ok && radius >= 30) this.starte('glut', x, y + radius * 0.15, g * 0.7, { verzoegerung: 20, alpha: 0.85 });
    return ok;
  }

  /** Ein Bild weiter; abgelaufene Folgen gehen. */
  fortschreiben() {
    if (this.liste.length === 0) return;
    for (const e of this.liste) e.alter += 1;
    this.liste = this.liste.filter(e => e.alter < dauerBilder(e.art));
  }

  /** Zeichnet alle laufenden Folgen (Weltkoordinaten). */
  zeichne(ctx) {
    if (!ctx || this.liste.length === 0) return;
    ctx.save();
    for (const e of this.liste) {
      if (e.alter < 0) continue;
      this.#frame(ctx, e.art, Math.floor(e.alter / SHEETS[e.art].takt), e.x, e.y, e.groesse, e.alpha);
    }
    ctx.restore();
  }

  #frame(ctx, art, index, x, y, groesse, alpha = 1) {
    const e = this.bilder.get(art);
    if (!e?.bereit) return false;
    const r = frameRechteck(art, index, e.bild.naturalWidth ?? e.bild.width, e.bild.naturalHeight ?? e.bild.height);
    if (!r) return false;
    ctx.globalAlpha = alpha;
    ctx.drawImage(e.bild, r.sx, r.sy, r.sw, r.sh, x - groesse / 2, y - groesse / 2, groesse, groesse);
    return true;
  }

  /** Ein Frame des Flammenrings (Schleife) an einer brennenden Zelle; `takt` ist der Bildzähler. */
  zeichneFeuerring(ctx, x, y, groesse, takt) {
    if (this.reduziert || !this.bereit('feuerring')) return false;
    const n = SHEETS.feuerring.frames.length;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const ok = this.#frame(ctx, 'feuerring', ((takt % n) + n) % n, x, y, groesse, 0.9);
    ctx.restore();
    return ok;
  }

  /**
   * Leuchtgeschoss-Komet für Geschosse ohne eigenes Sprite: gedreht in Flugrichtung
   * (`winkel` in Bogenmaß, 0 = nach rechts), `laenge` in Weltpixeln.
   * @returns {boolean} ob gezeichnet wurde
   */
  zeichneKomet(ctx, farbe, x, y, winkel, laenge) {
    const k = LEUCHT_KOMETEN[farbe] ?? LEUCHT_KOMETEN.gelb;
    const e = this.bilder.get('leuchtgeschosse');
    if (!e?.bereit) return false;
    const breite = laenge * k.w / k.h;
    ctx.save();
    ctx.translate(x, y);
    // Die Bildachse zeigt nach oben (Schweif nach unten); die Flugrichtung ist `winkel`.
    ctx.rotate(winkel + Math.PI / 2);
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(e.bild, k.x, k.y, k.w, k.h, -breite / 2, -laenge / 2, breite, laenge);
    ctx.restore();
    return true;
  }

  leere() { this.liste = []; }
}

export default SheetEffekte;
