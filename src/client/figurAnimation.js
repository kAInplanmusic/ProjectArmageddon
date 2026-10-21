/**
 * Prozedurale Animation der Charakter-Sprites (nur Darstellung).
 *
 * Es gibt keine Einzelbilder: Aus der beobachteten Bewegung der Figur (Position
 * von Bild zu Bild) und einigen Hinweisen des Renderers (Zielwinkel, Mündungs-
 * feuer, Trefferblitz, Zugbeginn, Matchende) entsteht eine Pose — Versatz,
 * Streckung/Stauchung um den Fußpunkt, Neigung. Rechnet in Sekunden, nicht in
 * Bildern, und ist damit von der Bildrate unabhängig. Die Stärke der einzelnen
 * Bewegungen kommt je Figurtyp aus `figurTypen.js` (humanoid, tier, fahrzeug,
 * schweber, wesen, schwarm). Ohne Bewegungsanimation (`prefers-reduced-motion`)
 * bleibt die Pose neutral; nur Blitz und statische Hangneigung wirken.
 *
 * Keine Allokation je Bild: Der Zustand je Figur und die Pose sind einmal
 * angelegte Objekte, die jedes Bild überschrieben werden.
 *
 * @module figurAnimation
 */
import { PARAMETER } from './figurTypen.js';
import { MODUS, waehleRolle, frameFuer } from './figurSheets.js';

/** Geschwindigkeit (px/s), ab der die Figur als laufend gilt. */
const LAUF_SCHWELLE = 18;
/** Vertikale Geschwindigkeit (px/s), ab der die Figur als in der Luft gilt. */
const LUFT_SCHWELLE = 40;
/** Aufprallgeschwindigkeit (px/s), ab der die Landung staucht. */
const LANDE_SCHWELLE = 140;
/** Größte Hangneigung der Darstellung (12 Grad). */
export const NEIGUNG_MAX = 12 * Math.PI / 180;
const TREFFER_DAUER = 0.4;
/** Dauer, in der der Treffer-Frame gezeigt wird (kürzer als das Zucken). */
const TREFFER_FRAME_DAUER = 0.32;
const ZUG_DAUER = 0.7;
const TWO_PI = Math.PI * 2;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const ausOut = u => 1 - (1 - u) * (1 - u) * (1 - u);

/**
 * Verlauf des Schusses (u = 0..1): kurze Ausholbewegung (negativ), Rückstoß
 * (bis 1), Erholung mit leichtem Nachschwingen. 0 außerhalb.
 */
export function schussKurve(u) {
  if (!(u > 0) || u >= 1) return 0;
  if (u < 0.12) return -0.3 * Math.sin((u / 0.12) * Math.PI / 2);
  if (u < 0.3) return -0.3 + 1.3 * ausOut((u - 0.12) / 0.18);
  const k = (u - 0.3) / 0.7;
  const e = 1 - k;
  return e * e * (3 - 2 * e) - 0.1 * Math.sin(k * TWO_PI) * e;
}

/** Zucken nach dem Treffer: Ausschlag in Stoßrichtung, gedämpft hin und her (t in s). */
export function trefferKurve(t) {
  if (!(t >= 0) || t >= TREFFER_DAUER) return 0;
  return Math.exp(-t * 9) * Math.cos(t * 26);
}

/** Einmal je Figur angelegter Zustand. */
function neuerZustand(x, y, jetzt) {
  return {
    x, y, t: jetzt, vx: 0, vy: 0, vyVorher: 0, vyMax: 0, faellt: false, lande: 0, phase: 0, blick: 1,
    landeDauer: 0.22, absprungT: 99, inLuft: false,
    schussT: 99, feuerVorher: 0, trefferVorher: 0, hitT: 99, hitDir: 1, hitHaerte: 0.5,
    modi: 0, rolle: null, frame: null,
    aktivVorher: false, zugT: 99, kipp: 0, neig: 0, zielBlick: 0, drehT: 99,
    hpVerz: -1, hpLetzt: -1, hpHalt: 0, ergebnisT: 0,
    pose: { dx: 0, dy: 0, sx: 1, sy: 1, rot: 0, flash: 0, tint: 0, neigung: 0, zug: 0, hpVerz: 1 },
  };
}

