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

/** Eine große Insel mit kegelförmigem Sockel, Nebenfelsen und Bauten. */
function karteInsel(maske, rng, B, H, stat) {
  const dicke = zwischen(rng, 180, 260);
  const x0 = B * zwischen(rng, 0.12, 0.2);
  const x1 = B * zwischen(rng, 0.8, 0.88);
  const p = platte(maske, rng, x0, x1, H * 0.5, dicke);
  stat.platten += 1;
  for (let y = H * 0.5; y < H * 0.9; y += 2) {
    const t = (y - H * 0.5) / (H * 0.4);
    const breite = (x1 - x0) * 0.5 * Math.max(0.05, 1 - t * 0.9) ** 0.8;
    maske.rechteck((x0 + x1) / 2 - breite, y, (x0 + x1) / 2 + breite, y + 2);
  }
  bauteileAufPlatte(maske, rng, p, stat, 2);
  for (let i = 0; i < 2; i += 1) {
    const x = zwischen(rng, B * 0.02, B * 0.98);
    if (x > x0 - 40 && x < x1 + 40) continue;
    const kleine = platte(maske, rng, x - 60, x + 60, H * zwischen(rng, 0.55, 0.7), 60);
    void kleine;
    stat.platten += 1;
  }
  return Math.round(H * 0.92);
}

/** Drei bis fünf Inseln auf verschiedenen Höhen, teils mit Brücken. */
function karteInselgruppe(maske, rng, B, H, stat) {
  const n = 3 + Math.floor(rng.next() * 3);
  const inseln = [];
  for (let i = 0; i < n; i += 1) {
    const mitte = B * ((i + 0.5) / n) + zwischen(rng, -B * 0.03, B * 0.03);
    const breite = (B / n) * zwischen(rng, 0.55, 0.85);
    const y = H * zwischen(rng, 0.38, 0.7);
    const p = platte(maske, rng, mitte - breite / 2, mitte + breite / 2, y, zwischen(rng, 90, 170));
    stat.platten += 1;
    inseln.push(p);
    if (breite > 200 && rng.next() < 0.7) bauteileAufPlatte(maske, rng, p, stat, 1);
  }
  for (let i = 0; i + 1 < inseln.length; i += 1) {
    const a = inseln[i];
    const b = inseln[i + 1];
    if (rng.next() < 0.6 && b.x0 - a.x1 < B * 0.25) {
      bruecke(maske, a.x1 - 6, b.x0 + 6, a.obenY(a.x1 - 6), b.obenY(b.x0 + 6));
      stat.bruecken += 1;
    }
  }
  return Math.round(H * 0.9);
}

/** Ein Felsmassiv mit verbundenem Kammersystem; oben bleiben Öffnungen. */
function karteHoehle(maske, rng, B, H, stat, mitInsel = false) {
  const welle = baueRauschen(rng, B, 120);
  const feinW = baueRauschen(rng, B, 40);
  for (let x = 0; x < B; x += 1) {
    const oben = H * 0.2 + welle(x) * H * 0.06 + feinW(x) * 8;
    maske.rechteck(x, oben, x + 1, H);
  }
  const kammern = 4 + Math.floor(rng.next() * 3);
  const punkte = [];
  for (let i = 0; i < kammern; i += 1) {
    const x = B * ((i + 0.5) / kammern) + zwischen(rng, -B * 0.04, B * 0.04);
    const y = H * zwischen(rng, 0.45, 0.8);
    punkte.push({ x, y, rx: zwischen(rng, 70, 130), ry: zwischen(rng, 50, 90) });
  }
  for (let i = 0; i + 1 < punkte.length; i += 1) {
    const a = punkte[i];
    const b = punkte[i + 1];
    gang(maske, a.x, a.y + a.ry * 0.3, b.x, b.y + b.ry * 0.3, 24);
  }
  for (const k of punkte) {
    kammer(maske, k.x, k.y, k.rx, k.ry);
    stat.hoehlen += 1;
  }
  // Zwei bis drei Schächte zur Oberfläche.
  const schaechte = 2 + Math.floor(rng.next() * 2);
  for (let i = 0; i < schaechte; i += 1) {
    const k = punkte[Math.floor(rng.next() * punkte.length)];
    gang(maske, k.x + zwischen(rng, -30, 30), k.y - k.ry * 0.5, k.x + zwischen(rng, -60, 60), H * 0.14, 28);
  }
  if (mitInsel) {
    for (let i = 0; i < 2; i += 1) {
      const k = punkte[1 + Math.floor(rng.next() * (punkte.length - 2))];
      const p = platte(maske, rng, k.x - k.rx * 0.5, k.x + k.rx * 0.5, k.y - k.ry * 0.1, 36);
      stat.platten += 1;
      void p;
    }
  }
  stat.platten += 1;
  return Math.round(H * 0.92);
}

