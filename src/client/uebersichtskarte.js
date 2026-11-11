/**
 * Übersichtskarte (Minimap) für breite Karten: kleines Bild der ganzen Karte mit Gelände, Figuren,
 * Kisten und dem Sichtfenster der Kamera. Reine Darstellung (Client): sie liest Zustand und Kamera,
 * ändert nie Engine, Zustands-Hash oder Replay. Ein Klick (oder Tippen) auf die Karte setzt die
 * Kamera dorthin (die Automatik gibt dann nach, wie bei jedem Eingriff).
 *
 * ## Bedienung und Barrierearmut
 *
 *   - Taste M schaltet sie ein/aus; Knopf „Übersicht" (Tastatur erreichbar, `aria-pressed`) ebenso.
 *     Die Wahl wird in `localStorage` (`pa.uebersicht`: `an`/`aus`) gemerkt; ohne Wahl gilt `auto`:
 *     sichtbar nur, wenn die Karte mindestens `AUTO_AB_BREITE` px breit ist (Mehrzonen-Gelände ab 2800 px).
 *   - Figuren unterscheiden sich nicht nur durch die Farbe: jedes Team hat eine eigene Form
 *     (Kreis, Quadrat, Dreieck, Raute), die aktive Figur trägt einen hellen Ring.
 *   - Das Bild hat `role="img"` und einen Text (Figuren je Team, Sichtfenster in Prozent), der nur bei
 *     Änderung gesetzt wird. Mit Tastatur: Pfeiltasten auf der fokussierten Karte verschieben die Kamera
 *     um ein Viertel des Sichtfensters (Pos1/Ende: linker/rechter Rand).
 *   - Gelände wird höchstens 2-mal je Sekunde neu gezeichnet; bei reduzierter Bewegung 1-mal.
 *
 * Reine Rechenteile (`uebersichtsGroesse`, `kartenZuKarte`, `sichtfenster`, `sichtbar`) sind ohne Browser testbar.
 *
 * @module uebersichtskarte
 */
import { teamFarbe } from './teamFarben.js';

export const AUTO_AB_BREITE = 2800;
const SPEICHER = 'pa.uebersicht';
/** Längste Kante der Übersicht in CSS-Pixeln (höchstens, relativ zum Fenster zusätzlich begrenzt). */
export const MAX_KANTE = 260;
const FORMEN = ['kreis', 'quadrat', 'dreieck', 'raute'];

/** Größe des Bildes: längste Kante `kante`, Seitenverhältnis der Karte. */
export function uebersichtsGroesse(karte, kante = MAX_KANTE) {
  const f = kante / Math.max(karte.b, karte.h, 1);
  return { b: Math.max(1, Math.round(karte.b * f)), h: Math.max(1, Math.round(karte.h * f)) };
}

/** Punkt im Bild (px) → Kartenpixel, auf die Karte geklemmt. */
export function kartenZuKarte(px, py, bild, karte) {
  const x = Math.max(0, Math.min(karte.b, (px / bild.b) * karte.b));
  const y = Math.max(0, Math.min(karte.h, (py / bild.h) * karte.h));
  return { x, y };
}

/** Sichtfenster der Kamera in Bildpixeln. */
export function sichtfenster(ansicht, schirm, karte, bild) {
  const w = Math.min(karte.b, schirm.b / ansicht.zoom);
  const h = Math.min(karte.h, schirm.h / ansicht.zoom);
  const fx = bild.b / karte.b;
  const fy = bild.h / karte.h;
  return { x: (ansicht.x - w / 2) * fx, y: (ansicht.y - h / 2) * fy, b: w * fx, h: h * fy };
}

/** Soll die Übersicht gezeigt werden? `wahl`: 'an' | 'aus' | andere = auto. */
export function sichtbar(wahl, karte) {
  if (wahl === 'an') return true;
  if (wahl === 'aus') return false;
  return Boolean(karte) && karte.b >= AUTO_AB_BREITE;
}

function zeichneForm(ctx, form, x, y, r) {
  ctx.beginPath();
  if (form === 'kreis') ctx.arc(x, y, r, 0, Math.PI * 2);
  else if (form === 'quadrat') ctx.rect(x - r, y - r, 2 * r, 2 * r);
  else if (form === 'dreieck') { ctx.moveTo(x, y - r * 1.2); ctx.lineTo(x + r * 1.1, y + r * 0.9); ctx.lineTo(x - r * 1.1, y + r * 0.9); ctx.closePath(); }
  else { ctx.moveTo(x, y - r * 1.2); ctx.lineTo(x + r * 1.2, y); ctx.lineTo(x, y + r * 1.2); ctx.lineTo(x - r * 1.2, y); ctx.closePath(); }
}

