/**
 * Pflanzen als einfache Vektorformen mit Comic-Kontur: Palmen, Büsche, Farne, Gräser.
 *
 * Die Plätze kommen aus Gelände und Seed (`hash2`), nie aus Zufall. Gezeichnet
 * wird in eine eigene Ebene, die hinter dem Gelände liegt (Wurzeln sind vom
 * Boden verdeckt) und nur neu entsteht, wenn ein Krater Pflanzen entfernt.
 *
 * @module pflanzen
 */
import {
  PAL, hash2, mischeRgb, css, gruenAnteil, folge,
} from './stil.js';
import { bodenArt } from './gelaendeStil.js';
import { NEUE_BIOME } from '../shared/config/biome-neu.js';
import { NEUE_ARTEN, zeichneNeuePflanze } from './pflanzenNeu.js';

const BLATT = [46, 128, 30];
const BLATT_DUNKEL = [22, 76, 24];
const BLATT_HELL = [104, 196, 44];
const STAMM = [92, 64, 40];

/** Wie dicht wächst es in einem Biom (0 bis 1)? */
const BEWUCHS = Object.freeze({
  island: 1, forest: 1, fantasy: 0.9, hyperreal: 0.9, deluge: 0.7, open: 0.65, alpine: 0.55,
  maritime: 0.5, warren: 0.4, western: 0.3,
});

/**
 * Setzt Pflanzen auf die Oberfläche des Geländes.
 *
 * @param {Uint8Array} bitmap
 * @param {number} breite
 * @param {number} hoehe
 * @param {number} seed
 * @param {string|null} biomId
 * @param {string} [art] - Bodenart aus `bodenArt()`: auf Schnee wachsen Tannen, auf Sand Palmen und Dürrgras
 * @returns {Array<{art:string,x:number,y:number,h:number,spiegel:boolean,seed:number}>}
 */
export function plazierePflanzen(bitmap, breite, hoehe, seed, biomId, boden = 'gras') {
  const profil = NEUE_BIOME[biomId]?.pflanzen ?? null;
  const dichte = profil ? profil.dichte : (BEWUCHS[biomId] ?? 0.2) * (boden === 'fels' || boden === 'asche' ? 0.5 : 1);
  const rows = new Int32Array(breite).fill(-1);
  for (let x = 0; x < breite; x += 1) {
    for (let y = 0; y < hoehe; y += 1) {
      if (bitmap[y * breite + x]) { rows[x] = y; break; }
    }
  }
  const liste = [];
  const zufall = folge(seed * 31 + 7);
  let x = 24 + zufall() * 40;
  while (x < breite - 24) {
    const ix = Math.floor(x);
    const y = rows[ix];
    const links = rows[Math.max(0, ix - 9)];
    const rechts = rows[Math.min(breite - 1, ix + 9)];
    const eben = links >= 0 && rechts >= 0 && Math.abs(links - rechts) <= 14;
    if (y >= 0 && y < hoehe * 0.8 && zufall() < dichte + 0.1) {
      const w = zufall();
      if (profil) {
        const wahl = profil.arten[Math.floor(w * profil.arten.length) % profil.arten.length];
        const neu = NEUE_ARTEN[wahl];
        const hoehe0 = neu ? neu[0] + zufall() * neu[1] : 10 + zufall() * 24;
        liste.push({ art: wahl, x: ix, y: y + 2, h: hoehe0, spiegel: zufall() < 0.5, seed: Math.floor(zufall() * 9999) });
        x += 40 + zufall() * 60 / Math.max(0.35, dichte);
        continue;
      }
      let art = !eben ? (w < 0.5 ? 'busch' : 'gras')
        : w < 0.3 ? 'palme' : w < 0.55 ? 'busch' : w < 0.8 ? 'farn' : 'gras';
      // Passend zum Boden: Tannen im Schnee, Dürrgras statt Farn auf Sand, auf nacktem Fels nur Gestrüpp.
      if (boden === 'schnee') art = w < 0.6 ? 'tanne' : w < 0.8 ? 'busch' : 'gras';
      else if (boden === 'sand' && art === 'farn') art = 'gras';
      else if ((boden === 'fels' || boden === 'asche') && art === 'palme') art = 'busch';
      const h = art === 'palme' ? 38 + zufall() * 26 : art === 'busch' ? 12 + zufall() * 8
        : art === 'farn' ? 14 + zufall() * 10 : art === 'tanne' ? 34 + zufall() * 28 : 8 + zufall() * 5;
      liste.push({ art, x: ix, y: y + 2, h, spiegel: zufall() < 0.5, seed: Math.floor(zufall() * 9999) });
    }
    x += 46 + zufall() * 70 / Math.max(0.35, dichte);
  }
  return liste;
}

