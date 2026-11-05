/**
 * Konten und Rangliste im Client — der kleinste Einstieg, der die Serverwege
 * benutzt.
 *
 * ## Was dieses Modul NICHT tut
 *
 * Es rechnet nichts aus und entscheidet nichts über Siege: Der Server führt die
 * Partie und verbucht sie selbst (`docs/konto-und-bestenliste.md`). Hier stehen
 * nur Formular, Ablage des Sitzungstokens und die Anzeige der Liste.
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

/* ------------------------------------------------------------------ Anzeige */

const zahl = wert => (typeof wert === 'number' && Number.isFinite(wert)
  ? new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(wert)
  : '—');

const prozent = wert => (typeof wert === 'number' ? `${Math.round(wert * 100)} %` : '—');

function setzeStatus(text, art = '') {
  const feld = globalThis.document?.getElementById('konto-status');
  if (!feld) return;
  feld.textContent = text;
  feld.dataset.art = art;
}

function zeigeAngemeldet(konto) {
  const document = globalThis.document;
  if (!document) return;
  const bereich = document.getElementById('konto-angemeldet');
  const formular = document.getElementById('konto-form');
  const anzeige = document.getElementById('konto-name-anzeige');
  if (bereich) bereich.hidden = !konto;
  if (formular) formular.hidden = Boolean(konto);
  if (anzeige) anzeige.textContent = konto?.name ?? '';
}

/** Baut die Rangliste in die Liste im Menü. */
function zeichneListe(daten) {
  const document = globalThis.document;
  if (!document) return;
  const liste = document.getElementById('rangliste');
  const rekorde = document.getElementById('rangliste-rekorde');
  if (liste) {
    liste.textContent = '';
    if (!daten.eintraege?.length) {
      const leer = document.createElement('li');
      leer.className = 'muted';
      leer.textContent = 'Noch niemand gewertet — die erste Online-Partie mit zwei Konten füllt die Liste.';
      liste.append(leer);
    }
    for (const zeile of daten.eintraege ?? []) {
      const eintrag = document.createElement('li');
      eintrag.className = 'rangliste-zeile';
      eintrag.dataset.platz = String(zeile.platz);
      const kopf = document.createElement('span');
      kopf.className = 'rangliste-name';
      kopf.textContent = `${zeile.platz}. ${zeile.name}`;
      const wert = document.createElement('span');
      wert.className = 'rangliste-elo';
      wert.textContent = `${zahl(zeile.elo)} Elo`;
      const rest = document.createElement('span');
      rest.className = 'rangliste-zahlen muted';
      rest.textContent = `${zeile.siege} S / ${zeile.niederlagen} N · ${zeile.partien} Partien · `
        + `${zahl(zeile.kills)} Kills · ${zahl(zeile.schaden)} Schaden · Quote ${prozent(zeile.siegquote)}`;
      eintrag.append(kopf, wert, rest);
      liste.append(eintrag);
    }
  }
  if (rekorde) {
    const werte = daten.bestwerte ?? {};
    const zeile = (titel, treffer, einheit = '') => (treffer
      ? `${titel}: ${treffer.name} (${zahl(treffer.wert)}${einheit})`
      : `${titel}: noch offen`);
    rekorde.textContent = [
      zeile('Meiste Schüsse in einer Partie', werte.meisteSchuesse),
      zeile('Beste K/D', werte.besteKd),
      zeile('Schlechteste K/D', werte.schlechtesteKd),
      zeile('Meiste Siege', werte.meisteSiege),
    ].join(' · ');
  }
}

/**
 * Verdrahtet Formular, Abmelden, Löschen und Rangliste.
 *
 * Wird einmal beim Start aufgerufen. Fehlen die Elemente (andere Seite,
 * Testumgebung), passiert nichts — das Modul ist dann nur über seine Funktionen
 * nutzbar.
 */
export function kontoEinrichten() {
  const document = globalThis.document;
  if (!document) return;
  const formular = document.getElementById('konto-form');
  if (!formular) return;

  const nameFeld = document.getElementById('konto-name');
  const passwortFeld = document.getElementById('konto-passwort');
  const status = () => ({ name: nameFeld?.value?.trim() ?? '', passwort: passwortFeld?.value ?? '' });

  const fuehreAus = async (aktion, erfolg) => {
    const { name, passwort } = status();
    if (!name || !passwort) { setzeStatus('Name und Passwort sind nötig.', 'warnung'); return; }
    try {
      const konto = await aktion(name, passwort);
      setzeStatus(erfolg(konto), 'ok');
      if (passwortFeld) passwortFeld.value = '';
      zeigeAngemeldet(konto);
    } catch (fehler) {
      setzeStatus(fehler.message, 'fehler');
    }
  };

  formular.addEventListener('submit', ereignis => {
    ereignis.preventDefault();
    fuehreAus(anmelden, konto => `Angemeldet als ${konto.name}.`);
  });

  document.getElementById('konto-registrieren')?.addEventListener('click', () => {
    fuehreAus(registrieren, konto => `Konto ${konto.name} angelegt und angemeldet.`);
  });

  document.getElementById('konto-abmelden')?.addEventListener('click', async () => {
    await abmelden();
    zeigeAngemeldet(null);
    setzeStatus('Abgemeldet. Gäste spielen weiter ohne Konto.', 'ok');
  });

  document.getElementById('konto-loeschen')?.addEventListener('click', async () => {
    const passwort = document.getElementById('konto-loeschen-passwort')?.value ?? '';
    if (!passwort) { setzeStatus('Zum Löschen das Passwort eingeben.', 'warnung'); return; }
    try {
      await kontoLoeschen(passwort);
      zeigeAngemeldet(null);
      setzeStatus('Konto samt Daten gelöscht.', 'ok');
    } catch (fehler) {
      setzeStatus(fehler.message, 'fehler');
    }
  });

  const laden = async () => {
    const feld = document.getElementById('rangliste-status');
    if (feld) feld.textContent = 'Lade …';
    try {
      const daten = await ladeBestenliste();
      zeichneListe(daten);
      if (feld) feld.textContent = `${daten.eintraege?.length ?? 0} Einträge.`;
    } catch (fehler) {
      if (feld) feld.textContent = `Rangliste nicht erreichbar: ${fehler.message}`;
    }
  };
  document.getElementById('rangliste-laden')?.addEventListener('click', laden);
  document.getElementById('rangliste-browser')?.addEventListener('toggle', ereignis => {
    if (ereignis.target.open) laden();
  });

  // Beim Start: Ist dieser Tab noch angemeldet? Dann Formular verbergen.
  const sitzung = leseSitzung();
  if (sitzung?.name) zeigeAngemeldet({ name: sitzung.name });
}

export default {
  leseSitzung, speichereSitzung, loescheSitzung, serverBasis,
  registrieren, anmelden, abmelden, kontoLoeschen, ladeBestenliste, eigenesKonto, kontoEinrichten,
};