export class Uebersichtskarte {
  /**
   * @param {object} p
   * @param {Document|null} p.doc
   * @param {() => object|null} p.kamera
   * @param {object} p.regie Kameraregie (`uebersteuere`)
   * @param {() => (HTMLCanvasElement|null)} [p.gelaende] Geländeebene des Renderers
   * @param {(ev: KeyboardEvent) => boolean} [p.tastaturFrei]
   * @param {() => number} [p.jetzt]
   */
  constructor({ doc = null, kamera, regie, gelaende = () => null, tastaturFrei = () => true, jetzt = () => globalThis.performance?.now?.() ?? 0 }) {
    this.doc = doc;
    this.kamera = kamera;
    this.regie = regie;
    this.gelaende = gelaende;
    this.jetzt = jetzt;
    this.wahl = 'auto';
    this.reduziert = false;
    this.letzteGelaende = -Infinity;
    this.letzterText = '';
    this.bild = null;
    this.knopf = null;
    this.rahmen = null;
    this.canvas = null;
    this.gelaendeBild = null;
    try { this.wahl = globalThis.localStorage?.getItem(SPEICHER) ?? 'auto'; } catch { /* ohne Speicher: auto */ }
    if (!doc) return;
    this.#baue(doc);
    doc.addEventListener('keydown', ev => {
      if (ev.repeat || ev.ctrlKey || ev.metaKey || ev.altKey) return;
      if (ev.key !== 'm' && ev.key !== 'M') return;
      if (!tastaturFrei(ev)) return;
      this.umschalten();
    });
  }

