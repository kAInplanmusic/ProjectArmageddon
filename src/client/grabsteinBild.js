/**
 * Dauerhafter Grabstein (TODO 2.14, FIGUREN-B-REST): Wo eine Figur fällt, bleibt für den Rest der Partie ein kleiner Grabstein stehen.
 *
 * Reine Darstellung: kein Regelobjekt, kein Eintrag in Engine, Karte oder Hash (wie der Grabstein des Tod-Epilogs, B5 gestrichen).
 * Der Ort kommt aus dem Ereigniszweig (`death`, lokal und online, `ereignisse.js` → `renderer.merkeGrab`). Höchstens `MAX_GRAEBER`
 * je Partie (die ältesten weichen); eine neue Partie leert die Liste (`renderer.reset`).
 *
 * @module grabsteinBild
 */

import { PLAYER_HALF_HEIGHT } from '../shared/config/player.js';

/** Abstand Figurenmitte → Fußpunkt (px): der Grabstein steht auf dem Boden, nicht in der Luft. */
export const GRAB_FUSS = PLAYER_HALF_HEIGHT;

/** Höchstzahl der Grabsteine je Partie. */
export const MAX_GRAEBER = 24;

/** Liste der Gräber einer Partie: je Figur höchstens einer. */
export class Graeber {
  #liste = [];

  /** Merkt einen Grabstein (Fußpunkt `x`, `y` in Weltkoordinaten). Ungültige Orte werden verworfen. */
  merke(entityId, x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    this.#liste = this.#liste.filter(g => g.id !== entityId);
    this.#liste.push({ id: entityId, x, y });
    if (this.#liste.length > MAX_GRAEBER) this.#liste.shift();
    return true;
  }

  get liste() { return this.#liste; }

  leeren() { this.#liste = []; }
}

/**
 * Zeichnet alle Grabsteine (abgerundete Platte mit dunklem Umriss und Kreuz, Comic-Stil wie die Bodenobjekte).
 * @param {CanvasRenderingContext2D} ctx
 * @param {Graeber} graeber
 */
export function zeichneGraeber(ctx, graeber) {
  for (const g of graeber?.liste ?? []) {
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#1c2228';
    ctx.fillStyle = '#9aa2a8';
    ctx.beginPath();
    ctx.moveTo(-6, 0);
    ctx.lineTo(-6, -10);
    ctx.arc(0, -10, 6, Math.PI, 0);
    ctx.lineTo(6, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#3c454d';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -13); ctx.lineTo(0, -5);
    ctx.moveTo(-3, -10); ctx.lineTo(3, -10);
    ctx.stroke();
    ctx.restore();
  }
}
