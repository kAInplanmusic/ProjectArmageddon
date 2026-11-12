/**
 * Runde Kartenarten (Geländefassung 14, TODO N-40: „rund“ = Format 1:1 mit Planet, runder Höhle, schwebender Insel).
 *
 * ## Was „rund“ hier heißt
 *
 * Die Engine bleibt zweidimensional mit Schwerkraft nach unten (kein Kugelfeld, keine Polarkoordinaten im Motor). „Rund“ ist die
 * UMRISSFORM des Bodens, auf den die Figuren treten:
 *
 *   - `rundPlanet`:      Scheibe mit leicht welligem Rand (zwei bis sieben Wellen), flache Krater auf der Kappe, zwei bis drei geschlossene
 *                        Kammern im Inneren, zwei kleine Monde. Gespielt wird auf der oberen Kappe.
 *   - `rundeHoehle`:     Felsscheibe mit kreisrunder Kammer; die Decke hat ein rundes Oberlicht (senkrechter Schacht), unter dem der Boden
 *                        liegt, auf dem die Figuren starten. Unter den Dachkanten laufen die Flanken der Kammer weiter (Überhänge), vom
 *                        Dach hängen Zapfen, auf dem Boden liegen sanfte Hügel.
 *   - `schwebendeInsel`: Linse mit welliger Oberseite und zapfigem Unterbau über der Leere, innen geschlossene Kammern, außen kleine
 *                        Inselchen. Fallen von der Kante ist tödlich (wie bei allen Karten mit Wasser-/Leerespiegel).
 *
 * Alle Maße hängen an `U = min(Breite, Höhe)` (auf 1:1: die Seite); die Körperformen liegen mittig, die Karte ist darüber hinaus
 * freier Himmel. Keine Zahl ist auf eine feste Pixelgröße geeicht, nur die Mindestmaße für Figuren (`FIGUR_H`).
 *
 * ## Spielbarkeit als Konstruktion, nicht als Hoffnung
 *
 *   - Der STAND (`rund.stand = [x0, x1]`) ist die Spanne, auf der die Figuren starten: zusammenhängend, jede Spalte hat Boden, keine Stufe über
 *     3 px zwischen Nachbarspalten, Steigung über ±8 px höchstens 1,0 (die Engine steigt bis 1,4, `config/bewegung.js`). Er wird aus der fertigen
 *     Maske gemessen (`messeStand`), nicht aus der Absicht abgeleitet.
 *   - Innenräume (Planet, Insel) sind GESCHLOSSEN: Eine Rampe von der Oberfläche schneidet mit ihrem offenen Graben den Stand in Teilflächen
 *     (im ersten Entwurf gemessen: Stand 0,26 U statt über 0,5 U). Die Zerstörung öffnet sie.
 *   - `pruefeRundeKarte` lehnt eine Karte ab, deren Stand zu schmal ist; der Aufrufer (`terrainGen3.erzeugeBauteilKarte`) zieht dann neu
 *     (bis zu acht Versuche, wie bei allen Bauteilkarten).
 *
 * Reiner Seed-Zufall (`rng.next()`), keine Zeit, kein `Math.random` (AGENTS.md §2). Die Zahl der Ziehungen hängt nur von den Maßen ab.
 *
 * @module terrainRund
 */
import { KARTENARTEN_RUND } from './config/gelaende.js';

/** Die drei Kennungen (`config/gelaende.js`). */
export const RUND_ARTEN = KARTENARTEN_RUND;

/** Körperhöhe einer Figur (px, `config/player.js`: 14 × 20); die kleinste lichte Höhe ist ein Mehrfaches davon. */
const FIGUR_H = 20;
/** Größte Steigung im Stand (über ±8 px) und größter Absatz zwischen zwei Nachbarspalten. */
const STAND_STEIGUNG = 1.0;
const STAND_ABSATZ = 3;
/** Mindestbreite des Stands als Anteil von `U`. */
export const STAND_MIN_ANTEIL = 0.25;

const ziehe = (rng, a, b) => a + rng.next() * (b - a);

