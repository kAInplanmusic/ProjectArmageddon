/**
 * Spielerkontrolle über die Kamera: Mausrad / Pinch (Zoom), Ziehen (Verschieben),
 * Taste C und Knopf „Kamera folgt/frei".
 *
 * Eingriffe überschreiben die Automatik (`regie.uebersteuere()`); Taste C bzw. der
 * Knopf schaltet dauerhaft zwischen `folgt` (Standard) und `frei`. Alles ist
 * Darstellung; nichts davon erreicht Engine oder Server.
 *
 * Bedienung: Mausrad zoomt um den Zeiger; Verschieben mit mittlerer oder rechter
 * Maustaste (die linke zielt und lädt auf); zwei Finger zoomen und verschieben.
 *
 * @module kameraSteuerung
 */

/** Zoomfaktor je Rastschritt des Mausrads. */
export const RAD_FAKTOR = 1.12;

export class KameraSteuerung {
  /**
   * @param {object} p
   * @param {HTMLCanvasElement} p.canvas
   * @param {() => object|null} p.kamera
   * @param {object} p.regie
   * @param {HTMLElement|null} [p.knopf]
   * @param {(ev: KeyboardEvent) => boolean} [p.tastaturFrei] `false`, wenn die Taste nicht gelten soll (Textfeld)
   */
  constructor({ canvas, kamera, regie, knopf = null, tastaturFrei = () => true }) {
    this.canvas = canvas;
    this.kamera = kamera;
    this.regie = regie;
    this.knopf = knopf;
    this.zeiger = new Map();
    this.ziehen = null;
    this.pinch = null;
    this.#binde(tastaturFrei);
    this.aktualisiereKnopf();
  }

  /** Bildschirmpunkt (Zeichenflächenpixel) aus Fensterkoordinaten. */
  #punkt(ev) {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: (ev.clientX - r.left) * (this.canvas.width / (r.width || this.canvas.width)),
      y: (ev.clientY - r.top) * (this.canvas.height / (r.height || this.canvas.height)),
    };
  }

  /** Schaltet `folgt`/`frei` um (Taste C, Knopf). */
  umschalten() {
    this.regie.schalteModus();
    this.aktualisiereKnopf();
  }

  aktualisiereKnopf() {
    if (!this.knopf) return;
    const frei = this.regie.modus === 'frei';
    const text = this.knopf.querySelector('[data-kamera-text]');
    if (text) text.textContent = frei ? 'Kamera frei' : (this.regie.uebersteuert ? 'Kamera: Eingriff' : 'Kamera folgt');
    this.knopf.setAttribute('aria-pressed', String(!frei));
    this.knopf.dataset.modus = frei ? 'frei' : 'folgt';
  }

  #zoom(faktor, p) {
    const k = this.kamera();
    if (!k) return;
    this.regie.uebersteuere();
    k.zoomUm(faktor, p.x, p.y);
    this.aktualisiereKnopf();
  }

  #schiebe(dx, dy) {
    const k = this.kamera();
    if (!k) return;
    this.regie.uebersteuere();
    k.verschiebe(-dx / k.zoom, -dy / k.zoom);
    this.aktualisiereKnopf();
  }

  #binde(tastaturFrei) {
    const c = this.canvas;
    c.addEventListener('wheel', ev => {
      ev.preventDefault();
      const richtung = ev.deltaY < 0 ? 1 : -1;
      const staerke = ev.ctrlKey ? 1.03 : RAD_FAKTOR; // Trackpad-Pinch kommt fein aufgelöst
      this.#zoom(richtung > 0 ? staerke : 1 / staerke, this.#punkt(ev));
    }, { passive: false });

    c.addEventListener('contextmenu', ev => ev.preventDefault());

    c.addEventListener('pointerdown', ev => {
      if (ev.pointerType === 'touch') {
        this.zeiger.set(ev.pointerId, this.#punkt(ev));
        if (this.zeiger.size === 2) this.pinch = this.#pinchStand();
      } else if (ev.button === 1 || ev.button === 2) {
        ev.preventDefault();
        this.ziehen = { id: ev.pointerId, ...this.#punkt(ev) };
        c.setPointerCapture?.(ev.pointerId);
      }
    });
    c.addEventListener('pointermove', ev => {
      if (ev.pointerType === 'touch' && this.zeiger.has(ev.pointerId)) {
        this.zeiger.set(ev.pointerId, this.#punkt(ev));
        if (this.zeiger.size === 2 && this.pinch) {
          const jetzt = this.#pinchStand();
          if (this.pinch.abstand > 0 && jetzt.abstand > 0) this.#zoom(jetzt.abstand / this.pinch.abstand, jetzt.mitte);
          this.#schiebe(jetzt.mitte.x - this.pinch.mitte.x, jetzt.mitte.y - this.pinch.mitte.y);
          this.pinch = jetzt;
        }
      } else if (this.ziehen && this.ziehen.id === ev.pointerId) {
        const p = this.#punkt(ev);
        this.#schiebe(p.x - this.ziehen.x, p.y - this.ziehen.y);
        this.ziehen.x = p.x; this.ziehen.y = p.y;
      }
    });
    const ende = ev => {
      this.zeiger.delete(ev.pointerId);
      if (this.zeiger.size < 2) this.pinch = null;
      if (this.ziehen && this.ziehen.id === ev.pointerId) this.ziehen = null;
    };
    c.addEventListener('pointerup', ende);
    c.addEventListener('pointercancel', ende);

    window.addEventListener('keydown', ev => {
      if (ev.repeat || ev.ctrlKey || ev.metaKey || ev.altKey) return;
      if (ev.key !== 'c' && ev.key !== 'C') return;
      if (!tastaturFrei(ev)) return;
      this.umschalten();
    });
    this.knopf?.addEventListener('click', () => this.umschalten());
  }

  #pinchStand() {
    const [a, b] = [...this.zeiger.values()];
    return { abstand: Math.hypot(a.x - b.x, a.y - b.y), mitte: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
  }
}

export default KameraSteuerung;
