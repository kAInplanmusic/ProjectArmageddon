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
  }

  setze(x, y, wert) {
    if (x < 0 || y < 0 || x >= this.breite || y >= this.hoehe) return;
    this.bitmap[y * this.breite + x] = wert;
  }

  rechteck(x0, y0, x1, y1, wert = 1) {
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(this.hoehe, Math.ceil(y1)); y += 1) {
      for (let x = Math.max(0, Math.floor(x0)); x < Math.min(this.breite, Math.ceil(x1)); x += 1) this.bitmap[y * this.breite + x] = wert;
    }
  }

  ellipse(cx, cy, rx, ry, wert = 1) {
    for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(this.hoehe - 1, Math.ceil(cy + ry)); y += 1) {
      for (let x = Math.max(0, Math.floor(cx - rx)); x <= Math.min(this.breite - 1, Math.ceil(cx + rx)); x += 1) {
        const u = (x - cx) / rx;
        const v = (y - cy) / ry;
        if (u * u + v * v <= 1) this.bitmap[y * this.breite + x] = wert;
      }
    }
  }
}

/**
 * Eine Platte: Oberkante wellig, Unterkante zerklüftet mit Zapfen, Enden gerundet.
 * @returns {{x0:number,x1:number,obenY:(x:number)=>number,untenY:(x:number)=>number}}
 */
function platte(maske, rng, x0, x1, yMitte, dicke) {
  const welleO = baueRauschen(rng, maske.breite, zwischen(rng, 60, 140));
  const welleU = baueRauschen(rng, maske.breite, zwischen(rng, 30, 70));
  const zapfen = baueRauschen(rng, maske.breite, zwischen(rng, 14, 28));
  const obenY = (x) => yMitte + welleO(x) * dicke * 0.18;
  const untenY = (x) => yMitte + dicke * (0.7 + 0.25 * welleU(x) + 0.35 * Math.max(0, zapfen(x)) ** 2);
  const lang = x1 - x0;
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

/**
 * @param {object} o
 * @param {{next:function():number}} o.rng - Seed-Zweig des Geländes
 * @param {number} o.width
 * @param {number} o.height
 * @returns {{bitmap:Uint8Array, wasserY:number, bauteile:object}}
 */
export function erzeugeKompositionsKarte({ rng, width, height }) {
  const maske = new Maske(width, height);
  const wasserY = Math.round(height * 0.9);
  const ebenenZahl = width / height > 1.6 ? 3 : 4;
  const stat = { platten: 0, pfeiler: 0, bruecken: 0, tuerme: 0, boegen: 0, hoehlen: 0 };

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
  return { bitmap: maske.bitmap, wasserY, bauteile: stat };
}
