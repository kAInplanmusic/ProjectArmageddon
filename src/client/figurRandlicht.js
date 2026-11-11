/**
 * Randlicht für dunkle Figuren auf dunklem Gelände (SPR-6, nur Darstellung).
 *
 * Ursache: Viele Sprites (v. a. Datacult, Pixel-Geister, Xeno-Hexen) haben nahezu schwarze
 * Randpixel (mittlere Kantenhelligkeit 20–60 von 255); das dunkle Gelände (Kohle, Fels, Teer,
 * Obsidian: 16–45) liegt im selben Bereich, die Silhouette verschwindet. Statt die Bilder zu
 * verändern (der Stil-Pass `stil-pass.py --randlicht` färbt nur die Kante grün und ist je Gelände
 * zu stark oder zu schwach), zeichnet der Client hinter dem Sprite einen hellen Saum, dessen
 * Stärke aus der gemessenen Kantenhelligkeit der Figur folgt. Helle Figuren bekommen keinen Saum.
 *
 * Rein darstellend: berührt weder Engine noch RNG noch Kollisionsform; der Saum liegt hinter dem
 * Sprite und wird je Mip-Stufe einmal erzeugt.
 *
 * @module figurRandlicht
 */

import { neueLeinwand } from './dom.js';

/** Kantenhelligkeit (0..255), ab der kein Saum mehr nötig ist, und Breite des Übergangs bis zum vollen Saum. */
export const RAND_GRENZE = 110;
export const RAND_BREITE = 70;
/** Größte Deckkraft des Saums (bei sehr dunkler Kante). */
export const RAND_ALPHA_MAX = 0.62;
/** Farbe des Saums: kühles Weiß, neutral gegenüber allen Fraktionen. */
export const RAND_FARBE = '#e4f2ff';

/** Wahrnehmungshelligkeit (Rec. 709, 0..255). */
export function helligkeit(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Mittlere Helligkeit der Randpixel (deckend, höchstens 2 Pixel von einem durchsichtigen Pixel entfernt); `null` ohne Figur. */
export function kantenHelligkeit(daten, breite, hoehe) {
  const deckend = (x, y) => x >= 0 && y >= 0 && x < breite && y < hoehe && daten[(y * breite + x) * 4 + 3] > 128;
  let summe = 0; let n = 0;
  for (let y = 0; y < hoehe; y += 1) {
    for (let x = 0; x < breite; x += 1) {
      if (!deckend(x, y)) continue;
      let rand = false;
      for (let dy = -2; dy <= 2 && !rand; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          if (!deckend(x + dx, y + dy)) { rand = true; break; }
        }
      }
      if (!rand) continue;
      const i = (y * breite + x) * 4;
      summe += helligkeit(daten[i], daten[i + 1], daten[i + 2]);
      n += 1;
    }
  }
  return n > 0 ? summe / n : null;
}

/** Stärke 0..1 des Saums aus der Kantenhelligkeit (linear zwischen `RAND_GRENZE` und `RAND_GRENZE - RAND_BREITE`). */
export function randStaerke(kante) {
  if (kante === null || kante === undefined) return 0;
  return Math.max(0, Math.min(1, (RAND_GRENZE - kante) / RAND_BREITE));
}

/** WCAG-Kontrastverhältnis zweier Grautöne (0..255), nur für Messung und Tests. */
export function kontrast(l1, l2) {
  const lin = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const a = lin(l1); const b = lin(l2);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Helligkeit des Saums über einem Gelände der Helligkeit `gelaende` (Alpha-Mischung, wie gezeichnet). */
export function saumUeberGelaende(staerke, gelaende) {
  const a = RAND_ALPHA_MAX * staerke;
  return a * helligkeit(0xe4, 0xf2, 0xff) + (1 - a) * gelaende;
}

/** Saum aus der Silhouette: gefärbte Silhouette, in acht Richtungen um `r` Pixel versetzt. */
function saumBauen(bild, kante, r) {
  const z = neueLeinwand(kante, kante);
  const c = z.getContext('2d');
  const sil = neueLeinwand(kante, kante);
  const sc = sil.getContext('2d');
  sc.drawImage(bild, 0, 0, kante, kante);
  sc.globalCompositeOperation = 'source-atop';
  sc.fillStyle = RAND_FARBE;
  sc.fillRect(0, 0, kante, kante);
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx !== 0 || dy !== 0) c.drawImage(sil, dx * r, dy * r);
    }
  }
  return z;
}

/**
 * Saum einer Mip-Stufe (`{bild, kante}` aus `figurStufen.stufeBauen`): `{bild, staerke}` oder `null`
 * (helle Figur oder keine Lesemöglichkeit). Einmal je Stufe gerechnet.
 */
export function randlichtFuer(stufe) {
  if (stufe.rand !== undefined) return stufe.rand;
  stufe.rand = null;
  try {
    const kante = stufe.kante ?? stufe.bild.width;
    const lese = neueLeinwand(kante, kante);
    const lc = lese.getContext('2d', { willReadFrequently: true });
    lc.drawImage(stufe.bild, 0, 0, kante, kante);
    const { data } = lc.getImageData(0, 0, kante, kante);
    const staerke = randStaerke(kantenHelligkeit(data, kante, kante));
    if (staerke > 0.04) stufe.rand = { bild: saumBauen(stufe.bild, kante, Math.max(1, Math.round(kante / 110))), staerke };
  } catch {
    stufe.rand = null;
  }
  return stufe.rand;
}
