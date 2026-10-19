/**
 * HUD und Figuren vertragen sich: misst die HUD-Elemente und hält Figuren und
 * Schilder sichtbar.
 *
 * ## Warum diese Datei existiert
 *
 * Die Rechnung steht in `sichtbereich.js` (rein, ohne Browser, getestet). Hier
 * ist der Teil, der das DOM anfasst: Die Ränder des HUD werden **gemessen**
 * (`getBoundingClientRect`), nicht als Konstanten angenommen — sie ändern sich
 * mit 800x400, Touch-Tasten, Hochformat und der Länge der Listen.
 *
 * ## Was geschieht (alles nur Darstellung)
 *
 *   1. Kopfleiste oben und Bedienleiste unten ergeben den **sicheren Bereich**.
 *      Der Renderer legt Namensschilder hinein (unter die Füße geklappt, wenn
 *      oben kein Platz ist).
 *   2. Liegt eine Figur hinter einem seitlichen Panel (Spielerliste, Protokoll,
 *      Zielanzeige), bekommt das Panel `.hud-weicht`: es bleibt lesbar (Hintergrund
 *      mindestens 72 % deckend, Text voll deckend), die Figur bleibt als
 *      Silhouette erkennbar. Kompakter werden oder einklappen tut es bewusst
 *      nicht: Die Größe ändert die Messung und ließe das Panel flackern.
 *   3. Ragen Köpfe unter die Kopfleiste, rückt die Ansicht ein Stück nach unten
 *      (Himmel über der Karte), wenn die Karte ohnehin ganz im Bild ist.
 *
 * ## Kosten
 *
 * Gemessen wird nur alle `MESS_INTERVALL` Bilder und bei Größenänderung — jede
 * Messung erzwingt ein Layout. Dazwischen wird der letzte Stand wiederverwendet.
 *
 * @module hudAusweichen
 */
import {
  sichererBereich, figurRechteck, ueberdecktVon, schubNachUnten, ueberlappen,
} from './sichtbereich.js';

/** Bilder zwischen zwei Messungen (bei 60 Hz alle 100 ms). */
export const MESS_INTERVALL = 6;

/** Elemente, die den Rand bilden (Kopfleiste, Bedienleiste). */
const RAND_SELEKTOREN = [
  '#hud-top > *', '#hud-right', '#hud-fire', '#hud-dial', '#touch-aktionen',
];

/** Seitliche Panels, die bei Überdeckung `.hud-weicht` bekommen (lesbar, nicht durchscheinend). */
const PANEL_IDS = ['hud-left', 'hud-log', 'hud-aim'];

/** Größter Schub nach unten, als Anteil der Fensterhöhe. */
const SCHUB_MAX_ANTEIL = 0.15;

export class HudAusweichen {
  /**
   * @param {object} p
   * @param {Document} p.doc
   * @param {HTMLCanvasElement} p.canvas
   * @param {object} p.renderer
   */
  constructor({ doc = document, canvas, renderer }) {
    this.doc = doc;
    this.canvas = canvas;
    this.renderer = renderer;
    this.zaehler = 0;
    this.bereich = null;
    this.letzte = { bereich: null, weicht: [], schub: 0, rand: [] };
    this.schmutzig = true;
    this.letzterAktiver = undefined;
    doc.defaultView?.addEventListener('resize', () => this.markiere());
  }

  /** Erzwingt eine Messung im nächsten Bild (Größenänderung, Zugwechsel). */
  markiere() { this.schmutzig = true; }

