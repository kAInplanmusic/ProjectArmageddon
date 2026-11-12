/**
 * Kartengenerator „Komposition": Karten aus Bauteilen statt aus einem Höhenfeld.
 *
 * Das Höhenfeld (`terrainGen3`) kennt je Spalte eine Oberfläche; schwebende
 * Massen, Überhänge, Tunnel und Räume sind damit nicht darstellbar. Hier
 * beschreibt je Kartenart ein Dichtefeld (große Formen plus mehrstufiges
 * Rauschen von 600 bis 40 px) die Landmassen; Tunnel, Kammern, Brücken und
 * Burgruinen kommen als Bauteile dazu. Planet, „Unmögliches“ und Pyramide
 * bauen noch aus Rechtecken und Ellipsen.
 *
 * Reiner Seed-Zufall (`rng.next()`), kein `Math.random`. Diese Fassung liefert
 * nur die Maske; Stoffe kommen später aus dem Biom-Rezept.
 */

/** Weicher 1D-Rauschwert in [-1, 1] aus einem Seed-Feld. */
function baueRauschen(rng, laenge, welle) {
  const n = Math.ceil(laenge / welle) + 2;
  const werte = Array.from({ length: n }, () => rng.next() * 2 - 1);
  return (x) => {
    const t = Math.max(0, x) / welle;
    const i = Math.floor(t);
    const f = (1 - Math.cos((t - i) * Math.PI)) / 2;
    return werte[i] * (1 - f) + werte[Math.min(i + 1, n - 1)] * f;
  };
}

function zwischen(rng, a, b) {
  return a + rng.next() * (b - a);
}

class Maske {
  constructor(breite, hoehe) {
    this.breite = breite;
    this.hoehe = hoehe;
    this.bitmap = new Uint8Array(breite * hoehe);
    /** Rechts hinaus, links hinein: Spalten außerhalb laufen modulo der Breite um. */
    this.umlauf = false;
    this.rund = false;
    this.planetenart = null;
    /** Ab Geländefassung 8: Ruinen mit Schutthalden und begehbarer Krone (`ruine`). */
    this.begehbar = false;
  }

  spalte(x) {
    if (this.umlauf) return ((x % this.breite) + this.breite) % this.breite;
    return x >= 0 && x < this.breite ? x : -1;
  }

  setze(x, y, wert) {
    if (x < 0 || y < 0 || x >= this.breite || y >= this.hoehe) return;
    this.bitmap[y * this.breite + x] = wert;
  }

  rechteck(x0, y0, x1, y1, wert = 1) {
    const xa = Math.floor(x0);
    const xb = Math.ceil(x1);
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(this.hoehe, Math.ceil(y1)); y += 1) {
      for (let x = xa; x < xb; x += 1) {
        const c = this.spalte(x);
        if (c >= 0) this.bitmap[y * this.breite + c] = wert;
      }
    }
  }

  ellipse(cx, cy, rx, ry, wert = 1) {
    for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(this.hoehe - 1, Math.ceil(cy + ry)); y += 1) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x += 1) {
        const u = (x - cx) / rx;
        const v = (y - cy) / ry;
        if (u * u + v * v > 1) continue;
        const c = this.spalte(x);
        if (c >= 0) this.bitmap[y * this.breite + c] = wert;
      }
    }
  }
}

/**
 * Eine Platte: Oberkante wellig, Unterkante zerklüftet mit Zapfen, Enden gerundet.
 * @returns {{x0:number,x1:number,obenY:(x:number)=>number,untenY:(x:number)=>number}}
 */
function platte(maske, rng, x0, x1, yMitte, dicke) {
  const lang = x1 - x0;
  const welleO = baueRauschen(rng, lang + 4, zwischen(rng, 60, 140));
  const welleU = baueRauschen(rng, lang + 4, zwischen(rng, 30, 70));
  const zapfen = baueRauschen(rng, lang + 4, zwischen(rng, 14, 28));
  const lokal = (x) => Math.min(lang, Math.max(0, x - x0));
  const obenY = (x) => yMitte + welleO(lokal(x)) * dicke * 0.18;
  const untenY = (x) => yMitte + dicke * (0.7 + 0.25 * welleU(lokal(x)) + 0.35 * Math.max(0, zapfen(lokal(x))) ** 2);
  for (let x = Math.floor(x0); x < Math.ceil(x1); x += 1) {
    // Enden verjüngen sich zur Rundung.
    const rand = Math.min(x - x0, x1 - x) / Math.max(1, Math.min(lang * 0.5, dicke * 1.4));
    const rund = rand >= 1 ? 1 : Math.sqrt(Math.max(0, 1 - (1 - rand) ** 2));
    const o = obenY(x);
    const u = o + (untenY(x) - o) * rund;
    maske.rechteck(x, o + (1 - rund) * dicke * 0.3, x + 1, u);
  }
  return { x0, x1, obenY, untenY };
}

function turm(maske, rng, x, bodenY, breite, hoehe) {
  maske.rechteck(x, bodenY - hoehe, x + breite, bodenY);
  // Innenraum mit Tür unten und Fensterschlitzen.
  const wand = Math.max(12, breite * 0.2);
  maske.rechteck(x + wand, bodenY - hoehe + wand * 1.5, x + breite - wand, bodenY - wand * 0.5, 0);
  maske.rechteck(x + breite * 0.4, bodenY - 44, x + breite * 0.4 + 26, bodenY, 0);
  const stufen = Math.max(0, Math.floor(hoehe / 70) - 1);
  for (let i = 1; i <= stufen; i += 1) {
    const y = bodenY - i * 70;
    maske.rechteck(x + wand, y, x + breite - wand, y + 8); // Zwischenboden
    maske.rechteck(x + breite - wand - 1, y - 38, x + breite, y - 14, 0); // Fenster
  }
  // Zinnen.
  for (let z = x; z < x + breite; z += 16) maske.rechteck(z, bodenY - hoehe - 10, z + 8, bodenY - hoehe);
  void rng;
}

function bogen(maske, x, bodenY, weite, hoehe) {
  const pfeiler = 26;
  maske.rechteck(x, bodenY - hoehe, x + pfeiler, bodenY);
  maske.rechteck(x + weite - pfeiler, bodenY - hoehe, x + weite, bodenY);
  maske.rechteck(x, bodenY - hoehe - 16, x + weite, bodenY - hoehe);
  maske.ellipse(x + weite / 2, bodenY - hoehe, (weite - 2 * pfeiler) / 2, hoehe * 0.35, 0);
  maske.rechteck(x + pfeiler, bodenY - hoehe, x + weite - pfeiler, bodenY - hoehe + 1, 0);
}

function pfeiler(maske, rng, x, yOben, yUnten, breite) {
  const welle = baueRauschen(rng, maske.hoehe, 40);
  for (let y = Math.floor(yOben); y < Math.ceil(yUnten); y += 1) {
    const b = breite * (0.8 + 0.25 * welle(y));
    maske.rechteck(x - b / 2, y, x + b / 2, y + 1);
  }
}

function bruecke(maske, x0, x1, y0, y1) {
  const n = Math.max(1, Math.round(x1 - x0));
  for (let i = 0; i < n; i += 1) {
    const t = i / n;
    const y = y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * 6;
    maske.rechteck(x0 + i, y, x0 + i + 1, y + 9);
  }
}

import { planetArtAusZug } from './config/biome-planet.js';
import { GELAENDE_WEIT_AB_BREITE } from './config/gelaende.js';

/** Die Kartenarten; der Seed zieht eine, bei Hochformat gilt `hochkant`. */
export const KARTENARTEN = Object.freeze(['ebenen', 'insel', 'inselgruppe', 'hoehle', 'hoehleInsel', 'schlucht', 'archipel', 'vulkan', 'ruinenstadt', 'pyramide', 'planet', 'unmoeglich', 'hochkant']);

function neuesStat() {
  return { platten: 0, pfeiler: 0, bruecken: 0, tuerme: 0, boegen: 0, hoehlen: 0 };
}

/** Eine Kammer mit ebenem Boden. */
function kammer(maske, cx, cy, rx, ry) {
  maske.ellipse(cx, cy, rx, ry, 0);
  maske.rechteck(cx - rx - 1, cy + ry * 0.5, cx + rx + 1, cy + ry + 2, 1);
}

/** Ein Gang von (x0,y0) nach (x1,y1) mit Radius r (ebene Kante unten). */
function gang(maske, x0, y0, x1, y1, r) {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 4);
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    maske.ellipse(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r, r * 0.8, 0);
  }
}

function bauteileAufPlatte(maske, rng, p, stat, anzahlMax = 2) {
  let gesetzt = 0;
  for (let versuch = 0; versuch < 4 && gesetzt < anzahlMax; versuch += 1) {
    if (p.x1 - p.x0 < 220) return;
    const wurf = rng.next();
    const x = zwischen(rng, p.x0 + 70, p.x1 - 150);
    const y = p.obenY(x + 40) + 2;
    if (wurf < 0.4) {
      turm(maske, rng, x, y, zwischen(rng, 70, 96), Math.min(zwischen(rng, 110, 190), y - 24));
      stat.tuerme += 1;
      gesetzt += 1;
    } else if (wurf < 0.75) {
      bogen(maske, x, y, zwischen(rng, 90, 140), Math.min(zwischen(rng, 60, 90), y - 20));
      stat.boegen += 1;
      gesetzt += 1;
    }
  }
}

/**
 * Große Stufenpyramide (etwa 60 % der Kartenbreite, gut die halbe Höhe): breite Stufen als Laufflächen, oben eine ebene Plattform.
 * Innen eine große Halle, von beiden Seiten über Gänge vom Boden aus zu betreten; Dünen davor, eine kleine zweite Pyramide daneben.
 */
function kartePyramide(maske, rng, B, H, stat) {
  const bodenY = H * 0.8;
  const duene = baueRauschen(rng, B, 160);
  for (let x = 0; x < B; x += 1) maske.rechteck(x, bodenY + duene(x) * 16, x + 1, H);
  stat.platten += 1;
  const baue = (cx, basis, stufen, sh, einzug = 0.84) => {
    for (let i = 0; i < stufen; i += 1) {
      const halb = (basis / 2) * (1 - (i / stufen) * einzug);
      const y = bodenY - (i + 1) * sh;
      maske.rechteck(cx - halb, y, cx + halb, i === 0 ? bodenY + 24 : y + sh + 2); // Sockel bis in die Dünen: kein Spalt zum Boden
    }
    return basis / 2;
  };
  const cx = B * zwischen(rng, 0.42, 0.58);
  const stufen = 8 + Math.floor(rng.next() * 2);
  const sh = H * 0.064;
  const halb = baue(cx, B * zwischen(rng, 0.56, 0.62), stufen, sh);
  // Ein Eingang: Gang vom Boden in die Halle, von dort eine Rampe zu einer Kammer auf der Gegenseite (Sackgasse). Gäbe es einen
  // zweiten Ausgang auf der anderen Seite, zerschnitte der Hohlraum den Körper vom Boden: zusammenhängende Wände bleiben Pflicht.
  const tor = rng.next() < 0.5 ? -1 : 1;
  const halleRy = sh * 1.7;
  const gangR = 26;
  const kammerRy = sh * 0.9;
  const kammerX = cx - tor * halb * 0.3;
  const kammerBoden = bodenY - sh * 3;
  kammer(maske, cx, bodenY - halleRy * 0.5, halb * 0.26, halleRy);
  gang(maske, cx + tor * (halb + 4), bodenY - gangR * 0.85, cx + tor * halb * 0.1, bodenY - gangR * 0.85, gangR);
  kammer(maske, kammerX, kammerBoden - kammerRy * 0.5, halb * 0.16, kammerRy);
  gang(maske, cx - tor * halb * 0.12, bodenY - gangR * 0.9, kammerX + tor * halb * 0.06, kammerBoden - gangR * 0.9, gangR);
  stat.hoehlen += 2;
  const kleinHalb = B * 0.09;
  const seite = cx < B / 2 ? 1 : -1;
  const kx = cx + seite * (halb + kleinHalb + 36);
  if (kx - kleinHalb > 30 && kx + kleinHalb < B - 30) baue(kx, kleinHalb * 2, 5, sh * 0.8, 0.7);
  stat.tuerme += 1;
  return Math.round(H * 0.95);
}

/** Runder Körper mit Kratern, Kernhöhle mit Schächten und kleinen Monden. */
function kartePlanet(maske, rng, B, H, stat) {
  maske.rund = true;
  // Die Art (Eis, Lava, Sand, Dschungel, Rost, Stein) zieht der Seed; Materialien folgen aus ihr.
  maske.planetenart = planetArtAusZug(rng.next());
  const cx = B * zwischen(rng, 0.46, 0.54);
  const cy = H * 0.52;
  const R = H * zwischen(rng, 0.3, 0.36);
  const wellen = [3, 5, 8, 13].map((k) => ({ k, a: zwischen(rng, 0.012, 0.035), ph: zwischen(rng, 0, Math.PI * 2) }));
  const flaeche = (w) => R * (1 + wellen.reduce((sum, f) => sum + f.a * Math.sin(f.k * w + f.ph), 0));
  for (let y = Math.floor(cy - R * 1.2); y <= cy + R * 1.2; y += 1) {
    for (let x = Math.floor(cx - R * 1.2); x <= cx + R * 1.2; x += 1) {
      if (Math.hypot(x - cx, y - cy) <= flaeche(Math.atan2(y - cy, x - cx))) maske.setze(x, y, 1);
    }
  }
  const krater = 3 + Math.floor(rng.next() * 3);
  for (let i = 0; i < krater; i += 1) {
    const w = zwischen(rng, -Math.PI * 0.9, -Math.PI * 0.1);
    const r = flaeche(w);
    maske.ellipse(cx + Math.cos(w) * r, cy + Math.sin(w) * r, zwischen(rng, 22, 46), zwischen(rng, 18, 34), 0);
  }
  maske.ellipse(cx, cy, R * 0.22, R * 0.18, 0);
  for (const w of [zwischen(rng, -2.6, -2.0), zwischen(rng, -1.1, -0.5)]) {
    gang(maske, cx, cy, cx + Math.cos(w) * R * 0.96, cy + Math.sin(w) * R * 0.96, 18);
  }
  stat.hoehlen += 3;
  const monde = 2 + Math.floor(rng.next() * 2);
  for (let i = 0; i < monde; i += 1) {
    const w = zwischen(rng, -Math.PI, 0) + (i % 2 ? 0.8 : -0.8);
    const d = R * zwischen(rng, 1.45, 1.75);
    const mx = cx + Math.cos(w) * d * 1.5;
    const my = cy + Math.sin(w) * d * 0.9;
    if (mx > 70 && mx < B - 70 && my > 70 && my < H - 120) maske.ellipse(mx, my, zwischen(rng, 38, 70), zwischen(rng, 26, 46), 1);
  }
  stat.platten += 1;
  return Math.round(H * 0.995);
}

