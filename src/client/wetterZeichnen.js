/**
 * Zeichnen der Wetterarten — reine Darstellung, Zufall nur als feste Funktion von Zeit und Platznummer (`hash2`).
 *
 * Bildschirmschichten (Koordinaten wie das Fenster): Nebel, Sonne, Sturmhimmel, Regen, Schnee, Hagel, Windteilchen.
 * Weltschichten (Kartenkoordinaten, innerhalb der Kamera): Spritzer, Hagelaufprall, Schneedecke, Pfützen.
 * Jede Funktion bekommt die Stärke 0 bis 1 aus dem weich überblendeten Zustand (`wetterZustand.js`); bei 0 kostet sie nichts.
 * Teilchen eines Layers werden in EINEM Pfad gesammelt und mit einem Aufruf gezeichnet.
 *
 * @module wetterZeichnen
 */
import { hash2 } from './stil.js';
import { waehleOberflaeche, schneeLaeufe } from './wetterOberflaeche.js';

// Schnee und Hagel (Luft und Aufprall) leben in `wetterNiederschlag.js`; hier nur durchgereicht, damit die Aufrufer gleich bleiben.
export { zeichneSchnee, zeichneHagelLuft, zeichneHagelAufprall } from './wetterNiederschlag.js';

const ZWEI_PI = Math.PI * 2;

