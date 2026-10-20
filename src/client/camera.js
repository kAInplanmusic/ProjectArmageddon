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

/**
 * Der kleinste und größte Zoom, den die Bedienung zulässt.
 *
 * Das Maximum 4 ist nötig, weil die Zeichenfläche so groß ist wie die Karte
 * (2560 px bei „groß", 5120 px bei „Krieg"), aber nur als 1280-px-Fenster
 * erscheint: Die Führung (`kameraRegie.js`) will rund 1400 Kartenpixel Breite
 * zeigen, und das ist auf der Kriegskarte Zoom ≈ 3,6.
 */
export const ZOOM_GRENZEN = Object.freeze({ min: 0.35, max: 4 });

/**
 * Wie weit die Kamera einer Bewegung folgt (0 = starr, 1 = sofort).
 *
 * Ein sanftes Nachziehen wirkt ruhiger als ein Sprung — bei einem Schuss über
 * die halbe Karte würde ein harter Schnitt den Zusammenhang verlieren lassen.
 */
export const FOLGE_FAKTOR = 0.12;


/**
 * Wo im Bildschirm liegt der Fokuspunkt (`x`, `y` der Kamera)?
 *
 * Auf einer Achse, die scrollt, in der Mitte des FREIEN Bereichs (Fenster ohne
 * die vom HUD verdeckten Ränder); passt die Karte auf dieser Achse ganz hinein,
 * bleibt sie mittig (senkrecht zusätzlich um `schub` nach unten gerückt).
 *
 * Reine Funktion; `Camera` und `kameraZiel.js` rechnen beide damit, damit eine
 * Zielberechnung dieselbe Klemmung sieht wie die Kamera selbst.
 *
 * @param {{b:number,h:number}} schirm
 * @param {{oben:number,unten:number,links:number,rechts:number}} rand
 * @param {number} zoom
 * @param {{b:number,h:number}} karte
 * @param {number} [schub]
 */
export function fokusImSchirm(schirm, rand, zoom, karte, schub = 0) {
  const scrolltX = schirm.b / zoom < karte.b;
  const scrolltY = schirm.h / zoom < karte.h;
  return {
    x: scrolltX ? schirm.b / 2 + (rand.links - rand.rechts) / 2 : schirm.b / 2,
    y: scrolltY ? schirm.h / 2 + (rand.oben - rand.unten) / 2 : schirm.h / 2 + schub,
  };
}

/**
 * Hält eine Ansicht `{x, y, zoom}` innerhalb der Karte (Klemmung auf die
 * Kartenfläche): Es wird nie leere Welt neben der Karte gezeigt, auch nicht
 * bei Zoom. Passt die Karte auf einer Achse ganz hinein, wird sie mittig gehalten.
 *
 * @returns {{x:number,y:number,zoom:number}} eine NEUE Ansicht
 */
export function begrenzeAnsicht(ansicht, karte, schirm, rand, schub = 0) {
  const { zoom } = ansicht;
  const f = fokusImSchirm(schirm, rand, zoom, karte, schub);
  let { x, y } = ansicht;
  if (schirm.b / zoom >= karte.b) {
    x = karte.b / 2;
  } else {
    const links = f.x / zoom;
    const rechts = (schirm.b - f.x) / zoom;
    x = Math.max(links, Math.min(karte.b - rechts, x));
  }
  if (schirm.h / zoom >= karte.h) {
    y = karte.h / 2;
  } else {
    const oben = f.y / zoom;
    const unten = (schirm.h - f.y) / zoom;
    y = Math.max(oben, Math.min(karte.h - unten, y));
  }
  return { x, y, zoom };
}

