/**
 * Kartengenerator „Komposition": Karten aus Bauteilen statt aus einem Höhenfeld.
 *
 * Das Höhenfeld (`terrainGen3`) kennt je Spalte eine Oberfläche; schwebende
 * Ebenen, Brücken, Türme und Räume sind damit nicht darstellbar. Hier legt der
 * Seed stattdessen mehrere Ebenen aus Platten, verbindet sie mit Pfeilern,
 * Rampen und Brücken und setzt Bauten (Turm, Bogen, Mauer) und Hohlräume dazu.
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
  const sonder = { insel: karteInsel, inselgruppe: karteInselgruppe, hoehle: karteHoehle, hoehleInsel: (m, r, b, h, st) => karteHoehle(m, r, b, h, st, true), hochkant: karteHochkant, schlucht: karteSchlucht, archipel: karteArchipel, vulkan: karteVulkan, ruinenstadt: karteRuinenstadt, pyramide: kartePyramide, planet: kartePlanet, unmoeglich: karteUnmoeglich }[wahl];
  if (sonder) {
    const wy = sonder(maske, rng, width, height, stat);
    maske.rechteck(0, wy + 30, width, height);
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
