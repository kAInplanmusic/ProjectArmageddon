/**
 * Bühne der Tiere: Sprechblasen, Miau-Wellen, Partikel und der Kameraauftritt von Günther und Cookie.
 *
 * Alles hier ist Darstellung. Die Bühne liest die Ereignisse, die ohnehin ankommen (lokal vom Motor,
 * online vom Server), und den Zustand, den der Client ohnehin zeichnet (`state.guenther`,
 * `state.cookie`). Sie sendet nichts, schreibt nichts in Motor oder Replay und braucht keine
 * zusätzliche Netzlast. Der Zufall (Streuung der Teilchen) kommt aus einem Zähler, nicht aus
 * `Math.random` — dieselben Ereignisse ergeben dasselbe Bild.
 *
 * Aufbau: `ereignis()` legt Teilchen, Blasen und einen Kameraauftritt an; `schritt(state, dt)` altert
 * sie und meldet Auftritte (Günther betritt die Karte); `zeichne(ctx)` malt in Kartenkoordinaten;
 * `kameraAuftritt()` und `versatz()` liefern die Kamerawerte. Bei Bewegungsreduktion gibt es weder
 * Beben noch Zoom, nur ruhige Blasen.
 *
 * @module tierBuehne
 */

/** Höchstzahl gleichzeitiger Teilchen (jeder Eintrag kostet im Bild einen kleinen Pfad). */
export const MAX_TEILCHEN = 90;
/** Kleinster Abstand zwischen zwei Auftritten der Kamera in Sekunden (kein Dauerzucken). */
const AUFTRITT_PAUSE = 4;

/** Text der Sprechblase je Günther-Aktion. */
const GUENTHER_BLASEN = Object.freeze({
  essen: 'Mampf!', huepfen: 'Wuff!', ziehen: 'Grrr, komm!', wuehlen: 'Buddel buddel', kuscheln: 'Kuschel mich!',
  kraulen: 'Kraul mich!', sitz: 'Sitz!', platz: 'Platz …', chaos: 'WUFF WUFF WUFF!',
});

/** Text der Miau-Blase je Stufe und wie laut sie wirkt (Pegel = Dringlichkeit). */
const MIAU_BLASEN = Object.freeze({ leise: 'miau', laut: 'MIAU!', wut: 'MIAUUUU!!' });

const SCHWACH = 0.35;

/**
 * Kameraauftritt je Ereignis: Zoomfaktor auf den Standardzoom, Dauer in Sekunden, Stärke des Bebens (0–1).
 * Nur wenige Ereignisse bekommen einen: Es soll ein Höhepunkt bleiben, kein Dauerzucken.
 */
export const AUFTRITTE = Object.freeze({
  cookie_tobt: { zoom: 1.18, dauer: 1.9, beben: 0.7 },
  cookie_spielt: { zoom: 1.12, dauer: 2.6, beben: 0.15 },
  cookie_schockwelle: { zoom: 1.0, dauer: 1.8, beben: 1 },
  guenther_auftritt: { zoom: 1.1, dauer: 1.3, beben: 0 },
  chaos: { zoom: 1.0, dauer: 1.2, beben: 0.35 },
});

export class TierBuehne {
  #teilchen = [];
  #blasen = [];
  #auftritt = null;
  #beben = { staerke: 0, rest: 0, dauer: 1 };
  #sperre = 0;
  #zaehler = 0;
  #zeit = 0;
  #reduziert = false;
  #guenther = null;
  #cookie = null;
  #guentherWarAktiv = false;
  #miauPegel = 0;

  /** Zähler statt Zufall: dieselbe Eingabe ergibt dieselbe Streuung. */
  #streu() {
    this.#zaehler += 1;
    const t = Math.sin(this.#zaehler * 12.9898) * 43758.5453;
    return (t - Math.floor(t)) * 2 - 1;
  }