export class FigurPosen {
  constructor() {
    /** @type {Map<number, ReturnType<typeof neuerZustand>>} */
    this.zustaende = new Map();
    /** Wird bei einer Landung gerufen: `(x, y, staerke 0..1, typ, entityId)`. */
    this.beiLandung = null;
  }

  /**
   * Berechnet die Pose einer Figur für dieses Bild.
   *
   * @param {{entityId:number,x:number,y:number}} entity
   * @param {number} jetzt - Zeit in Sekunden (monoton)
   * @param {{reduziert?: boolean, treffer?: number, haerte?: number, rueck?: number, winkel?: number,
   *   aktiv?: boolean, feuer?: number, params?: object, typ?: string, neigung?: number, hp?: number,
   *   ergebnis?: number, schussStaerke?: number, ausfall?: number, stoss?: number, blatt?: object|null}} opt
   *   (`blatt`: Frames der Figur aus `figurSheets.js`; damit setzt der Zustand `modi`, `rolle` und `frame`,
   * abrufbar über `zustand(id)` — die Pose selbst bleibt unverändert)
   * @returns {{dx:number,dy:number,sx:number,sy:number,rot:number,flash:number,tint:number,neigung:number,zug:number,hpVerz:number}} wiederverwendet!
   */
  pose(entity, jetzt, opt) {
    let z = this.zustaende.get(entity.entityId);
    if (!z) {
      z = neuerZustand(entity.x, entity.y, jetzt);
      this.zustaende.set(entity.entityId, z);
    }
    const par = opt.params ?? PARAMETER.humanoid;
    const id = entity.entityId;
    const p = z.pose;
    const dt = jetzt - z.t;
    const winkel = opt.winkel ?? 0;
    const f = Math.cos(winkel) >= 0 ? 1 : -1;
    if (dt > 0.0005) {
      const k = Math.min(1, dt * 14);
      const vx = (entity.x - z.x) / dt;
      const vy = (entity.y - z.y) / dt;
      z.vyVorher = z.vy;
      z.vx += (clamp(vx, -900, 900) - z.vx) * k;
      z.vy += (clamp(vy, -900, 900) - z.vy) * k;
      z.x = entity.x;
      z.y = entity.y;
      z.t = jetzt;
      if (Math.abs(z.vx) > LAUF_SCHWELLE) z.phase += dt * Math.min(14, 5 + Math.abs(z.vx) / 12) * par.laufRate;
      // Aufprall: schneller Fall (geglättet), dann steht die Figur (roh).
      if (z.vy > LANDE_SCHWELLE) { z.faellt = true; if (z.vy > z.vyMax) z.vyMax = z.vy; }
      if (z.faellt && Math.abs(vy) < LUFT_SCHWELLE) {
        z.faellt = false; z.lande = 1; z.landeDauer = par.landeDauer;
        const staerke = clamp(z.vyMax / 520, 0.25, 1);
        z.vy = 0; z.vyMax = 0;
        if (this.beiLandung) this.beiLandung(entity.x, entity.y, staerke, opt.typ ?? 'humanoid', id);
        z.landeStaerke = staerke;
      } else z.lande = Math.max(0, z.lande - dt / z.landeDauer);
      if (Math.abs(vx) > 6) z.blick = vx > 0 ? 1 : -1;
      // Absprung: erster Schritt in die Luft nach oben.
      const luftJetzt = z.vy < -LUFT_SCHWELLE;
      if (luftJetzt && !z.inLuft) z.absprungT = 0; else z.absprungT += dt;
      z.inLuft = luftJetzt || z.faellt;
      z.schussT += dt; z.hitT += dt; z.zugT += dt; z.drehT += dt;
      if (z.hpHalt > 0) z.hpHalt -= dt;
    }

    // Auslöser aus den Hinweisen des Renderers (Flanken).
    const feuer = opt.feuer ?? 0;
    if (feuer > z.feuerVorher + 0.3) z.schussT = 0;
    z.feuerVorher = feuer;
    const treffer = clamp(opt.treffer ?? 0, 0, 1.2);
    if (treffer > z.trefferVorher + 0.3) {
      z.hitT = 0; z.hitDir = Math.sign(opt.stoss ?? 0) || -f; z.hitHaerte = clamp(opt.haerte ?? 0.5, 0.2, 1);
    }
    z.trefferVorher = treffer;
    const aktiv = Boolean(opt.aktiv);
    if (aktiv && !z.aktivVorher) z.zugT = 0;
    z.aktivVorher = aktiv;
    if (f !== z.zielBlick) { if (z.zielBlick !== 0) z.drehT = 0; z.zielBlick = f; }

    // Lebensbalken: Verzögerungsleiste hält kurz, dann Abbau.
    const hp = clamp(opt.hp ?? 1, 0, 1);
    if (z.hpVerz < 0) { z.hpVerz = hp; z.hpLetzt = hp; }
    if (hp < z.hpLetzt - 1e-4) z.hpHalt = 0.45;
    z.hpLetzt = hp;
    if (hp >= z.hpVerz) z.hpVerz = hp;
    else if (z.hpHalt <= 0) z.hpVerz = Math.max(hp, z.hpVerz - (dt > 0 && dt < 0.5 ? dt : 0) * 0.55);
    p.hpVerz = z.hpVerz;

    // Hangneigung (statisch, wirkt auch bei reduzierter Bewegung).
    const nz = clamp(opt.neigung ?? 0, -NEIGUNG_MAX, NEIGUNG_MAX);
    z.neig = opt.reduziert ? nz : z.neig + (nz - z.neig) * Math.min(1, Math.max(0, dt) * 8);
    p.neigung = z.neig;

    p.dx = 0; p.dy = 0; p.sx = 1; p.sy = 1; p.rot = 0; p.tint = 0; p.zug = 0;
    z.modi = 0; z.rolle = null; z.frame = null;
    const blatt = opt.blatt ?? null;
    p.flash = clamp(opt.treffer ?? 0, 0, 1);

    if (opt.reduziert) return p;

    const luft = z.lande === 0 && Math.abs(z.vy) > LUFT_SCHWELLE;
    const lauf = !luft && Math.abs(z.vx) > LAUF_SCHWELLE;
    const ph = jetzt + id * 1.9;
    if (luft) {
      // Mit Sprung-Frame im Blatt bleibt von der Streckung nur ein Rest (die Pose liefert das Bild).
      const bk = blatt?.luft ? 0.35 : 1;
      const s = clamp(Math.abs(z.vy) / 500, 0, par.sprungStreck) * bk;
      if (Math.abs(z.vy) < 70) {
        // Scheitelpunkt: kurz rund, schwebend.
        p.sy = 1 - par.sprungStreck * 0.1 * bk; p.sx = 1 + par.sprungStreck * 0.25 * bk;
      } else {
        p.sy = 1 + s; p.sx = 1 - s * 0.7;
      }
      p.rot = clamp(z.vx / 900, -0.25, 0.25) * (par.sprungStreck > 0.05 ? 1 : 0.6);
      if (z.absprungT < 0.1 && par.sprungHocke > 0) {
        const h = Math.sin(Math.PI * z.absprungT / 0.1) * par.sprungHocke * (blatt?.hocke ? 0.3 : 1);
        p.sy -= h; p.sx += h * 0.8;
      }
    } else if (lauf) {
      // Mit Gehzyklus im Blatt tragen die Frames Beinarbeit und Wippen; die Prozedur bleibt nur als Hauch.
      const bk = blatt?.walk ? 0.3 : 1;
      const sp = Math.sin(z.phase);
      p.dy = -Math.abs(sp) * par.laufWippen * bk;
      p.rot = clamp(z.vx / 500, -par.laufNeigung, par.laufNeigung) * (blatt?.walk ? 0.6 : 1);
      const w = Math.sin(z.phase * 2) * par.laufWelle * bk;
      p.sy = 1 + w; p.sx = 1 - w * 0.8;
      if (par.wuselAmp > 0) p.dx += Math.sin(z.phase * 3) * 0.5;
    } else {
      p.sy = 1 + Math.sin(ph * TWO_PI * par.atemHz) * par.atemAmp * (blatt?.idle ? 0.35 : 1);
      p.dx += Math.sin(ph * TWO_PI * par.atemHz * 0.5) * par.atemWiegen;
    }
    if (z.lande > 0) {
      const s = z.lande * z.lande * par.landeStauch * (z.landeStaerke ?? 1) * (blatt?.hocke ? 0.3 : 1);
      p.sy *= 1 - s; p.sx *= 1 + s * 0.8;
    }

    // Typische Eigenbewegung je Typ.
    if (par.schwebHoehe > 0 || par.schwebAmp > 0) {
      const sh = Math.sin(ph * TWO_PI * par.schwebHz);
      p.dy -= par.schwebHoehe + sh * par.schwebAmp;
      p.rot += Math.sin(ph * TWO_PI * par.schwebHz * 0.7 + 1) * 0.02;
    }
    if (par.vibAmp > 0) p.dy += Math.sin(jetzt * TWO_PI * par.vibHz + id) * par.vibAmp * (lauf ? 1.6 : 1);
    if (par.pulsAmp > 0) {
      const s = Math.sin(ph * TWO_PI * par.pulsHz) * par.pulsAmp;
      p.sx *= 1 + s; p.sy *= 1 - s * 0.7;
    }
    if (par.wuselAmp > 0) {
      const a = jetzt * TWO_PI * par.wuselHz + id * 2.3;
      p.dx += (Math.sin(a) * 0.6 + Math.sin(a * 1.7 + 1) * 0.4) * par.wuselAmp;
      p.dy += Math.cos(a * 1.3) * par.wuselAmp * 0.5;
      p.rot += Math.sin(a * 0.8) * 0.03;
    }
    // Seltene Mikro-Bewegung (Blinzeln: kurzes Einsinken) im Stand.
    if (!luft && !lauf && par.mikroPeriode > 0) {
      const m = (((jetzt + id * 1.3) % par.mikroPeriode) + par.mikroPeriode) % par.mikroPeriode / par.mikroPeriode;
      if (m < 0.05) {
        const u = Math.sin(Math.PI * m / 0.05);
        p.dy += par.mikroAmp * u; p.sy -= 0.008 * u;
      }
    }

    // Zielen: Oberkörper neigt sich mit dem Zielwinkel (nach hinten bei Blick nach oben).
    const kippZiel = clamp(-f * Math.sin(winkel) * par.zielKipp, -par.zielKipp, par.zielKipp);
    z.kipp += (kippZiel - z.kipp) * Math.min(1, Math.max(0, dt) * 10);
    p.rot += z.kipp;

    // Drehen zur anderen Seite: kurzes Zusammenziehen.
    if (z.drehT < 0.16) p.sx *= 1 - 0.14 * Math.sin(Math.PI * z.drehT / 0.16);

    // Schuss: Ausholen, Rückstoß, Erholung.
    if (z.schussT < par.schussDauer) {
      const s = schussKurve(z.schussT / par.schussDauer);
      const cw = Math.cos(winkel);
      const m = opt.schussStaerke ?? 1;
      p.dx -= cw * par.schussKick * s * m;
      p.rot -= cw * par.schussNeigung * s * m;
      p.sy *= 1 - 0.012 * s;
      // Ausfallschritt schwerer Waffen: in die Knie, breiterer Stand (nur der Rückstoßteil der Kurve).
      const aus = opt.ausfall ?? 0;
      if (aus > 0 && s > 0) {
        p.sy *= 1 - 0.07 * aus * s;
        p.sx *= 1 + 0.04 * aus * s;
      }
    } else if ((opt.rueck ?? 0) !== 0 && opt.feuer === undefined) {
      p.dx -= Math.cos(winkel) * opt.rueck * 0.6;
      p.rot -= Math.cos(winkel) * opt.rueck * 0.02;
    }

    // Treffer: Zucken in Stoßrichtung, weißer Blitz, danach Teamfarbe.
    if (z.hitT < TREFFER_DAUER) {
      const k = trefferKurve(z.hitT) * (0.5 + 0.5 * z.hitHaerte);
      const bk = blatt?.treffer ? 0.6 : 1;
      p.dx += z.hitDir * par.trefferZuck * k * bk;
      p.rot += z.hitDir * par.trefferNeigung * k * bk;
      p.flash = Math.max(p.flash, clamp(1 - z.hitT / 0.14, 0, 1));
      p.tint = clamp(1 - z.hitT / TREFFER_DAUER, 0, 1) * 0.75;
    }

    // Zugbeginn: einmalige Aufmerksamkeit (Aufrichten, Hüpfer, Ring).
    if (aktiv) {
      if (z.zugT < ZUG_DAUER) {
        const u = z.zugT / ZUG_DAUER;
        p.zug = u > 0 ? u : 0.001;
        p.dy -= Math.sin(Math.PI * clamp(u / 0.5, 0, 1)) * 3.4;
        if (u < 0.12) p.sy *= 1 - 0.05 * Math.sin(Math.PI * u / 0.12);
        else p.sy *= 1 + 0.03 * Math.sin(Math.PI * clamp((u - 0.12) / 0.4, 0, 1));
      }
      p.dy -= (Math.sin(jetzt * 4) * 0.5 + 0.5) * 0.9;
    }

    // Matchende: Sieger jubelt, Verlierer sackt zusammen.
    const erg = opt.ergebnis ?? 0;
    if (erg > 0) {
      const a = jetzt * 7 + id;
      p.dy -= Math.abs(Math.sin(a)) * 3.2;
      p.sy *= 1 + 0.03 * Math.sin(a * 2);
      p.rot += Math.sin(a * 0.5) * 0.05;
    } else if (erg < 0) {
      p.sy *= 0.955; p.dy += 0.5; p.rot += f * 0.05;
    }

    // Sheet-Frame zum Zustand: Treffer, Luft (Sprung), Hocke (Absprung/Landung), Gehen, sonst Stehen.
    if (blatt) {
      let modi = 0;
      if (z.hitT < TREFFER_FRAME_DAUER) modi |= MODUS.TREFFER;
      if (luft) modi |= MODUS.LUFT;
      else if (z.lande > 0 || z.absprungT < 0.1) modi |= MODUS.HOCKE;
      else if (lauf) modi |= MODUS.GEHEN;
      z.modi = modi;
      z.rolle = waehleRolle(blatt, modi);
      // Läuft die Figur rückwärts zur Blickrichtung, läuft der Zyklus rückwärts (kein Moonwalk).
      let zyk = z.phase / TWO_PI;
      if (z.vx * f < 0) zyk = -zyk;
      z.frame = frameFuer(blatt, z.rolle, zyk, Math.sin(ph * TWO_PI * par.atemHz) > 0 ? 1 : 0);
    }
    return p;
  }