/** Entfernt Pflanzen, deren Wurzel in einen Krater fällt. Gibt true zurück, wenn sich etwas änderte. */
export function entfernePflanzenImKrater(liste, cx, cy, radius, entfernt = null) {
  const vorher = liste.length;
  for (let i = liste.length - 1; i >= 0; i -= 1) {
    const p = liste[i];
    const dx = p.x - cx;
    const dy = p.y - cy;
    if (dx * dx + dy * dy < (radius + 8) * (radius + 8)) {
      const [weg] = liste.splice(i, 1);
      if (entfernt) entfernt.push(weg);
    }
  }
  return liste.length !== vorher;
}

/**
 * Hangrutsch: Eine Pflanze, deren Wurzel auf einer gerutschten Oberflächenzelle steht, bricht ab.
 * `zuege` ist die Nutzlast von `terrain_slumped` (Vierergruppen `xa, ya, xb, yb`: Quelle, Ziel).
 */
export function entfernePflanzenAufRutsch(liste, zuege, entfernt = null) {
  const vorher = liste.length;
  for (let i = liste.length - 1; i >= 0; i -= 1) {
    const p = liste[i];
    for (let k = 0; k + 3 < zuege.length; k += 4) {
      if (Math.abs(p.x - zuege[k]) <= 3 && Math.abs(p.y - zuege[k + 1]) <= 6) {
        const [weg] = liste.splice(i, 1);
        if (entfernt) entfernt.push(weg);
        break;
      }
    }
  }
  return liste.length !== vorher;
}

/** Entfernt Pflanzen außerhalb des Mahlstrom-Randes. */
export function entfernePflanzenAmRand(liste, inset, breite) {
  const vorher = liste.length;
  for (let i = liste.length - 1; i >= 0; i -= 1) {
    if (liste[i].x < inset + 6 || liste[i].x > breite - inset - 6) liste.splice(i, 1);
  }
  return liste.length !== vorher;
}

function blatt(ctx, x0, y0, winkel, laenge, breite, haenge, fuell, kontur) {
  const ex = x0 + Math.cos(winkel) * laenge;
  const ey = y0 + Math.sin(winkel) * laenge + haenge;
  const mx = x0 + Math.cos(winkel) * laenge * 0.55;
  const my = y0 + Math.sin(winkel) * laenge * 0.55 - breite * 1.4;
  const mx2 = mx;
  const my2 = my + breite * 2.2;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.quadraticCurveTo(mx, my, ex, ey);
  ctx.quadraticCurveTo(mx2, my2, x0, y0);
  ctx.closePath();
  ctx.fillStyle = fuell;
  if (kontur) { ctx.strokeStyle = kontur; ctx.lineWidth = 1.6; ctx.stroke(); }
  ctx.fill();
}

/**
 * Zeichnet eine Pflanze.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {{art:string,x:number,y:number,h:number,spiegel:boolean,seed:number}} p
 * @param {{blatt:string,dunkel:string,hell:string,stamm:string,kontur:string|null}} f
 */
