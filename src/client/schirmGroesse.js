/**
 * Größe der Zeichenfläche aus der angezeigten Größe (TODO 2.1, Verzerrung).
 *
 * Die Zeichenfläche hat das Seitenverhältnis ihrer Anzeige, sonst streckt CSS das Bild (gemessen 2026-11-25: Karte 24:9 in
 * der 16:9-Bühne, Kreise 1,5-fach senkrecht gestreckt). Auflösung: mindestens 1920 Gerätepixel breit (kleine Fenster und
 * Telefone behalten die bisherige Schärfe der Bildschirm-Anzeigen, die in Zeichenflächenpixeln bemessen sind), sonst die
 * Gerätepixel, höchstens 3840 breit (4K) — Leistung.
 *
 * @module schirmGroesse
 */

export const SCHIRM_MIN_BREITE = 1920;
export const SCHIRM_MAX_BREITE = 3840;

/**
 * @param {number} cssBreite angezeigte Breite (CSS-Pixel)
 * @param {number} cssHoehe angezeigte Höhe (CSS-Pixel)
 * @param {number} [dpr] Gerätepixel je CSS-Pixel
 * @returns {{b:number, h:number}|null} `null`, solange nichts angezeigt wird
 */
export function schirmGroesse(cssBreite, cssHoehe, dpr = 1) {
  if (!(cssBreite > 0) || !(cssHoehe > 0)) return null;
  const geraet = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  let faktor = Math.max(geraet, SCHIRM_MIN_BREITE / cssBreite);
  faktor = Math.min(faktor, SCHIRM_MAX_BREITE / cssBreite);
  return { b: Math.round(cssBreite * faktor), h: Math.round(cssHoehe * faktor) };
}
