/**
 * Sprite-Sheets der Figuren: Zellen als Frames, Rollenwahl je Zustand (nur Darstellung).
 *
 * Je Figur gibt es zwei Sheets (1024 x 512, 4 x 2 Zellen à 256 px, Grundlinie y = 240):
 * `walk` (Gehzyklus, 8 Frames) und `aktion` (Idle, Sprung, Hocke, Treffer, Niedergestreckt).
 * Welche Zelle welche Rolle spielt, steht abgeleitet im Manifest
 * (`scripts/sprite-sheets-klassifizieren.py`). Fehlt eine Rolle, bleibt `null` — dann zeichnet der
 * Renderer das bisherige Seitenbild mit der prozeduralen Animation aus `figurAnimation.js`.
 *
 * Jeder Frame ist ein figurähnliches Objekt (`quelle`, `stufen`), damit die Mip-Kette aus
 * `figurStufen.js` unverändert greift. Ohne Bundler und Canvas prüfbar (die Leinwand kommt von außen).
 *
 * @module figurSheets
 */

export const ZELLE = 256;
export const SPALTEN = 4;
const ZEILEN = 2;
/** Blattgröße in Pixeln. */
const BLATT_B = ZELLE * SPALTEN;
const BLATT_H = ZELLE * ZEILEN;

/** Zustandsbits der Pose (mehrere gleichzeitig möglich; die Rollenwahl nimmt die wichtigste mit Frame). */
export const MODUS = Object.freeze({ TREFFER: 1, LUFT: 2, HOCKE: 4, GEHEN: 8 });

/** Anzahl der Stufen der Mip-Kette (muss zu `STUFEN` in `figurStufen.js` passen). */
const STUFEN_ANZAHL = 5;

function standardLeinwand(b, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(b, h);
  const c = document.createElement('canvas');
  c.width = b; c.height = h;
  return c;
}

/** Schneidet Zelle `i` (Leserichtung) aus einem Blatt als eigenständigen Frame. */
function frameAusZelle(bild, i, neueLeinwand = standardLeinwand) {
  const z = neueLeinwand(ZELLE, ZELLE);
  z.getContext('2d').drawImage(bild, (i % SPALTEN) * ZELLE, Math.floor(i / SPALTEN) * ZELLE, ZELLE, ZELLE, 0, 0, ZELLE, ZELLE);
  return { quelle: z, stufen: new Array(STUFEN_ANZAHL).fill(null), bild: null, hell: null };
}

/** Gültiges Zellenmaß eines Blatts? */
function blattMassOk(bild) {
  const b = bild?.naturalWidth || bild?.width;
  const h = bild?.naturalHeight || bild?.height;
  return b === BLATT_B && h === BLATT_H;
}

const zelleOk = i => Number.isInteger(i) && i >= 0 && i < SPALTEN * ZEILEN;

/**
 * Baut die Frames einer Figur aus Manifesteintrag und geladenen Blättern.
 *
 * @param {{rollen?: object, gehen?: number[]}} eintrag - Eintrag aus `sprite-sheets/manifest.json`
 * @param {CanvasImageSource|null} walkBild
 * @param {CanvasImageSource|null} aktionBild
 * @returns {{walk: object[]|null, idle: object[]|null, luft: object|null, hocke: object|null,
 *   treffer: object|null, tod: object|null}}
 */
export function blattBauen(eintrag, walkBild, aktionBild, neueLeinwand = standardLeinwand) {
  const blatt = { walk: null, idle: null, luft: null, hocke: null, treffer: null, tod: null };
  if (walkBild && blattMassOk(walkBild) && Array.isArray(eintrag?.gehen) && eintrag.gehen.length === 8
    && eintrag.gehen.every(zelleOk)) {
    const je = new Map();
    blatt.walk = eintrag.gehen.map((i) => {
      if (!je.has(i)) je.set(i, frameAusZelle(walkBild, i, neueLeinwand));
      return je.get(i);
    });
  }
  if (aktionBild && blattMassOk(aktionBild)) {
    const r = eintrag?.rollen ?? {};
    const je = new Map();
    const hole = (i) => {
      if (!zelleOk(i)) return null;
      if (!je.has(i)) je.set(i, frameAusZelle(aktionBild, i, neueLeinwand));
      return je.get(i);
    };
    if (Array.isArray(r.idle) && r.idle.length === 2 && r.idle.every(zelleOk)) blatt.idle = [hole(r.idle[0]), hole(r.idle[1])];
    blatt.luft = hole(r.luft);
    blatt.hocke = hole(r.hocke);
    blatt.treffer = hole(r.treffer);
    blatt.tod = hole(r.tod);
  }
  return blatt;
}