export function zeichnePflanze(ctx, p, f, surface = null) {
  const s = p.spiegel ? -1 : 1;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (NEUE_ARTEN[p.art]) {
    zeichneNeuePflanze(ctx, p, f, surface ?? [110, 110, 110]);
  } else if (p.art === 'palme') {
    const neigung = (hash2(p.seed, 1, 5) - 0.5) * p.h * 0.5;
    const kx = p.x + neigung * s;
    const ky = p.y - p.h;
    if (f.kontur) {
      ctx.strokeStyle = f.kontur;
      ctx.lineWidth = p.h * 0.09 + 3;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.quadraticCurveTo(p.x + neigung * 0.1 * s, p.y - p.h * 0.55, kx, ky); ctx.stroke();
    }
    ctx.strokeStyle = f.stamm;
    ctx.lineWidth = p.h * 0.09 + 0.5;
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.quadraticCurveTo(p.x + neigung * 0.1 * s, p.y - p.h * 0.55, kx, ky); ctx.stroke();
    const wedel = 7;
    for (let i = 0; i < wedel; i += 1) {
      const w = -Math.PI * (0.02 + 0.96 * (i / (wedel - 1)));
      const lang = p.h * (0.36 + 0.1 * hash2(p.seed, i, 8));
      blatt(ctx, kx, ky, w, lang, p.h * 0.07, lang * 0.42 * Math.abs(Math.cos(w)) + 2, i % 2 ? f.blatt : f.dunkel, f.kontur);
    }
    blatt(ctx, kx, ky, -Math.PI / 2, p.h * 0.28, p.h * 0.05, 0, f.hell, f.kontur);
    ctx.fillStyle = f.dunkel;
    ctx.beginPath(); ctx.arc(kx, ky + 1, p.h * 0.05 + 1, 0, Math.PI * 2); ctx.fill();
  } else if (p.art === 'tanne') {
    // Fichte: schlanke Spitze, 5 bis 7 hängende Zweigschichten, je Seed unregelmäßig in Länge und Lage,
    // leicht schief und je Seite verschieden breit. Schneelast liegt auf den Oberseiten der Zweige.
    const rnd = (i, k) => hash2(p.seed, i, 20 + k);
    const n = 5 + Math.floor(rnd(0, 0) * 3);
    const spitzeX = p.x + (rnd(0, 1) - 0.5) * p.h * 0.1 * s;
    const oben = p.y - p.h;
    const kronenH = p.h * 0.88;
    const seite = [0.88 + rnd(0, 2) * 0.26, 0.88 + rnd(0, 3) * 0.26];
    const breit = p.h * 0.37;
    const unten = p.y - p.h * 0.1;
    // Eckpunkte je Seite von oben nach unten: Zweigspitze und die Kerbe darunter.
    const baue = sg => {
      const k = [];
      for (let i = 0; i < n; i += 1) {
        const t = (i + 1) / n;
        const tipY = Math.min(unten, oben + kronenH * (i + 1) / n + p.h * (0.025 + 0.04 * rnd(i, 4 + (sg > 0 ? 8 : 0))));
        const w = breit * (0.2 + 0.8 * t ** 0.82) * (0.84 + 0.3 * rnd(i, 5 + (sg > 0 ? 8 : 0))) * seite[sg > 0 ? 1 : 0];
        // Die Mittelachse neigt sich zur Spitze hin leicht zur Seite.
        const achse = p.x + (spitzeX - p.x) * (1 - t) ** 1.3;
        const tip = { x: achse + sg * w, y: tipY };
        const kerbe = { x: achse + sg * w * (0.16 + 0.2 * rnd(i, 6 + (sg > 0 ? 8 : 0))), y: tipY - p.h * (0.05 + 0.04 * rnd(i, 7)) };
        k.push({ tip, kerbe });
      }
      return k;
    };
    const apex = { x: spitzeX, y: oben + p.h * 0.02 };
    /** Punktfolge einer Seite von oben nach unten: Spitze der Schicht, Kerbe darunter, nächste Spitze ... */
    const folge2 = k => {
      const l = [apex];
      k.forEach((e, i) => { l.push(e.tip); if (i < n - 1) l.push(e.kerbe); });
      return l;
    };
    const links = baue(-1);
    const rechts = baue(1);
    /** Steuerpunkt einer Kante: auswärts führende Kanten steigen erst und hängen dann, Kanten zur Kerbe sacken durch. */
    const steuer = (a, b) => (b.y >= a.y && Math.abs(b.x - spitzeX) > Math.abs(a.x - spitzeX)
      ? { x: a.x + (b.x - a.x) * 0.55, y: a.y + (b.y - a.y) * 0.12 }
      : { x: (a.x + b.x) / 2, y: Math.max(a.y, b.y) + p.h * 0.03 });
    const zeichneKrone = (mitte, faktor, fuell, strich) => {
      const f2 = pt => ({ x: mitte + (pt.x - mitte) * faktor, y: pt.y });
      const l = folge2(links).map(f2);
      const r = folge2(rechts).map(f2);
      l[0] = apex; r[0] = apex;
      ctx.beginPath();
      ctx.moveTo(apex.x, apex.y);
      for (let i = 1; i < l.length; i += 1) { const c = steuer(l[i - 1], l[i]); ctx.quadraticCurveTo(c.x, c.y, l[i].x, l[i].y); }
      ctx.lineTo(p.x - p.h * 0.04, unten);
      ctx.lineTo(p.x + p.h * 0.04, unten);
      ctx.lineTo(r[r.length - 1].x, r[r.length - 1].y);
      for (let i = r.length - 2; i >= 0; i -= 1) { const c = steuer(r[i], r[i + 1]); ctx.quadraticCurveTo(c.x, c.y, r[i].x, r[i].y); }
      ctx.closePath();
      if (strich) { ctx.strokeStyle = strich; ctx.lineWidth = 2.4; ctx.stroke(); }
      ctx.fillStyle = fuell;
      ctx.fill();
    };
    // Stamm
    ctx.fillStyle = f.stamm;
    ctx.fillRect(p.x - p.h * 0.045, unten - 2, p.h * 0.09, p.h * 0.1 + 2);
    zeichneKrone(p.x, 1, f.dunkel, f.kontur);
    // Lichtseite: schmalere Krone in Nadelgrün, zur Lichtseite hin verschoben.
    zeichneKrone(p.x + s * p.h * 0.03, 0.6, f.blatt, null);
    // Schnee und Reif auf den Zweigoberseiten (links kürzer, zur Lichtseite hin länger).
    ctx.fillStyle = f.hell;
    for (let i = 0; i < n - 1; i += 1) {
      for (const sg of [-1, 1]) {
        if (rnd(i, 9 + (sg > 0 ? 3 : 0)) < 0.18) continue;
        const sk = (sg === s ? 0.78 : 0.5) * (0.7 + 0.5 * rnd(i, 10));
        const eck = sg < 0 ? links[i] : rechts[i];
        const ab = i > 0 ? (sg < 0 ? links[i - 1].kerbe : rechts[i - 1].kerbe) : { x: spitzeX, y: oben + p.h * 0.02 };
        const ex = ab.x + (eck.tip.x - ab.x) * sk;
        const ey = ab.y + (eck.tip.y - ab.y) * sk * 0.85;
        ctx.beginPath();
        ctx.moveTo(ab.x, ab.y);
        ctx.quadraticCurveTo(ab.x + (ex - ab.x) * 0.55, ab.y + (ey - ab.y) * 0.12 - 0.5, ex, ey);
        ctx.lineTo(ex - sg * p.h * 0.03, ey + p.h * 0.03);
        ctx.lineTo(ab.x + sg * p.h * 0.02, ab.y + p.h * 0.045);
        ctx.closePath();
        ctx.fill();
      }
    }
  } else if (p.art === 'busch') {
    const klumpen = 4;
    for (let pass = 0; pass < 2; pass += 1) {
      for (let i = 0; i < klumpen; i += 1) {
        const bx = p.x + (i - (klumpen - 1) / 2) * p.h * 0.5 * s;
        const by = p.y - p.h * (0.35 + 0.25 * hash2(p.seed, i, 3));
        const r = p.h * (0.42 + 0.14 * hash2(p.seed, i, 4));
        ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2);
        if (pass === 0) { if (f.kontur) { ctx.strokeStyle = f.kontur; ctx.lineWidth = 3.4; ctx.stroke(); } } else {
          ctx.fillStyle = i % 2 ? f.blatt : f.dunkel; ctx.fill();
        }
      }
    }
    ctx.fillStyle = f.hell;
    for (let i = 0; i < klumpen; i += 1) {
      const bx = p.x + (i - (klumpen - 1) / 2) * p.h * 0.5 * s - p.h * 0.1;
      const by = p.y - p.h * (0.5 + 0.25 * hash2(p.seed, i, 3));
      ctx.beginPath(); ctx.arc(bx, by, p.h * 0.12, 0, Math.PI * 2); ctx.fill();
    }
  } else if (p.art === 'farn') {
    const n = 7;
    for (let i = 0; i < n; i += 1) {
      const w = -Math.PI * (0.1 + 0.8 * (i / (n - 1)));
      blatt(ctx, p.x, p.y, w, p.h * (0.9 + 0.3 * hash2(p.seed, i, 2)), p.h * 0.1, p.h * 0.25, i % 2 ? f.blatt : f.dunkel, f.kontur);
    }
  } else {
    const n = 5;
    for (let i = 0; i < n; i += 1) {
      const w = -Math.PI * (0.18 + 0.64 * (i / (n - 1)));
      blatt(ctx, p.x + (i - 2) * 1.5, p.y, w, p.h * (0.8 + 0.4 * hash2(p.seed, i, 6)), p.h * 0.07, p.h * 0.1, i % 2 ? f.hell : f.blatt, f.kontur);
    }
  }
  ctx.restore();
}