/** Der Rand ist keiner: rechts hinaus, links hinein. Platten laufen über die Naht. */
function karteUnmoeglich(maske, rng, B, H, stat) {
  maske.umlauf = true;
  const ebenen = [];
  for (let e = 0; e < 3; e += 1) {
    const yMitte = H * (0.76 - e * 0.25) + zwischen(rng, -14, 14);
    const anzahl = 2 + Math.floor(rng.next() * 2);
    const start = zwischen(rng, 0, B);
    const platten = [];
    for (let i = 0; i < anzahl; i += 1) {
      const x0 = start + (B / anzahl) * i;
      const x1 = x0 + (B / anzahl) * zwischen(rng, 0.6, 0.85);
      platten.push(platte(maske, rng, x0, x1, yMitte, zwischen(rng, 70, 110)));
      stat.platten += 1;
    }
    ebenen.push({ yMitte, platten });
  }
  const enthaelt = (q, x) => {
    const lang = q.x1 - q.x0;
    const u = (((x - q.x0) % B) + B) % B;
    return u > 30 && u < lang - 30;
  };
  for (let e = 1; e < ebenen.length; e += 1) {
    for (const p of ebenen[e].platten) {
      const x = zwischen(rng, p.x0 + (p.x1 - p.x0) * 0.2, p.x1 - (p.x1 - p.x0) * 0.2);
      const stuetze = ebenen[e - 1].platten.find((q) => enthaelt(q, x));
      if (!stuetze) continue;
      pfeiler(maske, rng, x, p.untenY(x) - 4, ebenen[e - 1].yMitte, zwischen(rng, 34, 56));
      stat.pfeiler += 1;
    }
  }
  for (const eb of ebenen) for (const p of eb.platten) bauteileAufPlatte(maske, rng, p, stat, 1);
  return Math.round(H * 0.9);
}

/* ====================================================================
 * Dichtefeld-Karten: große, zusammenhängende Landmassen statt dünner Platten
 * ==================================================================== */

/** Weiches 2D-Wertrauschen in [-1, 1] auf einem Gitter der Zellgröße `s` Pixel. */
function rausch2(rng, B, H, s) {
  const sx = Math.ceil(B / s) + 3;
  const sy = Math.ceil(H / s) + 3;
  const g = new Float32Array(sx * sy);
  for (let i = 0; i < g.length; i += 1) g[i] = rng.next() * 2 - 1;
  return (x, y) => {
    const u = Math.max(0, x) / s;
    const v = Math.max(0, y) / s;
    const i = Math.floor(u);
    const j = Math.floor(v);
    const tu = u - i;
    const tv = v - j;
    const a = tu * tu * (3 - 2 * tu);
    const b = tv * tv * (3 - 2 * tv);
    const k = j * sx + i;
    return (g[k] * (1 - a) + g[k + 1] * a) * (1 - b) + (g[k + sx] * (1 - a) + g[k + sx + 1] * a) * b;
  };
}

/** Mehrstufiges Rauschen (Wellenlänge `basis` px, je Stufe halb so lang und halb so stark), Wert in [-1, 1]. */
function fbm2(rng, B, H, basis, stufen = 5) {
  const felder = [];
  let summe = 0;
  for (let i = 0; i < stufen; i += 1) {
    const amp = 0.5 ** i;
    felder.push({ f: rausch2(rng, B, H, Math.max(8, basis / 2 ** i)), amp });
    summe += amp;
  }
  return (x, y) => {
    let w = 0;
    for (const { f, amp } of felder) w += f(x, y) * amp;
    return w / summe;
  };
}

/** Weiche Ellipsen-„Landmasse“: positiv innen, Null am Rand (Pixelmaß `radius`); flache Oberseite, spitzer Sockel. */
function masse(cx, cy, rx, ryOben, ryUnten, radius, pOben = 2, pUnten = 2) {
  // Überellipse: Exponent 2 = Ellipse, größer = klotziger (steile Flanken), kleiner = spitzer (Kegel, Zapfen).
  return (x, y) => {
    const oben = y < cy;
    const u = Math.abs(x - cx) / rx;
    const v = Math.abs(y - cy) / (oben ? ryOben : ryUnten);
    const e = oben ? pOben : pUnten;
    return (1 - (u ** e + v ** e) ** (1 / e)) * radius;
  };
}

/** Zieht Form und Exponenten einer Insel aus dem Seed: Schüssel, Klotz oder Kegel. */
function inselForm(rng) {
  const w = rng.next();
  if (w < 0.34) return { pOben: 2, pUnten: 2 }; // Schüssel
  if (w < 0.68) return { pOben: 3.4, pUnten: 3.2 }; // Klotz mit steilen Wänden
  return { pOben: 2.6, pUnten: 1.35 }; // Kegel nach unten
}

/**
 * Wandelt ein Dichtefeld in die Maske: Raster 4 px, bilinear aufgelöst, dazu feines Rauschen (6 px) an den Kanten.
 * `d(x, y) > 0` ist fest.
 */
function ausDichte(maske, rng, d, fein = 5) {
  const B = maske.breite;
  const H = maske.hoehe;
  const G = 4;
  const gw = Math.ceil(B / G) + 2;
  const gh = Math.ceil(H / G) + 2;
  const feld = new Float32Array(gw * gh);
  for (let j = 0; j < gh; j += 1) for (let i = 0; i < gw; i += 1) feld[j * gw + i] = d(i * G, j * G);
  const Z = 11;
  const nw = Math.ceil(B / Z) + 2;
  const nh = Math.ceil(H / Z) + 2;
  const n = new Float32Array(nw * nh);
  for (let i = 0; i < n.length; i += 1) n[i] = (rng.next() - 0.5) * 2 * fein;
  const bm = maske.bitmap;
  for (let y = 0; y < H; y += 1) {
    const j = Math.floor(y / G);
    const tv = (y - j * G) / G;
    const jn = Math.floor(y / Z);
    const sv = (y - jn * Z) / Z;
    for (let x = 0; x < B; x += 1) {
      const i = Math.floor(x / G);
      const tu = (x - i * G) / G;
      const k = j * gw + i;
      const w = (feld[k] * (1 - tu) + feld[k + 1] * tu) * (1 - tv) + (feld[k + gw] * (1 - tu) + feld[k + gw + 1] * tu) * tv;
      const inx = Math.floor(x / Z);
      const su = (x - inx * Z) / Z;
      const m = jn * nw + inx;
      const r = (n[m] * (1 - su) + n[m + 1] * su) * (1 - sv) + (n[m + nw] * (1 - su) + n[m + nw + 1] * su) * sv;
      bm[y * B + x] = w + r > 0 ? 1 : 0;
    }
  }
}

/** Oberste feste Zeile einer Spalte (oder -1). */
function oben(maske, x) {
  const c = Math.max(0, Math.min(maske.breite - 1, Math.round(x)));
  for (let y = 0; y < maske.hoehe; y += 1) if (maske.bitmap[y * maske.breite + c]) return y;
  return -1;
}

/** Dicke, zerbrochene Burgruine: massiver Block, ein Raum mit Tor, schmale Fenster, gezackte Krone. */
function ruine(maske, rng, x, bodenY, breite, hoehe) {
  maske.rechteck(x, bodenY - hoehe, x + breite, bodenY + 4);
  const raumH = Math.min(100, hoehe * 0.4);
  maske.rechteck(x + 36, bodenY - raumH - 8, x + breite - 36, bodenY - 8, 0);
  maske.rechteck(x + breite * 0.4, bodenY - 84, x + breite * 0.4 + 54, bodenY + 2, 0);
  const fenster = Math.floor(hoehe / 130);
  const fensterX = x + breite * 0.5 - 12;
  // Bis Geländefassung 8 vor der Krone; ab 9 (`maske.fensterZu`) danach und nur unterhalb der Krone (siehe unten).
  if (!maske.fensterZu) {
    for (let i = 1; i <= fenster; i += 1) {
      const fy = bodenY - raumH - i * 100;
      maske.rechteck(x + breite * 0.5 - 12, fy - 54, x + breite * 0.5 + 12, fy, 0);
    }
  }
  // Ab Geländefassung 8 (`maske.begehbar`): Die Krone bröckelt nur in Stufen bis 2 px je Zinne (unter `config/bewegung.maxStufe` 3, die Füße schweben 1 px), damit eine Figur über sie
  // hinweg laufen kann (Zufall wie bisher: ein Wert je Zinne). An beiden Enden läuft sie auf volle Höhe aus, dort setzt die
  // Schutthalde an.
  let stufe = 0;
  const zinnen = Math.ceil(breite / 16);
  for (let z = x, i = 0; z < x + breite; z += 16, i += 1) {
    const ab = rng.next() * 80;
    if (maske.begehbar) {
      stufe = Math.max(stufe - 2, Math.min(stufe + 2, ab > 14 ? ab : 0, 2 * (zinnen - 1 - i)));
      if (stufe > 0) maske.rechteck(z, bodenY - hoehe - 2, z + 16, bodenY - hoehe + stufe, 0);
    } else if (ab > 14) maske.rechteck(z, bodenY - hoehe - 2, z + 16, bodenY - hoehe + ab, 0);
  }
  if (maske.fensterZu) {
    /*
     * Fenster nur unter der Krone (ab Geländefassung 9).
     *
     * FUND (belegt, 2026-11-04, Pilzwald Seed 2092081, Fassung 7 und 8): Das oberste Fenster lag bei hohen Ruinen über der
     * (gebröckelten) Krone — `hoehe` 290 gibt zwei Fenster bis 354 px über dem Fuß — und blieb als 24 px breiter, rund 40 px
     * tiefer Schacht in der Krone offen. Eine Figur, die dort startet, kommt zu Fuß nicht heraus. Ab 9 entfällt jedes Fenster,
     * dessen Oberkante nicht mindestens `FENSTER_DECKE` px unter der Krone über ihm liegt. Kein Zufall: Die Fenster ziehen
     * keine Zahl, die Folge der Zufallszahlen bleibt wie in 8.
     */
    for (let i = 1; i <= fenster; i += 1) {
      const fy = bodenY - raumH - i * 100;
      // Die tiefste Kronenzeile über der Fensterbreite; eine Spalte ganz ohne Krone (-1) heißt: das Fenster läge offen.
      let krone = 0;
      for (let sx = Math.floor(fensterX); sx <= Math.ceil(fensterX + 24); sx += 1) {
        const k = kroneUeber(maske, sx, bodenY - hoehe - 2, fy);
        krone = k < 0 ? Infinity : Math.max(krone, k);
      }
      if (fy - 54 < krone + FENSTER_DECKE) continue;
      maske.rechteck(x + breite * 0.5 - 12, fy - 54, x + breite * 0.5 + 12, fy, 0);
    }
  }
  if (maske.begehbar) schutthalden(maske, x, bodenY, breite, hoehe);
}

/** Mindestdicke der Mauer zwischen Krone und Fensteroberkante (ab Geländefassung 9). */
const FENSTER_DECKE = 12;

/** Erste feste Zeile einer Spalte zwischen `von` und `bis` (die Krone über einem Fenster), sonst -1. */
function kroneUeber(maske, x, von, bis) {
  const c = maske.spalte(x);
  if (c < 0) return -1;
  for (let y = Math.max(0, Math.round(von)); y < Math.min(maske.hoehe, bis); y += 1) if (maske.bitmap[y * maske.breite + c]) return y;
  return -1;
}

/**
 * Schutthalden an beiden Seiten einer Ruine (ab Geländefassung 8, TODO UI-8/`check:biome`): ein flacher Schuttkegel vom Fuß bis zur
 * Mauerkrone, leicht wellig. Ohne ihn war eine Ruinenstadt zu Fuß zerschnitten (Seed 1224883: 29 % der Kistenplätze erreichbar),
 * weil jeder Turm eine senkrechte Wand von 200 bis 440 px war. Kein Zufall: die Ziehung bleibt wie in Fassung 7.
 */
function schutthalden(maske, x, bodenY, breite, hoehe) {
  const laenge = hoehe * 1.8; // Neigung etwa 0,55: so flach, dass eine Figur hinaufgeht (`begehbar` in `karteStart.js` erlaubt 22 px auf 32 px)
  for (const seite of [-1, 1]) {
    const kante = seite < 0 ? x : x + breite;
    for (let d = 0; d <= laenge; d += 1) {
      const t = d / laenge;
      const oben = bodenY - hoehe + (hoehe + 6) * t + Math.sin(d * 0.06 + kante) * 3 * t * (1 - t);
      const sx = kante + seite * d;
      maske.rechteck(sx, oben, sx + 1, bodenY + 10);
    }
  }
}

function dichteInsel(maske, rng, B, H, stat) {
  const rauschen = fbm2(rng, B, H, 620, 5);
  const cx = B * zwischen(rng, 0.46, 0.54);
  const cy = H * 0.44;
  const haupt = masse(cx, cy, B * zwischen(rng, 0.3, 0.36), H * 0.12, H * zwischen(rng, 0.3, 0.38), 430);
  const kleine = [-1, 1].map((s) => masse(cx + s * B * zwischen(rng, 0.38, 0.45), H * zwischen(rng, 0.5, 0.66), B * 0.1, H * 0.06, H * 0.16, 300));
  // Massiver Fels ohne Wurmtunnel: Die schmalen Gänge im Inneren waren unerreichbar und wirkten wuschig.
  ausDichte(maske, rng, (x, y) => Math.max(haupt(x, y), ...kleine.map((k) => k(x, y))) + rauschen(x, y) * 190);
  raeumeAuf(maske);
  stat.platten += 1;
  for (let i = 0; i < 2; i += 1) {
    const x = cx + zwischen(rng, -B * 0.16, B * 0.16);
    const y = oben(maske, x);
    if (y > 0) { ruine(maske, rng, x, y + 6, zwischen(rng, 130, 190), zwischen(rng, 170, 300)); stat.tuerme += 1; }
  }
  return Math.round(H * 0.8);
}

