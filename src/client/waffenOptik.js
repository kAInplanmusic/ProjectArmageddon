/**
 * Waffenoptik: welche Bildsprache eine Waffe beim Schuss, im Flug und beim Einschlag spricht.
 *
 * Reine Zuordnung ohne Canvas (prüfbar in `tests/waffen-optik.test.js`). Die Zeichnung steht in
 * `waffenOptikZeichnen.js` (Strahl, Schweif, Mündungsform) und `einschlagArten.js` (Einschlag je
 * Schadensart); die Bildfolgen in `effektSheets.js`.
 *
 * Grundlage ist die FAMILIE einer Schadensart (`engine/damageTypes.js`): Feuer, Eis, Wasser, Gift,
 * Magie, Heilig, Blitz, Energie, Wind und der Rest als „explosiv" (Sprengstoff, Wucht, Physik).
 * Früher endeten alle 150 Waffen in derselben orangen Explosion, jeder Strahl war eine Linie in der
 * Blitzfarbe, und das Mündungsfeuer hing an der Figur statt an der Waffe (Audit Waffenoptik
 * 2026-10-30, N-07, N-08, N-11).
 *
 * Alles hier ist Anzeige: kein Einfluss auf Engine, Hash, Replay oder Netz, kein Zufall.
 *
 * @module waffenOptik
 */
import { damageTypeName } from '../engine/damageTypes.js';

/** Schadensart → Familie. Unbekannte Arten und alles Physische: `explosiv`. */
export const ART_FAMILIE = Object.freeze({
  fire: 'feuer', dragon: 'feuer',
  ice: 'eis',
  water: 'wasser',
  poison: 'gift', acid: 'gift', nature: 'gift',
  arcane: 'magie', astral: 'magie', void: 'magie', chaos: 'magie', dark: 'magie',
  spatial: 'magie', psychic: 'magie', time: 'magie', temporal: 'magie',
  holy: 'heilig', medical: 'heilig',
  electric: 'blitz', magnetic: 'blitz',
  energy: 'energie',
  wind: 'wind',
});

/** Waffen, deren Bild nicht zur Schadensart passt (Frostsanduhr ist `time`, sieht aber nach Eis aus). */
export const WAFFEN_FAMILIE = Object.freeze({
  pa_099: 'eis',
  pa_105: 'eis',
  pa_098: 'feuer',
  pa_063: 'wasser',
  pa_131: 'wasser',
});

/** Alle Familien in fester Reihenfolge. */
export const FAMILIEN = Object.freeze(['explosiv', 'feuer', 'eis', 'wasser', 'gift', 'magie', 'heilig', 'blitz', 'energie', 'wind']);

/**
 * Farben je Familie als RGB-Tripel: `kern` (hell), `mitte`, `rand` (dunkel). Der Explosionsblitz
 * (`effektStil.zeichneExplosion`) und die Strahlen nehmen sie; `explosiv` ist der bisherige Ton.
 */
export const FAMILIEN_FARBEN = Object.freeze({
  explosiv: Object.freeze({ kern: [255, 246, 214], mitte: [255, 184, 0], rand: [255, 77, 0] }),
  feuer: Object.freeze({ kern: [255, 243, 196], mitte: [255, 150, 30], rand: [230, 50, 10] }),
  eis: Object.freeze({ kern: [244, 253, 255], mitte: [155, 231, 255], rand: [63, 169, 245] }),
  wasser: Object.freeze({ kern: [230, 247, 255], mitte: [92, 200, 255], rand: [31, 111, 209] }),
  gift: Object.freeze({ kern: [244, 255, 214], mitte: [155, 232, 58], rand: [63, 143, 26] }),
  magie: Object.freeze({ kern: [253, 234, 255], mitte: [199, 125, 255], rand: [123, 44, 191] }),
  heilig: Object.freeze({ kern: [255, 251, 230], mitte: [255, 224, 102], rand: [244, 163, 0] }),
  blitz: Object.freeze({ kern: [255, 255, 255], mitte: [158, 240, 255], rand: [77, 124, 255] }),
  energie: Object.freeze({ kern: [240, 255, 255], mitte: [95, 244, 255], rand: [0, 162, 255] }),
  wind: Object.freeze({ kern: [255, 255, 255], mitte: [214, 242, 236], rand: [143, 191, 180] }),
});

