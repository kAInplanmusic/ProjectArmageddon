/**
 * Oberflächen des Geländes für Wetter-Optik: wo Regen aufspritzt, Hagel aufschlägt, Schnee liegt und Pfützen stehen.
 *
 * Gelesen wird nur die Kollisionsmaske (`terrainSource.bitmap`, 1 = fest); nichts wird geschrieben. Je Spalte (Raster
 * `schritt` px) werden ALLE Übergänge Luft → fest erfasst (Höhlenböden, Inselkanten, Felsvorsprünge), nicht nur die oberste
 * Fläche. „offen" heißt: darüber liegt nichts Festes, Regen und Schnee erreichen die Stelle. Verdeckte Flächen (Höhlenboden)
 * bekommen nur Tropfen von der Decke.
 *
 * @module wetterOberflaeche
 */
import { hash2 } from './stil.js';

/** Unterhalb dieses Anteils der Kartenhöhe liegt Wasser: keine Oberflächen dort. */
const WASSER_ANTEIL = 0.93;
const MAX_JE_SPALTE = 6;

/**
 * Erfasst die Oberflächen einer Maske.
 * @param {{bitmap:ArrayLike<number>, width:number, height:number}} src
 * @param {{schritt?:number}} [opt]
 * @returns {{b:number, h:number, schritt:number, n:number, ys:number[][], offen:boolean[][], oben:Int16Array, steil:Float32Array}}
 */
export function baueOberflaeche(src, { schritt = 6 } = {}) {
  const { bitmap, width: b, height: h } = src;
  const n = Math.ceil(b / schritt);
  const ys = new Array(n);
  const offen = new Array(n);
  const oben = new Int16Array(n).fill(-1);
  const grenze = Math.min(h - 1, Math.floor(h * WASSER_ANTEIL));
  for (let c = 0; c < n; c += 1) {
    const x = Math.min(b - 1, c * schritt);
    const liste = [];
    const frei = [];
    let vor = bitmap[x] !== 0;
    let festGesehen = vor;
    for (let y = 1; y <= grenze; y += 1) {
      const s = bitmap[y * b + x] !== 0;
      if (s && !vor && liste.length < MAX_JE_SPALTE) { liste.push(y); frei.push(!festGesehen); }
      if (s) festGesehen = true;
      vor = s;
    }
    ys[c] = liste;
    offen[c] = frei;
    if (frei[0]) oben[c] = liste[0];
  }
  // Steilheit der obersten freien Fläche aus den Nachbarn: 0 flach, 1 steil (Schnee haftet nicht an Wänden).
  const steil = new Float32Array(n);
  for (let c = 0; c < n; c += 1) {
    if (oben[c] < 0) { steil[c] = 1; continue; }
    const l = c > 0 && oben[c - 1] >= 0 ? Math.abs(oben[c] - oben[c - 1]) : 8;
    const r = c < n - 1 && oben[c + 1] >= 0 ? Math.abs(oben[c + 1] - oben[c]) : 8;
    steil[c] = Math.min(1, Math.max(l, r) / (schritt * 1.4));
  }
  return { b, h, schritt, n, ys, offen, oben, steil };
}

/**
 * Wählt eine Oberfläche im Ausschnitt aus zwei Zufallswerten (aus `hash2`, nicht gewürfelt).
 * @param {object} ob aus `baueOberflaeche`
 * @param {number} u 0 bis 1: Spalte im Ausschnitt
 * @param {number} v 0 bis 1: Fläche in der Spalte
 * @param {{x0:number, x1:number, y0:number, y1:number}} sicht Ausschnitt in Kartenpixeln
 * @param {boolean} [nurOffen=false]
 * @returns {{x:number, y:number, offen:boolean}|null}
 */
export function waehleOberflaeche(ob, u, v, sicht, nurOffen = false) {
  if (!ob || ob.n === 0) return null;
  const c0 = Math.max(0, Math.floor(sicht.x0 / ob.schritt));
  const c1 = Math.min(ob.n - 1, Math.floor(sicht.x1 / ob.schritt));
  if (c1 < c0) return null;
  const c = Math.min(c1, c0 + Math.floor(u * (c1 - c0 + 1)));
  const ys = ob.ys[c];
  let summe = 0;
  for (let i = 0; i < ys.length; i += 1) {
    if (ys[i] < sicht.y0 - 24 || ys[i] > sicht.y1 + 24) continue;
    if (nurOffen && !ob.offen[c][i]) continue;
    summe += ob.offen[c][i] ? 1 : 0.25;
  }
  if (summe <= 0) return null;
  let ziel = v * summe;
  for (let i = 0; i < ys.length; i += 1) {
    if (ys[i] < sicht.y0 - 24 || ys[i] > sicht.y1 + 24) continue;
    if (nurOffen && !ob.offen[c][i]) continue;
    ziel -= ob.offen[c][i] ? 1 : 0.25;
    if (ziel <= 0) return { x: c * ob.schritt + hash2(c, i, 61) * ob.schritt, y: ys[i], offen: ob.offen[c][i] };
  }
  return null;
}

/**
 * Zusammenhängende Läufe der obersten freien Fläche im Ausschnitt (für die Schneedecke).
 * @returns {{x:number, y:number, st:number}[][]} je Lauf Punkte; `st` = Haftung 0 (Wand) bis 1 (flach)
 */
export function schneeLaeufe(ob, x0, x1) {
  const laeufe = [];
  if (!ob) return laeufe;
  const c0 = Math.max(0, Math.floor(x0 / ob.schritt) - 1);
  const c1 = Math.min(ob.n - 1, Math.ceil(x1 / ob.schritt) + 1);
  let lauf = null;
  for (let c = c0; c <= c1; c += 1) {
    const y = ob.oben[c];
    if (y < 0 || (lauf && Math.abs(y - lauf[lauf.length - 1].y) > ob.schritt * 2.2)) {
      if (lauf && lauf.length > 1) laeufe.push(lauf);
      lauf = null;
    }
    if (y < 0) continue;
    (lauf ??= []).push({ x: c * ob.schritt, y, st: 1 - 0.75 * ob.steil[c] });
  }
  if (lauf && lauf.length > 1) laeufe.push(lauf);
  return laeufe;
}

/** Flache Stellen für Pfützen: Läufe der obersten Fläche mit fast gleicher Höhe (±4 px) über mindestens 48 px. */
export function pfuetzenAus(ob) {
  const liste = [];
  if (!ob) return liste;
  let lauf = null;
  const schliesse = () => {
    if (lauf && lauf.x1 - lauf.x0 >= 48) liste.push({ x: (lauf.x0 + lauf.x1) / 2, y: lauf.y, b: Math.min(110, lauf.x1 - lauf.x0 - 8) });
    lauf = null;
  };
  for (let c = 0; c < ob.n; c += 1) {
    const y = ob.oben[c];
    const x = c * ob.schritt;
    if (y < 0) { schliesse(); continue; }
    if (lauf && Math.abs(y - lauf.y) <= 4) lauf.x1 = x + ob.schritt;
    else { schliesse(); lauf = { x0: x, x1: x + ob.schritt, y }; }
  }
  schliesse();
  return liste.filter((p, i) => hash2(i, 1, 21) < 0.6).slice(0, 24);
}