function dichteGruppe(maske, rng, B, H, stat, archipel = false) {
  const rauschen = fbm2(rng, B, H, 480, 5);
  const n = archipel ? 9 + Math.floor(rng.next() * 5) : 3 + Math.floor(rng.next() * 3);
  const teile = [];
  for (let versuch = 0; versuch < n * 12 && teile.length < n; versuch += 1) {
    // Die erste Insel ist die Hauptinsel (mindestens 0,16·B Radius): auf ihr spielt die Mehrzahl der Figuren.
    const haupt = teile.length === 0;
    const rx = Math.max(haupt ? B * 0.16 : 0, archipel ? zwischen(rng, 140, 380) : (B / n) * zwischen(rng, 0.5, 0.7));
    const x = archipel ? zwischen(rng, rx, B - rx) : B * ((teile.length + 0.5) / n) + zwischen(rng, -B * 0.03, B * 0.03);
    const y = H * zwischen(rng, 0.34, archipel ? 0.74 : 0.68);
    if (teile.some((t) => Math.abs(t.x - x) < (t.rx + rx) * 0.9 && Math.abs(t.y - y) < 150)) continue;
    const form = inselForm(rng);
    teile.push({ x, y, rx, f: masse(x, y, rx, rx * 0.3, rx * zwischen(rng, 0.45, 0.9), rx * 1.0, form.pOben, form.pUnten) });
  }
  ausDichte(maske, rng, (x, y) => Math.max(...teile.map((t) => t.f(x, y))) + rauschen(x, y) * 230);
  stat.platten += teile.length;
  teile.sort((a, b) => a.x - b.x);
  for (let i = 0; i < teile.length; i += 1) {
    const t = teile[i];
    if (t.rx > 200 && rng.next() < 0.6) {
      const x = t.x + zwischen(rng, -t.rx * 0.4, t.rx * 0.2);
      const y = oben(maske, x);
      if (y > 0) { ruine(maske, rng, x, y + 6, zwischen(rng, 120, 170), zwischen(rng, 150, 260)); stat.tuerme += 1; }
    }
    const nach = teile[i + 1];
    if (nach && nach.x - nach.rx - (t.x + t.rx) < 320 && rng.next() < 0.7) {
      const xa = t.x + t.rx * 0.8;
      const xb = nach.x - nach.rx * 0.8;
      const ya = oben(maske, xa);
      const yb = oben(maske, xb);
      if (ya > 0 && yb > 0 && xb > xa) { bruecke(maske, xa, xb, ya + 4, yb + 4); stat.bruecken += 1; }
    }
  }
  return Math.round(H * 0.8);
}

/** Standardläufe von `raeumeAuf`: Lufttaschen unter 9000 und Felskrümel unter 1200 (Pixel bei 2560×1440, wachsen mit der Fläche). */
const AUFRAEUM_LAEUFE = Object.freeze([[0, 9000], [1, 1200]]);

/**
 * Räumt eine Höhlenmaske auf: Kleine abgeschlossene Lufttaschen werden zu Fels, winzige freie Felskrümel zu Luft. Übrig bleiben große
 * Räume und Gänge — keine Perlenketten aus Blasen. Ein Lauf über die Maske (Flutfüllung mit eigenem Stapel, 4-Nachbarn).
 */
function raeumeAuf(maske, laeufe = AUFRAEUM_LAEUFE) {
  const B = maske.breite;
  const H = maske.hoehe;
  // Schwellen gelten für 2560×1440 und wachsen mit der Fläche.
  const flaeche = (B * H) / (2560 * 1440);
  const bm = maske.bitmap;
  // Zwei getrennte Läufe mit frischem Befund: Das Füllen der Lufttaschen verbindet sonst Felskrümel mit dem Land,
  // und ein veralteter Befund würde das ganze Land wegräumen. (Ältere Fassung: Flutfüllung je Zelle; hier dieselbe Zerlegung
  // in 4-zusammenhängende Flächen, aber über Zeilenläufe mit Union-Find — Ergebnis Bit für Bit gleich, rund zehnmal schneller.)
  let kap = 1 << 14;
  let vonX = new Int32Array(kap);
  let bisX = new Int32Array(kap);
  let wurzel = new Int32Array(kap);
  const zeilenAnfang = new Int32Array(H + 1);
  const finde = (i) => {
    while (wurzel[i] !== i) { wurzel[i] = wurzel[wurzel[i]]; i = wurzel[i]; }
    return i;
  };
  for (const [art, basis] of laeufe) {
    const schwelle = basis * flaeche;
    let n = 0;
    for (let y = 0; y < H; y += 1) {
      zeilenAnfang[y] = n;
      const zeile = y * B;
      let x = 0;
      while (x < B) {
        if (bm[zeile + x] !== art) { x += 1; continue; }
        const x0 = x;
        while (x < B && bm[zeile + x] === art) x += 1;
        if (n === kap) {
          kap *= 2;
          const v2 = new Int32Array(kap); v2.set(vonX); vonX = v2;
          const b2 = new Int32Array(kap); b2.set(bisX); bisX = b2;
          wurzel = new Int32Array(kap);
        }
        vonX[n] = x0;
        bisX[n] = x;
        n += 1;
      }
    }
    zeilenAnfang[H] = n;
    for (let i = 0; i < n; i += 1) wurzel[i] = i;
    // Läufe benachbarter Zeilen, die sich in x überlappen, gehören zu einer Fläche.
    for (let y = 1; y < H; y += 1) {
      let a = zeilenAnfang[y - 1];
      const aEnde = zeilenAnfang[y];
      let b = aEnde;
      const bEnde = zeilenAnfang[y + 1];
      while (a < aEnde && b < bEnde) {
        if (vonX[a] < bisX[b] && vonX[b] < bisX[a]) {
          const ra = finde(a);
          const rb = finde(b);
          if (ra !== rb) wurzel[ra < rb ? rb : ra] = ra < rb ? ra : rb;
        }
        if (bisX[a] < bisX[b]) a += 1; else b += 1;
      }
    }
    const groesse = new Float64Array(n);
    const amHimmel = new Uint8Array(n);
    for (let y = 0; y < H; y += 1) {
      for (let i = zeilenAnfang[y]; i < zeilenAnfang[y + 1]; i += 1) {
        const r = finde(i);
        groesse[r] += bisX[i] - vonX[i];
        if (y === 0) amHimmel[r] = 1;
      }
    }
    // Luft am oberen Rand ist der Himmel; Fels am Rand gehört zum Land.
    for (let y = 0; y < H; y += 1) {
      for (let i = zeilenAnfang[y]; i < zeilenAnfang[y + 1]; i += 1) {
        const r = finde(i);
        if (!amHimmel[r] && groesse[r] < schwelle) bm.fill(1 - art, y * B + vonX[i], y * B + bisX[i]);
      }
    }
  }
}

/** Vorlage „Kaverne“: ein riesiger Hauptraum mit Absätzen und Felsinseln, zwei schräge Zugänge von der Oberfläche, zwei Nebenkammern. */
function hoehleKaverne(maske, rng, B, H, stat, y0, mitInsel) {
  const cx = B * zwischen(rng, 0.45, 0.55);
  const cy = H * 0.54;
  const rx = Math.min(B * 0.34, zwischen(rng, 560, 760));
  const ry = Math.min(H * 0.27, zwischen(rng, 260, 380));
  // Zugänge: schräg von der Oberfläche links und rechts hinunter in den Hauptraum.
  for (const seite of [-1, 1]) {
    const xo = cx + seite * zwischen(rng, rx * 0.9, rx * 1.15);
    gang(maske, xo, y0(xo) - 24, cx + seite * rx * 0.55, cy - ry * 0.2, 46);
  }
  maske.ellipse(cx, cy, rx, ry, 0);
  maske.rechteck(cx - rx - 1, cy + ry * 0.55, cx + rx + 1, cy + ry + 2, 1); // ebener Boden
  // Absätze an den Wänden und Felsinseln im Raum (Stufen zum Klettern, Deckung).
  for (const seite of [-1, 1]) {
    maske.ellipse(cx + seite * rx * 0.78, cy + ry * 0.3, rx * 0.2, 22, 1);
    maske.ellipse(cx + seite * rx * 0.45, cy - ry * 0.1, rx * 0.14, 18, 1);
    stat.platten += 2;
  }
  if (mitInsel) { maske.ellipse(cx, cy + ry * 0.1, rx * 0.22, 26, 1); stat.platten += 1; }
  for (let i = 0; i < 5; i += 1) { // Zapfen an der Decke und Hügel am Boden
    const x = cx + zwischen(rng, -rx * 0.8, rx * 0.8);
    maske.ellipse(x, cy - ry * 0.93, zwischen(rng, 14, 26), zwischen(rng, 34, 66), 1);
    maske.ellipse(zwischen(rng, cx - rx * 0.8, cx + rx * 0.8), cy + ry * 0.55, zwischen(rng, 34, 70), zwischen(rng, 12, 22), 1);
  }
  // Nebenkammern links und rechts, tiefer, mit Gang zum Hauptraum.
  for (const seite of [-1, 1]) {
    const nx = cx + seite * (rx + zwischen(rng, 170, 230));
    if (nx < 120 || nx > B - 120) continue;
    const ny = H * zwischen(rng, 0.7, 0.8);
    gang(maske, cx + seite * rx * 0.85, cy + ry * 0.35, nx, ny, 38);
    kammer(maske, nx, ny, zwischen(rng, 130, 190), Math.min(H * 0.1, zwischen(rng, 80, 110)));
    stat.hoehlen += 1;
  }
  stat.hoehlen += 1;
  raeumeAuf(maske);
  stat.platten += 1;
}

/** Vorlage „Treppe“: Kammern steigen schräg ab (links oben nach rechts unten oder umgekehrt), durch schräge Gänge verbunden, mit zwei Zugängen. */
function hoehleTreppe(maske, rng, B, H, stat, y0, mitInsel) {
  const richtung = rng.next() < 0.5 ? 1 : -1;
  const anzahl = 5;
  const kammern = [];
  for (let i = 0; i < anzahl; i += 1) {
    const t = i / (anzahl - 1);
    const x = B * (richtung === 1 ? 0.14 + 0.72 * t : 0.86 - 0.72 * t) + zwischen(rng, -B * 0.02, B * 0.02);
    kammern.push({ x, y: H * (0.36 + 0.42 * t) + zwischen(rng, -H * 0.02, H * 0.02), rx: zwischen(rng, 170, 250), ry: Math.min(H * 0.1, zwischen(rng, 90, 140)) });
  }
  const boden = (k) => k.y + k.ry * 0.5 - 24;
  for (let i = 0; i + 1 < kammern.length; i += 1) gang(maske, kammern[i].x, boden(kammern[i]), kammern[i + 1].x, boden(kammern[i + 1]), 42);
  // Zugänge: oben vom ersten Raum, und ein zweiter Schacht direkt in den vierten Raum (Abkürzung).
  const erste = kammern[0];
  gang(maske, erste.x + zwischen(rng, -40, 40), erste.y - erste.ry * 0.5, erste.x, y0(erste.x) - 28, 44);
  const k4 = kammern[3];
  gang(maske, k4.x + zwischen(rng, -60, 60), k4.y - k4.ry * 0.5, k4.x, y0(k4.x) - 28, 40);
  for (const k of kammern) {
    kammer(maske, k.x, k.y, k.rx, k.ry);
    for (let i = 0; i < 2; i += 1) maske.ellipse(k.x + zwischen(rng, -k.rx * 0.6, k.rx * 0.6), k.y + k.ry * 0.5, zwischen(rng, 28, 56), zwischen(rng, 10, 18), 1);
    stat.hoehlen += 1;
  }
  if (mitInsel) for (const k of kammern.slice(1, -1)) { maske.ellipse(k.x, k.y + k.ry * 0.15, k.rx * 0.4, k.ry * 0.28, 1); stat.platten += 1; }
  raeumeAuf(maske);
  stat.platten += 1;
}

/** Setzt die zusammenhängende Fläche ab `start` (Wert `von`) auf `nach`. */
function _fuelle(bm, B, H, start, von, nach) {
  const stapel = [start];
  bm[start] = nach;
  while (stapel.length) {
    const i = stapel.pop();
    const x = i % B;
    const y = (i - x) / B;
    if (x > 0 && bm[i - 1] === von) { bm[i - 1] = nach; stapel.push(i - 1); }
    if (x < B - 1 && bm[i + 1] === von) { bm[i + 1] = nach; stapel.push(i + 1); }
    if (y > 0 && bm[i - B] === von) { bm[i - B] = nach; stapel.push(i - B); }
    if (y < H - 1 && bm[i + B] === von) { bm[i + B] = nach; stapel.push(i + B); }
  }
}