/** Zeichenfläche: Ein Byte je Pixel, 1 = fest. */
class Raster {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.bm = new Uint8Array(w * h);
  }

  spanne(y, xa, xb, v) {
    if (y < 0 || y >= this.h) return;
    const a = Math.max(0, Math.ceil(xa));
    const b = Math.min(this.w - 1, Math.floor(xb));
    if (b >= a) this.bm.fill(v, y * this.w + a, y * this.w + b + 1);
  }

  scheibe(cx, cy, r, v) {
    for (let y = Math.max(0, Math.ceil(cy - r)); y <= Math.min(this.h - 1, Math.floor(cy + r)); y += 1) {
      const d = Math.sqrt(Math.max(0, r * r - (y - cy) * (y - cy)));
      this.spanne(y, cx - d, cx + d, v);
    }
  }

  /** Obere Hälfte (`oben`) oder untere Hälfte einer Ellipse, `v` gesetzt. */
  ellipse(cx, cy, rx, ry, v, haelfte = 'ganz') {
    const y0 = haelfte === 'unten' ? cy : cy - ry;
    const y1 = haelfte === 'oben' ? cy : cy + ry;
    for (let y = Math.max(0, Math.ceil(y0)); y <= Math.min(this.h - 1, Math.floor(y1)); y += 1) {
      const t = (y - cy) / ry;
      const d = rx * Math.sqrt(Math.max(0, 1 - t * t));
      this.spanne(y, cx - d, cx + d, v);
    }
  }

  /** Oberste feste Zeile je Spalte, −1 ohne Boden. */
  oben() {
    const o = new Int32Array(this.w).fill(-1);
    for (let y = 0; y < this.h; y += 1) {
      const z = y * this.w;
      for (let x = 0; x < this.w; x += 1) if (o[x] < 0 && this.bm[z + x]) o[x] = y;
    }
    return o;
  }

  /** Unterste feste Zeile je Spalte, −1 ohne Boden. */
  unten() {
    const u = new Int32Array(this.w).fill(-1);
    for (let y = this.h - 1; y >= 0; y -= 1) {
      const z = y * this.w;
      for (let x = 0; x < this.w; x += 1) if (u[x] < 0 && this.bm[z + x]) u[x] = y;
    }
    return u;
  }
}

/**
 * Radiusfunktion eines welligen Kreises als Tabelle: r(θ) = R · (1 + Σ a_k · sin(kθ + φ_k)).
 * @returns {{tab:Float64Array, wob:number}} `wob` = größte relative Abweichung
 */
function wellenKreis(rng, R, ks, amp) {
  const T = 4096;
  const teile = ks.map((k) => ({ k, a: ziehe(rng, amp[0], amp[1]), ph: ziehe(rng, 0, Math.PI * 2) }));
  const tab = new Float64Array(T);
  for (let i = 0; i < T; i += 1) {
    const th = (i / T) * Math.PI * 2 - Math.PI;
    let f = 1;
    for (const t of teile) f += t.a * Math.sin(t.k * th + t.ph);
    tab[i] = R * f;
  }
  return { tab, wob: teile.reduce((s, t) => s + t.a, 0) };
}

/** Füllt (`v`=1) oder leert (`v`=0) den Stern r(θ) um (cx, cy). Innen Spannen, nur das Randband kostet einen atan2 je Pixel. */
function stern(r, cx, cy, R, wob, tab, v) {
  const T = tab.length;
  const rMin = R * (1 - wob);
  const rMax = R * (1 + wob);
  for (let y = Math.max(0, Math.ceil(cy - rMax)); y <= Math.min(r.h - 1, Math.floor(cy + rMax)); y += 1) {
    const dy = y - cy;
    const aussen = Math.sqrt(Math.max(0, rMax * rMax - dy * dy));
    const innen = Math.abs(dy) < rMin ? Math.sqrt(rMin * rMin - dy * dy) : -1;
    const xa = Math.max(0, Math.ceil(cx - aussen));
    const xb = Math.min(r.w - 1, Math.floor(cx + aussen));
    if (innen >= 0) r.spanne(y, cx - innen, cx + innen, v);
    const linksEnde = innen >= 0 ? Math.ceil(cx - innen) - 1 : xb;
    const rechtsAnfang = innen >= 0 ? Math.floor(cx + innen) + 1 : xb + 1;
    const pruefe = (x) => {
      const dx = x - cx;
      const idx = Math.floor(((Math.atan2(dy, dx) + Math.PI) / (Math.PI * 2)) * T) % T;
      if (dx * dx + dy * dy <= tab[idx] * tab[idx]) r.bm[y * r.w + x] = v;
    };
    for (let x = xa; x <= linksEnde; x += 1) pruefe(x);
    for (let x = rechtsAnfang; x <= xb; x += 1) pruefe(x);
  }
}

