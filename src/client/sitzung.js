/**
 * Sitzung und Fortsetzen (RT-1): die Ablage im `sessionStorage` dieses Tabs.
 *
 * ## Was hier drin ist
 *
 * Der Datensatz `pa-sitzung` (Server, Lobby, Platz-Token, Fortsetzungs-Token,
 * Name, Zeitpunkt), die Entscheidung, welche Tokens ein Verbindungsaufbau
 * mitnimmt, der Fortsetzen-Knopf im Menü und der selbsttätige Versuch direkt
 * nach einem Neuladen.
 *
 * ## Warum das ausgezogen ist
 *
 * Die Logik stand in `main.js` zwischen Startmenü, Abbruch und Online-Beitritt
 * verstreut — fünf Stellen, die alle dieselbe Ablage lasen. Zusammen mit den
 * Zeilenbudgets (AGENTS.md §3, `tests/zeilenbudget.test.js`) war das der
 * Anlass, sie an EINE Stelle zu legen: Wer wissen will, was ein Neuladen
 * überlebt, liest jetzt diese Datei statt drei Abschnitte in `main.js`.
 *
 * ## Was hier NICHT steht
 *
 * Der `CONTROL.RESUME` selbst und der Rückfall auf `JOIN_LOBBY` stehen im
 * `networkClient.js` — dort, wo die Leitung liegt. Dieses Modul entscheidet nur,
 * WELCHE Tokens mitgehen, und merkt sich das Ergebnis. Es importiert `main.js`
 * nicht; die Startfunktion kommt als Rückruf herein.
 *
 * @module client/sitzung
 */

/** Ablageschlüssel im `sessionStorage`. */
const SCHLUESSEL = 'pa-sitzung';

/**
 * Frist für das selbsttätige Fortsetzen nach einem Neuladen.
 *
 * Ein Tab, der Stunden später aus dem Verlauf kommt, soll nicht ungefragt eine
 * Partie aufnehmen — dort ist der Platz ohnehin längst verfallen.
 */
const NEULADE_FRIST_MS = 5 * 60 * 1000;

/**
 * Die gespeicherte Sitzung dieses Tabs — oder `null`.
 *
 * EINE Lesestelle für Speicher, Knopf und Fortsetzen: Der `sessionStorage`
 * kann fehlen (Sandbox, Datenschutzmodus) oder Inhalt haben, der kein Objekt
 * ist. Beides darf die Seite nicht werfen lassen — dann gibt es eben nichts
 * fortzusetzen.
 *
 * @returns {{serverUrl?: string, lobbyId?: string, token?: string|null, resumeToken?: string|null, name?: string, zeit?: number}|null}
 */
export function leseGespeicherteSitzung() {
  try {
    const roh = sessionStorage.getItem(SCHLUESSEL);
    if (!roh) return null;
    const daten = JSON.parse(roh);
    return daten && typeof daten === 'object' ? daten : null;
  } catch {
    return null;
  }
}

/**
 * Legt die Sitzung nach einem erfolgreichen Beitritt ab.
 *
 * Der Fortsetzungs-Token holt den Platz nach einem Neuladen über
 * `CONTROL.RESUME` zurück; der Platz-Token bleibt als Rückfall (ältere Server,
 * Serverneustart, abgelaufener Schlüssel) und für die Revanche. `zeit` begrenzt
 * das selbsttätige Fortsetzen beim Laden.
 */
export function merkeSitzung({ serverUrl, lobbyId, token = null, resumeToken = null, name = 'Spieler' }) {
  try {
    sessionStorage.setItem(SCHLUESSEL, JSON.stringify({
      serverUrl,
      lobbyId,
      token,
      resumeToken,
      name,
      zeit: Date.now(),
    }));
  } catch { /* sessionStorage nicht verfügbar — Fortsetzen entfällt still */ }
}

/** Blendet den Fortsetzen-Knopf ein, wenn eine Sitzung gespeichert ist. */
export function aktualisiereSitzungsKnopf(dokument = globalThis.document) {
  const knopf = dokument?.getElementById?.('resume-button');
  if (!knopf) return;
  knopf.hidden = leseGespeicherteSitzung() === null;
}

/** Entfernt die gespeicherte Sitzung (Verlassen, beendete Partie, kaputter Inhalt). */
export function vergesseSitzung(dokument = globalThis.document) {
  try {
    sessionStorage.removeItem(SCHLUESSEL);
  } catch { /* nicht verfügbar */ }
  aktualisiereSitzungsKnopf(dokument);
}

/**
 * Welche Tokens ein Verbindungsaufbau mitnimmt (RT-1).
 *
 * Der Fortsetzungs-Token wird nur benutzt, wenn er zu DIESER Lobby auf DIESEM
 * Server gehört — sonst wäre ein alter Token aus einer anderen Partie ein
 * Versuch, den falschen Platz zu übernehmen. Der Platz-Token bleibt daneben
 * erhalten: Er ist der Rückfall, wenn der Server den Fortsetzungs-Token nicht
 * mehr kennt.
 *
 * @param {{serverUrl: string, lobbyId: string, token?: string|null, resumeToken?: string|null}} angaben
 * @returns {{fortsetzungsToken: string|null, platzToken: string|null}}
 */