/** Zwei Hochebenen mit tiefem Einschnitt, Absätzen darin und einer Brücke. */
function karteSchlucht(maske, rng, B, H, stat) {
  const spalt = B * zwischen(rng, 0.22, 0.3);
  const xl = (B - spalt) / 2 + zwischen(rng, -B * 0.06, B * 0.06);
  const xr = xl + spalt;
  const obenL = H * zwischen(rng, 0.3, 0.42);
  const obenR = H * zwischen(rng, 0.3, 0.42);
  const wandL = baueRauschen(rng, H, 70);
  const wandR = baueRauschen(rng, H, 70);
  const kanteL = baueRauschen(rng, B, 90);
  const kanteR = baueRauschen(rng, B, 90);
  for (let y = 0; y < H; y += 1) {
    const a = xl + wandL(y) * 28;
    const b = xr + wandR(y) * 28;
    if (y >= obenL) maske.rechteck(0, y, a, y + 1);
    if (y >= obenR) maske.rechteck(b, y, B, y + 1);
  }
  for (let x = 0; x < xl; x += 1) maske.rechteck(x, obenL - 1 - Math.max(0, kanteL(x)) * 10, x + 1, obenL);
  for (let x = Math.floor(xr); x < B; x += 1) maske.rechteck(x, obenR - 1 - Math.max(0, kanteR(x)) * 10, x + 1, obenR);
  stat.platten += 2;
  const absaetze = 4 + Math.floor(rng.next() * 3);
  let links = rng.next() < 0.5;
  for (let i = 0; i < absaetze; i += 1) {
    const y = H * (0.45 + (0.38 * i) / Math.max(1, absaetze - 1));
    const l = spalt * zwischen(rng, 0.35, 0.55);
    const p = links ? platte(maske, rng, xl - 10, xl + l, y, zwischen(rng, 34, 60)) : platte(maske, rng, xr - l, xr + 10, y, zwischen(rng, 34, 60));
    void p;
    stat.platten += 1;
    links = !links;
  }
  if (spalt < B * 0.3 && rng.next() < 0.7) {
    bruecke(maske, xl - 8, xr + 8, obenL, obenR);
    stat.bruecken += 1;
  }
  const pl = { x0: 0, x1: xl, obenY: () => obenL };
  const pr = { x0: xr, x1: B, obenY: () => obenR };
  bauteileAufPlatte(maske, rng, pl, stat, 1);
  bauteileAufPlatte(maske, rng, pr, stat, 1);
  return Math.round(H * 0.9);
}