  /** Zustand der Figur (Blickrichtung, Geschwindigkeit) — für den Fall-Effekt beim Tod. */
  zustand(entityId) {
    return this.zustaende.get(entityId) ?? null;
  }

  /** Setzt eine nicht gezeichnete (verdeckte) Figur nach, ohne Bewegung zu erfinden. */
  ueberspringe(entity, jetzt) {
    const z = this.zustaende.get(entity.entityId);
    if (!z) return;
    z.x = entity.x; z.y = entity.y; z.t = jetzt; z.vx = 0; z.vy = 0; z.faellt = false; z.inLuft = false;
  }

  vergiss(entityId) {
    this.zustaende.delete(entityId);
  }

  leere() {
    this.zustaende.clear();
  }
}

/** Dauer des Fall-Effekts in Sekunden. */
export const FALL_DAUER = 1;

/**
 * Pose eines sterbenden/ertrinkenden Sprites (je Typ der Figur).
 *
 * @param {{t0:number, ertrinkt:boolean, blick:number, vx:number, tod?:string, liegt?:boolean}} fall
 *   (`liegt`: Das Bild zeigt schon die liegende Figur aus dem Sheet, `kippen` dreht dann nicht)
 * @param {number} jetzt
 * @returns {{dx:number,dy:number,rot:number,alpha:number,sx:number,sy:number,flash:number}|null} `null`, wenn vorbei
 */