/** Tragende Werte eines Bildes. `schraeg`: Neigung der Fallbahnen (positiv = nach rechts), `boe`: Böenfaktor. */
export function bildWerte(r, z, boeWert, richtung, spielStaerke) {
  const b = r.width;
  const still = Boolean(r.reducedMotion);
  const wind = Math.max(z.wind, 0.8 * z.sturm * 0.75);
  return {
    ctx: r.ctx, b, h: r.height, t: (r.time ?? 0) / 60, m: b / 1920, still,
    richtung, boe: boeWert,
    schraeg: richtung * (0.07 + 0.4 * wind * boeWert + 0.12 * spielStaerke),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Wolken-/Nebeltextur: einmal aus Wertrauschen (fbm, in x nahtlos) gerechnet, je Farbe zwischengespeichert.
// ---------------------------------------------------------------------------------------------------------------
const TEX_B = 256;
const TEX_H = 96;
const texturen = new Map();

function rauschen(x, y, periode, saat) {
  const xi = Math.floor(x); const yi = Math.floor(y);
  const fx = x - xi; const fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx); const sy = fy * fy * (3 - 2 * fy);
  const w = i => ((i % periode) + periode) % periode;
  const a = hash2(w(xi), yi, saat); const bb = hash2(w(xi + 1), yi, saat);
  const c = hash2(w(xi), yi + 1, saat); const d = hash2(w(xi + 1), yi + 1, saat);
  return (a + (bb - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
}

/** Wertetabelle der Textur (0 bis 1), rein rechnerisch, ohne Canvas (testbar). */
export function baueTexturWerte(breite = TEX_B, hoehe = TEX_H) {
  const w = new Float32Array(breite * hoehe);
  for (let y = 0; y < hoehe; y += 1) {
    const rand = Math.sin((y / (hoehe - 1)) * Math.PI); // oben und unten weich auslaufend
    for (let x = 0; x < breite; x += 1) {
      let v = 0; let amp = 0.55; let summe = 0;
      for (let o = 0; o < 4; o += 1) {
        const f = 4 << o; // Gitterpunkte über die Breite
        v += amp * rauschen((x / breite) * f, (y / hoehe) * f * 0.5, f, 19 + o);
        summe += amp; amp *= 0.5;
      }
      v = v / summe;
      w[y * breite + x] = Math.max(0, Math.min(1, ((v - 0.38) / 0.4) * rand));
    }
  }
  return w;
}

/** Textur als Canvas in der Farbe `rgb` (oder `null` ohne `document`). */
export function texturBild(art, rgb) {
  if (typeof document === 'undefined') return null;
  if (texturen.has(art)) return texturen.get(art);
  let bild = null;
  try {
    const c = document.createElement('canvas');
    c.width = TEX_B; c.height = TEX_H;
    const cx = c.getContext('2d');
    const daten = cx.createImageData(TEX_B, TEX_H);
    const w = baueTexturWerte();
    for (let i = 0; i < w.length; i += 1) {
      daten.data[i * 4] = rgb[0]; daten.data[i * 4 + 1] = rgb[1]; daten.data[i * 4 + 2] = rgb[2];
      daten.data[i * 4 + 3] = Math.round(255 * w[i]);
    }
    cx.putImageData(daten, 0, 0);
    bild = c;
  } catch { bild = null; }
  texturen.set(art, bild);
  return bild;
}

/** Eine Texturebene waagerecht gekachelt und treibend: Mitte `y`, Höhe `hoch`, Geschwindigkeit `tempo` (px/s). */
function ebene(ctx, bild, b, y, hoch, tempo, t, versatz, alpha) {
  const breite = hoch * (TEX_B / TEX_H) * 1.6;
  const x0 = -(((t * tempo + versatz) % breite) + breite) % breite;
  ctx.globalAlpha = alpha;
  for (let x = x0; x < b; x += breite) ctx.drawImage(bild, x, y - hoch / 2, breite + 1, hoch);
}

// ---------------------------------------------------------------------------------------------------------------
// Bildschirmschichten
// ---------------------------------------------------------------------------------------------------------------

/** Nebel HINTEN (hinter dem Gelände): zwei Bänke mit Parallaxe. Ohne Textur (Tests) weiche Ellipsen. */
export function zeichneNebelHinten(p, st) {
  if (!(st > 0.01)) return;
  const { ctx, b, h, t, still, richtung } = p;
  ctx.save();
  const bild = texturBild('nebel', [214, 224, 232]);
  for (let k = 0; k < 2; k += 1) {
    const y = h * (0.46 + k * 0.14);
    const tempo = still ? 0 : (6 + k * 5) * richtung;
    if (bild) {
      ebene(ctx, bild, b, y, h * (0.34 + k * 0.05), tempo, t, hash2(k, 1, 9) * 900, Math.min(1, (0.36 + k * 0.1) * st));
    } else {
      ctx.fillStyle = `rgba(190, 200, 210, ${0.17 * st})`;
      ctx.beginPath();
      ctx.ellipse(b * (0.3 + k * 0.3), y, b * 0.34, h * 0.07, 0, 0, ZWEI_PI);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** Nebel VORN: Dunstschleier (Kontrast sinkt zur Ferne hin) und eine treibende Bank vor dem Geschehen. */
export function zeichneNebelVorn(p, st) {
  if (!(st > 0.01)) return;
  const { ctx, b, h, t, still, richtung } = p;
  ctx.save();
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, `rgba(196, 208, 218, ${0.08 * st})`);
  g.addColorStop(0.55, `rgba(200, 211, 220, ${0.2 * st})`);
  g.addColorStop(1, `rgba(190, 202, 212, ${0.1 * st})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, b, h);
  const bild = texturBild('nebel', [214, 224, 232]);
  if (bild) ebene(ctx, bild, b, h * 0.74, h * 0.4, still ? 0 : 14 * richtung, t, 400, 0.26 * st);
  ctx.restore();
}

/** Das stehende Sonnenbild (Schein, weiche Lichtbahnen, Linsenreflexe, warme Tönung) auf `ctx` in Bildgröße `b`×`h`. */
function malSonne(ctx, b, h, m, dichte) {
  const sx = b * 0.16; const sy = -h * 0.06;
  const glanz = ctx.createRadialGradient(sx, sy, 0, sx, sy, b * 0.46);
  glanz.addColorStop(0, 'rgba(255, 240, 196, 0.42)');
  glanz.addColorStop(0.18, 'rgba(255, 230, 170, 0.2)');
  glanz.addColorStop(0.5, 'rgba(255, 222, 156, 0.07)');
  glanz.addColorStop(1, 'rgba(255, 220, 150, 0)');
  ctx.fillStyle = glanz;
  ctx.fillRect(0, 0, b, h);
  // Lichtbahnen: viele breite, sehr blasse Keile, die sich überlagern, dann sind die Ränder weich (keine harten Bänder).
  const bahnen = dichte < 1 ? 7 : 11;
  const laenge = b * 1.5;
  for (let i = 0; i < bahnen; i += 1) {
    const winkel = 0.22 + i * (1.05 / bahnen) + (hash2(i, 6, 12) - 0.5) * 0.05;
    const breite = (0.05 + hash2(i, 1, 12) * 0.07) * b;
    const ex = sx + Math.cos(winkel) * laenge; const ey = sy + Math.sin(winkel) * laenge;
    const g = ctx.createLinearGradient(sx, sy, ex, ey);
    g.addColorStop(0, `rgba(255, 244, 210, ${0.075 + 0.04 * hash2(i, 7, 12)})`);
    g.addColorStop(0.45, 'rgba(255, 240, 200, 0.03)');
    g.addColorStop(1, 'rgba(255, 238, 195, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex - Math.sin(winkel) * breite, ey + Math.cos(winkel) * breite);
    ctx.lineTo(ex + Math.sin(winkel) * breite, ey - Math.cos(winkel) * breite);
    ctx.closePath();
    ctx.fill();
  }
  // Linsenreflexe: weiche Scheiben auf der Achse Sonne–Bildmitte.
  const mx = b / 2; const my = h / 2;
  for (let i = 0; i < 4; i += 1) {
    const f = 0.35 + i * 0.28;
    const x = sx + (mx - sx) * f * 1.6; const y = sy + (my - sy) * f * 1.6;
    const rad = (14 + hash2(i, 2, 12) * 26) * m;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, 'rgba(255, 226, 170, 0.1)');
    g.addColorStop(0.8, 'rgba(255, 210, 150, 0.05)');
    g.addColorStop(1, 'rgba(255, 210, 150, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, ZWEI_PI);
    ctx.fill();
  }
  // Warme Tönung (additiv, schwach): ersetzt einen teuren Mischmodus über der ganzen Fläche.
  ctx.fillStyle = 'rgba(70, 48, 18, 0.07)';
  ctx.fillRect(0, 0, b, h);
}

const sonnenBilder = new Map();

/**
 * Sonne: Schein mit Korona, weiche Lichtbahnen, Linsenreflexe, warme Tönung — als stehendes Bild in halber Auflösung einmal
 * gemalt und je Bild nur aufgelegt (Stärke und leises Atmen über die Deckkraft) — plus Staubflimmern im Licht.
 * Ohne `document` (Tests) wird direkt gezeichnet. Reduzierte Bewegung: kein Atmen, kein Treiben.
 */
export function zeichneSonne(p, st, dichte = 1) {
  if (!(st > 0.01)) return;
  const { ctx, b, h, t, still, m } = p;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const schluessel = `${Math.round(b)}x${Math.round(h)}:${dichte < 1 ? 1 : 0}`;
  let bild = sonnenBilder.get(schluessel);
  if (bild === undefined && typeof document !== 'undefined') {
    try {
      const c = document.createElement('canvas');
      c.width = Math.max(2, Math.ceil(b / 2)); c.height = Math.max(2, Math.ceil(h / 2));
      const cx = c.getContext('2d');
      cx.scale(0.5, 0.5);
      malSonne(cx, b, h, m, dichte);
      bild = c;
    } catch { bild = null; }
    if (sonnenBilder.size > 6) sonnenBilder.clear();
    sonnenBilder.set(schluessel, bild);
  }
  const atem = still ? 1 : 0.9 + 0.1 * Math.sin(t * 0.32);
  if (bild) {
    ctx.globalAlpha = Math.min(1, st * atem);
    ctx.drawImage(bild, 0, 0, b, h);
  } else {
    ctx.globalAlpha = Math.min(1, st * atem);
    malSonne(ctx, b, h, m, dichte);
  }
  // Staub im Licht: wenige Körnchen, die langsam treiben und glimmen.
  const staub = Math.round(36 * dichte * st);
  ctx.fillStyle = 'rgba(255, 240, 200, 0.5)';
  for (let i = 0; i < staub; i += 1) {
    const x = ((hash2(i, 1, 13) * b + (still ? 0 : t * (5 + hash2(i, 2, 13) * 7))) % b);
    const y = hash2(i, 3, 13) * h * 0.7 + (still ? 0 : Math.sin(t * 0.5 + i) * 10 * m);
    const glimmer = still ? 0.7 : 0.4 + 0.6 * Math.abs(Math.sin(t * (0.6 + hash2(i, 4, 13)) + i));
    ctx.globalAlpha = glimmer * 0.55 * st;
    ctx.fillRect(x, y, 2 * m, 2 * m);
  }
  ctx.restore();
}

/** Sturmhimmel: Abdunkelung von oben, dunkle Wolkenbänder, die mit dem Wind ziehen. */
export function zeichneSturmHimmel(p, st) {
  if (!(st > 0.01)) return;
  const { ctx, b, h, t, still, richtung, boe } = p;
  ctx.save();
  const g = ctx.createLinearGradient(0, 0, 0, h * 0.75);
  g.addColorStop(0, `rgba(18, 24, 38, ${0.5 * st})`);
  g.addColorStop(1, 'rgba(18, 24, 38, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, b, h);
  const bild = texturBild('sturm', [38, 44, 58]);
  if (bild) {
    ebene(ctx, bild, b, h * 0.1, h * 0.36, still ? 0 : 38 * richtung * boe, t, 0, 0.8 * st);
    ebene(ctx, bild, b, h * 0.24, h * 0.3, still ? 0 : 22 * richtung * boe, t, 520, 0.5 * st);
  }
  ctx.restore();
}

/** Regen in zwei Tiefen: viele feine ferne Striche, weniger nahe, längere. Dichte skaliert beide. */
export function zeichneRegen(p, st, dichte = 1) {
  if (!(st > 0.01) || p.still) return;
  const { ctx, b, h, t, m, schraeg } = p;
  ctx.save();
  ctx.lineCap = 'round';
  const lagen = [
    { n: 190, tempo: 0.95, laenge: 12, breite: 1.1, alpha: 0.15, salz: 3 },
    { n: 80, tempo: 1.5, laenge: 26, breite: 2.0, alpha: 0.24, salz: 5 },
  ];
  for (const lage of lagen) {
    const n = Math.round(lage.n * st * dichte);
    if (n <= 0) continue;
    ctx.strokeStyle = `rgba(196, 210, 230, ${lage.alpha + 0.12 * st})`;
    ctx.lineWidth = lage.breite * m;
    ctx.beginPath();
    for (let i = 0; i < n; i += 1) {
      const lauf = 0.7 + hash2(i, 1, lage.salz) * 0.3;
      const y = (hash2(i, 2, lage.salz) * h + t * h * lage.tempo * (0.9 + 0.5 * st) * lauf) % (h + 60 * m) - 30 * m;
      const x = hash2(i, 4, lage.salz) * (b + 240 * m) - 120 * m + y * schraeg * -1;
      const l = (lage.laenge + 12 * st) * m * lauf;
      ctx.moveTo(x, y);
      ctx.lineTo(x + l * schraeg, y + l);
    }
    ctx.stroke();
  }
  ctx.restore();
}

const WIND_TOENE = Object.freeze({
  staub: ['rgba(214, 204, 186, ', 'rgba(150, 168, 120, '],
  sand: ['rgba(226, 192, 130, ', 'rgba(204, 164, 104, '],
  asche: ['rgba(120, 118, 120, ', 'rgba(70, 66, 70, '],
});

/**
 * Wind sichtbar: lange, leicht geschwungene Luftstriche und Treibgut (Staub, Blätter, Sand oder Asche), das wirbelt.
 * Reduzierte Bewegung: nichts (Wind ist Bewegung).
 */
export function zeichneWind(p, st, ton = 'staub', dichte = 1) {
  if (!(st > 0.01) || p.still) return;
  const { ctx, b, h, t, m, richtung, boe } = p;
  const farben = WIND_TOENE[ton] ?? WIND_TOENE.staub;
  ctx.save();
  // Luftstriche.
  const ns = Math.round(40 * st * dichte);
  ctx.lineCap = 'round';
  ctx.strokeStyle = `rgba(236, 242, 248, ${0.2 + 0.14 * st})`;
  ctx.lineWidth = 2 * m;
  ctx.beginPath();
  for (let i = 0; i < ns; i += 1) {
    const tempo = (520 + hash2(i, 1, 15) * 700) * boe * (0.6 + 0.6 * st);
    const laenge = (70 + hash2(i, 2, 15) * 150) * m;
    const lauf = (hash2(i, 3, 15) * (b + 600 * m) + t * tempo * m) % (b + 600 * m);
    const x = richtung > 0 ? lauf - 300 * m : b + 300 * m - lauf;
    const y = hash2(i, 4, 15) * h * 0.85 + Math.sin(t * 0.8 + i) * 14 * m;
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x - richtung * laenge * 0.5, y + (hash2(i, 5, 15) - 0.4) * 16 * m, x - richtung * laenge, y + Math.sin(t + i) * 6 * m);
  }
  ctx.stroke();
  // Treibgut: kleine drehende Flecken.
  const nt = Math.round(64 * st * dichte);
  for (let i = 0; i < nt; i += 1) {
    const tempo = (260 + hash2(i, 6, 15) * 520) * boe * (0.5 + 0.7 * st);
    const lauf = (hash2(i, 7, 15) * (b + 200 * m) + t * tempo * m) % (b + 200 * m);
    const x = richtung > 0 ? lauf - 100 * m : b + 100 * m - lauf;
    const y = hash2(i, 8, 15) * h * 0.9 + Math.sin(t * (1.2 + hash2(i, 9, 15)) + i * 2) * 26 * m;
    const dreh = t * (2 + hash2(i, 10, 15) * 4) + i;
    const gross = (2.2 + hash2(i, 11, 15) * 3.4) * m;
    ctx.fillStyle = `${farben[i % 5 === 0 ? 1 : 0]}${0.55 + 0.3 * hash2(i, 12, 15)})`;
    ctx.beginPath();
    ctx.ellipse(x, y, gross * 1.7, gross * 0.8, dreh, 0, ZWEI_PI);
    ctx.fill();
  }
  if (ton === 'sand' || ton === 'asche') {
    ctx.fillStyle = ton === 'sand' ? `rgba(204, 160, 96, ${0.2 * st})` : `rgba(90, 86, 90, ${0.2 * st})`;
    ctx.fillRect(0, 0, b, h);
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------------------------------------------
// Weltschichten (Kartenkoordinaten)
// ---------------------------------------------------------------------------------------------------------------

/**
 * Regenspritzer an ALLEN erfassten Oberflächen im Ausschnitt: auf offenen Flächen Krönchen, in Höhlen und unter Vorsprüngen
 * kleine Tropfen von der Decke.
 * @param {object} ob Oberflächen (`wetterOberflaeche`)
 * @param {{x0:number,x1:number,y0:number,y1:number}} sicht
 */
export function zeichneSpritzer(ctx, ob, sicht, t, st, dichte = 1, schraeg = 0) {
  const anzahl = Math.round(40 * st * dichte);
  if (anzahl <= 0 || !ob) return;
  ctx.save();
  ctx.fillStyle = 'rgba(205, 222, 245, 0.75)';
  ctx.strokeStyle = 'rgba(205, 222, 245, 0.5)';
  ctx.lineWidth = 1;
  const periode = 0.32;
  for (let i = 0; i < anzahl; i += 1) {
    const takt = Math.floor(t / periode + hash2(i, 1, 41));
    const ph = (t / periode + hash2(i, 1, 41)) - takt;
    const o = waehleOberflaeche(ob, hash2(i, takt, 42), hash2(i, takt, 43), sicht);
    if (!o) continue;
    const klein = o.offen ? 1 : 0.6;
    const hoehe = (6 + 9 * Math.sin(Math.PI * Math.min(1, ph * 1.4))) * klein;
    ctx.globalAlpha = (1 - ph) * (o.offen ? 1 : 0.8);
    for (let d = -1; d <= 1; d += 1) {
      ctx.beginPath();
      ctx.arc(o.x + d * ph * 9 * klein + schraeg * ph * 6, o.y - hoehe * (1 - Math.abs(d) * 0.35) + ph * ph * 7, 1.7 * klein, 0, ZWEI_PI);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.ellipse(o.x, o.y, ph * 9 * klein, ph * 2.2 * klein, 0, 0, ZWEI_PI);
    ctx.stroke();
    if (!o.offen && ph < 0.4) {
      // Tropfen fällt von der Decke auf die Fläche.
      ctx.fillRect(o.x - 0.6, o.y - 14 + ph * 35, 1.2, 4);
    }
  }
  ctx.restore();
}

/**
 * Schneedecke auf den offenen Oberflächen: Dicke wächst mit `hoehe` (0 bis 1), haftet an flachen Stellen, dünnt an Hängen aus,
 * fehlt an Wänden und frisch gesprengten Kratern (die Oberfläche wird dort neu erfasst). Von innen leicht bläulich schattiert.
 * @param {number} hoehe 0 bis 1
 */
export function zeichneSchneeDecke(ctx, ob, sicht, hoehe) {
  if (!ob || !(hoehe > 0.01)) return;
  const laeufe = schneeLaeufe(ob, sicht.x0 - 12, sicht.x1 + 12);
  if (laeufe.length === 0) return;
  ctx.save();
  const dicke = 1.4 + 5.4 * hoehe;
  for (const lauf of laeufe) {
    const oben = []; const unten = [];
    for (const pt of lauf) {
      const klumpen = 0.75 + 0.5 * hash2(Math.round(pt.x / 6), 3, 71);
      const d = dicke * pt.st * klumpen;
      oben.push([pt.x, pt.y - d * 0.75]);
      unten.push([pt.x, pt.y + d * 0.45]);
    }
    ctx.beginPath();
    ctx.moveTo(oben[0][0], oben[0][1]);
    for (let i = 1; i < oben.length; i += 1) ctx.lineTo(oben[i][0], oben[i][1]);
    for (let i = unten.length - 1; i >= 0; i -= 1) ctx.lineTo(unten[i][0], unten[i][1]);
    ctx.closePath();
    ctx.fillStyle = 'rgba(244, 249, 255, 0.96)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(150, 176, 214, 0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(unten[0][0], unten[0][1]);
    for (let i = 1; i < unten.length; i += 1) ctx.lineTo(unten[i][0], unten[i][1]);
    ctx.stroke();
  }
  ctx.restore();
}

/** Pfützen: dunkle spiegelnde Ellipse mit Rand und ausbreitenden Ringen. */
export function zeichnePfuetzen(ctx, pfuetzen, sicht, t, st) {
  if (!(st >= 0.3) || !pfuetzen?.length) return;
  ctx.save();
  pfuetzen.forEach((p, i) => {
    if (p.x + p.b < sicht.x0 || p.x - p.b > sicht.x1 || p.y < sicht.y0 - 20 || p.y > sicht.y1 + 20) return;
    const tief = Math.min(1, st * 1.2);
    ctx.fillStyle = `rgba(52, 70, 98, ${0.5 * tief})`;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 1.5, p.b / 2, 3.2, 0, 0, ZWEI_PI);
    ctx.fill();
    ctx.strokeStyle = `rgba(190, 215, 245, ${0.35 * tief})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 1.5, p.b / 2, 3.2, 0, Math.PI * 1.05, Math.PI * 1.95);
    ctx.stroke();
    for (let n = 0; n < 2; n += 1) {
      const ph = ((t * (0.8 + 0.3 * n) + hash2(i, n, 31) * 3) % 1);
      ctx.strokeStyle = `rgba(210, 228, 250, ${0.4 * (1 - ph) * tief})`;
      ctx.beginPath();
      ctx.ellipse(p.x + (hash2(i, n + 5, 31) - 0.5) * p.b * 0.5, p.y + 1.5, 2 + ph * p.b * 0.22, 0.6 + ph * 1.5, 0, 0, ZWEI_PI);
      ctx.stroke();
    }
  });
  ctx.restore();
}
