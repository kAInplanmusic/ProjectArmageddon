/**
 * Menü: Kartengröße `kolossal` und die drei runden Kartenarten (Geländefassung 14, TODO N-40).
 *
 * Die Felder stehen in `index.html` (`#cfg-kartengroesse`, `#cfg-kartenformat`, `#cfg-kartenart`, Hinweis `#cfg-kartenwahl-hinweis`).
 * Dieses Modul verdrahtet sie:
 *  - Wer `kolossal` oder eine runde Art wählt, bekommt das Format 1:1 (nur dort gelten beide); eine spätere Formatänderung wird nicht
 *    überstimmt, der Hinweis sagt dann, was gespielt wird (`kolossal` → `riesig`, runde Art bleibt gewählt).
 *  - `kolossal` ist auf iOS und bei Grafik „Lite“ gesperrt (Option deaktiviert, Grund im Hinweis), bei Ultra mit Warnung wählbar
 *    (Grenzwerte und Begründung: `engine/kartenWahl.js`). Wechselt die Grafik-Wahl, wird neu bewertet.
 *  - Der Hinweis ist ein Absatz mit `role="status"` (sichtbar auch bei schmalem Fenster, anders als `small.field-hint`), die drei Felder
 *    verweisen per `aria-describedby` darauf. Bedienung nur über die Felder selbst: Auswahllisten sind auf Touch-Geräten nativ.
 *
 * Reine Menüsache; der Server prüft alles erneut (`server/lobby.js`).
 *
 * @module kartenWahlMenue
 */
import { MAP_GROESSE_KOLOSSAL } from '../engine/karte.js';
import { FORMAT_QUADRAT, istRundeKartenart, istIos, pruefeKolossal, wirksameGroesse } from '../engine/kartenWahl.js';
import { loeseGrafik, messeGeraet } from './grafikStufe.js';

const ID_GROESSE = 'cfg-kartengroesse';
const ID_FORMAT = 'cfg-kartenformat';
const ID_ART = 'cfg-kartenart';
const ID_HINWEIS = 'cfg-kartenwahl-hinweis';

/**
 * Was das Menü zu einer Wahl zeigt (rein, ohne DOM).
 *
 * @param {{groesse:string, format:string, kartenart:string, geraet:{ios?:boolean, flaechenBudgetMio?:number|null}}} eingabe
 * @returns {{kolossal:{status:string, grund:string}, hinweise:string[]}} `hinweise`: Sätze, die der Hinweisabsatz zeigt
 */
export function kartenWahlZustand({ groesse, format, kartenart, geraet }) {
  const kolossal = pruefeKolossal(geraet);
  const hinweise = [];
  if (kolossal.status === 'gesperrt') hinweise.push(kolossal.grund);
  else if (groesse === MAP_GROESSE_KOLOSSAL && kolossal.status === 'warnung') hinweise.push(kolossal.grund);
  if (groesse === MAP_GROESSE_KOLOSSAL && kolossal.status !== 'gesperrt' && format !== FORMAT_QUADRAT) {
    hinweise.push('Kolossal gibt es nur im Format 1:1; bei diesem Format wird „Riesig“ gespielt.');
  }
  if (istRundeKartenart(kartenart) && format !== FORMAT_QUADRAT) {
    hinweise.push('Runde Karten sind für das Format 1:1 gebaut; bei diesem Format wirken sie verzerrt.');
  }
  return { kolossal, hinweise };
}

/** Liest die Wahl für den Spielstart: Stufe (kolossal nur auf 1:1, sonst riesig), Format und Kartenart (leer = `null`). */
export function leseKartenWahl(doc = document) {
  const format = doc.getElementById(ID_FORMAT)?.value ?? '16:9';
  const feld = doc.getElementById(ID_GROESSE);
  let groesse = feld?.value ?? 'mittel';
  // Eine gesperrte Option kann nicht gewählt sein; sollte der Wert dennoch ankommen (Autofill, Skript), gilt die nächstkleinere Stufe.
  const gesperrt = feld && [...feld.options].some(o => o.value === groesse && o.disabled);
  if (gesperrt) groesse = 'riesig';
  return { mapSize: wirksameGroesse(groesse, format), mapFormat: format, kartenart: doc.getElementById(ID_ART)?.value || null };
}

