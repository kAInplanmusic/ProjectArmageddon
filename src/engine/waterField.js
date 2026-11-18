/**
 * Deterministisches Wasser-Feld (Cellular-Automata-artiger Spread).
 *
 * Arbeitet auf einem Float32-Grid mit vertikalem Vorrang (Fallbewegung) und
 * anschliessendem seitlichem Druckausgleich. Terrain wird ueber einen
 * Solid-Lookup beruecksichtigt, damit Krater Wasser aufnehmen koennen.
 *
 * @module WaterField
 */
export class WaterField {
  #width;
  #height;
  #levels;
  #next;
  #isSolid;
  #flowRate;
  #worldScale;
  #fenster = null;
  #fluss = null;
  #bewegt = 0;

  /**
   * @param {object} options
   * @param {number} options.width
   * @param {number} options.height
   * @param {function(number,number):boolean} options.isSolid
   * @param {number} [options.flowRate=0.85]
   * @param {number} [options.worldScale=1] - Weltpixel pro Rasterzelle
   */
  constructor({ width, height, isSolid, flowRate = 0.85, worldScale = 1 } = {}) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
      throw new TypeError('width und height muessen positive Ganzzahlen sein');
    }
    if (!Number.isFinite(worldScale) || worldScale <= 0) {
      throw new TypeError('worldScale muss eine positive Zahl sein');
    }
    this.#width = width;
    this.#height = height;
    this.#flowRate = flowRate;
    this.#worldScale = worldScale;
    this.#isSolid = typeof isSolid === 'function' ? isSolid : () => false;
    this.#levels = new Float32Array(width * height);
    this.#next = new Float32Array(width * height);
  }

  get width() { return this.#width; }
  get height() { return this.#height; }
  get levels() { return this.#levels; }
  get worldScale() { return this.#worldScale; }

  /** Wandelt Weltkoordinaten in Rasterzellen um (für Kopplung mit der Physik). */
  toGrid(worldX, worldY) {
    return {
      x: Math.floor(worldX / this.#worldScale),
      y: Math.floor(worldY / this.#worldScale),
    };
  }

  /** Wasserstand an einer Weltkoordinate (Brücke für Physik/Charaktere). */
  levelAtWorld(worldX, worldY) {
    const cell = this.toGrid(worldX, worldY);
    return this.getLevel(cell.x, cell.y);
  }

  setLevel(x, y, level) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    if (ix < 0 || ix >= this.#width || iy < 0 || iy >= this.#height) return;
    this.#levels[iy * this.#width + ix] = Math.max(0, Math.min(1, level));
  }

  getLevel(x, y) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    if (ix < 0 || ix >= this.#width || iy < 0 || iy >= this.#height) return 0;
    return this.#levels[iy * this.#width + ix];
  }

  /** Fuellt einen Bereich bis zum Wasserspiegel auf. */
  fillRectangle(x0, y0, x1, y1, level = 1) {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        this.setLevel(x, y, level);
      }
    }
  }

  /**
   * Verdrängt Wasser aus einem Radius um (worldX, worldY).
   *
   * Explosionen drücken Wasser nach außen: das Wasser im Zentrum wird auf die
   * Randzellen verschoben, sodass die Gesamtmenge erhalten bleibt. Rein
   * deterministisch, keine Zufallswerte.
   *
   * @param {number} worldX - Zentrum in Weltkoordinaten
   * @param {number} worldY
   * @param {number} radiusWorld - Radius in Weltpixeln
   * @param {number} strength - 0..1, wie stark verdrängt wird
   * @returns {number} verdrängte Wassermenge
   */
  displace(worldX, worldY, radiusWorld, strength = 0.7) {
    const scale = this.#worldScale;
    const cx = Math.floor(worldX / scale);
    const cy = Math.floor(worldY / scale);
    const radius = Math.max(1, Math.round(radiusWorld / scale));
    const clampedStrength = Math.max(0, Math.min(1, strength));

    // Quellzellen im Radius einsammeln (noch nichts verändern).
    const sources = [];
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy > radius * radius) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || x >= this.#width || y < 0 || y >= this.#height) continue;
        if (this.#isSolid(x, y)) continue;
        const index = y * this.#width + x;
        const level = this.#levels[index];
        if (level <= 0.001) continue;
        sources.push({ index, level });
      }
    }
    if (sources.length === 0) return 0;

    // Zielzellen im Ring um den Radius — mit ihrer Restkapazität.
    const ring = radius + 1;
    const targets = [];
    let totalCapacity = 0;
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        const distSq = dx * dx + dy * dy;
        if (distSq <= radius * radius || distSq > ring * ring) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || x >= this.#width || y < 0 || y >= this.#height) continue;
        if (this.#isSolid(x, y)) continue;
        const index = y * this.#width + x;
        const capacity = Math.max(0, 1 - this.#levels[index]);
        if (capacity <= 0.001) continue;
        targets.push({ index, capacity });
        totalCapacity += capacity;
      }
    }

    // Wasserlauf: die verdrängte Stelle weckt das Feld (Fenster um den Ring). Ohne Aufruf von `stepAktiv` wirkungslos.
    this.#vereine(cx - ring - 2, cy - ring - 2, cx + ring + 2, cy + ring + 2);

    // Ohne Ausweichplatz bleibt das Wasser, wo es ist.
    if (targets.length === 0 || totalCapacity <= 0.001) return 0;

    // Nur so viel bewegen, wie auch Platz hat — das erhält die Menge exakt.
    const availableWater = sources.reduce((sum, source) => sum + source.level, 0);
    const amount = Math.min(availableWater * clampedStrength, totalCapacity);
    if (amount <= 0.001) return 0;

    // Proportionale Entnahme aus den Quellen.
    for (const source of sources) {
      this.#levels[source.index] -= (source.level / availableWater) * amount;
    }
    // Proportionale Verteilung nach Kapazität.
    for (const target of targets) {
      const share = (target.capacity / totalCapacity) * amount;
      this.#levels[target.index] = Math.min(1, this.#levels[target.index] + share);
    }
    return amount;
  }

  /** Ein Simulationsschritt: erst vertikaler Fluss, dann seitlicher Ausgleich. */
  step() {
    return this.#schritt(0, 0, this.#width - 1, this.#height - 1, false);
  }

  /**
   * Wasserlauf (Biomregel-Fassung 5): Ein Schritt NUR im wachen Fenster — und nur, solange sich etwas bewegt.
   *
   * Das Fenster ist der Umriss der Zellen, die sich im letzten Schritt änderten (plus Rand), oder der Bereich, den
   * `wecke` meldete (Krater). Außerhalb des Fensters gilt der Rand als fest: Wasser kann das Fenster nicht verlassen,
   * die Menge bleibt erhalten. So kostet ein Schritt die Größe der bewegten Stelle, nicht die der Karte.
   * Liefert die Zahl der bewegten Zellen (0 = ruhig, das Fenster schläft).
   * @returns {number}
   */
  stepAktiv() {
    const f = this.#fenster;
    if (!f) return 0;
    this.#fenster = null;
    this.#schritt(f.x0, f.y0, f.x1, f.y1, true);
    return this.#bewegt;
  }

  /** Weckt das Wasser um einen Weltpunkt (Radius in Weltpixeln); mehrere Aufrufe vereinen sich zu einem Fenster. */
  wecke(worldX, worldY, radiusWorld) {
    const scale = this.#worldScale;
    const r = Math.ceil(radiusWorld / scale) + 3;
    const cx = Math.floor(worldX / scale);
    const cy = Math.floor(worldY / scale);
    this.#vereine(cx - r, cy - r, cx + r, cy + r);
  }

  #vereine(x0, y0, x1, y1) {
    const a = Math.max(0, x0); const b = Math.max(0, y0);
    const c = Math.min(this.#width - 1, x1); const d = Math.min(this.#height - 1, y1);
    if (a > c || b > d) return;
    const f = this.#fenster;
    this.#fenster = f
      ? { x0: Math.min(f.x0, a), y0: Math.min(f.y0, b), x1: Math.max(f.x1, c), y1: Math.max(f.y1, d) }
      : { x0: a, y0: b, x1: c, y1: d };
  }

  /** Seitliche Strömung an einer Weltkoordinate im letzten Schritt: − nach links, + nach rechts (Zellen je Schritt, etwa −0,5 bis 0,5). */
  flussAn(worldX, worldY) {
    if (!this.#fluss) return 0;
    const cell = this.toGrid(worldX, worldY);
    if (cell.x < 0 || cell.y < 0 || cell.x >= this.#width || cell.y >= this.#height) return 0;
    return this.#fluss[cell.y * this.#width + cell.x];
  }

  /**
   * Der gemeinsame Schritt. `fenster` begrenzt die Zellen; `aktiv` schaltet Strömungsmessung und Fenster-Nachführung ein.
   * Mit `aktiv = false` und vollem Fenster rechnet er Bit für Bit wie der frühere `step()`.
   */
  #schritt(fx0, fy0, fx1, fy1, aktiv) {
    const { width, height } = this;
    const levels = this.#levels;
    const next = this.#next;
    if (aktiv) {
      for (let y = fy0; y <= fy1; y++) next.fill(0, y * width + fx0, y * width + fx1 + 1);
      if (!this.#fluss) this.#fluss = new Float32Array(width * height);
      for (let y = fy0; y <= fy1; y++) this.#fluss.fill(0, y * width + fx0, y * width + fx1 + 1);
    } else {
      next.fill(0);
    }
    const fluss = aktiv ? this.#fluss : null;

    // Von UNTEN nach OBEN verarbeiten. Nur so ist die Kapazität der Zelle unter
    // uns bereits endgültig, wenn wir sie prüfen. Bei aufsteigender Reihenfolge
    // ist next[unten] noch leer, die Kapazitätsprüfung schlägt fehl und Wasser
    // stapelt sich unbegrenzt in der untersten Zelle.
    for (let y = fy1; y >= fy0; y--) {
      for (let x = fx0; x <= fx1; x++) {
        const index = y * width + x;
        if (this.#isSolid(x, y)) continue;

        // Eigenes Wasser; next[index] enthält bereits seitliche Zuflüsse.
        let remaining = levels[index];
        if (remaining <= 0.001 && next[index] <= 0.001) continue;

        // 1. Vertikal: maximaler Fall nach unten.
        const belowY = y + 1;
        if (belowY <= fy1 && belowY < height && !this.#isSolid(x, belowY)) {
          const belowIndex = belowY * width + x;
          const capacity = Math.max(0, 1 - next[belowIndex]);
          if (capacity > 0) {
            const flow = Math.min(remaining, capacity);
            next[belowIndex] += flow;
            remaining -= flow;
          }
        }

        // 2. Seitlich: Druckausgleich mit den beiden Nachbarn.
        if (remaining > 0.001) {
          for (const dx of [-1, 1]) {
            if (remaining <= 0.001) break;
            const nx = x + dx;
            if (nx < fx0 || nx > fx1 || nx < 0 || nx >= width) continue;
            if (this.#isSolid(nx, y)) continue;
            const neighbourIndex = y * width + nx;
            // Eigenes Wasser des Nachbarn plus bereits erhaltene Zuflüsse.
            const neighbourLevel = levels[neighbourIndex] + next[neighbourIndex];
            const capacity = Math.max(0, 1 - neighbourLevel);
            if (capacity <= 0.001) continue;
            if (neighbourLevel >= remaining) continue;
            const transfer = Math.min(
              remaining,
              capacity,
              (remaining - neighbourLevel) * 0.5 * this.#flowRate,
            );
            if (transfer <= 0) continue;
            next[neighbourIndex] += transfer;
            remaining -= transfer;
            if (fluss) { fluss[index] += dx * transfer; fluss[neighbourIndex] += dx * transfer; }
          }
        }

        // Physische Obergrenze: eine Zelle fasst höchstens 1.0 Wasser.
        next[index] = Math.min(1, next[index] + remaining);
      }
    }

    if (!aktiv) {
      this.#levels.set(next);
      return this;
    }
    // Fenster: zurückschreiben, bewegte Zellen zählen, das nächste Fenster aus dem Umriss der Bewegung bilden.
    let bewegt = 0;
    let bx0 = width; let by0 = height; let bx1 = -1; let by1 = -1;
    for (let y = fy0; y <= fy1; y++) {
      for (let x = fx0; x <= fx1; x++) {
        const i = y * width + x;
        if (Math.abs(next[i] - levels[i]) > 0.002) {
          bewegt += 1;
          if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y;
        }
        levels[i] = next[i];
      }
    }
    this.#bewegt = bewegt;
    if (bewegt > 0) this.#vereine(bx0 - 2, by0 - 2, bx1 + 2, by1 + 2);
    return this;
  }

  /** Gesamtwassermenge — dient als Determinismus-Check. */
  totalVolume() {
    let total = 0;
    for (let i = 0; i < this.#levels.length; i++) total += this.#levels[i];
    return total;
  }

  serialize() {
    return Array.from(this.#levels, value => Math.round(value * 100) / 100);
  }
}

export default WaterField;