/**
 * Geschlossene Kammern im Inneren (Ellipsen), mit mindestens `0,12 U` Fels darüber. Sie sind bewusst NICHT mit der Oberfläche verbunden:
 * Eine Rampe müsste den Stand mit einem offenen Graben durchschneiden (gemessen im ersten Entwurf: Stand nur 0,26 U breit, Figuren auf
 * getrennten Teilflächen). Geschlossene Hohlräume öffnet erst die Zerstörung (Waffen, Stoffregeln); erreichbar sein müssen sie nicht.
 *
 * @returns {{x:number,y:number,rx:number,ry:number}[]}
 */
function kammern(r, rng, top, cx, halb, U, zahl) {
  const liste = [];
  for (let i = 0; i < zahl; i += 1) {
    const rx = U * ziehe(rng, 0.04, 0.08);
    const ry = rx * ziehe(rng, 0.45, 0.7);
    const x = cx + ziehe(rng, -1, 1) * halb;
    const t = top[Math.round(x)];
    if (t < 0) continue;
    const y = t + U * 0.12 + ry;
    if (liste.every((k) => Math.abs(k.x - x) > k.rx + rx + 40)) {
      r.ellipse(x, y, rx, ry, 0);
      liste.push({ x, y, rx, ry });
    }
  }
  return liste;
}

/**
 * Der Stand: die größte zusammenhängende Spanne um `xm` (höchstens `halb` px nach jeder Seite, nicht über `grenze`), in der jede
 * Spalte Boden hat, benachbarte Spalten höchstens `STAND_ABSATZ` px auseinanderliegen und die Steigung über ±8 px höchstens
 * `STAND_STEIGUNG` beträgt. `null`, wenn schon `xm` nicht dazugehört.
 */
export function messeStand(top, xm, halb, grenze = [0, top.length - 1]) {
  const ok = (x) => {
    if (x < Math.max(9, grenze[0]) || x > Math.min(top.length - 10, grenze[1])) return false;
    if (top[x] < 0 || top[x - 1] < 0 || top[x + 1] < 0) return false;
    if (Math.abs(top[x] - top[x - 1]) > STAND_ABSATZ || Math.abs(top[x] - top[x + 1]) > STAND_ABSATZ) return false;
    return top[x - 8] >= 0 && top[x + 8] >= 0 && Math.abs(top[x + 8] - top[x - 8]) <= STAND_STEIGUNG * 16;
  };
  const m = Math.round(xm);
  if (!ok(m)) return null;
  let a = m;
  let b = m;
  while (m - a < halb && ok(a - 1)) a -= 1;
  while (b - m < halb && ok(b + 1)) b += 1;
  return [a, b];
}

/** Siegelt den Rand: unterste Zeile fest, Seitenwände unter dem Spiegel fest (dort unsichtbar, nur gegen das Herausfallen aus der Maske). */
function versiegele(r, wasserY) {
  for (let x = 0; x < r.w; x += 1) r.bm[(r.h - 1) * r.w + x] = 1;
  for (let y = wasserY; y < r.h; y += 1) { r.bm[y * r.w] = 1; r.bm[y * r.w + r.w - 1] = 1; }
}

/** Oberfläche (erste feste Zeile) einer Spalte aus dem Raster, ohne Karte. */
function bodenY(r, x, ab = 0) {
  for (let y = ab; y < r.h; y += 1) if (r.bm[y * r.w + x]) return y;
  return -1;
}

/* ====================================================================
 * Planet
 * ==================================================================== */

