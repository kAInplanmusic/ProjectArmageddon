/**
 * Hagelanzeige (Hagelfassung 2, HAGEL-1): bindet die Hagel-Optik an das Engine-Wetter. Reine Darstellung.
 *
 * Die Engine (`engine/hagel.js`) entscheidet, WANN Hagel fällt und WO ein großes Korn aufschlägt; sie meldet
 * `hail_start`, `hail_korn`, `hail_aufprall`, `hail_hit` und `hail_ende`. Dieses Modul hält daraus die Anzeige-Liste
 * (`HagelAnzeige`) und zeichnet die Körner in Kartenkoordinaten:
 *
 *   - ein Schatten mit Warnring am Zielpunkt, der mit der Flugzeit wächst (die Vorwarnung: das Korn braucht ≥ 1,0 s),
 *   - das Korn selbst, das nach einer Fallkurve (schneller werdend) aus dem Himmel auf den Schatten fällt,
 *   - am Aufschlag ein Ring und Splitter (kräftiger bei einem Treffer).
 *
 * Alles folgt der Anzeigezeit des Renderers (`r.time`, Simulationsschritte) und den Ereignissen. Nichts würfelt, nichts
 * wirkt auf den Spielzustand. Sind die Wetterwahl des Menüs und das Engine-Wetter verschieden, gilt für Hagel das
 * Engine-Wetter (`bindeHagelZiel`): ohne Engine-Hagel fällt in einer Partie der Fassung 2 kein Hagel.
 *
 * „Reduzierte Bewegung": der Schatten steht ohne Pulsieren, das Korn fällt nicht sichtbar (nur der Aufschlag blitzt kurz).
 *
 * @module hagelAnzeige
 */
import { maleHagelkorn } from './wetterNiederschlag.js';

/** Höhe, aus der ein Korn auf den Schatten fällt (px in Kartenkoordinaten, über dem Zielpunkt). */
export const HAGEL_FALLHOEHE = 760;
/** Anzeigedauer des Aufschlags (Simulationsschritte). */
const AUFSCHLAG_DAUER = 24;
/** Radius des gezeichneten Korns (px, Kartenkoordinaten). */
const KORN_RAD = 9;

export class HagelAnzeige {
  /**
   * @param {number} fassung Hagelfassung der Partie (`config.hagel`); ab 2 gilt das Engine-Wetter
   */
  constructor(fassung = 1) {
    this.gebunden = Number(fassung) >= 2;
    this.zuruecksetzen();
  }

  /** Neue Partie: nichts bleibt von der alten stehen. */
  zuruecksetzen() {
    this.aktivBis = -1;
    /** @type {Map<number, {id:number, x:number, y:number, start:number, fall:number}>} */
    this.koerner = new Map();
    /** @type {{x:number, y:number, start:number, treffer:boolean}[]} */
    this.aufschlaege = [];
  }

  /** Läuft laut Engine gerade Hagel? */
  aktiv(zeit) { return this.gebunden && zeit < this.aktivBis; }

  start(zeit, dauer) { this.aktivBis = Math.max(this.aktivBis, zeit + Math.max(0, Number(dauer) || 0)); }

  ende(zeit) { this.aktivBis = Math.min(this.aktivBis, zeit); }

  /** `hail_korn`: das Korn fliegt los. Die Meldung trägt auch den Rest der Lage (später Beitretende sehen den Hagel dann auch). */
  korn(zeit, n) {
    if (!Number.isFinite(n?.x) || !Number.isFinite(n?.y)) return;
    this.koerner.set(n.id, { id: n.id, x: n.x, y: n.y, start: zeit, fall: Math.max(1, Number(n.fall) || 72) });
    this.start(zeit, n.rest);
  }

  /** `hail_aufprall`: das Korn ist am Ziel; es bleibt als Ring und Splitter kurz sichtbar. */
  aufprall(zeit, n) {
    this.koerner.delete(n.id);
    this.aufschlaege.push({ x: n.x, y: n.y, start: zeit, treffer: n.treffer != null });
    if (this.aufschlaege.length > 24) this.aufschlaege.shift();
  }
}

/**
 * Hagel-Ziel des Wetterzustands aus dem Engine-Wetter: gilt nur in Partien der Fassung 2 (`gebunden`). Überschreibt die
 * Stärke des Hagels (Menüwahl und Kulissenableitung zählen dann nicht) und gibt ihm den leichten Wind, den die Optik kennt.
 * @param {object} ziel Ergebnis von `zielAus` (wird verändert)
 * @param {HagelAnzeige|null|undefined} anzeige
 * @param {number} zeit Anzeigezeit (Simulationsschritte)
 * @param {boolean} [ohneWetter=false] Kulisse ohne Himmel (Höhle, Weltraum): dort fällt kein Hagel zu sehen
 * @returns {object} `ziel`
 */
