/**
 * Web-Zugang, Netzzugang und Texte (docs/zugang-www.md). Reine Funktionen und ein `fetch`-Aufruf ohne DOM,
 * damit `node --test` sie prüfen kann. Die Oberfläche steht in `webAnmeldung.js` und `webStart.js`.
 */
export const API = '/api/web';

/** Ein Aufruf an die Netlify-Funktion. Das Sitzungscookie (HttpOnly) trägt der Browser selbst. */
export async function ruf(pfad, methode = 'GET', body = null, fetchFn = globalThis.fetch) {
  const r = await fetchFn(`${API}/${pfad}`, {
    method: methode, credentials: 'same-origin',
    headers: methode === 'GET' ? {} : { 'content-type': 'application/json', 'x-pa-web': '1' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let daten = {}; try { daten = await r.json(); } catch { /* leer */ }
  return { ok: r.ok, status: r.status, daten };
}

export const TEXTE = {
  aus: 'Spielserver: aus.',
  startet: 'Spielserver startet (ca. 2 bis 4 Minuten) …',
  sichert: 'Spielserver sichert sich gerade und verschwindet.',
  bereit: 'Spielserver: bereit.',
};

/** Statuszeile zum Serverzustand (eine Zeile, für Screenreader per aria-live). */
export function statusText(s) {
  if (!s) return '';
  let t = TEXTE[s.zustand] ?? String(s.zustand);
  if (s.zustand === 'startet' && s.phase) t += ` (Phase: ${s.phase})`;
  return t;
}

export function versionenPassen(client, server) {
  if (!client || !server) return true;
  return (!client.version || !server.version || client.version === server.version) && (!client.gitSha || !server.gitSha || client.gitSha === server.gitSha);
}

/** Fehlertext aus einer Antwort; nie ein technischer Dump. */
export const fehlerText = (r, vorgabe) => r?.daten?.fehler ?? (r?.status === 429 ? 'Zu viele Versuche. Bitte später erneut.' : vorgabe);

/** Prüft die Eingaben des Registrierformulars vorab (der Server prüft nochmals und ist maßgeblich). */
export function pruefeRegistrierung({ email, name, passwort, anmeldepasswort }) {
  if (!email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) return 'Bitte eine gültige E-Mail-Adresse angeben.';
  if (!name?.trim() || name.trim().length < 3) return 'Der Benutzername braucht mindestens 3 Zeichen.';
  if (!passwort || passwort.length < 8) return 'Das Passwort braucht mindestens 8 Zeichen.';
  if (!anmeldepasswort) return 'Bitte das Anmeldepasswort für die Registrierung eingeben.';
  return null;
}