  get teilchen() { return this.#teilchen; }

  get blasen() { return this.#blasen; }

  /** Aktueller Pegel des letzten Miauens (0–1), klingt ab — Anzeige der Dringlichkeit. */
  get miauPegel() { return this.#miauPegel; }

  reset() {
    this.#teilchen = []; this.#blasen = []; this.#auftritt = null; this.#beben = { staerke: 0, rest: 0, dauer: 1 };
    this.#miauPegel = 0; this.#guentherWarAktiv = false; this.#sperre = 0;
  }

  #teilchenDazu(art, x, y, anzahl, opt = {}) {
    for (let i = 0; i < anzahl; i += 1) {
      if (this.#teilchen.length >= MAX_TEILCHEN) this.#teilchen.shift();
      const s = this.#streu();
      const s2 = this.#streu();
      this.#teilchen.push({
        art, x: x + s * (opt.streuX ?? 10), y: y + s2 * (opt.streuY ?? 6),
        vx: s * (opt.vx ?? 0.6), vy: (opt.vy ?? -0.9) - Math.abs(s2) * (opt.vyZusatz ?? 0.5),
        leben: 1, abnahme: opt.abnahme ?? 0.018, r: opt.r ?? 5, farbe: opt.farbe ?? null,
      });
    }
  }

  #blase(text, wer, x, y, { pegel = 0.5, rest = 2.2, farbe = null } = {}) {
    // Eine Blase je Sprecher: die neue ersetzt die alte.
    this.#blasen = this.#blasen.filter(b => b.wer !== wer);
    this.#blasen.push({ text, wer, x, y, pegel, rest, dauer: rest, farbe });
  }

