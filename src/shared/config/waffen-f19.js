/**
 * Werte der Waffenfassung 19 über der Fassung 18 (BAL-16, Entscheidung des Auftraggebers vom 2026-11-10).
 *
 * STREUUNG: Die Schrotflinte (`pa_054`) hieß Schrotflinte und trug `special: 'spread_shot'`, verschoss aber EIN
 * Geschoss — `spread_shot` las im Motor niemand (`docs/waffenbalance-2026-11-09/BAL-16-NAME-MECHANIK.md`). Ab
 * Fassung 19 verschießt sie `streuung.anzahl` Schrotkugeln in einem festen Fächer von `streuung.faecherGrad` Grad
 * (`engine/shooting.js`, `streuWinkel`). Jede Kugel trägt 1/Anzahl von Schaden, Rückstoß und Geländeschaden: Aus der
 * Nähe treffen alle (zusammen der bisherige Schaden), auf Distanz nur ein Teil. Kein Zufall — Zielhilfe, KI und
 * Replay sehen denselben Fächer.
 *
 * Bemessung: Das Trefferfenster einer Kugel ist 24 px (Fassung 16). Ein Fächer von 12 Grad hat zwischen zwei
 * Nachbarkugeln 3 Grad; bis rund 230 px liegen alle fünf Kugeln innerhalb eines Fensters um das Ziel, ab rund
 * 460 px trifft nur noch die mittlere (Rechnung tan(3°) × d gegen 24 px, ohne Schwerkraft). Die Balance spielt
 * der Auftraggeber selbst durch.
 *
 * @module config/waffen-f19
 */
export const STREU_WAFFE_ID = 'pa_054';

export const WAFFEN_F19_WERTE = Object.freeze({
  [STREU_WAFFE_ID]: Object.freeze({
    description: 'Streut fünf Schrotkugeln in einem engen Fächer: aus der Nähe trifft alles, auf Distanz nur ein Teil.',
    streuung: Object.freeze({ anzahl: 5, faecherGrad: 12 }),
  }),
});
