/**
 * Konten und Rangliste im Client — der kleinste Einstieg, der die Serverwege
 * benutzt.
 *
 * ## Was dieses Modul NICHT tut
 *
 * Es rechnet nichts aus und entscheidet nichts über Siege: Der Server führt die
 * Partie und verbucht sie selbst (`docs/konto-und-bestenliste.md`). Hier steht
 * nur der Netzzugang und die Ablage des Sitzungstokens — Formular und Anzeige
 * der Rangliste stehen in `kontoMenue.js`.
 *
 * ## Wo der Token liegt
 *
 * Im `sessionStorage` dieses Tabs, nicht im `localStorage`: Nach dem Schließen
 * des Tabs ist er weg, ein zweiter Tab hat seine eigene Sitzung. Das ist die
 * vorsichtigere der beiden Ablagen — der Token ist ein Geheimnis, und
 * `sessionStorage` verkleinert das Zeitfenster, in dem ein fremdes Skript ihn
 * lesen könnte. Er wird beim WebSocket-Handshake als `?sitzung=` mitgeschickt
 * (siehe `startOnline` in `main.js`).
 *
 * @module client/konto
 */

/** Ablageschlüssel im `sessionStorage`. Version im Namen, damit ein Formatwechsel altes nicht deutet. */
export const SITZUNGS_SCHLUESSEL = 'pa.konto.v1';

/** Liest die gespeicherte Sitzung — oder `null`. */
export function leseSitzung() {
  try {
    const roh = globalThis.sessionStorage?.getItem(SITZUNGS_SCHLUESSEL);
    if (!roh) return null;
    const daten = JSON.parse(roh);
    if (!daten || typeof daten.token !== 'string' || daten.token.length < 16) return null;
    return { token: daten.token, name: typeof daten.name === 'string' ? daten.name : null, server: daten.server ?? null };
  } catch {
    return null;
  }
}

/** Merkt sich die Sitzung dieses Tabs. */
export function speichereSitzung({ token, name, server }) {
  try {
    globalThis.sessionStorage?.setItem(SITZUNGS_SCHLUESSEL, JSON.stringify({ token, name, server }));
  } catch {
    // Ohne Speicher gilt die Sitzung nur für diese Seite — kein Grund abzubrechen.
  }
}

/** Vergisst die Sitzung dieses Tabs. */
export function loescheSitzung() {
  try {
    globalThis.sessionStorage?.removeItem(SITZUNGS_SCHLUESSEL);
  } catch { /* egal */ }
}

/**
 * WebSocket-Adresse mit dem Sitzungstoken im Handshake (`?sitzung=…`).
 *
 * Ein Browser kann bei `new WebSocket()` keine eigenen Kopfzeilen setzen; der
 * Token muss deshalb als Query-Parameter mit. Ohne Token verbindet sich der
 * Client als Gast — kein Fehler.
 */
export function websocketUrlFuer(serverUrl) {
  let url = new URL('/ws', serverUrl).toString().replace(/^http/, 'ws');
  const token = leseSitzung()?.token;
  if (token) {
    const mitToken = new URL(url);
    mitToken.searchParams.set('sitzung', token);
    url = mitToken.toString();
  }
  return url;
}

/**
 * Adresse des Spielservers.
 *
 * Produktion: derselbe Origin, der die Seite ausliefert. Entwicklung: das Feld
 * „Online: Server" im Menü, damit Vite (Port 5173) den Server (Port 3000)
 * ansprechen kann.
 */
export function serverBasis() {
  const feld = globalThis.document?.getElementById?.('cfg-server')?.value?.trim?.() ?? '';
  const basis = feld || globalThis.location?.origin || '';
  return basis.replace(/\/+$/, '');
}

/** Ein HTTP-Aufruf an die Kontorouten. Wirft mit lesbarem Grund. */
async function rufe(pfad, { methode = 'GET', body = null, token = null } = {}) {
  const kopf = {};
  if (body !== null) kopf['content-type'] = 'application/json';
  if (token) kopf.authorization = `Bearer ${token}`;
  const antwort = await fetch(`${serverBasis()}${pfad}`, {
    method: methode,
    headers: kopf,
    body: body === null ? undefined : JSON.stringify(body),
  });
  let daten = null;
  try {
    daten = await antwort.json();
  } catch {
    daten = null;
  }
  if (!antwort.ok) {
    const grund = daten?.error ?? `Server antwortete mit ${antwort.status}`;
    const fehler = new Error(grund);
    fehler.status = antwort.status;
    fehler.code = daten?.code ?? null;
    throw fehler;
  }
  return daten;
}

/** Registriert und meldet sofort an. Gibt das Konto zurück. */
export async function registrieren(name, passwort) {
  const daten = await rufe('/api/konto/registrieren', { methode: 'POST', body: { name, passwort } });
  speichereSitzung({ token: daten.token, name: daten.konto?.name ?? name, server: serverBasis() });
  return daten.konto;
}

/** Meldet an. Gibt das Konto zurück. */
export async function anmelden(name, passwort) {
  const daten = await rufe('/api/konto/anmelden', { methode: 'POST', body: { name, passwort } });
  speichereSitzung({ token: daten.token, name: daten.konto?.name ?? name, server: serverBasis() });
  return daten.konto;
}

/** Meldet ab und vergisst den Token. */
export async function abmelden() {
  const sitzung = leseSitzung();
  loescheSitzung();
  if (!sitzung) return;
  try {
    await rufe('/api/konto/abmelden', { methode: 'POST', body: {}, token: sitzung.token });
  } catch {
    // Der lokale Token ist weg; ein Serverfehler beim Abmelden ändert daran nichts.
  }
}

/** Löscht das Konto samt Daten. Das Passwort bestätigt die Absicht. */
export async function kontoLoeschen(passwort) {
  const sitzung = leseSitzung();
  if (!sitzung) throw new Error('Nicht angemeldet');
  await rufe('/api/konto', { methode: 'DELETE', body: { passwort }, token: sitzung.token });
  loescheSitzung();
}

/** Lädt Rangliste und Bestwerte. */
export async function ladeBestenliste() {
  return rufe('/api/bestenliste');
}

/** Eigenes Konto (frische Zahlen) oder `null`. */
export async function eigenesKonto() {
  const sitzung = leseSitzung();
  if (!sitzung) return null;
  try {
    const daten = await rufe('/api/konto', { token: sitzung.token });
    return daten.konto ?? null;
  } catch (fehler) {
    if (fehler.status === 401) loescheSitzung();
    return null;
  }
}

export default {
  leseSitzung, speichereSitzung, loescheSitzung, serverBasis, websocketUrlFuer,
  registrieren, anmelden, abmelden, kontoLoeschen, ladeBestenliste, eigenesKonto,
};