function dichteHoehle(maske, rng, B, H, stat, mitInsel = false) {
  // Klare Bauweise statt Wurmgängen: massiver Fels mit zwei Stockwerken aus Kammern (ebener Boden), gerade Gänge dazwischen,
  // senkrechte Schächte nach oben und unten. Das Dichtefeld liefert nur die Oberfläche und leicht welligen Fels.
  const rauschen = fbm2(rng, B, H, 500, 5);
  const kante = rausch2(rng, B, H, 380);
  const y0 = (x) => H * 0.2 + kante(x, 0) * H * 0.07;
  ausDichte(maske, rng, (x, y) => y - y0(x) + rauschen(x, y) * 60, 2);
  // Drei Vorlagen: Stockwerke (unten), große Kaverne, Treppe aus Kammern. Der Seed wählt.
  const vorlage = Math.floor(rng.next() * 3);
  if (vorlage === 1) { hoehleKaverne(maske, rng, B, H, stat, y0, mitInsel); return Math.round(H * 0.94); }
  if (vorlage === 2) { hoehleTreppe(maske, rng, B, H, stat, y0, mitInsel); return Math.round(H * 0.94); }
  const reihe = (anzahl, yMitte) => {
    const liste = [];
    for (let i = 0; i < anzahl; i += 1) {
      const x = B * ((i + 0.5) / anzahl) + zwischen(rng, -B * 0.03, B * 0.03);
      liste.push({ x, y: H * (yMitte + zwischen(rng, -0.03, 0.03)), rx: zwischen(rng, 190, 270), ry: Math.min(H * 0.12, zwischen(rng, 125, 185)) });
    }
    return liste;
  };
  const oben = reihe(3, 0.43);
  const unten = reihe(3 + Math.floor(rng.next() * 2), 0.74);
  const boden = (k) => k.y + k.ry * 0.5; // Gänge münden knapp über dem ebenen Kammerboden
  for (const r of [oben, unten]) {
    for (let i = 0; i + 1 < r.length; i += 1) gang(maske, r[i].x, boden(r[i]) - 24, r[i + 1].x, boden(r[i + 1]) - 24 + zwischen(rng, -30, 30), 42);
  }
  // Senkrechte Schächte zwischen den Stockwerken (mindestens zwei, an verschiedenen Kammern).
  const schaechte = 2 + Math.floor(rng.next() * 2);
  for (let i = 0; i < schaechte; i += 1) {
    const k = oben[i % oben.length];
    const naechste = unten.reduce((m, u) => (Math.abs(u.x - k.x) < Math.abs(m.x - k.x) ? u : m), unten[0]);
    const x = (k.x + naechste.x) / 2 + zwischen(rng, -20, 20);
    gang(maske, x, boden(k) - 20, x, naechste.y - naechste.ry * 0.6, 40);
  }
  // Schächte zur Oberfläche.
  for (let i = 0; i < 2; i += 1) {
    const k = oben[i === 0 ? 0 : oben.length - 1];
    const x = k.x + zwischen(rng, -40, 40);
    gang(maske, x, k.y - k.ry * 0.5, x, y0(x) - 30, 44);
  }
  // Jede Kammer ist ein Verbund aus zwei bis drei überlappenden Räumen mit gemeinsamem ebenem Boden (kein glatter Halbkreis).
  for (const k of [...oben, ...unten]) {
    kammer(maske, k.x, k.y, k.rx, k.ry);
    for (let i = 0; i < 2; i += 1) {
      const dx = (i === 0 ? -1 : 1) * k.rx * zwischen(rng, 0.45, 0.7);
      kammer(maske, k.x + dx, k.y - k.ry * zwischen(rng, 0, 0.25), k.rx * zwischen(rng, 0.45, 0.65), k.ry * zwischen(rng, 0.7, 1.05));
    }
    // Leben im Raum: flache Hügel auf dem Boden (sanft genug zum Gehen) und Zapfen an der Decke.
    for (let i = 0; i < 3; i += 1) {
      const x = k.x + zwischen(rng, -k.rx * 0.7, k.rx * 0.7);
      maske.ellipse(x, k.y + k.ry * 0.5, zwischen(rng, 28, 60), zwischen(rng, 10, 20), 1);
    }
    for (let i = 0; i < 2; i += 1) {
      const x = k.x + zwischen(rng, -k.rx * 0.6, k.rx * 0.6);
      maske.ellipse(x, k.y - k.ry * 0.95, zwischen(rng, 10, 18), zwischen(rng, 22, 44), 1);
    }
    stat.hoehlen += 1;
  }
  if (mitInsel) {
    for (const k of unten.slice(1, -1)) {
      maske.ellipse(k.x, k.y + k.ry * 0.1, k.rx * 0.45, k.ry * 0.3, 1);
      stat.platten += 1;
    }
  }
  raeumeAuf(maske);
  stat.platten += 1;
  return Math.round(H * 0.94);
}

function dichteSchlucht(maske, rng, B, H, stat) {
  const rauschen = fbm2(rng, B, H, 500, 5);
  const wegX = rausch2(rng, B, H, 520);
  const boden = H * 0.9;
  const y0 = H * zwischen(rng, 0.3, 0.4);
  const mitte = (y) => B / 2 + wegX(0, y) * B * 0.09;
  const halb = (y) => B * (0.115 + 0.07 * (1 - (y - y0) / (boden - y0)));
  const d = (x, y) => {
    const wand = Math.abs(x - mitte(y)) - halb(y);
    return Math.max(Math.min(wand, y - y0), y - boden) + rauschen(x, y) * 120;
  };
  ausDichte(maske, rng, d);
  // Absätze: breite Felsbänder, die aus den Wänden wachsen.
  const n = 4 + Math.floor(rng.next() * 3);
  for (let i = 0; i < n; i += 1) {
    const y = H * (0.46 + (0.38 * i) / Math.max(1, n - 1));
    const links = i % 2 === 0;
    const wx = mitte(y) + (links ? -1 : 1) * halb(y);
    maske.ellipse(wx + (links ? 1 : -1) * 20, y, B * zwischen(rng, 0.07, 0.11), zwischen(rng, 38, 58), 1);
    stat.platten += 1;
  }
  if (rng.next() < 0.7) {
    const xa = mitte(y0) - halb(y0) - 20;
    const xb = mitte(y0) + halb(y0) + 20;
    bruecke(maske, xa, xb, oben(maske, xa) + 6, oben(maske, xb) + 6);
    stat.bruecken += 1;
  }
  for (const x of [B * 0.12, B * 0.88]) {
    const y = oben(maske, x);
    if (y > 0) { ruine(maske, rng, x - 80, y + 6, 160, zwischen(rng, 160, 260)); stat.tuerme += 1; }
  }
  return Math.round(H * 0.93);
}

function dichteVulkan(maske, rng, B, H, stat) {
  const rauschen = fbm2(rng, B, H, 520, 5);
  const cx = B * zwischen(rng, 0.44, 0.56);
  const spitze = H * zwischen(rng, 0.2, 0.28);
  const grund = H * 0.84;
  const halb = (y) => B * 0.06 + B * zwischen(rng, 0.32, 0.38) * (Math.max(0, y - spitze) / (grund - spitze)) ** 0.8;
  const breite = halb(grund);
  const d = (x, y) => {
    const kegel = Math.min((y < spitze ? -1 : 1) * 1e3, (breite * 0 + (B * 0.06 + (breite - B * 0.06) * ((y - spitze) / (grund - spitze)) ** 0.8)) - Math.abs(x - cx));
    return Math.max(kegel, y - grund) + rauschen(x, y) * 150;
  };
  ausDichte(maske, rng, d);
  maske.ellipse(cx, spitze + 20, B * 0.07, 70, 0);
  gang(maske, cx, spitze + 60, cx, H * 0.66, 26);
  kammer(maske, cx, H * 0.7, B * 0.12, 70);
  stat.hoehlen += 2;
  for (const s of [-1, 1]) {
    const x = cx + s * B * zwischen(rng, 0.42, 0.47);
    if (x < 120 || x > B - 120) continue;
    maske.ellipse(x, H * zwischen(rng, 0.52, 0.66), 150, 60, 1);
    stat.platten += 1;
  }
  stat.platten += 1;
  return Math.round(H * 0.92);
}

function dichteEbenen(maske, rng, B, H, stat) {
  const rauschen = fbm2(rng, B, H, 420, 5);
  const ebenen = width3(B, H) ? 4 : 3;
  const teile = [];
  for (let e = 0; e < ebenen; e += 1) {
    const y = H * (0.74 - e * (0.44 / Math.max(1, ebenen - 1)));
    const anzahl = e === 0 ? 2 : 1 + Math.floor(rng.next() * 2);
    for (let i = 0; i < anzahl; i += 1) {
      const rx = (B / (anzahl + 0.6)) * zwischen(rng, 0.38, 0.5);
      const x = B * ((i + 0.5 + (e % 2 ? 0.15 : -0.1)) / anzahl) + zwischen(rng, -B * 0.04, B * 0.04);
      teile.push({ x: Math.max(rx * 0.8, Math.min(B - rx * 0.8, x)), y: y + zwischen(rng, -30, 30), rx, e });
    }
  }
  const platten = teile.map((t) => { const form = inselForm(rng); return masse(t.x, t.y, t.rx, t.rx * 0.16, t.rx * zwischen(rng, 0.25, 0.4), t.rx * 0.8, form.pOben, form.pUnten); });
  const pfeiler = [];
  for (const t of teile.filter((q) => q.e > 0)) {
    const stuetze = teile.find((q) => q.e === t.e - 1 && Math.abs(q.x - t.x) < q.rx * 0.8);
    if (stuetze) pfeiler.push({ x: t.x + zwischen(rng, -t.rx * 0.4, t.rx * 0.4), y0: t.y, y1: stuetze.y, b: zwischen(rng, 60, 96) });
  }
  const d = (x, y) => {
    let w = Math.max(...platten.map((p) => p(x, y)));
    for (const p of pfeiler) if (y > p.y0 && y < p.y1) w = Math.max(w, p.b / 2 - Math.abs(x - p.x) + rauschen(x * 2, y) * 25);
    return Math.max(w + rauschen(x, y) * 200, y - H * 0.92);
  };
  ausDichte(maske, rng, d);
  stat.platten += teile.length;
  stat.pfeiler += pfeiler.length;
  for (const t of teile) {
    if (t.rx > 260 && rng.next() < 0.6) {
      const x = t.x + zwischen(rng, -t.rx * 0.5, t.rx * 0.3);
      const y = oben(maske, x);
      if (y > 0) { ruine(maske, rng, x, y + 6, zwischen(rng, 120, 170), Math.min(zwischen(rng, 150, 250), y - 30)); stat.tuerme += 1; }
    }
  }
  return Math.round(H * 0.8);
}

function width3(B, H) { return B / H > 1.6; }

function dichteRuinenstadt(maske, rng, B, H, stat) {
  const rauschen = fbm2(rng, B, H, 700, 5);
  const huegel = rausch2(rng, B, H, 600);
  const y0 = (x) => H * 0.74 + huegel(x, 0) * H * 0.06;
  ausDichte(maske, rng, (x, y) => y - y0(x) + rauschen(x, y) * 70);
  const n = 5 + Math.floor(rng.next() * 3);
  const tuerme = [];
  for (let i = 0; i < n; i += 1) {
    const breite = zwischen(rng, 120, 200);
    const x = (B - breite) * ((i + zwischen(rng, 0.15, 0.85)) / n);
    const hoehe = zwischen(rng, 200, 440);
    ruine(maske, rng, x, y0(x + breite / 2) + 8, breite, hoehe);
    tuerme.push({ x, breite, hoehe, y: y0(x + breite / 2) });
    stat.tuerme += 1;
  }
  for (let i = 0; i + 1 < tuerme.length; i += 1) {
    const a = tuerme[i];
    const b = tuerme[i + 1];
    const luecke = b.x - (a.x + a.breite);
    if (luecke > 30 && luecke < 330 && rng.next() < 0.65) {
      const y = a.y - Math.min(a.hoehe, b.hoehe) * 0.55;
      bruecke(maske, a.x + a.breite - 4, b.x + 4, y, y);
      stat.bruecken += 1;
    }
  }
  return Math.round(H * 0.93);
}

function dichteHochkant(maske, rng, B, H, stat) {
  const rauschen = fbm2(rng, B, H, 600, 5);
  const wand = B * zwischen(rng, 0.08, 0.13);
  const n = 6 + Math.floor(rng.next() * 3);
  const baender = [];
  let links = rng.next() < 0.5;
  for (let i = 0; i < n; i += 1) {
    const y = H * (0.18 + (0.7 * i) / (n - 1));
    const rx = B * zwischen(rng, 0.3, 0.42);
    baender.push(masse(links ? wand * 0.5 : B - wand * 0.5, y, rx, 50, zwischen(rng, 90, 140), rx * 0.42));
    links = !links;
  }
  const brocken = [0.3, 0.62].map((f) => masse(B * zwischen(rng, 0.4, 0.6), H * f, B * 0.1, 50, 120, 200));
  const d = (x, y) => Math.max(wand - x, x - (B - wand), ...baender.map((b) => b(x, y)), ...brocken.map((b) => b(x, y)), y - H * 0.94) + rauschen(x, y) * 60;
  ausDichte(maske, rng, d);
  stat.platten += n;
  stat.pfeiler += 1;
  return Math.round(H * 0.94);
}

/* ====================================================================
 * Mehrzonen-Gelände (Geländefassung 10): breite Karten aus mehreren Kartenarten
 * ==================================================================== */

/** Ab dieser Kartenbreite (px) baut Fassung 10 die Karte aus Zonen; schmalere Karten bleiben Bit für Bit gleich. */
export const ZONEN_AB_BREITE = GELAENDE_WEIT_AB_BREITE;
/** Zielbreite einer Zone (px): n = round(Breite / ZONEN_BREITE), mindestens 2. */
export const ZONEN_BREITE = 2000;
/** Breite der Mischzone an jeder Naht (px). */
export const ZONEN_UEBERLAPP = 300;
/** Wasserlinie der Zonenkarte (Anteil der Höhe), für alle Zonen gleich. */
const ZONEN_WASSER = 0.86;
/** Kartenarten, aus denen eine Zone gezogen wird (ohne Planet, „Unmögliches“ und Hochkant: Sonderregeln der Engine). */
const ZONEN_ARTEN = Object.freeze(['insel', 'inselgruppe', 'ebenen', 'hoehle', 'hoehleInsel', 'schlucht', 'archipel', 'vulkan', 'ruinenstadt', 'pyramide']);

/** Zeichnet jede Zonenart in ihre eigene (schmalere) Maske; liefert die Wasserlinie der Art (hier unbenutzt). */
const ZONEN_BAUER = {
  insel: dichteInsel, inselgruppe: dichteGruppe, ebenen: dichteEbenen, hoehle: dichteHoehle,
  hoehleInsel: (m, r, b, h, st) => dichteHoehle(m, r, b, h, st, true), schlucht: dichteSchlucht,
  archipel: (m, r, b, h, st) => dichteGruppe(m, r, b, h, st, true), vulkan: dichteVulkan, ruinenstadt: dichteRuinenstadt, pyramide: kartePyramide,
};

