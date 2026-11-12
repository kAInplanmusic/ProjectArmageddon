/**
 * Zeichnung der Waffenoptik: Hitscan-Strahl je Art (N-11), Geschoss-Schweif je Familie (N-09/N-10)
 * und Mündungsfeuer je Waffe (N-07). Welche Art gilt, entscheidet `waffenOptik.js`.
 *
 * Reine Darstellung: kein Einfluss auf Engine, Hash, Replay oder Netz. Kein `Math.random`; das
 * Zittern von Blitz und Flamme kommt aus `hash2` über Ort und Bildnummer. Bei „reduzierter
 * Bewegung" steht die Bildnummer still: Form und Farbe bleiben (die Aussage), das Flackern entfällt.
 * Kein `setTransform` (der Kamera-Ruck-Test fängt es ab): nur `save`/`translate`/`rotate`/`restore`.
 *
 * @module waffenOptikZeichnen
 */
import { hash2 } from './stil.js';
import { FAMILIEN_FARBEN, rgba, muendungsStil } from './waffenOptik.js';
import { zeichneSchweif, zeichneMuendungsblitz } from './effektStil.js';
import { parameterFuerWaffe } from './waffenAnimation.js';
import { strahlBreite } from './waffenZustandsOptik.js';
import { holeWaffenSprite } from './waffenSprites.js';

/** Farben einer Strahlart (`heilig` gold, `laser` Energie, `leuchtspur` explosiv). */
const STRAHL_FARBEN = Object.freeze({
  laser: FAMILIEN_FARBEN.energie, leuchtspur: FAMILIEN_FARBEN.explosiv, feuer: FAMILIEN_FARBEN.feuer,
  eis: FAMILIEN_FARBEN.eis, wasser: FAMILIEN_FARBEN.wasser, gift: FAMILIEN_FARBEN.gift,
  magie: FAMILIEN_FARBEN.magie, heilig: FAMILIEN_FARBEN.heilig, blitz: FAMILIEN_FARBEN.blitz,
  wind: FAMILIEN_FARBEN.wind,
});

/** Bildnummer eines Effekts (für das Zittern), still bei reduzierter Bewegung. */
function bildNr(effect, reduziert) {
  return reduziert ? 0 : Math.round((1 - effect.life) / Math.max(0.01, effect.decay ?? 0.14));
}

/** Startwert des Rauschens aus dem Strahl selbst: derselbe Schuss zittert immer gleich. */
function strahlSaat(e) {
  return (Math.round(e.fromX) * 31 + Math.round(e.toY) * 17 + Math.round(e.toX)) | 0;
}

/** Polylinie entlang der Strecke mit seitlichem Versatz `quer(u, i)` (u 0..1). */
function pfad(ctx, e, n, quer) {
  const dx = e.toX - e.fromX;
  const dy = e.toY - e.fromY;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  ctx.beginPath();
  for (let i = 0; i <= n; i += 1) {
    const u = i / n;
    const q = quer(u, i);
    const x = e.fromX + dx * u + nx * q;
    const y = e.fromY + dy * u + ny * q;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
}

/** Punkte entlang der Strecke (für Kristalle, Tropfen, Funkeln). */
function punkte(e, abstand, wurf) {
  const dx = e.toX - e.fromX;
  const dy = e.toY - e.fromY;
  const len = Math.hypot(dx, dy) || 1;
  const n = Math.max(2, Math.min(60, Math.floor(len / abstand)));
  const aus = [];
  for (let i = 1; i < n; i += 1) {
    const u = (i + (hash2(i, wurf, 7) - 0.5) * 0.6) / n;
    aus.push({ x: e.fromX + dx * u, y: e.fromY + dy * u, u, i, nx: -dy / len, ny: dx / len });
  }
  return aus;
}

function stern4(ctx, x, y, r) {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r * 0.28, y - r * 0.28);
  ctx.lineTo(x + r, y);
  ctx.lineTo(x + r * 0.28, y + r * 0.28);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r * 0.28, y + r * 0.28);
  ctx.lineTo(x - r, y);
  ctx.lineTo(x - r * 0.28, y - r * 0.28);
  ctx.closePath();
  ctx.fill();
}