/** `rgba(...)`-Text aus einem Tripel. */
export function rgba(tripel, alpha = 1) {
  return `rgba(${tripel[0]}, ${tripel[1]}, ${tripel[2]}, ${Math.max(0, Math.min(1, alpha))})`;
}

/**
 * Familie einer Schadensart (Name oder Kennung aus dem Ereignis `explosion`).
 * @param {string|number|null|undefined} art
 * @returns {string}
 */
export function familieVonArt(art) {
  const name = typeof art === 'number' ? damageTypeName(art) : art;
  return (name && ART_FAMILIE[name]) || 'explosiv';
}

/**
 * Familie einer Waffe: Einzelkorrektur, sonst ihre Schadensart.
 * @param {{id?:string, damageType?:string}|null|undefined} waffe
 */
export function familieVonWaffe(waffe) {
  if (!waffe) return 'explosiv';
  return WAFFEN_FAMILIE[waffe.id] ?? familieVonArt(waffe.damageType);
}

/*
 * Mündungsfeuer (N-07). Das Sheet `muendung.webp` hat eine Zeile je Waffenart
 * (`scripts/sprites-erzeugen/effekt-zeichnen.py`, `MUENDUNG_ARTEN`).
 */
export const MUENDUNG_ZEILE = Object.freeze({ pistole: 0, gewehr: 1, schwer: 2, schrot: 3, energie: 4 });

/** Einzelne Waffen, die ihre Zeile nicht aus den Regeln bekommen. `keiner`: kein Mündungsfeuer (Bogen, Wurf). */
export const MUENDUNG_WAFFE = Object.freeze({
  pa_040: 'pistole', pa_057: 'pistole',
  pa_055: 'gewehr', pa_056: 'gewehr', pa_060: 'gewehr',
  pa_054: 'schrot', pa_042: 'schrot',
  pa_037: 'schwer', pa_039: 'schwer', pa_043: 'schwer',
  pa_058: 'keiner', pa_059: 'keiner', pa_049: 'keiner', pa_050: 'keiner', pa_051: 'keiner',
  pa_023: 'keiner', pa_024: 'keiner', pa_025: 'keiner', pa_027: 'keiner',
});

/** Bezugsgröße der Kegel-Blitze (`waffenAnimation.PARAMETER.ranged.blitzGroesse`). */
const KEGEL_BEZUG = 14;

/**
 * Wie das Mündungsfeuer einer Waffe aussieht.
 *
 * - `{ quelle: 'sheet', zeile, skala }` — Bildfolge aus `muendung.webp` (Feuerwaffen mit Kegelblitz)
 * - `{ quelle: 'form', form, groesse, farbe }` — gezeichnete Blitzform in der Familienfarbe
 *   (Stern, Ring, Funke; Zauber, Elemente, Technik)
 * - `null` — kein Mündungsfeuer (Nahkampf, Wurf, Bogen)
 *
 * Ohne Waffe (prozedurale Figur ohne Katalogwaffe) bleibt es beim kleinen Pistolenblitz.
 *
 * @param {object|null} waffe - Katalogeintrag
 * @param {{blitzForm?:string, blitzGroesse?:number}|null} par - aus `waffenAnimation.parameterFuerWaffe`
 */