/** Viele kleine Inseln, dicht gestreut, mit Felsnadeln dazwischen. */
function karteArchipel(maske, rng, B, H, stat) {
  const ziel = 8 + Math.floor(rng.next() * 4);
  const inseln = [];
  for (let versuch = 0; versuch < ziel * 8 && inseln.length < ziel; versuch += 1) {
    const breite = zwischen(rng, 110, 260);
    const x = zwischen(rng, breite / 2 + 10, B - breite / 2 - 10);
    const y = H * zwischen(rng, 0.34, 0.76);
    if (inseln.some((i) => Math.abs(i.mitte - x) < (i.breite + breite) * 0.55 && Math.abs(i.y - y) < 110)) continue;
    const p = platte(maske, rng, x - breite / 2, x + breite / 2, y, zwischen(rng, 56, 120));
    inseln.push({ mitte: x, breite, y, p });
    stat.platten += 1;
    if (breite > 200 && rng.next() < 0.5) bauteileAufPlatte(maske, rng, p, stat, 1);
  }
  inseln.sort((a, b) => a.mitte - b.mitte);
  for (let i = 0; i + 1 < inseln.length; i += 1) {
    const a = inseln[i];
    const b = inseln[i + 1];
    const luecke = b.p.x0 - a.p.x1;
    if (luecke > 10 && luecke < 170 && rng.next() < 0.5) {
      bruecke(maske, a.p.x1 - 6, b.p.x0 + 6, a.p.obenY(a.p.x1 - 6), b.p.obenY(b.p.x0 + 6));
      stat.bruecken += 1;
    }
  }
  return Math.round(H * 0.9);
}

/** Ein Kegel mit Krater, Magaschacht und Lavakammer; kleine Inseln seitlich. */
function karteVulkan(maske, rng, B, H, stat) {
  const cx = B * zwischen(rng, 0.42, 0.58);
  const spitzeY = H * zwischen(rng, 0.24, 0.32);
  const fussY = H * 0.9;
  const basis = B * zwischen(rng, 0.62, 0.76);
  const hangRauschen = baueRauschen(rng, H, 36);
  for (let y = Math.floor(spitzeY); y < fussY; y += 1) {
    const t = (y - spitzeY) / (fussY - spitzeY);
    const halb = B * 0.07 + (basis / 2 - B * 0.07) * t ** 0.9 + hangRauschen(y) * 12;
    maske.rechteck(cx - halb, y, cx + halb, y + 1);
  }
  maske.ellipse(cx, spitzeY + 6, B * 0.055, 46, 0);
  gang(maske, cx, spitzeY + 30, cx, H * 0.66, 18);
  kammer(maske, cx, H * 0.7, B * 0.1, 56);
  stat.hoehlen += 2;
  for (const seite of [-1, 1]) {
    const x = cx + seite * B * zwischen(rng, 0.38, 0.46);
    if (x < 90 || x > B - 90) continue;
    const p = platte(maske, rng, x - 80, x + 80, H * zwischen(rng, 0.55, 0.7), 60);
    void p;
    stat.platten += 1;
  }
  stat.platten += 1;
  return Math.round(H * 0.93);
}

/** Zerfallende Stadt: Grundplatte, Türme verschiedener Höhe mit Brüchen, Brücken und Bögen. */
function karteRuinenstadt(maske, rng, B, H, stat) {
  const bodenY = H * 0.8;
  const wellig = baueRauschen(rng, B, 80);
  for (let x = 0; x < B; x += 1) maske.rechteck(x, bodenY + wellig(x) * 8, x + 1, H);
  stat.platten += 1;
  const n = 6 + Math.floor(rng.next() * 4);
  const tuerme = [];
  for (let i = 0; i < n; i += 1) {
    const breite = zwischen(rng, 62, 110);
    const x = (B - breite) * ((i + zwischen(rng, 0.1, 0.9)) / n);
    const hoehe = zwischen(rng, 110, 330);
    turm(maske, rng, x, bodenY + 2, breite, hoehe);
    maske.ellipse(x + zwischen(rng, 0.2, 0.8) * breite, bodenY - hoehe + 4, zwischen(rng, 16, 40), zwischen(rng, 14, 34), 0);
    tuerme.push({ x, breite, hoehe });
    stat.tuerme += 1;
  }
  for (let i = 0; i + 1 < tuerme.length; i += 1) {
    const a = tuerme[i];
    const b = tuerme[i + 1];
    const luecke = b.x - (a.x + a.breite);
    if (luecke > 20 && luecke < 260 && rng.next() < 0.6) {
      const y = bodenY - Math.min(a.hoehe, b.hoehe) * 0.6;
      bruecke(maske, a.x + a.breite - 4, b.x + 4, y, y);
      stat.bruecken += 1;
    } else if (luecke > 90 && rng.next() < 0.4) {
      bogen(maske, a.x + a.breite + 20, bodenY, Math.min(luecke - 40, 130), 70);
      stat.boegen += 1;
    }
  }
  return Math.round(H * 0.92);
}