/** Zonen-Zahl einer Kartenbreite (`n = round(Breite / 2000)`, mindestens 2). */
export function zonenZahl(width) {
  return Math.max(2, Math.round(width / ZONEN_BREITE));
}

/**
 * Baut an einer Naht bei `s` eine Träger-Brücke, wenn dort zwischen zwei Landstücken Wasser oder Abgrund liegt: Planke von Kante
 * zu Kante, darunter Stützen bis zum Grund. Gibt es keine Lücke (Land geht durch), geschieht nichts.
 * @returns {boolean} wurde eine Brücke gebaut
 */
function nahtBruecke(maske, rng, s, wasserY, stat) {
  const SUCH = 450;
  const trocken = (x) => { const y = oben(maske, x); return y >= 0 && y < wasserY - 20 ? y : -1; };
  // Die längste Lücke ohne trockenes Land, die beidseitig von Land begrenzt ist.
  let beste = null;
  let start = null;
  let letzt = null;
  for (let x = Math.max(8, s - SUCH); x <= Math.min(maske.breite - 9, s + SUCH); x += 4) {
    if (trocken(x) >= 0) {
      if (start !== null && (!beste || x - letzt.x > beste.xb - beste.xa)) beste = { xa: letzt.x, xb: x, ya: letzt.y, yb: trocken(x) };
      start = null;
      letzt = { x, y: trocken(x) };
    } else if (start === null && letzt) {
      start = x;
    }
  }
  if (!beste || beste.xb - beste.xa < 24 || beste.xb - beste.xa > 800) return false;
  const { xa, xb, ya, yb } = beste;
  bruecke(maske, xa - 6, xb + 6, ya + 4, yb + 4);
  // Träger: Stützen alle ~170 px von der Planke bis zum Grund.
  const stuetzen = Math.max(1, Math.round((xb - xa) / 170) - 1);
  for (let i = 1; i <= stuetzen; i += 1) {
    const t = i / (stuetzen + 1);
    const x = xa + (xb - xa) * t;
    pfeiler(maske, rng, x, ya + (yb - ya) * t + 8, wasserY + 175, 26);
  }
  stat.bruecken += 1;
  stat.pfeiler += stuetzen;
  return true;
}

/** Fassung 11: Landstücke unter dieser Größe (Pixel bei 2560×1440, wachsen mit der Fläche) schweben nicht mehr in der Karte. */
const SPLITTER_LAEUFE = Object.freeze([[1, 5000]]);
/** Breite (px) der Böschung an jeder Seite der Mischzone (Fassung 11): die Höhen beider Zonen gleichen sich über Mischzone + 2·Auslauf an. */
const NAHT_AUSLAUF = 400;

/**
 * Das Land einer Zonenmaske im Streifen `[xa, xb)` (Weltspalten), das auf dem Grund steht: alles, was von einer festen Zelle der Zeile
 * `wasserY − 60` aus zusammenhängt (4-Nachbarn, Flutfüllung im Streifen). Alles andere ist Schwebendes (Inseln, Platten über dem Stand).
 * @returns {{stand:Uint8Array, breite:number, c0:number, oberkante:Int32Array}} `stand` zeilenweise über `breite` Spalten ab `c0`
 *   (Spalte der Zonenmaske); `oberkante[i]` die oberste Standzeile der Spalte `c0 + i` oder −1
 */
function standLand(z, xa, xb, wasserY) {
  const B = z.sub.breite;
  const H = z.sub.hoehe;
  const bm = z.sub.bitmap;
  const c0 = Math.max(0, xa - z.xa);
  const c1 = Math.min(B, xb - z.xa);
  const bw = Math.max(0, c1 - c0);
  const stand = new Uint8Array(bw * H);
  const oberkante = new Int32Array(bw).fill(-1);
  const yT = Math.min(H - 1, wasserY - 60);
  const stapel = new Int32Array(bw * H);
  let sp = 0;
  for (let i = 0; i < bw; i += 1) {
    if (bm[yT * B + c0 + i] && !stand[yT * bw + i]) { stand[yT * bw + i] = 1; stapel[sp++] = yT * bw + i; }
  }
  while (sp > 0) {
    const k = stapel[--sp];
    const i = k % bw;
    const y = (k - i) / bw;
    if (i > 0 && !stand[k - 1] && bm[y * B + c0 + i - 1]) { stand[k - 1] = 1; stapel[sp++] = k - 1; }
    if (i < bw - 1 && !stand[k + 1] && bm[y * B + c0 + i + 1]) { stand[k + 1] = 1; stapel[sp++] = k + 1; }
    if (y > 0 && !stand[k - bw] && bm[(y - 1) * B + c0 + i]) { stand[k - bw] = 1; stapel[sp++] = k - bw; }
    if (y < H - 1 && !stand[k + bw] && bm[(y + 1) * B + c0 + i]) { stand[k + bw] = 1; stapel[sp++] = k + bw; }
  }
  for (let i = 0; i < bw; i += 1) for (let y = 0; y < H; y += 1) if (stand[y * bw + i]) { oberkante[i] = y; break; }
  return { stand, breite: bw, c0, oberkante };
}

/**
 * Fassung 11: Mischzone mit Böschung. In jeder Spalte steht das Land, das auf dem Grund sitzt, auf einer Höhe, die weich zwischen den
 * Oberkanten beider Zonen überblendet wird (Rampe über Mischzone + 2·Auslauf; ohne Land auf dem Grund zählt die Wasserlinie): der Landkörper
 * wird dazu senkrecht verschoben. Schwebendes (Inseln, Platten über dem Stand) bleibt, wo es ist; wo eine Seite nur Wasser oder Schwebendes hat, füllt die Rampe auf. Welche
 * Zone in der Mischzone gilt, entscheidet wie zuvor das Rauschen. So endet eine Landmasse neben Wasser oder Inseln in einer Böschung
 * statt in einer Wand.
 */
function mischeNaht(bm, width, height, wasserY, links, rechts, x0, x1, feld) {
  const xa = Math.max(0, x0 - NAHT_AUSLAUF);
  const xb = Math.min(width, x1 + NAHT_AUSLAUF);
  const spanne = xb - xa;
  const SL = standLand(links, xa, xb, wasserY);
  const SR = standLand(rechts, xa, xb, wasserY);
  const zelle = (z, S, x, y, d, gb) => {
    const B = z.sub.breite;
    const c = Math.max(0, Math.min(B - 1, x - z.xa));
    const i = Math.max(0, Math.min(S.breite - 1, c - S.c0));
    const roh = z.sub.bitmap[y * B + c];
    if (gb < 0) return roh;
    // Schwebendes unverändert; der Landkörper (Stand) um `d` verschoben.
    if (roh && !S.stand[y * S.breite + i]) return 1;
    const yy = y - d;
    return yy >= 0 && yy < height ? S.stand[yy * S.breite + i] : 0;
  };
  const luecke = (z, S, x) => S.oberkante[Math.max(0, Math.min(S.breite - 1, Math.max(0, Math.min(z.sub.breite - 1, x - z.xa)) - S.c0))];
  for (let x = xa; x < xb; x += 1) {
    const u = (x - xa + 0.5) / spanne;
    const w = u * 0.6 + u * u * (3 - 2 * u) * 0.4;
    const gL = luecke(links, SL, x);
    const gR = luecke(rechts, SR, x);
    const hL = gL < 0 ? wasserY : gL;
    const hR = gR < 0 ? wasserY : gR;
    const hs = hL * (1 - w) + hR * w;
    const dL = Math.round(hs - hL);
    const dR = Math.round(hs - hR);
    const hsRund = Math.round(hs);
    const t = Math.max(0, Math.min(1, (x - x0) / ZONEN_UEBERLAPP));
    const inMisch = x >= x0 && x < x1;
    // Außerhalb der Mischzone besitzt eine Zone die Spalte schon; ohne Verschiebung und Füllung bleibt sie, wie sie ist.
    if (!inMisch && x < x0 && dL === 0 && !(gL < 0 && gR >= 0)) continue;
    if (!inMisch && x >= x1 && dR === 0 && !(gR < 0 && gL >= 0)) continue;
    for (let y = 0; y < height; y += 1) {
      const nimmRechts = (t - 0.5) * 2 + (inMisch ? feld(x - x0, y) * 0.8 : 0) > 0;
      let v = nimmRechts ? zelle(rechts, SR, x, y, dR, gR) : zelle(links, SL, x, y, dL, gL);
      // Steht auf der gewählten Seite kein Land auf dem Grund, auf der anderen schon: die Böschung füllt unter der Rampe auf.
      if (!v && y >= hsRund && y < wasserY && (nimmRechts ? gR < 0 && gL >= 0 : gL < 0 && gR >= 0)) v = 1;
      bm[y * width + x] = v;
    }
  }
}

/** Fassung 12: größte Steigung (Höhenunterschied je Spalte) des Rampenprofils an einer Naht. Die Engine steigt bis 1,4 (gemessen, `config/bewegung.js`: 3 px Stufe, Vorlauf 2 px). */
export const NAHT_STEIGUNG_MAX = 1.0;
/** Fassung 13: Breite (px), unter der ein senkrechter Hohlraum Schacht heißt (Fassung 12: 64): auch die 80 px breiten, geraden Zugangsschächte der Höhlen verschwinden. */
export const SCHACHT_MIN_BREITE_13 = 100;
/** Fassung 12: schmalere senkrechte Hohlräume (Luft zwischen Fels, beidseitig begrenzt) werden gefüllt; 64 px = 4,5 Figurenbreiten. */
export const SCHACHT_MIN_BREITE = 64;
/** Fassung 12: Brückenplanke: Dicke (zwei Figurenhöhen), größte Steigung, Abstand der Stützen, Stützenbreite. */
export const BRUECKE_DICKE = 40;
export const BRUECKE_STEIGUNG_MAX = 0.8;
/** Fassung 12: größte Fensterbreite je Seite der Mischzone (px). */
const NAHT_AUSLAUF_MAX = 850;
/** Fassung 13: Höhenunterschied (px) auf 4 Spalten, ab dem eine Felskante als senkrechte Wand gilt und eine Schutthalde bekommt; Böschung (Höhe je Spalte). */
const WAND_FALL_13 = 200;
const WAND_BOESCHUNG_13 = 2.5;
/** Fassung 13: Brückenpfeiler: Breite unter der Planke, Zuwachs je Höhenpixel bis zum Fuß, größte Fußbreite. */
const PFEILER_KOPF_13 = 64;
const PFEILER_KEGEL_13 = 0.3;
const PFEILER_FUSS_MAX_13 = 420;

/** Fassung 12: Dicke der geschlossenen Kruste unter dem Rampenprofil (px). */
const NAHT_KRUSTE = 24;
/** Fassung 12: freier Raum über dem Rampenprofil (px): zwei Figurenhöhen, auch Schwebendes wird dort entfernt (Kopffreiheit, keine Kanten an der Rampe). */
const NAHT_FREI = 40;
/** Fassung 12: Länge (px) der Landerampe an jedem Brückenende. */
const LANDERAMPE_LAENGE = 420;
/** Fassung 12: freier Raum über der Planke (px) auf der ganzen Spanne. */
const BRUECKE_FREI = 44;
const BRUECKE_STUETZEN_ABSTAND = 180;
const BRUECKE_STUETZEN_BREITE = 40;

/**
 * Fassung 12: Mischzone mit Rampenprofil, ohne die Zonen zu verschieben. Das Profil `hs(x)` überblendet die Oberkanten beider Zonen wie in Fassung 11
 * und wird auf `NAHT_STEIGUNG_MAX` begrenzt (Relaxation vor und zurück). In jeder Spalte gilt die Zelle der gewählten Zone unverändert, nur
 * an der Oberfläche wird nachgeformt: Land, das auf dem Grund steht und über dem Profil liegt, wird abgetragen; zwischen Profil und eigener
 * Oberkante der Zone (oder dem Grund, wenn die Zone hier kein Land hat) wird aufgeschüttet. Höhlen und Pyramiden darunter bleiben unverzerrt.
 */