  #starteAuftritt(name, x, y) {
    const a = AUFTRITTE[name];
    if (!a || this.#reduziert) return;
    if (this.#sperre > 0 && name !== 'cookie_schockwelle' && name !== 'cookie_tobt') return;
    this.#auftritt = { name, x, y, zoom: a.zoom, rest: a.dauer, dauer: a.dauer };
    this.#sperre = AUFTRITT_PAUSE;
    if (a.beben > 0) this.#beben = { staerke: a.beben, rest: a.dauer, dauer: a.dauer };
  }

  /**
   * Ein Ereignis des Motors (lokal oder vom Server). Unbekannte Arten werden ignoriert.
   * @param {string} typ
   * @param {object} n - Nutzlast
   */
  ereignis(typ, n = {}) {
    const x = Number.isFinite(n.x) ? n.x : (this.#cookie?.x ?? 0);
    const y = Number.isFinite(n.y) ? n.y : (this.#cookie?.y ?? 0);
    switch (typ) {
      case 'cookie_miau': {
        const pegel = Number.isFinite(n.pegel) ? n.pegel : 0.3;
        this.#miauPegel = Math.max(this.#miauPegel, pegel);
        this.#blase(MIAU_BLASEN[n.stufe] ?? 'miau', 'cookie', x, y - 56, { pegel, rest: 1.1 + pegel, farbe: n.stufe === 'wut' ? '#e5484d' : null });
        this.#teilchenDazu('note', x + 10, y - 40, n.stufe === 'wut' ? 3 : n.stufe === 'laut' ? 2 : 1, { vy: -0.7, abnahme: 0.014 });
        break;
      }
      case 'cookie_kuschelt': this.#teilchenDazu('herz', x, y - 34, 6, { streuX: 16, abnahme: 0.012 }); break;
      case 'cookie_gefuettert': this.#teilchenDazu('kruemel', x, y - 18, 9, { streuX: 14, vy: -0.4, abnahme: 0.03, r: 3 }); break;
      case 'cookie_tobt':
        this.#teilchenDazu('staub', x, y - 6, 12, { streuX: 28, abnahme: 0.02, r: 9 });
        this.#blase('GRRRAAA!', 'cookie', x, y - 56, { pegel: 1, rest: 1.8, farbe: '#e5484d' });
        this.#starteAuftritt('cookie_tobt', x, y);
        break;
      case 'cookie_zerstoert': this.#teilchenDazu('staub', x, y - 8, 2, { streuX: 24, abnahme: 0.03, r: 7 }); break;
      case 'cookie_schlag':
        this.#teilchenDazu('stern', x, y - 20, 5, { streuX: 14, abnahme: 0.04, r: 6 });
        this.#beben = { staerke: Math.max(this.#beben.staerke, SCHWACH), rest: 0.35, dauer: 0.35 };
        break;
      case 'cookie_erschoepft': this.#teilchenDazu('zzz', x, y - 40, 3, { vy: -0.4, abnahme: 0.008, streuX: 8 }); break;
      case 'cookie_spielt':
        this.#blase('Spielen?!', 'cookie', x, y - 56, { pegel: 0.8, rest: 2.4 });
        this.#starteAuftritt('cookie_spielt', x, y);
        break;
      case 'cookie_schockwelle':
        this.#teilchenDazu('ring', x, y - 4, 3, { vx: 0, vy: 0, abnahme: 0.011, r: Number.isFinite(n.radius) ? n.radius : 400, streuX: 0, streuY: 0 });
        this.#teilchenDazu('staub', x, y - 6, 16, { streuX: 60, abnahme: 0.016, r: 11 });
        this.#starteAuftritt('cookie_schockwelle', x, y);
        break;
      case 'guenther_aktion': {
        const text = GUENTHER_BLASEN[n.aktion];
        if (text) this.#blase(text, 'guenther', x, y - 44, { pegel: n.aktion === 'chaos' ? 1 : 0.45, rest: n.aktion === 'chaos' ? 2.6 : 2.0 });
        if (n.aktion === 'chaos') this.#starteAuftritt('chaos', x, y);
        break;
      }
      case 'guenther_aktion_wirkung':
        if (n.aktion === 'kuscheln' || n.aktion === 'kraulen') this.#teilchenDazu('herz', x, y - 28, 5, { streuX: 14, abnahme: 0.012 });
        else if (n.aktion === 'wuehlen') this.#teilchenDazu('kruemel', x, y - 4, 8, { streuX: 10, vy: -1.4, abnahme: 0.035, r: 3, farbe: '#8a6a44' });
        else if (n.aktion === 'essen') this.#teilchenDazu('kruemel', x, y - 12, 7, { streuX: 10, vy: -0.8, abnahme: 0.03, r: 3 });
        else if (n.aktion === 'chaos') this.#beben = { staerke: Math.max(this.#beben.staerke, SCHWACH), rest: 0.3, dauer: 0.3 };
        break;
      default: break;
    }
  }

  /**
   * Altert alles um `dt` Sekunden und merkt sich die Tiere aus dem Zustand.
   * @returns {{typ:string, x:number, y:number}[]} Signale für Protokoll und Klang (Günther betritt die Karte)
   */
  schritt(state, dt = 1 / 60, reduziert = false) {
    this.#reduziert = Boolean(reduziert);
    const zeit = Math.max(0, Math.min(0.1, Number.isFinite(dt) ? dt : 0));
    this.#zeit += zeit;
    this.#guenther = state?.guenther?.aktiv ? state.guenther : null;
    this.#cookie = state?.cookie?.aktiv ? state.cookie : null;
    const signale = [];
    const aktiv = Boolean(this.#guenther);
    if (aktiv && !this.#guentherWarAktiv) {
      signale.push({ typ: 'guenther_auftritt', x: this.#guenther.x, y: this.#guenther.y });
      this.#blase('Wuff! Ich bin da!', 'guenther', this.#guenther.x, this.#guenther.y - 44, { pegel: 0.6, rest: 2.4 });
      this.#starteAuftritt('guenther_auftritt', this.#guenther.x, this.#guenther.y);
    }
    this.#guentherWarAktiv = aktiv;

    if (this.#sperre > 0) this.#sperre = Math.max(0, this.#sperre - zeit);
    this.#miauPegel = Math.max(0, this.#miauPegel - zeit * 0.6);
    if (this.#auftritt) {
      this.#auftritt.rest -= zeit;
      if (this.#auftritt.rest <= 0) this.#auftritt = null;
    }
    if (this.#beben.rest > 0) this.#beben.rest = Math.max(0, this.#beben.rest - zeit);
    for (const b of this.#blasen) b.rest -= zeit;
    this.#blasen = this.#blasen.filter(b => b.rest > 0);
    const schritte = zeit * 60;
    for (const t of this.#teilchen) {
      t.x += t.vx * schritte; t.y += t.vy * schritte;
      if (t.art === 'staub') t.vy *= 0.96;
      t.leben -= t.abnahme * schritte;
    }
    this.#teilchen = this.#teilchen.filter(t => t.leben > 0);
    return signale;
  }

  /** Der laufende Kameraauftritt `{x, y, zoom, rest, dauer}` oder null (nie bei Bewegungsreduktion). */
  kameraAuftritt() {
    if (!this.#auftritt || this.#reduziert) return null;
    const a = this.#auftritt;
    // Sanft hinein und heraus: der Zoomfaktor folgt einer Glocke über die Dauer.
    const p = 1 - a.rest / a.dauer;
    const glocke = Math.sin(Math.PI * Math.min(1, Math.max(0, p)));
    return { x: a.x, y: a.y, zoom: 1 + (a.zoom - 1) * Math.min(1, glocke * 2.2), rest: a.rest, dauer: a.dauer, name: a.name };
  }

  /** Bildschirmversatz des Bebens in Pixeln (klingt quadratisch ab; 0 bei Bewegungsreduktion). */
  versatz() {
    const b = this.#beben;
    if (this.#reduziert || b.rest <= 0 || b.staerke <= 0) return { x: 0, y: 0 };
    const abkling = (b.rest / b.dauer) ** 2;
    const amp = 9 * b.staerke * abkling;
    return { x: Math.sin(this.#zeit * 71) * amp, y: Math.cos(this.#zeit * 59) * amp * 0.7 };
  }

  /** Zeichnet Teilchen und Blasen in Kartenkoordinaten (nach den Tieren). */
  zeichne(ctx) {
    if (!ctx) return;
    for (const t of this.#teilchen) zeichneTeilchen(ctx, t);
    for (const b of this.#blasen) {
      const ort = b.wer === 'guenther' ? this.#guenther : this.#cookie;
      // Die Blase folgt dem Tier (es läuft weiter), ohne Tier bleibt sie, wo sie entstand.
      zeichneBlase(ctx, b, ort ? ort.x : b.x, ort ? ort.y : b.y + 56);
    }
    if (this.#cookie && this.#miauPegel > 0.05) zeichneMiauWellen(ctx, this.#cookie, this.#miauPegel, this.#zeit);
  }
}

function zeichneTeilchen(ctx, t) {
  const a = Math.max(0, Math.min(1, t.leben));
  ctx.save();
  ctx.globalAlpha = a;
  switch (t.art) {
    case 'herz': {
      ctx.fillStyle = '#ff5d8f';
      ctx.translate(t.x, t.y);
      ctx.beginPath();
      ctx.moveTo(0, 3);
      ctx.bezierCurveTo(-7, -2, -4, -8, 0, -4);
      ctx.bezierCurveTo(4, -8, 7, -2, 0, 3);
      ctx.fill();
      break;
    }
    case 'kruemel':
      ctx.fillStyle = t.farbe ?? '#d9a35b';
      ctx.fillRect(t.x - t.r / 2, t.y - t.r / 2, t.r, t.r);
      break;
    case 'staub':
      ctx.fillStyle = 'rgba(150,130,105,0.55)';
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r * (1.4 - a * 0.4), 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'stern': {
      ctx.fillStyle = t.farbe ?? '#ffe066';
      ctx.translate(t.x, t.y);
      ctx.rotate(t.leben * 4);
      ctx.beginPath();
      for (let i = 0; i < 8; i += 1) {
        const r = i % 2 === 0 ? t.r : t.r * 0.4;
        const w = (i / 8) * Math.PI * 2;
        ctx.lineTo(Math.cos(w) * r, Math.sin(w) * r);
      }
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'zzz':
      ctx.fillStyle = '#cfe3ff';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Z', t.x, t.y);
      break;
    case 'note':
      ctx.fillStyle = '#f2c14e';
      ctx.beginPath();
      ctx.ellipse(t.x, t.y, 3.2, 2.4, -0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#f2c14e';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(t.x + 2.6, t.y - 0.5);
      ctx.lineTo(t.x + 2.6, t.y - 10);
      ctx.stroke();
      break;
    case 'ring': {
      const wachs = 1 - a;
      ctx.strokeStyle = `rgba(255,236,170,${0.8 * a})`;
      ctx.lineWidth = 4 + 6 * a;
      ctx.beginPath();
      ctx.ellipse(t.x, t.y, t.r * wachs, t.r * wachs * 0.28, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    default: break;
  }
  ctx.restore();
}

function zeichneBlase(ctx, b, x, bodenY) {
  const alpha = Math.max(0, Math.min(1, Math.min(b.rest, 0.4) / 0.4));
  const gross = 10 + b.pegel * 7;
  // Über dem Namensbalken von Cookie (−92) bzw. über Günthers Rücken; lautere Blasen steigen höher.
  const y = bodenY - (b.wer === 'cookie' ? 104 : 38) - b.pegel * 6 - (1 - alpha) * 6;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `bold ${gross}px sans-serif`;
  ctx.textAlign = 'center';
  const breite = ctx.measureText(b.text).width + 14;
  const hoehe = gross + 9;
  ctx.fillStyle = 'rgba(255,255,255,0.94)';
  ctx.strokeStyle = b.farbe ?? '#222';
  ctx.lineWidth = 1.5 + b.pegel;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x - breite / 2, y - hoehe, breite, hoehe, 7);
  else ctx.rect(x - breite / 2, y - hoehe, breite, hoehe);
  ctx.fill();
  ctx.stroke();
  // Zipfel zum Tier.
  ctx.beginPath();
  ctx.moveTo(x - 4, y - 0.5);
  ctx.lineTo(x + 2, y + 7);
  ctx.lineTo(x + 6, y - 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = b.farbe ?? '#222';
  ctx.fillText(b.text, x, y - 5);
  ctx.restore();
}

/** Schallwellen neben Cookie: 1 bis 3 Bögen, je lauter, desto mehr und größer. */
function zeichneMiauWellen(ctx, c, pegel, zeit) {
  const bogen = pegel > 0.8 ? 3 : pegel > 0.5 ? 2 : 1;
  ctx.save();
  ctx.strokeStyle = pegel > 0.8 ? '#e5484d' : '#f0c040';
  ctx.lineWidth = 2;
  const richtung = c.richtung >= 0 ? 1 : -1;
  for (let i = 0; i < bogen; i += 1) {
    const r = 14 + i * 9 + Math.sin(zeit * 14 + i) * 1.5;
    ctx.globalAlpha = Math.min(1, pegel) * (1 - i * 0.25);
    ctx.beginPath();
    ctx.arc(c.x + richtung * 18, c.y - 30, r, richtung > 0 ? -0.9 : Math.PI - 0.9 + 0.0, richtung > 0 ? 0.9 : Math.PI + 0.9, false);
    ctx.stroke();
  }
  ctx.restore();
}

export default TierBuehne;
