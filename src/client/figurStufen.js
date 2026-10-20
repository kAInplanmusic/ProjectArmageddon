/**
 * Mip-Kette der Figurensprites: vorskalierte Stufen mit hochwertiger Filterung.
 *
 * Getrennt von `figurenBilder.js` (das Vite-Importe nutzt), damit Zeichnung und
 * Tests ohne Bundler laufen. Reine Darstellung.
 *
 * @module figurStufen
 */

/** Kantenlänge der Standardstufe (Quelle: 256 px). */
const CACHE_KANTE = 128;
/** Vorskalierte Stufen (Mip-Kette); die größte ist das Original. */
export const STUFEN = Object.freeze([64, 96, 128, 192, 256]);

function neueLeinwand(b, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(b, h);
  const c = document.createElement('canvas');
  c.width = b; c.height = h;
  return c;
}

/**
 * Leichte Schärfung samt Randsäuberung (einmal je Stufe, nie je Bild).
 *
 * Der Weichzeichner gewichtet mit der Deckkraft: Transparente Nachbarn dunkeln
 * den Rand nicht ab, und der Ausschlag wird begrenzt — es entstehen keine
 * hellen oder dunklen Säume. Nahezu unsichtbare Randpixel (Alpha < 10) fallen weg.
 */
function schaerfe(leinwand, staerke) {
  try {
    const k = leinwand.width;
    const c = leinwand.getContext('2d');
    const bild = c.getImageData(0, 0, k, k);
    const d = bild.data;
    const aus = new Uint8ClampedArray(d.length);
    for (let y = 0; y < k; y += 1) {
      for (let x = 0; x < k; x += 1) {
        const i = (y * k + x) * 4;
        const a = d[i + 3];
        if (a < 10) { aus[i + 3] = 0; continue; }
        let sr = 0; let sg = 0; let sb = 0; let sa = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          const yy = y + dy;
          if (yy < 0 || yy >= k) continue;
          for (let dx = -1; dx <= 1; dx += 1) {
            const xx = x + dx;
            if (xx < 0 || xx >= k) continue;
            const j = (yy * k + xx) * 4;
            const w = d[j + 3];
            sr += d[j] * w; sg += d[j + 1] * w; sb += d[j + 2] * w; sa += w;
          }
        }
        for (let ch = 0; ch < 3; ch += 1) {
          const m = (ch === 0 ? sr : ch === 1 ? sg : sb) / sa;
          const v = d[i + ch];
          // Ausschlag begrenzen (±38), damit keine Säume entstehen.
          const diff = Math.max(-38, Math.min(38, (v - m) * staerke));
          aus[i + ch] = v + diff;
        }
        aus[i + 3] = a;
      }
    }
    d.set(aus);
    c.putImageData(bild, 0, 0);
  } catch {
    // Ohne Lesezugriff (z. B. gesperrte Leinwand) bleibt das ungeschärfte Bild.
  }
}

/** Verkleinert ein geladenes Bild mehrstufig (je Halbierung ein Schritt) auf `ziel` Pixel. */
export function verkleinere(img, ziel = CACHE_KANTE, staerke = 0.5) {
  let quelle = img;
  let kante = Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height);
  while (kante >= ziel * 2) {
    kante = Math.round(kante / 2);
    const z = neueLeinwand(kante, kante);
    const zc = z.getContext('2d');
    zc.imageSmoothingEnabled = true;
    zc.imageSmoothingQuality = 'high';
    zc.drawImage(quelle, 0, 0, kante, kante);
    quelle = z;
  }
  const aus = neueLeinwand(ziel, ziel);
  const c = aus.getContext('2d', { willReadFrequently: true });
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = 'high';
  c.drawImage(quelle, 0, 0, ziel, ziel);
  schaerfe(aus, staerke);
  return aus;
}

/** Weiße Fassung der Silhouette für den Treffer-Blitz. */
function weisse(bild) {
  return gefaerbt(bild, '#ffffff');
}

/** Silhouette in einer Farbe (Treffer-Blitz in Teamfarbe). */
function gefaerbt(bild, farbe) {
  const kante = bild.width;
  const z = neueLeinwand(kante, kante);
  const c = z.getContext('2d');
  c.drawImage(bild, 0, 0);
  c.globalCompositeOperation = 'source-atop';
  c.fillStyle = farbe;
  c.fillRect(0, 0, kante, kante);
  return z;
}

/** Eine Stufe der Mip-Kette (lazy erzeugt): `{kante, bild, hell, ton: Map}`. */
export function stufeBauen(fig, kante) {
  const bild = kante >= 256 ? fig.quelle : verkleinere(fig.quelle, kante, kante <= 96 ? 0.6 : 0.4);
  return { kante, bild, hell: weisse(bild), ton: new Map() };
}

/**
 * Die zur Bildschirmgröße passende Stufe: die kleinste, die höchstens 8 %
 * hochskaliert werden muss (sonst die größte). Nur beim ersten Gebrauch einer
 * Stufe wird gerechnet.
 *
 * @param {object} fig - aus `holeFigur`
 * @param {number} px - Kantenlänge des Sprites in Gerätepixeln
 */
export function stufeFuer(fig, px) {
  if (!fig.quelle) return fig;
  let idx = STUFEN.length - 1;
  for (let i = 0; i < STUFEN.length; i += 1) { if (STUFEN[i] >= px * 0.92) { idx = i; break; } }
  return fig.stufen[idx] ?? (fig.stufen[idx] = stufeBauen(fig, STUFEN[idx]));
}

/** Silhouette der Stufe in Teamfarbe (gecacht je Farbe). */
export function tonung(stufe, farbe) {
  let t = stufe.ton.get(farbe);
  if (!t) { t = gefaerbt(stufe.bild, farbe); stufe.ton.set(farbe, t); }
  return t;
}

