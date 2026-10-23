/**
 * CollisionMask: Bitmask-basierte Kollision für Terrain.
 *
 * Unterstützt Bitmaps bis zu 32×N-Pixeln mit word-weiser Speicherung.
 * Schützt vor shift >= 32-Edge-Cases.
 *
 * @module CollisionMask
 */

import { FNV_BASIS, FNV_PRIM } from '../../shared/fnv.js';

/** Stützstellen der Randrauheit rund um den Krater. */
const KRATER_SEGMENTE = 16;
/** Größte Abweichung des Randes vom Kreis (Anteil des Radius). */
const KRATER_RAUHEIT = 0.1;
/** Kleinere Krater bleiben glatt: Die Abweichung läge unter einem Pixel. */
const KRATER_RAUH_AB_RADIUS = 8;

/** Ganzzahl-Mischer (Murmur-Finalizer): nur `Math.imul` und Verschiebungen, überall gleich. */
export function mische32(h) {
  let v = h | 0;
  v ^= v >>> 16;
  v = Math.imul(v, 0x85ebca6b);
  v ^= v >>> 13;
  v = Math.imul(v, 0xc2b2ae35);
  v ^= v >>> 16;
  return v >>> 0;
}

/**
 * Die Form eines rauen Kraters — eine reine Funktion von Ort, Radius und Tiefe.
 *
 * Server (`Zerstoerung.krater`) und Client (`applyCraterToTerrain`) rechnen
 * dieselbe Form aus denselben vier Ganzzahlen. Es kommen KEINE Winkelfunktionen
 * vor (`Math.sin`/`Math.cos` dürfen in Browsern in der letzten Stelle
 * abweichen und ließen Randzellen auseinanderlaufen); nur `+ - * /` und
 * `Math.imul`, die IEEE-754 und die Ganzzahlarithmetik überall gleich ausführen.
 *
 * @param {number} x
 * @param {number} y
 * @param {number} radius
 * @param {number} tiefe - Tiefe unterhalb des Einschlagpunkts in Prozent des Radius
 * @returns {{radius:number, tiefe:number, rauh:number, versatz:Float64Array}}
 */
export function kraterForm(x, y, radius, tiefe) {
  let h = mische32(
    Math.imul(Math.round(x) | 0, 73856093)
    ^ Math.imul(Math.round(y) | 0, 19349663)
    ^ Math.imul(radius | 0, 83492791)
    ^ Math.imul(tiefe | 0, 0x2545f491),
  );
  const versatz = new Float64Array(KRATER_SEGMENTE);
  for (let i = 0; i < KRATER_SEGMENTE; i++) {
    h = mische32(h + 0x9e3779b9);
    versatz[i] = (h & 0xffff) / 32767.5 - 1;
  }
  return {
    radius,
    tiefe: Math.max(0.5, tiefe / 100),
    rauh: radius >= KRATER_RAUH_AB_RADIUS ? KRATER_RAUHEIT : 0,
    versatz,
  };
}

/**
 * Liegt der Versatz (ix, dy) vom Mittelpunkt im Krater? Der Rand folgt einem
 * Pseudowinkel (`|x|+|y|`-Norm statt `atan2`), die Tiefe dehnt nur die untere Hälfte.
 */
export function kraterInnen(form, ix, dy) {
  const a = Math.abs(ix) + Math.abs(dy);
  if (a === 0) return true;
  let t;
  if (dy >= 0) t = ix >= 0 ? dy / a : 1 - ix / a;
  else t = ix < 0 ? 2 - dy / a : 3 + ix / a;
  const s = t * (KRATER_SEGMENTE / 4);
  const i0 = Math.floor(s);
  const f0 = s - i0;
  const f = f0 * f0 * (3 - 2 * f0);
  const a0 = form.versatz[i0 % KRATER_SEGMENTE];
  const a1 = form.versatz[(i0 + 1) % KRATER_SEGMENTE];
  const r = form.radius * (1 + form.rauh * (a0 + (a1 - a0) * f));
  const ey = dy > 0 ? dy / form.tiefe : dy;
  return ix * ix + ey * ey <= r * r;
}

/**
 * Ruft `fn(px, py)` für jede Zelle eines Kraters auf.
 *
 * EINE Rechenvorschrift für Server-Maske und Client-Karte: Wer die Zellen an
 * zwei Stellen getrennt herleitet, bekommt irgendwann zwei verschiedene Löcher.
 *
 * Ohne `tiefe` (Altfassung, `ZERSTOERUNG_ALT`) ist der Krater ein perfekter
 * Kreis, Zelle für Zelle wie immer. Mit `tiefe` (Prozent) entsteht die raue Form
 * aus `kraterForm`.
 */