export function fallPose(fall, jetzt, reduziert, aus = { dx: 0, dy: 0, rot: 0, alpha: 1, sx: 1, sy: 1, flash: 0 }) {
  const t = jetzt - fall.t0;
  if (t >= FALL_DAUER) return null;
  const a = t / FALL_DAUER;
  aus.dx = 0; aus.dy = 0; aus.rot = 0; aus.alpha = 1; aus.sx = 1; aus.sy = 1; aus.flash = 0;
  if (reduziert) {
    aus.alpha = 1 - a;
  } else if (fall.ertrinkt) {
    aus.dy = a * 22; aus.alpha = 1 - a * a;
    aus.sy = 1 - a * 0.1;
  } else {
    const b = fall.blick;
    switch (fall.tod) {
      case 'explodieren': {
        aus.dx = t < 0.18 ? Math.sin(t * 160) * 1.6 : 0;
        aus.flash = clamp(1 - t / 0.3, 0, 1);
        aus.sy = 1 + 0.12 * clamp(a / 0.3, 0, 1);
        aus.alpha = 1 - clamp((a - 0.2) / 0.3, 0, 1);
        break;
      }
      case 'stuerzen': {
        aus.dx = fall.vx * 0.05 * a + b * 10 * a;
        aus.dy = a * a * 70;
        aus.rot = b * a * 2.8;
        aus.alpha = 1 - clamp((a - 0.65) / 0.35, 0, 1);
        break;
      }
      case 'zerfallen': {
        aus.sx = 1 + 0.3 * a; aus.sy = 1 - 0.85 * a * a;
        aus.flash = clamp(0.5 - a, 0, 0.5);
        aus.alpha = 1 - Math.pow(a, 1.5);
        break;
      }
      case 'zerstieben': {
        aus.sx = 1 + 0.9 * a; aus.sy = 1 + 0.25 * a;
        aus.dy = -a * 6;
        aus.alpha = (1 - a) * (1 - a);
        break;
      }
      default: {
        if (fall.liegt) {
          // Mit „Niedergestreckt“-Frame im Blatt: Das Bild liegt schon, es rutscht nur kurz nach hinten.
          const k = clamp(a / 0.25, 0, 1);
          aus.dx = b * 4 * ausOut(k);
          aus.alpha = 1 - clamp((a - 0.7) / 0.3, 0, 1);
          aus.flash = clamp(0.4 - a * 3, 0, 0.4);
          break;
        }
        // Kippen: nach hinten/vorn umfallen, kleines Aufsetzen, dann ausblenden.
        const kipp = clamp(a / 0.45, 0, 1);
        aus.rot = b * (Math.PI / 2.1) * kipp * kipp + b * 0.07 * Math.sin(clamp((a - 0.45) / 0.2, 0, 1) * Math.PI);
        aus.dx = b * 8 * kipp;
        aus.dy = 2 * kipp;
        aus.alpha = 1 - clamp((a - 0.55) / 0.45, 0, 1);
        aus.flash = clamp(0.4 - a * 2, 0, 0.4);
      }
    }
  }
  return aus;
}
