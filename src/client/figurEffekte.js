/**
 * Kleine Teilcheneffekte der Figuren: Staubpuff bei der Landung, Blasen beim
 * Ertrinken, Splitter/Funken/Rauch beim Tod (in Teamfarbe). Nur Darstellung.
 *
 * Ein fester Vorrat an Teilchen in Strukturfeldern (`Float32Array`): kein Objekt
 * je Teilchen, keine Allokation je Bild. Ist der Vorrat voll, werden die
 * ältesten Teilchen überschrieben. Die Streuung kommt aus einem kleinen
 * eigenen Zufallsstrom (nur Anzeige, nicht der Motor-RNG).
 *
 * @module figurEffekte
 */

export const MAX_TEILCHEN = 192;

/** Arten */
export const ART = Object.freeze({ STAUB: 0, SPLITTER: 1, BLASE: 2, RAUCH: 3, BLITZ: 4, FUNKE: 5 });

export class FigurEffekte {
  constructor(max = MAX_TEILCHEN) {
    this.max = max;
    this.x = new Float32Array(max);
    this.y = new Float32Array(max);
    this.vx = new Float32Array(max);
    this.vy = new Float32Array(max);
    this.alter = new Float32Array(max);
    this.leben = new Float32Array(max); // 0 = frei
    this.groesse = new Float32Array(max);
    this.art = new Uint8Array(max);
    this.farbe = new Uint16Array(max);
    this.naechster = 0;
    this.aktiv = 0;
    this.farben = [];
    this.farbIndex = new Map();
    this.zustandRnd = 0x9e3779b9;
    this.zuletzt = -1;
  }

  /** Streuwert 0..1 (Anzeige). */
  rnd() {
    let a = (this.zustandRnd + 0x6D2B79F5) >>> 0;
    this.zustandRnd = a;
    a = Math.imul(a ^ (a >>> 15), a | 1);
    a ^= a + Math.imul(a ^ (a >>> 7), a | 61);
    return ((a ^ (a >>> 14)) >>> 0) / 4294967296;
  }

  /** Index einer Farbe (CSS-Text) in der Palette. */
  farbIdx(css) {
    let i = this.farbIndex.get(css);
    if (i === undefined) {
      i = this.farben.length;
      this.farben.push(css);
      this.farbIndex.set(css, i);
    }
    return i;
  }

  spawne(art, x, y, vx, vy, leben, groesse, farbe) {
    const i = this.naechster;
    this.naechster = (i + 1) % this.max;
    if (this.leben[i] <= 0) this.aktiv += 1;
    this.art[i] = art; this.x[i] = x; this.y[i] = y; this.vx[i] = vx; this.vy[i] = vy;
    this.alter[i] = 0; this.leben[i] = leben; this.groesse[i] = groesse; this.farbe[i] = farbe;
  }

  /** Staubpuff an den Füßen (x, y = Bodenpunkt). */
  staub(x, y, staerke, faktor = 1) {
    const n = Math.round((3 + staerke * 5) * Math.min(1.6, faktor));
    const f = this.farbIdx('#cdb89a');
    for (let i = 0; i < n; i += 1) {
      const r = this.rnd();
      const s = i % 2 === 0 ? -1 : 1;
      this.spawne(ART.STAUB, x + s * (2 + r * 6), y - 1, s * (14 + r * 34) * (0.6 + staerke), -(4 + this.rnd() * 14),
        0.35 + this.rnd() * 0.25, 2 + staerke * 2.2 + this.rnd() * 1.6, f);
    }
  }

  /** Blasen beim Ertrinken/Waten. */
  blasen(x, y, n = 6) {
    const f = this.farbIdx('#e6f6ff');
    for (let i = 0; i < n; i += 1) {
      this.spawne(ART.BLASE, x + (this.rnd() - 0.5) * 12, y - this.rnd() * 10, (this.rnd() - 0.5) * 6, -(14 + this.rnd() * 22),
        0.7 + this.rnd() * 0.5, 1.1 + this.rnd() * 1.6, f);
    }
  }

