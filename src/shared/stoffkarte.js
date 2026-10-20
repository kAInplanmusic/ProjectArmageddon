/**
 * Die Stoffkarte: ein Byte je 8 × 8 px, das sagt, WORAUS das Gelände dort besteht.
 *
 * ## Warum es keine Netzlast gibt
 *
 * Die Karte entsteht aus Seed, Bitmap und dem Rezept des Bioms (`config/stoff-rezepte.js`) —
 * Server und Client rechnen sie mit demselben Code nach, genau wie das Gelände selbst. Über das
 * Netz reist nur der Hash (`stoffHash`), den der Client mit dem eigenen vergleichen kann.
 *
 * ## Warum sie eigenen Zufall hat
 *
 * Das Rauschen kommt aus einem Zweig (`rng.fork(...)`), nicht aus dem Kartenzufall: Das
 * Gelände bleibt Bit für Bit, was es ohne Stoffkarte wäre.
 *
 * ## Aufbau einer Zelle (von oben nach unten, die späteren Regeln gewinnen)
 *
 *   1. Deckschicht(en) und Kern nach der Tiefe unter der Luft darüber (Höhlendecken zählen:
 *      „Tiefe" ist der Abstand zur nächsten Luft OBEN, nicht zur Kartenoberkante)
 *   2. Adern: Rauschfelder, die ab einer Mindesttiefe Nester anderer Stoffe setzen
 *   3. Platten: waagerechte Streifen (Metall), nur in Zonen
 *   4. Grundgestein: die untersten Zellreihen sind unzerstörbar
 *
 * @module stoffkarte
 */
import { gitterrauschen } from './terrainNoise.js';
import { stoffByKey, stoffById, unzerstoerbar, STOFF } from './config/stoffe.js';

/** Kantenlänge einer Stoffzelle in Pixeln. */
export const STOFF_ZELLE = 8;
/** Zellreihen am Kartenboden, die Grundgestein sind. */
export const BODEN_ZELLEN = 3;
/** Seed-Zweig der Stoffkarte (relativ zum Seed des Zweigs, „STO"). */
export const STOFF_FORK = 0x53544F;

const FNV_BASIS = 0x811C9DC5;
const FNV_PRIM = 0x01000193;

function kennung(key) {
  const s = stoffByKey(key);
  return s ? s.id : STOFF.ERDE;
}

/**
 * Baut die Stoffkarte.
 *
 * @param {object} p
 * @param {{next:function, fork:function}} p.rng - Zweig für die Stoffkarte (Rauschen)
 * @param {number} p.width
 * @param {number} p.height
 * @param {Uint8Array} p.bitmap - Gelände (1 = fest)
 * @param {object} p.rezept - `{deck:[[key,px]], kern, adern:[{stoff,dichte,ab,groesse}], platten:{stoff,abstand,anteil}}`
 * @returns {{feld:Uint8Array, spalten:number, zeilen:number, zelle:number, breite:number, hoehe:number, geschuetzt:Uint8Array|null}}
 */