export function bindeHagelZiel(ziel, anzeige, zeit, ohneWetter = false) {
  if (!anzeige?.gebunden) return ziel;
  ziel.hagel = !ohneWetter && anzeige.aktiv(zeit) ? 1 : 0;
  if (ziel.hagel > 0) ziel.wind = Math.max(ziel.wind ?? 0, 0.6);
  return ziel;
}

/**
 * Zeichnet die Körner der Engine in Kartenkoordinaten (Weltschicht, über Figuren und Gelände).
 * @param {CanvasRenderingContext2D} ctx
 * @param {HagelAnzeige|null|undefined} anzeige
 * @param {number} zeit Anzeigezeit (Simulationsschritte)
 * @param {boolean} [still=false] reduzierte Bewegung
 */
export function zeichneHagelKoerner(ctx, anzeige, zeit, still = false) {
  if (!ctx || !anzeige?.gebunden) return;
  for (const [id, k] of anzeige.koerner) {
    // Notbremse: ein verlorenes Aufschlagereignis (Netz) lässt kein Korn ewig hängen.
    if (zeit - k.start > k.fall * 3 + 60) { anzeige.koerner.delete(id); continue; }
    const p = Math.max(0, Math.min(1, (zeit - k.start) / k.fall));
    zeichneSchatten(ctx, k, p, zeit, still);
    if (!still) zeichneKorn(ctx, k, p);
  }
  const rest = [];
  for (const a of anzeige.aufschlaege) {
    const u = (zeit - a.start) / AUFSCHLAG_DAUER;
    if (u < 0 || u >= 1) continue;
    rest.push(a);
    zeichneAufschlag(ctx, a, u, still);
  }
  if (rest.length !== anzeige.aufschlaege.length) anzeige.aufschlaege = rest;
}

/** Schatten und Warnring am Zielpunkt: wächst und wird dunkler, je näher das Korn kommt. */
function zeichneSchatten(ctx, k, p, zeit, still) {
  const rx = 4 + 11 * p;
  const puls = still ? 1 : 0.8 + 0.2 * Math.sin(zeit * 0.5);
  ctx.save();
  ctx.translate(k.x, k.y);
  ctx.fillStyle = `rgba(10, 20, 40, ${0.18 + 0.4 * p})`;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, rx * 0.38, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = `rgba(255, 236, 160, ${(0.45 + 0.45 * p) * puls})`;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx + 4, (rx + 4) * 0.38, 0, 0, Math.PI * 2);
  ctx.stroke();
  // Kreuzmarke: auch ohne Farbwahrnehmung als Zielpunkt zu erkennen.
  ctx.beginPath();
  ctx.moveTo(-rx - 8, 0); ctx.lineTo(-rx - 2, 0);
  ctx.moveTo(rx + 2, 0); ctx.lineTo(rx + 8, 0);
  ctx.moveTo(0, -3 - rx * 0.4); ctx.lineTo(0, -rx * 0.4 - 1);
  ctx.stroke();
  ctx.restore();
}

/** Das Korn im Fall: schneller werdend (`y = Ziel − Höhe·(1 − p²)`), mit Schlieren nach oben. */
function zeichneKorn(ctx, k, p) {
  const y = k.y - HAGEL_FALLHOEHE * (1 - p * p);
  const schlieren = Math.min(60, 12 + 90 * p);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(226, 242, 255, 0.35)';
  ctx.lineWidth = KORN_RAD * 1.1;
  ctx.beginPath();
  ctx.moveTo(k.x, y - schlieren);
  ctx.lineTo(k.x, y);
  ctx.stroke();
  ctx.restore();
  maleHagelkorn(ctx, k.x, y, KORN_RAD, 0.98);
}

/** Aufschlag: Ring und Splitter; bei einem Treffer größer. */
function zeichneAufschlag(ctx, a, u, still) {
  const gross = a.treffer ? 1.5 : 1;
  const alpha = 1 - u;
  ctx.save();
  ctx.translate(a.x, a.y);
  ctx.strokeStyle = `rgba(230, 245, 255, ${0.8 * alpha})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, (4 + 22 * u) * gross, (4 + 22 * u) * gross * 0.4, 0, 0, Math.PI * 2);
  ctx.stroke();
  if (!still) {
    ctx.fillStyle = `rgba(248, 252, 255, ${alpha})`;
    for (let i = 0; i < 7; i += 1) {
      const w = -Math.PI * (0.1 + 0.8 * (i / 6));
      const r = (6 + 20 * u) * gross * (0.7 + 0.3 * ((i * 5) % 3) / 2);
      ctx.beginPath();
      ctx.arc(Math.cos(w) * r, Math.sin(w) * r - 8 * u * (1 - u) * 4, 1.6 * gross * (1 - 0.5 * u), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}