function raute(ctx, x, y, r, w) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(w);
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(0, r * 0.45);
  ctx.lineTo(-r, 0);
  ctx.lineTo(0, -r * 0.45);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/**
 * Ein Hitscan-Strahl (`effects.erzeugeStrahl`, Feld `art`) in seiner Art. `effect.color` (die
 * Blitzfarbe der Waffe) färbt nur den Laser; die übrigen Arten tragen die Familienfarben.
 */
export function zeichneStrahl(ctx, effect, reduziert = false) {
  const a = Math.max(0, Math.min(1, effect.life));
  const art = effect.art ?? 'laser';
  const f = STRAHL_FARBEN[art] ?? STRAHL_FARBEN.laser;
  const k = bildNr(effect, reduziert);
  const saat = strahlSaat(effect);
  const len = Math.hypot(effect.toX - effect.fromX, effect.toY - effect.fromY);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const gerade = () => pfad(ctx, effect, 1, () => 0);
  const strich = (farbe, breite, alpha) => {
    ctx.strokeStyle = farbe; ctx.lineWidth = breite; ctx.globalAlpha = alpha; ctx.stroke();
  };
  switch (art) {
    case 'blitz': {
      // Gezackter Bogen, der jedes Bild neu springt; ein dünner Nebenast.
      const n = Math.max(4, Math.min(40, Math.round(len / 14)));
      const zack = (u, i) => (i === 0 || i === n ? 0 : (hash2(i, k, saat) - 0.5) * 18 * Math.sin(Math.PI * u) ** 0.5);
      pfad(ctx, effect, n, zack);
      strich(rgba(f.rand), 7, a * 0.35);
      strich(rgba(f.mitte), 3, a);
      strich('#ffffff', 1.3, a);
      pfad(ctx, effect, n, (u, i) => zack(u, i) * -0.6 + (hash2(i, k + 9, saat) - 0.5) * 8);
      strich(rgba(f.mitte), 1, a * 0.6);
      break;
    }
    case 'wasser': {
      // Welliger Strahl mit Tropfen; die Welle läuft vom Schützen zum Ziel.
      const n = Math.max(8, Math.min(80, Math.round(len / 6)));
      const welle = (u) => Math.sin(u * len / 9 - k * 0.9) * 3 * (0.4 + u * 0.6);
      pfad(ctx, effect, n, welle);
      strich(rgba(f.rand), 7, a * 0.55);
      strich(rgba(f.mitte), 4, a);
      strich(rgba(f.kern), 1.5, a * 0.9);
      ctx.fillStyle = rgba(f.mitte, a);
      for (const p of punkte(effect, 24, saat)) {
        const q = (hash2(p.i, saat, 3) - 0.5) * 12 + (reduziert ? 0 : (1 - a) * 6);
        ctx.beginPath();
        ctx.arc(p.x + p.nx * q, p.y + p.ny * q + (reduziert ? 0 : (1 - a) * 5), 1.6 + hash2(p.i, saat, 4) * 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'eis': {
      // Gerader, kalter Kern mit Eiskristallen entlang der Bahn.
      gerade();
      strich(rgba(f.rand), 8, a * 0.3);
      strich(rgba(f.mitte), 3, a);
      strich('#ffffff', 1.2, a);
      ctx.fillStyle = rgba(f.kern, a);
      ctx.strokeStyle = rgba(f.rand, a);
      ctx.lineWidth = 0.8;
      const richtung = Math.atan2(effect.toY - effect.fromY, effect.toX - effect.fromX);
      for (const p of punkte(effect, 20, saat)) {
        const r = 2.5 + hash2(p.i, saat, 5) * 3;
        const seite = hash2(p.i, saat, 6) < 0.5 ? -1 : 1;
        raute(ctx, p.x + p.nx * seite * 3, p.y + p.ny * seite * 3, r, richtung + seite * 0.9);
      }
      break;
    }
    case 'feuer': {
      // Flammenzunge: breit am Ziel, flackernd; Glutpunkte.
      const n = Math.max(6, Math.min(50, Math.round(len / 10)));
      const flacker = (u, i) => (hash2(i, k, saat) - 0.5) * 5 * u;
      for (const [farbe, breite, al] of [[f.rand, 10, 0.45], [f.mitte, 6, 0.85], [f.kern, 2.5, 1]]) {
        pfad(ctx, effect, n, flacker);
        strich(rgba(farbe), breite, a * al);
      }
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = rgba(f.mitte, a);
      for (const p of punkte(effect, 28, saat + k)) {
        const q = (hash2(p.i, saat + k, 8) - 0.5) * 14;
        ctx.beginPath();
        ctx.arc(p.x + p.nx * q, p.y + p.ny * q - (reduziert ? 0 : (1 - a) * 8), 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'gift': {
      const n = Math.max(8, Math.min(60, Math.round(len / 8)));
      const wabern = (u) => Math.sin(u * len / 16 + saat) * 2.5;
      pfad(ctx, effect, n, wabern);
      strich(rgba(f.rand), 6, a * 0.5);
      strich(rgba(f.mitte), 3, a);
      ctx.strokeStyle = rgba(f.kern, a);
      ctx.lineWidth = 1;
      for (const p of punkte(effect, 22, saat)) {
        const q = (hash2(p.i, saat, 9) - 0.5) * 10;
        ctx.beginPath();
        ctx.arc(p.x + p.nx * q, p.y + p.ny * q - (reduziert ? 0 : (1 - a) * 6), 1.5 + hash2(p.i, saat, 10) * 2.5, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    }
    case 'magie':
    case 'heilig': {
      // Doppelhelix aus zwei Strängen, Funkelsterne an den Kreuzungen.
      const n = Math.max(10, Math.min(90, Math.round(len / 5)));
      const phase = reduziert ? 0 : k * 0.6;
      for (const [vz, farbe] of [[1, f.mitte], [-1, f.kern]]) {
        pfad(ctx, effect, n, (u) => vz * Math.sin(u * len / 14 + phase) * 4.5);
        strich(rgba(f.rand), 4, a * 0.35);
        strich(rgba(farbe), 1.6, a);
      }
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = rgba(f.kern, a);
      for (const p of punkte(effect, 30, saat)) stern4(ctx, p.x, p.y, 2.5 + 2.5 * hash2(p.i, saat + k, 11));
      break;
    }
    case 'wind': {
      for (let s = -1; s <= 1; s += 1) {
        pfad(ctx, effect, 24, (u) => s * 5 + Math.sin(u * Math.PI * 3 + s + (reduziert ? 0 : k * 0.5)) * 2);
        strich(rgba(f.mitte), 1.4, a * (s === 0 ? 0.9 : 0.5));
      }
      break;
    }
    case 'leuchtspur': {
      // Leuchtspur einer Kugel: hinten durchsichtig, vorn hell, dünn.
      const verlauf = ctx.createLinearGradient(effect.fromX, effect.fromY, effect.toX, effect.toY);
      verlauf.addColorStop(0, rgba(f.mitte, 0));
      verlauf.addColorStop(0.7, rgba(f.mitte, a * 0.8));
      verlauf.addColorStop(1, rgba(f.kern, a));
      gerade();
      ctx.strokeStyle = verlauf; ctx.lineWidth = 2.4; ctx.globalAlpha = 1; ctx.stroke();
      break;
    }
    default: {
      // Laser: breites Glühen, Farbkern, heller Kern (bisherige Linie, in der Blitzfarbe der Waffe).
      gerade();
      const farbe = effect.color ?? rgba(f.mitte);
      // Entladung (N-15): Der Strahl zieht sich beim Abklingen zusammen, statt nur auszublenden.
      const b = strahlBreite(effect.life, reduziert);
      strich(farbe, 11 * b, a * 0.3);
      strich(farbe, 3 * b, a);
      strich('#ffffff', 1.2 * b, a * 0.9);
    }
  }
  // Einschlagpunkt markieren.
  if (effect.hit) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = a;
    ctx.fillStyle = rgba(f.kern);
    ctx.beginPath();
    ctx.arc(effect.toX, effect.toY, 4 + (1 - effect.life) * 6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Schweif eines Geschosses in seiner Art (`waffenOptik.schweifArt`). `linie` ist der bisherige
 * Schweif in der Blitzfarbe; die übrigen Arten zeichnen Rauch, Flamme, Tropfen, Frost, Funkeln.
 *
 * @param {{anzahl:number, xAn:(i:number)=>number, yAn:(i:number)=>number}} ring
 * @param {number} zeit - Sekunden (Flackern), steht bei reduzierter Bewegung
 */
export function zeichneFamilienSchweif(ctx, ring, art, farbe, breite, zeit = 0, reduziert = false) {
  const n = ring.anzahl;
  if (n < 2) return;
  if (art === 'linie' || !art) { zeichneSchweif(ctx, ring, farbe, breite); return; }
  if (art === 'duenn') { zeichneSchweif(ctx, ring, farbe, breite * 0.5); return; }
  const takt = reduziert ? 0 : Math.floor(zeit * 30);
  ctx.save();
  ctx.lineCap = 'round';
  if (art === 'leuchtspur') {
    ctx.strokeStyle = '#fff3c4';
    for (let i = 1; i < n; i += 1) {
      const anteil = i / (n - 1);
      ctx.globalAlpha = 0.9 * anteil * anteil;
      ctx.lineWidth = Math.max(1, breite * 0.4);
      ctx.beginPath();
      ctx.moveTo(ring.xAn(i - 1), ring.yAn(i - 1));
      ctx.lineTo(ring.xAn(i), ring.yAn(i));
      ctx.stroke();
    }
    ctx.restore();
    return;
  }
  for (let i = 0; i < n; i += 1) {
    const anteil = n > 1 ? i / (n - 1) : 1; // 0 = ältester Punkt, 1 = am Geschoss
    const x = ring.xAn(i);
    const y = ring.yAn(i);
    const h = hash2(Math.round(x), Math.round(y), i);
    switch (art) {
      case 'rauch': {
        // Graue Ballen, die nach hinten wachsen und verblassen; vorn ein Flammenkern.
        ctx.globalAlpha = 0.08 + 0.4 * anteil;
        ctx.fillStyle = anteil > 0.75 ? '#ffb347' : '#b8b4bc';
        ctx.beginPath();
        ctx.arc(x, y, breite * (0.35 + (1 - anteil) * 0.9) * (0.85 + 0.3 * h), 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'staub': {
        ctx.globalAlpha = 0.5 * anteil;
        ctx.fillStyle = '#9a8670';
        ctx.beginPath();
        ctx.arc(x + (h - 0.5) * breite, y + (1 - anteil) * 3, 0.8 + breite * 0.18, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'flamme': {
        ctx.globalCompositeOperation = 'lighter';
        const fl = hash2(i, takt, 41);
        ctx.globalAlpha = (0.15 + 0.6 * anteil) * (0.75 + 0.25 * fl);
        ctx.fillStyle = anteil > 0.6 ? '#ffd166' : anteil > 0.3 ? '#ff8c1a' : '#d9480f';
        ctx.beginPath();
        ctx.arc(x, y - (1 - anteil) * 3, breite * (0.25 + 0.6 * anteil) * (0.8 + 0.4 * fl), 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'tropfen': {
        if (i % 2 === 1 && i !== n - 1) break;
        ctx.globalAlpha = 0.2 + 0.7 * anteil;
        ctx.fillStyle = farbe;
        ctx.beginPath();
        ctx.arc(x + (h - 0.5) * breite * 0.6, y + (1 - anteil) * 6, Math.max(0.8, breite * 0.22 * (0.6 + anteil)), 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'frost': {
        ctx.globalAlpha = 0.15 + 0.75 * anteil;
        ctx.fillStyle = i % 2 ? '#e6fbff' : '#8fdcff';
        ctx.strokeStyle = '#3fa9f5';
        ctx.lineWidth = 0.6;
        raute(ctx, x, y, Math.max(1.2, breite * 0.3 * (0.5 + anteil)), (h + takt * 0.05) * Math.PI);
        break;
      }
      default: {
        // funkeln: Linie in der Blitzfarbe, dazu kleine Sterne, die sich drehen.
        if (i > 0) {
          ctx.globalAlpha = 0.1 + 0.5 * anteil;
          ctx.strokeStyle = farbe;
          ctx.lineWidth = breite * (0.2 + 0.6 * anteil);
          ctx.beginPath();
          ctx.moveTo(ring.xAn(i - 1), ring.yAn(i - 1));
          ctx.lineTo(x, y);
          ctx.stroke();
        }
        if (i % 2 === 0) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 0.25 + 0.6 * anteil * (0.6 + 0.4 * hash2(i, takt, 43));
          ctx.fillStyle = '#ffffff';
          const q = (h - 0.5) * breite * 1.4;
          stern4(ctx, x + q, y - q * 0.6, Math.max(1, breite * 0.35 * (0.4 + anteil)));
          ctx.restore();
        }
      }
    }
  }
  ctx.restore();
}

/** Bisheriger Kegel der Fallback-Figur (ohne Sheet): Verlauf in `farbe`, heller Kern. */
function zeichneKegel(ctx, x, y, winkel, feuer, sk, farbe) {
  ctx.save();
  ctx.globalAlpha = feuer.alpha;
  ctx.translate(x, y);
  ctx.rotate(-winkel);
  const verlauf = ctx.createLinearGradient(0, 0, feuer.length * sk, 0);
  verlauf.addColorStop(0, farbe);
  verlauf.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = verlauf;
  ctx.beginPath();
  ctx.moveTo(0, -feuer.halfWidth * sk);
  ctx.lineTo(feuer.length * sk, 0);
  ctx.lineTo(0, feuer.halfWidth * sk);
  ctx.closePath();
  ctx.fill();
  // Heller Kern an der Mündung: ohne ihn wirkt der Kegel flach.
  ctx.fillStyle = '#fffbe6';
  ctx.beginPath();
  ctx.arc(0, 0, feuer.coreRadius * sk, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Mündungsfeuer einer Figur nach ihrer Waffe (N-07): Bildfolge (Zeile und Größe je Waffe), eine
 * gezeichnete Blitzform in der Familienfarbe, oder nichts (Nahkampf, Bogen, Wurf). Ein Waffen-Sprite
 * bringt seine Blitzform selbst mit (`figuren.js`); dann zeichnet hier nur das Sheet. Ohne Bild
 * (oder bei reduzierter Bewegung) bleibt für Figuren ohne Sprite der bisherige Kegel.
 *
 * @param {object} o - `x`, `y` (Mündung), `winkel`, `leben` (1 → 0), `skala` (Figur), `feuer`
 *   (`weaponAnimation.muendungsfeuer`), `farbe` (Kegelfarbe), `spriteWaffe`, `waffe` (Katalog oder null)
 * @returns {string} was gezeichnet wurde: `sheet`, `form`, `kegel` oder `keins` (Diagnose)
 */
export function zeichneMuendungsfeuer(ctx, sheets, o) {
  const sp = o.waffe ? holeWaffenSprite(o.waffe) : null;
  const stil = muendungsStil(o.waffe, o.waffe ? parameterFuerWaffe(o.waffe, sp) : null);
  if (!stil) return 'keins';
  if (stil.quelle === 'sheet') {
    if (sheets?.zeichneMuendung(ctx, o.x, o.y, o.winkel, o.leben, stil.zeile, o.skala * stil.skala)) return 'sheet';
  } else if (!o.spriteWaffe) {
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.rotate(-o.winkel);
    zeichneMuendungsblitz(ctx, stil.form, stil.groesse * o.skala, Math.max(0, Math.min(1, o.leben)), stil.farbe);
    ctx.restore();
    return 'form';
  } else {
    return 'keins';
  }
  if (o.spriteWaffe) return 'keins';
  zeichneKegel(ctx, o.x, o.y, o.winkel, o.feuer, o.skala, o.farbe);
  return 'kegel';
}
