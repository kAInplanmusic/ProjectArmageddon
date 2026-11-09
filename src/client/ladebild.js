/**
 * Ladebild beim Matchstart (Audit A11).
 *
 * ## Was es zeigt
 *
 * Beim Start eines lokalen Matches werden Stofftexturen und Figurenblätter
 * nachgeladen. Bisher war das unsichtbar. Das Ladebild nennt die beteiligten
 * Teams mit Emblem und Fraktionsnamen — dieselben Zeichen wie im Kader, damit
 * die Fraktion schon vor dem ersten Frame erkennbar ist. Teamfarbe und
 * Fraktionsfarbe bleiben getrennt (A09): Das Emblem und der Name tragen die
 * Fraktionsfarbe, die Marke „T1“/„T2“ den Eigentümer.
 *
 * ## Wie lange es steht
 *
 * Nicht länger als nötig: `fertig()` wird gerufen, sobald die Texturen geladen
 * sind. Damit der Wechsel nicht flackert, bleibt das Bild mindestens `minMs`
 * stehen; `maxMs` ist die harte Obergrenze, falls ein Ladevorgang hängen bleibt.
 * Es gibt KEINEN erfundenen Fortschrittsbalken: Der Streifen ist eine
 * unbestimmte Bewegung, keine Prozentzahl, die niemand gemessen hat.
 *
 * @module ladebild
 */
import { fraktionsMerkmale, teamMarke } from './teamFarben.js';
import { fraktionsIdentitaet } from './fraktionsIdentitaet.js';

/**
 * Baut das Ladebild und hängt es an `document.body`.
 *
 * @param {Document} doc
 * @param {Array<string|null>} fraktionJeTeam - Fraktionskennung je Team, `null` = klassische Figur
 * @param {{minMs?: number, maxMs?: number}} [optionen]
 * @returns {{element: HTMLElement, fertig: () => void}|null} `null`, wenn kein DOM verfügbar ist
 */
export function zeigeLadebild(doc, fraktionJeTeam, { minMs = 420, maxMs = 2600 } = {}) {
  if (!doc?.createElement || !doc.body || !Array.isArray(fraktionJeTeam)) return null;

  const start = Date.now();
  let geladen = false;
  let entfernt = false;
  let warteTimer = null;

  const overlay = doc.createElement('div');
  overlay.className = 'ladebild';
  overlay.setAttribute('role', 'status');
  overlay.setAttribute('aria-live', 'polite');

  const karte = doc.createElement('div');
  karte.className = 'ladebild-karte';

  const titel = doc.createElement('p');
  titel.className = 'ladebild-titel';
  titel.textContent = 'Figuren und Gelände werden geladen';
  karte.append(titel);

  const liste = doc.createElement('ul');
  liste.className = 'ladebild-teams';
  for (const [teamId, fraktionId] of fraktionJeTeam.entries()) {
    const merkmal = fraktionsMerkmale(fraktionId);
    if (!merkmal) continue;
    const eintrag = doc.createElement('li');
    eintrag.style.setProperty('--fraktions-farbe', merkmal.farbe);
    eintrag.style.setProperty('--fraktions-schrift', `'${merkmal.schrift}'`);

    const zeichen = doc.createElement('img');
    zeichen.src = fraktionsIdentitaet(fraktionId)?.emblem ?? '';
    zeichen.alt = '';
    zeichen.width = 40;
    zeichen.height = 40;
    zeichen.loading = 'eager';
    eintrag.append(zeichen);

    const team = doc.createElement('span');
    team.className = 'ladebild-team';
    team.textContent = teamMarke(teamId);
    const name = doc.createElement('span');
    name.className = 'ladebild-fraktion';
    name.textContent = merkmal.name;
    eintrag.append(team, name);
    liste.append(eintrag);
  }
  karte.append(liste);

  // Unbestimmte Bewegung, kein Prozentwert: eine Zahl wäre hier erfunden.
  const balken = doc.createElement('span');
  balken.className = 'ladebild-balken';
  balken.setAttribute('aria-hidden', 'true');
  balken.append(doc.createElement('i'));
  karte.append(balken);

  overlay.append(karte);
  doc.body.append(overlay);

  const entfernen = () => {
    if (entfernt) return;
    entfernt = true;
    if (warteTimer !== null) clearTimeout(warteTimer);
    clearTimeout(obergrenze);
    overlay.remove();
  };
  const pruefen = () => {
    if (entfernt || !geladen) return;
    const rest = minMs - (Date.now() - start);
    if (rest <= 0) entfernen();
    else warteTimer = setTimeout(entfernen, rest);
  };
  const obergrenze = setTimeout(entfernen, maxMs);

  return {
    element: overlay,
    fertig() {
      if (geladen) return;
      geladen = true;
      pruefen();
    },
  };
}