function mischeNaht12(bm, width, height, wasserY, links, rechts, x0, x1, feld, v13 = false, rng = null) {
  // Fenster: mindestens NAHT_AUSLAUF je Seite; es wächst (bis NAHT_AUSLAUF_MAX), bis der Höhenunterschied der beiden Fensterränder mit der
  // größten Steigung zu überbrücken ist.
  const auslaufMax = NAHT_AUSLAUF_MAX;
  const ziel = 0.85;
  const xaMax = Math.max(0, x0 - auslaufMax);
  const xbMax = Math.min(width, x1 + auslaufMax);
  const SL = standLand(links, xaMax, xbMax, wasserY);
  const SR = standLand(rechts, xaMax, xbMax, wasserY);
  const idx = (z, S, x) => Math.max(0, Math.min(S.breite - 1, Math.max(0, Math.min(z.sub.breite - 1, x - z.xa)) - S.c0));
  const kante = (z, S, x) => { const g = S.oberkante[idx(z, S, x)]; return g < 0 ? wasserY : g; };
  let auslauf = NAHT_AUSLAUF;
  while (auslauf < auslaufMax) {
    const a = Math.max(0, x0 - auslauf);
    const b = Math.min(width, x1 + auslauf);
    if (Math.abs(kante(rechts, SR, b - 1) - kante(links, SL, a)) <= ziel * NAHT_STEIGUNG_MAX * (b - a)) break;
    auslauf += 50;
  }
  const xa = Math.max(0, x0 - auslauf);
  const xb = Math.min(width, x1 + auslauf);
  const spanne = xb - xa;
  const gL = new Int32Array(spanne);
  const gR = new Int32Array(spanne);
  const hs = new Float64Array(spanne);
  for (let i = 0; i < spanne; i += 1) {
    const x = xa + i;
    gL[i] = SL.oberkante[idx(links, SL, x)];
    gR[i] = SR.oberkante[idx(rechts, SR, x)];
    const u = (i + 0.5) / spanne;
    const w = u * 0.6 + u * u * (3 - 2 * u) * 0.4;
    const hL = gL[i] < 0 ? wasserY : gL[i];
    const hR = gR[i] < 0 ? wasserY : gR[i];
    hs[i] = hL * (1 - w) + hR * w;
  }
  // Die Ränder gehören den Zonen: das Profil beginnt und endet auf deren Oberkante (die Fensterwahl oben macht den Höhenunterschied überbrückbar) und
  // bleibt innerhalb des Kegels, den die Steigungsgrenze von beiden Rändern aus erlaubt.
  const a0 = hs[0];
  const aN = hs[spanne - 1];
  for (let i = 0; i < spanne; i += 1) {
    const lo = Math.max(a0 - NAHT_STEIGUNG_MAX * i, aN - NAHT_STEIGUNG_MAX * (spanne - 1 - i));
    const hi = Math.min(a0 + NAHT_STEIGUNG_MAX * i, aN + NAHT_STEIGUNG_MAX * (spanne - 1 - i));
    if (lo <= hi) hs[i] = Math.max(lo, Math.min(hi, hs[i]));
  }
  const begrenze = () => {
    // Steigung begrenzen: abwechselnd vorwärts und rückwärts, bis nichts mehr ändert (Abstand benachbarter Spalten höchstens NAHT_STEIGUNG_MAX).
    for (let pass = 0; pass < 12; pass += 1) {
      let geaendert = false;
      for (let i = 1; i < spanne; i += 1) {
        const lo = hs[i - 1] - NAHT_STEIGUNG_MAX;
        const hi = hs[i - 1] + NAHT_STEIGUNG_MAX;
        if (hs[i] < lo) { hs[i] = lo; geaendert = true; } else if (hs[i] > hi) { hs[i] = hi; geaendert = true; }
      }
      for (let i = spanne - 2; i >= 0; i -= 1) {
        const lo = hs[i + 1] - NAHT_STEIGUNG_MAX;
        const hi = hs[i + 1] + NAHT_STEIGUNG_MAX;
        if (hs[i] < lo) { hs[i] = lo; geaendert = true; } else if (hs[i] > hi) { hs[i] = hi; geaendert = true; }
      }
      if (!geaendert) break;
    }
  };
  begrenze();
  if (v13) {
    // Fassung 13: Wo die Grenze bindet, war das Profil eine Gerade (Dach-Optik). Eine leichte Welle (Steigungsanteil höchstens 0,2, zu den Fensterrändern
    // hin ausklingend) kommt darauf, danach gilt die Grenze erneut: die Linie schwingt um die Grenzsteigung, statt starr darauf zu liegen.
    const lam1 = 170 + rng.next() * 100;
    const lam2 = 300 + rng.next() * 160;
    const ph1 = rng.next() * Math.PI * 2;
    const ph2 = rng.next() * Math.PI * 2;
    const A1 = (0.12 * lam1) / (2 * Math.PI);
    const A2 = (0.08 * lam2) / (2 * Math.PI);
    for (let i = 0; i < spanne; i += 1) {
      const fade = Math.min(1, Math.min(i, spanne - 1 - i) / 200);
      hs[i] += fade * (A1 * Math.sin((2 * Math.PI * i) / lam1 + ph1) + A2 * Math.sin((2 * Math.PI * i) / lam2 + ph2));
    }
    begrenze();
    // Die Ränder gehören den Zonen: ein Versatz an den Fensterenden (Folge der Begrenzung und der Welle) klingt über mindestens 120 px aus,
    // damit dort keine Stufe zur Oberkante der Zone bleibt (Absatz am Rampenende).
    const vA = a0 - hs[0];
    const vB = aN - hs[spanne - 1];
    const lA = Math.max(120, 6 * Math.abs(vA));
    const lB = Math.max(120, 6 * Math.abs(vB));
    for (let i = 0; i < spanne; i += 1) {
      if (i < lA) hs[i] += vA * (1 - i / lA);
      const j = spanne - 1 - i;
      if (j < lB) hs[i] += vB * (1 - j / lB);
    }
  }
  // Ecken abrunden (Mittelwert über ±RUND Spalten, zweimal; ein Mittelwert hat keine größere Steigung als sein Eingang). Zu den Fensterrändern
  // hin klingt die Rundung aus, damit das Profil dort genau in die Oberkante der Zone übergeht (keine Stufe am Rand).
  const RUND = 28;
  const roh = hs.slice();
  for (let m = 0; m < 2; m += 1) {
    const kopie = hs.slice();
    for (let i = 0; i < spanne; i += 1) {
      let sum = 0;
      for (let j = -RUND; j <= RUND; j += 1) sum += kopie[Math.max(0, Math.min(spanne - 1, i + j))];
      hs[i] = sum / (2 * RUND + 1);
    }
  }
  for (let i = 0; i < spanne; i += 1) {
    const t = Math.min(1, Math.min(i, spanne - 1 - i) / (4 * RUND));
    hs[i] = roh[i] + (hs[i] - roh[i]) * t;
  }
  const grund = Math.min(height, wasserY + 170);
  const zelle = (z, S, x, y, h, g) => {
    const B = z.sub.breite;
    const c = Math.max(0, Math.min(B - 1, x - z.xa));
    const roh = z.sub.bitmap[y * B + c];
    if (y < h) return y >= h - NAHT_FREI ? 0 : roh && S.stand[y * S.breite + (c - S.c0 < 0 ? 0 : Math.min(S.breite - 1, c - S.c0))] ? 0 : roh;
    if (roh) return 1;
    // Kruste: unter dem Profil bleibt eine geschlossene Schicht, auch wo darunter eine Höhle beginnt (sonst fällt die Oberfläche in einen Spalt).
    if (y < h + NAHT_KRUSTE && h < wasserY - 8) return 1;
    // Aufschütten: zwischen Profil und eigener Oberkante der Zone; ohne Land in der Zone bis zum Grund (nur wenn das Profil Land verlangt).
    if (g >= 0) return y < g ? 1 : 0;
    return h < wasserY - 8 && y < grund ? 1 : 0;
  };
  for (let x = xa; x < xb; x += 1) {
    const i = x - xa;
    const h = Math.round(hs[i]);
    const inMisch = x >= x0 && x < x1;
    const t = Math.max(0, Math.min(1, (x - x0) / ZONEN_UEBERLAPP));
    const hL = gL[i] < 0 ? wasserY : gL[i];
    const hR = gR[i] < 0 ? wasserY : gR[i];
    const gleichL = h === hL && !(gL[i] < 0 && h < wasserY - 8);
    const gleichR = h === hR && !(gR[i] < 0 && h < wasserY - 8);
    if (!inMisch && x < x0 && gleichL) continue;
    if (!inMisch && x >= x1 && gleichR) continue;
    for (let y = 0; y < height; y += 1) {
      const nimmRechts = (t - 0.5) * 2 + (inMisch ? feld(x - x0, y) * 0.8 : 0) > 0;
      bm[y * width + x] = nimmRechts ? zelle(rechts, SR, x, y, h, gR[i]) : zelle(links, SL, x, y, h, gL[i]);
    }
  }
  return { xa, xb, profil: Int32Array.from(hs, Math.round) };
}

/**
 * Fassung 12: füllt schmale senkrechte Hohlräume. Eine Luftzelle über der Wasserlinie ist „schmal", wenn der waagerechte Luftlauf, in dem sie
 * liegt, beidseitig von Fels begrenzt und kürzer als `SCHACHT_MIN_BREITE` ist. Zusammenhängende schmale Zellen (4-Nachbarn), die sich
 * über mindestens `SCHACHT_MIN_BREITE` Zeilen erstrecken, sind Schächte oder Risse und werden Fels. Flache Spitzen von Kammern und Gängen
 * (kurze Ausdehnung) bleiben.
 * @returns {number} gefüllte Zellen
 */
function fuelleSchaechte(maske, wasserY, minBreite = SCHACHT_MIN_BREITE) {
  const B = maske.breite;
  const H = Math.min(maske.hoehe, wasserY);
  const bm = maske.bitmap;
  const schmal = new Uint8Array(B * H);
  for (let y = 0; y < H; y += 1) {
    let x = 0;
    while (x < B) {
      if (bm[y * B + x]) { x += 1; continue; }
      const a = x;
      while (x < B && !bm[y * B + x]) x += 1;
      if (a > 0 && x < B && x - a < minBreite) schmal.fill(1, y * B + a, y * B + x);
    }
  }
  let stapel = new Int32Array(1 << 16);
  const sichere = (n) => { if (n >= stapel.length) { const g = new Int32Array(stapel.length * 2); g.set(stapel); stapel = g; } };
  // Zustand: 1 schmal, 2 besucht (Ausdehnung zu klein), 3 besucht (Schacht, wird gefüllt)
  const flute = (k0, von, nach, messe) => {
    let sp = 0;
    let yMin = H;
    let yMax = 0;
    let n = 0;
    stapel[sp++] = k0;
    schmal[k0] = nach;
    while (sp > 0) {
      const k = stapel[--sp];
      n += 1;
      const x = k % B;
      const y = (k - x) / B;
      if (messe) { if (y < yMin) yMin = y; if (y > yMax) yMax = y; } else bm[k] = 1;
      sichere(sp + 4);
      if (x > 0 && schmal[k - 1] === von) { schmal[k - 1] = nach; stapel[sp++] = k - 1; }
      if (x < B - 1 && schmal[k + 1] === von) { schmal[k + 1] = nach; stapel[sp++] = k + 1; }
      if (y > 0 && schmal[k - B] === von) { schmal[k - B] = nach; stapel[sp++] = k - B; }
      if (y < H - 1 && schmal[k + B] === von) { schmal[k + B] = nach; stapel[sp++] = k + B; }
    }
    return messe ? yMax - yMin + 1 : n;
  };
  let gefuellt = 0;
  for (let k0 = 0; k0 < B * H; k0 += 1) {
    if (schmal[k0] !== 1) continue;
    if (flute(k0, 1, 2, true) >= SCHACHT_MIN_BREITE) gefuellt += flute(k0, 2, 3, false);
  }
  return gefuellt;
}

/**
 * Fassung 12: Landerampe am Brückenende. Ab der Planke folgt die Oberfläche dem Land jenseits der Kante mit höchstens `NAHT_STEIGUNG_MAX` je Spalte
 * (Land darüber wird abgetragen, Mulden werden aufgeschüttet), bis sie die natürliche Oberkante erreicht (höchstens `LANDERAMPE_LAENGE` px).
 * So endet die Brücke nicht an einer Stufe oder Wand, die ein Gehender nicht nimmt.
 */
function landeRampe(maske, x, y, richtung, wasserY) {
  let linie = y;
  let gleich = 0;
  for (let i = 0; i <= LANDERAMPE_LAENGE; i += 1) {
    const c = x + richtung * i;
    if (c < 1 || c >= maske.breite - 1) break;
    const ziel = oben(maske, c);
    if (ziel < 0 || ziel >= wasserY - 20) break;
    linie += Math.max(-NAHT_STEIGUNG_MAX, Math.min(NAHT_STEIGUNG_MAX, ziel - linie));
    const l = Math.round(linie);
    if (l < ziel) maske.rechteck(c, l, c + 1, ziel);
    else if (l > ziel) maske.rechteck(c, ziel, c + 1, l, 0);
    // Kruste unter der Linie (auch wo darunter Luft liegt, etwa unter einem dünnen Überhang).
    maske.rechteck(c, l, c + 1, l + NAHT_KRUSTE, 1);
    // Freier Raum über der Landerampe (zwei Figurenhöhen), damit kein Überhang den Weg verengt.
    maske.rechteck(c, l - NAHT_FREI, c + 1, l, 0);
    gleich = l === ziel ? gleich + 1 : 0;
    if (gleich >= 40) break;
  }
}

/** Fassung 12: Brücke aus einer 40 px dicken Planke, bündig mit den Landkanten (Oberkante bei `y0` links, `y1` rechts, linear, an den Enden 12 px in das Land hinein). */
function bruecke12(maske, x0, x1, y0, y1) {
  const n = Math.max(1, Math.round(x1 - x0));
  const E = 12;
  for (let x = x0 - E; x < x1 + E; x += 1) {
    const t = Math.max(0, Math.min(1, (x - x0) / n));
    const y = Math.round(y0 + (y1 - y0) * t);
    maske.rechteck(x, y, x + 1, y + BRUECKE_DICKE);
  }
}

/**
 * Fassung 13: Brückenpfeiler als Felssäule: unter der Planke `PFEILER_KOPF_13` px breit, nach unten kegelig bis höchstens `PFEILER_FUSS_MAX_13`
 * (Zuwachs `PFEILER_KEGEL_13` je Höhenpixel), mit welligem Rand und einem kleinen Fuß am Grund. Statt eines 40-px-Mastes über 1000 px.
 */
function pfeiler13(maske, px, yOben, yUnten) {
  const hoehe = Math.max(1, yUnten - yOben);
  for (let y = Math.floor(yOben); y < Math.ceil(yUnten); y += 1) {
    const d = y - yOben;
    const kegel = Math.min(PFEILER_FUSS_MAX_13 - PFEILER_KOPF_13, d * PFEILER_KEGEL_13);
    const fuss = d > hoehe - 60 ? ((d - (hoehe - 60)) / 60) * 28 : 0;
    const welle = 5 * Math.sin(y / 23 + px * 0.37) + 4 * Math.sin(y / 9.7 + px);
    const b = PFEILER_KOPF_13 + kegel + fuss + welle;
    maske.rechteck(px - b / 2, y, px + b / 2, y + 1);
  }
}