function baueRundPlanet(rng, w, h) {
  const U = Math.min(w, h);
  const r = new Raster(w, h);
  const R = U * ziehe(rng, 0.38, 0.41);
  const { tab, wob } = wellenKreis(rng, R, [2, 3, 5, 7], [0.002, 0.007]);
  const cx = w / 2;
  const cy = h - U * 0.06 - R * (1 + wob);
  stern(r, cx, cy, R, wob, tab, 1);

  // Flache Krater auf der Kappe: Kreis, dessen Mitte 0,85 Radien über der Oberfläche liegt (Tiefe 0,15 r, Lippensteigung ≈ 0,6).
  const top0 = r.oben();
  const kraterZahl = 4 + Math.floor(rng.next() * 4);
  const krater = [];
  for (let v = 0; v < kraterZahl * 6 && krater.length < kraterZahl; v += 1) {
    const x = cx + (rng.next() < 0.5 ? -1 : 1) * ziehe(rng, 0.45, 0.85) * R;
    const kr = U * ziehe(rng, 0.035, 0.07);
    if (krater.every((k) => Math.abs(k.x - x) >= k.r + kr + 24)) krater.push({ x, r: kr });
  }
  for (const k of krater) {
    const t = top0[Math.round(k.x)];
    if (t >= 0) r.scheibe(k.x, t - k.r * 0.85, k.r, 0);
  }

  // Geschlossene Kammern unter der Kappe.
  const raeume = kammern(r, rng, r.oben(), cx, R * 0.5, U, 2 + Math.floor(rng.next() * 2));

  // Monde: zwei kleine Scheiben über den Schultern, nicht über dem Stand.
  const monde = [];
  for (const [von, bis] of [[-150, -115], [-65, -30]]) {
    const w0 = ziehe(rng, von, bis) * (Math.PI / 180);
    const d = R * ziehe(rng, 1.4, 1.65);
    const mr = U * ziehe(rng, 0.022, 0.04);
    const mx = cx + Math.cos(w0) * d;
    const my = cy + Math.sin(w0) * d;
    if (mx > mr + 40 && mx < w - mr - 40 && my > mr + 40) { r.scheibe(mx, my, mr, 1); monde.push({ x: mx, y: my, r: mr }); }
  }

  const tiefste = Math.min(h - 3, Math.ceil(cy + R * (1 + wob)));
  const wasserY = Math.min(h - 8, tiefste + Math.max(24, Math.round(U * 0.02)));
  versiegele(r, wasserY);
  const top2 = r.oben();
  const stand = messeStand(top2, cx, R * 0.55);
  return {
    bitmap: r.bm, wasserY,
    rund: { form: 'planet', wasserY, mitte: [cx, cy], halbachsen: [R, R], stand, raeume, krater: krater.length, monde: monde.length },
  };
}

/* ====================================================================
 * Runde Höhle
 * ==================================================================== */

function baueRundeHoehle(rng, w, h) {
  const U = Math.min(w, h);
  const r = new Raster(w, h);
  const R0 = U * ziehe(rng, 0.4, 0.44);
  const koerper = wellenKreis(rng, R0, [2, 3, 5], [0.004, 0.009]);
  const cx = w / 2;
  const cy = h - U * 0.05 - R0 * (1 + koerper.wob);
  stern(r, cx, cy, R0, koerper.wob, koerper.tab, 1);

  // Kammer: fast kreisrund, leicht wellig, die Mitte etwas über der Scheibenmitte (dickerer Boden als Dach).
  const rK = R0 * ziehe(rng, 0.62, 0.68);
  const kammer = wellenKreis(rng, rK, [3, 5, 7], [0.003, 0.008]);
  const cyK = cy - R0 * 0.05;
  stern(r, cx, cyK, rK, kammer.wob, kammer.tab, 0);

  // Oberlicht: senkrechter Schacht vom Himmel bis zur Kammermitte; darunter liegt der Stand.
  const wO = rK * ziehe(rng, 0.64, 0.7);
  for (let y = 0; y <= cyK; y += 1) r.spanne(y, cx - wO, cx + wO, 0);

  // Hügel auf dem Boden (Steigung höchstens 0,4: σ ≥ 1,5 h).
  const huegel = [];
  const hugelZahl = 2 + Math.floor(rng.next() * 3);
  for (let i = 0; i < hugelZahl; i += 1) {
    const xb = cx + ziehe(rng, -0.8, 0.8) * wO;
    const hh = U * ziehe(rng, 0.008, 0.02);
    const sig = hh * ziehe(rng, 1.6, 2.6);
    huegel.push({ xb, hh, sig });
  }
  for (const { xb, hh, sig } of huegel) {
    for (let x = Math.max(1, Math.floor(xb - 3 * sig)); x <= Math.min(w - 2, Math.ceil(xb + 3 * sig)); x += 1) {
      const boden = bodenY(r, x, Math.round(cyK - rK * 0.2));
      if (boden < 0) continue;
      const aufsatz = Math.round(hh * Math.exp(-((x - xb) ** 2) / (2 * sig * sig)));
      for (let y = boden - aufsatz; y < boden; y += 1) r.bm[y * w + x] = 1;
    }
  }

  // Zapfen am Dach, nur unter den Dachkanten (nicht im Lichtschacht).
  const zapfen = 4 + Math.floor(rng.next() * 5);
  let zapfenGebaut = 0;
  for (let i = 0; i < zapfen; i += 1) {
    const seite = i % 2 === 0 ? -1 : 1;
    const dx = ziehe(rng, wO + U * 0.03, rK * 0.78);
    const x0 = Math.round(cx + seite * dx);
    const breit = Math.max(10, U * ziehe(rng, 0.008, 0.02));
    const lang = U * ziehe(rng, 0.025, 0.08);
    // Decke der Kammer an dieser Stelle: von der Kammermitte aufwärts bis zum Fels.
    let dach = -1;
    for (let y = Math.round(cyK); y >= 0; y -= 1) if (r.bm[y * w + x0]) { dach = y; break; }
    if (dach < 0) continue;
    for (let x = Math.max(1, Math.floor(x0 - breit)); x <= Math.min(w - 2, Math.ceil(x0 + breit)); x += 1) {
      const l = Math.round(lang * (1 - Math.abs(x - x0) / breit));
      for (let y = dach + 1; y <= dach + l; y += 1) r.bm[y * w + x] = r.bm[y * w + x] || 1;
    }
    zapfenGebaut += 1;
  }

  const tiefste = Math.min(h - 3, Math.ceil(cy + R0 * (1 + koerper.wob)));
  const wasserY = Math.min(h - 8, tiefste + Math.max(24, Math.round(U * 0.02)));
  versiegele(r, wasserY);
  const top = r.oben();
  const stand = messeStand(top, cx, wO - 40, [Math.floor(cx - wO + 40), Math.ceil(cx + wO - 40)]);
  return {
    bitmap: r.bm, wasserY,
    rund: { form: 'hoehle', wasserY, mitte: [cx, cy], halbachsen: [R0, R0], stand, raeume: [{ x: cx, y: cyK, rx: rK, ry: rK }], oberlicht: [cx - wO, cx + wO], huegel: huegel.length, zapfen: zapfenGebaut },
  };
}

