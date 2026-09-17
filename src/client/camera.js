/**
 * Kamera: Der Bildschirm zeigt einen Ausschnitt der Karte.
 *
 * ## Warum diese Datei existiert
 *
 * Bis hierher war die Karte **genau so groß wie das Fenster**: `render()`
 * zeichnete 1:1 ohne Verschiebung. Auf einem 4K-Fernseher sah man deshalb die
 * ganze Karte auf einmal — das Gegenteil von „große Welt".
 *
 * ## Was eine Kamera ist — und was nicht
 *
 * Sie ist **keine** Anzeigeeinstellung. Sie entscheidet, wie viel Welt auf den
 * Schirm passt, und damit:
 *
 *   - wie klein eine Figur wirkt (auf 4K wäre sie ohne Kamera ein Viertel so
 *     hoch wie auf 720p — bei gleicher Kartenpixelzahl),
 *   - ob man den Gegner sieht, bevor man schießt,
 *   - wie viel man scrollen muss, um zu zielen.
 *
 * ## Die zwei Achsen
 *
 *   1. **Zoom** — wie viele Kartenpixel passen in einen Bildschirmpixel.
 *      Zoom 1 heißt: ein Kartenpixel = ein Bildschirmpixel. Zoom 0,5 heißt:
 *      doppelt so viel Welt auf dem Schirm (alles halb so groß).
 *   2. **Position** — welche Stelle der Karte in der Bildmitte liegt.
 *
 * ## Der wichtige Unterschied zur Reichweite
 *
 * Die Kamera ändert **nichts** an der Physik. Reichweiten, Sprunghöhen und
 * Treffer bleiben in Kartenpixeln — eine größere Karte bleibt also eine
 * größere Karte, auch mit Kamera. Wer die Reichweiten mitwachsen lassen will,
 * muss sie skalieren (`scripts/check-map-scale.mjs`).
 *
 * @module camera
 */

/** Der kleinste und größte Zoom, den die Bedienung zulässt. */
export const ZOOM_GRENZEN = Object.freeze({ min: 0.35, max: 2 });

/**
 * Wie weit die Kamera einer Bewegung folgt (0 = starr, 1 = sofort).
 *
 * Ein sanftes Nachziehen wirkt ruhiger als ein Sprung — bei einem Schuss über
 * die halbe Karte würde ein harter Schnitt den Zusammenhang verlieren lassen.
 */
export const FOLGE_FAKTOR = 0.12;

/**
 * Eine Kamera über einer Karte.
 *
 * Sie ist **zustandslos gegenüber der Simulation**: Sie liest nur Positionen
 * und verändert nichts. Damit kann sie in einem Replay beliebig gesetzt werden,
 * ohne den Verlauf zu berühren.
 */
export class Camera {
  /** Kartenmaße — die Grenzen, in denen sich die Kamera bewegen darf. */
  #mapBreite;

  #mapHoehe;

  /** Bildschirmgröße in Pixeln. */
  #schirmBreite;

  #schirmHoehe;

  /** Aktueller Zoom (Kartenpixel je Bildschirmpixel). */
  #zoom;

  /** Linke obere Ecke des sichtbaren Ausschnitts, in Kartenpixeln. */
  #x = 0;

  #y = 0;

  /** Ziel, dem die Kamera nachzieht. */
  #zielX = 0;

  #zielY = 0;

  /** Ob der Zoom vom Nutzer gesetzt wurde (dann nicht automatisch anpassen). */
  #zoomFest = false;

  constructor({ mapBreite, mapHoehe, schirmBreite, schirmHoehe, zoom = null } = {}) {
    this.#mapBreite = mapBreite;
    this.#mapHoehe = mapHoehe;
    this.#schirmBreite = schirmBreite;
    this.#schirmHoehe = schirmHoehe;

    /*
     * Der Standardzoom zeigt die Karte ganz, wenn sie kleiner ist als der
     * Bildschirm — und sonst einen Ausschnitt, der die Höhe ausfüllt.
     *
     * Das ist die Umkehrung des bisherigen Verhaltens: Früher war die Karte
     * immer so groß wie der Bildschirm (Zoom = Schirm/Karte gesetzt). Jetzt
     * bleibt die Figur auf jedem Bildschirm gleich groß, und die Karte wird
     * größer als der Schirm.
     */
    this.#zoom = zoom ?? this.#zoomFuerGanzeKarte();
    this.#zoomFest = zoom !== null;
  }

