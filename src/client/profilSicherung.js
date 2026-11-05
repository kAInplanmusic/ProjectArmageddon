/**
 * Profilsicherung als Datei (Entscheidung 2026-09-20): Export und Import.
 *
 * ## Was hier drin ist
 *
 * Nur die Verdrahtung der zwei Knöpfe: „Sichern" lädt die Profildatei herunter,
 * „Laden" öffnet die Dateiauswahl und liest den Text ein. Was in der Datei
 * steht und wie sie geprüft wird, entscheidet `shared/identity.js` bzw. das
 * Spiel (`profilSichern`/`profilLaden` in `main.js`).
 *
 * ## Warum ausgezogen
 *
 * Der Ablauf ist bewusst der eines Downloads/Uploads und nicht der eines
 * Formulars: Der Spieler bekommt eine Datei, die er aufbewahren kann. Ohne
 * diese zwei Knöpfe wäre „Profil liegt im Browser" eine Sackgasse — ein
 * gelöschter Cache hieße Verlust. Die reine DOM-Arbeit gehört daher neben die
 * übrige Bedienung, nicht mitten in den Match-Start (Zeilenbudget, AGENTS.md §3).
 *
 * Das Modul importiert `main.js` nicht; es bekommt Spiel und Protokollrückruf.
 *
 * @module client/profilSicherung
 */

/**
 * Verdrahtet Export- und Import-Knopf.
 *
 * @param {object} spiel - Spielinstanz aus `main.js` (`profilSichern`, `profilLaden`)
 * @param {object} [optionen]
 * @param {Document} [optionen.dokument]
 * @param {(text: string, art: string) => void} [optionen.melde] - Protokoll (HUD)
 */
export function bindeProfilSicherung(spiel, {
  dokument = globalThis.document,
  melde = () => {},
} = {}) {
  dokument?.getElementById?.('profil-export')?.addEventListener('click', () => {
    spiel.profilSichern();
  });
  const importKnopf = dokument?.getElementById?.('profil-import');
  const importDatei = dokument?.getElementById?.('profil-import-datei');
  importKnopf?.addEventListener('click', () => importDatei?.click());
  importDatei?.addEventListener('change', () => {
    const datei = importDatei.files?.[0];
    if (!datei) return;
    // Nach der Auswahl zurücksetzen, damit dieselbe Datei erneut wählbar ist.
    datei.text()
      .then(text => spiel.profilLaden(text))
      .catch(error => melde(`Sicherung nicht lesbar: ${error.message}`, 'danger'))
      .finally(() => { importDatei.value = ''; });
  });
}

export default { bindeProfilSicherung };