export function fortsetzungsTokens({ serverUrl, lobbyId, token = null, resumeToken = null }) {
  const gespeichert = leseGespeicherteSitzung();
  const passt = Boolean(
    gespeichert
    && gespeichert.serverUrl === serverUrl
    && gespeichert.lobbyId === lobbyId,
  );
  return {
    fortsetzungsToken: resumeToken ?? (passt ? (gespeichert.resumeToken ?? null) : null),
    platzToken: token ?? (passt ? (gespeichert.token ?? null) : null),
  };
}

/**
 * Setzt die letzte Sitzung aus dem `sessionStorage` fort.
 *
 * `starte` ist der Startweg des Clients (`startOnline`); er bekommt genau die
 * Angaben, die auch der Fortsetzen-Datensatz trägt.
 */
export function setzeSitzungFort(starte, dokument = globalThis.document) {
  const sitzung = leseGespeicherteSitzung();
  if (!sitzung?.serverUrl || !sitzung?.lobbyId) {
    vergesseSitzung(dokument);
    return;
  }
  starte({
    serverUrl: sitzung.serverUrl,
    lobbyId: sitzung.lobbyId,
    token: sitzung.token ?? null,
    resumeToken: sitzung.resumeToken ?? null,
    name: sitzung.name ?? 'Spieler',
  });
}

/**
 * Versucht nach einem NEULADEN sofort weiterzuspielen (RT-1).
 *
 * Der `sessionStorage` lebt genau so lange wie der Tab: Steht dort eine
 * Sitzung, wurde diese Seite neu geladen (oder aus dem Tab-Verlauf geholt)
 * — nicht neu geöffnet. Genau dafür ist der Fortsetzungs-Token da; ohne
 * diesen Aufruf müsste der Spieler erst „Letzte Sitzung fortsetzen" klicken,
 * obwohl er nichts anderes wollte.
 *
 * Scheitert das Fortsetzen, fällt der Client auf den normalen Beitritt zurück
 * (`networkClient`, `resume_failed`) oder landet im Menü; beides ohne Absturz.
 *
 * @returns {boolean} true, wenn ein Versuch gestartet wurde
 */
export function versucheAutomatischesFortsetzen({ starte, melde } = {}) {
  const sitzung = leseGespeicherteSitzung();
  if (!sitzung?.serverUrl || !sitzung?.lobbyId) return false;
  const alter = Date.now() - (Number(sitzung.zeit) || 0);
  if (alter > NEULADE_FRIST_MS) return false;
  melde?.('Neuladen erkannt — Sitzung wird fortgesetzt', 'accent');
  setzeSitzungFort(starte);
  return true;
}

/**
 * Reaktion auf ein abgelehntes Fortsetzen (RT-1).
 *
 * Der `NetworkClient` fällt bei `unbekannt`/`ungueltig` selbst auf den normalen
 * Beitritt zurück (mit dem Platz-Token); hier bleibt nur die Meldung. Bei
 * `beendet` gibt es nichts fortzusetzen — dann gehört der Spieler ins Menü, und
 * die gespeicherte Sitzung wird vergessen (sonst böte der Knopf sie immer
 * wieder an).
 */
export function behandleResumeFehler(info, { melde, vergesse, verlasse } = {}) {
  if (info.grund === 'beendet') {
    melde?.('Diese Partie ist beendet — keine Fortsetzung möglich', 'notice');
    (vergesse ?? (() => vergesseSitzung()))();
    verlasse?.();
    return;
  }
  // Ablehnungsbegründung: `notice` hat Vorrang im HUD (docs/hud-vorrang.md §3).
  melde?.(`Fortsetzen nicht möglich (${info.grund}) — normaler Beitritt`, 'notice');
}

/**
 * Verdrahtet den Fortsetzen-Knopf und den selbsttätigen Versuch beim Laden.
 *
 * Wird einmal beim Start aufgerufen. Fehlt der Knopf (andere Seite,
 * Testumgebung), bleibt nur der selbsttätige Versuch — der hängt nicht am DOM.
 */
export function bindeSitzung({ dokument = globalThis.document, starte, melde } = {}) {
  dokument?.getElementById?.('resume-button')?.addEventListener('click', () => {
    setzeSitzungFort(starte, dokument);
  });
  aktualisiereSitzungsKnopf(dokument);
  return versucheAutomatischesFortsetzen({ starte, melde });
}

export default {
  leseGespeicherteSitzung,
  merkeSitzung,
  aktualisiereSitzungsKnopf,
  vergesseSitzung,
  fortsetzungsTokens,
  setzeSitzungFort,
  versucheAutomatischesFortsetzen,
  behandleResumeFehler,
  bindeSitzung,
};