/**
 * Wendet einen Gerätestand auf die Felder an: sperrt oder warnt bei `kolossal` und schreibt den Hinweis.
 * Eigene Funktion, damit Tests und Messwerkzeuge einen Gerätestand vorgeben können.
 */
export function zeigeKartenWahl(doc, geraet, notiz = '') {
  const groesse = doc.getElementById(ID_GROESSE);
  const format = doc.getElementById(ID_FORMAT);
  const art = doc.getElementById(ID_ART);
  const hinweis = doc.getElementById(ID_HINWEIS);
  if (!groesse) return null;
  const zustand = kartenWahlZustand({ groesse: groesse.value, format: format?.value ?? '16:9', kartenart: art?.value ?? '', geraet });
  const option = [...groesse.options].find(o => o.value === MAP_GROESSE_KOLOSSAL);
  if (option) {
    option.dataset.ohneZusatz ??= option.textContent;
    const gesperrt = zustand.kolossal.status === 'gesperrt';
    option.disabled = gesperrt;
    option.textContent = gesperrt ? `${option.dataset.ohneZusatz} (gesperrt)` : option.dataset.ohneZusatz;
    if (gesperrt && groesse.value === MAP_GROESSE_KOLOSSAL) groesse.value = 'riesig';
  }
  if (hinweis) {
    const saetze = notiz ? [notiz, ...zustand.hinweise] : zustand.hinweise;
    hinweis.textContent = saetze.join(' ');
    hinweis.hidden = saetze.length === 0;
    hinweis.dataset.stufe = zustand.kolossal.status;
  }
  return zustand;
}

/** Gerätestand aus Browser und geltender Grafik-Wahl (`#cfg-grafik`, sonst gespeicherte Wahl). */
function geraetAusBrowser(doc, win, messung) {
  const grafik = loeseGrafik({ win, messung, ...(doc.getElementById('cfg-grafik')?.value ? { wahl: doc.getElementById('cfg-grafik').value } : {}) });
  return { ios: istIos(win.navigator), flaechenBudgetMio: grafik.grenzen.flaechenBudgetMio };
}

/**
 * Verdrahtet die Felder. Ohne `#cfg-kartengroesse` (Test-DOM) geschieht nichts.
 * @param {Document} [doc]
 * @param {object} [win]
 */
export function verdrahteKartenWahl(doc = document, win = globalThis) {
  const groesse = doc.getElementById(ID_GROESSE);
  const format = doc.getElementById(ID_FORMAT);
  const art = doc.getElementById(ID_ART);
  if (!groesse) return;
  const messung = messeGeraet(win);
  const aktualisiere = (notiz = '') => zeigeKartenWahl(doc, geraetAusBrowser(doc, win, messung), notiz);
  for (const feld of [groesse, format, art]) feld?.setAttribute?.('aria-describedby', ID_HINWEIS);
  // Setzt das Format auf 1:1 und liefert den Satz dazu (leer, wenn es schon 1:1 war).
  const aufQuadrat = (was) => {
    if (!format || format.value === FORMAT_QUADRAT) return '';
    format.value = FORMAT_QUADRAT;
    return `Format auf 1:1 gestellt, weil ${was} nur dort gilt.`;
  };
  groesse.addEventListener('change', () => {
    // Die gesperrte Option kann nicht gewählt werden; nur eine wählbare Stufe zieht das Format mit.
    aktualisiere(groesse.value === MAP_GROESSE_KOLOSSAL ? aufQuadrat('Kolossal') : '');
  });
  art?.addEventListener('change', () => aktualisiere(istRundeKartenart(art.value) ? aufQuadrat('die runde Karte') : ''));
  format?.addEventListener('change', () => aktualisiere());
  doc.getElementById('cfg-grafik')?.addEventListener('change', () => aktualisiere());
  aktualisiere();
}