/** Der Zoom, bei dem die Karte vollständig in den Schirm passt. */
export function zoomGanzeKarte(karte, schirm) {
  return Math.min(schirm.b / karte.b, schirm.h / karte.h);
}

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

  /**
   * Ränder, die das HUD verdeckt (Bildschirmpixel). Auf einer Achse, die
   * scrollt, liegt der Fokus in der Mitte des FREIEN Bereichs, nicht des Fensters.
   */
  #rand = { oben: 0, unten: 0, links: 0, rechts: 0 };

  /**
   * Senkrechter Schub (Bildschirmpixel, >= 0) für eine Achse, die NICHT scrollt:
   * Die Karte rückt nach unten, damit Köpfe nicht unter der Kopfleiste liegen.
   * Oberhalb der Karte ist Himmel, dort darf die Ansicht überstehen.
   */
  #schub = 0;

  #schubZiel = 0;

  /**
   * Kurzer Bildschub (Bildschirmpixel) nach einem Einschlag. Er liegt NUR in der
   * Transformation, nicht in `x`/`y`, und wird auf die Kartenfläche geklemmt
   * (siehe `transformation`): Er zeigt nie leere Welt.
   */
  #stossX = 0;

  #stossY = 0;

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

  /** Aktueller senkrechter Schub in Bildschirmpixeln (0 = keiner). */
  get schub() { return this.#schub; }

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

  /**
   * Setzt die vom HUD verdeckten Ränder (Bildschirmpixel).
   *
   * Sie wirken nur auf Achsen, auf denen die Karte scrollt; passt die Karte
   * ganz hinein, bleibt sie mittig (siehe `setzeSchubZiel` für oben).
   */
  setzeRand({ oben = 0, unten = 0, links = 0, rechts = 0 } = {}) {
    const n = v => (Number.isFinite(v) && v > 0 ? v : 0);
    this.#rand = { oben: n(oben), unten: n(unten), links: n(links), rechts: n(rechts) };
    this.#begrenze();
  }

  /** Zielwert für den senkrechten Schub (wird je Bild weich angenähert). */
  setzeSchubZiel(pixel) {
    this.#schubZiel = Number.isFinite(pixel) && pixel > 0 ? pixel : 0;
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
    this.#schub += (this.#schubZiel - this.#schub) * FOLGE_FAKTOR;
    if (Math.abs(this.#schubZiel - this.#schub) < 0.05) this.#schub = this.#schubZiel;
    this.#begrenze();
  }

  /** Bildschirmmitte der Achse: bei Scrollen die Mitte des freien Bereichs. */
  #fokus() {
    return fokusImSchirm(
      { b: this.#schirmBreite, h: this.#schirmHoehe }, this.#rand, this.#zoom,
      { b: this.#mapBreite, h: this.#mapHoehe }, this.#schub,
    );
  }

  #mitteX() { return this.#fokus().x; }

  #mitteY() { return this.#fokus().y; }

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
    const a = begrenzeAnsicht(
      { x: this.#x, y: this.#y, zoom: this.#zoom },
      { b: this.#mapBreite, h: this.#mapHoehe },
      { b: this.#schirmBreite, h: this.#schirmHoehe },
      this.#rand,
      this.#schub,
    );
    this.#x = a.x;
    this.#y = a.y;
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
  transformation({ ohneStoss = false } = {}) {
    const f = this.#fokus();
    let versatzX = f.x - this.#x * this.#zoom;
    let versatzY = f.y - this.#y * this.#zoom;
    if (!ohneStoss && (this.#stossX !== 0 || this.#stossY !== 0)) {
      // Auf die Kartenfläche geklemmt: Auch der Schub zeigt keine leere Welt.
      if (this.scrolltHorizontal) {
        versatzX = Math.max(this.#schirmBreite - this.#mapBreite * this.#zoom, Math.min(0, versatzX + this.#stossX));
      }
      if (this.scrolltVertikal) {
        versatzY = Math.max(this.#schirmHoehe - this.#mapHoehe * this.#zoom, Math.min(0, versatzY + this.#stossY));
      }
    }
    return { skalierung: this.#zoom, versatzX, versatzY };
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
   * Setzt die Ansicht (Mitte und Zoom) in einem Schritt — für die Kameraführung.
   *
   * Der Zoom bleibt zwischen „ganze Karte" und `ZOOM_GRENZEN.max`; die Position
   * wird auf die Kartenfläche geklemmt. Ein Zoom unter „ganze Karte" würde leere
   * Welt neben der Karte zeigen und ist deshalb nicht möglich.
   */
  setzeAnsicht(x, y, zoom) {
    if (![x, y, zoom].every(Number.isFinite)) return false;
    const min = Math.max(ZOOM_GRENZEN.min, this.#zoomFuerGanzeKarte());
    this.#zoom = Math.max(min, Math.min(ZOOM_GRENZEN.max, zoom));
    this.#x = x;
    this.#y = y;
    this.#zielX = this.#x;
    this.#zielY = this.#y;
    this.#begrenze();
    this.#zielX = this.#x;
    this.#zielY = this.#y;
    return true;
  }

  /** Die aktuelle Ansicht `{x, y, zoom}` (ohne Schub). */
  ansicht() { return { x: this.#x, y: this.#y, zoom: this.#zoom }; }

  /** Zoom, bei dem die ganze Karte sichtbar ist (untere Grenze der Führung). */
  get zoomGanzeKarte() { return this.#zoomFuerGanzeKarte(); }

  /** Aktuell gesetzter Rand des HUD (Bildschirmpixel). */
  get rand() { return { ...this.#rand }; }

  /** Kartenmaße. */
  get karte() { return { b: this.#mapBreite, h: this.#mapHoehe }; }

  /** Bildschirmmaße. */
  get schirm() { return { b: this.#schirmBreite, h: this.#schirmHoehe }; }

  /**
   * Zoomt um den Faktor `faktor` und hält dabei den Kartenpunkt unter
   * (`schirmX`, `schirmY`) fest (Mausrad, Pinch). Untergrenze ist „ganze Karte",
   * Obergrenze `ZOOM_GRENZEN.max`.
   */
  zoomUm(faktor, schirmX = this.#schirmBreite / 2, schirmY = this.#schirmHoehe / 2) {
    if (!(faktor > 0)) return false;
    const vor = this.transformation({ ohneStoss: true });
    const punktX = (schirmX - vor.versatzX) / vor.skalierung;
    const punktY = (schirmY - vor.versatzY) / vor.skalierung;
    const min = Math.max(ZOOM_GRENZEN.min, this.#zoomFuerGanzeKarte());
    const neu = Math.max(min, Math.min(ZOOM_GRENZEN.max, this.#zoom * faktor));
    if (neu === this.#zoom) return false;
    this.#zoom = neu;
    this.#zoomFest = true;
    // Der Punkt soll unter dem Zeiger bleiben: x so wählen, dass
    // fokus.x + (punkt - x)·zoom = schirmX.
    const f = this.#fokus();
    this.#x = punktX - (schirmX - f.x) / neu;
    this.#y = punktY - (schirmY - f.y) / neu;
    this.#zielX = this.#x;
    this.#zielY = this.#y;
    this.#begrenze();
    this.#zielX = this.#x;
    this.#zielY = this.#y;
    return true;
  }

  /** Bildschub in Bildschirmpixeln (`0, 0` = keiner); siehe `transformation`. */
  setzeStoss(x, y) {
    this.#stossX = Number.isFinite(x) ? x : 0;
    this.#stossY = Number.isFinite(y) ? y : 0;
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