/**
 * Die acht Posen des Emotions-Sheets in Zellenreihenfolge (`sprite-sheets-emotion/`, 4 x 2 Zellen à 256 px):
 * Angst, Blinzeln (Augen zu), Schulterzucken, Jubel, Zittern, Kopf hoch, Kopf runter, Waffenwechsel.
 */
export const EMOTIONEN = Object.freeze(['angst', 'blinzeln', 'schulterzucken', 'jubel', 'zittern', 'blickHoch', 'blickRunter', 'waffenwechsel']);

/** Frames des Emotions-Sheets je Name; `null`, wenn das Blatt fehlt oder das falsche Maß hat. */
export function emotionBauen(bild, neueLeinwand = standardLeinwand) {
  if (!bild || !blattMassOk(bild)) return null;
  return Object.fromEntries(EMOTIONEN.map((name, i) => [name, frameAusZelle(bild, i, neueLeinwand)]));
}

/** Blinzeln: alle `BLINZEL_ABSTAND` Sekunden für `BLINZEL_DAUER` (je Figur um `id` versetzt). */
const BLINZEL_ABSTAND = 4.4;
const BLINZEL_DAUER = 0.14;
/** Sinus des Zielwinkels, ab dem der Kopf hoch (≈ 53°, der Standardwinkel von 45° bleibt neutral) bzw. runter (≈ −15°) geht. */
const BLICK_HOCH = 0.8;
const BLICK_RUNTER = -0.26;
/** Lebensanteil, ab dem die Figur zittert. */
const ZITTERN_AB = 0.25;

/**
 * Welche Emotion zeigt eine STEHENDE Figur? `null` = keine (dann gilt der Idle-Frame).
 * Reihenfolge: Jubel (Sieger) vor Zittern (Verlierer, wenig Leben) vor Blick beim Zielen vor Blinzeln.
 *
 * @param {{ergebnis:number, hp:number, aktiv:boolean, winkelSin:number, zeit:number, id:number}} z
 * @returns {string|null} Name aus `EMOTIONEN`
 */
export function waehleEmotion({ ergebnis, hp, aktiv, winkelSin, zeit, id }) {
  if (ergebnis > 0) return 'jubel';
  if (ergebnis < 0) return 'zittern';
  if (hp > 0 && hp <= ZITTERN_AB) return 'zittern';
  if (aktiv && winkelSin > BLICK_HOCH) return 'blickHoch';
  if (aktiv && winkelSin < BLICK_RUNTER) return 'blickRunter';
  const t = (zeit + id * 0.73) % BLINZEL_ABSTAND;
  return t >= 0 && t < BLINZEL_DAUER ? 'blinzeln' : null;
}

/**
 * Rolle für die Zustandsbits: Treffer vor Luft vor Hocke vor Gehen, jeweils nur, wenn das Blatt dafür
 * einen Frame hat; sonst Stehen (Idle) oder `null` (Seitenbild + prozedurale Animation).
 *
 * @returns {'treffer'|'luft'|'hocke'|'walk'|'idle'|null}
 */
export function waehleRolle(blatt, modi) {
  if (!blatt) return null;
  if ((modi & MODUS.TREFFER) && blatt.treffer) return 'treffer';
  if ((modi & MODUS.LUFT) && blatt.luft) return 'luft';
  if ((modi & MODUS.HOCKE) && blatt.hocke) return 'hocke';
  if ((modi & MODUS.GEHEN) && blatt.walk) return 'walk';
  // Fehlt die Rolle eines Bewegungszustands (Luft, Hocke, Gehen), bleibt es beim Seitenbild samt
  // Prozedur; nur im Stand (Treffer allein ändert daran nichts) gilt Idle.
  return (modi & ~MODUS.TREFFER) === 0 && blatt.idle ? 'idle' : null;
}

/**
 * Der Frame zur Rolle. `zyklus` 0..1 = Phase des Gehzyklus (aus der zurückgelegten Strecke, ohne Zufall),
 * `schalter` 0/1 = Idle-Frame (Atmung).
 */
export function frameFuer(blatt, rolle, zyklus, schalter) {
  if (!blatt || !rolle) return null;
  switch (rolle) {
    case 'walk': {
      const z = zyklus - Math.floor(zyklus);
      return blatt.walk[Math.min(7, Math.floor(z * 8))];
    }
    case 'idle': return blatt.idle[schalter ? 1 : 0];
    default: return blatt[rolle] ?? null;
  }
}
