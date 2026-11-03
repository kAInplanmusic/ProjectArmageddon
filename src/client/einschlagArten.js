/**
 * Einschlag nach Schadensart (N-08): gezeichnete Teilchen je Familie, ergänzend zu den Bildfolgen
 * aus `effektSheets.js`. Eis splittert, Wasser spritzt, Gift blubbert, Magie funkelt, Heiliges
 * steigt auf, Blitz zuckt, Feuer glüht nach, Wind verwirbelt.
 *
 * Die Teilchen haben keinen eigenen Zustand: Ort und Größe sind eine reine Funktion des Alters
 * (in Bildern) und eines Startwerts aus dem Einschlagort (`hash2`). Kein `Math.random`; derselbe
 * Einschlag sieht immer gleich aus. Höchstens `MAX_ART_EINSCHLAEGE` zugleich (weitere werden
 * verworfen). Bei „reduzierter Bewegung" startet nichts (wie die Bildfolgen); die Farbe der
 * Schadensart trägt dann der Explosionsblitz (`effektStil.zeichneExplosion`, `farben`).
 * Nichts davon fließt in Hash, Replay oder Netz.
 *
 * @module einschlagArten
 */
import { hash2 } from './stil.js';
import { FAMILIEN_FARBEN, rgba } from './waffenOptik.js';

/** Gleichzeitige Teilchen-Einschläge. */
export const MAX_ART_EINSCHLAEGE = 8;
/** Dauer eines Teilchen-Einschlags in Bildern (60 Hz). */
export const ART_DAUER = 42;
/** Familien mit eigener Teilchenwirkung (`explosiv` hat keine: dort trägt die Explosion). */
export const ART_FAMILIEN = Object.freeze(['feuer', 'eis', 'wasser', 'gift', 'magie', 'heilig', 'blitz', 'energie', 'wind']);

const ANZAHL = Object.freeze({ feuer: 10, eis: 9, wasser: 16, gift: 9, magie: 7, heilig: 6, blitz: 5, energie: 8, wind: 3 });

export class ArtEinschlaege {
  constructor() {
    this.liste = [];
    this.verworfen = 0;
  }

  /**
   * Startet die Teilchen einer Familie am Einschlagpunkt.
   * @returns {boolean} ob gestartet wurde
   */
  starte(familie, x, y, radius) {
    if (!ART_FAMILIEN.includes(familie)) return false;
    if (this.liste.length >= MAX_ART_EINSCHLAEGE) { this.verworfen += 1; return false; }
    const r = Math.max(10, Math.min(90, radius));
    this.liste.push({ familie, x, y, r, alter: 0, saat: (Math.round(x) * 73856093) ^ (Math.round(y) * 19349663) });
    return true;
  }

  fortschreiben() {
    if (this.liste.length === 0) return;
    for (const e of this.liste) e.alter += 1;
    this.liste = this.liste.filter(e => e.alter < ART_DAUER);
  }

  leere() { this.liste = []; }

  zeichne(ctx) {
    if (!ctx || this.liste.length === 0) return;
    for (const e of this.liste) {
      ctx.save();
      ZEICHNER[e.familie]?.(ctx, e, e.alter / ART_DAUER, FAMILIEN_FARBEN[e.familie]);
      ctx.restore();
    }
  }
}

/** Zufallswert 0..1 für Teilchen `i`, Merkmal `m` dieses Einschlags. */
const h = (e, i, m) => hash2(e.saat, i, m);

/** Fächer nach oben: Winkel (Bogenmaß, Bildschirm-y nach unten) und Startgeschwindigkeit. */
function wurf(e, i, breite, tempo) {
  const w = -Math.PI / 2 + (h(e, i, 1) - 0.5) * breite;
  const v = e.r * tempo * (0.55 + 0.9 * h(e, i, 2));
  return { vx: Math.cos(w) * v, vy: Math.sin(w) * v };
}

function bodenRing(ctx, e, t, farbe, staerke = 0.6) {
  ctx.globalAlpha = (1 - t) * staerke;
  ctx.strokeStyle = farbe;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(e.x, e.y, e.r * (0.4 + 0.9 * t), e.r * (0.12 + 0.2 * t), 0, 0, Math.PI * 2);
  ctx.stroke();
}