export function eachCraterCell(width, height, x, y, radius, fn, tiefe = null) {
  if (tiefe !== null && tiefe !== undefined) {
    const form = kraterForm(x, y, radius, tiefe);
    const reichweite = Math.ceil(radius * (1 + form.rauh));
    const unten = Math.ceil(reichweite * form.tiefe);
    for (let dy = -reichweite; dy <= unten; dy++) {
      const py = Math.round(y + dy);
      if (py < 0 || py >= height) continue;
      for (let ix = -reichweite; ix <= reichweite; ix++) {
        const px = Math.round(x + ix);
        if (px >= 0 && px < width && kraterInnen(form, ix, dy)) fn(px, py);
      }
    }
    return;
  }
  for (let dy = -radius; dy <= radius; dy++) {
    const dx = Math.sqrt(radius * radius - dy * dy);
    for (let ix = -Math.floor(dx); ix <= Math.floor(dx); ix++) {
      const px = Math.round(x + ix);
      const py = Math.round(y + dy);
      if (px >= 0 && px < width && py >= 0 && py < height) {
        if (ix * ix + dy * dy <= radius * radius) fn(px, py);
      }
    }
  }
}

/**
 * Ruft `fn(px, py)` für jede Zelle des Mahlstrom-Einschnitts auf: die ersten
 * `inset` Spalten links und rechts, über die ganze Höhe.
 *
 * EINE Rechenvorschrift für Server (`MaelstromSystem.contract`) und Client
 * (`applyInsetToTerrain`), wie bei `eachCraterCell`. Berührt der Einschnitt die
 * Mitte (`inset * 2 >= width`), wird nichts abgetragen — so verhielt sich der
 * Server schon immer.
 */
export function eachInsetCell(width, height, inset, fn) {
  if (!(inset > 0) || inset * 2 >= width) return;
  const spalten = Math.min(Math.floor(inset), width);
  for (let x = 0; x < spalten; x++) {
    for (let y = 0; y < height; y++) {
      fn(x, y);
      fn(width - 1 - x, y);
    }
  }
}

export class CollisionMask {
  #width;
  #height;
  #words; // Uint32Array
  #dirty = false;
  #craters = [];
  /** Unzerstörbare Stoffzellen (`stoffkarte.geschuetzt`), `null` = alles zerstörbar. */
  #schutz = null;
  #version = 0;

  constructor(width, height) {
    if (width <= 0 || height <= 0) {
      throw new Error('Breite und Höhe müssen positiv sein');
    }

    this.#width = width;
    this.#height = height;
    // Wort-basierte Speicherung: 32 Pixel pro Wort
    const wordsPerRow = Math.ceil(width / 32);
    this.#words = new Uint32Array(wordsPerRow * height);
    this.#dirty = true;
  }