  #baue(doc) {
    const rahmen = doc.createElement('div');
    rahmen.id = 'uebersicht';
    rahmen.hidden = true;
    rahmen.style.cssText = 'position:fixed;z-index:14;right:12px;bottom:12px;display:flex;flex-direction:column;align-items:flex-end;gap:4px;pointer-events:none;';
    const canvas = doc.createElement('canvas');
    canvas.setAttribute('role', 'img');
    canvas.tabIndex = 0;
    canvas.style.cssText = 'pointer-events:auto;cursor:crosshair;border:2px solid #e8eef4;border-radius:4px;background:#10151a;box-shadow:0 4px 14px rgba(0,0,0,.6);touch-action:none;max-width:40vw;';
    const knopf = doc.createElement('button');
    knopf.type = 'button';
    knopf.textContent = 'Übersicht ausblenden (M)';
    knopf.setAttribute('aria-pressed', 'true');
    knopf.style.cssText = 'pointer-events:auto;font:600 12px system-ui,sans-serif;min-height:28px;padding:2px 8px;color:#e8eef4;background:#1d242b;border:1px solid #8aa0b2;border-radius:4px;cursor:pointer;';
    knopf.addEventListener('click', () => this.umschalten());
    canvas.addEventListener('pointerdown', ev => { this.#springe(ev.clientX, ev.clientY); canvas.setPointerCapture?.(ev.pointerId); this.zieht = ev.pointerId; });
    canvas.addEventListener('pointermove', ev => { if (this.zieht === ev.pointerId) this.#springe(ev.clientX, ev.clientY); });
    canvas.addEventListener('pointerup', () => { this.zieht = null; });
    canvas.addEventListener('pointercancel', () => { this.zieht = null; });
    canvas.addEventListener('keydown', ev => this.#taste(ev));
    rahmen.append(canvas, knopf);
    (doc.getElementById('stage')?.parentElement ?? doc.body).append(rahmen);
    Object.assign(this, { rahmen, canvas, knopf });
  }

  /** Schaltet an/aus (Taste M, Knopf) und merkt die Wahl. */
  umschalten() {
    const k = this.kamera();
    const an = k ? sichtbar(this.wahl, k.karte) : this.wahl === 'an';
    this.wahl = an ? 'aus' : 'an';
    try { globalThis.localStorage?.setItem(SPEICHER, this.wahl); } catch { /* ignorieren */ }
    this.letzteGelaende = -Infinity;
    return this.wahl;
  }

  setzeReduziert(wert) { this.reduziert = Boolean(wert); }

  #springe(cx, cy) {
    const k = this.kamera();
    if (!k || !this.bild) return;
    const r = this.canvas.getBoundingClientRect();
    const p = kartenZuKarte((cx - r.left) * (this.bild.b / (r.width || this.bild.b)), (cy - r.top) * (this.bild.h / (r.height || this.bild.h)), this.bild, k.karte);
    this.regie.uebersteuere();
    k.setzeAnsicht(p.x, p.y, k.zoom);
  }

  #taste(ev) {
    const k = this.kamera();
    if (!k) return;
    const a = k.ansicht();
    const schritt = (k.sichtbareBreite ?? 400) / 4;
    const ziel = { ArrowLeft: [-schritt, 0], ArrowRight: [schritt, 0], ArrowUp: [0, -schritt], ArrowDown: [0, schritt] }[ev.key];
    if (ev.key === 'Home' || ev.key === 'End') {
      ev.preventDefault(); this.regie.uebersteuere();
      k.setzeAnsicht(ev.key === 'Home' ? 0 : k.karte.b, a.y, a.zoom);
    } else if (ziel) {
      ev.preventDefault(); this.regie.uebersteuere();
      k.setzeAnsicht(a.x + ziel[0], a.y + ziel[1], a.zoom);
    }
  }

  /** Beschreibung für Screenreader: Figuren je Team und Lage des Sichtfensters. */
  static beschreibung(state, ansicht, schirm, karte) {
    const lebend = (state?.entities ?? []).filter(e => e.alive);
    const je = new Map();
    for (const e of lebend) je.set(e.teamId, (je.get(e.teamId) ?? 0) + 1);
    const teile = [...je.entries()].sort((a, b) => a[0] - b[0]).map(([t, n]) => `Team ${t + 1}: ${n}`).join(', ');
    const w = Math.min(karte.b, schirm.b / ansicht.zoom);
    const von = Math.round(Math.max(0, ansicht.x - w / 2) / karte.b * 100);
    const bis = Math.round(Math.min(karte.b, ansicht.x + w / 2) / karte.b * 100);
    return `Übersichtskarte. Figuren: ${teile || 'keine'}. Kamera zeigt ${von} bis ${bis} Prozent der Breite. Pfeiltasten verschieben die Kamera.`;
  }

  /** Pro Bild aufrufen (billig; das Gelände wird nur 2-mal je Sekunde neu gezeichnet). */
  aktualisiere(state, gelaendeEbene = this.gelaende()) {
    if (!this.canvas) return;
    const k = this.kamera();
    const zeigen = Boolean(k) && sichtbar(this.wahl, k.karte);
    this.rahmen.hidden = !zeigen;
    this.knopf.setAttribute('aria-pressed', String(zeigen));
    if (!zeigen || !state) return;
    const karte = k.karte;
    const kante = Math.min(MAX_KANTE, Math.round((globalThis.innerWidth ?? 1280) * 0.22));
    const bild = uebersichtsGroesse(karte, Math.max(120, kante));
    if (!this.bild || this.bild.b !== bild.b || this.bild.h !== bild.h) {
      this.bild = bild; this.canvas.width = bild.b; this.canvas.height = bild.h;
      this.canvas.style.width = `${bild.b}px`; this.canvas.style.height = `${bild.h}px`;
      this.gelaendeBild = null; this.letzteGelaende = -Infinity;
    }
    const jetzt = this.jetzt();
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    if (jetzt - this.letzteGelaende >= (this.reduziert ? 1000 : 500)) {
      this.letzteGelaende = jetzt;
      const g = this.doc.createElement('canvas'); g.width = bild.b; g.height = bild.h;
      const gc = g.getContext('2d');
      if (gc) {
        gc.fillStyle = '#1b2733'; gc.fillRect(0, 0, bild.b, bild.h);
        if (gelaendeEbene) { gc.imageSmoothingQuality = 'low'; gc.drawImage(gelaendeEbene, 0, 0, bild.b, bild.h); }
        this.gelaendeBild = g;
      }
    }
    if (this.gelaendeBild) ctx.drawImage(this.gelaendeBild, 0, 0);
    const fx = bild.b / karte.b;
    const fy = bild.h / karte.h;
    for (const kiste of state.crates ?? []) {
      if (kiste.picked) continue;
      ctx.fillStyle = '#f2c14e'; ctx.fillRect(kiste.x * fx - 1.5, kiste.y * fy - 1.5, 3, 3);
    }
    for (const e of state.entities ?? []) {
      if (!e.alive) continue;
      const x = e.x * fx; const y = e.y * fy;
      const aktiv = e.entityId === state.activePlayerId;
      zeichneForm(ctx, FORMEN[(e.teamId ?? 0) % FORMEN.length], x, y, aktiv ? 4 : 3);
      ctx.fillStyle = teamFarbe(e.teamId); ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = '#05080a'; ctx.stroke();
      if (aktiv) { ctx.beginPath(); ctx.arc(x, y, 6.5, 0, Math.PI * 2); ctx.lineWidth = 1.5; ctx.strokeStyle = '#ffffff'; ctx.stroke(); }
    }
    const sf = sichtfenster(k.ansicht(), k.schirm, karte, bild);
    ctx.lineWidth = 2; ctx.strokeStyle = '#000000'; ctx.strokeRect(sf.x, sf.y, sf.b, sf.h);
    ctx.lineWidth = 1; ctx.strokeStyle = '#ffffff'; ctx.strokeRect(sf.x, sf.y, sf.b, sf.h);
    const text = Uebersichtskarte.beschreibung(state, k.ansicht(), k.schirm, karte);
    if (text !== this.letzterText) { this.letzterText = text; this.canvas.setAttribute('aria-label', text); }
  }
}

export default Uebersichtskarte;