function stern4(ctx, x, y, r) {
  ctx.beginPath();
  for (let k = 0; k < 8; k += 1) {
    const w = (k / 8) * Math.PI * 2;
    const rr = k % 2 === 0 ? r : r * 0.3;
    if (k === 0) ctx.moveTo(x + Math.cos(w) * rr, y + Math.sin(w) * rr);
    else ctx.lineTo(x + Math.cos(w) * rr, y + Math.sin(w) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

const ZEICHNER = Object.freeze({
  eis(ctx, e, t, f) {
    bodenRing(ctx, e, t, rgba(f.mitte));
    ctx.lineWidth = 0.9;
    ctx.strokeStyle = rgba(f.rand);
    for (let i = 0; i < ANZAHL.eis; i += 1) {
      const { vx, vy } = wurf(e, i, 2.8, 0.06);
      const n = e.alter;
      const x = e.x + vx * n;
      const y = e.y + vy * n + 0.06 * n * n;
      const s = 2.5 + 3.5 * h(e, i, 3);
      ctx.globalAlpha = 1 - t * t;
      ctx.fillStyle = i % 3 === 0 ? '#ffffff' : rgba(f.kern);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(h(e, i, 4) * 6 + n * 0.15 * (h(e, i, 5) - 0.5));
      ctx.beginPath();
      ctx.moveTo(s * 1.4, 0);
      ctx.lineTo(0, s * 0.45);
      ctx.lineTo(-s * 1.4, 0);
      ctx.lineTo(0, -s * 0.45);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  },
  wasser(ctx, e, t, f) {
    bodenRing(ctx, e, t, rgba(f.kern), 0.7);
    for (let i = 0; i < ANZAHL.wasser; i += 1) {
      const { vx, vy } = wurf(e, i, 2.2, 0.085);
      const n = e.alter;
      const x = e.x + vx * n;
      const y = e.y + vy * n + 0.1 * n * n;
      if (y > e.y + 4) continue;
      const s = 1.5 + 2.2 * h(e, i, 3);
      ctx.globalAlpha = 0.95 * (1 - t);
      ctx.fillStyle = rgba(i % 4 === 0 ? f.kern : f.mitte);
      ctx.beginPath();
      ctx.ellipse(x, y, s * 0.8, s * 1.2, Math.atan2(vy + 0.2 * n, vx) + Math.PI / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  gift(ctx, e, t, f) {
    // Grüner Dunst und aufsteigende Blasen, die nacheinander platzen.
    ctx.globalAlpha = 0.28 * (1 - t);
    ctx.fillStyle = rgba(f.rand);
    for (let i = 0; i < 4; i += 1) {
      ctx.beginPath();
      ctx.arc(e.x + (h(e, i, 7) - 0.5) * e.r, e.y - e.r * 0.2 - t * e.r * 0.4, e.r * (0.3 + 0.25 * t), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.lineWidth = 1.3;
    for (let i = 0; i < ANZAHL.gift; i += 1) {
      const platzt = 0.45 + 0.5 * h(e, i, 3);
      if (t > platzt) continue;
      const n = e.alter;
      const x = e.x + (h(e, i, 1) - 0.5) * e.r * 1.3 + Math.sin(n * 0.2 + i) * 2;
      const y = e.y - n * (0.35 + 0.5 * h(e, i, 2));
      const s = 2 + 4 * h(e, i, 4) * (0.6 + t);
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = rgba(f.mitte);
      ctx.fillStyle = rgba(f.mitte, 0.25);
      ctx.beginPath();
      ctx.arc(x, y, s, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = rgba(f.kern);
      ctx.beginPath();
      ctx.arc(x - s * 0.35, y - s * 0.35, Math.max(0.6, s * 0.25), 0, Math.PI * 2);
      ctx.fill();
    }
  },
  magie(ctx, e, t, f) {
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < ANZAHL.magie; i += 1) {
      const w = (i / ANZAHL.magie) * Math.PI * 2 + e.alter * 0.08 * (i % 2 ? 1 : -1);
      const d = e.r * (0.2 + 0.95 * t);
      ctx.globalAlpha = (1 - t) * (0.6 + 0.4 * h(e, i, 1));
      ctx.fillStyle = rgba(i % 3 === 0 ? f.kern : i % 3 === 1 ? f.mitte : [255, 130, 220]);
      stern4(ctx, e.x + Math.cos(w) * d, e.y + Math.sin(w) * d * 0.8, 3 + 4 * h(e, i, 2) * (1 - t * 0.5));
    }
  },
  heilig(ctx, e, t, f) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5 * (1 - t);
    ctx.strokeStyle = rgba(f.mitte);
    ctx.lineWidth = 2;
    for (let k = 0; k < 4; k += 1) {
      const w = -Math.PI / 2 + (k - 1.5) * 0.35;
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      ctx.lineTo(e.x + Math.cos(w) * e.r * 1.6 * Math.min(1, t * 3), e.y + Math.sin(w) * e.r * 1.6 * Math.min(1, t * 3));
      ctx.stroke();
    }
    ctx.fillStyle = rgba(f.kern);
    for (let i = 0; i < ANZAHL.heilig; i += 1) {
      const x = e.x + (h(e, i, 1) - 0.5) * e.r * 1.4;
      const y = e.y - e.alter * (0.4 + 0.6 * h(e, i, 2));
      const s = 2 + 2 * h(e, i, 3);
      ctx.globalAlpha = 1 - t;
      ctx.fillRect(x - s * 0.35, y - s, s * 0.7, s * 2);
      ctx.fillRect(x - s, y - s * 0.35, s * 2, s * 0.7);
    }
  },
  blitz(ctx, e, t, f) {
    if (t > 0.6) return;
    const takt = e.alter >> 1;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineJoin = 'round';
    for (let i = 0; i < ANZAHL.blitz; i += 1) {
      const w = (i / ANZAHL.blitz) * Math.PI * 2 + h(e, i, 1);
      const laenge = e.r * (0.6 + 0.7 * h(e, i, 2));
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      for (let s = 1; s <= 5; s += 1) {
        const d = (laenge * s) / 5;
        const q = (hash2(e.saat + takt, i, s) - 0.5) * 10;
        ctx.lineTo(e.x + Math.cos(w) * d - Math.sin(w) * q, e.y + Math.sin(w) * d + Math.cos(w) * q);
      }
      ctx.globalAlpha = (1 - t / 0.6) * (0.5 + 0.5 * hash2(e.saat, takt, i));
      ctx.strokeStyle = rgba(f.mitte);
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.1;
      ctx.stroke();
    }
  },
  energie(ctx, e, t, f) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.strokeStyle = rgba(f.mitte);
    ctx.lineWidth = 2;
    for (let i = 0; i < ANZAHL.energie; i += 1) {
      const w = (i / ANZAHL.energie) * Math.PI * 2 + h(e, i, 1) * 0.5;
      const a = e.r * (0.3 + 1.1 * t);
      const b = a + e.r * 0.35 * (1 - t);
      ctx.globalAlpha = 1 - t;
      ctx.beginPath();
      ctx.moveTo(e.x + Math.cos(w) * a, e.y + Math.sin(w) * a);
      ctx.lineTo(e.x + Math.cos(w) * b, e.y + Math.sin(w) * b);
      ctx.stroke();
    }
  },
  feuer(ctx, e, t, f) {
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < ANZAHL.feuer; i += 1) {
      const n = e.alter;
      const x = e.x + (h(e, i, 1) - 0.5) * e.r * 1.4 + Math.sin(n * 0.15 + i) * 2;
      const y = e.y - e.r * 0.2 - n * (0.3 + 0.7 * h(e, i, 2));
      ctx.globalAlpha = (1 - t) * (0.6 + 0.4 * h(e, i, 3));
      ctx.fillStyle = rgba(i % 2 ? f.mitte : f.kern);
      ctx.beginPath();
      ctx.arc(x, y, 1.2 + 1.6 * h(e, i, 4), 0, Math.PI * 2);
      ctx.fill();
    }
  },
  wind(ctx, e, t, f) {
    ctx.strokeStyle = rgba(f.kern);
    ctx.lineCap = 'round';
    ctx.lineWidth = 2;
    for (let i = 0; i < ANZAHL.wind; i += 1) {
      const r = e.r * (0.4 + 0.3 * i + 0.6 * t);
      const start = e.alter * 0.12 + i * 2;
      ctx.globalAlpha = 0.7 * (1 - t);
      ctx.beginPath();
      ctx.arc(e.x, e.y - e.r * 0.3, r, start, start + 2.2);
      ctx.stroke();
    }
  },
});

export default ArtEinschlaege;
