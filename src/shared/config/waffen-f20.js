/**
 * Werte der Waffenfassung 20 über der Fassung 19 (Entscheidung des Auftraggebers vom 2026-11-10).
 *
 * FEUERWESEN: „Feuerwesen ist ein kleiner Feuergnom, der geradeaus läuft, springt und bei Berührung mit Spieler in
 * 5 Feuerkugeln zerbirst!" Bis Fassung 19 war `pa_118` ein Strahl (`delivery: 'hitscan'`) mit Fläche 42 und Brand;
 * das Etikett `special: 'fire_minion'` las im Motor niemand (`docs/waffenbalance-2026-11-09/BAL-16-NAME-MECHANIK.md`).
 * Ab Fassung 20 setzt der Schuss einen Läufer ab (`engine/feuerwesen.js`); der Wirkpfad heißt `laeufer`.
 *
 * Die Zahlen stehen hier und nirgends sonst; der Motor liest sie über `getWaffe(…, 20).laeufer`. Herleitung und
 * Messungen: `docs/waffenbalance-2026-11-09/FEUERWESEN-FASSUNG20.md`.
 *
 * Läufer (Pixel und Takte zu 60 Hz):
 *   - `tempo` 1,6 px/Takt, `laufzeitTakte` 270 (4,5 s): 432 px Laufweg auf ebenem Boden — die alte Strahlweite des
 *     Katalogs (`maxRange` 429) bleibt die Reichweite der Waffe.
 *   - `stufe` 4 px: so hoch steigt er ohne Sprung (Unebenheiten, flache Hänge).
 *   - `sprungHoehe` 30 px: höchstes Hindernis, über das er springt (anderthalb Figurenhöhen, Figur 20 px).
 *     Höher ist eine Wand: er kehrt um (Begründung in der Doku: ein stehender Gnom wäre nur eine Zeitbombe am Fuß
 *     der Wand, ein umkehrender bleibt eine Bedrohung und läuft zurück — wie das Superschaf).
 *   - `hopserHoehe` 6 px alle `hopserTakte` 45 Takte: das kleine Hüpfen beim Laufen.
 *   - `breite`/`hoehe`: halbe Körperbreite 4 px, Körperhöhe 12 px (kleiner als eine Figur, 7/20 px).
 *
 * Feuerkugeln (`kugeln`): genau `anzahl` 5 in festem Fächer von `faecherGrad` 90 Grad symmetrisch um die Senkrechte
 * (45°, 67,5°, 90°, 112,5°, 135°), Startgeschwindigkeit `tempo` 5,5 px/Takt, ohne Zufall. Je Kugel `schaden` 12 und
 * `radius` 22: Vorbild ist der Feuerball (`pa_072`, 48 Schaden, Radius 34), geteilt durch vier für fünf Kugeln, von
 * denen an einer berührten Figur gemessen meist drei bis vier treffen (Messung in der Doku). Brand kommt wie bisher
 * aus `elemental.fire` 40 des Katalogs (`elementalEffectFor`, je Treffer, Brand stapelt sich nicht: `schadenMali.js`).
 * `lebensdauerTakte` 180 begrenzt den Flug sichtbar (Deckel-Detonation wie bei jedem Geschoss).
 *
 * @module config/waffen-f20
 */
export const FEUERWESEN_WAFFE_ID = 'pa_118';

export const FEUERWESEN_WERTE = Object.freeze({
  tempo: 1.6,
  laufzeitTakte: 270,
  stufe: 4,
  sprungHoehe: 30,
  hopserHoehe: 6,
  hopserTakte: 45,
  breite: 4,
  hoehe: 12,
  /** Abstand zwischen Figurenrand und Gnom beim Absetzen (px). */
  absetzAbstand: 6,
  /** Fallgeschwindigkeit höchstens (px/Takt): der Gnom tunnelt nicht durch dünne Böden. */
  fallMax: 8,
  /** Alle so viele Takte meldet er seine Lage (`feuerwesen_lauf`, für den Online-Client). */
  meldeTakte: 4,
  kugeln: Object.freeze({
    anzahl: 5,
    faecherGrad: 90,
    tempo: 5.5,
    schaden: 20,
    radius: 30,
    rueckstoss: 0,
    gelaende: 0,
    lebensdauerTakte: 180,
  }),
});

export const WAFFEN_F20_WERTE = Object.freeze({
  [FEUERWESEN_WAFFE_ID]: Object.freeze({
    delivery: 'laeufer',
    laeufer: FEUERWESEN_WERTE,
  }),
});