export function baueStoffkarte({ rng, width, height, bitmap, rezept }) {
  const zelle = STOFF_ZELLE;
  const spalten = Math.max(1, Math.ceil(width / zelle));
  const zeilen = Math.max(1, Math.ceil(height / zelle));
  const feld = new Uint8Array(spalten * zeilen);
  const deck = (rezept?.deck ?? []).map(([key, dicke]) => [kennung(key), dicke]);
  const kern = kennung(rezept?.kern ?? 'erde');
  const grund = STOFF.GRUNDGESTEIN;

  /*
   * Je Rauschfeld einmal über alle Zellen ausgewertet; die Schwelle ist das Quantil `1 - dichte`.
   * `dichte` ist damit der Anteil der Zellen, den das Nest höchstens belegt (ein Wertrauschen
   * sammelt sich um 0,5, eine feste Schwelle träfe kaum etwas).
   */
  const nester = (zweig, groesse, dichte) => {
    const f = gitterrauschen(zweig, Math.max(2, Math.round(spalten / groesse)), Math.max(2, Math.round(zeilen / groesse)));
    const werte = new Float32Array(spalten * zeilen);
    for (let gy = 0; gy < zeilen; gy += 1) {
      for (let gx = 0; gx < spalten; gx += 1) werte[gy * spalten + gx] = f((gx + 0.5) / spalten, (gy + 0.5) / zeilen);
    }
    const sortiert = Float32Array.from(werte).sort();
    const schwelle = sortiert[Math.min(sortiert.length - 1, Math.floor((1 - Math.min(0.9, Math.max(0, dichte))) * sortiert.length))];
    return { werte, schwelle };
  };
  const adern = (rezept?.adern ?? []).map((a, i) => ({
    id: kennung(a.stoff),
    ab: a.ab ?? 0,
    ...nester(rng.fork(i + 1), a.groesse ?? 7, a.dichte),
  }));
  const platten = rezept?.platten
    ? {
      id: kennung(rezept.platten.stoff),
      abstand: Math.max(3, rezept.platten.abstand ?? 9),
      versatz: Math.floor(rng.fork(77).next() * (rezept.platten.abstand ?? 9)),
      ab: rezept.platten.ab ?? 16,
      ...nester(rng.fork(78), 14, rezept.platten.anteil ?? 0.3),
    }
    : null;

  for (let gx = 0; gx < spalten; gx += 1) {
    const px = Math.min(width - 1, gx * zelle + (zelle >> 1));
    let lauf = 0;
    let gy = 0;
    for (let y = 0; y < height && gy < zeilen; y += 1) {
      lauf = bitmap[y * width + px] ? lauf + 1 : 0;
      if (y !== Math.min(height - 1, gy * zelle + (zelle >> 1))) continue;
      const zi = gy * spalten + gx;
      let id = kern;
      let acc = 0;
      for (const [s, dicke] of deck) {
        acc += dicke;
        if (lauf <= acc) { id = s; break; }
      }
      for (const a of adern) {
        if (lauf >= a.ab && a.werte[zi] >= a.schwelle) id = a.id;
      }
      if (platten && lauf >= platten.ab && (gy + platten.versatz) % platten.abstand === 0
        && platten.werte[zi] >= platten.schwelle) id = platten.id;
      if (gy >= zeilen - BODEN_ZELLEN) id = grund;
      feld[zi] = id;
      gy += 1;
    }
    for (; gy < zeilen; gy += 1) feld[gy * spalten + gx] = gy >= zeilen - BODEN_ZELLEN ? grund : kern;
  }

  const karte = { feld, spalten, zeilen, zelle, breite: width, hoehe: height, geschuetzt: null };
  karte.geschuetzt = baueSchutz(karte);
  return karte;
}

/** Eine Zelle je Byte: 1 = unzerstörbar (Krater lassen sie stehen). */
function baueSchutz(karte) {
  const schutz = new Uint8Array(karte.feld.length);
  let irgendeiner = false;
  for (let i = 0; i < karte.feld.length; i += 1) {
    if (unzerstoerbar(karte.feld[i])) { schutz[i] = 1; irgendeiner = true; }
  }
  return irgendeiner ? schutz : null;
}

/** Kennung des Stoffs an einem Pixel (außerhalb: nächste Randzelle). */
export function stoffAm(karte, x, y) {
  if (!karte) return STOFF.ERDE;
  const gx = Math.max(0, Math.min(karte.spalten - 1, Math.floor(x / karte.zelle)));
  const gy = Math.max(0, Math.min(karte.zeilen - 1, Math.floor(y / karte.zelle)));
  return karte.feld[gy * karte.spalten + gx];
}

/**
 * Das Material an einem Punkt als Katalogeintrag (`config/stoffe.js`) — die reine Lesefunktion, die
 * Server und Client gleich benutzen (z. B. für eine Einschlag-Klassifikation). Ohne Karte: Erde.
 */