  /** Der Zoom, bei dem die Karte vollständig in den Bildschirm passt. */
  #zoomFuerGanzeKarte() {
    const horizontal = this.#schirmBreite / this.#mapBreite;
    const vertikal = this.#schirmHoehe / this.#mapHoehe;
    return Math.min(horizontal, vertikal);
  }

  get zoom() { return this.#zoom; }

  get x() { return this.#x; }

  get y() { return this.#y; }

  /** Die sichtbare Breite in Kartenpixeln. */
  get sichtbareBreite() { return this.#schirmBreite / this.#zoom; }

  /** Die sichtbare Höhe in Kartenpixeln. */
  get sichtbareHoehe() { return this.#schirmHoehe / this.#zoom; }

  /** Ob die Karte breiter ist als der Bildschirm — dann ist Scrollen nötig. */
  get scrolltHorizontal() { return this.sichtbareBreite < this.#mapBreite; }

  /** Ob die Karte höher ist als der Bildschirm. */
  get scrolltVertikal() { return this.sichtbareHoehe < this.#mapHoehe; }

  /** Setzt die Bildschirmgröße neu (Fenstergröße geändert). */
  setzeSchirm(breite, hoehe) {
    if (!(breite > 0) || !(hoehe > 0)) return false;
    this.#schirmBreite = breite;
    this.#schirmHoehe = hoehe;
    // Ohne festen Zoom passt die Karte weiterhin vollständig hinein.
    if (!this.#zoomFest) this.#zoom = this.#zoomFuerGanzeKarte();
    this.#begrenze();
    return true;
  }

  /**
   * Setzt den Zoom.
   *
   * Ein vom Nutzer gesetzter Zoom bleibt erhalten, auch wenn sich die
   * Fenstergröße ändert — sonst würde eine Fensteränderung die Einstellung
   * zurücksetzen.
   */
  setzeZoom(zoom) {
    const begrenzt = Math.max(ZOOM_GRENZEN.min, Math.min(ZOOM_GRENZEN.max, zoom));
    if (begrenzt === this.#zoom) return false;
    this.#zoom = begrenzt;
    this.#zoomFest = true;
    this.#begrenze();
    return true;
  }

  /** Zurück zum Standardzoom (ganze Karte sichtbar). */
  setzeZoomZurueck() {
    this.#zoomFest = false;
    this.#zoom = this.#zoomFuerGanzeKarte();
    this.#begrenze();
  }

  /**
   * Richtet die Kamera auf einen Punkt der Karte aus.
   *
   * @param {number} x Kartenpixel
   * @param {number} y Kartenpixel
   * @param {boolean} sofort - true setzt die Position ohne Nachziehen
   */
  zieleAuf(x, y, sofort = false) {
    this.#zielX = x;
    this.#zielY = y;
    if (sofort) {
      this.#x = x;
      this.#y = y;
      this.#begrenze();
    }
  }

  /**
   * Rückt die Kamera einen Schritt auf ihr Ziel zu.
   *
   * Wird je Bild gerufen. Bei `FOLGE_FAKTOR` = 1 wäre die Kamera starr am Ziel;
   * darunter zieht sie weich nach.
   */
  schritt() {
    this.#x += (this.#zielX - this.#x) * FOLGE_FAKTOR;
    this.#y += (this.#zielY - this.#y) * FOLGE_FAKTOR;
    this.#begrenze();
  }

  /**
   * Verschiebt die Kamera direkt um eine Strecke (Ziehen mit der Maus).
   *
   * Das ist die einzige Bewegung, die das Ziel überschreibt: Wer die Karte
   * selbst schiebt, will nicht, dass sie zurückspringt.
   */
  verschiebe(dx, dy) {
    this.#x += dx;
    this.#y += dy;
    this.#zielX = this.#x;
    this.#zielY = this.#y;
    this.#begrenze();
  }

  /**
   * Hält die Kamera innerhalb der Karte.
   *
   * Ohne diese Grenze zeigte sie an den Rändern leeren Raum — die Karte würde
   * „aufhören", was wie ein Fehler aussähe.
   */
  #begrenze() {
    const halbeBreite = this.sichtbareBreite / 2;
    const halbeHoehe = this.sichtbareHoehe / 2;

    // Ist die Karte schmaler als der Ausschnitt, wird sie mittig gehalten.
    if (this.sichtbareBreite >= this.#mapBreite) {
      this.#x = this.#mapBreite / 2;
    } else {
      this.#x = Math.max(halbeBreite, Math.min(this.#mapBreite - halbeBreite, this.#x));
    }

    if (this.sichtbareHoehe >= this.#mapHoehe) {
      this.#y = this.#mapHoehe / 2;
    } else {
      this.#y = Math.max(halbeHoehe, Math.min(this.#mapHoehe - halbeHoehe, this.#y));
    }
  }

  /**
   * Die Verschiebung für `ctx.setTransform`, in Bildschirmpixeln.
   *
   * Der Canvas wird um `-x·zoom` verschoben, damit der Kartenpunkt `x` links
   * am Bildschirmrand landet. Beim Zeichnen mit `setTransform(a, b, c, d, e, f)`
   * gilt: Bildschirm = Karte · zoom + Verschiebung.
   *
   * @returns {{skalierung:number, versatzX:number, versatzY:number}}
   */
  transformation() {
    return {
      skalierung: this.#zoom,
      versatzX: this.#schirmBreite / 2 - this.#x * this.#zoom,
      versatzY: this.#schirmHoehe / 2 - this.#y * this.#zoom,
    };
  }

  /**
   * Rechnet einen Bildschirmpunkt in Kartenkoordinaten um.
   *
   * Nötig für Eingaben: Ein Klick bei Bildschirmpixel 400 liegt auf einer
   * anderen Kartenstelle, je nachdem, wohin die Kamera zeigt.
   *
   * @returns {{x:number, y:number}} Kartenpixel
   */
  schirmZuKarte(schirmX, schirmY) {
    const t = this.transformation();
    return {
      x: (schirmX - t.versatzX) / t.skalierung,
      y: (schirmY - t.versatzY) / t.skalierung,
    };
  }

  /**
   * Setzt die Kartenmaße neu (neue Karte, andere Größe).
   *
   * Die Position wird auf die neue Kartengröße begrenzt — sonst zeigte eine
   * kleiner gewordene Karte leeren Raum.
   */
  setzeKarte(breite, hoehe) {
    this.#mapBreite = breite;
    this.#mapHoehe = hoehe;
    if (!this.#zoomFest) this.#zoom = this.#zoomFuerGanzeKarte();
    this.#begrenze();
  }
}

export default Camera;
