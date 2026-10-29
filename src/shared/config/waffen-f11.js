/**
 * Werte der Waffenfassung 11 über der Fassung 10 (Entscheidung des Auftraggebers vom 2026-10-29).
 *
 * Teil C, RÜCKSTOSS: Ein Nahkampftreffer stößt das Ziel zurück, je Waffe verschieden (Beispiele des Auftraggebers: Baseballschläger
 * "nach vorn, weit"; Flammenwerfer "mittel, nach oben"). Bisher wirkte `knockback` nur bei Waffen mit Sprengradius. Die Schicht trägt
 * je Waffe die STÄRKE (`knockback`, gleiche Einheit wie im Katalog: Stärke × 0,02 = px je Tick, gedeckelt bei 6) und die RICHTUNG
 * (`stossRichtung`, Grad über der Waagerechten in Schussrichtung: 0 vorn, 45 schräg, 90 oben, 150 bis 180 zum Schützen hin; Regeln in
 * `engine/stoss.js`). Stärke und Schaden tragen die Waffe zusammen: leichte Klingen schieben kaum, Schläger, Hämmer und Fäuste viel.
 * Tabelle auch in `docs/audit-waffen-2026-10-28.md` (Abschnitt "Fassung 11").
 *
 * Teil B, DREI SCHILDE mit eigenem Charakter ("Schild ist Schutz um den Eigenen; Eis ist fest, Funkenschild ist magisch, und Funken sind
 * Flammen, normal"). Es gibt genau drei Schild-Waffen (Wirkung `shield`):
 *   - Eisschild `pa_101` (fest, Eis): viel Schild, der Angreifer bekommt Frost (Fassung 10).
 *   - Funkenschild `pa_093` (magisch, Strom): weniger Schild, der Angreifer bekommt Schock (Fassung 10).
 *   - Feuerschild `pa_148` (normal, Flammen): bisher "Himmelswächter" (dieselbe Wirkung `guardian_ultimate` = Schild, Kennung und
 *     `internalName` bleiben); Schadensart Feuer, der Angreifer bekommt Brand. Anzeigename und Beschreibung stehen im Katalog.
 * Die Wirkungen laufen über vorhandene Mali (`MaliRegeln.schaden`, Feld `wirkung.gegen`); die Katalogzahl 150 und die Beute bleiben.
 *
 * @module config/waffen-f11
 */

const wirk = (wirkung, rest = {}) => Object.freeze({ ...rest, wirkung: Object.freeze(wirkung) });

const stoss = (knockback, stossRichtung) => Object.freeze({ knockback, stossRichtung });

/**
 * Rückstoß je Waffe: `[Stärke, Richtung in Grad]`, dazu der Charakter in einem Satz (Quelle der Tabelle im Audit-Dokument).
 */
export const RUECKSTOSS_TABELLE = Object.freeze({
  // Nahkämpfer (21)
  pa_001: Object.freeze([300, 15, 'Baseballschläger: nach vorn, weit']),
  pa_002: Object.freeze([190, 30, 'Feuerfaust: Faustschlag, mittel, schräg nach oben']),
  pa_003: Object.freeze([110, 160, 'Hakenklinge: zieht den Gegner ein Stück heran']),
  pa_004: Object.freeze([150, 165, 'Piratenhaken: zieht den Gegner weit heran']),
  pa_005: Object.freeze([230, 40, 'Morgenstern: schwer, schräg nach oben']),
  pa_006: Object.freeze([150, 25, 'Schaufel: mittel nach vorn']),
  pa_007: Object.freeze([110, 10, 'Tonfa: kurz nach vorn']),
  pa_008: Object.freeze([220, 70, 'Kriegshammer: stark nach oben']),
  pa_009: Object.freeze([100, 75, 'Eispickel: kurz nach oben']),
  pa_010: Object.freeze([70, 0, 'Kettensäge: schwach nach vorn']),
  pa_011: Object.freeze([70, 20, 'Zwillingskatanas: leicht']),
  pa_012: Object.freeze([60, 20, 'Katana: leicht']),
  pa_013: Object.freeze([55, 15, 'Mehrzweckmesser: leicht']),
  pa_014: Object.freeze([40, 15, 'Taschenmesser: sehr leicht']),
  pa_015: Object.freeze([120, 45, 'Runenschwert: magisch, schräg nach oben']),
  pa_016: Object.freeze([30, 0, 'Rapier: sticht, kaum Stoß']),
  pa_017: Object.freeze([50, 15, 'Kampfmesser: leicht']),
  pa_018: Object.freeze([130, 30, 'Energieschwert: mittel, schräg']),
  pa_019: Object.freeze([140, 20, 'Doppelaxt: mittel nach vorn']),
  pa_020: Object.freeze([130, 35, 'Kriegssense: mittel, schräg nach oben']),
  pa_021: Object.freeze([60, 20, 'Krummsäbel: leicht']),
  // Fäuste, Hände und Handschuhe
  pa_023: Object.freeze([200, 20, 'Boxhandschuhe: Faustschlag nach vorn']),
  pa_031: Object.freeze([250, 25, 'Kraftfaust: sehr stark nach vorn']),
  pa_036: Object.freeze([200, 30, 'Raketenhandschuh: stark, schräg nach oben']),
  pa_083: Object.freeze([180, 30, 'Goldene Hand: Schlag, schräg nach oben']),
  pa_120: Object.freeze([240, 20, 'Energiefaust: Energiestoß nach vorn']),
  // Hämmer
  pa_138: Object.freeze([260, 75, 'Arkanhammer: sehr stark nach oben']),
  // Feuer, Wasser und Wind
  pa_062: Object.freeze([150, 70, 'Flammenwerfer: mittel, nach oben']),
  pa_137: Object.freeze([110, 55, 'Flammenklinge: mittel, schräg nach oben']),
  pa_063: Object.freeze([170, 10, 'Wasserwerfer: Strahl drückt nach vorn']),
  pa_086: Object.freeze([260, 20, 'Windkrieger: Windstoß, weit nach vorn']),
  // Leichtes, Zug und Druck
  pa_025: Object.freeze([60, 10, 'Handtuch: leichter Hieb']),
  pa_026: Object.freeze([140, 15, 'Pressluftbohrer: Druckstoß nach vorn']),
  pa_108: Object.freeze([90, 150, 'Zauberpeitsche: zieht den Gegner heran']),
  pa_123: Object.freeze([160, 175, 'Magnetkanone: zieht den Gegner an']),
});

const RUECKSTOSS = Object.freeze(Object.fromEntries(
  Object.entries(RUECKSTOSS_TABELLE).map(([id, [staerke, richtung]]) => [id, stoss(staerke, richtung)]),
));

/** Das dritte Schild: Feuer. Größer als Eis und Funken (Stufe episch, ein Schuss, lange Pause). */
const SCHILDE = Object.freeze({
  pa_148: wirk({ amount: 75, element: 'fire', gegen: 'fire' }, { damageType: 'fire' }), // Feuerschild: Brand auf den Angreifer
});

/** Alle Werte der Fassung 11 je Waffe; `getWaffe` legt sie über Fassung 10. */
export const WAFFEN_F11_WERTE = Object.freeze({ ...RUECKSTOSS, ...SCHILDE });