/** Oberkante des Landes, das auf dem Grund steht (Flutfüllung von der Zeile `wasserY − 60`), je Spalte; −1 ohne. Schwebendes zählt nicht. */
function standOberkanten(maske, wasserY) {
  const B = maske.breite;
  const H = maske.hoehe;
  const bm = maske.bitmap;
  const stand = new Uint8Array(B * H);
  const stapel = new Int32Array(B * H);
  let sp = 0;
  const yT = Math.min(H - 1, wasserY - 60);
  for (let x = 0; x < B; x += 1) if (bm[yT * B + x]) { stand[yT * B + x] = 1; stapel[sp++] = yT * B + x; }
  while (sp > 0) {
    const q = stapel[--sp];
    const x = q % B;
    const y = (q - x) / B;
    if (x > 0 && !stand[q - 1] && bm[q - 1]) { stand[q - 1] = 1; stapel[sp++] = q - 1; }
    if (x < B - 1 && !stand[q + 1] && bm[q + 1]) { stand[q + 1] = 1; stapel[sp++] = q + 1; }
    if (y > 0 && !stand[q - B] && bm[q - B]) { stand[q - B] = 1; stapel[sp++] = q - B; }
    if (y < H - 1 && !stand[q + B] && bm[q + B]) { stand[q + B] = 1; stapel[sp++] = q + B; }
  }
  const o = new Int32Array(B).fill(-1);
  for (let x = 0; x < B; x += 1) for (let y = 0; y < H; y += 1) if (stand[y * B + x]) { o[x] = y; break; }
  return o;
}

/**
 * Fassung 13: hohe senkrechte Wände zu trockenem Land hin (Oberkante fällt auf 4 Spalten um mindestens `WAND_FALL_13`, der Fuß liegt über der Wasserlinie; Steilküsten zum
 * Wasser bleiben) bekommen eine steile Schutthalde (Böschung
 * `WAND_BOESCHUNG_13`, Höhe je Spalte) vom Rand der Krone bis dorthin, wo sie das Land darunter trifft. Es wird nur Land hinzugefügt (Luft zwischen
 * Linie und Oberkante des Standlandes); trifft eine Spalte vorher auf Schwebendes, bleibt sie unberührt. Begehbarkeit kann so nur steigen.
 * @returns {number} Zahl der Wände
 */
function schraegeWaende13(maske, wasserY) {
  const B = maske.breite;
  const H = maske.hoehe;
  const bm = maske.bitmap;
  const s = standOberkanten(maske, wasserY);
  let waende = 0;
  // Probelauf: trifft die Halde in einer Spalte auf Schwebendes (Ledge, Insel), bleibt die Wand, wie sie ist (sonst entstünden senkrechte Streifen).
  const halde = (x, richtung, yKrone) => {
    for (const echt of [false, true]) {
      for (let k = 1; k < 1400; k += 1) {
        const c = x + richtung * k;
        if (c < 0 || c >= B) break;
        const linie = Math.round(yKrone + WAND_BOESCHUNG_13 * k);
        const sc = s[c] < 0 ? H : s[c];
        if (k > 8 && linie >= sc) break;
        for (let y = Math.max(0, linie); y < sc && y < H; y += 1) {
          if (bm[y * B + c]) { if (!echt) return false; break; }
          if (echt) bm[y * B + c] = 1;
        }
      }
    }
    return true;
  };
  // Der Fuß muss eine Ebene sein (die nächsten 100 px bleiben höchstens 100 px auf und ab): eine Schlucht, deren Gegenwand nah steht, bleibt Schlucht.
  const eben = (x, richtung) => {
    for (let k = 0; k <= 100; k += 8) {
      const c = x + richtung * k;
      if (c < 0 || c >= B || s[c] < 0 || Math.abs(s[c] - s[x]) > 100) return false;
    }
    return true;
  };
  for (let x = 0; x + 4 < B; x += 1) {
    if (s[x] >= 0 && s[x + 4] >= 0 && s[x + 4] < wasserY - 20 && s[x + 4] - s[x] >= WAND_FALL_13 && eben(x + 4, 1)) {
      if (halde(x, 1, s[x])) waende += 1;
      while (x + 4 < B && s[x + 4] - s[x] >= WAND_FALL_13) x += 1;
    }
  }
  for (let x = B - 1; x - 4 >= 0; x -= 1) {
    if (s[x] >= 0 && s[x - 4] >= 0 && s[x - 4] < wasserY - 20 && s[x - 4] - s[x] >= WAND_FALL_13 && eben(x - 4, -1)) {
      if (halde(x, -1, s[x])) waende += 1;
      while (x - 4 >= 0 && s[x - 4] - s[x] >= WAND_FALL_13) x -= 1;
    }
  }
  return waende;
}

/** Fassung 13: Schachtfüllung für Karten ohne Zonen (unter 2800 px) auf einer fertigen Bitmap. @returns {number} gefüllte Zellen */
export function fuelleSchaechteKarte(bitmap, width, height, wasserY) {
  return fuelleSchaechte({ breite: width, hoehe: height, bitmap }, wasserY, SCHACHT_MIN_BREITE_13);
}

/**
 * Fassung 11: verbindet die großen Landmassen der Karte durch Träger-Brücken (Planke von Kante zu Kante, Stützen bis zum Grund, wo die
 * Planke nahe über dem Wasser liegt). Eine Landmasse zählt, wenn ihre Oberkante in mindestens 8 % der Spalten trocken (über der
 * Wasserlinie) liegt. Benachbarte Landmassen (nach der mittleren Spalte geordnet) verbindet eine Brücke zwischen den nächsten
 * Oberkantenpunkten mit 24 bis 800 px waagerechtem Abstand und höchstens 1,2 Steigung. Das erledigt die Prüfung „alles trockene Land auf
 * EINER Fläche“ (`terrainGen3.zonenSpielbar`) an der Karte selbst, statt die Karte zu verwerfen. Rechnet auf einem Viertel der Auflösung.
 */
function verbindeLandmassen(maske, rng, wasserY, stat, v12 = false, v13 = false) {
  const B = maske.breite;
  const H = maske.hoehe;
  const S = 4;
  const w = Math.floor(B / S);
  const h = Math.floor(H / S);
  const bm = maske.bitmap;
  const klein = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) klein[y * w + x] = bm[(y * S + 2) * B + x * S + 2];
  const marke = new Int32Array(w * h).fill(-1);
  const stapel = new Int32Array(w * h);
  let anzahl = 0;
  for (let i = 0; i < w * h; i += 1) {
    if (!klein[i] || marke[i] >= 0) continue;
    let sp = 0;
    stapel[sp++] = i;
    marke[i] = anzahl;
    while (sp > 0) {
      const k = stapel[--sp];
      const x = k % w;
      const y = (k - x) / w;
      if (x > 0 && klein[k - 1] && marke[k - 1] < 0) { marke[k - 1] = anzahl; stapel[sp++] = k - 1; }
      if (x < w - 1 && klein[k + 1] && marke[k + 1] < 0) { marke[k + 1] = anzahl; stapel[sp++] = k + 1; }
      if (y > 0 && klein[k - w] && marke[k - w] < 0) { marke[k - w] = anzahl; stapel[sp++] = k - w; }
      if (y < h - 1 && klein[k + w] && marke[k + w] < 0) { marke[k + w] = anzahl; stapel[sp++] = k + w; }
    }
    anzahl += 1;
  }
  // Oberkante je Spalte und ihre Landmasse (nur trocken).
  const flaecheVon = new Int32Array(w).fill(-1);
  const hoeheVon = new Int32Array(w).fill(-1);
  const spalten = new Map();
  for (let x = 0; x < w; x += 1) {
    for (let y = 0; y < h; y += 1) {
      if (marke[y * w + x] < 0) continue;
      if (y * S < wasserY - 20) {
        flaecheVon[x] = marke[y * w + x];
        hoeheVon[x] = y * S;
        let l = spalten.get(flaecheVon[x]);
        if (!l) { l = []; spalten.set(flaecheVon[x], l); }
        l.push(x);
      }
      break;
    }
  }
  const gross = [...spalten.entries()].filter(([, l]) => l.length >= w * 0.08).map(([id, l]) => ({ id, l, mitte: l.reduce((a, c) => a + c, 0) / l.length }));
  gross.sort((a, b) => a.mitte - b.mitte);
  const liste = [];
  const kandidaten = [];
  const wurzel = new Map(gross.map((g) => [g.id, g.id]));
  const finde = (i) => { while (wurzel.get(i) !== i) i = wurzel.get(i); return i; };
  for (let i = 0; i + 1 < gross.length; i += 1) {
    const A = gross[i];
    const Bf = gross[i + 1];
    if (finde(A.id) === finde(Bf.id)) continue;
    let beste = null;
    for (let a = 0; a < A.l.length; a += 2) {
      for (let b = 0; b < Bf.l.length; b += 2) {
        const xa = A.l[a];
        const xb = Bf.l[b];
        const dx = (xb - xa) * S;
        if (dx < 24 || dx > 800) continue;
        const dy = hoeheVon[xb] - hoeheVon[xa];
        if (Math.abs(dy) > dx * (v12 ? BRUECKE_STEIGUNG_MAX : 1.2)) continue;
        const d = dx * dx + dy * dy;
        if (v12) kandidaten.push({ d, xa: xa * S + 2, xb: xb * S + 2, ya: hoeheVon[xa], yb: hoeheVon[xb] });
        else if (!beste || d < beste.d) beste = { d, xa: xa * S + 2, xb: xb * S + 2, ya: hoeheVon[xa], yb: hoeheVon[xb] };
      }
    }
    if (v12) {
      // Fassung 12: nächstes Paar, über dessen Planke der Weg frei ist (nichts Festes in den zwei Figurenhöhen darüber, kein Land mitten in der Spanne).
      kandidaten.sort((p, q) => p.d - q.d);
      beste = kandidaten.find((c) => {
        // Genaue Oberkanten der Endspalten (das Viertelraster liegt bis 3 px daneben); die Steigungsgrenze gilt für die gebaute Planke.
        c.ya = oben(maske, c.xa);
        c.yb = oben(maske, c.xb);
        if (Math.abs(c.yb - c.ya) > (c.xb - c.xa) * BRUECKE_STEIGUNG_MAX) return false;
        for (let x = c.xa + 16; x <= c.xb - 16; x += 4) {
          const y = c.ya + ((c.yb - c.ya) * (x - c.xa)) / (c.xb - c.xa);
          for (let yy = Math.floor((y - BRUECKE_FREI) / S); yy <= Math.floor((y + 4) / S); yy += 1) if (yy >= 0 && yy < h && klein[yy * w + Math.floor(x / S)]) return false;
        }
        return true;
      }) ?? null;
      kandidaten.length = 0;
    }
    if (!beste) continue;
    let { xa, xb } = beste;
    if (v12) {
      // Genaue Oberkanten an den Endspalten (das Viertelraster liegt bis 3 px daneben). Liegt das Land jenseits der Kante schon über der Planke
      // (die Planke ginge in den Fels), beginnt die Brücke erst dort, wo sie aus dem Fels tritt: bündig, ohne Stufe.
      let ya = oben(maske, xa);
      let yb = oben(maske, xb);
      const a0 = xa;
      const b0 = xb;
      const ya0 = ya;
      const yb0 = yb;
      const linie = (x) => ya0 + ((yb0 - ya0) * (x - a0)) / (b0 - a0);
      while (xa + 1 < b0 && oben(maske, xa + 1) >= 0 && oben(maske, xa + 1) <= linie(xa + 1) + 2) xa += 1;
      while (xb - 1 > xa && oben(maske, xb - 1) >= 0 && oben(maske, xb - 1) <= linie(xb - 1) + 2) xb -= 1;
      if (xb - xa < 24) { xa = a0; xb = b0; ya = ya0; yb = yb0; } else if (xa !== a0 || xb !== b0) { ya = Math.round(linie(xa)); yb = Math.round(linie(xb)); }
      liste.push({ xa, xb, ya, yb });
      bruecke12(maske, xa, xb, ya, yb);
      landeRampe(maske, xb, yb, 1, wasserY);
      landeRampe(maske, xa, ya, -1, wasserY);
      const clear = wasserY - Math.max(ya, yb) - BRUECKE_DICKE;
      if (clear > 120) {
        // Fassung 13: Je höher die Brücke, desto weniger und desto breitere Säulen (Abstand wächst mit der Höhe).
        const abstand = v13 ? Math.max(BRUECKE_STUETZEN_ABSTAND, clear * 0.8) : BRUECKE_STUETZEN_ABSTAND;
        const stuetzen = Math.max(1, Math.round((xb - xa) / abstand) - 1);
        for (let k = 1; k <= stuetzen; k += 1) {
          const t = k / (stuetzen + 1);
          const px = Math.round(xa + (xb - xa) * t);
          if (v13) { pfeiler13(maske, px, ya + (yb - ya) * t + BRUECKE_DICKE - 2, wasserY + 175); continue; }
          maske.rechteck(px - BRUECKE_STUETZEN_BREITE / 2, ya + (yb - ya) * t + BRUECKE_DICKE - 2, px + BRUECKE_STUETZEN_BREITE / 2, wasserY + 175);
        }
        stat.pfeiler += stuetzen;
      }
    } else {
      const { ya, yb } = beste;
      liste.push({ xa, xb, ya, yb });
      bruecke(maske, xa - 6, xb + 6, ya + 4, yb + 4);
      if (Math.max(ya, yb) > wasserY - 450) {
        const stuetzen = Math.max(1, Math.round((xb - xa) / 170) - 1);
        for (let k = 1; k <= stuetzen; k += 1) {
          const t = k / (stuetzen + 1);
          pfeiler(maske, rng, xa + (xb - xa) * t, ya + (yb - ya) * t + 8, wasserY + 175, 26);
        }
        stat.pfeiler += stuetzen;
      }
    }
    stat.bruecken += 1;
    wurzel.set(finde(A.id), finde(Bf.id));
  }
  return liste;
}

/**
 * Mehrzonen-Karte für breite Formate (Geländefassung 10, `config.gelaende` ≥ 10).
 *
 * Die Breite wird in `n = round(Breite / 2000)` Zonen geteilt. Jede Zone zieht ihre eigene Kartenart (nie dieselbe wie die Nachbarzone;
 * eine ausdrücklich gewählte Vorlage gilt für die mittlere Zone), wird in einer eigenen Maske gebaut (Breite = Zone + Überlappung) und an
 * den Nähten über 300 px mit zweidimensionalem Rauschen gemischt. Alle Zonen teilen die Wasserlinie `0,86·H` und den Grund darunter.
 * Danach räumt `raeumeAuf` die Naht auf, und an jeder Naht mit Lücke trägt eine Brücke über das Wasser.
 *
 * Reiner Seed-Zufall (`rng.next()`), keine zweite Quelle.
 *
 * @returns {{bitmap:Uint8Array, wasserY:number, bauteile:object, art:string, umlauf:boolean, rund:boolean, planetenart:null, zonen:string[]}}
 *   `art` ist die Art der mittleren Zone (damit Kulisse und Charakter weiter eine gültige Kartenart sehen)
 */