/* ====================================================================
 * Schwebende Insel
 * ==================================================================== */

/** Weiches 1D-Rauschen (Kosinus-Interpolation), Wellenlänge `welle` px, Wert in [-1, 1]. */
function rausch1(rng, laenge, welle) {
  const n = Math.ceil(laenge / welle) + 3;
  const s = new Float64Array(n);
  for (let i = 0; i < n; i += 1) s[i] = rng.next() * 2 - 1;
  return (x) => {
    const t = Math.max(0, x) / welle;
    const i = Math.floor(t);
    const f = (1 - Math.cos((t - i) * Math.PI)) / 2;
    return s[i] * (1 - f) + s[i + 1] * f;
  };
}

/** Linse: Oberseite Halbellipse (`ryOben`) plus Hügel, Unterseite Kegel (`ryUnten`) mit Zapfenrauschen. Gibt die tiefste Zeile zurück. */
function linse(r, rng, cx, cyL, rx, ryOben, ryUnten, hugel, zapf) {
  const g = rausch1(rng, rx * 2 + 8, Math.max(40, rx * 0.5));
  const f = rausch1(rng, rx * 2 + 8, Math.max(20, rx * 0.17));
  const z = rausch1(rng, rx * 2 + 8, Math.max(30, rx * 0.22));
  let tiefste = 0;
  for (let x = Math.max(1, Math.ceil(cx - rx)); x <= Math.min(r.w - 2, Math.floor(cx + rx)); x += 1) {
    const u = (x - cx) / rx;
    const rund = Math.sqrt(Math.max(0, 1 - u * u));
    if (rund <= 0) continue;
    const oben = cyL - ryOben * rund + hugel * (g(x - (cx - rx)) * 0.75 + f(x - (cx - rx)) * 0.25) * rund;
    const unten = cyL + ryUnten * (1 - Math.abs(u) ** 1.5) + zapf * z(x - (cx - rx)) * (1 - Math.abs(u)) * rund;
    const a = Math.max(2, Math.round(oben));
    const b = Math.min(r.h - 3, Math.round(Math.max(unten, oben + 6)));
    for (let y = a; y <= b; y += 1) r.bm[y * r.w + x] = 1;
    if (b > tiefste) tiefste = b;
  }
  return tiefste;
}