/** Stufenpyramide mit Kammer und Gang, Dünen davor, eine kleine zweite am Rand. */
function kartePyramide(maske, rng, B, H, stat) {
  const bodenY = H * 0.8;
  const duene = baueRauschen(rng, B, 160);
  for (let x = 0; x < B; x += 1) maske.rechteck(x, bodenY + duene(x) * 16, x + 1, H);
  stat.platten += 1;
  const baue = (cx, basis, stufen, sh) => {
    for (let i = 0; i < stufen; i += 1) {
      const halb = (basis / 2) * (1 - (i / stufen) * 0.9);
      const y = bodenY - (i + 1) * sh;
      maske.rechteck(cx - halb, y, cx + halb, y + sh + 2);
    }
    return basis / 2;
  };
  const cx = B * zwischen(rng, 0.42, 0.58);
  const stufen = 7 + Math.floor(rng.next() * 4);
  const sh = H * 0.058;
  const halb = baue(cx, B * zwischen(rng, 0.4, 0.5), stufen, sh);
  kammer(maske, cx, bodenY - sh * 2.4, halb * 0.28, sh * 1.3);
  gang(maske, cx - halb + 6, bodenY - sh * 0.9, cx - halb * 0.2, bodenY - sh * 2, 16);
  stat.hoehlen += 1;
  const seite = cx < B / 2 ? 1 : -1;
  const kx = cx + seite * B * 0.34;
  if (kx > 110 && kx < B - 110) baue(kx, B * 0.17, 5, sh * 0.8);
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

/** Hochformat: Steilwände links und rechts, abwechselnd angesetzte Felsbänder, Mittelpfeiler. */
function karteHochkant(maske, rng, B, H, stat) {
  const wand = B * zwischen(rng, 0.12, 0.18);
  const wL = baueRauschen(rng, H, 90);
  const wR = baueRauschen(rng, H, 90);
  for (let y = 0; y < H; y += 1) {
    maske.rechteck(0, y, wand * (1 + wL(y) * 0.35), y + 1);
    maske.rechteck(B - wand * (1 + wR(y) * 0.35), y, B, y + 1);
  }
  const baender = 5 + Math.floor(rng.next() * 3);
  let links = rng.next() < 0.5;
  for (let i = 0; i < baender; i += 1) {
    const y = H * (0.2 + (0.7 * i) / (baender - 1));
    const laenge = B * zwischen(rng, 0.45, 0.65);
    const p = links
      ? platte(maske, rng, 0, laenge, y, zwischen(rng, 46, 80))
      : platte(maske, rng, B - laenge, B, y, zwischen(rng, 46, 80));
    stat.platten += 1;
    if (laenge > 260 && rng.next() < 0.5) bauteileAufPlatte(maske, rng, p, stat, 1);
    links = !links;
  }
  const saeule = zwischen(rng, B * 0.4, B * 0.6);
  pfeiler(maske, rng, saeule, H * 0.3, H * 0.95, zwischen(rng, 30, 50));
  stat.pfeiler += 1;
  return Math.round(H * 0.94);
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
  for (let i = 1; i <= fenster; i += 1) {
    const fy = bodenY - raumH - i * 100;
    maske.rechteck(x + breite * 0.5 - 12, fy - 54, x + breite * 0.5 + 12, fy, 0);
  }
  for (let z = x; z < x + breite; z += 16) {
    const ab = rng.next() * 80;
    if (ab > 14) maske.rechteck(z, bodenY - hoehe - 2, z + 16, bodenY - hoehe + ab, 0);
  }
}

function dichteInsel(maske, rng, B, H, stat) {
  const rauschen = fbm2(rng, B, H, 620, 5);
  const wurm = fbm2(rng, B, H, 300, 3);
  const cx = B * zwischen(rng, 0.46, 0.54);
  const cy = H * 0.44;
  const haupt = masse(cx, cy, B * zwischen(rng, 0.3, 0.36), H * 0.12, H * zwischen(rng, 0.3, 0.38), 430);
  const kleine = [-1, 1].map((s) => masse(cx + s * B * zwischen(rng, 0.38, 0.45), H * zwischen(rng, 0.5, 0.66), B * 0.1, H * 0.06, H * 0.16, 300));
  const d = (x, y) => {
    let w = Math.max(haupt(x, y), ...kleine.map((k) => k(x, y))) + rauschen(x, y) * 190;
    // Gewundene Tunnel im Inneren.
    if (y > cy + 60 && w > 60) w = Math.min(w, (Math.abs(wurm(x, y)) - 0.035) * 900);
    return w;
  };
  ausDichte(maske, rng, d);
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

/**
 * Räumt eine Höhlenmaske auf: Kleine abgeschlossene Lufttaschen werden zu Fels, winzige freie Felskrümel zu Luft. Übrig bleiben große
 * Räume und Gänge — keine Perlenketten aus Blasen. Ein Lauf über die Maske (Flutfüllung mit eigenem Stapel, 4-Nachbarn).
 */
function raeumeAuf(maske) {
  const B = maske.breite;
  const H = maske.hoehe;
  // Schwellen gelten für 2560×1440 und wachsen mit der Fläche.
  const flaeche = (B * H) / (2560 * 1440);
  const bm = maske.bitmap;
  const stapel = new Int32Array(B * H);
  // Zwei getrennte Läufe mit frischer Markierung: Das Füllen der Lufttaschen verbindet sonst Felskrümel mit dem Land,
  // und ein veralteter Befund würde das ganze Land wegräumen.
  for (const [art, schwelle] of [[0, 9000 * flaeche], [1, 1200 * flaeche]]) {
    const marke = new Uint8Array(B * H);
    for (let start = 0; start < B * H; start += 1) {
      if (marke[start] || bm[start] !== art) continue;
      let n = 0;
      let oben = false;
      let sp = 0;
      stapel[sp++] = start;
      marke[start] = 1;
      while (sp > 0) {
        const i = stapel[--sp];
        n += 1;
        const x = i % B;
        const y = (i - x) / B;
        if (y === 0) oben = true;
        if (x > 0 && !marke[i - 1] && bm[i - 1] === art) { marke[i - 1] = 1; stapel[sp++] = i - 1; }
        if (x < B - 1 && !marke[i + 1] && bm[i + 1] === art) { marke[i + 1] = 1; stapel[sp++] = i + 1; }
        if (y > 0 && !marke[i - B] && bm[i - B] === art) { marke[i - B] = 1; stapel[sp++] = i - B; }
        if (y < H - 1 && !marke[i + B] && bm[i + B] === art) { marke[i + B] = 1; stapel[sp++] = i + B; }
      }
      // Luft am oberen Rand ist der Himmel; Fels am Rand gehört zum Land.
      if (!oben && n < schwelle) fuelle(bm, B, H, start, art, 1 - art);
    }
  }
}

/** Setzt die zusammenhängende Fläche ab `start` (Wert `von`) auf `nach`. */
function fuelle(bm, B, H, start, von, nach) {
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
    for (let i = 0; i + 1 < r.length; i += 1) gang(maske, r[i].x, boden(r[i]) - 24, r[i + 1].x, boden(r[i + 1]) - 24, 42);
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

/**
 * @param {object} o
 * @param {{next:function():number}} o.rng - Seed-Zweig des Geländes
 * @param {number} o.width
 * @param {number} o.height
 * @param {string} [o.art] - eine Kartenart aus `KARTENARTEN`; ohne Angabe zieht der Seed (Hochformat: `hochkant`)
 * @returns {{bitmap:Uint8Array, wasserY:number, bauteile:object, art:string, umlauf:boolean, rund:boolean}} `umlauf`: die Karte verlangt die Regel „rechts hinaus, links hinein“; `rund`: Körper mit Radialform; `planetenart`: nur beim Planeten die vom Seed gezogene Art (`planet_*`)
 */
export function erzeugeKompositionsKarte({ rng, width, height, art = null }) {
  const maske = new Maske(width, height);
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