/** Farben der Vordergrundpflanzen, zur Bodenfarbe hin getönt. */
export function pflanzenFarben(palette) {
  const boden = bodenArt(palette.surface);
  // Eigene Töne je Bodenart: blaugrüne Nadeln im Schnee, ausgeblichenes Dürrgras auf Sand, graugrünes Gestrüpp auf Fels.
  if (boden === 'schnee') return { blatt: css([46, 104, 92]), dunkel: css([26, 66, 62]), hell: css([214, 232, 240]), stamm: css(STAMM), kontur: PAL.kontur };
  if (boden === 'sand') return { blatt: css([150, 142, 66]), dunkel: css([104, 98, 44]), hell: css([214, 198, 110]), stamm: css([112, 84, 52]), kontur: PAL.kontur };
  if (boden === 'fels' || boden === 'asche') {
    const g = css(mischeRgb(palette.surface, [72, 98, 60], 0.55));
    return { blatt: g, dunkel: css(mischeRgb(palette.surface, [36, 52, 34], 0.6)), hell: css(mischeRgb(palette.surface, [122, 150, 90], 0.5)), stamm: css(STAMM), kontur: PAL.kontur };
  }
  const gm = gruenAnteil(palette.surface);
  const t = c => css(mischeRgb(mischeRgb(palette.surface, [20, 24, 20], 0.5), c, gm));
  return {
    blatt: t(BLATT), dunkel: t(BLATT_DUNKEL), hell: t(BLATT_HELL),
    stamm: css(STAMM), kontur: PAL.kontur,
  };
}

