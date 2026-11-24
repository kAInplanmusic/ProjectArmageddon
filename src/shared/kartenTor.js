/**
 * Qualitätstor der Geländefassung 15 (TODO 2.3): Liegt begehbarer Boden hinter einem Gang, der dünner ist als eine Figur?
 *
 * ## Der Fund (gemessen, `scripts/messung-kartenqualitaet.mjs`)
 *
 * Seed 3 (Menüweg, 2560 × 1440, Kartenart `hochkant`): Das untere Drittel der Karte hängt nur über einen Spalt mit dem Rest
 * zusammen, der schmaler ist als eine Figur. Luft (und damit Sicht) reicht hinein, eine Figur nie: 1321 px zusammenhängender
 * Boden, auf dem niemand je stehen kann. Der Auftraggeber beschrieb dasselbe an der Fantasywald-Lichtung („zu dünne Gänge“).
 *
 * ## Die Prüfung
 *
 * Auf halber Auflösung (Kosten): Luft, die von den Startspalten aus zusammenhängt, und der Raum, in den ein Figurenkasten
 * (10 × 20 px) von dort passt. Boden, über dem erreichbare Luft liegt, der nicht zu steil ist (Steigung bis 1,5) und genug
 * Kopfhöhe hat, aber außerhalb des Figurenraums liegt, ist „abgeschnitten“. Abgelehnt wird eine Karte, wenn ein Lauf
 * benachbarter abgeschnittener Bodenspalten `TOR_LAUF_MAX` px oder länger ist: eine ganze Fläche, kein Keil unter einem Überhang
 * (die haben gemessen unter 80 px).
 *
 * Rein: kein Zufall, keine Uhr. Liest die Bitmap, ändert sie nicht.
 *
 * @module shared/kartenTor
 */

/** Ab dieser Breite (px) gilt abgeschnittener Boden als Mangel. Gemessen: Keile 0 bis 74 px, der Fund 1321 px. */
export const TOR_LAUF_MAX = 120;

const S = 2; // halbe Auflösung
const HALB_B = 3; // Figurenkasten 10 px breit → ±5 px → ±3 Zellen (aufgerundet, streng)
const HALB_H = 5; // 20 px hoch → ±10 px → ±5 Zellen
const KOPF = 11; // 22 px Kopfhöhe für einen Stand

/**
 * @param {Uint8Array} bitmap - 1 = fest, volle Auflösung
 * @param {number} width
 * @param {number} height
 * @param {Array<{x:number,y:number}>} starts - Figurenmittelpunkte (volle Auflösung)
 * @returns {{ok: boolean, lauf: number, grund?: string, ort?: number}} `ort`: x-Mitte des längsten abgeschnittenen Laufs (px, volle Auflösung)
 */
export function pruefeDurchgaenge(bitmap, width, height, starts) {
  const w = Math.floor(width / S);
  const h = Math.floor(height / S);
  const fest = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) fest[y * w + x] = bitmap[(y * S + 1) * width + x * S + 1] ? 1 : 0;

  // Summentabelle für den Kastentest.
  const W = w + 1;
  const summe = new Int32Array(W * (h + 1));
  for (let y = 0; y < h; y += 1) {
    let zeile = 0;
    for (let x = 0; x < w; x += 1) { zeile += fest[y * w + x]; summe[(y + 1) * W + x + 1] = summe[y * W + x + 1] + zeile; }
  }
  const frei = (x, y) => {
    const x0 = x - HALB_B; const x1 = x + HALB_B + 1; const y0 = y - HALB_H; const y1 = y + HALB_H + 1;
    if (x0 < 0 || y0 < 0 || x1 > w || y1 > h) return false;
    return summe[y1 * W + x1] - summe[y0 * W + x1] - summe[y1 * W + x0] + summe[y0 * W + x0] === 0;
  };

  const flute = (ok, saat) => {
    const feld = new Uint8Array(w * h);
    const schlange = new Int32Array(w * h);
    let kopf = 0; let ende = 0;
    for (const i of saat) if (i >= 0 && !feld[i] && ok(i % w, (i - (i % w)) / w)) { feld[i] = 1; schlange[ende++] = i; }
    while (kopf < ende) {
      const i = schlange[kopf++]; const x = i % w; const y = (i - x) / w;
      if (x > 0 && !feld[i - 1] && ok(x - 1, y)) { feld[i - 1] = 1; schlange[ende++] = i - 1; }
      if (x < w - 1 && !feld[i + 1] && ok(x + 1, y)) { feld[i + 1] = 1; schlange[ende++] = i + 1; }
      if (y > 0 && !feld[i - w] && ok(x, y - 1)) { feld[i - w] = 1; schlange[ende++] = i - w; }
      if (y < h - 1 && !feld[i + w] && ok(x, y + 1)) { feld[i + w] = 1; schlange[ende++] = i + w; }
    }
    return feld;
  };

  const saatLuft = [];
  const saatRaum = [];
  for (const st of starts) {
    const x = Math.round(st.x / S);
    const y = Math.round(st.y / S);
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    saatLuft.push(y * w + x);
    for (let d = 0; d <= 4; d += 1) if (y - d >= 0 && frei(x, y - d)) { saatRaum.push((y - d) * w + x); break; }
  }
  const luft = flute((x, y) => !fest[y * w + x], saatLuft);
  const raum = flute(frei, saatRaum);

  const bodenBei = (x, y) => {
    for (let d = 0; d <= 4; d += 1) {
      for (const yy of [y - d, y + d]) if (yy > 0 && yy < h && fest[yy * w + x] && !fest[(yy - 1) * w + x]) return yy;
    }
    return null;
  };

  let lauf = 0; let laufY = -1; let groesster = 0; let groessterEnde = 0;
  for (let x = HALB_B + 2; x < w - HALB_B - 2; x += 1) {
    let spalteY = -1;
    for (let y = h - 1; y > KOPF + 1; y -= 1) {
      if (!fest[y * w + x] || fest[(y - 1) * w + x] || !luft[(y - 1) * w + x]) continue;
      let kopfFrei = true;
      for (let yy = y - 1; yy >= y - KOPF; yy -= 1) if (fest[yy * w + x]) { kopfFrei = false; break; }
      if (!kopfFrei) continue;
      const l = bodenBei(x - 2, y); const r = bodenBei(x + 2, y);
      if (l === null || r === null || Math.abs(l - y) > 3 || Math.abs(r - y) > 3) continue; // steiler als 1,5
      let drin = false;
      for (let d = 0; d <= 4 && !drin; d += 1) { const yy = y - 1 - HALB_H - d; if (yy >= 0 && raum[yy * w + x]) drin = true; }
      if (drin) continue;
      if (spalteY < 0 || (laufY >= 0 && Math.abs(y - laufY) < Math.abs(spalteY - laufY))) spalteY = y;
    }
    if (spalteY >= 0 && laufY >= 0 && Math.abs(spalteY - laufY) <= 6) { lauf += 1; laufY = spalteY; } else if (spalteY >= 0) { lauf = 1; laufY = spalteY; } else { lauf = 0; laufY = -1; }
    if (lauf > groesster) { groesster = lauf; groessterEnde = x; }
  }
  const laufPx = groesster * S;
  return laufPx >= TOR_LAUF_MAX
    ? { ok: false, lauf: laufPx, ort: Math.round((groessterEnde - groesster / 2) * S), grund: `${laufPx} px begehbarer Boden hinter einem Gang, der dünner ist als eine Figur` }
    : { ok: true, lauf: laufPx };
}