function baueSchwebendeInsel(rng, w, h) {
  const U = Math.min(w, h);
  const r = new Raster(w, h);
  const cx = w / 2 + ziehe(rng, -0.02, 0.02) * U;
  const rx = U * ziehe(rng, 0.36, 0.41);
  const ryOben = U * ziehe(rng, 0.05, 0.075);
  const ryUnten = U * ziehe(rng, 0.22, 0.28);
  const cyL = h * 0.34 + ryOben;
  let tiefste = linse(r, rng, cx, cyL, rx, ryOben, ryUnten, U * 0.016, U * 0.05);

  // Inselchen: zwei seitlich in Höhe der Oberseite, ein bis drei unter der Linse.
  const inselchen = [];
  const platz = (x, y, irx) => x - irx > 30 && x + irx < w - 30 && inselchen.every((k) => Math.hypot(k.x - x, k.y - y) > k.rx + irx + 200);
  for (const seite of [-1, 1]) {
    const irx = U * ziehe(rng, 0.03, 0.05);
    const x = cx + seite * (rx + irx + U * ziehe(rng, 0.02, 0.05));
    const y = cyL + U * ziehe(rng, -0.06, 0.1);
    if (platz(x, y, irx)) {
      tiefste = Math.max(tiefste, linse(r, rng, x, y, irx, irx * 0.3, irx * 0.9, 0, irx * 0.4));
      inselchen.push({ x, y, rx: irx });
    }
  }
  const unterZahl = 1 + Math.floor(rng.next() * 3);
  for (let i = 0; i < unterZahl * 5 && inselchen.length < unterZahl + 2; i += 1) {
    const irx = U * ziehe(rng, 0.025, 0.045);
    const x = cx + ziehe(rng, -0.3, 0.3) * U;
    const y = cyL + ryUnten + U * ziehe(rng, 0.08, 0.14);
    if (platz(x, y, irx) && y + irx < h - U * 0.1) {
      tiefste = Math.max(tiefste, linse(r, rng, x, y, irx, irx * 0.3, irx * 0.9, 0, irx * 0.4));
      inselchen.push({ x, y, rx: irx });
    }
  }

  // Geschlossene Kammern in der Linse.
  const raeume = kammern(r, rng, r.oben(), cx, rx * 0.5, U, 2 + Math.floor(rng.next() * 2));

  const wasserY = Math.min(h - 8, tiefste + Math.round(U * 0.1));
  versiegele(r, wasserY);
  const top2 = r.oben();
  const stand = messeStand(top2, cx, rx * 0.9);
  return {
    bitmap: r.bm, wasserY,
    rund: { form: 'insel', wasserY, mitte: [cx, cyL], halbachsen: [rx, ryOben + ryUnten], stand, raeume, inselchen: inselchen.length },
  };
}

/* ====================================================================
 * Einstieg und Prüfung
 * ==================================================================== */

const BAUER = { rundPlanet: baueRundPlanet, rundeHoehle: baueRundeHoehle, schwebendeInsel: baueSchwebendeInsel };

/**
 * Baut eine runde Karte.
 *
 * @param {object} o
 * @param {{next:function():number}} o.rng - Seed-Zweig des Geländes
 * @param {number} o.width
 * @param {number} o.height
 * @param {string} o.art - eine Kennung aus `RUND_ARTEN`
 * @returns {{bitmap:Uint8Array, wasserY:number, art:string, rund:object}}
 */
export function baueRundeKarte({ rng, width, height, art }) {
  const bauer = BAUER[art];
  if (!bauer) throw new TypeError(`Unbekannte runde Kartenart: ${art}`);
  return { ...bauer(rng, width, height), art };
}

/**
 * Prüft die Spielbarkeit einer runden Karte (Stand, nicht Hügelfeld-Kennzahlen).
 * @returns {{ok:boolean, grund?:string}}
 */
export function pruefeRundeKarte(k, width, height) {
  const U = Math.min(width, height);
  const stand = k.rund?.stand;
  if (!stand) return { ok: false, grund: 'kein begehbarer Stand' };
  if (stand[1] - stand[0] < STAND_MIN_ANTEIL * U) return { ok: false, grund: `Stand zu schmal (${stand[1] - stand[0]} px)` };
  if (FIGUR_H * 2 > U) return { ok: false, grund: 'Karte zu klein' };
  return { ok: true };
}
