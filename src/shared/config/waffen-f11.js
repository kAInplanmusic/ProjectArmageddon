/**
 * Werte der Waffenfassung 11 über der Fassung 10 (Entscheidung des Auftraggebers vom 2026-10-29).
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

/** Das dritte Schild: Feuer. Größer als Eis und Funken (Stufe episch, ein Schuss, lange Pause). */
const SCHILDE = Object.freeze({
  pa_148: wirk({ amount: 75, element: 'fire', gegen: 'fire' }, { damageType: 'fire' }), // Feuerschild: Brand auf den Angreifer
});

/** Alle Werte der Fassung 11 je Waffe; `getWaffe` legt sie über Fassung 10. */
export const WAFFEN_F11_WERTE = Object.freeze({ ...SCHILDE });
