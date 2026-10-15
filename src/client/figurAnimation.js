/**
 * Prozedurale Animation der Charakter-Sprites (nur Darstellung).
 *
 * Es gibt keine Einzelbilder: Aus der beobachteten Bewegung der Figur (Position
 * von Bild zu Bild) entsteht eine Pose — Versatz, Streckung/Stauchung um den
 * Fußpunkt, Neigung. Rechnet in Sekunden, nicht in Bildern, und ist damit von
 * der Bildrate unabhängig. Ohne Bewegungsanimation (`prefers-reduced-motion`)
 * bleibt die Pose neutral.
 *
 * Keine Allokation je Bild: Der Zustand je Figur und die Pose sind einmal
 * angelegte Objekte, die jedes Bild überschrieben werden.
 *
 * @module figurAnimation
 */

/** Geschwindigkeit (px/s), ab der die Figur als laufend gilt. */
const LAUF_SCHWELLE = 18;
/** Vertikale Geschwindigkeit (px/s), ab der die Figur als in der Luft gilt. */
const LUFT_SCHWELLE = 40;
/** Aufprallgeschwindigkeit (px/s), ab der die Landung staucht. */
const LANDE_SCHWELLE = 140;
const LANDE_DAUER = 0.22;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** Einmal je Figur angelegter Zustand. */
function neuerZustand(x, y, jetzt) {
  return {
    x, y, t: jetzt, vx: 0, vy: 0, vyVorher: 0, faellt: false, lande: 0, phase: 0, blick: 1,
    pose: { dx: 0, dy: 0, sx: 1, sy: 1, rot: 0, flash: 0 },
  };
}

export class FigurPosen {
  constructor() {
    /** @type {Map<number, ReturnType<typeof neuerZustand>>} */
    this.zustaende = new Map();
  }

  /**
   * Berechnet die Pose einer Figur für dieses Bild.
   *
   * @param {{entityId:number,x:number,y:number}} entity
   * @param {number} jetzt - Zeit in Sekunden (monoton)
   * @param {{reduziert?: boolean, treffer?: number, rueck?: number, winkel?: number, aktiv?: boolean}} opt
   * @returns {{dx:number,dy:number,sx:number,sy:number,rot:number,flash:number}} wiederverwendet!
   */
  pose(entity, jetzt, opt) {
    let z = this.zustaende.get(entity.entityId);
    if (!z) {
      z = neuerZustand(entity.x, entity.y, jetzt);
      this.zustaende.set(entity.entityId, z);
    }
    const p = z.pose;
    const dt = jetzt - z.t;
    if (dt > 0.0005) {
      // Geschwindigkeit, leicht geglättet (Sprünge der Position nicht übernehmen).
      const k = Math.min(1, dt * 14);
      const vx = (entity.x - z.x) / dt;
      const vy = (entity.y - z.y) / dt;
      z.vyVorher = z.vy;
      z.vx += (clamp(vx, -900, 900) - z.vx) * k;
      z.vy += (clamp(vy, -900, 900) - z.vy) * k;
      z.x = entity.x;
      z.y = entity.y;
      z.t = jetzt;
      if (Math.abs(z.vx) > LAUF_SCHWELLE) z.phase += dt * Math.min(14, 5 + Math.abs(z.vx) / 12);
      // Aufprall: schneller Fall (geglättet), dann steht die Figur (roh).
      if (z.vy > LANDE_SCHWELLE) z.faellt = true;
      if (z.faellt && Math.abs(vy) < LUFT_SCHWELLE) { z.faellt = false; z.lande = 1; z.vy = 0; }
      else z.lande = Math.max(0, z.lande - dt / LANDE_DAUER);
      if (Math.abs(vx) > 6) z.blick = vx > 0 ? 1 : -1;
    }

    p.dx = 0; p.dy = 0; p.sx = 1; p.sy = 1; p.rot = 0;
    p.flash = clamp(opt.treffer ?? 0, 0, 1);

    if (!opt.reduziert) {
      const luft = z.lande === 0 && Math.abs(z.vy) > LUFT_SCHWELLE;
      const lauf = !luft && Math.abs(z.vx) > LAUF_SCHWELLE;
      if (luft) {
        // Strecken beim Steigen, leicht beim Fallen; Neigung in Flugrichtung.
        const s = clamp(Math.abs(z.vy) / 500, 0, 0.14);
        p.sy = 1 + s; p.sx = 1 - s * 0.7;
        p.rot = clamp(z.vx / 900, -0.25, 0.25);
      } else if (lauf) {
        // Wippen im Schritt (zwei Schritte je Phase) und Neigung nach vorn.
        p.dy = -Math.abs(Math.sin(z.phase)) * 1.6;
        p.rot = clamp(z.vx / 500, -0.18, 0.18);
        p.sy = 1 + Math.sin(z.phase * 2) * 0.015;
      } else {
        // Atmen im Stand, je Figur versetzt.
        p.sy = 1 + Math.sin(jetzt * 2.4 + entity.entityId * 1.9) * 0.016;
      }
      if (z.lande > 0) {
        const s = z.lande * z.lande * 0.2;
        p.sy *= 1 - s; p.sx *= 1 + s * 0.8;
      }
      // Rückstoß: gegen die Zielrichtung wegducken.
      if ((opt.rueck ?? 0) !== 0) {
        p.dx -= Math.cos(opt.winkel ?? 0) * opt.rueck * 0.6;
        p.rot -= Math.cos(opt.winkel ?? 0) * opt.rueck * 0.02;
      }
      // Aktive Figur: sanftes Wippen als Hervorhebung.
      if (opt.aktiv) p.dy -= (Math.sin(jetzt * 4) * 0.5 + 0.5) * 0.9;
    }
    return p;
  }

  /** Zustand der Figur (Blickrichtung, Geschwindigkeit) — für den Fall-Effekt beim Tod. */
  zustand(entityId) {
    return this.zustaende.get(entityId) ?? null;
  }

  vergiss(entityId) {
    this.zustaende.delete(entityId);
  }

  leere() {
    this.zustaende.clear();
  }
}

/** Dauer des Fall-Effekts in Sekunden. */
export const FALL_DAUER = 0.9;

/**
 * Pose eines fallenden/ertrinkenden Sprites.
 *
 * @param {{t0:number, ertrinkt:boolean, blick:number, vx:number}} fall
 * @param {number} jetzt
 * @returns {{dx:number,dy:number,rot:number,alpha:number}|null} `null`, wenn vorbei
 */
export function fallPose(fall, jetzt, reduziert, aus = { dx: 0, dy: 0, rot: 0, alpha: 1 }) {
  const t = jetzt - fall.t0;
  if (t >= FALL_DAUER) return null;
  const a = t / FALL_DAUER;
  if (reduziert) {
    aus.dx = 0; aus.dy = 0; aus.rot = 0; aus.alpha = 1 - a;
  } else if (fall.ertrinkt) {
    aus.dx = 0; aus.dy = a * 16; aus.rot = 0; aus.alpha = 1 - a;
  } else {
    // Wegfliegen: in Laufrichtung kippen, kleiner Bogen, dann ausblenden.
    aus.dx = fall.vx * 0.05 * a;
    aus.dy = -Math.sin(Math.min(1, a * 1.6) * Math.PI) * 10 + a * a * 14;
    aus.rot = fall.blick * Math.min(1, a * 2) * 1.5;
    aus.alpha = 1 - a * a;
  }
  return aus;
}
