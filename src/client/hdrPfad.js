/**
 * Optionaler HDR-Ausgabepfad mit SDR-Rückfall (A21).
 *
 * Das ist eine Spezifikation als Code, keine Zusage: Es wird nichts als „HDR“
 * bezeichnet, solange nicht ALLE Glieder der Kette belegt sind. 4K-Auflösung
 * und Display-P3-Farbraum allein sind kein HDR — ein SDR-Bild in P3 bleibt
 * SDR. Die Kette besteht aus:
 *
 *  1. Inhalt     — Bilddaten mit Werten über 1,0 (lineares Licht, 10 Bit)
 *  2. Übertragung— PQ (ST 2084) oder HLG, im Container als HDR gekennzeichnet
 *  3. Compositing— Canvas/GPU gibt den erweiterten Bereich tatsächlich aus
 *                  (`colorSpace: 'display-p3'` ist nur der Farbraum, nicht PQ)
 *  4. Anzeige    — Betriebssystem und Display melden hohen Dynamikbereich
 *                  (`(dynamic-range: high)`) und geben ihn ungetont aus
 *
 * Fällt ein Glied aus, gilt SDR. Der SDR-Pfad ist der Standard und muss
 * identisch aussehen wie heute; HDR ist eine zusätzliche Wahl.
 *
 * @module hdrPfad
 */

/** Kennung des einzigen vorgesehenen HDR-Farbraums im Prototyp. */
export const HDR_FARBRAUM = 'display-p3';

/** Übertragungsfunktionen, die der Prototyp prüfen darf. */
export const HDR_UEBERTRAGUNG = Object.freeze(['pq', 'hlg']);

/** Die vier Glieder der Kette, in Prüfreihenfolge. */
export const HDR_KETTE = Object.freeze(['inhalt', 'uebertragung', 'compositing', 'anzeige']);

/**
 * Prüft die Kette. Alle Argumente sind Befunde von außen (keine eigenen
 * Fähigkeitsbehauptungen); fehlt einer, ist das Ergebnis SDR.
 *
 * @param {{
 *   inhalt10Bit?:boolean,
 *   uebertragung?:'pq'|'hlg'|string|null,
 *   canvasErweitert?:boolean,
 *   dynamikBereich?:'high'|'standard'|string,
 *   optIn?:boolean
 * }} faehigkeiten
 * @returns {{pfad:'sdr'|'hdr-p3', gruende:string[], farbraum:string, tonemapping:string, kette:object}}
 */
export function waehleHdrPfad({
  inhalt10Bit = false,
  uebertragung = null,
  canvasErweitert = false,
  dynamikBereich = 'standard',
  optIn = false,
} = {}) {
  const kette = {
    inhalt: Boolean(inhalt10Bit),
    uebertragung: HDR_UEBERTRAGUNG.includes(String(uebertragung ?? '').toLowerCase()),
    compositing: Boolean(canvasErweitert),
    anzeige: String(dynamikBereich).toLowerCase() === 'high',
  };
  const gruende = [];
  if (!optIn) gruende.push('kein ausdrückliches Opt-in des Spielers');
  for (const glied of HDR_KETTE) {
    if (!kette[glied]) gruende.push(`${glied} fehlt`);
  }
  const hdr = gruende.length === 0;
  return {
    pfad: hdr ? 'hdr-p3' : 'sdr',
    gruende,
    farbraum: hdr ? HDR_FARBRAUM : 'srgb',
    tonemapping: hdr ? 'reinhard' : 'keine',
    kette,
  };
}

/**
 * Liest die Anzeige-Fähigkeit aus einer `matchMedia`-Funktion. Fehler und
 * fehlende APIs gelten als „standard“ — nie als HDR.
 *
 * @param {(query:string)=>boolean} fragt z. B. `q => matchMedia(q).matches`
 */
export function liesDynamikBereich(fragt) {
  try {
    return fragt?.('(dynamic-range: high)') ? 'high' : 'standard';
  } catch {
    return 'standard';
  }
}

/**
 * Prüft, ob ein 2D-Kontext erweiterten Farbumfang anbietet. `getContext`
 * meldet bei unbekannten Optionen je nach Browser still einen SDR-Kontext;
 * deshalb wird der tatsächliche `colorSpace` zurückgelesen.
 *
 * @param {Document} doc
 * @returns {{verfuegbar:boolean, farbraum:string}}
 */
export function pruefeCanvasFarbraum(doc) {
  try {
    const canvas = doc.createElement('canvas');
    const ctx = canvas.getContext('2d', { colorSpace: HDR_FARBRAUM });
    const farbraum = ctx?.getContextAttributes?.().colorSpace ?? 'srgb';
    return { verfuegbar: farbraum === HDR_FARBRAUM, farbraum };
  } catch {
    return { verfuegbar: false, farbraum: 'srgb' };
  }
}
