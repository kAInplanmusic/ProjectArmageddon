/**
 * Waffenfassung 23 (TURRET-1, TODO 2.17b, Entscheidung 2026-11-25): drei selten genutzte Waffen stellen ein Geschütz auf.
 *
 * Auswahl: Ihr Name verspricht ein Geschütz, ihre bisherige Wirkung doppelte andere Waffen. Tesla-Turm und Gatlingkanone
 * stehen in keiner Startausrüstung (Kit-Fassung 5) und kommen nur aus Kisten; das Kampfgeschütz ist dazu die
 * Spezialwaffe einer Figur (Goemon), die damit ab Fassung 23 ein Geschütz aufstellt:
 *  - `pa_129` Tesla-Turm: Kettenblitz mit Sichtpflicht (wurde ohne freie Sicht abgelehnt) → Turm mit vielen kleinen Schüssen.
 *  - `pa_043` Kampfgeschütz: schwerer Direktschuss wie die Raketen → Geschütz mit wenigen schweren Schüssen.
 *  - `pa_060` Gatlingkanone: ein schwerer Schuss je Zug → Geschütz mit den meisten, leichtesten Schüssen.
 * Die Mechanik ist die des Wachgeschützes `pa_124` (`engine/turret.js`): Aufstellen neben dem Schützen, das Geschütz feuert
 * in den folgenden Runden von selbst auf den nächsten Gegner. `wirkung.turns` und `wirkung.damageFactor` unterscheiden die drei.
 *
 * Fassungen 1 bis 22 bleiben bitgleich (`tests/waffen-fassung23.test.js`).
 *
 * @module shared/config/waffen-f23
 */

/**
 * Dazu (Rückmeldung 2026-11-27, „mindestens zehn legendäre“): die 8 bisher epischen Waffen sind ab Fassung 23 legendär
 * (Kistenstufe und Farbe). Zusammen mit den 3 bisher legendären sind es 11, dieselbe Liste wie `LEGENDAERE_WAFFEN` der
 * Startausrüstung (`config/ausruestung.js`). Die Werte bleiben, nur die Stufe ändert sich.
 */
const LEGENDAER_AB_23 = Object.freeze(['pa_037', 'pa_044', 'pa_065', 'pa_077', 'pa_133', 'pa_144', 'pa_146', 'pa_148']);

export const WAFFEN_F23_WERTE = Object.freeze({
  ...Object.fromEntries(LEGENDAER_AB_23.map(id => [id, Object.freeze({ powerTier: 'legendary' })])),
  pa_129: Object.freeze({
    description: 'Stellt einen Tesla-Turm neben dir auf, der vier Runden lang von selbst auf den nächsten Gegner feuert, schwach, aber oft.',
    special: 'auto_target',
    requiresLineOfSight: false,
    wirkung: Object.freeze({ turns: 4, damageFactor: 0.45 }),
  }),
  pa_043: Object.freeze({
    description: 'Stellt ein Kampfgeschütz neben dir auf, das zwei Runden lang von selbst schwere Schüsse auf den nächsten Gegner abgibt.',
    special: 'auto_target',
    wirkung: Object.freeze({ turns: 2, damageFactor: 0.7 }),
  }),
  pa_060: Object.freeze({
    description: 'Stellt eine Gatlingkanone neben dir auf, die fünf Runden lang von selbst leichte Schüsse auf den nächsten Gegner abgibt.',
    special: 'auto_target',
    wirkung: Object.freeze({ turns: 5, damageFactor: 0.35 }),
  }),
});
