/**
 * Bedienung der Grafikstufe im Menü: Auswahl `#cfg-grafik`, Anzeige `#cfg-grafik-info`.
 * Die Wahl wird gespeichert; die Anzeige nennt die tatsächlich geltende Stufe samt Grund.
 *
 * @module grafikBedienung
 */

import { loeseGrafik, schreibeWahl, liesWahl, messeGeraet } from './grafikStufe.js';

const NAMEN = Object.freeze({ lite: 'Lite', ultra: 'Ultra' });

/**
 * @param {Document} doc
 * @param {(grafik: ReturnType<typeof loeseGrafik>) => void} beiAenderung
 * @param {object} [win]
 * @returns {ReturnType<typeof loeseGrafik>} die beim Start geltende Grafik
 */
export function bindeGrafikBedienung(doc, beiAenderung, win = globalThis) {
  const messung = messeGeraet(win);
  const auswahl = doc.getElementById('cfg-grafik');
  const info = doc.getElementById('cfg-grafik-info');
  const gelten = (wahl) => {
    const g = loeseGrafik({ win, wahl, messung });
    if (info) info.textContent = `Aktiv: ${NAMEN[g.stufe]} — ${g.grund}.`;
    return g;
  };
  let aktuell = gelten(liesWahl(win));
  if (auswahl) {
    auswahl.value = aktuell.wahl;
    auswahl.addEventListener('change', () => {
      schreibeWahl(auswahl.value, win);
      aktuell = gelten(auswahl.value);
      beiAenderung(aktuell);
    });
  }
  return aktuell;
}
