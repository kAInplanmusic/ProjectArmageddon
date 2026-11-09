/**
 * Fraktionszeichen an den Stellen außerhalb des Kaders (Audit A11, A09).
 *
 * Der Kader zeigt Emblem und Banner bereits. Diese Datei bringt dieselben
 * Zeichen in die Fraktionsauswahl des Menüs, in das Ladebild und in die
 * Ergebnisanzeige — aus EINER Quelle (`fraktionsIdentitaet.js`), damit ein
 * geändertes Emblem überall mitwandert.
 *
 * Sie liegt hier und nicht in `main.js`, weil `main.js` ein Zeilenbudget hat
 * (`tests/zeilenbudget.test.js`) und die Zerlegung genau dafür eingeführt wurde.
 *
 * @module fraktionsAnzeige
 */
import { fraktionsMerkmale } from './teamFarben.js';
import { fraktionsIdentitaet } from './fraktionsIdentitaet.js';
import { zeigeLadebild } from './ladebild.js';

/**
 * Baut das Emblem neben einem Fraktions-Auswahlfeld und hält es aktuell.
 *
 * Bei „Zufällig“/„Klassisch“ gibt es keine feste Fraktion; dann bleibt das
 * Zeichen verborgen. Ein geratenes Emblem wäre eine Falschaussage.
 *
 * @param {HTMLSelectElement} auswahl
 * @returns {HTMLImageElement} das 24-px-Bild (bereits an die Auswahl gebunden)
 */
export function fraktionsEmblem(auswahl) {
  const zeichen = document.createElement('img');
  zeichen.className = 'fraktions-wahl-zeichen';
  zeichen.alt = '';
  zeichen.width = 24;
  zeichen.height = 24;
  if (!auswahl) return zeichen;
  const zeige = () => {
    const merkmal = fraktionsMerkmale(auswahl.value);
    const url = merkmal ? fraktionsIdentitaet(merkmal.id)?.emblem : null;
    zeichen.hidden = !url;
    if (url) {
      zeichen.src = url;
      zeichen.title = merkmal.name;
    }
  };
  auswahl.addEventListener('change', zeige);
  zeige();
  return zeichen;
}

/**
 * Zeigt das Ladebild mit den Fraktionen der beteiligten Teams und blendet es
 * aus, sobald `bereit` erfüllt ist.
 *
 * @param {Document} doc
 * @param {Array<string|null>} fraktionJeTeam
 * @param {Promise<unknown>} bereit - Ladevorgang der Match-Bilder
 */
export function starteLadebild(doc, fraktionJeTeam, bereit) {
  const ladebild = zeigeLadebild(doc, fraktionJeTeam);
  if (!ladebild) return null;
  void Promise.resolve(bereit).then(() => ladebild.fertig(), () => ladebild.fertig());
  return ladebild;
}

/**
 * Setzt Emblem, Fraktionsname und Wahlspruch des Siegers in den Endbildschirm.
 *
 * Klassische Figuren (`null`) und ein Unentschieden zeigen nichts: Es gibt dann
 * keine Fraktion, die ein Zeichen tragen dürfte.
 *
 * @param {Document} doc
 * @param {Array<string|null>|undefined} fraktionJeTeam
 * @param {number|null|undefined} winnerTeamId
 */
export function zeigeSiegerFraktion(doc, fraktionJeTeam, winnerTeamId) {
  const behaelter = doc?.getElementById?.('end-fraktion');
  if (!behaelter) return null;
  behaelter.replaceChildren();

  const fraktionId = winnerTeamId === null || winnerTeamId === undefined
    ? null
    : fraktionJeTeam?.[winnerTeamId] ?? null;
  const merkmal = fraktionsMerkmale(fraktionId);
  if (!merkmal) {
    behaelter.hidden = true;
    return null;
  }

  const zeichen = doc.createElement('img');
  zeichen.className = 'end-fraktion-zeichen';
  zeichen.src = fraktionsIdentitaet(merkmal.id)?.emblem ?? '';
  zeichen.width = 48;
  zeichen.height = 48;
  zeichen.alt = `Emblem ${merkmal.name}`;

  const text = doc.createElement('span');
  text.className = 'end-fraktion-text';
  text.style.setProperty('--fraktions-farbe', merkmal.farbe);
  text.style.setProperty('--fraktions-schrift', `'${merkmal.schrift}'`);
  const name = doc.createElement('b');
  name.textContent = merkmal.name;
  const motto = doc.createElement('i');
  motto.textContent = merkmal.motto;
  text.append(name, motto);

  behaelter.append(zeichen, text);
  behaelter.hidden = false;
  return merkmal;
}