  /**
   * Tod: Teilchen je Art des Sterbens (`tod` aus `figurTypen`), in Teamfarbe.
   *
   * @param {string} tod - kippen | explodieren | stuerzen | zerfallen | zerstieben
   * @param {number} x
   * @param {number} y - Mitte des Sprites (Körpermitte)
   * @param {string} team - Teamfarbe
   */
  tod(tod, x, y, team, blick = 1) {
    const tf = this.farbIdx(team);
    const weiss = this.farbIdx('#fff4d6');
    const orange = this.farbIdx('#ffb347');
    const grau = this.farbIdx('rgba(60,60,64,0.8)');
    switch (tod) {
      case 'explodieren':
        this.spawne(ART.BLITZ, x, y, 0, 0, 0.22, 14, weiss);
        for (let i = 0; i < 9; i += 1) {
          const w = this.rnd() * TWO_PI;
          const v = 40 + this.rnd() * 90;
          this.spawne(ART.FUNKE, x, y, Math.cos(w) * v, Math.sin(w) * v - 30, 0.4 + this.rnd() * 0.3, 1.6, i % 2 ? orange : weiss);
        }
        for (let i = 0; i < 5; i += 1) {
          this.spawne(ART.RAUCH, x + (this.rnd() - 0.5) * 10, y, (this.rnd() - 0.5) * 12, -(10 + this.rnd() * 16), 0.7 + this.rnd() * 0.3, 4 + this.rnd() * 3, grau);
        }
        break;
      case 'stuerzen':
        for (let i = 0; i < 7; i += 1) {
          this.spawne(ART.SPLITTER, x + (this.rnd() - 0.5) * 8, y, -blick * (10 + this.rnd() * 40), -(10 + this.rnd() * 30), 0.6 + this.rnd() * 0.3, 1.8 + this.rnd() * 1.4, i % 3 ? tf : grau);
        }
        break;
      case 'zerfallen':
        for (let i = 0; i < 16; i += 1) {
          this.spawne(ART.SPLITTER, x + (this.rnd() - 0.5) * 14, y + this.rnd() * 10, (this.rnd() - 0.5) * 40, -(8 + this.rnd() * 36), 0.6 + this.rnd() * 0.5, 1.5 + this.rnd() * 2, tf);
        }
        break;
      case 'zerstieben':
        for (let i = 0; i < 22; i += 1) {
          const w = this.rnd() * TWO_PI;
          const v = 20 + this.rnd() * 70;
          this.spawne(ART.SPLITTER, x, y, Math.cos(w) * v, Math.sin(w) * v - 10, 0.5 + this.rnd() * 0.5, 1 + this.rnd() * 1.4, i % 2 ? tf : grau);
        }
        break;
      default:
        // Kippen: Der Körper löst sich nach dem Umfallen in Teilchen in Teamfarbe.
        for (let i = 0; i < 14; i += 1) {
          this.spawne(ART.SPLITTER, x + blick * (4 + this.rnd() * 14), y + 6 + this.rnd() * 6, blick * (this.rnd() * 22), -(14 + this.rnd() * 38), 0.6 + this.rnd() * 0.5, 1.4 + this.rnd() * 1.8, tf);
        }
    }
  }

  /** Alle Teilchen um `dt` Sekunden weiterbewegen. */
  aktualisiere(dt) {
    if (this.aktiv === 0) return;
    const d = Math.min(0.05, Math.max(0, dt));
    let n = 0;
    for (let i = 0; i < this.max; i += 1) {
      if (this.leben[i] <= 0) continue;
      this.alter[i] += d;
      if (this.alter[i] >= this.leben[i]) { this.leben[i] = 0; continue; }
      n += 1;
      const a = this.art[i];
      this.x[i] += this.vx[i] * d;
      this.y[i] += this.vy[i] * d;
      if (a === ART.SPLITTER || a === ART.FUNKE) this.vy[i] += 220 * d;
      else if (a === ART.STAUB) { this.vx[i] *= 1 - 3 * d; this.vy[i] *= 1 - 2 * d; }
      else if (a === ART.RAUCH) this.vy[i] -= 8 * d;
    }
    this.aktiv = n;
  }

  /** Zeichnet alle lebenden Teilchen (Weltkoordinaten). */
  zeichne(ctx) {
    if (this.aktiv === 0) return;
    ctx.save();
    let letzte = -1;
    for (let i = 0; i < this.max; i += 1) {
      const l = this.leben[i];
      if (l <= 0) continue;
      const u = this.alter[i] / l;
      const a = this.art[i];
      if (this.farbe[i] !== letzte) { letzte = this.farbe[i]; ctx.fillStyle = this.farben[letzte]; ctx.strokeStyle = this.farben[letzte]; }
      const g = this.groesse[i];
      if (a === ART.STAUB || a === ART.RAUCH) {
        ctx.globalAlpha = (a === ART.STAUB ? 0.55 : 0.7) * (1 - u);
        ctx.beginPath();
        ctx.arc(this.x[i], this.y[i], g * (0.7 + u * 0.9), 0, TWO_PI);
        ctx.fill();
      } else if (a === ART.BLASE) {
        ctx.globalAlpha = 0.8 * (1 - u);
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.arc(this.x[i], this.y[i], g * (0.8 + u * 0.4), 0, TWO_PI);
        ctx.stroke();
      } else if (a === ART.BLITZ) {
        ctx.globalAlpha = 1 - u;
        ctx.beginPath();
        ctx.arc(this.x[i], this.y[i], g * (0.5 + u * 1.6), 0, TWO_PI);
        ctx.fill();
      } else {
        ctx.globalAlpha = 1 - u * u;
        const s = g * (1 - u * 0.4);
        ctx.fillRect(this.x[i] - s / 2, this.y[i] - s / 2, s, s);
      }
    }
    ctx.restore();
  }

  leere() {
    this.leben.fill(0);
    this.aktiv = 0;
  }
}

const TWO_PI = Math.PI * 2;
