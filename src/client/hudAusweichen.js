/**
 * HUD und Figuren vertragen sich: misst die HUD-Elemente und hält Figuren und
 * Schilder sichtbar.
 *
 * ## Warum diese Datei existiert
 *
 * Die Rechnung steht in `sichtbereich.js` (rein, ohne Browser, getestet). Hier
 * ist der Teil, der das DOM anfasst: Die Ränder des HUD werden **gemessen**
 * (`getBoundingClientRect`), nicht als Konstanten angenommen — sie ändern sich
 * mit 800x400, Touch-Tasten (Telefon quer) und der Länge der Listen.
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
  sichererBereich, figurRechteck, ueberdecktVon, schubNachUnten, ueberlappen, seitenRaender,
} from './sichtbereich.js';

/** Bilder zwischen zwei Messungen (bei 60 Hz alle 100 ms). */
const MESS_INTERVALL = 6;

/** Elemente, die den Rand bilden (Kopfleiste, Bedienleiste). */
const RAND_SELEKTOREN = [
  '#hud-top > *', '#hud-right', '#hud-fire', '#hud-dial',
];

/** Seitliche Panels, die bei Überdeckung `.hud-weicht` bekommen (lesbar, nicht durchscheinend). */
/* `touch-laufen`: die Lauf-/Salto-/Passen-Knöpfe (Touch) liegen im Querformat in Bildmitte rechts und decken sonst eine Figur. */
/* `touch-aktionen` (seit 2026-11-04, Telefon quer und großes Touch): stehen links über dem Wählrad, also über dem unteren Rand — wie die Laufknöpfe (rechts über FEUER) ein Panel, kein Rand. */
const PANEL_IDS = ['hud-left', 'hud-log', 'hud-aim', 'touch-laufen', 'touch-aktionen'];

/** Telefon quer mit Touch: dieselbe Bedingung wie die Telefon-Aufteilung in design.css. */
const TELEFON_TOUCH = '(max-height: 520px) and (pointer: coarse)';

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
    this.letzte = { bereich: null, weicht: [], schub: 0, rand: [], seiten: { links: 0, rechts: 0 }, touchOben: null };
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
      if (b) kamera.setzeRand(this.randFuerKamera());
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
    const t = kamera.transformation({ ohneStoss: true });
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
    // Gegen die Ziellage UND die jetzige Lage prüfen: Die Kamera erreicht den Zielschub nicht immer (gemessen am
    // Telefon quer: Ziel 265 px, tatsächlich 32 px), und mit nur der Ziellage blieb eine Figur hinter der Spielerliste
    // ohne `.hud-weicht` (hud-layout.spec touch844, Seed 5, sichtbar seit dem Touch-Rand der Kamera, TODO 2.1).
    const jetzt = { ...t, versatzY: ohneSchub.versatzY + kamera.schub };
    const figuren = lebende.flatMap(e => [figurRechteck(e, mitSchub, masse), figurRechteck(e, jetzt, masse)]);
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

    // Touch zuerst (TODO 2.1): Am Telefon quer liegen die Knopfreihen und darüber die Zielanzeige (Kraft, Radius, am
    // Zug) über der unteren Leiste und decken die Figur am Zug. Für die KAMERA zählt ihre Oberkante als unterer Rand
    // (nur dort; am Tablet stehen die Knöpfe in den Ecken). Die Zielanzeige zählte vorher als rechter Seitenrand und
    // nahm am iPhone 30 % der Breite (Deckel von `seitenRaender`), obwohl sie nur eine Zeile über den Knöpfen ist.
    const telefon = this.doc.defaultView?.matchMedia?.(TELEFON_TOUCH)?.matches ?? false;
    const unterKante = telefon ? ['touch-laufen', 'touch-aktionen'] : [];
    let touchOben = null;
    PANEL_IDS.forEach((id, i) => {
      const r = rechtecke[i];
      if (!unterKante.includes(id) || !(r.b > 0) || r.y + r.h / 2 < schirm.h / 2) return;
      touchOben = Math.min(touchOben ?? Infinity, r.y);
    });
    // Protokoll (mittig), Touch-Knöpfe und am Telefon die Zielanzeige rahmen die Kamera seitlich nicht ein.
    const ohneSeite = ['hud-log', 'touch-laufen', 'touch-aktionen', ...(telefon ? ['hud-aim'] : [])];
    const seiten = seitenRaender(schirm, rechtecke.filter((_, i) => !ohneSeite.includes(PANEL_IDS[i])));
    this.letzte = { bereich, weicht, schub, rand: raender, seiten, touchOben };
  }

  /** Vom HUD verdeckte Ränder in Zeichenflächenpixeln (für Kamera und Kameraregie). */
  randFuerKamera() {
    const b = this.letzte.bereich;
    const h = this.canvas?.height ?? 0;
    if (!b) return { oben: 0, unten: 0, links: 0, rechts: 0 };
    let unten = Math.max(0, h - b.y1);
    const t = this.letzte.touchOben;
    // Nur, wenn darüber genug Bild bleibt (wie `sichererBereich`: mindestens 30 % der Höhe frei).
    if (t !== null && t !== undefined && t - b.y0 >= h * 0.3) unten = Math.max(unten, h - t);
    return { oben: b.y0, unten, links: this.letzte.seiten.links, rechts: this.letzte.seiten.rechts };
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