  /** Rechteck eines Elements in Zeichenflächenpixeln (`null`, wenn unsichtbar). */
  #rechteck(el, canvasRect) {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (!(r.width > 0) || !(r.height > 0)) return null;
    const fx = canvasRect.width / (this.canvas.width || 1);
    const fy = canvasRect.height / (this.canvas.height || 1);
    return { x: (r.left - canvasRect.left) / fx, y: (r.top - canvasRect.top) / fy, b: r.width / fx, h: r.height / fy };
  }

  /**
   * Je Bild aufrufen (nach dem Kamera-Schritt, vor dem Zeichnen).
   *
   * @param {{entities?:Array}} state
   * @param {object|null} kamera
   */
  aktualisiere(state, kamera) {
    this.zaehler += 1;
    // Zugwechsel: Figurenkarte und Listen ändern sich, also neu messen.
    if (state?.activePlayerId !== this.letzterAktiver) {
      this.letzterAktiver = state?.activePlayerId;
      this.schmutzig = true;
    }
    const messen = this.schmutzig || this.zaehler % MESS_INTERVALL === 0;
    if (messen && this.canvas && kamera) {
      this.schmutzig = false;
      this.#messe(state, kamera);
    }
    this.renderer.setSicherBereich(this.letzte.bereich);
    if (kamera) {
      kamera.setzeSchubZiel(this.letzte.schub);
      const b = this.letzte.bereich;
      if (b) kamera.setzeRand({ oben: b.y0, unten: (this.canvas?.height ?? b.y1) - b.y1 });
    }
  }

  #messe(state, kamera) {
    const cr = this.canvas.getBoundingClientRect();
    if (!(cr.width > 0) || !(cr.height > 0)) return;
    const schirm = { b: this.canvas.width, h: this.canvas.height };

    const raender = [];
    for (const sel of RAND_SELEKTOREN) {
      for (const el of this.doc.querySelectorAll(sel)) {
        const r = this.#rechteck(el, cr);
        if (r) raender.push(r);
      }
    }
    const bereich = sichererBereich(schirm, raender);

    // Figuren in Zeichenflächenpixeln. Der Schub wird herausgerechnet, sonst
    // schaukelte sich die Regelung auf (Figur rückt, Messung rückt mit).
    const t = kamera.transformation();
    const masse = this.renderer.figurMasse();
    const lebende = (state?.entities ?? []).filter(e => e.alive);
    const ohneSchub = { ...t, versatzY: t.versatzY - kamera.schub };
    let hoechster = Infinity;
    for (const e of lebende) {
      hoechster = Math.min(hoechster, (e.y - masse.kopf) * t.skalierung + ohneSchub.versatzY);
    }
    const schub = kamera.scrolltVertikal
      ? 0
      : schubNachUnten(hoechster, bereich.y0 + 2, schirm.h * SCHUB_MAX_ANTEIL);

    // Panels gegen die Figuren prüfen (mit dem Schub, der gleich gilt).
    const mitSchub = { ...t, versatzY: ohneSchub.versatzY + schub };
    const figuren = lebende.map(e => figurRechteck(e, mitSchub, masse));
    const panels = PANEL_IDS.map(id => this.doc.getElementById(id));
    const rechtecke = panels.map(el => this.#rechteck(el, cr) ?? { x: 0, y: 0, b: 0, h: 0 });
    const verdeckt = new Set(ueberdecktVon(rechtecke, figuren));
    const weicht = [];
    panels.forEach((el, i) => {
      if (!el) return;
      const an = verdeckt.has(i);
      if (an !== el.classList.contains('hud-weicht')) el.classList.toggle('hud-weicht', an);
      if (an) weicht.push(PANEL_IDS[i]);
    });

    this.letzte = { bereich, weicht, schub, rand: raender };
  }

  /**
   * Zustand für Diagnose und Tests (`window.__PA__.sichtbereich()`), in
   * CSS-Pixeln des Fensters, damit er mit `getBoundingClientRect` vergleichbar ist.
   *
   * @param {{entities?:Array, activePlayerId?:*}} state
   * @param {object|null} kamera
   */
  diagnose(state, kamera) {
    if (!this.canvas || !kamera) return null;
    this.#messe(state, kamera);
    this.renderer.setSicherBereich(this.letzte.bereich);
    const cr = this.canvas.getBoundingClientRect();
    const fx = cr.width / (this.canvas.width || 1);
    const fy = cr.height / (this.canvas.height || 1);
    const t = kamera.transformation();
    const masse = this.renderer.figurMasse();
    const css = r => ({ x: cr.left + r.x * fx, y: cr.top + r.y * fy, b: r.b * fx, h: r.h * fy });
    const b = this.letzte.bereich;
    const sicher = {
      x0: cr.left + b.x0 * fx, y0: cr.top + b.y0 * fy, x1: cr.left + b.x1 * fx, y1: cr.top + b.y1 * fy,
    };
    const figuren = (state?.entities ?? []).filter(e => e.alive).map(e => ({
      id: e.entityId,
      aktiv: e.entityId === state.activePlayerId,
      rechteck: css(figurRechteck(e, t, { ...masse, oben: masse.kopf })),
    }));
    // Deckende Elemente: Rand und alle Panels ohne `.hud-weicht`. Ein
    // `.hud-weicht`-Panel ist lesbar (Fläche mindestens 72 % deckend), lässt die
    // Figur dahinter aber als Silhouette stehen; sie gilt dann nicht als verdeckt.
    const deckend = [...this.letzte.rand.map(css)];
    for (const id of PANEL_IDS) {
      const el = this.doc.getElementById(id);
      const r = el?.getBoundingClientRect();
      if (r && r.width > 0 && r.height > 0 && !el.classList.contains('hud-weicht')) {
        deckend.push({ x: r.left, y: r.top, b: r.width, h: r.height });
      }
    }
    for (const f of figuren) f.verdeckt = deckend.some(d => ueberlappen(d, f.rechteck));
    return { sicher, figuren, weicht: this.letzte.weicht, schub: kamera.schub };
  }
}