export function erzeugeZonenKarte({ rng, width, height, art = null, fassung = 10, speicher = null }) {
  const n = zonenZahl(width);
  const maske = new Maske(width, height);
  maske.begehbar = fassung >= 8;
  maske.fensterZu = fassung >= 9;
  const stat = neuesStat();
  const wasserY = Math.round(height * ZONEN_WASSER);
  const mitte = Math.floor(n / 2);
  let zonen = [];
  const halb = ZONEN_UEBERLAPP / 2;
  const zb = width / n;
  const maske2 = [];
  const baueZone = (i, artI) => {
    const xa = i === 0 ? 0 : Math.round(i * zb - halb);
    const xb = i === n - 1 ? width : Math.round((i + 1) * zb + halb);
    const sub = new Maske(xb - xa, height);
    sub.begehbar = maske.begehbar;
    sub.fensterZu = maske.fensterZu;
    const eigen = fassung >= 11 ? neuesStat() : stat;
    ZONEN_BAUER[artI](sub, rng, sub.breite, height, eigen);
    return { xa, xb, sub, stat: eigen };
  };
  // Fassung 11: Der Zwischenspeicher des Aufrufers hält die gebauten Zonen über die Ziehungen hinweg. Eine misslungene Karte zieht nur EINE Zone
  // neu (reihum, die ausdrücklich gewählte Mittelzone bleibt); die übrigen Zonen kosten nichts, die Mischzonen bekommen frisches Rauschen.
  const wiederholung = fassung >= 11 && speicher && speicher.zonen && speicher.zonen.length === n;
  if (wiederholung) {
    zonen = speicher.zonen.slice();
    let k = speicher.naechste % n;
    if (n > 1 && k === mitte && ZONEN_ARTEN.includes(art)) k = (k + 1) % n;
    speicher.naechste = k + 1;
    const erlaubt = ZONEN_ARTEN.filter((a) => a !== zonen[k] && a !== zonen[k - 1] && a !== zonen[k + 1]
      && !(n > 2 && k === 0 && a === zonen[n - 1]) && !(n > 2 && k === n - 1 && a === zonen[0]));
    zonen[k] = erlaubt[Math.floor(rng.next() * erlaubt.length)];
    speicher.zonen = zonen;
    speicher.maske2[k] = baueZone(k, zonen[k]);
  } else {
    for (let i = 0; i < n; i += 1) {
      let wahl;
      if (i === mitte && ZONEN_ARTEN.includes(art)) {
        wahl = art;
      } else {
        // Nie dieselbe Art wie die Nachbarzone (links); die letzte Zone auch nicht wie die erste, solange es Auswahl gibt.
        const erlaubt = ZONEN_ARTEN.filter((a) => a !== zonen[i - 1] && !(i === n - 1 && n > 2 && a === zonen[0]));
        wahl = erlaubt[Math.floor(rng.next() * erlaubt.length)];
      }
      zonen.push(wahl);
    }
    for (let i = 0; i < n; i += 1) maske2.push(baueZone(i, zonen[i]));
    if (fassung >= 11 && speicher) { speicher.zonen = zonen; speicher.maske2 = maske2; speicher.naechste = 0; }
  }
  if (wiederholung) maske2.push(...speicher.maske2);
  if (fassung >= 11) for (const z of maske2) for (const k of Object.keys(stat)) stat[k] += z.stat[k];
  const bm = maske.bitmap;
  const naehte = [];
  let bruecken = [];
  const aus = (z, x, y) => z.sub.bitmap[y * z.sub.breite + (x - z.xa)];
  // Zone i besitzt die Spalten [von_i, bis_i); dazwischen liegt je Naht eine Mischzone von 300 px.
  const von = (i) => (i === 0 ? 0 : Math.round(i * zb + halb));
  const bis = (i) => (i === n - 1 ? width : Math.round((i + 1) * zb - halb));
  for (let i = 0; i < n; i += 1) {
    const z = maske2[i];
    const v = von(i);
    const b = bis(i);
    for (let y = 0; y < height; y += 1) bm.set(z.sub.bitmap.subarray(y * z.sub.breite + (v - z.xa), y * z.sub.breite + (b - z.xa)), y * width + v);
  }
  // Mischzone je Naht: zweidimensionales Rauschen entscheidet punktweise, ob links oder rechts gilt; der rechte Anteil wächst über die Naht.
  for (let i = 0; i + 1 < n; i += 1) {
    const feld = rausch2(rng, ZONEN_UEBERLAPP, height, 90);
    const x0 = bis(i);
    if (fassung >= 12) {
      naehte.push(mischeNaht12(bm, width, height, wasserY, maske2[i], maske2[i + 1], x0, von(i + 1), feld, fassung >= 13, rng));
      continue;
    }
    if (fassung >= 11) {
      mischeNaht(bm, width, height, wasserY, maske2[i], maske2[i + 1], x0, von(i + 1), feld);
      continue;
    }
    for (let x = x0; x < von(i + 1); x += 1) {
      const t = (x - x0) / ZONEN_UEBERLAPP;
      for (let y = 0; y < height; y += 1) {
        const rechts = (t - 0.5) * 2 + feld(x - x0, y) * 0.8 > 0;
        bm[y * width + x] = aus(maske2[rechts ? i + 1 : i], x, y);
      }
    }
  }
  // Grund: unterhalb der Wasserlinie massiv (wie bei den Einzelkarten), davor Wasser.
  maske.rechteck(0, wasserY + 170, width, height);
  raeumeAuf(maske);
  if (fassung >= 11) {
    // Fassung 11: Schwebereste (kleine Landstücke abseits der Hauptfläche) weg, dann Brücken zwischen den großen Landmassen.
    raeumeAuf(maske, SPLITTER_LAEUFE);
    if (fassung >= 12) fuelleSchaechte(maske, wasserY, fassung >= 13 ? SCHACHT_MIN_BREITE_13 : SCHACHT_MIN_BREITE);
    if (fassung >= 13) schraegeWaende13(maske, wasserY);
    bruecken = verbindeLandmassen(maske, rng, wasserY, stat, fassung >= 12, fassung >= 13);
    // Stützen neben einer Wand lassen Schlitze: noch einmal füllen.
    if (fassung >= 12) fuelleSchaechte(maske, wasserY, fassung >= 13 ? SCHACHT_MIN_BREITE_13 : SCHACHT_MIN_BREITE);
  } else {
    for (let i = 1; i < n; i += 1) nahtBruecke(maske, rng, Math.round(i * zb), wasserY, stat);
  }
  return { bitmap: maske.bitmap, wasserY, bauteile: stat, art: zonen[mitte], umlauf: false, rund: false, planetenart: null, zonen, naehte, bruecken };
}

/**
 * @param {object} o
 * @param {{next:function():number}} o.rng - Seed-Zweig des Geländes
 * @param {number} o.width
 * @param {number} o.height
 * @param {number} [o.fassung] - Geländefassung (`config.gelaende`); ab 8 begehbare Ruinen, ab 9 Fenster unter der Krone
 * @param {string} [o.art] - eine Kartenart aus `KARTENARTEN`; ohne Angabe zieht der Seed (Hochformat: `hochkant`)
 * @returns {{bitmap:Uint8Array, wasserY:number, bauteile:object, art:string, umlauf:boolean, rund:boolean}} `umlauf`: die Karte verlangt die Regel „rechts hinaus, links hinein“; `rund`: Körper mit Radialform; `planetenart`: nur beim Planeten die vom Seed gezogene Art (`planet_*`)
 */
export function erzeugeKompositionsKarte({ rng, width, height, art = null, fassung = 0 }) {
  const maske = new Maske(width, height);
  // Geländefassung 8: begehbare Ruinen (Schutthalden, flache Krone). Ältere Fassungen bauen Bit für Bit wie bisher.
  maske.begehbar = fassung >= 8;
  // Geländefassung 9: Ruinenfenster bleiben unter der Krone (kein offener Schacht).
  maske.fensterZu = fassung >= 9;
  const gezogen = KARTENARTEN[Math.floor(rng.next() * (KARTENARTEN.length - 1))];
  const wahl = KARTENARTEN.includes(art) ? art : (height > width * 1.2 ? 'hochkant' : gezogen);
  const stat = neuesStat();
  const sonder = { ebenen: dichteEbenen, insel: dichteInsel, inselgruppe: dichteGruppe, hoehle: dichteHoehle, hoehleInsel: (m, r, b, h, st) => dichteHoehle(m, r, b, h, st, true), hochkant: dichteHochkant, schlucht: dichteSchlucht, archipel: (m, r, b, h, st) => dichteGruppe(m, r, b, h, st, true), vulkan: dichteVulkan, ruinenstadt: dichteRuinenstadt, pyramide: kartePyramide, planet: kartePlanet, unmoeglich: karteUnmoeglich }[wahl];
  if (sonder) {
    const wy = sonder(maske, rng, width, height, stat);
    // Hoher Wasserspiegel (Inselkarten): mehr Wassertiefe, der Grund liegt tiefer.
    maske.rechteck(0, wy + (wy < height * 0.9 ? 170 : 60), width, height);
    return { bitmap: maske.bitmap, wasserY: wy, bauteile: stat, art: wahl, umlauf: maske.umlauf, rund: maske.rund, planetenart: maske.planetenart };
  }
  const wasserY = Math.round(height * 0.9);
  const ebenenZahl = width / height > 1.6 ? 3 : 4;

  // Ebenen von unten nach oben; jede Ebene besteht aus 1–3 Platten mit Lücken.
  const ebenen = [];
  for (let e = 0; e < ebenenZahl; e += 1) {
    const yMitte = height * (0.76 - e * (0.5 / Math.max(1, ebenenZahl - 1))) + zwischen(rng, -14, 14);
    const dicke = zwischen(rng, 70, 110) * (e === 0 ? 1.25 : 1);
    const anzahl = e === 0 ? 1 + Math.floor(rng.next() * 2) : 1 + Math.floor(rng.next() * 2);
    const lueckenAnteil = e === 0 ? 0.1 : 0.22;
    const segmentBreite = width * (1 - lueckenAnteil) / anzahl;
    const platten = [];
    let x = width * zwischen(rng, 0.0, 0.05);
    for (let p = 0; p < anzahl; p += 1) {
      const b = segmentBreite * zwischen(rng, 0.8, 1.1);
      const x1 = Math.min(width, x + b);
      platten.push(platte(maske, rng, x, x1, yMitte, dicke));
      stat.platten += 1;
      x = x1 + (width * lueckenAnteil / Math.max(1, anzahl - 1 || 1)) * zwischen(rng, 0.6, 1.4);
      if (x >= width) break;
    }
    ebenen.push({ yMitte, dicke, platten });
  }

  // Pfeiler und Rampen zwischen übereinanderliegenden Ebenen.
  for (let e = 1; e < ebenen.length; e += 1) {
    const unten = ebenen[e - 1];
    const oben = ebenen[e];
    for (const p of oben.platten) {
      const n = 1 + Math.floor(rng.next() * 2);
      for (let i = 0; i < n; i += 1) {
        const x = zwischen(rng, p.x0 + (p.x1 - p.x0) * 0.2, p.x1 - (p.x1 - p.x0) * 0.2);
        const stuetze = unten.platten.find((q) => x > q.x0 + 30 && x < q.x1 - 30);
        if (!stuetze) continue;
        pfeiler(maske, rng, x, p.untenY(x) - 4, stuetze.obenY(x) + 6, zwischen(rng, 34, 64));
        stat.pfeiler += 1;
      }
    }
  }

  // Brücken über Lücken innerhalb einer Ebene.
  for (const eb of ebenen) {
    for (let i = 0; i + 1 < eb.platten.length; i += 1) {
      const a = eb.platten[i];
      const b = eb.platten[i + 1];
      if (b.x0 - a.x1 > 8 && b.x0 - a.x1 < width * 0.3) {
        bruecke(maske, a.x1 - 6, b.x0 + 6, a.obenY(a.x1 - 6), b.obenY(b.x0 + 6));
        stat.bruecken += 1;
      }
    }
  }

  // Hohlräume in dicken Platten.
  for (const eb of ebenen) {
    for (const p of eb.platten) {
      if (p.x1 - p.x0 < 260 || rng.next() < 0.35) continue;
      const cx = zwischen(rng, p.x0 + 90, p.x1 - 90);
      const y = (p.obenY(cx) + p.untenY(cx)) / 2;
      maske.ellipse(cx, y, zwischen(rng, 34, 70), eb.dicke * 0.22, 0);
      stat.hoehlen += 1;
    }
  }

  // Bauten auf den Platten (nicht in der untersten Ebene ganz außen).
  for (const eb of ebenen) {
    for (const p of eb.platten) {
      if (p.x1 - p.x0 < 220) continue;
      const wurf = rng.next();
      const x = zwischen(rng, p.x0 + 70, p.x1 - 150);
      const y = p.obenY(x + 40) + 2;
      if (wurf < 0.4) {
        turm(maske, rng, x, y, zwischen(rng, 70, 96), Math.min(zwischen(rng, 110, 190), y - 24));
        stat.tuerme += 1;
      } else if (wurf < 0.75) {
        bogen(maske, x, y, zwischen(rng, 90, 140), zwischen(rng, 60, 90));
        stat.boegen += 1;
      }
    }
  }

  // Wasserbecken: unterhalb der Wasserlinie ist der Boden massiv (Grund), davor Wasser.
  maske.rechteck(0, wasserY + 40, width, height);
  return { bitmap: maske.bitmap, wasserY, bauteile: stat, art: wahl, umlauf: false, rund: false, planetenart: null };
}