export function muendungsStil(waffe, par) {
  if (!waffe) return { quelle: 'sheet', zeile: MUENDUNG_ZEILE.pistole, skala: 1 };
  const form = par?.blitzForm ?? 'kegel';
  const groesse = par?.blitzGroesse ?? KEGEL_BEZUG;
  const eigen = MUENDUNG_WAFFE[waffe.id];
  if (eigen === 'keiner' || form === 'keiner' || groesse <= 0) return null;
  const familie = familieVonWaffe(waffe);
  if (form !== 'kegel') {
    return { quelle: 'form', form, groesse, farbe: rgba(FAMILIEN_FARBEN[familie].mitte) };
  }
  let art = eigen;
  if (!art) {
    if (familie === 'energie' || familie === 'blitz' || familie === 'magie') art = 'energie';
    else if (groesse >= 20 || waffe.category === 'heavy_ranged' || waffe.category === 'ultimate') art = 'schwer';
    else if ((waffe.blastRadius ?? 0) >= 30) art = 'schwer';
    else art = 'pistole';
  }
  const skala = Math.max(0.75, Math.min(1.4, groesse / KEGEL_BEZUG));
  return { quelle: 'sheet', zeile: MUENDUNG_ZEILE[art], skala };
}

/*
 * Hitscan-Strahlen (N-11): je Familie eine eigene Zeichnung statt einer Linie in `flashColor`.
 */
const STRAHL_JE_FAMILIE = Object.freeze({
  explosiv: 'leuchtspur', feuer: 'feuer', eis: 'eis', wasser: 'wasser', gift: 'gift',
  magie: 'magie', heilig: 'heilig', blitz: 'blitz', energie: 'laser', wind: 'wind',
});

/** Alle Strahlarten. */
export const STRAHL_ARTEN = Object.freeze([...new Set(Object.values(STRAHL_JE_FAMILIE))]);

/** Strahlart einer Waffe (ohne Waffe: Laser, wie bisher eine gerade Linie). */
export function strahlArt(waffe) {
  return waffe ? STRAHL_JE_FAMILIE[familieVonWaffe(waffe)] : 'laser';
}

/*
 * Schweif der Geschosse (N-09/N-10): je Geschossart (`manifest.projectile.art`) und Familie.
 */
const SCHWEIF_JE_GESCHOSS = Object.freeze({
  rakete: 'rauch', granate: 'duenn', kugel: 'leuchtspur', pfeil: 'duenn', stein: 'staub',
  feuer: 'flamme', gift: 'tropfen', eis: 'frost', wasser: 'tropfen', plasma: 'funkeln', zauber: 'funkeln',
});

/** Alle Schweifarten. */
export const SCHWEIF_ARTEN = Object.freeze(['linie', 'rauch', 'duenn', 'leuchtspur', 'staub', 'flamme', 'tropfen', 'frost', 'funkeln']);

/** Eigene Spur der Signaturgeschosse (W13): Form und Schweif sollen zusammengehören. */
const SIGNATUR_SCHWEIF = Object.freeze({ daemon: 'rauch', phoenix: 'flamme', drache: 'funkeln' });

/**
 * Schweifart eines Geschosses: aus seiner Geschossart, bei Wurfdingen (`ding`) aus der Familie.
 * @param {string|undefined} geschossArt - `projectile.art` im Manifest
 * @param {object|null} waffe
 */
export function schweifArt(geschossArt, waffe) {
  /*
   * Signaturgeschosse (W13) behalten ihre eigene Spur, auch wenn ihre Familie
   * „Feuer" ist: Der Feuerdämon zieht Rauch, der Phönix eine Flamme, der
   * Weltendrache Funken. Ohne diese Ausnahme fielen alle drei auf `flamme` —
   * dieselbe Spur bei drei verschiedenen Formen.
   */
  const signatur = SIGNATUR_SCHWEIF[geschossArt];
  if (signatur) return signatur;
  const familie = familieVonWaffe(waffe);
  if (familie === 'feuer') return 'flamme';
  if (familie === 'eis') return 'frost';
  if (familie === 'gift' || familie === 'wasser') return 'tropfen';
  if (familie === 'magie' || familie === 'heilig' || familie === 'energie' || familie === 'blitz') {
    return geschossArt === 'ding' ? 'linie' : 'funkeln';
  }
  return SCHWEIF_JE_GESCHOSS[geschossArt] ?? 'linie';
}