export function materialAn(karte, x, y) {
  return stoffById(stoffAm(karte, x, y));
}

/** Ist der Pixel unzerstörbar? */
export function geschuetztAm(karte, x, y) {
  if (!karte?.geschuetzt) return false;
  const gx = x >> 3;
  const gy = y >> 3;
  if (gx < 0 || gy < 0 || gx >= karte.spalten || gy >= karte.zeilen) return false;
  return karte.geschuetzt[gy * karte.spalten + gx] === 1;
}

/**
 * Der Stoff, auf den ein Einschlag wirkt: der häufigste unter neun Proben (Mitte und acht
 * Punkte auf dem halben Radius), die festes Gelände treffen; bei Gleichstand der härtere.
 * Trifft keine Probe festes Gelände, gilt der Stoff der Mitte.
 *
 * @param {{isSolid:function}} maske
 */
export function stoffAmEinschlag(karte, maske, x, y, radius) {
  if (!karte) return STOFF.ERDE;
  const d = Math.round(radius * 0.5);
  const punkte = [[0, 0], [d, 0], [-d, 0], [0, d], [0, -d], [d, d], [-d, d], [d, -d], [-d, -d]];
  const zaehler = new Uint8Array(32);
  let treffer = 0;
  for (const [dx, dy] of punkte) {
    const px = Math.round(x) + dx;
    const py = Math.round(y) + dy;
    if (px < 0 || py < 0 || px >= karte.breite || py >= karte.hoehe || !maske.isSolid(px, py)) continue;
    zaehler[stoffAm(karte, px, py)] += 1;
    treffer += 1;
  }
  if (treffer === 0) return stoffAm(karte, x, y);
  let beste = 0;
  let bestZahl = -1;
  for (let id = 0; id < 32; id += 1) {
    if (zaehler[id] === 0) continue;
    const staerker = zaehler[id] > bestZahl
      || (zaehler[id] === bestZahl && haerteRang(id) > haerteRang(beste));
    if (staerker) { beste = id; bestZahl = zaehler[id]; }
  }
  return beste;
}

const HAERTE_RANG = Object.freeze({ weich: 0, normal: 1, hart: 2, sehr_hart: 3, unzerstoerbar: 4 });
function haerteRang(id) {
  return HAERTE_RANG[stoffById(id).haerte];
}

/** Hash der Stoffkarte (FNV-1a über die Bytes, Maße fließen ein) für den Abgleich Server und Client. */
export function stoffHash(karte) {
  if (!karte) return null;
  let h = FNV_BASIS;
  h = Math.imul(h ^ karte.spalten, FNV_PRIM);
  h = Math.imul(h ^ karte.zeilen, FNV_PRIM);
  const f = karte.feld;
  for (let i = 0; i < f.length; i += 1) h = Math.imul(h ^ f[i], FNV_PRIM);
  return h >>> 0;
}

/**
 * Zählt die Zellen je Stoff (Prüfwerkzeuge, Tests): `Map<key, anzahl>`. Mit `bitmap` zählen nur
 * Zellen, deren Mitte festes Gelände ist (Luft trägt einen Stoff, aber keinen Inhalt).
 */
export function zaehleStoffe(karte, bitmap = null) {
  const z = new Map();
  if (!karte) return z;
  for (let i = 0; i < karte.feld.length; i += 1) {
    if (bitmap) {
      const gx = i % karte.spalten;
      const gy = (i - gx) / karte.spalten;
      const px = Math.min(karte.breite - 1, gx * karte.zelle + (karte.zelle >> 1));
      const py = Math.min(karte.hoehe - 1, gy * karte.zelle + (karte.zelle >> 1));
      if (!bitmap[py * karte.breite + px]) continue;
    }
    const k = stoffById(karte.feld[i]).key;
    z.set(k, (z.get(k) ?? 0) + 1);
  }
  return z;
}