  /**
   * Erzeugt eine CollisionMask aus einem Bitmap (Array von 0/1-Werten).
   * @param {number[]} bitmap - 1D-Array der Pixelwerte
   * @param {number} width
   * @param {number} height
   * @returns {CollisionMask}
   */
  static fromBitmap(bitmap, width, height) {
    if (bitmap.length !== width * height) {
      throw new Error(`Bitmap-Größe (${bitmap.length}) stimmt nicht mit Breite×Höhe (${width}x${height}) überein`);
    }

    const mask = new CollisionMask(width, height);
    const wordsPerRow = Math.ceil(width / 32);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const bitIndex = (y * width + x);
        if (bitmap[bitIndex]) {
          const wordIndex = y * wordsPerRow + Math.floor(x / 32);
          const bitOffset = x % 32;
          mask.#words[wordIndex] |= (1 << bitOffset);
        }
      }
    }

    mask.#dirty = false;
    return mask;
  }

  /**
   * Setzt einen Pixel.
   * @param {number} x
   * @param {number} y
   * @param {boolean} solid
   */
  setPixel(x, y, solid) {
    const wordsPerRow = Math.ceil(this.#width / 32);
    const wordIndex = y * wordsPerRow + Math.floor(x / 32);
    const bitOffset = x % 32;

    if (solid) {
      this.#words[wordIndex] |= (1 << bitOffset);
    } else {
      this.#words[wordIndex] &= ~(1 << bitOffset);
    }

    this.#dirty = true;
    this.#version += 1;
  }

  /**
   * Zählt jede Änderung der Maske. Wer aus der Maske Abgeleitetes zwischenspeichert
   * (z. B. die Oberflächenhöhe je Spalte), vergleicht diese Zahl und wirft seinen
   * Zwischenspeicher bei einer Änderung weg.
   */
  get version() { return this.#version; }

  /**
   * Höchster fester Pixel einer Spalte — die Oberfläche, wie sie JETZT ist.
   * @param {number} x - wird wie bei der Kartensuche abgerundet und an den Rand geklemmt
   * @returns {number} Y oder -1, wenn die Spalte leer ist
   */
  topSolidY(x) {
    const spalte = Math.max(0, Math.min(this.#width - 1, Math.floor(x)));
    if (Number.isNaN(spalte)) return -1;
    const wordsPerRow = Math.ceil(this.#width / 32);
    const wortSpalte = Math.floor(spalte / 32);
    const maske = 1 << (spalte % 32);
    for (let y = 0; y < this.#height; y++) {
      if (this.#words[y * wordsPerRow + wortSpalte] & maske) return y;
    }
    return -1;
  }

  /**
   * Prüft, ob ein Pixel fest ist (kollidiert).
   * @param {number} x
   * @param {number} y
   * @returns {boolean}
   */
  isSolid(x, y) {
    if (x < 0 || x >= this.#width || y < 0 || y >= this.#height) {
      return true; // Rand ist fest
    }

    const wordsPerRow = Math.ceil(this.#width / 32);
    const wordIndex = y * wordsPerRow + Math.floor(x / 32);
    const bitOffset = x % 32;

    return (this.#words[wordIndex] & (1 << bitOffset)) !== 0;
  }

  /**
   * Ab Zerstörungsfassung 5: Zellen, die die Stoffkarte als unzerstörbar kennt, bleiben bei Kratern stehen.
   * @param {{geschuetzt:Uint8Array|null, spalten:number}|null} karte
   */
  setzeSchutz(karte) {
    this.#schutz = karte?.geschuetzt ? { feld: karte.geschuetzt, spalten: karte.spalten } : null;
  }

  /**
   * Erzeugt eine Krater-Destruktion an (x, y) mit gegebenem Radius.
   * @param {number} x - Zentrum X
   * @param {number} y - Zentrum Y
   * @param {number} radius - Krater-Radius
   * @param {number|null} [tiefe] - Tiefe in Prozent (raue Form), `null` = Kreis
   */
  punchCrater(x, y, radius, tiefe = null) {
    const s = this.#schutz;
    eachCraterCell(this.#width, this.#height, x, y, radius, (px, py) => {
      if (s && s.feld[(py >> 3) * s.spalten + (px >> 3)] === 1) return;
      this.setPixel(px, py, false);
    }, tiefe);
    this.#craters.push(tiefe === null || tiefe === undefined ? [x, y, radius] : [x, y, radius, tiefe]);
    this.#dirty = true;
  }

  /**
   * Hängt einen Eintrag an das Log, der kein Krater ist (eine gelandete Insel:
   * `['s', dy, x, y0, y1, ...]`, siehe `engine/zerstoerung.js`). Die Reihenfolge
   * im Log ist die Reihenfolge der Änderungen; der Client spielt es so ab.
   */
  logEintrag(eintrag) {
    this.#craters.push(eintrag);
  }

  /**
   * Alle bisherigen Änderungen in der Reihenfolge ihrer Entstehung: Krater als
   * `[x, y, radius]` (Altfassung) bzw. `[x, y, radius, tiefe]` (raue Form) und
   * gelandete Inseln als `['s', dy, ...]` (siehe `logEintrag`).
   *
   * Warum es das gibt (Audit 2026-10-09): Ein Client, der später beitritt oder
   * die Verbindung wieder aufnimmt, baut das Gelände aus dem Seed und sieht
   * damit die UNZERSTÖRTE Karte, während der Server längst Löcher hat (nach nur
   * 9 Kratern wichen 3 082 Zellen ab). Das Protokoll liefert sie jetzt nach.
   */
  get craterLog() { return this.#craters.map(eintrag => [...eintrag]); }

  /**
   * Kompakter Hash der Maske (FNV-1a, wortweise über die 32-Bit-Maskenwörter,
   * Breite und Höhe fliessen ein). Deterministisch und plattformunabhängig
   * (`Math.imul`); dient dem Abgleich Server <-> Client (Terrain-Hash).
   * Kosten gemessen in `tests/terrain-hash.test.js` (2560x1440, 115 200 Wörter).
   * @returns {number} vorzeichenlose 32-Bit-Zahl
   */
  hash() {
    let h = FNV_BASIS;
    h = Math.imul(h ^ this.#width, FNV_PRIM);
    h = Math.imul(h ^ this.#height, FNV_PRIM);
    const w = this.#words;
    for (let i = 0; i < w.length; i++) h = Math.imul(h ^ w[i], FNV_PRIM);
    return h >>> 0;
  }

  /** Anzahl bisheriger Krater (billig; `craterLog` kopiert die Liste). */
  get craterCount() { return this.#craters.length; }

  get width() { return this.#width; }
  get height() { return this.#height; }
  get isDirty() { return this.#dirty; }

  markClean() {
    this.#dirty = false;
  }
}

export default CollisionMask;