/** Zeichnet alle Pflanzen in eine (leere) Ebene. */
export function zeichnePflanzenSchicht(ctx, liste, breite, hoehe, palette) {
  ctx.clearRect(0, 0, breite, hoehe);
  const farben = pflanzenFarben(palette);
  for (const p of liste) zeichnePflanze(ctx, p, farben, palette.surface);
}

/**
 * Zeichnet nur einen Ausschnitt der Pflanzenebene neu: das Rechteck wird geleert und alle Pflanzen,
 * deren Rahmen es berühren, werden (in Listenreihenfolge, auf das Rechteck beschnitten) gezeichnet.
 * Das Ergebnis ist pixelgleich zu `zeichnePflanzenSchicht` über die ganze Ebene, kostet aber nur
 * die Fläche des Ausschnitts — ein Krater lässt ein paar Pflanzen verschwinden, nicht die ganze Karte neu entstehen.
 *
 * @param {{x0:number,x1:number,y0:number,y1:number}} bereich
 */
export function zeichnePflanzenAusschnitt(ctx, liste, breite, hoehe, palette, bereich) {
  const x0 = Math.max(0, Math.floor(bereich.x0));
  const y0 = Math.max(0, Math.floor(bereich.y0));
  const x1 = Math.min(breite, Math.ceil(bereich.x1));
  const y1 = Math.min(hoehe, Math.ceil(bereich.y1));
  if (x1 <= x0 || y1 <= y0) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y0, x1 - x0, y1 - y0);
  ctx.clip();
  ctx.clearRect(x0, y0, x1 - x0, y1 - y0);
  const farben = pflanzenFarben(palette);
  for (const p of liste) {
    const r = pflanzenRahmen(p, breite, hoehe);
    if (r.x1 > x0 && r.x0 < x1 && r.y1 > y0 && r.y0 < y1) zeichnePflanze(ctx, p, farben, palette.surface);
  }
  ctx.restore();
}

/**
 * Umschließendes Rechteck einer Pflanze (großzügig, Kontur und Neigung eingerechnet).
 * Breiter als jede Form in `zeichnePflanze`: Palmwedel und Farnblätter reichen bis 1,3 h zur Seite,
 * Büsche bis 1,3 h, Kronen bis 1,5 h hoch.
 */
export function pflanzenRahmen(p, breite, hoehe) {
  const halb = Math.ceil(p.h * 1.4 + 8);
  const x0 = Math.max(0, Math.floor(p.x - halb));
  const x1 = Math.min(breite, Math.ceil(p.x + halb));
  const y0 = Math.max(0, Math.floor(p.y - p.h * 1.6 - 8));
  const y1 = Math.min(hoehe, Math.ceil(p.y + p.h * 0.4 + 6));
  return { x0, x1, y0, y1 };
}

/**
 * Die Pflanzenebene ist so groß wie die Karte, aber fast leer. Statt sie jedes Bild
 * ganz aufzulegen (die Karte hat bis zu 3,7 Mio. Pixel), genügen Streifen um die Pflanzen:
 * überlappende Rahmen werden zu SENKRECHTEN Streifen ohne Überlappung verschmolzen
 * (jedes Pixel wird höchstens einmal gezeichnet, das Bild bleibt pixelgleich).
 *
 * @returns {Array<{x0:number,x1:number,y0:number,y1:number}>} sortiert nach `x0`, überschneidungsfrei
 */
export function pflanzenStreifen(liste, breite, hoehe) {
  const rahmen = liste.map(p => pflanzenRahmen(p, breite, hoehe))
    .filter(r => r.x1 > r.x0 && r.y1 > r.y0)
    .sort((a, b) => a.x0 - b.x0);
  const streifen = [];
  for (const r of rahmen) {
    const letzter = streifen[streifen.length - 1];
    if (letzter && r.x0 < letzter.x1) {
      letzter.x1 = Math.max(letzter.x1, r.x1);
      letzter.y0 = Math.min(letzter.y0, r.y0);
      letzter.y1 = Math.max(letzter.y1, r.y1);
    } else {
      streifen.push({ ...r });
    }
  }
  return streifen;
}
